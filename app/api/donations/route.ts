import { publicDonationSummary } from "@/lib/donations";
import { fail, json } from "../_utils";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return json({ commitment: await publicDonationSummary() });
  } catch (e) {
    return fail(e);
  }
}
