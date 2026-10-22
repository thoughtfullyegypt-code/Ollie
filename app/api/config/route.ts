import { getPackages, getNeighborhoods } from "@/lib/domain";
import { publicConfig } from "@/lib/config";
import { publicAnalyticsConfig } from "@/lib/analytics";
import { fail, json } from "../_utils";
import { checkoutInformation, taxDetails } from "@/lib/checkout-info";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const config = publicConfig();
    return json({
      ...config,
      brandName: config.brand,
      livePaymentsEnabled: config.livePayments,
      analytics: publicAnalyticsConfig(),
      packages: (await getPackages()).map((p: { amount: number }) => ({
        ...p,
        ...taxDetails(p.amount),
      })),
      ...checkoutInformation(),
      neighborhoods: await getNeighborhoods(),
    });
  } catch (e) {
    return fail(e);
  }
}
