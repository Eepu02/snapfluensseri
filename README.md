# Snapfluensseri

Snapfluensseri is a self-hosted Telegram bot that periodically picks a
"Snapfluencer" from a group of opted-in members. It runs on Cloudflare Workers,
stores state in Cloudflare D1, and supports fixed intervals, local calendar
schedules, and cron expressions.

## Features

- Automatic, timezone-aware drawings
- Manual drawings with `/snapfluencer`
- Opt-in membership with `/join` and `/leave`
- A standard random mode and a "Double Trouble" mode
- Atomic schedule claims to prevent duplicate drawings
- Escaped Telegram HTML mentions

The bot's user-facing messages are currently a mix of Finnish and English.

## Commands

| Command | Description |
| --- | --- |
| `/activate` | Activate drawings in the current group |
| `/deactivate` | Pause drawings |
| `/join` | Join the drawing pool |
| `/leave` | Leave the drawing pool |
| `/status` | Show the group's configuration and members |
| `/schedule every <duration>` | Set a fixed-duration schedule |
| `/schedule every <days> days at <HH:mm>` | Set a local calendar schedule |
| `/schedule cron <expression>` | Set a cron schedule |
| `/timezone <tz>` | Set an IANA timezone, such as `Europe/Helsinki` |
| `/mode <random/double>` | Select the drawing mode |
| `/snapfluencer` | Run a drawing immediately |

## Architecture

```text
Telegram webhook ──> Cloudflare Worker ──> Telegraf commands
                           │
Cloudflare cron ───────────┤
                           └──────────────> Cloudflare D1
```

- `src/index.ts` exposes the health check and authenticated Telegram webhook,
  and receives Cloudflare scheduled events.
- `src/bot.ts` configures Telegraf command routing.
- `src/cron.ts` claims and processes due group drawings.
- `src/db/` contains the D1 schema and data models.
- `drizzle/` contains committed database migrations.

## Prerequisites

- Node.js 22 or newer
- pnpm 10
- A Cloudflare account
- A Telegram bot token from [BotFather](https://t.me/BotFather)

## Local development

1. Install dependencies:

   ```sh
   pnpm install
   ```

2. Create `.dev.vars` (it is ignored by Git):

   ```dotenv
   BOT_TOKEN=your-telegram-bot-token
   TG_WEBHOOK_SECRET=use-a-long-random-value
   ```

3. Apply the migrations to the local D1 database:

   ```sh
   pnpm run db:migrate:local
   ```

4. Start Wrangler:

   ```sh
   pnpm run dev
   ```

The local server exposes `GET /health`. Telegram cannot call a localhost
webhook directly; use a tunnel with HTTPS if you want to exercise real Telegram
updates locally.

Before opening a pull request, run the same checks as CI:

```sh
pnpm run check
```

## Deploying your own instance

The committed `database_id` identifies the maintainer's D1 database; it is not
an authentication credential. If you are deploying a fork, first create your
own D1 database:

```sh
pnpm exec wrangler d1 create snapfluencer
```

Replace the `database_id` in `wrangler.jsonc` with the ID returned by Wrangler.
The binding keeps `remote: false`, so normal local development still uses the
local database under `.wrangler/`.

For the first production deployment, authenticate with `pnpm exec wrangler
login`, then store both secrets in Cloudflare. Use the same webhook secret in
the final Telegram API call below.

```sh
pnpm exec wrangler secret put BOT_TOKEN
pnpm exec wrangler secret put TG_WEBHOOK_SECRET
```

Pushes to `main` are deployed by Cloudflare Workers Builds. The configured
build command runs the full check suite, and the production deploy command
runs `pnpm run deploy:production`. That script applies outstanding D1
migrations before deploying the Worker, so a failed check or migration stops
the release before new code is deployed. Non-production branches only upload
preview versions and do not run remote migrations.

To perform the same release manually, apply outstanding production migrations
before deploying code that depends on them:

```sh
pnpm run check
pnpm run deploy:production
```

When there are no outstanding migrations, the migration command is a no-op.
Wrangler uploads the Worker and applies the bindings from `wrangler.jsonc`;
previously stored secrets remain configured. Review generated SQL before
applying any new remote migration.

Finally, register the deployed endpoint with Telegram. This only needs to be
repeated when the Worker URL or webhook secret changes:

```sh
curl --request POST \
  "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  --data-urlencode "url=https://<YOUR_WORKER>.workers.dev/webhook" \
  --data-urlencode "secret_token=<YOUR_WEBHOOK_SECRET>"
```

Never commit `.dev.vars`, bot tokens, webhook secrets, Cloudflare API tokens, or
production database exports.

## Data and privacy

An operator-hosted instance stores Telegram chat IDs and user IDs, usernames,
first names, opt-in state, drawing counters, and group scheduling settings. The
bot does not need to store message contents. Full Telegram updates are not
logged by the application.

Operators are responsible for telling group members how their instance handles
data, limiting access to Cloudflare logs and D1, and complying with applicable
privacy requirements. `/leave` opts a member out of drawings; it does not erase
their stored record.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow. Please
report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

Snapfluensseri is available under the [MIT License](LICENSE).
