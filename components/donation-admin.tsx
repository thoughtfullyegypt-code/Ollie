"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Check,
  Download,
  FileText,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import BreadHeart from "./art/bread-heart";
import type { DonationPeriod, DonationReceipt } from "./donation-blurb";
import "./donation.css";
type CommitmentConfig = {
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
};
type LedgerRow = {
  id: string;
  eventId: string;
  orderId: string;
  type: string;
  eligibleDeltaMinor: number;
  accrualDeltaMinor: number;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
};
type AdminData = {
  config: CommitmentConfig;
  setupMissing: string[];
  active: boolean;
  totals: {
    eligibleMinor: number;
    accruedMinor: number;
    donatedMinor: number;
    currency: string;
  };
  ledger: LedgerRow[];
  receipts: DonationReceipt[];
  periods: DonationPeriod[];
  reviewRequiredOrders?: {
    orderId: string;
    currency: string;
    grossMinor: number;
    taxMinor: number;
    refundedMinor: number;
    disputedMinor: number;
  }[];
};
const blank: CommitmentConfig = {
  enabled: false,
  recipientName: "",
  recipientWebsite: "",
  cause: "",
  effectiveStart: "",
  firstPeriodStart: "",
  firstPeriodEnd: "",
  schedule: "quarterly",
  approvedWording: "",
  recipientVerified: false,
  accountingConfirmed: false,
};
const money = (minor: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(minor / 100);
const date = (value: string) =>
  value
    ? new Date(value).toLocaleDateString("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";
async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "The donation record could not be loaded.");
  return data;
}
function toMinor(raw: string, allowZero = false) {
  if (!/^\d+(\.\d{1,2})?$/.test(raw))
    throw new Error("Enter a USD amount with no more than two decimal places.");
  const [whole, fraction = ""] = raw.split(".");
  const value = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (value < 0n || (!allowZero && value === 0n) || value > 2147483647n)
    throw new Error(
      "Enter a positive amount within the supported accounting range.",
    );
  return Number(value);
}
export default function DonationAdmin({
  onStatusChange,
}: {
  onStatusChange?: (status: {
    active: boolean;
    setupMissing: string[];
  }) => void;
}) {
  const [data, setData] = useState<AdminData | null>(null);
  const [config, setConfig] = useState<CommitmentConfig>(blank);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = (await request("/api/admin/donations")) as AdminData;
      setData(next);
      setConfig({ ...blank, ...next.config });
      onStatusChange?.({
        active: next.active,
        setupMissing: next.setupMissing,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);
  useEffect(() => {
    void load();
  }, [load]);
  const set = <K extends keyof CommitmentConfig>(
    key: K,
    value: CommitmentConfig[K],
  ) => setConfig((old) => ({ ...old, [key]: value }));
  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await action();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("config", async () => {
      await request("/api/admin/donations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setNotice(
        config.enabled
          ? "Donation commitment saved. Public messaging appears only when every verification is complete."
          : "Donation settings saved. Public messaging remains disabled.",
      );
    });
  }
  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    void run("receipt", async () => {
      const file = values.get("file");
      if (!(file instanceof File) || !file.size)
        throw new Error("Choose a redacted PDF, PNG, or JPEG receipt.");
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Receipt files must be no larger than 5 MB.");
      values.set(
        "amountMinor",
        String(toMinor(String(values.get("amountUsd") || ""))),
      );
      values.delete("amountUsd");
      values.set("currency", "usd");
      values.set(
        "redactedConfirmed",
        values.get("redactedConfirmed") === "on" ? "true" : "false",
      );
      await request("/api/admin/donations/receipts", {
        method: "POST",
        body: values,
      });
      form.reset();
      setNotice(
        "The redacted receipt is saved privately. It becomes public only when its quarterly report is published.",
      );
    });
  }
  function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run("period", async () => {
      const raw = String(form.get("cutoffAt") || "");
      const cutoff = new Date(raw);
      if (!Number.isFinite(cutoff.getTime()))
        throw new Error("Choose a reporting cutoff date and time.");
      await request("/api/admin/donations/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart: form.get("periodStart"),
          periodEnd: form.get("periodEnd"),
          cutoffAt: cutoff.toISOString(),
        }),
      });
      setNotice(
        "The quarterly report and its redacted receipts are published as an immutable snapshot.",
      );
    });
  }
  function reconcile(event: FormEvent<HTMLFormElement>, orderId: string) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void run(`reconcile-${orderId}`, async () => {
      const breakdown: Record<string, number> = {};
      for (const field of [
        "taxMinor",
        "refundedTaxTotalMinor",
        "disputedTaxTotalMinor",
      ]) {
        const raw = String(values.get(field) || "").trim();
        if (raw) breakdown[field] = toMinor(raw, true);
      }
      if (!Object.keys(breakdown).length)
        throw new Error(
          "Enter at least one verified tax amount, including zero when applicable.",
        );
      if (values.get("confirmed") !== "on")
        throw new Error(
          "Confirm the breakdown against the payment provider before saving.",
        );
      await request("/api/admin/donations/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          ...breakdown,
          reason: values.get("reason"),
          confirmed: true,
        }),
      });
      setNotice(
        "Verified tax breakdown recorded in the audit log. Accrual eligibility and public-claim status have been recalculated.",
      );
    });
  }
  if (loading && !data)
    return (
      <section
        className="donation-admin donation-loading"
        aria-label="Loading donation administration"
      >
        <LoaderCircle className="spin" size={20} />
        <p>Opening the donation ledger…</p>
      </section>
    );
  if (!data)
    return (
      <section className="donation-admin">
        <p className="form-error" role="alert">
          {error || "Donation administration is unavailable."}
        </p>
        <button className="btn btn-secondary" onClick={() => void load()}>
          Try again
        </button>
      </section>
    );
  return (
    <section
      className="donation-admin"
      aria-label="Donation commitment and accounting"
    >
      <div className="donation-admin-heading">
        <div>
          <p className="eyebrow">A LITTLE GOOD, WITH A CLEAR PAPER TRAIL</p>
          <h2>Beyond the table.</h2>
          <p>
            Set the commitment, inspect accruals, and publish redacted receipts.
            These tools record information; they never transfer money.
          </p>
        </div>
        <button
          className="icon-button"
          disabled={loading || !!busy}
          aria-label="Refresh donation records"
          onClick={() => void load()}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="donation-admin-notice" role="status">
          <Check size={17} />
          {notice}
        </p>
      )}
      {!data.active && (
        <aside className="donation-setup-notice">
          <BreadHeart />
          <div>
            <h3>Public donation messaging is hidden.</h3>
            <p>
              Complete and verify the recipient, dates, schedule, and approved
              wording. Confirm that eligible funds are actually being set aside
              before enabling the public commitment.
            </p>
            {data.setupMissing.length > 0 && (
              <p className="donation-missing">
                <strong>Still needed:</strong>{" "}
                {data.setupMissing
                  .map((x) => x.replace(/([a-z])([A-Z])/g, "$1 $2"))
                  .join(" · ")}
              </p>
            )}
          </div>
        </aside>
      )}
      {data.active && (
        <p className="donation-active-note">
          <ShieldCheck size={18} /> The approved commitment is public.{" "}
          <a href="/beyond-the-table" target="_blank" rel="noopener noreferrer">
            Inspect the public page <ArrowUpRight size={14} />
          </a>
        </p>
      )}
      <form className="donation-config-form" onSubmit={save}>
        <h3>The commitment.</h3>
        <p className="donation-explanation">
          10% of settled seat-sales revenue, excluding collected sales taxes and
          refunded or disputed amounts, before payment-processing fees and
          operating expenses. USD only. Donations are made quarterly,
          independently of how many seats sell.
        </p>
        <div className="donation-form-grid">
          <label className="donation-label">
            Verified recipient charity name
            <input
              value={config.recipientName}
              onChange={(e) => set("recipientName", e.target.value)}
              maxLength={160}
              autoComplete="organization"
            />
          </label>
          <label className="donation-label">
            Recipient’s official website
            <input
              type="url"
              value={config.recipientWebsite}
              onChange={(e) => set("recipientWebsite", e.target.value)}
              placeholder="https://"
              maxLength={500}
            />
          </label>
          <label className="donation-label donation-wide">
            Supported cause
            <input
              value={config.cause}
              onChange={(e) => set("cause", e.target.value)}
              maxLength={280}
            />
          </label>
          <label className="donation-label">
            Effective start date
            <input
              type="date"
              value={config.effectiveStart.slice(0, 10)}
              onChange={(e) => set("effectiveStart", e.target.value)}
            />
          </label>
          <label className="donation-label">
            Donation schedule
            <select
              value={config.schedule}
              onChange={() => set("schedule", "quarterly")}
            >
              <option value="quarterly">Quarterly</option>
            </select>
          </label>
          <label className="donation-label">
            First reporting period starts
            <input
              type="date"
              value={config.firstPeriodStart.slice(0, 10)}
              onChange={(e) => set("firstPeriodStart", e.target.value)}
            />
          </label>
          <label className="donation-label">
            First reporting period ends, exclusive
            <input
              type="date"
              value={config.firstPeriodEnd.slice(0, 10)}
              onChange={(e) => set("firstPeriodEnd", e.target.value)}
            />
          </label>
          <label className="donation-label donation-wide">
            Final approved commitment wording
            <textarea
              rows={4}
              maxLength={2000}
              value={config.approvedWording}
              onChange={(e) => set("approvedWording", e.target.value)}
              placeholder="Enter the final reviewed wording before publishing a commitment."
            />
          </label>
        </div>
        <p className="donation-hint">
          Use a complete calendar quarter. Period ends are exclusive:
          January–March ends on April 1. Once financial history exists, material
          recipient and effective-date changes require a separately planned
          commitment rather than rewriting this one.
        </p>
        <div className="donation-confirmations">
          <label>
            <input
              type="checkbox"
              checked={config.recipientVerified}
              onChange={(e) => set("recipientVerified", e.target.checked)}
            />
            <span>
              I verified the recipient’s identity and official website, and
              approved the stated cause and wording.
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={config.accountingConfirmed}
              onChange={(e) => set("accountingConfirmed", e.target.checked)}
            />
            <span>
              The operator follows the accounting commitment and sets aside
              eligible funds. This is not a claim of a charity partnership.
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
            />
            <span>
              Enable public donation messaging after all required fields and
              verifications are complete.
            </span>
          </label>
        </div>
        <button className="btn btn-primary" disabled={!!busy}>
          {busy === "config" ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Check size={17} />
          )}
          Save commitment settings
        </button>
      </form>
      {(data.reviewRequiredOrders?.length || 0) > 0 && (
        <aside className="donation-review-notice" role="status">
          <strong>
            {data.reviewRequiredOrders!.length} order
            {data.reviewRequiredOrders!.length === 1 ? "" : "s"} need financial
            reconciliation.
          </strong>
          <p>
            These transactions are excluded from eligible accrual until their
            settled amount, tax and adjustments are confirmed. Review the
            payment records before publishing a quarterly report.
          </p>
          {data.reviewRequiredOrders!.map((row) => (
            <details key={row.orderId}>
              <summary>
                Reconcile order {row.orderId.slice(0, 8)} ·{" "}
                {row.currency.toUpperCase()}
              </summary>
              <p>
                <code>{row.orderId}</code>
              </p>
              <p className="donation-hint">
                Recorded gross {money(row.grossMinor, row.currency)}, collected
                tax {money(row.taxMinor, row.currency)}, refunded{" "}
                {money(row.refundedMinor, row.currency)}, disputed{" "}
                {money(row.disputedMinor, row.currency)}. Enter cumulative
                verified tax totals only. Blank fields retain the existing
                record; zero explicitly confirms no tax. Review the provider’s
                settlement and adjustment records first.
              </p>
              {row.currency.toLowerCase() !== "usd" && (
                <p className="donation-hint">
                  This currency is excluded from the USD commitment. No
                  conversion or combined-currency total is supported; this form
                  remains disabled.
                </p>
              )}
              <form onSubmit={(event) => reconcile(event, row.orderId)}>
                <div className="donation-form-grid">
                  <label className="donation-label">
                    Verified collected tax, USD
                    <input
                      name="taxMinor"
                      inputMode="decimal"
                      pattern="[0-9]+(\.[0-9]{1,2})?"
                      placeholder="Leave blank to retain"
                    />
                  </label>
                  <label className="donation-label">
                    Verified refunded tax total, USD
                    <input
                      name="refundedTaxTotalMinor"
                      inputMode="decimal"
                      pattern="[0-9]+(\.[0-9]{1,2})?"
                      placeholder="Leave blank to retain"
                    />
                  </label>
                  <label className="donation-label">
                    Verified disputed tax total, USD
                    <input
                      name="disputedTaxTotalMinor"
                      inputMode="decimal"
                      pattern="[0-9]+(\.[0-9]{1,2})?"
                      placeholder="Leave blank to retain"
                    />
                  </label>
                  <label className="donation-label donation-wide">
                    Verification reason and provider reference for the audit log
                    <textarea
                      name="reason"
                      rows={3}
                      minLength={10}
                      maxLength={1000}
                      required
                    />
                  </label>
                </div>
                <label className="donation-acknowledgement">
                  <input name="confirmed" type="checkbox" required />
                  <span>
                    I verified these cumulative tax amounts against the payment
                    provider. This records an accounting adjustment and does not
                    move funds.
                  </span>
                </label>
                <button
                  className="btn btn-secondary"
                  disabled={!!busy || row.currency.toLowerCase() !== "usd"}
                >
                  {busy === `reconcile-${row.orderId}` ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <ShieldCheck size={17} />
                  )}
                  Save verified tax breakdown
                </button>
              </form>
            </details>
          ))}
        </aside>
      )}
      <section
        className="donation-admin-totals"
        aria-label="Private donation accounting totals"
      >
        <div>
          <span>Eligible sales</span>
          <strong>{money(data.totals.eligibleMinor)}</strong>
        </div>
        <div>
          <span>Accrued</span>
          <strong>{money(data.totals.accruedMinor)}</strong>
        </div>
        <div>
          <span>Recorded donations</span>
          <strong>{money(data.totals.donatedMinor)}</strong>
        </div>
      </section>
      <p className="donation-hint">
        Private totals may include unpublished donation receipts. The public
        page exposes only published, redaction-confirmed receipts.
        Demonstration, complimentary, and local test orders are not eligible
        revenue.
      </p>
      <section className="donation-upload-section">
        <h3>Record a donation already made.</h3>
        <p>
          Add the actual donation date, amount and recipient, together with a
          redacted receipt. Uploading a file does not make or initiate a
          donation.
        </p>
        <form onSubmit={upload}>
          <div className="donation-form-grid">
            <label className="donation-label">
              Actual amount donated, USD
              <input
                name="amountUsd"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                required
                pattern="[0-9]+(\.[0-9]{1,2})?"
              />
            </label>
            <label className="donation-label">
              Actual donation date
              <input name="donatedAt" type="date" required />
            </label>
            <label className="donation-label donation-wide">
              Recipient on the receipt
              <input
                name="recipientName"
                key={config.recipientName}
                defaultValue={config.recipientName}
                maxLength={160}
                required
              />
            </label>
            <label className="donation-label">
              Reporting period starts
              <input name="periodStart" type="date" required />
            </label>
            <label className="donation-label">
              Reporting period ends, exclusive
              <input name="periodEnd" type="date" required />
            </label>
            <label className="donation-label donation-wide">
              Redacted receipt, PDF / PNG / JPEG
              <input
                type="file"
                name="file"
                accept="application/pdf,image/png,image/jpeg"
                required
              />
              <span className="donation-hint">
                Maximum 5 MB. Remove bank details, addresses, account numbers,
                personal contact information and unrelated private data.
              </span>
            </label>
          </div>
          <label className="donation-acknowledgement">
            <input type="checkbox" name="redactedConfirmed" required />
            <span>
              I checked this file and confirm it is redacted and suitable for
              public reporting.
            </span>
          </label>
          <button className="btn btn-secondary" disabled={!!busy}>
            {busy === "receipt" ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <FileText size={17} />
            )}
            Save private receipt record
          </button>
        </form>
      </section>
      <section className="donation-receipt-records">
        <h3>Receipt records.</h3>
        {data.receipts.length === 0 ? (
          <p className="donation-empty-text">
            No donation receipts have been recorded.
          </p>
        ) : (
          <div className="donation-record-list">
            {data.receipts.map((receipt) => (
              <article key={receipt.id}>
                <FileText size={20} />
                <div>
                  <strong>
                    {money(receipt.amountMinor)} USD · {receipt.recipientName}
                  </strong>
                  <p>
                    {date(receipt.donatedAt)} · {receipt.fileName}
                  </p>
                  <small>
                    {receipt.published
                      ? "Published with a quarterly report"
                      : "Private record — not published"}
                  </small>
                </div>
                {receipt.published && (
                  <a
                    className="text-link"
                    href={receipt.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download size={16} /> Receipt
                  </a>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="donation-publish-section">
        <h3>Publish a quarterly report.</h3>
        <p>
          A report freezes its calculation, cutoff and matching redacted
          receipts. Publish only a completed quarter after reconciliation. Later
          adjustments enter the next open period instead of changing the
          published snapshot.
        </p>
        <form onSubmit={publish}>
          <div className="donation-form-grid">
            <label className="donation-label">
              Quarter starts
              <input name="periodStart" type="date" required />
            </label>
            <label className="donation-label">
              Quarter ends, exclusive
              <input name="periodEnd" type="date" required />
            </label>
            <label className="donation-label donation-wide">
              Reporting cutoff, your local date and time
              <input name="cutoffAt" type="datetime-local" required />
            </label>
          </div>
          <button
            className="btn btn-secondary"
            disabled={!!busy || !data.active}
          >
            {busy === "period" ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <ShieldCheck size={17} />
            )}
            Publish immutable quarterly report
          </button>
          {!data.active && (
            <p className="donation-hint">
              Complete the verified commitment before publishing a report.
            </p>
          )}
        </form>
        {data.periods.length > 0 && (
          <div className="donation-published-periods">
            {data.periods.map((period) => (
              <div key={period.id}>
                <strong>
                  {date(period.periodStart)} –{" "}
                  {date(
                    new Date(
                      new Date(period.periodEnd).getTime() - 86400000,
                    ).toISOString(),
                  )}
                </strong>
                <span>
                  Accrued {money(period.accruedMinor)} · Donated{" "}
                  {money(period.donatedMinor)} · Cutoff {date(period.cutoffAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="donation-ledger-section">
        <h3>The append-only ledger.</h3>
        <p>
          Each adjustment refers to the original order and event. Refunds and
          disputes change eligible revenue without rewriting a published report.
        </p>
        {data.ledger.length === 0 ? (
          <p className="donation-empty-text">
            No eligible settled sales or adjustments have been recorded.
          </p>
        ) : (
          <div className="donation-ledger-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date / event</th>
                  <th>Order</th>
                  <th>Eligible adjustment</th>
                  <th>Accrual adjustment</th>
                  <th>Reporting period</th>
                </tr>
              </thead>
              <tbody>
                {data.ledger.slice(0, 100).map((row) => (
                  <tr key={row.id}>
                    <td>
                      {date(row.createdAt)}
                      <small>{row.type}</small>
                    </td>
                    <td>
                      <details>
                        <summary>{row.orderId.slice(0, 8)}</summary>
                        <code>{row.orderId}</code>
                        <code>{row.eventId}</code>
                      </details>
                    </td>
                    <td>{money(row.eligibleDeltaMinor)}</td>
                    <td>{money(row.accrualDeltaMinor)}</td>
                    <td>
                      {date(row.periodStart)}
                      <small>to {date(row.periodEnd)} exclusive</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="donation-hint">
          Latest {Math.min(data.ledger.length, 100)} ledger records displayed.
          Amounts are USD; no conversion method or automatic transfer is
          configured.
        </p>
      </section>
    </section>
  );
}
