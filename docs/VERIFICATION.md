# Verification record

This record distinguishes executed checks from unverified launch requirements. Development fulfillment is not a hosted Stripe test transaction.

## Current gifting extension

The **A Seat Saved for You** extension applies migrations `0005_gifts` and `0006_gift_orders` on top of the four original migrations. The complete backend suite passed **81 tests, zero failures/skips, in 9.26 seconds**, including the 16 gift tests. The full browser suite passed **11 tests, zero failures/skips, in 1.1 minutes** against the final optimized build. The optimized build and its TypeScript check passed. See [the gift verification record](GIFT_VERIFICATION.md) for the combined browser run, current screenshots, privacy checks, and remaining production requirements.

The retained sections below record the previous table/journey release at commit `a0148ef`; their 65/9 counts describe that earlier baseline. Screenshots and the performance measurement below have been refreshed against the gifting build.

## Prior baseline: database and backend

- PostgreSQL development server starts with its cluster outside the Next.js checkout at `/workspace/.seat-at-internet-data/postgres`.
- Applied migrations: `0001_initial`, `0002_auth_rate_limits`, `0003_donations`, and `0004_journey`.
- Read-only inventory check: **10,000 seats**, **28 published development fixture profiles**.
- `npm run typecheck`: passed after the final application and test changes on 22 October 2026.
- `npm test`: **65 passed, 0 failed, 0 skipped** in **6.04 seconds** — 29 domain, 13 API/authentication/payment/receipt, eight analytics, 12 donation, and three refinement tests. These were the executed results for the earlier baseline source.

The tests exercise competing buyers, atomic groups, stable neighbor mapping, authoritative prices, payment fulfillment without a browser redirect, duplicate/out-of-order signed events, failed/abandoned checkout, expiry alignment, late fulfillment conflicts, refunds/disputes, invitation expiry/revocation/claims, ownership denial, moderation visibility, safe content and links, reaction limits, forged proxy-header resistance, actual one-time Better Auth sessions, owner-only provider receipt access with no development receipt, and development-fixture exclusion from production browsing. The added checks cover cumulative donation rounding, settled revenue excluding taxes/refunds/disputes, uncertain tax adjustments, older event ordering, immutable quarterly report snapshots, next-period corrections, redacted receipt access, donation configuration gates, sample/complimentary/development exclusions, anonymous draft restoration, referral attribution, deduplicated server fulfillment events, safe analytics allowlists, reviewed-price changes, and inclusive Stripe tax-rate validation. Synthetic Stripe signature/API fixtures never contact Stripe or charge a card.

## Reusable setup and cloud configuration

- `bash scripts/setup.sh`: **executed successfully in the current cloud instance**. The script performed locked dependency installation, reused the preserved development PostgreSQL cluster, applied migrations, reran the idempotent 28-guest seed, and completed an optimized build. Existing local configuration was preserved.
- After setup, `npm start` was restarted and the database health endpoint responded successfully.
- Reusable cloud configuration fields **`install_script` and `start_skill` were saved to the environment draft**. The install wrapper calls the checked-in setup script; the startup instructions distinguish retained files/database data from processes that must restart.
- Saving the draft did not publish it. To retain the prepared environment for future tasks, review and save the changes in environment settings, then publish the **environment snapshot** through the product.
- This does **not** publish the website or enable live payments. Publication and restoration in a fresh task have not been independently verified.

## Prior baseline: browser, build and artwork

`npm run test:e2e`: **9 passed, 0 failed, 0 skipped** in **40.2 seconds**, against the final optimized development-mode build on 22 October 2026. Earlier test selector failures were corrected and are not counted as passes. The final browser run also verified the fixed Home/End keyboard behavior without triggering native vertical scrolling.

A focused rerun of the complete anonymous single-purchase journey passed **1/1 in 12.1 seconds** after adding assertions that the guest, dish, and invitation napkin finish appearing. This refreshed the desktop arrival/invitation captures at their settled state. All screenshot variants listed below were inspected; invitation credentials are masked in owner captures.

`npm run build`: **passed**. `npm start` serves the optimized artifact in explicitly configured development mode; database health and browser journeys were checked against that artifact.

- Browser: existing Chromium with desktop, narrow phone, landscape, real Chromium touch-input dispatch and reduced-motion emulation. This is not physical iPhone/Safari testing.
- The suite checks table navigation/search/list including finite-world End/Home and seat 10,000; clear demonstration labeling and separated counts; bread reactions; public canonical guest and neighborhood links and PNG previews; curious-guest discovery; donation claims hidden while unconfigured; anonymous character drafts through reload/authentication/declined payment; single and adjacent-pair development fulfillment; invitation image URLs without claim credentials; sharing failure with a working copy option; expired courtesy alternatives; prepaid friend claim without a new order; buyer arrival revisits after a claim; owner editing; admin authorization, approval/report/hide/audit; donation setup and measurement tabs; and isolated demo staging/recording mode with reduced motion.
- Live Stripe checkout remains unverified. Development completion does exercise server reservations, payment events, exact inventory, moderation and invitations, with no card charge.
- The host studio has reproducible recording mode. **No video was exported or recorded.**

