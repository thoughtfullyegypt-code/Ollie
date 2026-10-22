import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import Stripe from "stripe";
import { getAuth, readDevInbox } from "../lib/auth";
import { pool } from "../lib/db";
import { createOrder, getOrder, attachCheckout } from "../lib/domain";
import { POST as checkout } from "../app/api/checkout/route";
import { POST as developmentPay } from "../app/api/dev/pay/route";
import { POST as webhook } from "../app/api/webhooks/stripe/route";
import { GET as ownerData } from "../app/api/me/route";
import { GET as administrator } from "../app/api/admin/route";
import { GET as table } from "../app/api/table/route";
import { actorHash } from "../app/api/_utils";
import {
  assertCheckoutMode,
  createHostedCheckout,
  getStripe,
} from "../lib/payments";
import { GET as receipt } from "../app/api/orders/[id]/receipt/route";
import { PUT as editGuest } from "../app/api/seats/[id]/route";

const origin = process.env.APP_URL || "http://localhost:3000";
const email = `api-verification-${randomUUID()}@example.test`;
let cookie = "",
  userId = "",
  orderId = "",
  stripeOrderId = "";
const profile = {
  displayName: "API dinner guest",
  message: "The soup has been thoroughly tested.",
  dish: "soup",
  customization: {
    base: "detective",
    accessory: "none",
    outfit: "suit",
    skin: "#dfb28c",
    color: "#9aab91",
  },
};
function request(
  route: string,
  data?: unknown,
  options: { cookie?: string; origin?: string } = {},
) {
  return new Request(`${origin}${route}`, {
    method: data ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      origin: options.origin || origin,
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
}

before(async () => {
  assert.equal(
    process.env.APP_MODE,
    "development",
    "API tests must run against an explicitly configured development environment.",
  );
  assert.equal(process.env.ENABLE_DEV_TOOLS, "true");
});
after(async () => {
  if (userId) {
    // Remove only this suite's generated account and records; never reset the database.
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const ids = (
        await c.query("SELECT id FROM orders WHERE user_id=$1", [userId])
      ).rows.map((x) => x.id);
      await c.query(
        "DELETE FROM audit_events WHERE actor_id=$1 OR target=ANY($2::text[])",
        [userId, ids],
      );
      await c.query("DELETE FROM moderation_decisions WHERE admin_id=$1", [
        userId,
      ]);
      await c.query(
        "DELETE FROM support_issues WHERE user_id=$1 OR order_id=ANY($2::text[])",
        [userId, ids],
      );
      await c.query(
        "DELETE FROM payment_events WHERE order_id=ANY($1::text[])",
        [ids],
      );
      await c.query(
        "DELETE FROM invitations WHERE owner_id=$1 OR claimed_by=$1",
        [userId],
      );
      await c.query(
        "DELETE FROM profiles WHERE seat_id IN (SELECT id FROM seats WHERE owner_id=$1)",
        [userId],
      );
      await c.query(
        "UPDATE seats SET state='available',owner_id=NULL,order_id=NULL,reservation_id=NULL,hold_expires_at=NULL WHERE owner_id=$1 OR order_id=ANY($2::text[])",
        [userId, ids],
      );
      await c.query("DELETE FROM reservations WHERE user_id=$1", [userId]);
      await c.query("DELETE FROM order_items WHERE order_id=ANY($1::text[])", [
        ids,
      ]);
      await c.query("DELETE FROM orders WHERE user_id=$1", [userId]);
      await c.query('DELETE FROM "user" WHERE id=$1', [userId]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  await rm(
    path.join(
      process.env.DEV_DATA_DIR ||
        path.resolve(process.cwd(), "..", ".seat-at-internet-data"),
      "dev-mail",
      `${createHash("sha256").update(email).digest("hex")}.json`,
    ),
    { force: true },
  );
  await pool.end();
});

test("Better Auth verifies a one-time email link and creates a real verified session", async () => {
  const sent = await getAuth().handler(
    request("/api/auth/sign-in/magic-link", {
      email,
      name: "API Guest",
      callbackURL: "/account",
    }),
  );
  assert.equal(sent.status, 200, await sent.text());
  const messages = await readDevInbox(email);
  assert.equal(messages.length, 1);
  const limits = await pool.query(
    'SELECT count(*)::int AS count FROM "rateLimit" WHERE "count">0 AND "lastRequest">$1',
    [Date.now() - 60_000],
  );
  assert.ok(
    limits.rows[0].count > 0,
    "Authentication limits must persist in PostgreSQL across server instances.",
  );
  const verified = await getAuth().handler(new Request(messages[0].url));
  assert.ok([200, 302, 303].includes(verified.status));
  cookie = verified.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
  assert.match(cookie, /session_token=/);
  const account = await ownerData(request("/api/me", undefined, { cookie }));
  assert.equal(account.status, 200);
  const data = await account.json();
  assert.equal(data.user.email, email);
  assert.equal(data.user.emailVerified, true);
  userId = data.user.id;
  const replay = await getAuth().handler(new Request(messages[0].url));
  assert.doesNotMatch(
    replay.headers.get("set-cookie") || "",
    /session_token=[^;]+/,
    "An email verification link must be consumed exactly once.",
  );
});

test("checkout requires authentication and rejects a foreign request origin", async () => {
  const unauthenticated = await checkout(
    request("/api/checkout", { packageId: "one", seatIds: [7001], profile }),
  );
  assert.equal(unauthenticated.status, 401);
  const foreign = await checkout(
    request(
      "/api/checkout",
      { packageId: "one", seatIds: [7001], profile },
      { cookie, origin: "https://malicious.invalid" },
    ),
  );
  assert.equal(foreign.status, 403);
});

test("development checkout is explicit, server-priced, fulfilled without any redirect, and owner-protected", async () => {
  const response = await checkout(
    request(
      "/api/checkout",
      { packageId: "one", seatIds: [7001], profile, amount: 1 },
      { cookie },
    ),
  );
  assert.equal(response.status, 200, await response.clone().text());
  const data = await response.json();
  orderId = data.orderId;
  assert.equal(data.mode, "development");
  assert.equal(data.order.amount, 500);
  const paid = await developmentPay(
    request("/api/dev/pay", { orderId, outcome: "paid" }, { cookie }),
  );
  assert.equal(paid.status, 200, await paid.clone().text());
  assert.equal((await getOrder(userId, orderId)).status, "paid");
  const own = await ownerData(request("/api/me", undefined, { cookie }));
  const mine = await own.json();
  assert.equal(
    mine.seats.find((x: { seatId: number }) => x.seatId === 7001).profile
      .visibility,
    "pending",
  );
  const administratorOnly = await administrator(
    request("/api/admin", undefined, { cookie }),
  );
  assert.equal(administratorOnly.status, 403);
  const unauthorized = await editGuest(
    new Request(`${origin}/api/seats/1`, {
      method: "PUT",
      headers: { origin, cookie, "content-type": "application/json" },
      body: JSON.stringify(profile),
    }),
    { params: Promise.resolve({ id: "1" }) },
  );
  assert.equal(unauthorized.status, 403);
});

test("verified Stripe webhook fulfills exact inventory once and invalid signatures cannot alter it", async () => {
  const previousKey = process.env.STRIPE_SECRET_KEY,
    previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  // Synthetic signing fixtures, never sent to Stripe or used to charge a card.
  process.env.STRIPE_SECRET_KEY = "sk_test_offline_signature_fixture";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_offline_signature_fixture";
  try {
    const order = await createOrder(userId, {
      packageId: "one",
      seatIds: [7003],
      profile,
      provider: "stripe",
    });
    stripeOrderId = order.id;
    const event = {
      id: `evt_offline_${randomUUID()}`,
      object: "event",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `cs_test_${randomUUID()}`,
          object: "checkout.session",
          metadata: { order_id: order.id },
          client_reference_id: order.id,
          payment_status: "paid",
          amount_total: 500,
          currency: "usd",
          payment_intent: null,
        },
      },
    };
    const payload = JSON.stringify(event);
    const invalid = await webhook(
      new Request(`${origin}/api/webhooks/stripe`, {
        method: "POST",
        body: payload,
        headers: { "stripe-signature": "invalid" },
      }),
    );
    assert.equal(invalid.status, 400);
    assert.equal((await getOrder(userId, order.id)).status, "checkout_pending");
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    const apply = () =>
      webhook(
        new Request(`${origin}/api/webhooks/stripe`, {
          method: "POST",
          body: payload,
          headers: { "stripe-signature": signature },
        }),
      );
    const valid = await apply();
    assert.equal(valid.status, 200, await valid.clone().text());
    assert.equal((await getOrder(userId, order.id)).status, "paid");
    const duplicate = await apply();
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).result.duplicate, true);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM payment_events WHERE id=$1",
          [event.id],
        )
      ).rows[0].count,
      1,
    );
  } finally {
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousKey;
    if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  }
});

