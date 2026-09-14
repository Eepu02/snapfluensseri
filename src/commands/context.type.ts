import type { Context, Types } from "telegraf";
import type { Message, Update } from "telegraf/types";
import type { BotContext } from "../bot";

export type CommandCtx = Context<{
	message: Update.New & Update.NonChannel & Message.TextMessage;
	update_id: number;
}> &
	Omit<BotContext, keyof Context<Update>> &
	Types.CommandContextExtn;
