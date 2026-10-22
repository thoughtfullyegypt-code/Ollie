import { pool } from "@/lib/db";
import { json } from "../_utils";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await pool.query("SELECT 1");
    return json({ status: "ok", database: "connected" });
  } catch {
    return json({ status: "unavailable", database: "unavailable" }, 503);
  }
}
