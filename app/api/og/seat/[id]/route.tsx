import { getPublicGuest } from "@/lib/domain";
import { tableCard } from "../../card";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1 || id > 10000)
    return new Response("Seat not found", { status: 404 });
  const guest = await getPublicGuest(id);
  return tableCard({
    guest,
    seatId: id,
    ...(guest?.kind === "demo"
      ? {
          eyebrow: "A DEMONSTRATION GUEST",
          footer: `SEAT ${id.toLocaleString("en-US")} · DEMO ART · NO REAL PURCHASE`,
        }
      : guest?.kind === "complimentary"
        ? {
            eyebrow: "A COMPLIMENTARY FOUNDING GUEST",
            footer: `SEAT ${id.toLocaleString("en-US")} · COME SIT WITH US`,
          }
        : {}),
  });
}
