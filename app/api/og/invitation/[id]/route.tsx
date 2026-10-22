import {
  customizationSchema,
  DISH_IDS,
  getInvitationPreview,
} from "@/lib/domain";
import { pool } from "@/lib/db";
import { tableCard } from "../../card";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(id))
    return new Response("Invitation not found", { status: 404 });
  const invitation = await getInvitationPreview(id);
  if (!invitation) return new Response("Invitation not found", { status: 404 });
  // A public preview identifier grants no claim rights. Original, validated art
  // choices may appear for a pending guest; no unapproved name/message/link or
  // private/hidden profile is ever exposed by this image endpoint.
  let demonstration = invitation.sourceGuest?.isDemo === true;
  let drawing: Parameters<typeof tableCard>[0]["guest"] =
    invitation.sourceGuest;
  if (!drawing) {
    const result = await pool.query(
      "SELECT p.customization,p.dish,p.is_demo FROM profiles p JOIN seats s ON s.id=p.seat_id WHERE p.seat_id=$1 AND s.state='purchased' AND p.visibility='pending'",
      [invitation.sourceSeatId],
    );
    const row = result.rows[0];
    if (row) {
      demonstration = row.is_demo === true;
      const parsed = customizationSchema.safeParse(row.customization);
      if (parsed.success)
        drawing = {
          seatId: invitation.sourceSeatId,
          displayName: "A peculiar dinner guest",
          dish: DISH_IDS.includes(row.dish) ? row.dish : "soup",
          customization: parsed.data,
        };
    }
  }
  const image = await tableCard({
    guest: drawing,
    seatId: invitation.sourceSeatId,
    invitation: true,
    headline: "Dinner would be weirder with you.",
    subtitle: "I joined the internet’s strangest dinner. Come sit beside me.",
    eyebrow: `${demonstration ? "DEVELOPMENT INVITATION" : "A SEAT BESIDE"} ${invitation.sourceSeatId.toLocaleString("en-US")}`,
    footer: demonstration
      ? `SEAT ${invitation.sourceSeatId.toLocaleString("en-US")} · DEVELOPMENT · NO REAL CHARGE`
      : `SEAT ${invitation.sourceSeatId.toLocaleString("en-US")} · ${invitation.type === "paid" ? "YOUR PLACE IS ALREADY PAID" : "COME FIND A NEARBY PLACE"}`,
  });
  if (new URL(request.url).searchParams.get("download") === "1")
    image.headers.set(
      "Content-Disposition",
      'attachment; filename="dinner-invitation.png"',
    );
  image.headers.set("Referrer-Policy", "no-referrer");
  return image;
}
