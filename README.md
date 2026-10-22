# A Seat at the Internet

**The internet is a weird place. Come sit with us.**

Create your peculiar dinner guest, bring someone you love, and join a table of 10,000.

The existing illustrated dinner table remains the main experience. Visitors customize anonymously first, choose a neighborhood and exact available chairs, review the current server-priced package, then sign in and pay. A single seat remains the default; a pair includes a second already-paid seat that a friend can securely claim without paying again.

This delivery runs in a clearly labeled **development mode**. Its local checkout exercises persistent reservation, payment-event, fulfillment, and moderation logic without charging a card. Live purchases are disabled. Real hosted Stripe Checkout and email delivery require credentials and separate external verification before launch.

## Run locally

Requires Node.js 24, npm, and a supported PostgreSQL platform. The cloud workspace already has the checkout; do not create another worktree for routine development.

```sh
cd /workspace/Ollie
npm ci
test -f .env.local || cp .env.example .env.local
```

Generate a private authentication secret if the example field is still blank, without printing it:

```sh
node --input-type=module <<'JS'
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const path = '.env.local';
const contents = readFileSync(path, 'utf8').replace(
  /^BETTER_AUTH_SECRET=$/m,
  `BETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}`,
);
writeFileSync(path, contents, { mode: 0o600 });
chmodSync(path, 0o600);
JS
```

Set `DEV_DATA_DIR` to an absolute directory **outside this checkout**. The cloud default is `/workspace/.seat-at-internet-data`. The database cluster and development email inbox persist there; keeping their writes outside the Next.js project prevents development reload loops.

In a separate terminal, start the persistent local PostgreSQL server:

```sh
npm run db:start
```

Then prepare and run the application:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

The development seed is idempotent. It adds 28 explicitly labeled fictional guests; production public queries exclude development guests. It is not a production customer import. The embedded database listens only on `127.0.0.1:54329`; its published example credentials are for isolated development only.

Use the running application on port 3000. Sign in with any `@example.test` address and open the link in the on-screen **development inbox**. Use `admin@example.test` to review the host interface at `/admin`. These local inbox identities are intentionally unsuitable for production; no real email is sent. New guests enter the manual moderation queue after payment fulfillment.

For a fresh isolated cloud checkout, the optional development bootstrap performs dependency installation, local configuration creation when absent, database startup/readiness, migrations, development seeding, and an optimized build:

```sh
bash scripts/setup.sh
npm start
```

It preserves existing local bindings, securely fills a missing or blank development authentication secret, and refuses a non-development `APP_MODE`. The manual steps remain useful when using an independently managed development database. The bootstrap prepares files and starts the database; it does not publish a website or enable live payments.

## What is implemented

- Virtualized SVG table with drag, intentional horizontal scrolling, touch, keyboard, overview, search, neighborhoods, and an HTML list alternative.
- Original layered artwork: 12 guest bases, 13 accessories, 10 outfits, 12 dishes, eight decorations, natural human skin tones, reduced motion, and optional sound.
- Character-first builder with live table context, coherent random choices, saved anonymous drafts, current-price review, atomic single/group reservations, explicit local checkout, and Stripe hosted-checkout integration.
- Better Auth magic-link sessions; owner editing, visibility controls, order recovery, owner-only provider receipt access, support/deletion requests, and separate courtesy versus already-paid invitations.
- Persistent bread reactions with deduplication and rate limits; reports, manual approval, protected administration, refund/reconciliation controls, settings, and audit records.
- Post-purchase guest arrival and invitation sharing, stable public seat/neighborhood links, and server-rendered downloadable PNG social cards. Invitation image URLs never contain secret claim tokens.
- Configurable quarterly donation accounting, an append-only adjustment ledger, operator-managed redacted receipts, and public reporting that stays hidden until the full commitment is approved.
- Privacy-gated first-party acquisition events and nonsecret referral attribution. Promotional staging uses separate, clearly labeled demo art and never changes actual inventory.
- PostgreSQL schema/migrations, development seed, automated domain/API/browser tests, health checks, and deployment/backup instructions.

## Checks and screenshots

```sh
npm run typecheck
npm test
npm run test:e2e
npm run build
npm start
```

Keep PostgreSQL running for database and browser tests. Browser tests require Chromium: the cloud runner uses its existing `/usr/bin/chromium`; another environment can install Playwright Chromium or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. The E2E suite creates and removes its own test records. Do not point any test suite at customer data.

See [the verification record](docs/VERIFICATION.md) for actual results and limits, and [screenshots](screenshots/) for captured desktop/mobile views. A successful local development payment is not evidence of a real Stripe test transaction.

## Before launch

Configure a managed PostgreSQL database, real domain and HTTPS, verified email sender, Stripe keys and signed webhooks, authorized administrators, monitored support contact, and trusted ingress. Adopt final prices, verified inclusive-tax or not-applicable treatment, service commitment, refund policy, privacy notice, operator identity, and jurisdiction-specific decisions. Production inclusive tax also requires an active inclusive Stripe tax rate matching the configured basis points. The current policy pages are clearly marked drafts; the initial proposed commitment is 12 months with refund requests within 14 days.

Live sales require explicit launch flags (including `TAXES_VERIFIED`) and recorded verification. Donation messaging stays hidden until the operator supplies the recipient’s verified name and official website, cause, effective date, first reporting period, quarterly schedule, approved wording, and confirmation that the funds are actually set aside. Do not set them merely to bypass the gate. Public deployment and real charges require explicit authorization.

- [Deployment, authentication, network access, backups and restore](docs/DEPLOYMENT.md)
- [Architecture, seat mapping and security boundaries](docs/ARCHITECTURE.md)
- [Donation accounting, reporting and operator setup](docs/DONATIONS.md)
- [Journey attribution and recording a demo scene](docs/JOURNEY_AND_SHARING.md)
- [Launch checklist and unresolved external requirements](docs/LAUNCH_CHECKLIST.md)
- [Environment example without secrets](.env.example)

The working name and domain are configurable. No trademark clearance, legal compliance, unprecedented-concept claim, or indefinite service promise is made.

## A Seat Saved for You

Open `/save-a-seat` or choose **Save a seat for someone** on the homepage, two-seat package, or owner account. Create two peculiar guests, choose one of five occasions, and tuck a private letter beside them. The recipient needs no account to read or send the predefined thank-you; claiming the paid guest requires verified sign-in and a separate explicit ownership action.

The gift uses the existing configured pair price, an adjacent single-seat price for eligible owners, or already-owned neighboring seats with no new charge. It preserves the existing order, inventory, webhook, and donation accounting systems. Apply migrations with `npm run db:migrate`; no new external service credential is required. Use the existing clearly labeled development checkout until the normal production launch requirements are verified.

See [gift lifecycle, privacy and setup](docs/GIFTS.md) and [gift verification and screenshots](docs/GIFT_VERIFICATION.md). Gift URLs are bearer secrets. Redact `/gift/*` and token-bearing `/api/gifts/open/*` URLs and bodies in any deployment proxy, analytics, tracing, or error-reporting service. Public metadata and downloadable invitation images contain no letter, recipient name, or claim credential.
