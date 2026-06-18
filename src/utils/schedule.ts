import { CronExpressionParser } from "cron-parser";
import { z } from "zod";

export const scheduleModel = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("cron"),
		value: z.string(),
	}),
	z.object({
		type: z.literal("interval"),
		value: z.number().int(),
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

/**
 * Compute the next run time based on schedule type and value.
 * @param scheduleType interval or cron
 * @param scheduleValue seconds (as string) for interval, or cron expression for cron
 * @param timezone IANA timezone (used only for cron)
 * @param from current time (defaults to now)
 */
export function getNextRunAt(
	schedule: Schedule,
	timezone: string = "UTC",
	from: Date = new Date(),
): Date {
	const { type, value } = schedule;
	if (type === "interval") {
		if (Number.isNaN(value)) {
			throw new Error(`Invalid interval value: ${value}`);
		}
		return new Date(from.getTime() + value * 1000);
	} else if (type === "cron") {
		return getNextCronRunAt(value, timezone, from);
	}
	throw new Error(`Unknown schedule type: ${type}`);
}

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
		getNextRunAt(s, tz);
		return true;
	} catch {
		return false;
	}
};

export const humanizeSchedule = (s: Schedule) => {
	if (s.type === "cron") return s.value;
	return `every	${humanizeSeconds(s.value)}`;
};
