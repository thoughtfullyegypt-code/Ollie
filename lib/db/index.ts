import { Pool, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const globalForDB = globalThis as unknown as { seatPool?: Pool };
const connectionString =
  process.env.DATABASE_URL ||
  (process.env.NODE_ENV !== "production" ||
  process.env.APP_MODE === "development"
    ? "postgresql://seat:seat@127.0.0.1:54329/seat"
    : undefined);
if (!connectionString)
  throw new Error("DATABASE_URL is required outside development mode");
export const pool =
  globalForDB.seatPool ??
  new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  });
if (process.env.NODE_ENV !== "production") globalForDB.seatPool = pool;
export const db = drizzle(pool, { schema });
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
