import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { Pool } from "pg";
import { randomUUID, createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
const runId = randomUUID().slice(0, 8),
  ownerEmail = `account-${runId}@example.test`,
  friendEmail = `friend-${runId}@example.test`;
const profile = {
  displayName: `Dinner QA ${runId}`,
  message: "I brought soup and a healthy respect for transactions.",
  dish: "soup",
  customization: {
    base: "detective",
    accessory: "beret",
    outfit: "suit",
    skin: "#bd805a",
    color: "#b2bf95",
  },
};
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const userIds: string[] = [];
let ownerContext: BrowserContext,
  friendContext: BrowserContext,
  adminContext: BrowserContext;
let owner: Page,
  friend: Page,
  admin: Page,
  primarySeat = 0,
  groupSeat = 0,
  token = "",
  oldToken = "",
  orderId = "";
async function signIn(page: Page, email: string, name: string) {
  await page.goto("/account");
  await page.getByLabel("What should we call you?").fill(name);
  await page.getByLabel("Email address").fill(email);
  await page
    .getByRole("button", { name: "Send me a sign-in link", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open sign-in link", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Open sign-in link", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Welcome back,/ }),
  ).toBeVisible();
  const me = await (await page.request.get("/api/me")).json();
  expect(me.user.email).toBe(email);
}
async function post(page: Page, url: string, data: unknown) {
  const response = await page.request.post(url, {
    data,
    headers: { origin: "http://localhost:3000" },
  });
  expect(
    response.ok(),
    `${url}: ${response.status()} ${await response.text()}`,
  ).toBeTruthy();
  return response.json();
}
async function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}
test.describe.serial("Owner and protected host workflow", () => {
  test.beforeAll(async ({ browser }) => {
    ownerContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    owner = await ownerContext.newPage();
    friendContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    friend = await friendContext.newPage();
    adminContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    admin = await adminContext.newPage();
  });
  test.afterAll(async () => {
    const result = await pool.query(
      'SELECT id FROM "user" WHERE email=ANY($1::text[])',
      [[ownerEmail, friendEmail]],
    );
    userIds.push(...result.rows.map((x) => x.id));
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const orders = (
        await c.query("SELECT id FROM orders WHERE user_id=ANY($1::text[])", [
          userIds,
        ])
      ).rows.map((x) => x.id);
      const seats = (
        await c.query(
          "SELECT id FROM seats WHERE owner_id=ANY($1::text[]) OR order_id=ANY($2::text[])",
          [userIds, orders],
        )
      ).rows.map((x) => x.id);
      await c.query("DELETE FROM reports WHERE seat_id=ANY($1::int[])", [
        seats,
      ]);
      await c.query("DELETE FROM reactions WHERE seat_id=ANY($1::int[])", [
        seats,
      ]);
      await c.query(
        "DELETE FROM audit_events WHERE actor_id=ANY($1::text[]) OR target=ANY($2::text[]) OR target=ANY($3::text[])",
        [userIds, orders, seats.map(String)],
      );
      await c.query(
        "DELETE FROM moderation_decisions WHERE seat_id=ANY($1::int[])",
        [seats],
      );
      await c.query(
        "DELETE FROM support_issues WHERE user_id=ANY($1::text[]) OR order_id=ANY($2::text[])",
        [userIds, orders],
      );
      await c.query(
        "DELETE FROM payment_events WHERE order_id=ANY($1::text[])",
        [orders],
      );
      await c.query(
        "DELETE FROM invitations WHERE owner_id=ANY($1::text[]) OR claimed_by=ANY($1::text[])",
        [userIds],
      );
      await c.query("DELETE FROM profiles WHERE seat_id=ANY($1::int[])", [
        seats,
      ]);
      await c.query(
        "UPDATE seats SET state='available',owner_id=NULL,order_id=NULL,reservation_id=NULL,hold_expires_at=NULL WHERE id=ANY($1::int[])",
        [seats],
      );
      await c.query("DELETE FROM reservations WHERE user_id=ANY($1::text[])", [
        userIds,
      ]);
      await c.query("DELETE FROM order_items WHERE order_id=ANY($1::text[])", [
        orders,
      ]);
      await c.query("DELETE FROM orders WHERE id=ANY($1::text[])", [orders]);
      await c.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [userIds]);
      await c.query("COMMIT");
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
    for (const email of [ownerEmail, friendEmail])
      await rm(
        path.join(
          process.env.DEV_DATA_DIR ||
            path.resolve(process.cwd(), "..", ".seat-at-internet-data"),
          "dev-mail",
          `${createHash("sha256").update(email).digest("hex")}.json`,
        ),
        { force: true },
      );
    await ownerContext?.close();
    await friendContext?.close();
    await adminContext?.close();
    await pool.end();
  });
  test("owner signs in with a verified magic link, purchases a group and edits the primary guest", async () => {
    const errors = await captureErrors(owner);
    await signIn(owner, ownerEmail, "Account Friend");
    const available = await owner.request.get(
      "/api/available?count=2&near=8101",
    );
    expect(available.ok()).toBeTruthy();
    const selection = await available.json();
    [primarySeat, groupSeat] = selection.seatIds;
    const order = await post(owner, "/api/checkout", {
      packageId: "two",
      seatIds: selection.seatIds,
      profile,
    });
    orderId = order.orderId;
    await post(owner, "/api/dev/pay", { orderId, outcome: "paid" });
    await owner.reload();
    await expect(
      owner.getByRole("heading", { name: profile.displayName, exact: true }),
    ).toBeVisible();
    const card = owner.locator(".owned-seat").filter({
      has: owner.getByRole("heading", {
        name: profile.displayName,
        exact: true,
      }),
    });
    await card.locator("summary").click();
    await card
      .getByLabel("A little dinner-table message")
      .fill("An edited message, with absolutely no suspicious links.");
    await card
      .getByRole("button", { name: "Save my guest", exact: true })
      .click();
    await expect(
      owner.getByRole("status").filter({ hasText: "Your guest is saved" }),
    ).toBeVisible();
    const state = await owner.request.get("/api/me");
    const data = await state.json();
    expect(
      data.seats.find((seat: any) => seat.seatId === primarySeat).profile
        .message,
    ).toBe("An edited message, with absolutely no suspicious links.");
    expect(
      data.seats.find((seat: any) => seat.seatId === primarySeat).profile
        .visibility,
    ).toBe("pending");
    await card.locator("summary").click();
    await owner.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    });
    await owner.screenshot({
      path: "screenshots/account-desktop.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
  test("owner creates and revokes a paid invitation, then the recipient claims the fresh link without payment", async () => {
    const emptySeat = owner.locator(".owned-seat").filter({
      has: owner.getByText(`SEAT ${groupSeat.toLocaleString()}`, {
        exact: true,
      }),
    });
    await emptySeat
      .getByRole("button", { name: "Invite to this paid seat" })
      .click();
    await expect(owner.getByLabel("Your secure invitation")).toHaveValue(
      /\/invite\//,
    );
    oldToken = (await owner.getByLabel("Your secure invitation").inputValue())
      .split("/")
      .pop()!;
    await owner
      .getByRole("button", { name: "Close invitation", exact: true })
      .click();
    await owner.getByRole("button", { name: /^Invitations/ }).click();
    await owner
      .getByRole("button", { name: "Revoke invitation" })
      .first()
      .click();
    await expect(
      owner.getByRole("status").filter({ hasText: "Invitation revoked" }),
    ).toBeVisible();
    const revoked = await owner.request.get(`/api/invitations/${oldToken}`);
    expect(revoked.status()).toBe(410);
    await owner.getByRole("button", { name: /^Your seats/ }).click();
    await emptySeat
      .getByRole("button", { name: "Invite to this paid seat" })
      .click();
    token = (await owner.getByLabel("Your secure invitation").inputValue())
      .split("/")
      .pop()!;
    await owner
      .getByRole("button", { name: "Close invitation", exact: true })
      .click();
    await signIn(friend, friendEmail, "Neighbor Friend");
    await friend.goto(`/invite/${token}`);
    await expect(
      friend.getByText("A paid group-seat invitation", { exact: true }),
    ).toBeVisible();
    await friend.getByRole("button", { name: "Claim my paid seat" }).click();
    await expect(
      friend
        .getByRole("status")
        .filter({ hasText: "The paid seat is now linked to your account" }),
    ).toBeVisible();
    await friend
      .getByRole("link", { name: "Make your guest", exact: true })
      .click();
    await expect(
      friend.getByText(`SEAT ${groupSeat.toLocaleString()}`, { exact: true }),
    ).toBeVisible();
    const data = await (await friend.request.get("/api/me")).json();
    expect(data.orders).toHaveLength(0);
    expect(data.seats.map((seat: any) => seat.seatId)).toContain(groupSeat);
    await friend.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    });
    await friend.screenshot({
      path: "screenshots/account-mobile.png",
      fullPage: true,
    });
    expect(
      await friend.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  });
  test("a normal owner is denied admin access; a host approves then hides reported content", async () => {
    await owner.goto("/admin");
    await expect(
      owner.getByRole("heading", { name: "This seat is for the hosts." }),
    ).toBeVisible();
    await signIn(admin, "admin@example.test", "Host Friend");
    await admin.goto("/admin");
    await expect(
      admin.getByRole("heading", { name: "The host’s desk." }),
    ).toBeVisible();
    await expect(
      admin.getByText("Live purchases are disabled", { exact: false }),
    ).toBeVisible();
    await admin
      .getByRole("textbox", { name: "Search seats, guests, or orders" })
      .fill(String(primarySeat));
    const review = admin.locator(".moderation-card").filter({
      has: admin.getByRole("heading", {
        name: profile.displayName,
        exact: true,
      }),
    });
    await expect(review).toBeVisible();
    await review.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(
      admin
        .getByRole("status")
        .filter({ hasText: `Seat ${primarySeat} approved` }),
    ).toBeVisible();
    const published = await admin.request.get(
      `/api/table?start=${primarySeat}&end=${primarySeat}`,
    );
    expect((await published.json()).guests).toHaveLength(1);
    await post(friend, `/api/seats/${primarySeat}/report`, {
      reason: "A test report for the host moderation workflow.",
    });
    await admin.getByRole("button", { name: "Reports", exact: true }).click();
    await admin
      .getByRole("button", { name: "Refresh current records" })
      .click();
    const report = admin
      .locator(".admin-record")
      .filter({ hasText: "A test report for the host moderation workflow." });
    await expect(report).toBeVisible();
    await report.getByRole("button", { name: "Hide content" }).click();
    await admin
      .getByLabel("Reason for the audit log")
      .fill("Reviewed the test report and hid this test profile.");
    await admin
      .getByRole("button", { name: "Confirm action", exact: true })
      .click();
    await expect(
      admin
        .getByRole("status")
        .filter({ hasText: "Administrative action saved" }),
    ).toBeVisible();
    const hidden = await admin.request.get(
      `/api/table?start=${primarySeat}&end=${primarySeat}`,
    );
    expect((await hidden.json()).guests).toHaveLength(0);
    await admin.getByRole("button", { name: "Audit log", exact: true }).click();
    await expect(
      admin
        .getByRole("cell", { name: String(primarySeat), exact: true })
        .first(),
    ).toBeVisible();
    await admin.screenshot({
      path: "screenshots/admin-desktop.png",
      fullPage: true,
    });
  });
  test("hosts see donation setup and can stage clearly labeled artwork without changing inventory", async () => {
    await owner.goto("/admin/studio");
    await expect(
      owner.getByRole("heading", { name: "This studio is for the hosts." }),
    ).toBeVisible();
    await admin.goto("/admin");
    await expect(
      admin.getByText(/Public donation claims are hidden until/),
    ).toBeVisible();
    await admin
      .getByRole("button", { name: "Review donation setup", exact: true })
      .click();
    await expect(
      admin.getByRole("heading", { name: /Beyond the table/ }),
    ).toBeVisible();
    await admin
      .getByRole("button", { name: "Purchase journey", exact: true })
      .click();
    await expect(
      admin.getByText(/share sheet|share action/i).first(),
    ).toBeVisible();
    const before = await pool.query(
      "SELECT (SELECT count(*) FROM orders)::int AS orders,(SELECT count(*) FROM reservations)::int AS reservations,(SELECT count(*) FROM invitations)::int AS invitations",
    );
    await admin.goto("/admin/studio");
    await expect(
      admin.getByText("DEMONSTRATION · STAGED ARTWORK", { exact: true }),
    ).toBeVisible();
    await expect(
      admin.getByRole("img", { name: "Demonstration: An empty chair" }),
    ).toBeVisible();
    await admin
      .getByRole("button", { name: "Start scene", exact: true })
      .click();
    await expect(
      admin.getByRole("img", {
        name: "Demonstration: An invitation beside them",
      }),
    ).toBeVisible();
    await admin.screenshot({
      path: "screenshots/admin-studio-desktop.png",
      fullPage: true,
    });
    await admin
      .getByRole("link", { name: "Browser recording mode", exact: true })
      .click();
    await expect(admin.locator(".promo-studio")).toHaveClass(/recording/);
    await expect(admin.locator(".promo-controls")).toHaveCount(0);
    await expect(
      admin.getByText("DEMO · NOT REAL GUESTS OR SEAT AVAILABILITY", {
        exact: true,
      }),
    ).toBeVisible();
    await admin.emulateMedia({ reducedMotion: "reduce" });
    await admin.reload();
    await expect(
      admin.getByRole("img", {
        name: "Demonstration: An invitation beside them",
      }),
    ).toBeVisible();
    const after = await pool.query(
      "SELECT (SELECT count(*) FROM orders)::int AS orders,(SELECT count(*) FROM reservations)::int AS reservations,(SELECT count(*) FROM invitations)::int AS invitations",
    );
    expect(after.rows).toEqual(before.rows);
  });
});
