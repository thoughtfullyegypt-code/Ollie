import { requireAdmin } from "@/lib/auth";
import { reconcileDonationTax } from "@/lib/donations";
import { assertOrigin, body, fail, json } from "../../../_utils";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await requireAdmin(request.headers);
    return json(await reconcileDonationTax(user.id, await body(request)));
  } catch (e) {
    return fail(e);
  }
}
