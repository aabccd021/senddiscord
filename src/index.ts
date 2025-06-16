import * as sqlite from "bun:sqlite";
import * as util from "node:util";
import { $ } from "bun";
import { dequeue } from "./dequeue.ts";
import { handleQueueRequest } from "./queue.ts";

// TODO: concurrency
// TODO: chunk 2000
// TODO; journald compatible logging with prefix like <3> or <6>

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtExceptionMonitor", (error) => {
  console.error("Uncaught Exception Monitor:", error);
});

process.on("warning", (warning) => {
  console.warn("Warning:", warning);
});

async function main(): Promise<void> {
  const args = util.parseArgs({
    args: process.argv.slice(2),
    options: {
      db: {
        type: "string",
        short: "d",
        default: "/var/lib/discord-webhook-dispatcher/message_db/db.sqlite",
      },
      port: {
        type: "string",
        short: "p",
        default: "13000",
      },
    },
  });

  const db = new sqlite.Database(args.values.db, {
    strict: true,
    safeIntegers: true,
    create: true,
  });

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS ratelimit (
      bucket TEXT PRIMARY KEY,
      reset_time INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS webhook (
      url TEXT PRIMARY KEY,
      ratelimit_bucket TEXT NOT NULL,
      CONSTRAINT ratelimit_bucket_fk FOREIGN KEY (ratelimit_bucket) REFERENCES ratelimit (bucket)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS message (
      uuid TEXT NOT NULL,
      webhook_url TEXT NOT NULL,
      content TEXT NOT NULL,
      created_time INTEGER NOT NULL,
      error_count INTEGER NOT NULL DEFAULT 0,
      is_processing INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT uuid_pk PRIMARY KEY (uuid),
      CONSTRAINT webhook_url_fk FOREIGN KEY (webhook_url) REFERENCES webhook (url),
      CONSTRAINT is_processing_boolean CHECK (is_processing IN (0, 1))
    ) STRICT;
  `);

  const server = Bun.serve({
    fetch: (request: Request): Promise<Response> =>
      handleQueueRequest(db, request),
    port: Number.parseInt(args.values.port, 10),
  });

  await $`systemd-notify --ready --no-block`;

  let running = true;
  process.on("SIGTERM", () => {
    running = false;
  });

  while (running) {
    try {
      await dequeue(db);
    } catch (error) {
      console.error("Fatal error in dequeue:", error);
      await Bun.sleep(1000);
    }
  }

  await server.stop();
  db.close();

  process.exit(0);
}

main();
