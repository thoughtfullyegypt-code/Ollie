# Launch gate

Live purchases stay disabled until these checks have evidence. A green local development flow does not complete external service or legal checks.

- [ ] Real operator identity, contact/address, eligible jurisdictions, age policy, and adopted final policy documents.
- [ ] Actual service commitment and refunds match checkout and policy pages; operator decisions reviewed for the intended jurisdictions.
- [ ] Monitored support email, payment-conflict/refund process, content appeals process, and incident contact.
- [ ] Production PostgreSQL migrations, least-privilege access, backups, successful restore drill, and recovery objectives.
- [ ] Development seed excluded; no fixture guests counted or shown as real customers.
- [ ] `APP_MODE=production`, `ENABLE_DEV_TOOLS=false`; dev inbox and dev payment endpoints inaccessible.
- [ ] Strong private authentication secret, HTTPS origin, verified email sender, real email delivery, session security and admin authorization tested.
- [ ] Server-authoritative final USD prices adopted. Set and verify `TAX_POLICY` (`inclusive` or `not_applicable`), `SALES_TAX_BPS`, and `TAXES_VERIFIED`; inclusive tax requires an active inclusive `STRIPE_TAX_RATE_ID` matching the configured percentage. The displayed total must remain the exact checkout total.
- [ ] Stripe test-mode hosted purchase verified end to end with signed webhook; no fulfillment from return URL.
- [ ] Duplicate, delayed, failed, abandoned, refunded, disputed, and out-of-order event behavior verified against provider test records.
- [ ] Reservation expiry matches Stripe session expiry; reconciliation and support issue handling operational.
- [ ] Courtesy holds cannot displace paid/checkout seats; claim invitations are private, revocable, and require verified recipients.
- [ ] Manual moderation staffed; pending content neutral, reports and appeals usable; unsafe links removable.
- [ ] Trusted ingress overwrites X-Real-IP, strips attacker-supplied forwarding headers, blocks direct origin access, and both proxy verification flags are set truthfully; PostgreSQL-backed authentication limits verified across the deployed replicas.
- [ ] Production security headers, rate limits, request limits, logging redaction, uptime/error monitoring, and privacy retention policies checked.
- [ ] Mobile, keyboard, reduced motion, list view, narrow/landscape screens, and social image/share checks completed.
- [ ] Performance measured on a representative phone/network; budgets documented with actual measurements.
- [ ] Explicit user authorization to publish and enable live payments. No such authorization is implied by building this preview.

Only after these are complete should the operator set `POLICIES_VERIFIED`, `PRICING_VERIFIED`, `TAXES_VERIFIED`, and `LAUNCH_VERIFIED` truthfully and explicitly enable live payments. Keep a rollback path that disables new sales without losing access to paid records and support tools.

Public donation claims have a separate gate. The host must supply a verified recipient name, official HTTPS website, supported cause, effective date, first calendar-quarter reporting period, quarterly schedule, and approved commitment wording. Recipient verification and the actual accounting practice of setting aside funds must be confirmed before enabling the commitment. No recipient, partnership, donation, or receipt is assumed by this delivery.
