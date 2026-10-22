import { requireAdmin } from "@/lib/auth";
import { publishDonationPeriod } from "@/lib/donations";
import { assertOrigin, body, fail, json } from "../../../_utils";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await requireAdmin(request.headers);
    return json(await publishDonationPeriod(user.id, await body(request)));
  } catch (e) {
    return fail(e);
  }
}
