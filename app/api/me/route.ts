import { z } from "zod";
import { getSession, requireUser } from "@/lib/auth";
import { getOwnerData, requestAccountDeletion } from "@/lib/domain";
import { publicConfig } from "@/lib/config";
import { assertOrigin, body, fail, json } from "../_utils";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const session = await getSession(request.headers);
    if (!session?.user)
      return json({
        user: null,
        seats: [],
        orders: [],
        invitations: [],
        support: [],
        config: publicConfig(),
      });
    const data = await getOwnerData(session.user.id);
    return json({ user: session.user, ...data, config: publicConfig() });
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(request: Request) {
  try {
    assertOrigin(request);
    const user = await requireUser(request.headers);
    z.object({ confirmation: z.literal("DELETE") }).parse(await body(request));
    return json(await requestAccountDeletion(user.id));
  } catch (e) {
    return fail(e);
  }
}
