import { requireAdmin } from "@/lib/auth";
import { adminDonationData, saveDonationConfig } from "@/lib/donations";
import { assertOrigin, body, fail, json } from "../../_utils";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireAdmin(request.headers);
    return json(await adminDonationData(user.id));
  } catch (e) {
    return fail(e);
  }
}
export async function PUT(request: Request) {
  try {
    assertOrigin(request);
    const user = await requireAdmin(request.headers);
    return json(await saveDonationConfig(user.id, await body(request)));
  } catch (e) {
    return fail(e);
  }
}
