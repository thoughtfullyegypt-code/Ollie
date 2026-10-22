import { requireAdmin } from "@/lib/auth";
import { recordDonationReceipt } from "@/lib/donations";
import { assertOrigin, fail, json } from "../../../_utils";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await requireAdmin(request.headers);
    const max = 5300000;
    if (Number(request.headers.get("content-length") || 0) > max)
      return json({ error: "Receipt upload exceeds 5 MB." }, 413);
    if (!request.body)
      return json({ error: "Choose a redacted receipt." }, 400);
    const reader = request.body.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > max) {
        await reader.cancel();
        return json({ error: "Receipt upload exceeds 5 MB." }, 413);
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    const limited = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: bytes,
    });
    const form = await limited.formData();
    const file = form.get("file");
    if (!file || typeof file === "string")
      return json({ error: "Choose a redacted receipt file." }, 400);
    return json(
      await recordDonationReceipt(
        user.id,
        Object.fromEntries(
          [...form.entries()].filter(([key]) => key !== "file"),
        ),
        file,
      ),
    );
  } catch (e) {
    return fail(e);
  }
}
