import * as sqlite from "bun:sqlite";
import * as util from "node:util";
import { $ } from "bun";
import { dequeue } from "./dequeue.ts";
import { handleQueueRequest } from "./queue.ts";

async function main(): Promise<void> {
  const args = util.parseArgs({
    args: process.argv.slice(2),
    options: {
      db: {
        type: "string",
        short: "d",
        default: "/var/lib/discord-webhook-dispatcher/queue_db/db.sqlite",
        description: "Path to the SQLite database file.",
      },
      socket: {
        type: "string",
        short: "s",
        default: "/run/discord-webhook-dispatcher.sock",
        description: "Path to the Unix socket for the server.",
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

    CREATE TABLE IF NOT EXISTS rate_limit (
      bucket TEXT PRIMARY KEY,
      reset_time_epoch INTEGER NOT NULL,
      remaining INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS queue (
      uuid TEXT NOT NULL,
      webhook_url TEXT NOT NULL,
      content TEXT NOT NULL,
      created_time INTEGER NOT NULL,
      rate_limit_bucket TEXT,
      CONSTRAINT uuid_pk PRIMARY KEY (uuid),
      CONSTRAINT rate_limit_bucket_fk FOREIGN KEY (rate_limit_bucket) REFERENCES rate_limit (bucket)
    ) STRICT;
  `);

  Bun.serve({
    fetch: (request: Request): Promise<Response> =>
      handleQueueRequest(db, request),
    unix: args.values.socket,
  });

  await $`systemd-notify --ready --no-block`;

  let running = true;
  process.on("SIGTERM", () => {
    running = false;
  });

  while (running) {
    await dequeue(db);
  }

  db.close();

  process.exit(0);
}

main();
