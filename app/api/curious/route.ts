import { getCuriousGuest } from "@/lib/domain";
import { fail, json } from "../_utils";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return json({ guest: await getCuriousGuest() });
  } catch (e) {
    return fail(e);
  }
}
