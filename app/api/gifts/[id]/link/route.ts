import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { issueGiftLink } from "@/lib/gifts";
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
      .object({ replace: z.boolean().optional() })
      .strict()
      .parse(await body(request));
    return giftJson(
      await issueGiftLink(user.id, giftId((await params).id), input),
    );
  } catch (e) {
    return giftFail(e);
  }
}
