import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { supportRequest } from "@/lib/domain";
import { assertOrigin, body, fail, json } from "../../_utils";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await requireUser(request.headers);
    const input = z
      .object({
        subject: z.string().trim().min(1).max(120).optional(),
        message: z.string().trim().min(3).max(2000),
        orderId: z.string().max(100).optional(),
      })
      .parse(await body(request));
    return json(
      await supportRequest(
        user.id,
        [input.subject, input.message].filter(Boolean).join("\n\n"),
        input.orderId,
      ),
    );
  } catch (e) {
    return fail(e);
  }
}
