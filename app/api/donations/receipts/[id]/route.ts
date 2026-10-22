import { getPublishedDonationReceipt } from "@/lib/donations";
import { fail, json } from "../../../_utils";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const file = await getPublishedDonationReceipt((await params).id);
    if (!file) return json({ error: "Receipt not found." }, 404);
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${file.fileName}"`,
        "Cache-Control": "public,max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
