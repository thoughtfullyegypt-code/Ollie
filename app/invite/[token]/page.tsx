import type { Metadata } from "next";
import Link from "next/link";
import { resolveInvitation, getPackages } from "@/lib/domain";
import InvitationView from "@/components/invitation-view";
export const dynamic = "force-dynamic";
const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet";
const origin =
  process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const invitation = /^[a-zA-Z0-9_-]{20,200}$/.test(token)
    ? await resolveInvitation(token).catch(() => null)
    : null;
  return {
    title: `Someone saved you a seat · ${brand}`,
    description:
      "An invitation to a wonderfully strange dinner. Bring your peculiar self.",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    openGraph: {
      title: "I saved you a seat.",
      description: "At the internet’s longest dinner table.",
      images: invitation
        ? [
            {
              url: new URL(
                `/api/og/invitation/${invitation.id}`,
                origin,
              ).toString(),
              width: 1200,
              height: 630,
            },
          ]
        : [],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = /^[a-zA-Z0-9_-]{20,200}$/.test(token)
    ? await resolveInvitation(token).catch(() => null)
    : null;
  if (!invitation || invitation.status === "revoked")
    return (
      <main
        style={{
          maxWidth: 650,
          padding: "70px 24px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <p className="eyebrow">A LITTLE CHANGE OF PLANS</p>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 48 }}>
          This invitation is no longer available.
        </h1>
        <p>
          The link may have been revoked or already claimed. There is still
          plenty of table to explore.
        </p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: 24 }}>
          Find another seat
        </Link>
      </main>
    );
  const packages = await getPackages();
  const single = packages.find((item: { id: string }) => item.id === "one");
  if (!single)
    throw new Error("Single-seat pricing is temporarily unavailable.");
  const oneSeatAmount = single.amount;
  return (
    <InvitationView
      token={token}
      invitation={JSON.parse(JSON.stringify(invitation))}
      oneSeatAmount={oneSeatAmount}
      development={process.env.APP_MODE === "development"}
    />
  );
}
