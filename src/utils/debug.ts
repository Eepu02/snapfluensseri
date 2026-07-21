import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema";
import { groupMembers, groups } from "../db/schema";

/**
 * Development and testing utilities
 */

/**
 * Display database statistics (useful for debugging)
 */
export async function showDatabaseStats(db: DrizzleD1Database<typeof schema>) {
	const allGroups = await db.select().from(groups);
	const allMembers = await db.select().from(groupMembers);
	const activeGroupsResult = await db
		.select()
		.from(groups)
		.where(eq(groups.isActive, true));

	console.log("📊 Database Stats:");
	console.log(`  Groups: ${allGroups.length}`);
	console.log(`  Active Groups: ${activeGroupsResult.length}`);
	console.log(`  Members: ${allMembers.length}`);
}

/**
 * Show all groups with their schedules
 */
export async function listGroups(db: DrizzleD1Database<typeof schema>) {
	const allGroups = await db.select().from(groups);

	console.log("\n📋 Groups:");
	for (const group of allGroups) {
		const members = await db
			.select()
			.from(groupMembers)
			.where(eq(groupMembers.chatId, group.chatId));

		const optedInCount = members.filter((m) => m.isOptedIn).length;
		const schedule =
			group.scheduleType === "interval"
				? `Every ${group.scheduleValue}s`
				: group.scheduleType === "calendar"
					? `Calendar: ${group.scheduleValue}`
					: `Cron: ${group.scheduleValue}`;

		console.log(`
  Chat ID: ${group.chatId}
  Status: ${group.isActive ? "✅ Active" : "❌ Inactive"}
  Schedule: ${schedule}
  Timezone: ${group.timezone}
  Next Run: ${group.nextRunAt?.toISOString() || "Not scheduled"}
  Members: ${optedInCount}
  `);
	}
}

/**
 * Show members of a specific group
 */
export async function listGroupMembers(
	db: DrizzleD1Database<typeof schema>,
	chatId: number,
) {
	const members = await db
		.select()
		.from(groupMembers)
		.where(eq(groupMembers.chatId, chatId));

	console.log(`\n👥 Members of group ${chatId}:`);
	for (const member of members) {
		console.log(`
  User ID: ${member.userId}
  Username: ${member.username || "(none)"}
  First Name: ${member.firstName || "(none)"}
  Opted In: ${member.isOptedIn ? "✅" : "❌"}
  Last Seen: ${member.lastSeenAt?.toISOString() || "Never"}
  `);
	}
}
