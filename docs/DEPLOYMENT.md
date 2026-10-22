# A Seat at the Internet — operations and deployment

This is an application preview with live purchases disabled by default. Development payment completion is explicitly labeled and uses the same inventory fulfillment domain, but is **not a hosted Stripe test transaction**. Do not describe a development completion as evidence that Stripe credentials, webhook delivery, or a real charge works.

## Local setup

Use the existing checkout at `/workspace/Ollie`. Cloud tasks are already isolated; do not create a Git worktree unless the user explicitly requests one. Use Node.js 24 and the committed npm lockfile.

```sh
cd /workspace/Ollie
npm ci
test -f .env.local || cp .env.example .env.local
```

Preserve any existing `.env.local`. Set `BETTER_AUTH_SECRET` to a securely generated random string of at least 32 characters (the root README includes a command that writes a blank secret field without printing it). Do not reuse the example development database credentials outside a local isolated instance.

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Start PostgreSQL in a separate terminal and keep it running:

```sh
npm run db:start
```

Then migrate, seed development fixtures, and start the app:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

`db:start` runs a local PostgreSQL process on loopback port 54329 with persistent data outside the checkout under `DEV_DATA_DIR/postgres` (cloud default `/workspace/.seat-at-internet-data/postgres`). Production must use a managed PostgreSQL instance with independent credentials, network access controls, TLS as required by the provider, backups, and monitoring. The development seed is idempotent and is not a customer migration; do not run it against a production database.

Development fixture guests are marked `isDemo`. They must never be represented as real purchasers. Development authentication is restricted to the explicit development tools configuration and test email identities ending in `@example.test`. The development inbox displays local sign-in links rather than sending mail. Claim links, authentication links, and inbox entries are credentials: keep them private, never include them in analytics, and disable development tools before deployment.

For an isolated development-only bootstrap, `bash scripts/setup.sh` installs locked dependencies, creates `.env.local` with a random secret only when the file is absent, starts or checks PostgreSQL, applies migrations, seeds development fixtures, and builds Next.js. It preserves existing configuration and refuses non-development application mode. Supply any missing values in an existing configuration before running it. Start the web process separately with `npm start` (or use `npm run dev` for editing).

## Build and run

```sh
npm run typecheck
npm test
npm run build
npm start
```

See `VERIFICATION.md` for the actual recorded outcomes. Live processes do not survive a cloud snapshot: restart PostgreSQL when using the embedded local development database, then restart Next.js. Dependency files and the database cluster persist on disk; server processes and open connections do not.

Development PostgreSQL and the local magic-link inbox live under `DEV_DATA_DIR`. For this cloud checkout use `/workspace/.seat-at-internet-data`, outside `/workspace/Ollie`, to keep database writes and inbox updates out of the Next.js development watcher. Keep `DEV_DATA_DIR` consistent for the database runner, tests and Next.js. The runner defaults to a sibling `.seat-at-internet-data` directory; configure the variable explicitly for a custom installation. Do not deploy the local inbox in production.

## Production configuration

1. Provision PostgreSQL with a dedicated least-privilege application role; use a separate migration role if appropriate. Supply `DATABASE_URL` privately. Apply committed migrations and verify all constraints/indexes.
2. Set `APP_MODE=production`, `ENABLE_DEV_TOOLS=false`, a strong `BETTER_AUTH_SECRET`, and consistent HTTPS `APP_URL` / `BETTER_AUTH_URL` / `NEXT_PUBLIC_SITE_URL`. Set `NEXT_PUBLIC_BRAND_NAME` and the real domain before building; public environment variables are bundled into browser assets, so rebuild after changing them. No trademark clearance is claimed.
3. Configure a verified sender and `RESEND_API_KEY` / `EMAIL_FROM`. Test sign-in email delivery, callback origin restrictions, cookie security, session expiration, and logout. Set `ADMIN_EMAILS` to the authorized operator accounts; verify ordinary users receive 403 on every administrative write.
4. Configure a monitored `SUPPORT_EMAIL`. Adopt final service terms, privacy notice, refund policy, tax approach, and the displayed price configuration. Keep `TAX_POLICY=unconfigured` and `TAXES_VERIFIED=false` until reviewed. If applicable tax is included in the displayed price, use `TAX_POLICY=inclusive`, the verified integer `SALES_TAX_BPS`, and `STRIPE_TAX_RATE_ID` referencing an active inclusive Stripe tax rate with exactly that percentage. The server validates this rate before checkout. Otherwise use `TAX_POLICY=not_applicable` only when verified for the intended sales. No extra amount may appear after the reviewed final total. Complete operator identity and jurisdiction decisions in the policy drafts. Do not set verification flags merely to get through the gate.
5. Configure Stripe **test keys first**, with `STRIPE_MODE=test`. Use `STRIPE_MODE=live` only for an explicitly authorized live launch; this explicit selector also works with proxy-placeholder credentials. Register `/api/webhooks/stripe` with its dedicated signing secret. Opaque proxy/restricted credentials must permit Stripe Balance read access so the application can verify the credential’s actual live/test mode before creating Checkout; an unavailable or mismatched mode check leaves checkout disabled. Use hosted Checkout; card information must not pass through this application. Owner-only receipt access at `GET /api/orders/<id>/receipt` redirects to a strict HTTPS Stripe receipt only for a paid Stripe order. Development orders have no real payment receipt. Verify actual provider receipts with the configured test integration. Test signed duplicate/delayed events, payment completion without a browser return, abandoned sessions, refunds, disputes, and reconciliation.
6. Keep `LIVE_PAYMENTS_ENABLED=false` until the complete launch checklist is independently satisfied. Production payments are an explicit operator action requiring authorization; this delivery does not authorize real card charges or public publication.
7. Run `npm ci`, migrate, build, start, and verify `/api/health`. Add TLS termination, process supervision, error reporting with secret redaction, log retention, request-body limits, security headers, and uptime alerting. When enabling trusted forwarding for per-client rate limits, ensure the deployment proxy strips client-supplied forwarding headers and supplies a sanitized client address; otherwise retain conservative shared rate-limit buckets.
8. Establish an operational reconciliation schedule. The authenticated administrative endpoint is `POST /api/admin` with `{"action":"reconcile","orderId":"<order-id>"}`; the admin UI exposes the same control. No background reconciliation scheduler is included. Never release a seat because a browser timer elapsed while a Stripe session may still accept payment. Investigate fulfillment conflicts through support and confirmed refunds or customer-approved replacements.

