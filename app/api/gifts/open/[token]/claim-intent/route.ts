import { requireUser } from "@/lib/auth";
import { createGiftClaimIntent } from "@/lib/gifts";
import { assertOrigin, body } from "../../../../_utils";
import { giftJson, giftFail, emptyInput } from "../../../_private";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    assertOrigin(request);
    const user = await requireUser(request.headers);
    emptyInput.parse(await body(request));
    return giftJson(await createGiftClaimIntent(user.id, (await params).token));
  } catch (e) {
    return giftFail(e);
  }
}
