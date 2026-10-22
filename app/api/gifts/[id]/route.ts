import { requireUser } from "@/lib/auth";
import { getGift, updateGift } from "@/lib/gifts";
import { assertOrigin, body } from "../../_utils";
import { giftJson, giftFail, giftId } from "../_private";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireUser(request.headers);
    return giftJson({
      gift: await getGift(user.id, giftId((await params).id)),
    });
  } catch (e) {
    return giftFail(e);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    assertOrigin(request);
    const user = await requireUser(request.headers);
    return giftJson({
      gift: await updateGift(
        user.id,
        giftId((await params).id),
        await body(request),
      ),
    });
  } catch (e) {
    return giftFail(e);
  }
}
