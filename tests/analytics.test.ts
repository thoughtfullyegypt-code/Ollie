import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { pool, transaction } from "../lib/db";
import { migrate } from "../lib/db/migrate";
import {
  attributionSchema,
  recordJourneyEvent,
  ingestClientEvent,
  publicAnalyticsConfig,
  sanitizeAttribution,
  getJourneySummary,
} from "../lib/analytics";
import { POST as clientRoute } from "../app/api/events/route";

const run = randomUUID(),
  userA = `journey-${run}-a`,
  userB = `journey-${run}-b`,
  admin = `journey-${run}-admin`,
  ownerOrder = randomUUID(),
  buyerOrder = randomUUID(),
  unpaidOrder = randomUUID(),
  invitationId = randomUUID(),
  keySuffix = randomUUID();
const eventIds: string[] = [];
let usedSourceSeat = false;
const sourceSeat = 9801;
const attribution = {
  source: "newsletter",
  medium: "email",
  campaign: "autumn-dinner",
  referralId: invitationId,
  capturedAt: new Date().toISOString(),
};
function eventBody(name = "builder_opened") {
  const id = randomUUID();
  eventIds.push(id);
  return {
    name,
    eventId: id,
    properties: { placement: "hero" },
    attribution: {
      source: "editorial",
      campaign: "test-analytics",
      capturedAt: new Date().toISOString(),
    },
  };
}
before(async () => {
  assert.equal(process.env.APP_MODE, "development");
  await migrate();
  for (const [id, role] of [
    [userA, "user"],
    [userB, "user"],
    [admin, "admin"],
  ])
    await pool.query(
      'INSERT INTO "user"(id,name,email,"emailVerified",role) VALUES($1,$2,$3,true,$4)',
      [id, "Journey test", `${id}@example.test`, role],
    );
  const template = {
    displayName: "A fixture only",
    message: "",
    dish: "soup",
    customization: {
      base: "human",
      accessory: "none",
      outfit: "signature",
      skin: "#bd805a",
      color: "#9aab91",
    },
  };
  for (const [id, owner, status, attr] of [
    [ownerOrder, userA, "paid", {}],
    [buyerOrder, userB, "paid", attribution],
    [unpaidOrder, userB, "checkout_pending", {}],
  ] as const)
    await pool.query(
      "INSERT INTO orders(id,user_id,package_id,amount,currency,status,provider,profile_draft,is_demo,attribution) VALUES($1,$2,'one',500,'usd',$3,'development',$4,true,$5)",
      [id, owner, status, JSON.stringify(template), JSON.stringify(attr)],
    );
  const available = await pool.query(
    "SELECT id FROM seats WHERE id=$1 AND state='available'",
    [sourceSeat],
  );
  assert.equal(
    available.rowCount,
    1,
    "Analytics fixture seat must be available; never overwrite a purchased seat.",
  );
  await pool.query(
    "UPDATE seats SET state='purchased',owner_id=$2,order_id=$3 WHERE id=$1",
    [sourceSeat, userA, ownerOrder],
  );
  usedSourceSeat = true;
  await pool.query(
    "INSERT INTO invitations(id,token_hash,type,source_seat_id,target_seat_id,owner_id,status,expires_at,created_at) VALUES($1,$2,'paid',$3,$3,$4,'claimed',now()+interval '1 day',now()-interval '1 day')",
    [invitationId, `fixture-${run}`, sourceSeat, userA],
  );
});
after(async () => {
  await pool.query(
    "DELETE FROM analytics_events WHERE attribution->>'campaign' IN ('autumn-dinner','test-analytics') OR event_key=ANY($1::text[])",
    [eventIds.map((x) => `client:${x}`)],
  );
  // Server records are deliberately not foreign-keyed; clean only this suite's
  // generated hashed references and invitation/property fixtures.
  await pool.query(
    "DELETE FROM analytics_events WHERE properties->>'seatId'=$1",
    [String(sourceSeat)],
  );
  await pool.query(
    "DELETE FROM analytics_events WHERE order_key IS NOT NULL AND attribution='{}'::jsonb AND name IN ('order_fulfilled','referred_purchase_fulfilled') AND created_at>now()-interval '10 minutes' AND properties->>'packageId'='one' AND order_key IN (SELECT encode(sha256(convert_to('order:'||id,'UTF8')),'hex') FROM orders WHERE id=ANY($1::text[]))",
    [[ownerOrder, buyerOrder, unpaidOrder]],
  );
  await pool.query("DELETE FROM invitations WHERE id=$1", [invitationId]);
  if (usedSourceSeat)
    await pool.query(
      "UPDATE seats SET state='available',owner_id=NULL,order_id=NULL WHERE id=$1 AND owner_id=$2",
      [sourceSeat, userA],
    );
  await pool.query("DELETE FROM orders WHERE id=ANY($1::text[])", [
    [ownerOrder, buyerOrder, unpaidOrder],
  ]);
  await pool.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [
    [userA, userB, admin],
  ]);
  await pool.end();
});

