import { computeNextRunAt } from "./cron";

/**
 * Compute the next run time based on schedule type and value.
 * @param scheduleType interval or cron
 * @param scheduleValue seconds (as string) for interval, or cron expression for cron
 * @param timezone IANA timezone (used only for cron)
 * @param from current time (defaults to now)
 */
export function getNextRunAt(
	scheduleType: "interval" | "cron",
	scheduleValue: string,
	timezone: string = "UTC",
	from: Date = new Date(),
): Date {
	if (scheduleType === "interval") {
		const seconds = parseInt(scheduleValue, 10);
		if (Number.isNaN(seconds)) {
			throw new Error(`Invalid interval value: ${scheduleValue}`);
		}
		return new Date(from.getTime() + seconds * 1000);
	} else if (scheduleType === "cron") {
		return computeNextRunAt(scheduleValue, timezone, from);
	}
	throw new Error(`Unknown schedule type: ${scheduleType}`);
}

export function parseEveryDurationToSeconds(input: string): number | null {
	// Accepts strings like:
	// "3 hours", "5 minutes", "1 week", "3 days 12 hours", "2h 30m"
	const s = input.trim().toLowerCase();
	if (!s) return null;

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
	// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
	while ((m = re.exec(s)) !== null) {
		matched = true;
		const n = Number(m[1]);
		const unit = m[2];

		const mult = unitToSeconds[unit];
		if (!mult) return null;

		total += n * mult;
	}

	// If nothing matched, allow pure seconds like "259200"
	if (!matched) {
		const onlyNum = Number(s);
		if (!Number.isFinite(onlyNum) || onlyNum <= 0) return null;
		return Math.floor(onlyNum);
	}

	if (total <= 0) return null;
	return total;
}

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
