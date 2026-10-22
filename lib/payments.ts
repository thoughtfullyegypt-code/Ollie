import Stripe from "stripe";
import { pool } from "./db";
import { attachCheckout, handlePaymentEvent } from "./domain";
import {
  config,
  devToolsEnabled,
  livePaymentsEnabled,
  stripeMode,
} from "./config";

let client: Stripe | undefined;
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key)
    throw Object.assign(new Error("Stripe checkout is not configured."), {
      status: 503,
    });
  return (
    client ||
    (client = new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 }))
  );
}
export function checkoutProvider(): "development" | "stripe" {
  if (process.env.STRIPE_SECRET_KEY) {
    if (stripeMode() === "live" && !livePaymentsEnabled())
      throw Object.assign(
        new Error(
          "Live purchases are disabled until launch requirements are verified.",
        ),
        { status: 503 },
      );
    getStripe();
    return "stripe";
  }
  if (devToolsEnabled()) return "development";
  throw Object.assign(
    new Error(
      "Purchases are disabled while secure hosted checkout is being configured.",
    ),
    { status: 503 },
  );
}
export function assertCheckoutMode(providerLive: boolean) {
  if (providerLive !== (stripeMode() === "live"))
    throw Object.assign(
      new Error(
        "The payment credential mode does not match STRIPE_MODE. Purchases remain disabled.",
      ),
      { status: 503 },
    );
  if (providerLive && !livePaymentsEnabled())
    throw Object.assign(
      new Error(
        "Live purchases are disabled until launch requirements are verified.",
      ),
      { status: 503 },
    );
}
async function verifyCheckoutCredentialMode(stripe: Stripe) {
  const key = process.env.STRIPE_SECRET_KEY || "";
  // A proxy credential may be opaque. Ask Stripe for its actual mode before
  // creating any checkout link; a declared test mode must never enable live sales.
  const providerLive = key.startsWith("sk_live_")
    ? true
    : key.startsWith("sk_test_")
      ? false
      : (await stripe.balance.retrieve()).livemode;
  assertCheckoutMode(providerLive);
}
export async function createHostedCheckout(
  order: {
    id: string;
    userId?: string;
    amount: number;
    currency: string;
    packageId: string;
    seatIds: number[];
  },
  email: string,
) {
  checkoutProvider();
  const stripe = getStripe();
  await verifyCheckoutCredentialMode(stripe);
  if (process.env.TAX_POLICY === "inclusive") {
    const rateId = process.env.STRIPE_TAX_RATE_ID;
    if (!rateId)
      throw Object.assign(
        new Error(
          "Inclusive sales-tax configuration requires a verified Stripe tax rate.",
        ),
        { status: 503 },
      );
    const rate = await stripe.taxRates.retrieve(rateId);
    const basisPoints = Number(process.env.SALES_TAX_BPS);
    if (
      !rate.active ||
      !rate.inclusive ||
      !Number.isInteger(basisPoints) ||
      Math.round(rate.percentage * 100) !== basisPoints
    )
      throw Object.assign(
        new Error(
          "The Stripe tax rate does not match the displayed inclusive tax. Checkout is disabled pending operator review.",
        ),
        { status: 503 },
      );
  }
  const stored = (
    await pool.query(
      "SELECT checkout_session_id,checkout_expires_at FROM orders WHERE id=$1",
      [order.id],
    )
  ).rows[0];
  if (!stored)
    throw Object.assign(new Error("Order not found."), { status: 404 });
  if (stored.checkout_session_id) {
    const existing = await stripe.checkout.sessions.retrieve(
      stored.checkout_session_id,
    );
    if (
      existing.metadata?.order_id !== order.id ||
      existing.amount_total !== order.amount ||
      existing.currency !== order.currency
    )
      throw Object.assign(
        new Error("Checkout details need financial review."),
        { status: 409 },
      );
    assertCheckoutMode(existing.livemode);
    if (existing.status !== "open") {
      await reconcileOrder(order.id);
      throw Object.assign(
        new Error(
          "This checkout is already complete or expired. Refresh your order status.",
        ),
        { status: 409 },
      );
    }
    return existing;
  }
  const expiry = Math.floor(
    new Date(stored.checkout_expires_at).getTime() / 1000,
  );
  if (!Number.isFinite(expiry))
    throw Object.assign(
      new Error("Checkout reservation expiry is unavailable. Contact support."),
      { status: 409 },
    );
  // Card-only checkout avoids an independently expiring asynchronous payment hold.
  // Inventory remains reserved until an authenticated provider terminal event.
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      allowed_payment_method_types: ["card"],
      customer_email: email,
      client_reference_id: order.id,
      metadata: { order_id: order.id },
      payment_intent_data: { metadata: { order_id: order.id } },
      line_items: [
        {
          quantity: 1,
          ...(process.env.TAX_POLICY === "inclusive" &&
          process.env.STRIPE_TAX_RATE_ID
            ? { tax_rates: [process.env.STRIPE_TAX_RATE_ID] }
            : {}),
          price_data: {
            currency: order.currency,
            unit_amount: order.amount,
            tax_behavior: "inclusive",
            product_data: {
              name: `${config.brand} · ${order.seatIds.length} ${order.seatIds.length === 1 ? "seat" : "seats"}`,
              description: `Digital guest customization and display service for ${config.serviceMonths} months. Seats ${order.seatIds.join(", ")}.`,
            },
          },
        },
      ],
      success_url: `${config.url}/account?order=${encodeURIComponent(order.id)}&checkout=returned`,
      cancel_url: `${config.url}/account?order=${encodeURIComponent(order.id)}&checkout=cancelled`,
      // Stable across retries: Stripe idempotency requires identical parameters.
      expires_at: expiry,
    },
    { idempotencyKey: `checkout:${order.id}` },
  );
  await attachCheckout(
    order.id,
    session.id,
    new Date(session.expires_at * 1000),
  );
  return session;
}
export async function processStripeEvent(event: Stripe.Event) {
  const stripe = getStripe();
  const object = event.data.object as unknown as Record<string, unknown>;
  const metadata = object.metadata as Record<string, string> | undefined;
  let orderId =
    metadata?.order_id || (object.client_reference_id as string | undefined);
  const intent = object.payment_intent;
  const paymentIntentId =
    typeof intent === "string"
      ? intent
      : intent && typeof intent === "object"
        ? (intent as { id: string }).id
        : undefined;
  if (!orderId && paymentIntentId) {
    const result = await pool.query(
      "SELECT id FROM orders WHERE payment_intent_id = $1",
      [paymentIntentId],
    );
    orderId = result.rows[0]?.id;
    if (!orderId) {
      const payment = await stripe.paymentIntents.retrieve(paymentIntentId);
      orderId = payment.metadata?.order_id;
    }
  }
  if (!orderId) return { ignored: true };
  const base = {
    id: event.id,
    orderId,
    provider: "stripe" as const,
    paymentIntentId,
    occurredAt: new Date(event.created * 1000).toISOString(),
  };
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      const stored = (
        await pool.query("SELECT checkout_session_id FROM orders WHERE id=$1", [
          orderId,
        ])
      ).rows[0];
      if (
        stored?.checkout_session_id &&
        stored.checkout_session_id !== session.id
      )
        throw new Error("Checkout session does not match its reserved order.");
      return handlePaymentEvent({
        ...base,
        type: session.payment_status === "paid" ? "paid" : "processing",
        amount: session.amount_total ?? undefined,
        currency: session.currency ?? undefined,
        taxMinor: session.total_details?.amount_tax ?? 0,
      });
    }
    case "checkout.session.async_payment_failed":
      return handlePaymentEvent({ ...base, type: "failed" });
    case "checkout.session.expired":
      return handlePaymentEvent({ ...base, type: "expired" });
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      // Domain processing stores every event ID, including partial refunds,
      // so duplicate deliveries cannot open duplicate support issues.
      return handlePaymentEvent({
        ...base,
        type: "refunded",
        amount: charge.amount_refunded,
        currency: charge.currency,
      });
    }
    case "charge.dispute.created":
      return handlePaymentEvent({
        ...base,
        type: "disputed",
        disputedTotalMinor: Number(object.amount),
      });
    case "charge.dispute.closed":
      return handlePaymentEvent({
        ...base,
        type: object.status === "won" ? "dispute_won" : "disputed",
        disputedTotalMinor: Number(object.amount),
      });
    default:
      return { ignored: true };
  }
}
export async function reconcileOrder(orderId: string) {
  const result = await pool.query("SELECT * FROM orders WHERE id=$1", [
    orderId,
  ]);
  const order = result.rows[0];
  if (!order)
    throw Object.assign(new Error("Order not found."), { status: 404 });
  if (order.provider !== "stripe" || !order.checkout_session_id)
    return { unchanged: true, status: order.status };
  const session = await getStripe().checkout.sessions.retrieve(
    order.checkout_session_id,
  );
  if (
    session.metadata?.order_id !== orderId ||
    session.amount_total !== order.amount ||
    session.currency !== order.currency
  )
    throw Object.assign(
      new Error(
        "Provider order details do not match. Financial review is required.",
      ),
      { status: 409 },
    );
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  if (session.payment_status === "paid")
    return handlePaymentEvent({
      id: `reconcile:${session.id}:paid`,
      orderId,
      type: "paid",
      provider: "stripe",
      amount: session.amount_total ?? undefined,
      currency: session.currency ?? undefined,
      taxMinor: session.total_details?.amount_tax ?? 0,
      paymentIntentId,
    });
  if (session.status === "expired")
    return handlePaymentEvent({
      id: `reconcile:${session.id}:expired`,
      orderId,
      type: "expired",
      provider: "stripe",
    });
  return { unchanged: true, status: session.status };
}
export async function issueRefund(
  orderId: string,
  reason: string,
  adminId: string,
) {
  const result = await pool.query("SELECT * FROM orders WHERE id=$1", [
    orderId,
  ]);
  const order = result.rows[0];
  if (!order)
    throw Object.assign(new Error("Order not found."), { status: 404 });
  if (!["paid", "refund_requested", "fulfillment_issue"].includes(order.status))
    throw Object.assign(
      new Error("This order cannot be refunded in its current state."),
      { status: 409 },
    );
  if (order.provider === "development" && devToolsEnabled()) {
    return handlePaymentEvent({
      id: `dev-refund:${orderId}`,
      orderId,
      type: "refunded",
      provider: "development",
    });
  }
  if (order.provider !== "stripe" || !order.payment_intent_id)
    throw Object.assign(
      new Error(
        "Provider payment reference is unavailable. Manual financial review is required.",
      ),
      { status: 409 },
    );
  const refund = await getStripe().refunds.create(
    {
      payment_intent: order.payment_intent_id,
      reason: "requested_by_customer",
      metadata: {
        order_id: orderId,
        admin_id: adminId,
        reason: reason.slice(0, 300),
      },
    },
    { idempotencyKey: `refund:${orderId}:full` },
  );
  // The signed refund event, not this admin request, settles local accounting.
  return { refundId: refund.id, status: refund.status, awaitingWebhook: true };
}
