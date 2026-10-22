import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { createConnection } from "node:net";
import { Client } from "pg";
// Keep PostgreSQL WAL and email files outside Next's watched project tree.
const dataRoot =
  process.env.DEV_DATA_DIR || resolve("..", ".seat-at-internet-data");
const databaseDir = resolve(dataRoot, "postgres");
mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
const listening = await new Promise<boolean>((r) => {
  const s = createConnection({ host: "127.0.0.1", port: 54329 });
  s.once("connect", () => {
    s.destroy();
    r(true);
  });
  s.once("error", () => r(false));
  s.setTimeout(1000, () => {
    s.destroy();
    r(false);
  });
});
if (listening) {
  const c = new Client({
    connectionString:
      process.env.DATABASE_URL || "postgresql://seat:seat@127.0.0.1:54329/seat",
  });
  try {
    await c.connect();
    await c.query("SELECT 1");
    console.log("The existing development PostgreSQL database is healthy.");
  } finally {
    await c.end();
  }
  process.exit(0);
}
// Task snapshots retain files, not processes. Remove a lock only after proving
// its process is absent/a Linux zombie AND its loopback port is not listening.
const lock = resolve(databaseDir, "postmaster.pid");
if (existsSync(lock)) {
  const pid = Number(readFileSync(lock, "utf8").split("\n")[0]);
  let dead = false;
  try {
    process.kill(pid, 0);
    if (process.platform === "linux" && existsSync(`/proc/${pid}/stat`))
      dead =
        readFileSync(`/proc/${pid}/stat`, "utf8")
          .split(") ")[1]
          ?.startsWith("Z ") || false;
  } catch (e) {
    dead = (e as NodeJS.ErrnoException).code === "ESRCH";
  }
  if (dead) {
    unlinkSync(lock);
    for (const f of ["/tmp/.s.PGSQL.54329.lock", "/tmp/.s.PGSQL.54329"])
      if (existsSync(f)) unlinkSync(f);
    console.log(
      "Cleared a verified stale lock from a stopped development database.",
    );
  } else
    throw new Error(
      "The development cluster lock belongs to a running process. Check it before restarting; no lock was removed.",
    );
}
const pg = new EmbeddedPostgres({
  databaseDir,
  user: "seat",
  password: "seat",
  port: 54329,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: (msg) => {
    if (String(msg).includes("ready to accept"))
      console.log("Development PostgreSQL ready on 127.0.0.1:54329");
  },
  onError: (msg) => {
    if (msg) console.error(String(msg));
  },
});
if (!existsSync(resolve(databaseDir, "PG_VERSION"))) await pg.initialise();
try {
  await pg.start();
} catch {
  throw new Error(
    "Development PostgreSQL could not start. Check the cluster lock and available port54329; the persistent cluster was preserved.",
  );
}
const client = pg.getPgClient();
await client.connect();
const found = await client.query(
  "SELECT 1 FROM pg_database WHERE datname='seat'",
);
await client.end();
if (!found.rowCount) await pg.createDatabase("seat");
console.log(
  "Persistent PostgreSQL development database is running. Ctrl+C to stop.",
);
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await pg.stop();
    process.exit(0);
  });
await new Promise(() => {});
