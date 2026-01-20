import type { Context } from "telegraf";
import type { Message, Update } from "telegraf/typings/core/types/typegram";
import type { CommandContextExtn } from "telegraf/typings/telegram-types";
import type { BotContext } from "../bot";

export type CommandCtx = Context<{
	message: Update.New & Update.NonChannel & Message.TextMessage;
	update_id: number;
}> &
	Omit<BotContext, keyof Context<Update>> &
	CommandContextExtn;
