# Beyond the table: accounting and reporting

## Operator setup before any public claim

Donation messaging is off by default. The operator must configure and verify all of the following through the protected donation administration interface:

- The recipient charity's verified name and official HTTPS website.
- The supported cause.
- The effective start date.
- The first calendar-quarter reporting period, with an exclusive end date.
- The quarterly donation schedule.
- The final approved commitment wording.
- Confirmation that the recipient has been verified and the operator actually follows the accounting practice of setting the funds aside.

Enabling the setting without these requirements must not produce a public claim. Do not invent a recipient, imply a partnership, publish placeholders, or describe an accrued amount as already donated. The exact approved wording needs operator and jurisdiction-specific review.

The configured public language is: “A little good beyond the table.” The commitment sets aside 10% of eligible seat sales for the configured recipient and cause, with donations made quarterly whether or not the table fills. It is not conditional on selling 10,000 seats.

## Eligible revenue and rounding

The basis is settled seat-sales revenue, excluding collected sales tax and refunded or disputed amounts, before payment-processing fees and operating expenses. Only USD is currently supported. Never combine another currency into USD totals without an approved conversion policy and a deliberate implementation change.

Development payments, demonstration characters, seed orders, and complimentary guests are excluded from eligible sales. A public guest count is not a donation-revenue source. Settlement/refund/dispute data comes from server-confirmed financial events, not frontend actions.

Accrual uses 10% of cumulative eligible integer USD minor units, rounded to the nearest cent with half-up rounding. Each ledger entry is the difference between the newly rounded cumulative accrual and the previous rounded accrual. This avoids changing the promised amount merely by splitting an otherwise identical revenue total across multiple orders or event deliveries.

The ledger is append-only. Stable provider event identifiers and order financial state make repeated events idempotent. Partial refunds and disputes affect the eligible basis; later corrections append adjustments rather than overwriting a published record. Provider refund/dispute totals are cumulative gross amounts. When a partial refund or dispute includes collected tax, the provider must supply the corresponding refunded/disputed tax amount. For example, a $11.00 settled charge with $1.00 tax and a $5.50 gross refund containing $0.50 refunded tax leaves $5.00 eligible revenue. If a taxable partial adjustment lacks that breakdown, the order is marked for financial review and excluded from accrual until reconciliation; the application does not assume a proportional tax allocation. A full refund or full dispute excludes the entire charge. The current checkout collects zero additional tax, but production tax treatment still requires verification.

A larger cumulative partial refund or dispute requires a newly verified cumulative tax breakdown; a previous smaller adjustment's tax figure cannot be reused. Event occurrence ordering also prevents an older dispute event, including a same-second tie, from reopening a case that has already been won. Unresolved taxable financial adjustments hide public commitment messaging and block report publication until a host reconciles the provider facts through the protected interface. Reconciliation records facts; it does not initiate a refund, payment, or donation.

## Quarterly reports and later adjustments

A published report records a completed calendar quarter, a reporting cutoff, and its immutable ledger/receipt snapshot. Reports must distinguish:

- The 10% commitment, which is a policy rather than money already paid.
- Amount accrued from eligible confirmed revenue.
- Amount actually donated, supported by published redacted receipts.

When an order is refunded or disputed after its original quarter was published, the change is recorded as an adjustment in the next open quarter and references the earlier order/period. The earlier published report remains unchanged. The adjustment offsets future amounts; it does not silently erase a real recorded donation or imply that already donated money was recovered. Negative adjustments in a later quarter are allowed. The cumulative accrued total stays nonnegative; the amount outstanding is the greater of zero or accrual minus published donations. Any excess of actual donations over adjusted accrual is reported separately, rather than pretending a donation was clawed back.

Essential recipient and effective-date changes are locked once accounting history exists. A new recipient or materially different commitment needs an explicitly planned new commitment/version migration, rather than rewriting previous reports.

## Recording real donations and receipts

The application never transfers funds or initiates a donation. The operator makes any donation outside this application and then records the actual donation date, amount in integer minor units, currency, recipient, and reporting period.

Receipt uploads accept PDF, PNG, or JPEG only, with signature checks and a maximum size of 5 MiB. The operator must redact personal/account/payment details before uploading and explicitly confirm the redaction. Arbitrary SVG, HTML, executable files, and unredacted evidence must not be published.

An uploaded receipt is not public until it is included in an explicitly published report with redaction confirmation. Actual-donation totals include only published receipts. If no published donation has occurred, the public page says so; no projected total or fabricated counter is displayed.

The public Beyond the table page shows the verified recipient/cause, calculation, effective date, reporting schedule, cutoff, accrued amount, actual donations, published receipts, and adjustment explanation. If the commitment is inactive or incomplete, the homepage, footer, and checkout hide donation messaging.

## Launch checks

Verify actual provider settlement, tax, partial-refund, dispute and dispute-resolution events using Stripe test credentials and signed webhook delivery. Local synthetic event tests verify internal logic but do not establish external Stripe delivery. Reconcile financial records, review the first reporting period and wording, establish quarterly operational ownership, and document receipt retention/backup handling before making the public commitment active.
