import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool, transaction } from "./index";
export const NEIGHBORHOODS = [
  { id: "night-owls", name: "The Night Owls", color: "#68798b" },
  { id: "cat-people", name: "The Cat People", color: "#ca8d69" },
  { id: "overthinkers", name: "The Overthinkers", color: "#89927a" },
  { id: "creative-chaos", name: "The Creative Chaos", color: "#d46a52" },
  { id: "founders-corner", name: "The Founders’ Corner", color: "#e5bf6f" },
  { id: "med-students", name: "The Med Students", color: "#789ca0" },
  { id: "birthday-end", name: "The Birthday End", color: "#ba8293" },
  { id: "quiet-corner", name: "The Quiet Corner", color: "#9a9d7c" },
].map((n, i) => ({ ...n, startSeat: i * 1250 + 1, endSeat: (i + 1) * 1250 }));
export async function migrate() {
  const migrations = await Promise.all(
    [
      "0001_initial",
      "0002_auth_rate_limits",
      "0003_donations",
      "0004_journey",
    ].map(async (id) => ({
      id,
      sql: await readFile(resolve(process.cwd(), `lib/db/${id}.sql`), "utf8"),
    })),
  );
  await transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(890001)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const migration of migrations) {
      const applied = await c.query(
        "SELECT id FROM schema_migrations WHERE id=$1",
        [migration.id],
      );
      if (!applied.rowCount) {
        await c.query(migration.sql);
        await c.query("INSERT INTO schema_migrations(id) VALUES($1)", [
          migration.id,
        ]);
      }
    }
    for (const n of NEIGHBORHOODS) {
      await c.query(
        "INSERT INTO neighborhoods(id,name,start_seat,end_seat,color) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",
        [n.id, n.name, n.startSeat, n.endSeat, n.color],
      );
      await c.query(
        "INSERT INTO seats(id,neighborhood_id) SELECT generate_series($1::int,$2::int),$3 ON CONFLICT(id) DO NOTHING",
        [n.startSeat, n.endSeat, n.id],
      );
    }
  });
}
