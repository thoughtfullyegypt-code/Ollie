import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { claimGift } from "@/lib/gifts";
import { assertOrigin, body } from "../../../../_utils";
import { giftJson, giftFail } from "../../../_private";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    assertOrigin(request);
    const user = await requireUser(request.headers);
    const input = z
      .object({
        claimToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        confirm: z.literal(true),
      })
      .strict()
      .parse(await body(request));
    return giftJson(
      await claimGift(user.id, (await params).token, input.claimToken),
    );
  } catch (e) {
    return giftFail(e);
  }
}
