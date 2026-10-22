import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TableExperience from "@/components/table-experience";
import { getNeighborhoods } from "@/lib/domain";
import { config } from "@/lib/config";
export const dynamic = "force-dynamic";
async function neighborhood(id: string) {
  if (!/^[a-z0-9-]{2,50}$/.test(id)) return null;
  const neighborhoods = await getNeighborhoods();
  return neighborhoods.find((n) => n.id === id) || null;
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const n = await neighborhood((await params).id);
  if (!n) return { title: "Neighborhood not found", robots: { index: false } };
  const title = `${n.name} · ${config.brand}`;
  const description =
    "Create your peculiar dinner guest, bring someone you love, and find your people at a table of 10,000.";
  const canonical = new URL(`/neighborhood/${n.id}`, config.url).toString();
  const image = new URL(`/api/og/neighborhood/${n.id}`, config.url).toString();
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: `An illustrated invitation to ${n.name}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
export default async function NeighborhoodPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const n = await neighborhood((await params).id);
  if (!n) notFound();
  return (
    <TableExperience
      initialSeat={n.startSeat}
      brandName={config.brand}
      openGuestOnLoad={false}
    />
  );
}
