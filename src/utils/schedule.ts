import { CronExpressionParser } from "cron-parser";
import { DateTime } from "luxon";
import { z } from "zod";

export const calendarScheduleValueModel = z.object({
	days: z.number().int().positive(),
	time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
});

export const scheduleModel = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("cron"),
		value: z.string(),
	}),
	z.object({
		type: z.literal("interval"),
		value: z.number().int().positive(),
	}),
	z.object({
		type: z.literal("calendar"),
		value: calendarScheduleValueModel,
	}),
]);

export type Schedule = z.infer<typeof scheduleModel>;

const getNextCronRunAt = (
	cronExpr: string,
	timezone: string,
	from: Date,
): Date => {
	const interval = CronExpressionParser.parse(cronExpr, {
		tz: timezone,
		currentDate: from,
	});
	return interval.next().toDate();
};

const assertValidTimezone = (timezone: string) => {
	if (!DateTime.local().setZone(timezone).isValid) {
		throw new Error(`Invalid timezone: ${timezone}`);
	}
};

export const isValidTimezone = (timezone: string) => {
	try {
		assertValidTimezone(timezone);
		return true;
	} catch {
		return false;
	}
};

const calendarDateAtTime = (
	date: DateTime,
	daysFromDate: number,
	time: string,
) => {
	const [hour, minute] = time.split(":").map(Number);
	return date
		.startOf("day")
		.plus({ days: daysFromDate })
		.set({ hour, minute, second: 0, millisecond: 0 });
};

const localDayOrdinal = (date: DateTime) =>
	Math.floor(Date.UTC(date.year, date.month - 1, date.day) / 86_400_000);

/** Compute the first run after a schedule is configured. */
export function getInitialRunAt(
	schedule: Schedule,
	timezone: string = "UTC",
	from: Date = new Date(),
): Date {
	const parsedSchedule = scheduleModel.parse(schedule);

	if (parsedSchedule.type === "interval") {
		return new Date(from.getTime() + parsedSchedule.value * 1000);
	}
	if (parsedSchedule.type === "cron") {
		return getNextCronRunAt(parsedSchedule.value, timezone, from);
	}

	assertValidTimezone(timezone);
	const localFrom = DateTime.fromJSDate(from, { zone: timezone });
	return calendarDateAtTime(
		localFrom,
		parsedSchedule.value.days,
		parsedSchedule.value.time,
	).toJSDate();
}

/** Backwards-compatible alias for the first occurrence after a date. */
export function getNextRunAt(
	schedule: Schedule,
	timezone: string = "UTC",
	from: Date = new Date(),
): Date {
	return getInitialRunAt(schedule, timezone, from);
}

/**
 * Advance a stored schedule cursor to the first phase-aligned occurrence after
 * `notBefore` without shifting the cadence when a run is late.
 */
export function getNextFutureRunAt(
	schedule: Schedule,
	timezone: string,
	previousRunAt: Date,
	notBefore: Date,
): Date {
	const parsedSchedule = scheduleModel.parse(schedule);

	if (parsedSchedule.type === "cron") {
		return getNextCronRunAt(parsedSchedule.value, timezone, notBefore);
	}

	if (parsedSchedule.type === "interval") {
		const durationMs = parsedSchedule.value * 1000;
		const elapsedMs = notBefore.getTime() - previousRunAt.getTime();
		const steps = Math.max(1, Math.floor(elapsedMs / durationMs) + 1);
		return new Date(previousRunAt.getTime() + steps * durationMs);
	}

	assertValidTimezone(timezone);
	const previousLocal = DateTime.fromJSDate(previousRunAt, { zone: timezone });
	const boundaryLocal = DateTime.fromJSDate(notBefore, { zone: timezone });
	const elapsedCalendarDays = Math.max(
		0,
		localDayOrdinal(boundaryLocal) - localDayOrdinal(previousLocal),
	);
	let steps = Math.max(
		1,
		Math.floor(elapsedCalendarDays / parsedSchedule.value.days),
	);
	let candidate = calendarDateAtTime(
		previousLocal,
		steps * parsedSchedule.value.days,
		parsedSchedule.value.time,
	);

	while (candidate.toMillis() <= notBefore.getTime()) {
		steps += 1;
		candidate = calendarDateAtTime(
			previousLocal,
			steps * parsedSchedule.value.days,
			parsedSchedule.value.time,
		);
	}

	return candidate.toJSDate();
}

/** Reinterpret a pending schedule after a timezone change. */
export function rebaseScheduleTimezone(
	schedule: Schedule,
	oldTimezone: string,
	newTimezone: string,
	pendingRunAt: Date,
	now: Date = new Date(),
): Date {
	const parsedSchedule = scheduleModel.parse(schedule);
	assertValidTimezone(newTimezone);

	if (parsedSchedule.type === "interval") return pendingRunAt;
	if (parsedSchedule.type === "cron") {
		return getNextCronRunAt(parsedSchedule.value, newTimezone, now);
	}

	assertValidTimezone(oldTimezone);
	const oldPending = DateTime.fromJSDate(pendingRunAt, { zone: oldTimezone });
	const [hour, minute] = parsedSchedule.value.time.split(":").map(Number);
	const rebased = DateTime.fromObject(
		{
			year: oldPending.year,
			month: oldPending.month,
			day: oldPending.day,
			hour,
			minute,
		},
		{ zone: newTimezone },
	);

	if (rebased.toMillis() > now.getTime()) return rebased.toJSDate();
	return getNextFutureRunAt(
		parsedSchedule,
		newTimezone,
		rebased.toJSDate(),
		now,
	);
}

