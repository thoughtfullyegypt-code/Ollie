import { ingestClientEvent, publicAnalyticsConfig } from "@/lib/analytics";
import { actorHash, assertOrigin, body, fail, json } from "../_utils";
export const dynamic = "force-dynamic";
export async function GET() {
  return json(publicAnalyticsConfig());
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    return json(
      await ingestClientEvent(await body(request), {
        abuseKey: actorHash(request),
        privacySignal:
          request.headers.get("sec-gpc") === "1" ||
          request.headers.get("dnt") === "1",
      }),
    );
  } catch (error) {
    return fail(error);
  }
}
