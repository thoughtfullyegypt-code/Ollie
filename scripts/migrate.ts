import { migrate } from "../lib/db/migrate";
import { pool } from "../lib/db";
await migrate();
console.log("Database migrations applied.");
await pool.end();
