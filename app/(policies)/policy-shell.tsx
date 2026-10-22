import Link from "next/link";
import type { ReactNode } from "react";

export default function PolicyShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet";
  return (
    <main
      className="policy-page"
      style={{ maxWidth: 850, margin: "0 auto", padding: "36px 24px 90px" }}
    >
      <Link
        href="/"
        className="eyebrow"
        style={{
          color: "var(--ink, #29372b)",
          textDecoration: "none",
          display: "inline-block",
          marginBottom: 50,
        }}
      >
        ← {brand}
      </Link>
      <p
        className="eyebrow"
        style={{
          color: "#a13828",
          letterSpacing: ".14em",
          textTransform: "uppercase",
          fontSize: 12,
        }}
      >
        The small print, in plain words
      </p>
      <h1
        style={{
          fontFamily: "var(--font-display, Georgia, serif)",
          fontSize: "clamp(40px, 7vw, 68px)",
          lineHeight: 1.06,
          fontWeight: 500,
          margin: "15px 0 20px",
        }}
      >
        {title}
      </h1>
      <p style={{ fontSize: 19, lineHeight: 1.6, maxWidth: 650 }}>{intro}</p>
      <aside
        role="note"
        style={{
          padding: "16px 20px",
          border: "1px solid #d8bd75",
          background: "#f7edc9",
          borderRadius: 12,
          margin: "30px 0",
          lineHeight: 1.6,
        }}
      >
        <strong>Draft for operator review.</strong> Live purchases are disabled.
        The legal operator, support contact, governing jurisdiction, and local
        consumer-law decisions must be completed before launch. This draft does
        not claim legal compliance.
      </aside>
      <article style={{ fontSize: 16, lineHeight: 1.8 }}>{children}</article>
      <nav
        aria-label="Policies"
        style={{
          marginTop: 45,
          borderTop: "1px solid #d6d2c5",
          paddingTop: 22,
          display: "flex",
          flexWrap: "wrap",
          gap: 22,
        }}
      >
        <Link href="/terms">Service terms</Link>
        <Link href="/refunds">Refunds</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/content">Table manners</Link>
        <Link href="/support">Support</Link>
      </nav>
    </main>
  );
}
