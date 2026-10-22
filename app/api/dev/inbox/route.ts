import { z } from "zod";
import { readDevInbox } from "@/lib/auth";
import { devToolsEnabled } from "@/lib/config";
import { fail, json } from "../../_utils";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (!devToolsEnabled()) return json({ error: "Not found." }, 404);
    const email = z
      .string()
      .email()
      .max(254)
      .parse(new URL(request.url).searchParams.get("email"));
    if (!email.toLowerCase().endsWith("@example.test"))
      return json(
        { error: "Use an @example.test address for development sign-in." },
        400,
      );
    return json({ development: true, messages: await readDevInbox(email) });
  } catch (e) {
    return fail(e);
  }
}