test("client ingestion refuses server purchase claims and private payload fields", async () => {
  const input = eventBody();
  await assert.rejects(() =>
    ingestClientEvent(
      { ...input, name: "order_fulfilled" },
      { abuseKey: keySuffix },
    ),
  );
  await assert.rejects(() =>
    ingestClientEvent(
      { ...input, properties: { email: "person@example.test" } },
      { abuseKey: keySuffix },
    ),
  );
  await assert.rejects(() =>
    ingestClientEvent(
      { ...input, attribution: { invite: "synthetic-private-token" } },
      { abuseKey: keySuffix },
    ),
  );
  assert.equal(
    attributionSchema.safeParse({ referralId: "synthetic-private-token" })
      .success,
    false,
  );
});
test("client event retries deduplicate without a visitor identifier or payment values", async () => {
  const input = eventBody();
  const first = await ingestClientEvent(input, { abuseKey: keySuffix }),
    second = await ingestClientEvent(input, { abuseKey: keySuffix });
  assert.equal(first.recorded, true);
  assert.equal(second.duplicate, true);
  const row = (
    await pool.query("SELECT * FROM analytics_events WHERE event_key=$1", [
      `client:${input.eventId}`,
    ])
  ).rows[0];
  assert.equal(row.source, "client");
  assert.equal(row.is_development, true);
  assert.equal(row.order_key, null);
  assert.equal(row.invitation_key, null);
  assert.deepEqual(row.properties, { placement: "hero" });
  assert.equal(JSON.stringify(row).includes("person@example.test"), false);
});
test("confirmed fulfillment deduplicates by order and records only valid referred purchases", async () => {
  const result = await transaction(async (c) => {
    const a = await recordJourneyEvent(c, {
      name: "order_fulfilled",
      orderId: buyerOrder,
      properties: {
        seatId: sourceSeat,
        email: "not-stored@example.test",
        amount: 500,
        token: "synthetic-private-token",
      },
    });
    const duplicate = await recordJourneyEvent(c, {
      name: "order_fulfilled",
      orderId: buyerOrder,
      eventKey: "a-different-webhook",
    });
    const rejected = await recordJourneyEvent(c, {
      name: "order_fulfilled",
      orderId: unpaidOrder,
    });
    return { a, duplicate, rejected };
  });
  assert.equal(result.a.recorded, true);
  assert.equal(result.duplicate.duplicate, true);
  assert.equal(result.rejected.recorded, false);
  const rows = (
    await pool.query(
      "SELECT * FROM analytics_events WHERE attribution->>'campaign'='autumn-dinner' ORDER BY name",
    )
  ).rows;
  assert.deepEqual(
    rows.map((r) => r.name),
    ["order_fulfilled", "referred_purchase_fulfilled"],
  );
  for (const row of rows) {
    assert.equal(JSON.stringify(row).includes(buyerOrder), false);
    assert.equal(
      JSON.stringify(row).includes("synthetic-private-token"),
      false,
    );
    assert.equal(
      JSON.stringify(row).includes("not-stored@example.test"),
      false,
    );
    assert.equal(Object.hasOwn(row.properties, "amount"), false);
    assert.equal(row.order_key.length, 64);
  }
});
test("paid claims require actual claimed invitations and are deduplicated", async () => {
  const a = await transaction((c) =>
    recordJourneyEvent(c, {
      name: "paid_group_seat_claimed",
      invitationId,
      properties: { seatId: sourceSeat },
    }),
  );
  const b = await transaction((c) =>
    recordJourneyEvent(c, {
      name: "paid_group_seat_claimed",
      invitationId,
      properties: { seatId: sourceSeat },
    }),
  );
  assert.equal(a.recorded, true);
  assert.equal(b.duplicate, true);
  await pool.query("UPDATE invitations SET status='revoked' WHERE id=$1", [
    invitationId,
  ]);
  const invalid = await transaction((c) =>
    recordJourneyEvent(c, {
      name: "paid_group_seat_claimed",
      invitationId: randomUUID(),
    }),
  );
  assert.equal(invalid.recorded, false);
  await pool.query("UPDATE invitations SET status='claimed' WHERE id=$1", [
    invitationId,
  ]);
});
test("privacy signals and production consent gates suppress browser events while operational outcomes remain auditable", async () => {
  const previous = {
    mode: process.env.APP_MODE,
    enabled: process.env.ANALYTICS_ENABLED,
    approved: process.env.ANALYTICS_PRIVACY_APPROVED,
  };
  try {
    assert.equal(
      (
        await ingestClientEvent(eventBody(), {
          abuseKey: keySuffix,
          privacySignal: true,
        })
      ).recorded,
      false,
    );
    process.env.APP_MODE = "production";
    delete process.env.ANALYTICS_ENABLED;
    delete process.env.ANALYTICS_PRIVACY_APPROVED;
    assert.equal(publicAnalyticsConfig().enabled, false);
    assert.equal(
      (await ingestClientEvent(eventBody(), { abuseKey: keySuffix })).recorded,
      false,
    );
    process.env.ANALYTICS_ENABLED = "true";
    process.env.ANALYTICS_PRIVACY_APPROVED = "true";
    assert.equal(
      (await ingestClientEvent(eventBody(), { abuseKey: keySuffix })).recorded,
      false,
    );
    assert.equal(
      (
        await ingestClientEvent(
          { ...eventBody(), consent: true },
          { abuseKey: keySuffix },
        )
      ).recorded,
      true,
    );
    assert.equal(
      (
        await transaction((c) =>
          recordJourneyEvent(c, {
            name: "order_fulfilled",
            orderId: ownerOrder,
          }),
        )
      ).recorded,
      true,
    );
  } finally {
    for (const [key, value] of Object.entries({
      APP_MODE: previous.mode,
      ANALYTICS_ENABLED: previous.enabled,
      ANALYTICS_PRIVACY_APPROVED: previous.approved,
    }))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});
test("anonymous event endpoint enforces same origin and admin summaries require authorization", async () => {
  const input = eventBody();
  const foreign = await clientRoute(
    new Request("http://localhost:3000/api/events", {
      method: "POST",
      headers: {
        origin: "https://foreign.example",
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    }),
  );
  assert.equal(foreign.status, 403);
  await assert.rejects(() => getJourneySummary(userA), { status: 403 });
  const summary = await getJourneySummary(admin);
  assert.ok(Array.isArray(summary.counts));
  assert.equal(summary.thirdPartyRequests, false);
  assert.equal(summary.serverOperationalEvents, true);
});
test("attribution expires after 30 days and ignores private keys rather than allowing them into order analytics", () => {
  assert.deepEqual(
    sanitizeAttribution({
      source: "newsletter",
      capturedAt: new Date(Date.now() - 31 * 86400000).toISOString(),
    }),
    {},
  );
  assert.deepEqual(
    sanitizeAttribution({ source: "newsletter", email: "person@example.test" }),
    {},
  );
  assert.deepEqual(
    sanitizeAttribution({ source: "newsletter", referralId: invitationId }),
    { source: "newsletter", referralId: invitationId },
  );
  const capturedAt = new Date(Date.now() - 31 * 86400000).toISOString();
  assert.deepEqual(
    sanitizeAttribution(
      { source: "newsletter", capturedAt },
      new Date(Date.now() - 2 * 86400000),
    ),
    { source: "newsletter", capturedAt },
    "A delayed fulfillment uses the checkout timestamp to retain attribution that was valid at purchase.",
  );
});

test("first nonempty anonymous attribution survives a sign-in page reload without recording claim tokens", async () => {
  const originalFetch = globalThis.fetch,
    originalNavigator = Object.getOwnPropertyDescriptor(
      globalThis,
      "navigator",
    ),
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window"),
    originalStorage = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
  const values = new Map<string, string>(),
    posts: Record<string, unknown>[] = [],
    requests: RequestInit[] = [];
  const storage = {
    getItem: (k: string) => values.get(k) || null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  };
  const browserWindow = {
    location: {
      search: `?utm_source=letter&utm_campaign=autumn&ref=${invitationId}&invite=SYNTHETIC_PRIVATE_TOKEN&email=person%40example.test`,
    },
    dispatchEvent: () => true,
  };
  let production = false;
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { doNotTrack: "0", globalPrivacyControl: false },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: browserWindow,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
    });
    globalThis.fetch = async (_url, options) => {
      requests.push(options || {});
      if (options?.method === "POST")
        posts.push(JSON.parse(String(options.body)));
      return Response.json(
        options?.method === "POST"
          ? { recorded: true }
          : {
              enabled: true,
              consentRequired: production,
              adapter: production ? "first-party" : "development",
            },
      );
    };
    const src = await readFile(
      new URL("../components/journey-events.ts", import.meta.url),
      "utf8",
    );
    const js = ts.transpileModule(src, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const load = () =>
      import(
        `data:text/javascript;base64,${Buffer.from(js + "\n//" + randomUUID()).toString("base64")}`
      );
    const anonymous = await load();
    await anonymous.track("builder_opened", { placement: "hero" });
    assert.equal(anonymous.getAttribution().source, "letter");
    browserWindow.location.search = "?utm_source=later-campaign&checkout=1";
    const authenticated = await load();
    await authenticated.track("checkout_started", { packageId: "one" });
    assert.equal(authenticated.getAttribution().source, "letter");
    assert.equal(authenticated.getAttribution().referralId, invitationId);
    for (const payload of posts) {
      const encoded = JSON.stringify(payload);
      assert.equal(encoded.includes("SYNTHETIC_PRIVATE_TOKEN"), false);
      assert.equal(encoded.includes("person@example.test"), false);
    }
    assert.ok(
      requests.every(
        (r) => r.referrerPolicy === "no-referrer" && r.credentials === "omit",
      ),
    );
    values.clear();
    browserWindow.location.search = "?invite=SYNTHETIC_PRIVATE_TOKEN";
    const invitedBrowser = await load();
    await invitedBrowser.track("builder_opened");
    assert.equal(invitedBrowser.getAttribution(), undefined);
    invitedBrowser.captureReferral(invitationId);
    await invitedBrowser.track("invitation_link_opened", {
      invitationType: "paid",
    });
    assert.equal(invitedBrowser.getAttribution().referralId, invitationId);
    invitedBrowser.captureReferral(randomUUID());
    await invitedBrowser.track("share_action_invoked", { method: "copy" });
    assert.equal(invitedBrowser.getAttribution().referralId, invitationId);
    values.clear();
    production = true;
    const privateBrowser = await load();
    await privateBrowser.track("builder_opened");
    assert.equal(values.size, 0);
    const before = posts.length;
    privateBrowser.setJourneyConsent("granted");
    await privateBrowser.track("checkout_started");
    assert.equal(posts.length, before + 1);
    privateBrowser.setJourneyConsent("denied");
    assert.equal(privateBrowser.getAttribution(), undefined);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of [
      ["navigator", originalNavigator],
      ["window", originalWindow],
      ["localStorage", originalStorage],
    ] as const)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
  }
});
