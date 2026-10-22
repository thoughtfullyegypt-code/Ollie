import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Download } from "lucide-react";
import { publicDonationSummary } from "@/lib/donations";
import BreadHeart from "@/components/art/bread-heart";
import type { DonationSummary } from "@/components/donation-blurb";
import "@/components/donation.css";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Beyond the table",
  description:
    "The table’s approved commitment, public reporting and donation receipts.",
};
const money = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );
const date = (value: string) =>
  new Date(value).toLocaleDateString("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const range = (start: string, end: string) =>
  `${date(start)} – ${date(new Date(new Date(end).getTime() - 86400000).toISOString())}`;
export default async function BeyondTheTable() {
  let commitment: DonationSummary | null = null;
  let unavailable = false;
  try {
    commitment = (await publicDonationSummary()) as DonationSummary | null;
  } catch {
    unavailable = true;
  }
  const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet";
  if (!commitment)
    return (
      <main id="main" className="beyond-page">
        <header className="beyond-header">
          <Link href="/" className="beyond-wordmark">
            {brand}
            <span>.</span>
          </Link>
          <Link className="text-link" href="/">
            <ArrowLeft size={15} /> Back to dinner
          </Link>
        </header>
        <section className="beyond-inactive">
          <p className="eyebrow">BEYOND THE TABLE</p>
          <h1>
            Good intentions.
            <br />
            <em>Clear information.</em>
          </h1>
          <p>
            {unavailable
              ? "Our public reporting is temporarily unavailable. Please return later."
              : "No public donation commitment is active. When an approved commitment is published, its calculation, reporting dates and receipts will appear here."}
          </p>
          <p>There is no public donation amount to report on this page.</p>
          <Link href="/" className="btn btn-primary">
            Explore the table <ArrowUpRight size={16} />
          </Link>
        </section>
      </main>
    );
  return (
    <main id="main" className="beyond-page">
      <header className="beyond-header">
        <Link href="/" className="beyond-wordmark">
          {brand}
          <span>.</span>
        </Link>
        <Link className="text-link" href="/">
          <ArrowLeft size={15} /> Back to dinner
        </Link>
      </header>
      <section className="beyond-intro">
        <BreadHeart />
        <p className="eyebrow">OUR COMMITMENT, IN PLAIN WORDS</p>
        <h1>
          A little good
          <br />
          <em>beyond the table.</em>
        </h1>
        <p>
          We set aside 10% of eligible seat sales for{" "}
          <a
            href={commitment.recipientWebsite}
            target="_blank"
            rel="noopener noreferrer"
          >
            {commitment.recipientName} <ArrowUpRight size={17} />
          </a>
          , supporting {commitment.cause}. Donations are made quarterly, whether
          or not the table fills.
        </p>
      </section>
      <section className="beyond-calculation">
        <p className="eyebrow">EXACTLY WHAT THAT MEANS</p>
        <h2>Ten percent. Before our expenses.</h2>
        <p>{commitment.calculation}</p>
        <p>
          Payment-processing fees and operating expenses are not deducted before
          this calculation. USD is the only supported reporting currency;
          amounts in other currencies are not added or converted.
        </p>
        <dl className="beyond-facts">
          <div>
            <dt>Effective from</dt>
            <dd>{date(commitment.effectiveStart)}</dd>
          </div>
          <div>
            <dt>First reporting period</dt>
            <dd>
              {range(commitment.firstPeriodStart, commitment.firstPeriodEnd)}
            </dd>
          </div>
          <div>
            <dt>Donation schedule</dt>
            <dd>Quarterly</dd>
          </div>
          <div>
            <dt>Calculation cutoff</dt>
            <dd>
              {commitment.reportingCutoff
                ? date(commitment.reportingCutoff)
                : "No reporting period published yet"}
            </dd>
          </div>
        </dl>
        <details className="beyond-approved">
          <summary>Approved commitment wording</summary>
          <p>{commitment.approvedWording}</p>
        </details>
      </section>
      <section
        className="beyond-accounting"
        aria-label="Donation accounting totals"
      >
        <div className="beyond-total">
          <span>THE COMMITMENT</span>
          <strong>10%</strong>
          <p>Of eligible settled seat sales.</p>
        </div>
        <div className="beyond-total">
          <span>ACCRUED UNDER THE COMMITMENT</span>
          <strong>{money(commitment.accruedMinor)}</strong>
          <p>
            Set aside under the calculation. This is not an amount already
            donated.
          </p>
        </div>
        <div className="beyond-total">
          <span>RECORDED AS DONATED</span>
          <strong>{money(commitment.donatedMinor)}</strong>
          <p>
            {commitment.donatedMinor === 0
              ? "No donation receipts have been published yet."
              : "Actual donations recorded in the published reports below."}
          </p>
        </div>
      </section>
      <p className="beyond-total-note">
        A commitment is a promise to apply this calculation. Accrual is the
        amount recorded under it. A donation is money actually paid to the
        recipient and recorded with a receipt. These are different things.
      </p>
      <section className="beyond-reports">
        <div className="beyond-section-title">
          <p className="eyebrow">A PUBLIC PAPER TRAIL</p>
          <h2>Reports & receipts.</h2>
        </div>
        {commitment.periods.length === 0 ? (
          <div className="beyond-empty">
            <h3>The first report is still ahead.</h3>
            <p>
              No quarterly report or donation receipt has been published yet.
              The first reporting period is{" "}
              {range(commitment.firstPeriodStart, commitment.firstPeriodEnd)}.
            </p>
          </div>
        ) : (
          commitment.periods.map((period) => (
            <article className="beyond-report" key={period.id}>
              <div>
                <p className="eyebrow">QUARTERLY REPORT</p>
                <h3>{range(period.periodStart, period.periodEnd)}</h3>
                <p>
                  Reporting cutoff: {date(period.cutoffAt)} · Recipient:{" "}
                  {period.recipientName}
                </p>
              </div>
              <dl>
                <div>
                  <dt>Eligible seat sales</dt>
                  <dd>{money(period.eligibleMinor)}</dd>
                </div>
                <div>
                  <dt>Accrued under the commitment</dt>
                  <dd>{money(period.accruedMinor)}</dd>
                </div>
                <div>
                  <dt>Recorded as donated</dt>
                  <dd>{money(period.donatedMinor)}</dd>
                </div>
                <div>
                  <dt>Adjustments in this report</dt>
                  <dd>{money(period.adjustmentMinor)}</dd>
                </div>
              </dl>
              <div className="beyond-receipts">
                {period.receipts.length ? (
                  period.receipts.map((receipt) => (
                    <a
                      key={receipt.id}
                      href={receipt.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                    >
                      <Download size={17} />
                      <span>
                        <strong>
                          {money(receipt.amountMinor)} USD to{" "}
                          {receipt.recipientName}
                        </strong>
                        <small>
                          Donation date {date(receipt.donatedAt)} · Redacted
                          receipt
                        </small>
                      </span>
                      <ArrowUpRight size={15} />
                    </a>
                  ))
                ) : (
                  <p>No donation receipt was published for this period.</p>
                )}
              </div>
            </article>
          ))
        )}
      </section>
      <section className="beyond-adjustments">
        <p className="eyebrow">WHEN THE NUMBERS CHANGE</p>
        <h2>Adjustments stay visible.</h2>
        <p>{commitment.adjustmentExplanation}</p>
        <p>
          Published reports are snapshots and are not rewritten. A later refund
          or dispute creates a separate ledger entry, with a reference to the
          original transaction, and is included in the next open reporting
          period. A negative adjustment changes the next amount due under the
          commitment; it is not described as a donation being taken back.
        </p>
        <p>
          Customer payments buy a digital seat-display service. They are not
          charitable donations by the customer and do not come with a charitable
          tax receipt.
        </p>
      </section>
      <footer className="beyond-footer">
        <span>{brand}</span>
        <Link href="/support">
          Questions about a report? <ArrowUpRight size={15} />
        </Link>
      </footer>
    </main>
  );
}
