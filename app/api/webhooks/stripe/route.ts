import { getStripe, processStripeEvent } from "@/lib/payments";
import { json } from "../../_utils";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature)
    return json({ error: "Signed webhook configuration is required." }, 400);
  if (Number(request.headers.get("content-length") || 0) > 1_000_000)
    return json({ error: "Payload too large." }, 413);
  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      await request.text(),
      signature,
      secret,
    );
  } catch {
    return json({ error: "Webhook signature verification failed." }, 400);
  }
  try {
    const result = await processStripeEvent(event);
    return json({ received: true, result });
  } catch {
    // Non-2xx tells Stripe to retry. Never log raw webhook/payment data.
    return json(
      { error: "The verified event could not be applied. Retry is required." },
      500,
    );
  }
}
