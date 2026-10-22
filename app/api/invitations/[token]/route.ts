import { requireUser } from "@/lib/auth";
import { resolveInvitation, revokeInvitation } from "@/lib/domain";
import { assertOrigin, fail, json } from "../../_utils";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    return json(await resolveInvitation((await params).token));
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    assertOrigin(request);
    const user = await requireUser(request.headers);
    return json(await revokeInvitation(user.id, (await params).token));
  } catch (e) {
    return fail(e);
  }
}
