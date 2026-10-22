import { seedDevelopment } from "../lib/db/seed";
import { pool } from "../lib/db";
await seedDevelopment();
console.log("Development sample guests seeded.");
await pool.end();
