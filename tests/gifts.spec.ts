import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

test.use({ actionTimeout: 15_000 });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const emails: string[] = [];
const unique = () => randomUUID().slice(0, 8);
const origin = process.env.E2E_BASE_URL || "http://localhost:3000";
const senderDrawing = {
  base: "raccoon",
  accessory: "none",
  outfit: "suit",
  skin: "#bd805a",
  color: "#9aab91",
};
const recipientDrawing = {
  base: "human",
  accessory: "party-hat",
  outfit: "cardigan",
  skin: "#dfb28c",
  color: "#d9b37c",
};
function fixture(occasion = "birthday", prop = "cake") {
  const letters: Record<string, string> = {
    birthday:
      "Happy birthday, June!\n\nI saved you a little seat, a very good cake, and a place beside me. Thanks for making ordinary days wonderfully strange. ❤️",
    congratulations:
      "You did it, June!\n\nA tiny banner for a very big achievement. I am so proud of you. Come pause, celebrate, and enjoy this wonderfully peculiar dinner beside me.",
    "thank-you":
      "Thank you, June.\n\nFor the big things, the little things, and all the kindness you probably thought I did not notice. I noticed. Here are some flowers and a little place beside me.",
    "miss-you":
      "I miss you, June.\n\nUntil we can sit at the same real table again, here is a little corner of the internet where our chairs are neighbors. I am very glad you exist.",
    "just-because":
      "No special occasion, June.\n\nI simply thought the internet could use a little more of us, sitting together and passing the bread. I saved you a place. ❤️",
  };
  return {
    occasion,
    senderName: "River",
    recipientName: "June",
    message: `${letters[occasion] || letters.birthday}\n\nPrivate letter ${unique()}.`,
    senderCustomization: senderDrawing,
    recipientCustomization: recipientDrawing,
    dish: "cake",
    prop,
  };
}
async function post(page: Page, url: string, data: unknown = {}) {
  const response = await page.request.post(url, { data, headers: { origin } });
  expect(
    response.ok(),
    `${url.replace(/open\/[^/]+/, "open/[private]")}: ${response.status()}`,
  ).toBeTruthy();
  return response.json();
}
async function patch(page: Page, url: string, data: unknown) {
  const response = await page.request.patch(url, { data, headers: { origin } });
  expect(
    response.ok(),
    `${url.replace(/open\/[^/]+/, "open/[private]")}: ${response.status()}`,
  ).toBeTruthy();
  return response.json();
}
async function signIn(page: Page, email: string, callbackURL = "/account") {
  emails.push(email);
  await post(page, "/api/auth/sign-in/magic-link", {
    email,
    name: "Gift QA",
    callbackURL,
  });
  const inbox = await (
    await page.request.get(`/api/dev/inbox?email=${encodeURIComponent(email)}`)
  ).json();
  expect(inbox.messages?.length).toBeGreaterThan(0);
  await page.goto(inbox.messages.at(-1).url);
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/me")).json()).user?.email,
    )
    .toBe(email);
}
async function createReadyGift(page: Page, input = fixture()) {
  const created = await post(page, "/api/gifts", input);
  const id = created.gift.id;
  const prepared = await post(page, `/api/gifts/${id}/prepare`);
  if (prepared.requiresPayment) {
    const checkout = await post(page, "/api/checkout", {
      packageId: prepared.packageId,
      seatIds: prepared.seatIds,
      giftId: id,
      expectedAmount: prepared.amount,
      profile: {
        displayName: input.senderName,
        message: "",
        customization: input.senderCustomization,
        dish: input.dish,
      },
    });
    await post(page, "/api/dev/pay", {
      orderId: checkout.orderId,
      outcome: "paid",
    });
  }
  const ready = await (await page.request.get(`/api/gifts/${id}`)).json();
  expect(ready.gift.status).toBe("ready");
  const link = await post(page, `/api/gifts/${id}/link`);
  return { ...link, gift: ready.gift, input };
}
async function assertNoOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
}
async function capture(page: Page, filename: string, fullPage = false) {
  await mkdir("screenshots", { recursive: true });
  const letter = page.locator(".gift-letter-paper").first();
  if (await letter.isVisible())
    await expect
      .poll(() =>
        letter.evaluate((element) => getComputedStyle(element).opacity),
      )
      .toBe("1");
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  });
  const mask = page.locator("input[readonly], textarea[readonly]");
  await page.screenshot({
    path: `screenshots/${filename}`,
    fullPage,
    mask: await mask.all(),
    maskColor: "#e8e5d5",
  });
}

