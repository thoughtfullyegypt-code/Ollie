import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { devToolsEnabled } from "@/lib/config";
import { getOrder, handlePaymentEvent } from "@/lib/domain";
import { assertOrigin, body, fail, json } from "../../_utils";
export async function POST(request: Request) {
  try {
    if (!devToolsEnabled()) return json({ error: "Not found." }, 404);
    assertOrigin(request);
    const user = await requireUser(request.headers);
    const { orderId, outcome } = z
      .object({
        orderId: z.string().min(1).max(100),
        outcome: z.enum(["paid", "failed"]),
      })
      .parse(await body(request));
    const order = await getOrder(user.id, orderId);
    if (order.provider !== "development")
      return json(
        {
          error:
            "Only explicitly marked development orders can use the local payment simulator.",
        },
        403,
      );
    if (outcome === "paid" && order.status !== "paid") {
      const expiresAt = order.checkoutExpiresAt
        ? new Date(order.checkoutExpiresAt).getTime()
        : 0;
      if (order.status === "checkout_pending" && expiresAt <= Date.now()) {
        await handlePaymentEvent({
          id: `dev:${orderId}:expired`,
          type: "expired",
          orderId,
          provider: "development",
        });
        return json(
          {
            error:
              "This development checkout has expired. Your character draft is saved; start a new checkout to choose available seats.",
          },
          409,
        );
      }
      if (order.status !== "checkout_pending")
        return json(
          {
            error:
              "This development checkout is no longer payable. Start a new checkout; your character draft is saved.",
          },
          409,
        );
    }
    const result = await handlePaymentEvent({
      id: `dev:${orderId}:${outcome}`,
      type: outcome,
      orderId,
      amount: order.amount,
      currency: order.currency,
      provider: "development",
    });
    return json({
      development: true,
      result,
      order: await getOrder(user.id, orderId),
    });
  } catch (e) {
    return fail(e);
  }
}
