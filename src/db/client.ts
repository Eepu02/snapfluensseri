import type { DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export interface Env {
	BOT_TOKEN: string;
	TG_WEBHOOK_SECRET: string;
	snapfluencer: D1Database;
}

export function getDb(env: Env): DrizzleD1Database<typeof schema> {
	return drizzle(env.snapfluencer, { schema });
}

export type DB = ReturnType<typeof getDb>;
