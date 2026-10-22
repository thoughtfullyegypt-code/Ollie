# Guest creation, attribution and sharing

## Purchase journey

The public action opens character creation before authentication. The draft stores the selected original artwork options, dish, display name, dinner message, optional safe website, seating preference, exact seat selection, selected package, and current stage locally. A hydration guard prevents the initial empty React render from overwriting a saved draft. Sign-in and a declined development payment retain the draft.

The server remains authoritative for packages and inventory. The single-seat package is selected by default; choosing two or six seats requires a fresh adjacent-seat selection and a review of every exact seat number. The checkout request includes the reviewed integer amount, so a price change can require a refreshed preview instead of charging a silently different price. Client-submitted amounts never determine the actual charge.

Local development checkout collects no payment or sales tax. Production requires an explicitly verified inclusive-tax or not-applicable policy; inclusive tax must use an active inclusive Stripe tax rate matching the configured percentage. Prices remain the exact final total. The checkout explains that total and the configured display-service period. A digital seat is a one-time customization/display service, not real-world property or investment rights. New guest text still enters moderation after fulfillment.

## Invitation moment

The arrival scene requires an authenticated, server-confirmed paid order, ownership of its primary chair, and purchased inventory for every original exact order item. A friend may already own a successfully claimed secondary chair; this does not prevent the buyer revisiting their arrival scene. New paid invitations are limited to eligible secondary chairs the buyer still owns. A payment-provider return URL cannot fulfill inventory. In a group order, the buyer invites a friend to claim an already-paid secondary seat; that recipient does not pay again. A single-seat courtesy invitation is a distinct nearby purchase with a temporary hold and an explicitly disclosed price and expiry.

Native sharing is optional. Invoking the device share sheet is recorded only as an invocation, never as proof that the person shared. Copy-link remains available when native sharing fails. Social images use a public preview identifier rather than a private claim token; pending free-text profile content must not become an unmoderated public image. Keep claim links private and redact authentication/invitation paths in deployment logs.

## Privacy-conscious events

Without an external analytics provider, the application has a working first-party development adapter backed by PostgreSQL. It records events which actually occur; it does not synthesize visits, conversion rates, purchases, or shares.

Production browser event collection is disabled by default. Both `ANALYTICS_ENABLED=true` and `ANALYTICS_PRIVACY_APPROVED=true` are required, together with explicit visitor consent. Global Privacy Control and Do Not Track are respected. No third-party analytics destination is used by this adapter.

Allowed client events cover the main CTA, opening/completing customization, selecting a seat/package, starting checkout, opening an invitation, and invoking a share action. Allowed properties are restricted to safe product identifiers and categorical action details. Do not add names, email addresses, dinner messages, private invitation/authentication tokens, full URLs, payment details, or visitor IP identifiers to event payloads.

Confirmed fulfillment, referral fulfillment, invitation creation, and a paid group-seat claim are recorded on the server. Stable one-way order/invitation event keys deduplicate repeated webhooks and retries. These operational records do not depend on a browser success redirect or proof that a visitor accepted optional browser analytics.

### Attribution rule

Attribution uses the first nonsecret campaign or referral touch within a maximum 30-day window. Supported fields are `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and the invitation's public UUID referral identifier. A referral identifier provides attribution only; it cannot grant access to a paid seat or replace the secure invitation token.

The browser stores only the allowlisted attribution fields locally, retains them through authentication and checkout, and submits the attribution with the order. Later campaign visits do not overwrite a valid first touch. Expired attribution is discarded. Private `invite`, `token`, email, and other arbitrary query fields are not collected. A visitor can clear local attribution/consent through the exported privacy controls.

Client analytics records have a 90-day retention policy. Deidentified server event deduplication records are retained with the corresponding business facts. Operators should include this local-storage and event behavior in the final privacy notice and review retention before launch.

## Promotional staging

The host-only studio stages illustration components separately from real inventory and orders. Its demo label must remain visible in recording mode even when controls and other visual clutter are hidden. The scene can show an empty chair, a guest arriving, nearby illustrated neighbors, and an invitation napkin without pretending to show a real customer's activity.

The studio is intended for reproducible browser recording. No video export or finished recording is supplied. To reproduce it:

1. Sign in with a verified administrator account and open `/admin/studio` through **Promotional scene studio** at the host’s desk.
2. Use a landscape desktop window. **Start scene** rehearses the four stages; each labeled storyboard button can also select a stage.
3. Open **Browser recording mode** (`/admin/studio?record=1`). Controls disappear, while the demonstration watermark remains visible.
4. Start the operating system or browser screen recorder, reload the page, and record for about five seconds. The chair begins empty, the guest arrives, the nearby company appears, and the napkin is revealed.
5. Stop and inspect the recording before sharing it. With reduced motion enabled, the final scene appears immediately instead of animating.

The route remains protected even in recording mode. This delivery captures still screenshots of the studio, not a video. No public deployment or real payment/donation is authorized by using the studio.
