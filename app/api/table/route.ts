import { getPublicSeats, getStats, getPackages } from "@/lib/domain";
import { pool } from "@/lib/db";
import { publicConfig } from "@/lib/config";
import { fail, json } from "../_utils";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const number = (name: string, fallback: number) => {
      const value = Number(params.get(name) ?? fallback);
      return Number.isInteger(value) ? value : fallback;
    };
    const [table, stats, neighborhoods, packages] = await Promise.all([
      getPublicSeats({
        start: Math.max(1, number("start", 1)),
        end: Math.min(
          10000,
          number(
            "end",
            params.get("q") || params.get("neighborhood") ? 10000 : 60,
          ),
        ),
        query: (params.get("q") || "").slice(0, 100),
        neighborhood: params.get("neighborhood") || undefined,
        page: Math.max(1, number("page", 1)),
      }),
      getStats(),
      pool.query(
        'SELECT id,name,start_seat AS "startSeat",end_seat AS "endSeat",color FROM neighborhoods ORDER BY start_seat',
      ),
      getPackages(),
    ]);
    const response = json({
      ...table,
      stats,
      neighborhoods: neighborhoods.rows,
      packages,
      config: publicConfig(),
    });
    // This response contains only published profiles and public inventory, with
    // no account lookup. Every allocation is still rechecked inside checkout.
    response.headers.set(
      "Cache-Control",
      "public, max-age=0, s-maxage=5, stale-while-revalidate=5",
    );
    return response;
  } catch (e) {
    return fail(e);
  }
}
