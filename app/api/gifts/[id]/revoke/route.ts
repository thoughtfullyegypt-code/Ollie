import { requireUser } from "@/lib/auth";
import { revokeGift } from "@/lib/gifts";
import { assertOrigin, body } from "../../../_utils";
import { giftJson, giftFail, giftId, emptyInput } from "../../_private";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    const user = await requireUser(request.headers);
    emptyInput.parse(await body(request));
    return giftJson({
      gift: await revokeGift(user.id, giftId((await params).id)),
    });
  } catch (e) {
    return giftFail(e);
  }
}
