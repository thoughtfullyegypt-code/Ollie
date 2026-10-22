import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createOrder, profileSchema } from "@/lib/domain";
import { attributionSchema } from "@/lib/analytics";
import { pool } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { checkoutProvider, createHostedCheckout } from "@/lib/payments";
import { assertOrigin, body, fail, json } from "../_utils";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await requireUser(request.headers);
    const input = z
      .object({
        packageId: z.enum(["one", "two", "six", "celebration"]),
        seatIds: z.array(z.number().int().min(1).max(10000)).min(1).max(6),
        profile: z.record(z.string(), z.unknown()),
        invitationToken: z.string().min(20).max(200).optional(),
        expectedAmount: z.number().int().min(0).max(10000000).optional(),
        attribution: attributionSchema.optional(),
        giftId: z.string().uuid().optional(),
      })
      .parse(await body(request));
    const provider = checkoutProvider();
    const order = await createOrder(user.id, {
      ...input,
      profile: profileSchema.parse(input.profile),
      provider,
    });
    if (provider === "development")
      return json({ orderId: order.id, mode: "development", order });
    try {
      const session = await createHostedCheckout(order, user.email);
      return json({ orderId: order.id, mode: "stripe", url: session.url });
    } catch (error) {
      // A network timeout can occur after Stripe creates a valid session. Never
      // release inventory on an ambiguous provider failure. Resume with the same
      // idempotency key, or reconcile before an administrator releases anything.
      await pool.query(
        "INSERT INTO support_issues(id,user_id,order_id,kind,message) VALUES($1,$2,$3,$4,$5)",
        [
          randomUUID(),
          user.id,
          order.id,
          "checkout_initialization",
          "Hosted checkout initialization needs retry or provider reconciliation. Inventory has been retained.",
        ],
      );
      throw error;
    }
  } catch (e) {
    return fail(e);
  }
}