test.afterAll(async () => {
  const userIds = (
    await pool.query('SELECT id FROM "user" WHERE email=ANY($1::text[])', [
      emails,
    ])
  ).rows.map((r) => r.id);
  if (userIds.length) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const orderIds = (
        await c.query("SELECT id FROM orders WHERE user_id=ANY($1::text[])", [
          userIds,
        ])
      ).rows.map((r) => r.id);
      const seatIds = (
        await c.query(
          "SELECT id FROM seats WHERE owner_id=ANY($1::text[]) OR order_id=ANY($2::text[])",
          [userIds, orderIds],
        )
      ).rows.map((r) => r.id);
      await c.query(
        "UPDATE orders SET gift_id=NULL WHERE user_id=ANY($1::text[]) OR gift_id IN (SELECT id FROM gifts WHERE sender_id=ANY($1::text[]) OR claimed_by=ANY($1::text[]))",
        [userIds],
      );
      await c.query(
        "DELETE FROM gifts WHERE sender_id=ANY($1::text[]) OR claimed_by=ANY($1::text[])",
        [userIds],
      );
      await c.query(
        "DELETE FROM gift_claim_intents WHERE user_id=ANY($1::text[])",
        [userIds],
      );
      await c.query("DELETE FROM reactions WHERE seat_id=ANY($1::int[])", [
        seatIds,
      ]);
      await c.query("DELETE FROM reports WHERE seat_id=ANY($1::int[])", [
        seatIds,
      ]);
      await c.query(
        "DELETE FROM moderation_decisions WHERE seat_id=ANY($1::int[])",
        [seatIds],
      );
      await c.query(
        "DELETE FROM audit_events WHERE actor_id=ANY($1::text[]) OR target=ANY($2::text[]) OR target=ANY($3::text[])",
        [userIds, orderIds, seatIds.map(String)],
      );
      await c.query(
        "DELETE FROM support_issues WHERE user_id=ANY($1::text[]) OR order_id=ANY($2::text[])",
        [userIds, orderIds],
      );
      await c.query(
        "DELETE FROM payment_events WHERE order_id=ANY($1::text[])",
        [orderIds],
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
        seatIds,
      ]);
      await c.query(
        "UPDATE seats SET state='available',owner_id=NULL,order_id=NULL,reservation_id=NULL,hold_expires_at=NULL WHERE id=ANY($1::int[])",
        [seatIds],
      );
      await c.query("DELETE FROM reservations WHERE user_id=ANY($1::text[])", [
        userIds,
      ]);
      await c.query("DELETE FROM order_items WHERE order_id=ANY($1::text[])", [
        orderIds,
      ]);
      await c.query("DELETE FROM orders WHERE id=ANY($1::text[])", [orderIds]);
      await c.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [userIds]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  for (const email of emails)
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

test("birthday surprise survives anonymous authentication, confirms its paid pair, delivers privately, receives thanks and transfers its guest explicitly", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const senderContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const recipientContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  const suffix = unique();
  const senderEmail = `gift-sender-${suffix}@example.test`;
  const recipientEmail = `gift-recipient-${suffix}@example.test`;
  emails.push(senderEmail, recipientEmail);
  const input = {
    ...fixture(),
    senderName: `River ${suffix}`,
    recipientName: `June ${suffix}`,
  };
  try {
    await sender.goto("/");
    await sender.locator(".hero-gift-link").click();
    await expect(sender.locator(".gift-occasion-list")).toBeVisible();
    await sender.getByRole("button", { name: /^Birthday/ }).click();
    await sender.getByRole("button", { name: "Continue", exact: true }).click();
    await sender.locator("#gift-sender-name").fill(input.senderName);
    await sender
      .getByRole("group", { name: "sender character base", exact: true })
      .getByRole("button", { name: "Business raccoon", exact: true })
      .click();
    await sender.getByRole("button", { name: "Continue", exact: true }).click();
    await sender.locator("#gift-recipient-name").fill(input.recipientName);
    await sender
      .getByRole("group", { name: "recipient character base", exact: true })
      .getByRole("button", { name: "Social houseplant", exact: true })
      .click();
    await capture(sender, "gift-builder-desktop.png");
    await sender.setViewportSize({ width: 390, height: 844 });
    await assertNoOverflow(sender);
    await expect
      .poll(async () => {
        const name = await sender
          .locator(".gift-composer-preview > h2")
          .boundingBox();
        const dish = await sender.locator(".gift-scene-dish").boundingBox();
        return Boolean(name && dish && name.y >= dish.y + dish.height);
      })
      .toBe(true);
    await capture(sender, "gift-builder-mobile.png");
    await sender.setViewportSize({ width: 320, height: 740 });
    await assertNoOverflow(sender);
    await sender.setViewportSize({ width: 1440, height: 1000 });
    await sender.getByRole("button", { name: "Continue", exact: true }).click();
    await sender.locator("#gift-dish").selectOption("cake");
    await sender.getByRole("button", { name: /Little birthday cake/ }).click();
    await sender.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(sender.locator("#gift-private-message")).toHaveValue("");
    await sender.locator("#gift-private-message").fill(input.message);
    await sender
      .getByRole("button", { name: "Preview the surprise", exact: true })
      .click();
    await expect(sender.locator(".gift-review-letter p")).toHaveText(
      input.message,
    );
    expect(
      (await (await sender.request.get("/api/me")).json()).user,
    ).toBeNull();
    await sender.reload();
    await expect(sender.locator(".gift-review-letter p")).toHaveText(
      input.message,
    );
    const beforeAuthDraft = await sender.evaluate(() =>
      JSON.parse(localStorage.getItem("a-seat-saved-gift-draft-v1") || "null"),
    );
    expect(beforeAuthDraft.input.message).toBe(input.message);
    await sender
      .getByRole("button", { name: "Preview their surprise", exact: true })
      .click();
    const preview = sender.getByRole("dialog", {
      name: "Preview the gift experience",
      exact: true,
    });
    await expect(
      preview.getByRole("button", { name: "Join them", exact: true }),
    ).toBeVisible();
    await preview
      .getByRole("button", { name: "Use the simple view", exact: true })
      .click();
    await expect(preview.locator(".gift-private-message")).toHaveText(
      input.message,
    );
    await capture(sender, "gift-preview-desktop.png");
    await preview
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await sender.locator("#gift-sender-email").fill(senderEmail);
    await sender
      .getByRole("button", { name: "Send sign-in link", exact: true })
      .click();
    const verificationUrl = await sender
      .getByRole("link", {
        name: "Open development sign-in email",
        exact: false,
      })
      .getAttribute("href");
    const verifier = await senderContext.newPage();
    await verifier.goto(verificationUrl!);
    await expect
      .poll(
        async () =>
          (await (await sender.request.get("/api/me")).json()).user?.email,
      )
      .toBe(senderEmail);
    await verifier.close();
    await expect(
      sender.getByRole("button", {
        name: "Confirm available seating",
        exact: true,
      }),
    ).toBeVisible();
    const afterAuthDraft = await sender.evaluate(() =>
      JSON.parse(localStorage.getItem("a-seat-saved-gift-draft-v1") || "null"),
    );
    expect(afterAuthDraft.input).toEqual(beforeAuthDraft.input);
    await sender
      .getByRole("button", { name: "Confirm available seating", exact: true })
      .click();
    await expect(sender.locator(".gift-seat-summary")).toContainText("$9.00");
    await expect(
      sender.getByRole("button", { name: /Keep these seats — \$9\.00/ }),
    ).toBeVisible();
    const checkoutResponse = sender.waitForResponse(
      (r) =>
        r.url().endsWith("/api/checkout") && r.request().method() === "POST",
    );
    await sender
      .getByRole("button", { name: /Keep these seats — \$9\.00/ })
      .click();
    const checkout = await (await checkoutResponse).json();
    expect(checkout.order.amount).toBe(900);
    expect(checkout.order.seatIds).toHaveLength(2);
    expect(checkout.order.seatIds[1] - checkout.order.seatIds[0]).toBe(2);
    const giftId =
      checkout.order.giftId ||
      checkout.order.gift_id ||
      (await (await sender.request.get("/api/gifts")).json()).gifts[0].id;
    const pending = await (
      await sender.request.get(`/api/gifts/${giftId}`)
    ).json();
    expect(pending.gift.status).toBe("awaiting_payment");
    await sender
      .getByRole("button", { name: "Complete test payment", exact: true })
      .click();
    await expect(
      sender.getByRole("heading", {
        name: "Their seat is ready. Send the surprise.",
        exact: true,
      }),
    ).toBeVisible();
    await sender
      .getByRole("button", { name: "Create the gift link", exact: true })
      .click();
    const giftLink = sender.locator("#gift-ready-link");
    await expect(giftLink).toBeVisible();
    const url = await giftLink.inputValue();
    const token = new URL(url).pathname.split("/").pop()!;
    await sender
      .getByRole("button", { name: "Copy gift link", exact: true })
      .click();
    await expect(
      sender.getByRole("button", { name: "Link copied", exact: true }),
    ).toBeVisible();
    await capture(sender, "gift-ready-desktop.png");
    const imagePath = await sender
      .getByRole("link", { name: "Download invitation image", exact: true })
      .getAttribute("href");
    expect(Boolean(imagePath?.includes(token))).toBe(false);
    const image = await sender.request.get(imagePath!);
    expect(image.ok()).toBeTruthy();
    expect(image.headers()["content-type"]).toContain("image/png");
    await writeFile(
      "screenshots/gift-invitation-image.png",
      await image.body(),
    );
    const response = await recipient.goto(url);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
    const metadata = await recipient
      .locator("meta")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("content") || "").join(" "),
      );
    for (const privateValue of [
      input.senderName,
      input.recipientName,
      input.message,
      token,
    ])
      expect(metadata.includes(privateValue)).toBe(false);
    await expect(
      recipient.getByRole("heading", {
        name: "Someone saved you a seat.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      recipient.getByRole("button", { name: "Open your message", exact: true }),
    ).not.toBeVisible();
    expect(
      (await (await recipient.request.get("/api/me")).json()).user,
    ).toBeNull();
    await capture(recipient, "gift-invitation-mobile.png");
    await recipient
      .getByRole("button", { name: "Join them", exact: true })
      .click();
    await expect(
      recipient.getByRole("button", { name: "Skip animation", exact: false }),
    ).toBeVisible();
    await expect(
      recipient.getByRole("button", { name: "Open your message", exact: true }),
    ).toBeVisible({ timeout: 12_000 });
    await assertNoOverflow(recipient);
    await capture(recipient, "gift-birthday-scene-mobile.png");
    await recipient
      .getByRole("button", { name: "Open your message", exact: true })
      .click();
    await expect(recipient.locator(".gift-private-message")).toHaveText(
      input.message,
    );
    await expect(
      recipient.getByRole("heading", {
        name: `For ${input.recipientName}, from ${input.senderName}.`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(recipient.locator(".gift-private-message")).toBeInViewport({
      ratio: 0.5,
    });
    await capture(recipient, "gift-letter-mobile.png", true);
    await recipient
      .locator(".gift-letter-paper")
      .evaluate((element) =>
        element.scrollIntoView({ block: "start", behavior: "instant" }),
      );
    await capture(recipient, "gift-letter-reading-mobile.png");
    const table = await (
      await recipient.request.get(
        `/api/table?start=${checkout.order.seatIds[0]}&end=${checkout.order.seatIds[1]}`,
      )
    ).text();
    expect(table.includes(input.message)).toBe(false);
    const untouched = await (
      await sender.request.get(`/api/gifts/${giftId}`)
    ).json();
    expect(untouched.gift.claimedAt).toBeNull();
    expect(
      (await (await recipient.request.get("/api/me")).json()).user,
    ).toBeNull();
    await recipient
      .getByRole("button", { name: "Send a thank-you ❤️", exact: true })
      .click();
    await expect(
      recipient.getByText("Your thank-you is waiting at their seat.", {
        exact: true,
      }),
    ).toBeVisible();
    await recipient
      .getByRole("button", { name: "Make this guest yours", exact: true })
      .click();
    await expect(
      recipient.getByRole("heading", {
        name: "Make yourself at home.",
        exact: true,
      }),
    ).toBeVisible();
    await recipient.locator("#gift-claim-email").fill(recipientEmail);
    await recipient
      .getByRole("button", { name: "Send sign-in link", exact: true })
      .click();
    await recipient
      .getByRole("link", {
        name: "Open development sign-in link",
        exact: false,
      })
      .click();
    await expect(
      recipient.getByRole("button", {
        name: "Claim and personalize my guest",
        exact: false,
      }),
    ).toBeVisible();
    await recipient
      .getByRole("button", {
        name: "Claim and personalize my guest",
        exact: false,
      })
      .click();
    await expect(
      recipient.getByText(
        "This guest is yours. You can personalize it in your account.",
        { exact: true },
      ),
    ).toBeVisible();
    const recipientAccount = await (
      await recipient.request.get("/api/me")
    ).json();
    expect(
      recipientAccount.seats.some(
        (s: { seatId: number }) => s.seatId === checkout.order.seatIds[1],
      ),
    ).toBe(true);
    expect(recipientAccount.orders).toHaveLength(0);
    await sender.goto(`/account?gift=${giftId}`);
    const card = sender.getByRole("article", {
      name: `Gift for ${input.recipientName}`,
      exact: true,
    });
    await expect(card.getByText("Thank you ❤️", { exact: true })).toBeVisible();
    await expect(card.getByText(/Their guest is theirs now/)).toBeVisible();
    await expect(
      card.getByRole("link", { name: "Edit suggested guests", exact: false }),
    ).not.toBeVisible();
    await capture(sender, "gift-sender-dashboard-desktop.png");
    const attack =
      '<img src=x onerror="window.__giftXss=1">\n\nStill a letter. ❤️';
    await patch(sender, `/api/gifts/${giftId}`, { message: attack });
    await recipient.goto(`${url}?view=plain`);
    await expect(recipient.locator(".gift-private-message")).toHaveText(attack);
    expect(await recipient.locator(".gift-private-message img").count()).toBe(
      0,
    );
    expect(
      await recipient.evaluate(
        () => (window as Window & { __giftXss?: number }).__giftXss,
      ),
    ).toBeUndefined();
  } finally {
    await senderContext.close();
    await recipientContext.close();
  }
});

test("owned neighboring seats need no new charge; all occasion variants have a static private reveal and revoked links stop working", async ({
  browser,
}) => {
  const senderContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const recipientContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  try {
    const sender = await senderContext.newPage();
    const recipient = await recipientContext.newPage();
    await signIn(sender, `gift-owned-${unique()}@example.test`);
    const first = await createReadyGift(sender);
    await post(sender, `/api/gifts/${first.gift.id}/revoke`);
    const before = await (await sender.request.get("/api/me")).json();
    const created = await post(sender, "/api/gifts", {
      ...fixture(),
      sourceSeatId: first.gift.senderSeatId,
    });
    const prepared = await post(
      sender,
      `/api/gifts/${created.gift.id}/prepare`,
    );
    expect(prepared.requiresPayment).toBe(false);
    expect(prepared.amount).toBe(0);
    expect(prepared.packageId).toBeNull();
    const after = await (await sender.request.get("/api/me")).json();
    expect(after.orders).toHaveLength(before.orders.length);
    const link = await post(sender, `/api/gifts/${created.gift.id}/link`);
    for (const [occasion, prop, label] of [
      ["congratulations", "banner", "Congratulations"],
      ["thank-you", "flowers", "Thank you"],
      ["miss-you", "wave", "I miss you"],
      ["just-because", "bread-heart", "Just because"],
    ]) {
      const input = {
        ...fixture(occasion, prop),
        sourceSeatId: first.gift.senderSeatId,
      };
      await patch(sender, `/api/gifts/${created.gift.id}`, input);
      await recipient.goto(link.url);
      await expect(
        recipient.getByRole("heading", {
          name: "Someone saved you a seat.",
          exact: true,
        }),
      ).toBeVisible();
      await recipient
        .getByRole("button", { name: "Use the simple view", exact: true })
        .click();
      await expect(
        recipient.getByText(input.message, { exact: true }),
      ).toBeVisible();
      await expect(
        recipient.getByRole("heading", {
          name: "For June, from River.",
          exact: true,
        }),
      ).toBeVisible();
      await assertNoOverflow(recipient);
      await expect(recipient.locator(".saved-gift-occasion svg")).toHaveCount(
        1,
      );
      await recipient
        .locator(".gift-reveal-scene-heading")
        .evaluate((element) =>
          element.scrollIntoView({ block: "start", behavior: "instant" }),
        );
      await capture(recipient, `gift-${occasion}-mobile.png`);
      expect(
        await recipient.evaluate(
          () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
      ).toBe(true);
      void label;
    }
    const oldToken = new URL(link.url).pathname.split("/").pop()!;
    const replacement = await post(
      sender,
      `/api/gifts/${created.gift.id}/link`,
      { replace: true },
    );
    expect(replacement.url).not.toBe(link.url);
    expect(
      (await recipient.request.get(`/api/gifts/open/${oldToken}`)).ok(),
    ).toBe(false);
    await recipient.goto(replacement.url);
    await expect(
      recipient.getByRole("button", { name: "Join them", exact: true }),
    ).toBeVisible();
    await post(sender, `/api/gifts/${created.gift.id}/revoke`);
    await recipient.reload();
    await expect(
      recipient.getByRole("button", { name: "Join them", exact: true }),
    ).not.toBeVisible();
    await expect(
      recipient.getByText(/no longer available|unavailable|revoked/i).first(),
    ).toBeVisible();
  } finally {
    await senderContext.close();
    await recipientContext.close();
  }
});
