# Application architecture

## Runtime

Next.js App Router and React render the public table, guest builder, account tools, and protected administration pages. Public text stays in HTML; characters, dishes, and table props are reusable original SVG components under `components/art/`. Locally bundled Fraunces and DM Sans fonts avoid a runtime font service. Social previews are server-rendered 1200×630 PNGs using the same editable drawings and fonts.

PostgreSQL stores the authoritative state. Drizzle declares the relational schema, and the versioned SQL migration includes database checks and indexes. Domain operations use PostgreSQL transactions and locking. Local development starts a persistent actual PostgreSQL server through `embedded-postgres`; this is not a browser/localStorage substitute for seat inventory.

Better Auth owns magic-link sign-in, session management, and its PostgreSQL-backed authentication rate limiter. No application password hashing or custom authentication cryptography is introduced. The explicit development inbox supports only development test identities and must remain inaccessible in production.

## Data boundaries

| Concern                  | Primary records                                           | Public?                                                                   |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| Identity and sessions    | `user`, `session`, `account`, `verification`, `rateLimit` | No                                                                        |
| Finite world             | `neighborhoods`, `seats`                                  | Seat number, neighborhood and safe allocation state only                  |
| Money                    | `orders`, `order_items`, `payment_events`                 | No; owners/admins have scoped views                                       |
| Holds                    | `reservations` and seat hold reference/expiry             | Safe availability only                                                    |
| Guest content            | `profiles`, `moderation_decisions`                        | Only published approved guest fields                                      |
| Invitations              | hashed-token `invitations`                                | Secret-token route resolves minimal invitation data; PNG uses public UUID |
| Reactions                | `reactions`                                               | Aggregate count only                                                      |
| Safety                   | `reports`, `support_issues`, `audit_events`               | Authorized operator views only                                            |
| Runtime product settings | `settings`                                                | Only safe public prices/labels are exposed                                |

Currency is stored as integer USD minor units. Pricing comes from server configuration, never a submitted client total. Public-profile queries exclude pending/private/hidden content and exclude seeded fixtures in production mode.

## Stable table mapping

Seats are numbered 1–10,000. For seat `n`, `column = floor((n−1)/2)`. Odd seats sit on the far edge; even seats sit on the near edge. The opposite seat is `n+1` for odd seats and `n−1` for even seats. Same-edge neighbors are `n−2` and `n+2`, clipped to the finite world. Neighborhoods initially span consecutive 1,250-seat ranges. A seat keeps its permanent number even if its public guest name changes.

The scene mounts a nearby window of columns plus a buffer rather than all 10,000 detailed guests. The overview jumps across the finite table. Search/list views are HTML alternatives to the scene and do not require dragging.

## Inventory and payments

Allocation state is independent of order payment state and profile visibility. A paid seat may have pending or hidden content; a hidden guest does not erase a transaction.

Multi-seat reservation runs in a single transaction. Conflicting seat choices fail rather than partially reserving a group. Inventory mutation uses a transaction-scoped advisory lock and row locks: this correctness-first implementation serializes allocation changes. Measure contention and throughput before a high-volume launch; no scale target is claimed from local tests.

Stripe Checkout sessions are created server-side from authoritative order records, with stable idempotency parameters when a checkout is resumed. The actual credential mode is checked before creating a hosted session; declaring test mode cannot authorize a live credential. A signed webhook or provider reconciliation confirms payment; a browser redirect cannot fulfill an order. Event identifiers are stored for idempotence. Paid results must not be undone by later failure/expiry events. Inventory cannot be silently released while the provider session may still accept payment. A successful charge with a conflicting allocation becomes a support issue; there is no silent replacement seat.

Development payment controls are explicit and gated. They drive the same domain event handler without charging a card and must not be described as a verified Stripe integration. Stripe test-mode hosted Checkout requires configured test credentials and signed webhook delivery.

## Invitations

Courtesy and already-paid invitations are separate types. A courtesy invitation can temporarily hold one nearby available seat and requires a separate purchase. A paid claim invitation transfers customization control of an included group seat to a verified recipient without a second charge.

Tokens are generated with secure randomness, stored as hashes, checked server-side, revocable, and time limited. Claimed invitations cannot be reused to transfer the seat again. Courtesy expiry must never release someone else's checkout or purchased seat. An expired courtesy link stays useful by explicitly offering the nearest available alternative before purchase.

Social image URLs contain a public invitation ID, not the secret claim token. They show only public source-guest data and an empty chair. Invitation pages use a no-referrer policy; production logging must also redact token paths and authentication URLs.

## Moderation and operations

New or changed public content enters the manual queue. Pending guests display as neutral reserved chairs. Operators can approve, hide, restore, disable a link, review reports, inspect invitation activity and payment/support issues, and make auditable configuration decisions. Financial remedies remain separate from content decisions. Every admin route checks the current server-side role; hiding a navigation link is not authorization.

Pass the Bread is a predefined reaction with deduplication, server rate limits, and owner opt-out. It creates no text message, online-presence assertion, or leaderboard.

Deletion requests hide public profiles and revoke unclaimed invitations immediately, while creating a support record for operator handling of paid entitlements and retained financial records. This is a deletion request workflow, not a claim that every record in live storage and backups is instantly erased.

## Resilience and limits

The table reads are safe public snapshots. If refresh fails, browsing should retain the previously loaded scene and report the error. Checkout always rechecks server availability. No WebSocket presence system, real-time customer activity feed, external moderation guarantee, or production analytics service is claimed.

Before launch, verify deployed TLS/cookies, log redaction, proxy/header trust, abuse limits across replicas, external email delivery, Stripe signed events, monitoring, support staffing, and database restore. Configure real operator policies and keep live purchases disabled until those checks are recorded.
