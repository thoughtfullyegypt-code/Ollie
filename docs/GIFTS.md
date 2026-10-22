# A Seat Saved for You

This feature extends the existing table, original character components, orders, payment events, and seat inventory. It does not create a second purchasing system. The five occasions are birthday, congratulations, thank you, I miss you, and just because.

## Creating a surprise

Open **Save a seat for someone** from the homepage, the two-seat package, or an owned seat. Customize the sender and a suggested recipient character, choose a dish and occasion prop, write a private message, and preview the recipient experience before paying. Names are limited to 30 characters; the message accepts up to 1,000 characters with paragraphs and emoji. Example messages require an intentional selection or edit.

The browser retains the anonymous gift draft through navigation, authentication, and recoverable checkout errors. Drafts contain the authored personal message: use a trusted device, and clear the draft when finished on a shared device. This is local recovery storage, not a promise that browser data can always be recovered.

The two-seat experience uses the current server-configured pair price. For an existing owner, the server first checks whether an eligible neighboring seat is already owned, then whether an adjacent single seat can be purchased. Already owned seats are not charged again. If no suitable adjacent seat is available, the sender can review an available pair elsewhere at the current pair price; their original seat remains where it is. A preview or quote does not reserve inventory. The existing atomic checkout transaction determines availability.

Checkout distinguishes the two public guest profiles from the private gift letter. The letter is never copied into a public profile, an order's public character draft, analytics, search, or social preview. Suggested recipient art is editable by the recipient after claiming; it does not imply that the recipient has already joined.

## Gift and payment lifecycle

Gift delivery and seat ownership are separate:

| Situation                           | Behavior                                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Draft                               | The sender can revise and preview it. No recipient link is active.                                                                                                                                                 |
| Awaiting payment                    | The normal order and exact selected seats are reserved through existing checkout rules. A browser return does not activate the gift.                                                                               |
| Confirmed fulfillment               | The gift becomes ready only after the server confirms successful payment and the exact purchased inventory. Eligible owned seats can make a gift ready without another charge.                                     |
| Failed payment or expired checkout  | The unpaid surprise cannot be read. The sender keeps their authored draft and can review seating for a new attempt after the old order is terminal.                                                                |
| Repeated checkout request           | Reuse the associated pending order rather than charging again for the same prepared gift.                                                                                                                          |
| Revoked or replaced link            | Server access through the old bearer link stops. Already viewed or copied text cannot be recalled.                                                                                                                 |
| Qualifying refund or cancellation   | A refund affecting either required seat makes the surprise unavailable. Payment and seat records retain their existing financial workflow.                                                                         |
| Sender account deletion             | Gift delivery is disabled as part of the existing deletion request; financial records follow the documented retention review.                                                                                      |
| Recipient claims the guest          | The recipient controls their character and public profile. The sender retains control over their authored letter and gift link, not the recipient's seat.                                                          |
| Sender edits a letter after reading | Future server openings show the latest authored message. An already-open page retains its earlier snapshot until reloaded. The sender dashboard records the update time; viewed or copied text cannot be recalled. |

Gifts are replayable while ready and within the actual display service. They do not promise permanent hosting. Existing service terms, refund terms, and support processes continue to apply.

## Recipient experience

Opening a secret link shows a folded invitation and a **Join them** button. It does not automatically play the surprise or claim a seat. The recipient can skip the short arrival sequence at any time, open the letter, replay it, explore the table, or send the single predefined **Thank you ❤️** response without registering. The response is sent to the gift's sender and appears in their gift and seat management views; it does not send an external email.

Reduced-motion mode provides the same invitation, scene, occasion, and letter without waiting for animation. Keyboard controls and readable HTML remain available. An animation/rendering fallback preserves access to the message.

**Make this guest yours** is a separate explicit ownership action. It requires a verified account and a short-lived, user-bound claim credential. Reading or replaying the letter never consumes the gift, changes ownership, or counts as a claim. A guest can be assigned once; other owners and repeated claims cannot overwrite the recipient.

## Link privacy and sharing

Gift links are bearer links: anyone who receives the link can read the surprise. The server generates unguessable tokens and stores their hashes. If a sender loses the raw link, they generate a replacement; the previous link then stops working. Link revocation cannot erase a screenshot or text someone already copied.

Private gift pages and API responses use no shared caching, noindex directives, and a no-referrer policy. They contain no third-party trackers. Application error logging records safe operational metadata instead of gift URLs, tokens, messages, names, or request bodies. Deployments must also redact private gift paths and bodies in proxy, CDN, tracing, and external error-reporting logs.

Default social previews say **Someone saved you a seat.** Downloaded invitation art can feature the suggested pair and branding, but does not expose the recipient's name, letter, bearer token, or ownership-claim credential. Public image identifiers grant no reading or claiming rights. A crawler fetching metadata or an image cannot trigger reveal playback or seat assignment.

Opening a native share sheet records an invocation, not proof that a message was sent. Copy-link remains available if native sharing fails.

## Accounting and configuration

Gift purchases use existing authoritative packages, hosted checkout, verified payment events, and fulfillment. They enter the existing donation calculation through the normal eligible order exactly once; there is no second gift donation ledger or automatic transfer of money. Complimentary or reused seats do not create fictional sale revenue.

Apply migrations `0005_gifts` and `0006_gift_orders` using the normal migration command. Gifting requires the same database, verified authentication, checkout, webhook, service terms, support, and production gates as other purchases. No recipient email address, phone number, birthday, external messaging service, or new payment credential is required. Development payment completion is an explicit local simulator, not evidence of a hosted Stripe test transaction.

Before launch, verify the hosted Stripe test flow and external webhook delivery, production email verification, deployed proxy rate-limit identity, private-route log redaction and caching behavior, account deletion handling, and the existing launch checklist. Physical iPhone/Safari execution remains a separate device check; Chromium touch emulation does not establish it.

## Operational details

Lookup, claim, and thank-you budgets are stored in PostgreSQL. Failed public lookups consume their budget even when gift validation fails. The default unverified-proxy deployment uses a conservative shared anonymous identity; configure the existing trusted edge only after verifying that it overwrites client headers and blocks direct origin access.

A payment dispute or refund review can temporarily block reading while the related order is not in its paid state. A resolved dispute can restore reading through the original link. A confirmed full refund or fulfillment failure makes delivery unavailable and invalidates claim credentials. A private gift does not override the service period or account-retention rules for its paid seats.

There is no read receipt: a crawler or ordinary read does not set a reveal/read timestamp, start an animation, consume the link, or claim a guest. Message edits apply to future server openings. An already-open page retains its earlier snapshot until reloaded; replaying that page does not fetch a replacement letter. The sender dashboard records the update time, and someone can retain an earlier copy. Claiming a guest is the deliberate verified-account action which may place the recipient's chosen public profile into the existing manual moderation queue.

If a related source seat, account, or cancellation changes while a valid gift checkout is pending, the application does not silently release provider-held inventory or substitute another seat. A later successful payment retains the exact purchased seats, leaves the undeliverable gift unavailable, and creates one auditable support issue for refund review or a customer-approved replacement. Repeated payment events cannot duplicate that issue. Revoking a gift link is not a payment cancellation.
