import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import GiftReveal from "@/components/gift-reveal";
import { GiftEnvelope } from "@/components/art/gift-art";
import { resolveGift } from "@/lib/gifts";
import { config } from "@/lib/config";
import { actorHash } from "@/app/api/_utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Someone saved you a seat.",
  description: "A little surprise is waiting at the table.",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
  openGraph: {
    title: "Someone saved you a seat.",
    description: "A little surprise is waiting at the table.",
    type: "website",
    images: [
      {
        url: "/api/og/gift/invitation",
        width: 1200,
        height: 630,
        alt: "An illustrated invitation to sit beside someone",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Someone saved you a seat.",
    description: "A little surprise is waiting at the table.",
    images: ["/api/og/gift/invitation"],
  },
};
export default async function GiftPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { token } = await params;
  let gift = null;
  if (/^[a-zA-Z0-9_-]{40,100}$/.test(token)) {
    try {
      const requestHeaders = new Headers(await headers());
      // Hash only the verified abuse identity. The bearer URL is not passed to
      // the logger or used as an analytics/referral identifier.
      gift = await resolveGift(
        token,
        actorHash(
          new Request(`${config.url}/gift`, { headers: requestHeaders }),
        ),
      );
    } catch {
      /* Invalid, replaced, revoked and unavailable links share one state. */
    }
  }
  if (!gift)
    return (
      <main
        id="main"
        className="error-page"
        style={{
          minHeight: "100dvh",
          maxWidth: 650,
          margin: "0 auto",
          padding: "60px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ width: 200, margin: "0 auto 20px" }}>
          <GiftEnvelope />
        </div>
        <p className="eyebrow">A LITTLE CHANGE OF PLANS</p>
        <h1
          style={{
            fontFamily: "var(--font-display,Georgia,serif)",
            fontSize: "clamp(38px,7vw,58px)",
            fontWeight: 400,
          }}
        >
          This surprise is no longer available.
        </h1>
        <p style={{ lineHeight: 1.8, color: "#6e7763" }}>
          The link may have been replaced or revoked, or its related seats may
          no longer be available. Ask the person who sent it for a current link.
        </p>
        <Link className="btn btn-primary" href="/" style={{ marginTop: 20 }}>
          Explore the table
        </Link>
      </main>
    );
  const plain = (await searchParams).view === "plain";
  return (
    <>
      <GiftReveal gift={gift} token={token} initialSimple={plain} />
      <noscript>
        <section
          style={{
            maxWidth: 650,
            margin: "30px auto",
            padding: 24,
            background: "#fff8e6",
            color: "#303a2e",
          }}
          aria-label="Your private letter without animation"
        >
          <div style={{ width: 180, margin: "0 auto" }}>
            <GiftEnvelope open />
          </div>
          <h1>
            For {gift.recipientName}, from {gift.senderName}.
          </h1>
          <p
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              fontSize: 17,
              lineHeight: 1.9,
            }}
          >
            {gift.message}
          </p>
          <p>
            Your letter can be read without JavaScript. Enable JavaScript to
            send a thank-you or explicitly claim your already-paid guest.
          </p>
          <Link href={`/seat/${gift.senderSeatId || gift.sourceSeatId || 1}`}>
            Explore the table
          </Link>
        </section>
      </noscript>
    </>
  );
}
