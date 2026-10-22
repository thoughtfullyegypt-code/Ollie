import { requireUser } from "@/lib/auth";
import { claimInvitation } from "@/lib/domain";
import { assertOrigin, fail, json } from "../../../_utils";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    assertOrigin(request);
    const user = await requireUser(request.headers);
    return json(await claimInvitation(user.id, (await params).token));
  } catch (e) {
    return fail(e);
  }
}
