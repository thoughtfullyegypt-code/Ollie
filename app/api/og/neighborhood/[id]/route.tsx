import { getNeighborhoods, getPublicSeats } from "@/lib/domain";
import { tableCard } from "../../card";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  if (!/^[a-z0-9-]{2,50}$/.test(id))
    return new Response("Neighborhood not found", { status: 404 });
  const n = (await getNeighborhoods()).find((n) => n.id === id);
  if (!n) return new Response("Neighborhood not found", { status: 404 });
  const guests = await getPublicSeats({
    start: n.startSeat,
    end: n.endSeat,
    limit: 1,
  });
  return tableCard({
    guest: guests.guests[0] || null,
    seatId: n.startSeat,
    headline: n.name,
    eyebrow: "THERE’S A LITTLE ROOM FOR YOU",
    subtitle: "Find your people. Or meet some wonderfully peculiar new ones.",
    footer: `SEATS ${n.startSeat.toLocaleString("en-US")}–${n.endSeat.toLocaleString("en-US")} · EXPLORE FOR FREE${guests.guests[0]?.isDemo ? " · DEMO ART" : ""}`,
  });
}
