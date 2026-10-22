"use client";
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import BreadHeart from "./art/bread-heart";
import "./donation.css";
export type DonationReceipt = {
  id: string;
  donatedAt: string;
  amountMinor: number;
  currency: "usd";
  recipientName: string;
  periodStart: string;
  periodEnd: string;
  published: boolean;
  url: string;
  fileName: string;
};
export type DonationPeriod = {
  id: string;
  periodStart: string;
  periodEnd: string;
  cutoffAt: string;
  eligibleMinor: number;
  accruedMinor: number;
  donatedMinor: number;
  adjustmentMinor: number;
  recipientName: string;
  receipts: DonationReceipt[];
};
export type DonationSummary = {
  enabled: boolean;
  recipientName: string;
  recipientWebsite: string;
  cause: string;
  effectiveStart: string;
  firstPeriodStart: string;
  firstPeriodEnd: string;
  schedule: "quarterly";
  approvedWording: string;
  recipientVerified: boolean;
  accountingConfirmed: boolean;
  ratePercent: 10;
  currency: "usd";
  calculation: string;
  accruedMinor: number;
  donatedMinor: number;
  eligibleMinor: number;
  reportingCutoff: string | null;
  adjustmentExplanation: string;
  periods: DonationPeriod[];
  receipts: DonationReceipt[];
};
export function donationIsPublic(
  value: DonationSummary | null | undefined,
): value is DonationSummary {
  return !!(
    value &&
    value.enabled &&
    value.recipientVerified &&
    value.accountingConfirmed &&
    value.ratePercent === 10 &&
    value.currency === "usd" &&
    value.schedule === "quarterly" &&
    value.recipientName?.trim() &&
    /^https:\/\//i.test(value.recipientWebsite || "") &&
    value.cause?.trim() &&
    value.effectiveStart &&
    value.firstPeriodStart &&
    value.firstPeriodEnd &&
    value.approvedWording?.trim()
  );
}
export default function DonationBlurb({
  compact = false,
  donation,
}: {
  compact?: boolean;
  donation?: DonationSummary | null;
}) {
  const headingId = useId();
  const [loaded, setLoaded] = useState<DonationSummary | null>(
    donation ?? null,
  );
  useEffect(() => {
    if (donation !== undefined) {
      setLoaded(donation);
      return;
    }
    const controller = new AbortController();
    fetch("/api/donations", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLoaded(d?.commitment ?? null))
      .catch(() => {});
    return () => controller.abort();
  }, [donation]);
  if (!donationIsPublic(loaded)) return null;
  return (
    <section
      className={`donation-blurb ${compact ? "donation-blurb-compact" : ""}`}
      aria-labelledby={headingId}
    >
      <BreadHeart />
      <div>
        <p className="eyebrow">BEYOND THE TABLE</p>
        <h2 id={headingId}>A little good beyond the table.</h2>
        <p>
          We set aside 10% of eligible seat sales for{" "}
          <a
            href={loaded.recipientWebsite}
            target="_blank"
            rel="noopener noreferrer"
          >
            {loaded.recipientName}
          </a>
          , supporting {loaded.cause}. Donations are made quarterly, whether or
          not the table fills.
        </p>
        <Link href="/beyond-the-table" className="text-link">
          Our commitment and receipts <ArrowUpRight size={15} />
        </Link>
      </div>
    </section>
  );
}