test("public table responses have bounded cache and expose no private owner fields", async () => {
  const response = await table(request("/api/table?start=7001&end=7003"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") || "", /s-maxage=5/);
  const data = await response.json();
  assert.ok(Array.isArray(data.guests));
  assert.ok(Array.isArray(data.seats));
  assert.equal(JSON.stringify(data).includes(email), false);
  assert.ok(
    data.guests.every(
      (x: Record<string, unknown>) =>
        !("email" in x) && !("ownerId" in x) && !("payment" in x),
    ),
  );
});

test("forged forwarding headers cannot rotate anonymous abuse identity without a verified edge", () => {
  const oldTrust = process.env.TRUST_PROXY_HEADERS,
    oldVerified = process.env.TRUSTED_PROXY_VERIFIED;
  const headers = (real: string, forwarded: string) =>
    new Request(`${origin}/api/seats/1/bread`, {
      headers: { "x-real-ip": real, "x-forwarded-for": forwarded },
    });
  try {
    process.env.TRUST_PROXY_HEADERS = "false";
    process.env.TRUSTED_PROXY_VERIFIED = "false";
    assert.equal(
      actorHash(headers("192.0.2.1", "203.0.113.1")),
      actorHash(headers("192.0.2.2", "203.0.113.2")),
    );
    process.env.TRUST_PROXY_HEADERS = "true";
    assert.equal(
      actorHash(headers("192.0.2.1", "203.0.113.1")),
      actorHash(headers("192.0.2.2", "203.0.113.2")),
      "Both explicit trust flags are required.",
    );
    process.env.TRUSTED_PROXY_VERIFIED = "true";
    assert.notEqual(
      actorHash(headers("192.0.2.1", "203.0.113.1")),
      actorHash(headers("192.0.2.2", "203.0.113.1")),
    );
    assert.equal(
      actorHash(headers("192.0.2.1", "203.0.113.1")),
      actorHash(headers("192.0.2.1", "203.0.113.2")),
      "Never accept an X-Forwarded-For chain as the client identity.",
    );
    assert.equal(
      actorHash(headers("not-an-ip", "1.1.1.1")),
      actorHash(headers("also-not-an-ip", "8.8.8.8")),
    );
  } finally {
    if (oldTrust === undefined) delete process.env.TRUST_PROXY_HEADERS;
    else process.env.TRUST_PROXY_HEADERS = oldTrust;
    if (oldVerified === undefined) delete process.env.TRUSTED_PROXY_VERIFIED;
    else process.env.TRUSTED_PROXY_VERIFIED = oldVerified;
  }
});

test("local payment controls cannot pay an expired or failed checkout", async () => {
  const expired = await createOrder(userId, {
    packageId: "one",
    seatIds: [7005],
    profile,
    provider: "development",
  });
  await pool.query(
    "UPDATE orders SET checkout_expires_at=now()-interval '1 minute' WHERE id=$1",
    [expired.id],
  );
  const tooLate = await developmentPay(
    request(
      "/api/dev/pay",
      { orderId: expired.id, outcome: "paid" },
      { cookie },
    ),
  );
  assert.equal(tooLate.status, 409);
  assert.equal((await getOrder(userId, expired.id)).status, "expired");
  assert.equal(
    (await pool.query("SELECT state FROM seats WHERE id=7005")).rows[0].state,
    "available",
  );
  const failed = await createOrder(userId, {
    packageId: "one",
    seatIds: [7007],
    profile,
    provider: "development",
  });
  const decline = await developmentPay(
    request(
      "/api/dev/pay",
      { orderId: failed.id, outcome: "failed" },
      { cookie },
    ),
  );
  assert.equal(decline.status, 200);
  const paidAfterFailure = await developmentPay(
    request(
      "/api/dev/pay",
      { orderId: failed.id, outcome: "paid" },
      { cookie },
    ),
  );
  assert.equal(paidAfterFailure.status, 409);
  assert.equal((await getOrder(userId, failed.id)).status, "failed");
});

test("a provider-confirmed live credential can never be treated as a test checkout", () => {
  const previous = process.env.STRIPE_MODE;
  try {
    process.env.STRIPE_MODE = "test";
    assert.throws(() => assertCheckoutMode(true), /mode does not match/);
    assert.doesNotThrow(() => assertCheckoutMode(false));
  } finally {
    if (previous === undefined) delete process.env.STRIPE_MODE;
    else process.env.STRIPE_MODE = previous;
  }
});

test("hosted checkout retry retains identical expiry and reuses an attached provider session", async () => {
  const previousKey = process.env.STRIPE_SECRET_KEY,
    previousMode = process.env.STRIPE_MODE;
  process.env.STRIPE_SECRET_KEY = "sk_test_offline_retry_fixture";
  process.env.STRIPE_MODE = "test";
  const stripe = getStripe(),
    oldCreate = stripe.checkout.sessions.create,
    oldRetrieve = stripe.checkout.sessions.retrieve;
  const clock = Date.now;
  try {
    const order = await createOrder(userId, {
      packageId: "one",
      seatIds: [7009],
      profile,
      provider: "stripe",
    });
    const calls: Stripe.Checkout.SessionCreateParams[] = [];
    const sessionId = `cs_test_offline_${randomUUID()}`;
    const fakeSession = {
      id: sessionId,
      status: "open",
      livemode: false,
      metadata: { order_id: order.id },
      amount_total: 500,
      currency: "usd",
      url: "https://checkout.stripe.com/offline-fixture",
      expires_at: Math.floor(
        new Date(order.checkoutExpiresAt).getTime() / 1000,
      ),
    } as unknown as Stripe.Checkout.Session;
    stripe.checkout.sessions.create = (async (
      params: Stripe.Checkout.SessionCreateParams,
    ) => {
      calls.push(params);
      if (calls.length === 1)
        throw new Error("Simulated ambiguous provider timeout");
      return fakeSession;
    }) as typeof oldCreate;
    stripe.checkout.sessions.retrieve = (async () =>
      fakeSession) as unknown as typeof oldRetrieve;
    await assert.rejects(
      createHostedCheckout(order, email),
      /ambiguous provider timeout/,
    );
    Date.now = () => clock() + 10_000;
    const resumed = await createHostedCheckout(order, email);
    assert.equal(resumed.id, sessionId);
    assert.equal(calls.length, 2);
    assert.equal(
      calls[0].expires_at,
      calls[1].expires_at,
      "Provider retries must preserve the original idempotent request.",
    );
    assert.equal(calls[1].expires_at, fakeSession.expires_at);
    assert.equal((await createHostedCheckout(order, email)).id, sessionId);
    assert.equal(
      calls.length,
      2,
      "Once attached, resume retrieves the exact session instead of creating another.",
    );
  } finally {
    Date.now = clock;
    stripe.checkout.sessions.create = oldCreate;
    stripe.checkout.sessions.retrieve = oldRetrieve;
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousKey;
    if (previousMode === undefined) delete process.env.STRIPE_MODE;
    else process.env.STRIPE_MODE = previousMode;
  }
});

test("an opaque proxy credential confirmed live cannot create a checkout while declared test", async () => {
  const previousKey = process.env.STRIPE_SECRET_KEY,
    previousMode = process.env.STRIPE_MODE;
  process.env.STRIPE_SECRET_KEY = "offline_proxy_placeholder";
  process.env.STRIPE_MODE = "test";
  const stripe = getStripe(),
    oldBalance = stripe.balance.retrieve,
    oldCreate = stripe.checkout.sessions.create;
  let attemptedCreates = 0;
  try {
    stripe.balance.retrieve = (async () => ({
      livemode: true,
    })) as typeof oldBalance;
    stripe.checkout.sessions.create = (async () => {
      attemptedCreates++;
      throw new Error("Checkout must not be reached");
    }) as unknown as typeof oldCreate;
    await assert.rejects(
      createHostedCheckout(
        {
          id: "offline-not-real",
          amount: 500,
          currency: "usd",
          packageId: "one",
          seatIds: [7011],
        },
        email,
      ),
      /mode does not match/,
    );
    assert.equal(attemptedCreates, 0);
  } finally {
    stripe.balance.retrieve = oldBalance;
    stripe.checkout.sessions.create = oldCreate;
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousKey;
    if (previousMode === undefined) delete process.env.STRIPE_MODE;
    else process.env.STRIPE_MODE = previousMode;
  }
});

test("a signed event for a different checkout session cannot fulfill an attached order", async () => {
  const previousKey = process.env.STRIPE_SECRET_KEY,
    previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = "sk_test_offline_binding_fixture";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_offline_binding_fixture";
  try {
    const order = await createOrder(userId, {
      packageId: "one",
      seatIds: [7011],
      profile,
      provider: "stripe",
    });
    await attachCheckout(
      order.id,
      `cs_test_expected_${randomUUID()}`,
      new Date(Date.now() + 35 * 60_000),
    );
    const event = {
      id: `evt_offline_${randomUUID()}`,
      object: "event",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `cs_test_different_${randomUUID()}`,
          object: "checkout.session",
          metadata: { order_id: order.id },
          payment_status: "paid",
          amount_total: 500,
          currency: "usd",
        },
      },
    };
    const payload = JSON.stringify(event),
      signature = Stripe.webhooks.generateTestHeaderString({
        payload,
        secret: process.env.STRIPE_WEBHOOK_SECRET,
      });
    const response = await webhook(
      new Request(`${origin}/api/webhooks/stripe`, {
        method: "POST",
        body: payload,
        headers: { "stripe-signature": signature },
      }),
    );
    assert.equal(
      response.status,
      500,
      "A verified but mismatched provider event needs retry/review, never fulfillment.",
    );
    assert.equal((await getOrder(userId, order.id)).status, "checkout_pending");
    assert.equal(
      (await pool.query("SELECT state FROM seats WHERE id=7011")).rows[0].state,
      "checkout_held",
    );
  } finally {
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousKey;
    if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  }
});

