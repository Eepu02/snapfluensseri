import { describe, expect, it } from "vitest";
import { parsedGroupModel } from "./model";

const baseGroup = {
	chatId: 123,
	isActive: true,
	timezone: "Europe/Helsinki",
	nextRunAt: new Date("2026-07-24T06:00:00Z"),
	lastPickedUserId: null,
	drawMode: "random" as const,
	rotationCycle: 1,
	createdAt: new Date("2026-07-01T00:00:00Z"),
	updatedAt: new Date("2026-07-01T00:00:00Z"),
};

describe("parsedGroupModel calendar schedules", () => {
	it("parses a serialized calendar schedule", () => {
		const parsed = parsedGroupModel.parse({
			...baseGroup,
			scheduleType: "calendar",
			scheduleValue: JSON.stringify({ days: 3, time: "09:00" }),
		});

		expect(parsed.schedule).toEqual({
			type: "calendar",
			value: { days: 3, time: "09:00" },
		});
	});

	it("rejects malformed calendar schedule data", () => {
		const parsed = parsedGroupModel.safeParse({
			...baseGroup,
			scheduleType: "calendar",
			scheduleValue: JSON.stringify({ days: 0, time: "25:00" }),
		});

		expect(parsed.success).toBe(false);
	});
});
