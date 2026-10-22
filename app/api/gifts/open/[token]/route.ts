import { readGift } from "@/lib/gifts";
import { actorHash } from "../../../_utils";
import { giftJson, giftFail } from "../../_private";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    return giftJson({
      gift: await readGift((await params).token, actorHash(request)),
    });
  } catch (e) {
    return giftFail(e);
  }
}
