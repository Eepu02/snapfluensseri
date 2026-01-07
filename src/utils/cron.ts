import {CronExpressionParser} from "cron-parser";

export function computeNextRunAt(cronExpr: string, timezone: string, from: Date = new Date()): Date {
  // Telegram users will usually provide 5-field cron: "m h dom mon dow"
    // cron-parser supports that.
  const it = CronExpressionParser.parse(cronExpr, {
    currentDate: from,
    tz: timezone,
  });

  return it.next().toDate();
}
