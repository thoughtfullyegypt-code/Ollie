import { requireUser } from "@/lib/auth";
import { createGift, listGifts } from "@/lib/gifts";
import { assertOrigin, body } from "../_utils";
import { giftJson, giftFail } from "./_private";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request.headers);
    return giftJson({ gifts: await listGifts(user.id) });
  } catch (e) {
    return giftFail(e);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await requireUser(request.headers);
    return giftJson(
      { gift: await createGift(user.id, await body(request)) },
      201,
    );
  } catch (e) {
    return giftFail(e);
  }
}