| Capture                                                        | Artifact                                                                                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop table                                                  | [`desktop.png`](../screenshots/desktop.png)                                                                                                                                           |
| Narrow phone table                                             | [`mobile.png`](../screenshots/mobile.png)                                                                                                                                             |
| Landscape phone                                                | [`mobile-landscape.png`](../screenshots/mobile-landscape.png)                                                                                                                         |
| Character builder, desktop / phone                             | [`builder-desktop.png`](../screenshots/builder-desktop.png) · [`builder-mobile.png`](../screenshots/builder-mobile.png)                                                               |
| Fulfilled arrival, desktop / phone                             | [`arrival-desktop.png`](../screenshots/arrival-desktop.png) · [`arrival-mobile.png`](../screenshots/arrival-mobile.png)                                                               |
| Invitation controls, desktop / phone, credentials masked       | [`invitation-desktop.png`](../screenshots/invitation-desktop.png) · [`invitation-mobile.png`](../screenshots/invitation-mobile.png)                                                   |
| Recipient invitation, phone                                    | [`invitation-recipient-mobile.png`](../screenshots/invitation-recipient-mobile.png)                                                                                                   |
| Owner controls, desktop / recipient phone                      | [`account-desktop.png`](../screenshots/account-desktop.png) · [`account-mobile.png`](../screenshots/account-mobile.png)                                                               |
| Protected moderation / demo studio                             | [`admin-desktop.png`](../screenshots/admin-desktop.png) · [`admin-studio-desktop.png`](../screenshots/admin-studio-desktop.png)                                                       |
| Server-rendered public / invitation / neighborhood share cards | [`share-card.png`](../screenshots/share-card.png) · [`invitation-share.png`](../screenshots/invitation-share.png) · [`neighborhood-share.png`](../screenshots/neighborhood-share.png) |

The scene test checks that fewer than 20 detailed table columns are mounted in the initial desktop region. Searches are debounced and paginated; administrative records are bounded per page. Screenshots are inspected for clipping, controls, artwork, dialog overlap and legibility. Private invitation credentials are masked in the captured owner sharing view.

### Current local performance measurement

The [performance artifact](../screenshots/performance.json), measured at **23:46:51 UTC on 22 October 2026**, records a run against the final optimized local server in fresh headless Chromium contexts. The mobile case emulates a 390×844 viewport with 4× CPU throttling; it is not a real phone, Safari, or a representative Internet connection. Timing samples come from intentional keyboard panning.

| Measurement                                      |                Desktop 1440×1000 |         Mobile emulation, 4× CPU |
| ------------------------------------------------ | -------------------------------: | -------------------------------: |
| Initial encoded JavaScript                       | 222,100 bytes across 13 requests | 222,100 bytes across 13 requests |
| Mounted table columns, initial / after pan       |                          11 / 13 |                            6 / 8 |
| Panning frame interval, median / 95th percentile |                   16.7 / 16.8 ms |                   16.7 / 33.4 ms |
| Worst observed frame interval                    |                          33.4 ms |                          50.1 ms |
| Local navigation load                            |                           358 ms |                           675 ms |
| Document / viewport width                        |                   1440 / 1440 px |                     390 / 390 px |

The development budgets of ≤512,000 encoded JavaScript bytes, fewer than 20 mounted columns, and an indicative local 95th-percentile panning frame interval ≤34 ms were met in this run. The [earlier measurement before the SVG/compositing optimization](../screenshots/performance-before-optimization.json) is retained as historical evidence. These are individual local observations, not a guaranteed frame rate. No production throughput, real-network, physical-phone or Safari target is claimed.

The original editable artwork system contains 12 guest bases, 13 accessories, 10 outfits, 12 dishes, eight decorations, and six human skin tones. Motion includes eye blinks, soup steam, candle flicker and an astronaut’s floating straw; reduced-motion and explicit motion controls are implemented.

## Checks not established by local results

- Real hosted Stripe test checkout, external signed-webhook delivery, provider reconciliation, real refund/dispute delivery, and actual provider receipts: **not run; external credentials unavailable**.
- Production email delivery and domain/sender verification: **not run**. Development email is a clearly labeled local inbox.
- Public deployment or live card charges: **not authorized or performed**. Live purchases remain disabled.
- Production database backup/restore drill: **not run**. A procedure is documented in `DEPLOYMENT.md`; the embedded server package does not include PostgreSQL dump/restore client tools.
- Ordinary-phone hardware, Safari/iPhone execution, real-network performance, production throughput and recovery objectives: **not measured**. Local Chromium dimensions or touch emulation must not be presented as those results.
- Operator identity, jurisdiction-specific policy review, monitored support contact, final pricing/tax treatment, deployed proxy trust and production monitoring: **outstanding launch requirements**.

See `LAUNCH_CHECKLIST.md` before adopting the policy drafts, publishing publicly, or enabling live payments.
