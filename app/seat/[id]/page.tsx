import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TableExperience from "@/components/table-experience";
import { getPublicSeats } from "@/lib/domain";

export const dynamic = "force-dynamic";
const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet";
const origin =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.BETTER_AUTH_URL ||
  "http://localhost:3000";

function validId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id >= 1 && id <= 10000 ? id : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const id = validId((await params).id);
  if (!id)
    return { title: `Seat not found · ${brand}`, robots: { index: false } };
  const { guests } = await getPublicSeats({ start: id, end: id });
  const guest = guests.find((item) => item.seatId === id);
  const title = guest
    ? `${guest.displayName} · Seat ${id} · ${brand}`
    : `Seat ${id} · ${brand}`;
  const description =
    guest?.message || "The internet is a weird place. Come sit with us.";
  const canonical = new URL(`/seat/${id}`, origin).toString();
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      images: [
        {
          url: new URL(`/api/og/seat/${id}`, origin).toString(),
          width: 1200,
          height: 630,
          alt: guest
            ? `${guest.displayName} at seat ${id}`
            : `An empty chair at seat ${id}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [new URL(`/api/og/seat/${id}`, origin).toString()],
    },
  };
}

export default async function SeatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = validId((await params).id);
  if (!id) notFound();
  return <TableExperience initialSeat={id} brandName={brand} />;
}
