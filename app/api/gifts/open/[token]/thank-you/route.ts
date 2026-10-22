import { thankGift } from "@/lib/gifts";
import { assertOrigin, body, actorHash } from "../../../../_utils";
import { giftJson, giftFail, emptyInput } from "../../../_private";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    assertOrigin(request);
    emptyInput.parse(await body(request));
    return giftJson(await thankGift((await params).token, actorHash(request)));
  } catch (e) {
    return giftFail(e);
  }
}
