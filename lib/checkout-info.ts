import { config } from "./config";
export function taxDetails(amount: number) {
  const policy = process.env.TAX_POLICY || "unconfigured";
  const bps = Number(process.env.SALES_TAX_BPS || 0);
  const development =
    config.mode === "development" && !process.env.STRIPE_SECRET_KEY;
  const valid = Number.isInteger(bps) && bps >= 0 && bps <= 10000;
  return {
    taxMinor:
      development || policy === "not_applicable"
        ? 0
        : policy === "inclusive" && valid
          ? Math.round((amount * bps) / (10000 + bps))
          : null,
    taxesIncluded: true,
  };
}
export function checkoutInformation() {
  const policy = process.env.TAX_POLICY || "unconfigured";
  return {
    oneTimePurchase: true,
    taxesIncluded: true,
    taxExplanation:
      config.mode === "development" && !process.env.STRIPE_SECRET_KEY
        ? "Development checkout: $0.00 sales tax. No real payment or tax is collected. The displayed total includes all charges."
        : policy === "inclusive"
          ? "Applicable sales taxes are included in the displayed total; there are no additional checkout charges."
          : policy === "not_applicable"
            ? "No sales tax applies under the operator’s verified tax configuration. There are no additional checkout charges."
            : "Tax treatment requires operator configuration. Live purchases are disabled.",
    supportUrl: "/support",
  };
}