## Reverse proxy and abuse-limit identity

Keep `TRUST_PROXY_HEADERS=false` and `TRUSTED_PROXY_VERIFIED=false` until the deployed edge is verified. By default the application ignores client-supplied forwarding headers; authentication and anonymous reactions use conservative shared rate-limit buckets. A forged `X-Forwarded-For` therefore cannot create a fresh reaction identity.

For per-client limits, configure the trusted ingress to **overwrite** `X-Real-IP` with a single validated client IP address, strip untrusted forwarding headers, and block direct Internet access to the Next.js origin. Test that a client sending a forged `X-Real-IP` cannot choose the value the application receives. Only then set both flags to `true` and restart the application. Both Better Auth and reaction/report hashing use this same single header. `X-Forwarded-For` chains are deliberately never used. Missing or invalid trusted addresses fall back to the shared bucket. Live purchases remain gated until this operator verification is recorded.

Better Auth uses its maintained PostgreSQL-backed rate-limit storage through the `rateLimit` table added in migration `0002_auth_rate_limits`. Verify limits through the actual deployed proxy and across replicas before launch. Bread/report limits are also persisted transactionally in PostgreSQL; neither path trusts arbitrary client-supplied forwarding headers.

## Network destinations

Install dependencies from `registry.npmjs.org`; trusted package downloads must retain integrity and TLS checks. Runtime external integrations use `api.stripe.com` and `api.resend.com`; hosted checkout uses Stripe's checkout domain in the user's browser. Add only required domains through the cloud configuration workflow if restricted egress prevents an operation. A configured secret is not evidence that its destination operation is authorized or functioning. Local database access is loopback; remote PostgreSQL requires the runtime's supported TCP/network configuration.

## Backups and restore

Use provider-managed encrypted backups plus periodic logical exports for a managed production database. Define and document recovery point/recovery time targets before launch; none have been measured for this preview. Keep backups outside the application host and restrict access because they include private account, token hashes, support, and transaction data.

From a host with PostgreSQL client tools and private database credentials:

```sh
pg_dump --format=custom --no-owner --no-acl --file=seat-backup.dump "$DATABASE_URL"
```

Do not print the connection string or include it in tickets. In production use a secret-injected environment and ensure process visibility policy is suitable for connection arguments. Prefer a protected PostgreSQL service/passfile configuration where supported.

Restore to a new, empty database with the matching PostgreSQL major version:

```sh
pg_restore --no-owner --no-acl --exit-on-error --dbname="$RESTORE_DATABASE_URL" seat-backup.dump
```

Start the application pointed at the restored database in an isolated, payment-disabled environment. Check migration version, the 10,000 seat mapping, allocation uniqueness, order totals, moderation visibility, and invitation revocation; run domain tests against a separate test database rather than the restored records. Verify health and a public profile. Reconcile Stripe transactions from the backup timestamp onward before accepting new checkouts. Never restore a stale database and immediately reopen sales: doing so can reintroduce previously sold seats.

Test restore regularly and record duration and verification evidence. Account deletion must include a documented backup retention/expiry policy. Deleting a live record does not erase copies in retained backups immediately. The embedded development package supplies server binaries but not `pg_dump` or `pg_restore`; install trusted PostgreSQL client tools or use the managed provider’s tools for this procedure. No restore drill has been completed for this delivery; do not mark the production recovery gate complete without one.

## Application security boundaries

Pricing, inventory locks, authorization, invitation validity, and payment acceptance run on the server. An illustrated empty chair does not prove availability. Multi-seat reservations must acquire all requested seats in one transaction. Paid fulfillment is idempotent, and a success redirect never publishes a profile on its own. Public-content state is separate from seat allocation and payment state.

Invitation secrets are unguessable, hashed, revocable, and checked server-side. Paid invitations require a verified account. Public image URLs use invitation public IDs, never secret tokens. Use a `no-referrer` policy on secret invitation pages and avoid third-party assets on those pages. Do not enable URL-based analytics or record full request URLs on token routes.

User names and messages render as text, not raw HTML. Website links accept only HTTP/HTTPS. Manual moderation queues are available without an external moderation service; they do not guarantee safe content. Administrative decisions and financial actions remain auditable. Verify that public queries cannot expose email addresses, session information, payment details, hidden profiles, or private support records.

## Not included

No chat, resale, auctions, NFTs, arbitrary uploads, complex 3D, or public launch is included. External moderation, production analytics, email delivery, Stripe webhook delivery, and host publication require configured services and their own verification. Built-in UI motion uses SVG/CSS and honors reduced-motion preferences; sound is off by default.
