import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const createdEmails: string[] = [];
const reactionKeys: string[] = [];
const dbPool = new Pool({ connectionString: process.env.DATABASE_URL });
test.beforeEach(async ({ page }) => {
  page.on("request", (request) => {
    if (
      /\/api\/seats\/\d+\/bread$/.test(request.url()) &&
      request.method() === "POST"
    ) {
      const key = request.postDataJSON()?.idempotencyKey;
      if (key) reactionKeys.push(key);
    }
  });
});
test.afterEach(async () => {
  if (reactionKeys.length)
    await dbPool.query(
      "DELETE FROM reactions WHERE idempotency_key=ANY($1::text[])",
      [reactionKeys.splice(0)],
    );
});
test.afterAll(async () => {
  const userIds = (
    await dbPool.query('SELECT id FROM \"user\" WHERE email=ANY($1::text[])', [
      createdEmails,
    ])
  ).rows.map((x) => x.id);
  if (userIds.length) {
    const c = await dbPool.connect();
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
      await c.query("DELETE FROM reactions WHERE seat_id=ANY($1::int[])", [
        seats,
      ]);
      await c.query("DELETE FROM reports WHERE seat_id=ANY($1::int[])", [
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
        "UPDATE seats SET state='available',reservation_id=NULL,hold_expires_at=NULL WHERE reservation_id IN (SELECT id FROM invitations WHERE owner_id=ANY($1::text[])) AND state='invitation_held'",
        [userIds],
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
      await c.query('DELETE FROM \"user\" WHERE id=ANY($1::text[])', [userIds]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  for (const email of createdEmails)
    await rm(
      path.join(
        process.env.DEV_DATA_DIR ||
          path.resolve(process.cwd(), "..", ".seat-at-internet-data"),
        "dev-mail",
        `${createHash("sha256").update(email).digest("hex")}.json`,
      ),
      { force: true },
    );
  await dbPool.end();
});
const unique = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function openDinner(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "The internet is weird.",
  );
  await expect(
    page.getByRole("button", {
      name: "Luna, probably tired, seat 1",
      exact: true,
    }),
  ).toBeAttached();
}

async function signInFromCheckout(page: Page, email: string) {
  await page
    .getByLabel("Your email. Just a little link to let you in.")
    .fill(email);
  await page
    .getByRole("button", { name: "Send sign-in link", exact: true })
    .click();
  const link = page.getByRole("link", {
    name: "Open development sign-in email",
  });
  await expect(link).toBeVisible();
  const url = await link.getAttribute("href");
  expect(url).toContain("/api/auth/magic-link/verify");
  const verification = await page.context().newPage();
  await verification.goto(url!);
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/me");
      return response.ok() ? (await response.json()).user?.email : "";
    })
    .toBe(email);
  await verification.close();
  await expect(
    page.getByRole("button", { name: "Continue to test checkout" }),
  ).toBeEnabled();
}

test("desktop table, clearly labeled demo profiles, bread and canonical sharing", async ({
  page,
  request,
}) => {
  await openDinner(page);
  await expect(
    page.getByText("DEVELOPMENT TABLE · NO REAL PURCHASES"),
  ).toBeVisible();
  expect(await page.locator(".table-column").count()).toBeLessThan(20);
  await mkdir("screenshots", { recursive: true });
  await page.screenshot({ path: "screenshots/desktop.png", fullPage: true });
  await page
    .getByRole("button", { name: "Business Raccoon, seat 4", exact: true })
    .click();
  const profile = page.getByRole("dialog", {
    name: "Business Raccoon, seat 4",
    exact: true,
  });
  await expect(
    profile.getByRole("heading", { name: "Business Raccoon" }),
  ).toBeVisible();
  await expect(profile.getByText("Demonstration character")).toBeVisible();
  await profile.getByRole("button", { name: "Close dialog" }).click();
  const publicTable = await (
    await page.request.get("/api/table?start=1&end=18")
  ).json();
  const breadGuest = publicTable.guests.find(
    (g: any) => g.reactionCount === 0 && g.reactionsEnabled !== false,
  );
  expect(
    breadGuest,
    "A seeded guest without prior bread is required for this isolated interaction.",
  ).toBeTruthy();
  await page
    .getByRole("button", {
      name: `${breadGuest.displayName}, seat ${breadGuest.seatId}`,
      exact: true,
    })
    .click();
  const breadProfile = page.getByRole("dialog", {
    name: `${breadGuest.displayName}, seat ${breadGuest.seatId}`,
    exact: true,
  });
  const breadResponse = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/seats/${breadGuest.seatId}/bread`) &&
      r.request().method() === "POST",
  );
  await breadProfile.getByRole("button", { name: /Pass the bread/ }).click();
  const reaction = await breadResponse;
  expect(reaction.ok()).toBeTruthy();
  expect(Number((await reaction.json()).count)).toBeGreaterThan(0);
  await expect(
    page.getByText("A little bread. A little kindness."),
  ).toBeVisible();
  const card = await request.get("/api/og/seat/4");
  expect(card.ok()).toBeTruthy();
  expect(card.headers()["content-type"]).toContain("image/png");
  expect((await card.body()).byteLength).toBeGreaterThan(20_000);
  await writeFile("screenshots/share-card.png", await card.body());
  await page.goto("/seat/4");
  await expect(
    page.getByRole("dialog", { name: "Business Raccoon, seat 4", exact: true }),
  ).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/seat\/4$/,
  );
  await page.goto("/seat/1");
  await expect(
    page.getByRole("dialog", {
      name: "Luna, probably tired, seat 1",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/seat\/1$/,
  );
});

test("curious guest and neighborhood links preserve public browsing while donation claims stay hidden", async ({
  page,
  request,
}) => {
  await openDinner(page);
  const donation = await (await request.get("/api/donations")).json();
  expect(donation.commitment).toBeNull();
  await expect(page.locator(".donation-blurb")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Beyond the table", exact: true }),
  ).toHaveCount(0);
  const curious = page.waitForResponse((response) =>
    response.url().endsWith("/api/curious"),
  );
  await page.locator(".curious-guest").click();
  const { guest } = await (await curious).json();
  expect(guest?.seatId).toBeGreaterThan(0);
  await expect(
    page.getByRole("dialog", {
      name: `${guest.displayName}, seat ${guest.seatId}`,
      exact: true,
    }),
  ).toBeVisible();
  const config = await (await request.get("/api/config")).json();
  const neighborhood = config.neighborhoods[1];
  await page.goto(`/neighborhood/${neighborhood.id}`);
  await expect(page.locator(".neighborhood-label")).toContainText(
    neighborhood.name,
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    new RegExp(`/neighborhood/${neighborhood.id}$`),
  );
  const image = await request.get(`/api/og/neighborhood/${neighborhood.id}`);
  expect(image.ok()).toBeTruthy();
  expect(image.headers()["content-type"]).toContain("image/png");
  expect((await image.body()).byteLength).toBeGreaterThan(20_000);
  await writeFile("screenshots/neighborhood-share.png", await image.body());
  await page.goto("/beyond-the-table");
  await expect(
    page.getByText(/No public donation commitment is active/),
  ).toBeVisible();
  await expect(page.getByText(/We set aside 10%/)).toHaveCount(0);
});

test("phone creates a guest, buys the adjacent pair, shares safely, and a friend claims without paying", async ({
  page,
  browser,
}) => {
  const suffix = unique();
  const buyerEmail = `pair-${suffix}@example.test`;
  const friendEmail = `pair-friend-${suffix}@example.test`;
  createdEmails.push(buyerEmail, friendEmail);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => Promise.reject(new Error("Device share unavailable")),
    });
  });
  await openDinner(page);
  await page.locator(".hero-create").click();
  const dialog = page.getByRole("dialog", { name: "Create your dinner guest" });
  await expect(page.locator(".mobile-action-bar")).not.toBeVisible();
  await dialog
    .getByRole("button", { name: "Surprise me", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Social houseplant", exact: true })
    .click();
  await dialog
    .getByPlaceholder("Captain Overthink")
    .fill(`Fern Friend ${suffix.slice(-6)}`);
  await page.screenshot({
    path: "screenshots/builder-mobile.png",
    fullPage: false,
  });
  await dialog
    .getByRole("button", { name: "Find my place", exact: true })
    .click();
  await dialog
    .getByRole("spinbutton", { name: "Find a place near seat" })
    .fill("4301");
  await dialog
    .getByRole("button", { name: "See me at the table", exact: true })
    .click();
  await expect(dialog.locator(".package-option").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const pair = dialog.getByRole("button", {
    name: /You \+ your favorite weirdo/,
  });
  await expect(pair).toContainText("$9.00");
  await pair.click();
  await expect(pair).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByLabel("2 selected adjacent seats")).toBeVisible();
  await dialog
    .getByRole("button", { name: /Keep this seat — \$9\.00/ })
    .click();
  await signInFromCheckout(page, buyerEmail);
  const checkout = page.waitForResponse(
    (r) => r.url().endsWith("/api/checkout") && r.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Continue to test checkout", exact: true })
    .click();
  const result = await (await checkout).json();
  expect(result.order.amount).toBe(900);
  expect(result.order.seatIds).toHaveLength(2);
  expect(result.order.seatIds[1] - result.order.seatIds[0]).toBe(2);
  await dialog
    .getByRole("button", { name: "Complete test payment", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Dinner would be weirder with you." }),
  ).toBeVisible();
  await expect(dialog.locator(".arrival-moment")).toHaveClass(/arrival-still/);
  await expect(dialog.getByText(/They will not pay again/)).toBeVisible();
  await expect(page.locator(".mobile-action-bar")).not.toBeVisible();
  await page.screenshot({
    path: "screenshots/arrival-mobile.png",
    fullPage: false,
  });
  await dialog
    .getByRole("button", { name: "Fold my invitation", exact: true })
    .click();
  const invitationUrl = await dialog
    .getByLabel("Your private invitation link")
    .inputValue();
  await expect(
    dialog.getByText(/Already-paid seat .* no second payment/),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Invite someone", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(/Copy invitation link/);
  await expect(
    dialog.getByRole("button", { name: "Copy invitation link", exact: true }),
  ).toBeVisible();
  const token = new URL(invitationUrl).pathname.split("/").pop()!;
  const invitation = await (
    await page.request.get(`/api/invitations/${token}`)
  ).json();
  const imagePath = await dialog
    .getByRole("link", { name: "Download invitation image", exact: true })
    .getAttribute("href");
  expect(imagePath).toContain(`/api/og/invitation/${invitation.id}`);
  expect(imagePath).not.toContain(token);
  const image = await page.request.get(imagePath!);
  expect(image.ok()).toBeTruthy();
  await writeFile("screenshots/invitation-share.png", await image.body());
  // The public screenshot must not reproduce even part of a private claim token.
  await dialog.getByLabel("Your private invitation link").evaluate((input) => {
    (input as HTMLInputElement).type = "password";
  });
  await page.screenshot({
    path: "screenshots/invitation-mobile.png",
    fullPage: false,
  });
  await dialog.getByLabel("Your private invitation link").evaluate((input) => {
    (input as HTMLInputElement).type = "text";
  });

  const friendContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  try {
    const friend = await friendContext.newPage();
    await friend.goto(invitationUrl);
    await expect(
      friend.getByText("A paid group-seat invitation", { exact: true }),
    ).toBeVisible();
    await expect(friend.getByText(/You will not pay again/)).toBeVisible();
    const metadataImage = await friend
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(metadataImage).toContain(`/api/og/invitation/${invitation.id}`);
    expect(metadataImage).not.toContain(token);
    await friend.screenshot({
      path: "screenshots/invitation-recipient-mobile.png",
      fullPage: true,
    });
    await friend.goto("/account");
    await friend
      .getByLabel("What should we call you?")
      .fill("A favorite weirdo");
    await friend.getByLabel("Email address").fill(friendEmail);
    await friend
      .getByRole("button", { name: "Send me a sign-in link", exact: true })
      .click();
    await friend
      .getByRole("link", { name: "Open sign-in link", exact: true })
      .click();
    await expect(
      friend.getByRole("heading", { name: /Welcome back,/ }),
    ).toBeVisible();
    await friend.goto(invitationUrl);
    await friend
      .getByRole("button", { name: "Claim my paid seat", exact: true })
      .click();
    await expect(friend.getByRole("status")).toContainText(
      "The paid seat is now linked to your account.",
    );
    const claimed = await (await friend.request.get("/api/me")).json();
    expect(claimed.orders).toHaveLength(0);
    expect(claimed.seats.map((s: { seatId: number }) => s.seatId)).toContain(
      invitation.targetSeatId,
    );
    await page.goto("/account");
    await page.getByRole("button", { name: /^Orders & receipts/ }).click();
    await page
      .getByRole("button", { name: "Order details", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Invite someone beside you", exact: true })
      .click();
    const reopened = page.getByRole("dialog", {
      name: "Dinner would be weirder with you.",
    });
    await expect(reopened.locator(".arrival-moment")).toBeVisible();
    await expect(
      reopened.getByRole("button", { name: "Fold my invitation", exact: true }),
    ).toHaveCount(0);
  } finally {
    await friendContext.close();
  }
});

test("mobile exploration, guest search, keyboard alternatives, list view and reduced motion", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  // The OS accessibility preference wins over a stale saved motion choice.
  await page.addInitScript(() => localStorage.setItem("table-motion", "on"));
  await openDinner(page);
  await expect(
    page.getByRole("button", { name: "Enable motion" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "screenshots/mobile.png", fullPage: true });
  const heroAction = page.locator(".hero-create");
  await expect(heroAction).toBeVisible();
  await expect(page.locator(".mobile-action-bar")).not.toBeVisible();
  await heroAction.evaluate((element) =>
    window.scrollTo(
      0,
      window.scrollY + element.getBoundingClientRect().bottom + 24,
    ),
  );
  await expect(page.locator(".mobile-action-bar")).toBeVisible();
  const scene = page.getByRole("region", { name: /^Illustrated table/ });
  await scene.focus();
  const before = await page.locator(".position-label").innerText();
  await scene.press("ArrowRight");
  await expect(page.locator(".position-label")).not.toHaveText(before);
  const positionAfterKeyboard = await page
    .locator(".position-label")
    .innerText();
  const bounds = await scene.boundingBox();
  expect(bounds).toBeTruthy();
  // Chromium's real touch input emits the same captured pointer sequence as a phone swipe.
  const touch = await context.newCDPSession(page);
  const touchY = Math.min(bounds!.y + 170, 730);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 330, y: touchY }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 210, y: touchY }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 90, y: touchY }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await touch.detach();
  await expect(page.locator(".position-label")).not.toHaveText(
    positionAfterKeyboard,
  );
  await scene.press("End");
  await expect(page.locator(".position-label")).toContainText("10000");
  await expect(
    scene.getByRole("button", { name: /seat 10000/i }),
  ).toBeVisible();
  expect(await page.locator(".table-column").count()).toBeLessThan(20);
  await scene.press("Home");
  await expect(page.locator(".position-label")).toContainText("0001");
  await expect(page.locator("#table-position")).toHaveValue("0");
  // Focusing and panning the scene may bring the hero action back onscreen.
  // The bottom action bar correctly disappears while that action is visible.
  await page.mouse.wheel(0, 700);
  await expect
    .poll(() =>
      heroAction.evaluate((element) => element.getBoundingClientRect().bottom),
    )
    .toBeLessThan(0);
  await expect(page.locator(".mobile-action-bar")).toBeVisible();
  await page
    .locator(".mobile-action-bar")
    .getByRole("button", { name: "Find a guest", exact: true })
    .click();
  const search = page.getByRole("dialog", { name: "Find your dinner company" });
  await search
    .getByRole("textbox", {
      name: "Search guests, seat numbers or neighborhoods",
    })
    .fill("Raccoon");
  await expect(
    search.getByRole("button", { name: /Business Raccoon/ }),
  ).toBeVisible();
  await search.getByRole("button", { name: /Business Raccoon/ }).click();
  const profile = page.getByRole("dialog", {
    name: "Business Raccoon, seat 4",
    exact: true,
  });
  await expect(profile).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(profile).not.toBeVisible();
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await page.getByRole("textbox", { name: "Search table list" }).fill("Miso");
  await expect(
    page.getByRole("button", { name: /SEAT 8 Miso the cat/ }),
  ).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(
    page.getByRole("textbox", { name: "Search table list" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(844);
  await page.screenshot({
    path: "screenshots/mobile-landscape.png",
    fullPage: true,
  });
  await context.close();
});

test("anonymous customization survives navigation, authentication and a declined payment before fulfilled arrival and expired courtesy fallback", async ({
  page,
}) => {
  const suffix = unique();
  const name = `Soup Scout ${suffix.slice(-7)}`;
  const message =
    "A small bowl of soup. A healthy appetite for peculiar company.";
  await page.goto("/?utm_source=e2e&utm_campaign=guest-first");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "The internet is weird.",
  );
  await page.locator(".hero-create").click();
  let dialog = page.getByRole("dialog", { name: "Create your dinner guest" });
  await expect(
    dialog.getByRole("button", { name: "Surprise me", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Business raccoon", exact: true })
    .click();
  await dialog.getByRole("combobox", { name: /Outfit/ }).selectOption("suit");
  await dialog.getByPlaceholder("Captain Overthink").fill(name);
  await dialog.getByLabel("A short dinner message").fill(message);
  await dialog.getByLabel("What are you bringing?").selectOption("soup");
  await dialog
    .getByLabel(/A little more about you/)
    .fill("https://example.org/dinner");
  // Designing must not require a verified account or touch checkout inventory.
  const anonymous = await (await page.request.get("/api/me")).json();
  expect(anonymous.user).toBeNull();
  await expect(
    dialog.locator(".guest-live-preview .preview-primary-guest"),
  ).toBeVisible();
  await page.screenshot({
    path: "screenshots/builder-desktop.png",
    fullPage: false,
  });
  await dialog
    .getByRole("button", { name: "Find my place", exact: true })
    .click();
  await dialog
    .getByRole("spinbutton", { name: "Find a place near seat" })
    .fill("3100");
  await dialog
    .getByRole("button", { name: "See me at the table", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: /Keep this seat — \$5\.00/ }),
  ).toBeEnabled();
  await expect(dialog.locator(".package-option").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const reviewedSeats = (
    await dialog.locator(".exact-seat-review strong").innerText()
  )
    .match(/\d+/g)!
    .map(Number);
  expect(reviewedSeats).toHaveLength(1);
  expect(Math.abs(reviewedSeats[0] - 3100)).toBeLessThan(4);
  await dialog
    .getByRole("button", { name: /Keep this seat — \$5\.00/ })
    .click();
  await expect(dialog.getByText("12 months", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/one-time purchase/i).first()).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("dinner-draft") || "null"),
  );
  expect(saved.profile.displayName).toBe(name);
  expect(saved.profile.message).toBe(message);
  expect(saved.profile.customization.base).toBe("raccoon");
  // Close/reload/reopen exercises restoration, not merely React state in one mounted dialog.
  await page.reload();
  await page.locator(".header-cta").click();
  dialog = page.getByRole("dialog", { name: "Create your dinner guest" });
  await expect(dialog.locator(".guest-live-preview h3")).toHaveText(name);
  const checkoutEmail = `scout-${suffix}@example.test`;
  createdEmails.push(checkoutEmail);
  await signInFromCheckout(page, checkoutEmail);
  const restored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("dinner-draft") || "null"),
  );
  expect(restored.profile).toEqual(saved.profile);
  const firstCheckout = page.waitForResponse(
    (r) => r.url().endsWith("/api/checkout") && r.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Continue to test checkout", exact: true })
    .click();
  const firstOrder = await (await firstCheckout).json();
  expect(firstOrder.order.amount).toBe(500);
  expect(firstOrder.order.seatIds).toEqual(reviewedSeats);
  await expect(
    dialog.getByText("No payment provider connected.", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Test a declined payment", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(/declined|failed/i);
  await expect(dialog.locator(".guest-live-preview h3")).toHaveText(name);
  const retry = page.waitForResponse(
    (r) => r.url().endsWith("/api/checkout") && r.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Continue to test checkout", exact: true })
    .click();
  const secondOrder = await (await retry).json();
  expect(secondOrder.orderId).not.toBe(firstOrder.orderId);
  const paid = page.waitForResponse(
    (r) => r.url().endsWith("/api/dev/pay") && r.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Complete test payment", exact: true })
    .click();
  expect((await paid).ok()).toBeTruthy();
  await expect(
    dialog.getByRole("heading", { name: "Dinner would be weirder with you." }),
  ).toBeVisible();
  await expect(dialog.getByText(/private arrival preview/)).toBeVisible();
  // Capture the settled visual moment, rather than the intentional empty-chair
  // opening frame. This also proves every arrival layer becomes visible.
  for (const layer of [".arrival-guest", ".arrival-dish", ".arrival-napkin"])
    await expect
      .poll(() =>
        dialog
          .locator(layer)
          .evaluate((element) => getComputedStyle(element).opacity),
      )
      .toBe("1");
  await page.screenshot({
    path: "screenshots/arrival-desktop.png",
    fullPage: false,
  });
  await dialog
    .getByRole("button", { name: "Fold my invitation", exact: true })
    .click();
  const invitationInput = dialog.getByLabel("Your private invitation link");
  await expect(invitationInput).toBeVisible();
  const invitationUrl = await invitationInput.inputValue();
  const token = new URL(invitationUrl).pathname.split("/").pop()!;
  const original = await (
    await page.request.get(`/api/invitations/${token}`)
  ).json();
  expect(original.type).toBe("courtesy");
  expect(original.requiresPurchase).toBe(true);
  const image = dialog.getByRole("link", {
    name: "Download invitation image",
    exact: true,
  });
  const imagePath = await image.getAttribute("href");
  expect(imagePath).toContain(`/api/og/invitation/${original.id}`);
  expect(imagePath).not.toContain(token);
  const shareImage = await page.request.get(imagePath!);
  expect(shareImage.ok()).toBeTruthy();
  expect(shareImage.headers()["content-type"]).toContain("image/png");
  await invitationInput.evaluate((input) => {
    (input as HTMLInputElement).type = "password";
  });
  await page.screenshot({
    path: "screenshots/invitation-desktop.png",
    fullPage: false,
  });
  await invitationInput.evaluate((input) => {
    (input as HTMLInputElement).type = "text";
  });
  await page.goto("/account");
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const owner = await (await page.request.get("/api/me")).json();
  const seat = owner.seats.find((s: any) => s.profile?.displayName === name);
  expect(seat.state).toBe("purchased");
  expect(seat.profile.message).toBe(message);
  expect(seat.profile.link).toBe("https://example.org/dinner");
  expect(seat.profile.visibility).toBe("pending");
  const publicResponse = await page.request.get(
    `/api/table?start=${seat.seatId}&end=${seat.seatId}`,
  );
  expect((await publicResponse.json()).guests).toHaveLength(0);
  // Controlled clock/inventory fixture: expires this development invitation and makes
  // its original destination unavailable so the visitor can review a nearby replacement.
  const config = await (await page.request.get("/api/config")).json();
  expect(config.mode).toBe("development");
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await db.query(
      "UPDATE invitations SET expires_at=now()-interval '1 hour' WHERE id=$1",
      [original.id],
    );
    await page.request.get(`/api/invitations/${token}`);
    const changed = await db.query(
      "UPDATE seats SET state='unavailable' WHERE id=$1 AND state='available' RETURNING id",
      [original.targetSeatId],
    );
    expect(changed.rowCount).toBe(1);
    await page.goto(invitationUrl);
    await expect(
      page.getByText(/The original temporary hold has expired/),
    ).toBeVisible();
    await expect(
      page.getByText(/We found seat .* nearby instead/),
    ).toBeVisible();
    await expect(
      page.getByText("A courtesy invitation · separate purchase", {
        exact: true,
      }),
    ).toBeVisible();
    const choice = page.getByRole("link", { name: /Choose my guest/ });
    await expect(choice).toBeVisible();
    const destination = new URL(
      (await choice.getAttribute("href"))!,
      "http://localhost:3000",
    );
    expect(Number(destination.searchParams.get("seat"))).not.toBe(
      original.targetSeatId,
    );
  } finally {
    await db.query(
      "UPDATE seats SET state='available' WHERE id=$1 AND state='unavailable' AND owner_id IS NULL",
      [original.targetSeatId],
    );
    await db.end();
  }
});
