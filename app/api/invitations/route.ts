import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createInvitation } from "@/lib/domain";
import { config } from "@/lib/config";
import { assertOrigin, body, fail, json } from "../_utils";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await requireUser(request.headers);
    const input = z
      .object({
        seatId: z.number().int().min(1).max(10000),
        type: z.enum(["courtesy", "paid"]),
      })
      .parse(await body(request));
    const invitation = await createInvitation(
      user.id,
      input.seatId,
      input.type,
    );
    return json({
      ...invitation,
      url: `${config.url}/invite/${encodeURIComponent(invitation.token)}`,
    });
  } catch (e) {
    return fail(e);
  }
}
