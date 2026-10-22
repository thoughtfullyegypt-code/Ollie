import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prepareGift } from "@/lib/gifts";
import { assertOrigin, body } from "../../../_utils";
import { giftJson, giftFail, giftId } from "../../_private";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    const user = await requireUser(request.headers);
    const input = z
      .object({ near: z.number().int().min(1).max(10000).optional() })
      .strict()
      .parse(await body(request));
    return giftJson(
      await prepareGift(user.id, giftId((await params).id), input.near),
    );
  } catch (e) {
    return giftFail(e);
  }
}
