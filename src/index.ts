import { getBot } from "./bot";
import type { Env } from "./db/client";
import { runCron } from "./utils/cron";

export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(req.url);

		if (req.method === "GET" && url.pathname === "/health") {
			return new Response("ok");
		}

		if (req.method === "POST" && url.pathname === "/webhook") {
			const secret = env.TG_WEBHOOK_SECRET;
			if (secret) {
				const got = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
				if (got !== secret) return new Response("forbidden", { status: 403 });
			}

			const bot = await getBot(env);
			await bot.handleUpdate(await req.json());
			return new Response("ok");
		}

		return new Response("not found", { status: 404 });
	},

	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext,
	) {
		ctx.waitUntil(runCron(env, controller.scheduledTime));
	},
} satisfies ExportedHandler<Env>;