/** Parse `/schedule every ...`, including exact local calendar times. */
export function parseEverySchedule(input: string): Schedule {
	const calendarMatch = input
		.trim()
		.toLowerCase()
		.match(/^(\d+)\s*(d|day|days|w|week|weeks)\s+at\s+(\d{1,2}):([0-5]\d)$/);

	if (!calendarMatch) {
		if (/\bat\b/i.test(input)) {
			throw new Error("Calendar schedule parse error");
		}
		return { type: "interval", value: parseEveryDurationToSeconds(input) };
	}

	const amount = Number(calendarMatch[1]);
	const hour = Number(calendarMatch[3]);
	if (amount <= 0 || hour > 23)
		throw new Error("Calendar schedule parse error");

	const isWeek = calendarMatch[2].startsWith("w");
	return {
		type: "calendar",
		value: {
			days: amount * (isWeek ? 7 : 1),
			time: `${String(hour).padStart(2, "0")}:${calendarMatch[4]}`,
		},
	};
}

export const serializeScheduleValue = (schedule: Schedule) =>
	schedule.type === "calendar"
		? JSON.stringify(schedule.value)
		: String(schedule.value);

/**
 * Parses a user-input duration string (e.g. "3 days", "5 minutes", "2h 30m" or a raw number)
 * and converts it into a total duration in seconds.
 *
 * @param input - The duration string to parse.
 * @returns The duration parsed as seconds.
 * @throws Error if the duration format is invalid or parsed total is non-positive.
 */
export function parseEveryDurationToSeconds(input: string): number {
	// Accepts strings like:
	// "3 hours", "5 minutes", "1 week", "3 days 12 hours", "2h 30m"
	const s = input.trim().toLowerCase();
	if (!s) throw new Error("Seconds parse error");

	const unitToSeconds: Record<string, number> = {
		s: 1,
		sec: 1,
		secs: 1,
		second: 1,
		seconds: 1,
		m: 60,
		min: 60,
		mins: 60,
		minute: 60,
		minutes: 60,
		h: 3600,
		hr: 3600,
		hrs: 3600,
		hour: 3600,
		hours: 3600,
		d: 86400,
		day: 86400,
		days: 86400,
		w: 604800,
		week: 604800,
		weeks: 604800,
	};

	// matches sequences like "3 days", "12 hours", "30m", "2h"
	const re = /(\d+)\s*([a-z]+)/g;
	let total = 0;
	let matched = false;

	let m: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: pitää olla
	while ((m = re.exec(s)) !== null) {
		matched = true;
		const n = Number(m[1]);
		const unit = m[2];

		const mult = unitToSeconds[unit];
		if (!mult) throw new Error("Seconds parse error (multiplier)");

		total += n * mult;
	}

	// If nothing matched, allow pure seconds like "259200"
	if (!matched) {
		const onlyNum = Number(s);
		if (!Number.isFinite(onlyNum) || onlyNum <= 0)
			throw new Error("Seconds parse error (beyond reach)");
		return Math.floor(onlyNum);
	}

	if (total <= 0) throw new Error("Seconds parse error (negative total)");
	return total;
}

/**
 * Formats a number of seconds into a human-readable duration string
 * composed of weeks, days, hours, minutes, and seconds.
 *
 * @param totalSeconds - The duration in seconds.
 * @returns A formatted string description of the duration.
 */
export function humanizeSeconds(totalSeconds: number): string {
	const parts: string[] = [];
	let s = totalSeconds;

	const weeks = Math.floor(s / 604800);
	s %= 604800;
	const days = Math.floor(s / 86400);
	s %= 86400;
	const hours = Math.floor(s / 3600);
	s %= 3600;
	const minutes = Math.floor(s / 60);
	s %= 60;
	const seconds = s;

	if (weeks) parts.push(`${weeks} week${weeks === 1 ? "" : "s"}`);
	if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
	if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
	if (minutes) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
	if (seconds) parts.push(`${seconds} second${seconds === 1 ? "" : "s"}`);

	return parts.join(" ");
}

/**
 * Validates a given schedule by attempting to compute its next execution time.
 * If the timezone or cron expression is invalid, returns false.
 *
 * @param s - The schedule definition (cron or interval).
 * @param tz - The IANA timezone string.
 * @returns True if the schedule is valid and parsed successfully, false otherwise.
 */
export const validateSchedule = (s: Schedule, tz: string) => {
	try {
		getInitialRunAt(s, tz);
		return true;
	} catch {
		return false;
	}
};

export const humanizeSchedule = (s: Schedule) => {
	if (s.type === "cron") return s.value;
	if (s.type === "calendar") {
		return `every ${s.value.days} day${s.value.days === 1 ? "" : "s"} at ${s.value.time}`;
	}
	return `every ${humanizeSeconds(s.value)}`;
};
