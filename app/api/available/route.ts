import { findAvailable } from "@/lib/domain";
import { fail, json } from "../_utils";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const count = Number(params.get("count") || 1),
      near = Number(params.get("near") || 1);
    if (
      ![1, 2, 6].includes(count) ||
      !Number.isInteger(near) ||
      near < 1 ||
      near > 10000
    )
      return json(
        { error: "Choose 1, 2, or 6 seats near a valid seat number." },
        400,
      );
    return json({ seatIds: await findAvailable(count, near) });
  } catch (e) {
    return fail(e);
  }
}
