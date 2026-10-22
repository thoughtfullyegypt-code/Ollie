import { requireUser } from "@/lib/auth";
import { getGift } from "@/lib/gifts";
import { giftJson, giftFail, giftId } from "../../_private";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request.headers);
    const { claimedBy, ...gift } = await getGift(
      user.id,
      giftId((await params).id),
    );
    return giftJson({ gift: { ...gift, claimed: !!gift.claimedAt } });
  } catch (e) {
    return giftFail(e);
  }
}
