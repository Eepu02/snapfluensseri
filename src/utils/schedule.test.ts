import { describe, expect, it } from "vitest";
import {
	getNextRunAt,
	humanizeSchedule,
	humanizeSeconds,
	parseEveryDurationToSeconds,
	validateSchedule,
} from "./schedule";

describe("Schedule Utilities: parseEveryDurationToSeconds", () => {
	it("should parse standard duration units", () => {
		expect(parseEveryDurationToSeconds("30 seconds")).toBe(30);
		expect(parseEveryDurationToSeconds("5 minutes")).toBe(300);
		expect(parseEveryDurationToSeconds("2 hours")).toBe(7200);
		expect(parseEveryDurationToSeconds("3 days")).toBe(259200);
		expect(parseEveryDurationToSeconds("1 week")).toBe(604800);
	});

	it("should parse abbreviations and shorthand formats", () => {
		expect(parseEveryDurationToSeconds("30s")).toBe(30);
		expect(parseEveryDurationToSeconds("10min")).toBe(600);
		expect(parseEveryDurationToSeconds("1h 30m")).toBe(5400);
		expect(parseEveryDurationToSeconds("1d 12h")).toBe(129600);
		expect(parseEveryDurationToSeconds("2w")).toBe(1209600);
	});

	it("should parse raw numbers as seconds", () => {
		expect(parseEveryDurationToSeconds("259200")).toBe(259200);
		expect(parseEveryDurationToSeconds("60")).toBe(60);
	});

	it("should throw error on invalid duration strings", () => {
		expect(() => parseEveryDurationToSeconds("")).toThrow("Seconds parse error");
		expect(() => parseEveryDurationToSeconds("   ")).toThrow("Seconds parse error");
		expect(() => parseEveryDurationToSeconds("5 years")).toThrow("Seconds parse error (multiplier)");
		expect(() => parseEveryDurationToSeconds("invalid")).toThrow("Seconds parse error (beyond reach)");
		expect(() => parseEveryDurationToSeconds("-60")).toThrow("Seconds parse error (beyond reach)");
	});

	it("should throw error on zero or negative totals", () => {
		expect(() => parseEveryDurationToSeconds("0 hours")).toThrow("Seconds parse error (negative total)");
	});
});

describe("Schedule Utilities: humanizeSeconds", () => {
	it("should format seconds into singular units", () => {
		const total = 604800 + 86400 + 3600 + 60 + 1; // 1 week, 1 day, 1 hour, 1 min, 1 sec
		expect(humanizeSeconds(total)).toBe("1 week 1 day 1 hour 1 minute 1 second");
	});

	it("should format seconds into plural units", () => {
		const total = 2 * 604800 + 2 * 86400 + 2 * 3600 + 2 * 60 + 2; // 2 weeks, 2 days, 2 hours, 2 mins, 2 secs
		expect(humanizeSeconds(total)).toBe("2 weeks 2 days 2 hours 2 minutes 2 seconds");
	});

	it("should skip empty units", () => {
		expect(humanizeSeconds(3600 + 15)).toBe("1 hour 15 seconds");
		expect(humanizeSeconds(600)).toBe("10 minutes");
	});
});

describe("Schedule Utilities: getNextRunAt", () => {
	const baseDate = new Date("2026-06-18T12:00:00.000Z");

	it("should calculate next run for interval schedules", () => {
		const schedule = { type: "interval" as const, value: 3600 }; // 1 hour
		const nextRun = getNextRunAt(schedule, "UTC", baseDate);
		expect(nextRun.toISOString()).toBe("2026-06-18T13:00:00.000Z");
	});

	it("should calculate next run for cron schedules in UTC", () => {
		const schedule = { type: "cron" as const, value: "0 15 * * *" };
		const nextRun = getNextRunAt(schedule, "UTC", baseDate);
		expect(nextRun.toISOString()).toBe("2026-06-18T15:00:00.000Z");
	});

	it("should calculate next run for cron schedules with timezone offsets", () => {
		const schedule = { type: "cron" as const, value: "0 12 * * *" };
		// Europe/Helsinki in June is UTC+3. Noon local time is 09:00:00 UTC.
		// baseDate is 12:00:00 UTC (15:00 local time). So the next noon should be tomorrow at 09:00:00 UTC.
		const nextRun = getNextRunAt(schedule, "Europe/Helsinki", baseDate);
		expect(nextRun.toISOString()).toBe("2026-06-19T09:00:00.000Z");
	});
});

describe("Schedule Utilities: validateSchedule", () => {
	it("should return true for valid schedules", () => {
		expect(validateSchedule({ type: "interval", value: 300 }, "Europe/Helsinki")).toBe(true);
		expect(validateSchedule({ type: "cron", value: "0 12 * * *" }, "Europe/Helsinki")).toBe(true);
		expect(validateSchedule({ type: "cron", value: "0 12 * * *" }, "UTC")).toBe(true);
	});

	it("should return false for invalid timezones with cron", () => {
		expect(validateSchedule({ type: "cron", value: "0 12 * * *" }, "GMT+3")).toBe(false);
		expect(validateSchedule({ type: "cron", value: "0 12 * * *" }, "invalid-timezone")).toBe(false);
	});

	it("should return false for invalid cron expressions", () => {
		expect(validateSchedule({ type: "cron", value: "invalid-cron" }, "UTC")).toBe(false);
	});
});

describe("Schedule Utilities: humanizeSchedule", () => {
	it("should humanize interval and cron schedules", () => {
		expect(humanizeSchedule({ type: "cron", value: "*/5 * * * *" })).toBe("*/5 * * * *");
		expect(humanizeSchedule({ type: "interval", value: 3600 })).toBe("every\t1 hour");
	});
});
