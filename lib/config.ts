/** Server-only launch configuration. Values below are never payment credentials. */
function integerSetting(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const n = raw === undefined ? fallback : Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
function validIntegerSetting(
  raw: string | undefined,
  min: number,
  max: number,
) {
  if (raw === undefined) return true;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max;
}
export const config = {
  brand: process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet",
  url: (
    process.env.APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, ""),
  mode:
    process.env.APP_MODE ||
    (process.env.NODE_ENV === "production" ? "production" : "development"),
  supportEmail: process.env.SUPPORT_EMAIL || "",
  serviceMonths: integerSetting(
    process.env.SERVICE_COMMITMENT_MONTHS,
    12,
    1,
    120,
  ),
  refundDays: integerSetting(process.env.REFUND_WINDOW_DAYS, 14, 0, 365),
};
export function stripeMode(): "test" | "live" {
  return process.env.STRIPE_MODE === "live" ||
    process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
    ? "live"
    : "test";
}
export function devToolsEnabled() {
  return (
    config.mode === "development" &&
    process.env.ENABLE_DEV_TOOLS === "true" &&
    stripeMode() !== "live"
  );
}
export function trustedProxyHeadersEnabled() {
  return (
    process.env.TRUST_PROXY_HEADERS === "true" &&
    process.env.TRUSTED_PROXY_VERIFIED === "true"
  );
}
export function launchBlockers() {
  const blockers: string[] = [];
  if (config.mode !== "production")
    blockers.push("Production application mode");
  if (!process.env.DATABASE_URL)
    blockers.push("Production PostgreSQL database");
  if (
    !process.env.BETTER_AUTH_SECRET ||
    process.env.BETTER_AUTH_SECRET.length < 32
  )
    blockers.push("Authentication secret");
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
    blockers.push("Verified sign-in email delivery");
  if (
    !process.env.STRIPE_SECRET_KEY ||
    stripeMode() !== "live" ||
    !process.env.STRIPE_WEBHOOK_SECRET
  )
    blockers.push("Live Stripe credentials and signed webhook");
  if (!config.url.startsWith("https://")) blockers.push("HTTPS domain");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.supportEmail))
    blockers.push("Valid customer support email contact");
  if (
    !validIntegerSetting(process.env.SERVICE_COMMITMENT_MONTHS, 1, 120) ||
    !validIntegerSetting(process.env.REFUND_WINDOW_DAYS, 0, 365)
  )
    blockers.push("Valid service commitment and refund period");
  if (!trustedProxyHeadersEnabled())
    blockers.push("Verified reverse proxy and sanitized client IP headers");
  if (
    process.env.TAXES_VERIFIED !== "true" ||
    !["inclusive", "not_applicable"].includes(process.env.TAX_POLICY || "")
  )
    blockers.push("Verified tax treatment and complete final totals");
  if (
    process.env.TAX_POLICY === "inclusive" &&
    (!/^txr_[A-Za-z0-9]+$/.test(process.env.STRIPE_TAX_RATE_ID || "") ||
      !Number.isInteger(Number(process.env.SALES_TAX_BPS)) ||
      Number(process.env.SALES_TAX_BPS) <= 0 ||
      Number(process.env.SALES_TAX_BPS) > 10000)
  )
    blockers.push(
      "Verified inclusive Stripe tax rate and matching sales tax basis points",
    );
  if (process.env.POLICIES_VERIFIED !== "true")
    blockers.push("Reviewed service terms, refund policy and privacy notice");
  if (process.env.PRICING_VERIFIED !== "true")
    blockers.push("Final pricing and tax configuration");
  if (process.env.LAUNCH_VERIFIED !== "true")
    blockers.push(
      "Recorded production authentication, webhook and fulfillment verification",
    );
  return blockers;
}
export function livePaymentsEnabled() {
  return (
    process.env.LIVE_PAYMENTS_ENABLED === "true" &&
    launchBlockers().length === 0
  );
}
export function publicConfig() {
  return {
    brand: config.brand,
    url: config.url,
    mode: config.mode,
    development: config.mode === "development",
    devTools: devToolsEnabled(),
    livePayments: livePaymentsEnabled(),
    serviceMonths: config.serviceMonths,
    refundDays: config.refundDays,
    supportEmail: config.supportEmail || null,
  };
}