test("payment receipts require the verified owner and development orders never contact a provider", async () => {
  const params = { params: Promise.resolve({ id: orderId }) };
  const unauthenticated = await receipt(
    request(`/api/orders/${orderId}/receipt`),
    params,
  );
  assert.equal(unauthenticated.status, 401);
  const previousKey = process.env.STRIPE_SECRET_KEY;
  try {
    delete process.env.STRIPE_SECRET_KEY;
    const development = await receipt(
      request(`/api/orders/${orderId}/receipt`, undefined, { cookie }),
      params,
    );
    assert.equal(development.status, 409);
    assert.match((await development.json()).error, /no payment receipt/);
    const otherOrder = await receipt(
      request("/api/orders/not-an-owned-order/receipt", undefined, { cookie }),
      { params: Promise.resolve({ id: "not-an-owned-order" }) },
    );
    assert.equal(otherOrder.status, 404);
  } finally {
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousKey;
  }
});

test("the owned paid order redirects to its verified HTTPS Stripe receipt and rejects unsafe provider links", async () => {
  const previousKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_offline_receipt_fixture";
  const stripe = getStripe(),
    oldRetrieve = stripe.paymentIntents.retrieve;
  try {
    await pool.query("UPDATE orders SET payment_intent_id=$2 WHERE id=$1", [
      stripeOrderId,
      `pi_offline_${randomUUID()}`,
    ]);
    let address = "https://pay.stripe.com/receipts/offline-fixture";
    stripe.paymentIntents.retrieve = (async () => ({
      latest_charge: { receipt_url: address },
    })) as unknown as typeof oldRetrieve;
    const params = { params: Promise.resolve({ id: stripeOrderId }) };
    const response = await receipt(
      request(`/api/orders/${stripeOrderId}/receipt`, undefined, { cookie }),
      params,
    );
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), address);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    address = "https://stripe.com.attacker.invalid/receipts/unsafe";
    const unsafe = await receipt(
      request(`/api/orders/${stripeOrderId}/receipt`, undefined, { cookie }),
      params,
    );
    assert.equal(unsafe.status, 502);
    assert.equal(unsafe.headers.get("location"), null);
  } finally {
    stripe.paymentIntents.retrieve = oldRetrieve;
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousKey;
  }
});
