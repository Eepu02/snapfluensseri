# Snapfluensseri

A Telegram bot built with Cloudflare Workers, Cloudflare D1 (SQLite), and Drizzle ORM to periodically draw a "Snapfluencer" (or other customizable title) from a pool of opted-in group members.

## Features

- **Automated Drawings**: Runs periodically using fixed intervals, timezone-aware calendar intervals, or cron expressions.
- **Multiple Draw Modes**: Supports standard `random` mode and `double` (Double Trouble) mode with a 10% chance to pick two users.
- **Timezone Support**: Custom timezone settings so cron schedules execute at the expected local times.
- **HTML Mention Support**: Mentions winners securely by escaping usernames and using HTML formatting.
- **High Performance**: Built to run entirely on Cloudflare's serverless edge network using asynchronous, parallel group processing.

---

## Commands

- `/activate` - Initializes the group chat settings and activates drawings.
- `/deactivate` - Suspends drawings in the group chat.
- `/join` - Adds yourself to the drawing candidate pool.
- `/leave` - Removes yourself from the candidate pool.
- `/status` - Displays current group config, active members, drawing mode, and next scheduled draw time.
- `/schedule every <duration>` - Configures a fixed-duration frequency.
- `/schedule every <days> days at <HH:mm>` - Runs every N local calendar days at an exact local time (weeks are also supported).
- `/schedule cron <expression>` - Configures a cron schedule.
- `/timezone <tz>` - Sets local timezone for the group (e.g. `Europe/Helsinki`).
- `/mode <random/double>` - Configures the draw mode.
- `/snapfluencer` - Triggers a manual draw immediately.

---

## Technical Architecture

The codebase is structured as follows:

```
├── drizzle/                     # Drizzle migration files and SQL schema snapshots
├── src/
│   ├── commands/                # Telegram bot command handlers
│   │   ├── activate.ts
│   │   ├── schedule.ts
│   │   ├── snapfluencer.ts      # Manual pick logic
│   │   └── ...
│   ├── db/                      # Database client connection, schema, and models
│   │   ├── client.ts
│   │   ├── model.ts             # Zod parsing/validation models
│   │   └── schema.ts            # Drizzle table schemas
│   ├── utils/                   # Shared helpers (random pickers, scheduling calculations)
│   │   ├── random.ts
│   │   ├── schedule.ts
│   │   └── telegram.ts
│   ├── bot.ts                   # Telegraf bot configuration and command routing
│   ├── cron.ts                  # Scheduled task runner for processing due group draws
│   ├── index.ts                 # Worker entry point (Fetch & Scheduled handlers)
│   └── cron.test.ts             # Integration tests
```

### Entry Points
- **HTTP Fetch Handler (`src/index.ts`)**: Handles webhooks sent from the Telegram Bot API and routing for simple health checks.
- **Scheduled Cron Handler (`src/index.ts`)**: Triggers every minute (via wrangler cron triggers) and calls `runCron()` in `src/cron.ts` to atomically claim and process active groups whose `nextRunAt` timestamp has elapsed. Future interval runs stay aligned to the stored schedule cursor rather than processing completion time.

---

## Development Setup

### Prerequisites
- Node.js & `pnpm`
- Cloudflare Wrangler CLI (installed automatically as dev dependency)

### Commands
1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Database Migrations (Local D1)**:
   ```bash
   pnpm run db:generate
   pnpm run db:migrate:local
   ```

3. **Start local dev server**:
   ```bash
   pnpm run dev
   ```
   *Note: This starts Wrangler with local D1 database bindings and scheduled-event testing capabilities.*

4. **Run tests**:
   ```bash
   pnpm test
   ```

5. **Deploy to Cloudflare Workers**:
   ```bash
   pnpm run db:migrate:remote
   pnpm run deploy
   ```
