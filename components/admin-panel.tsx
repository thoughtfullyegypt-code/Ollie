"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  HeartHandshake,
  ExternalLink,
  EyeOff,
  FileClock,
  Flag,
  LayoutGrid,
  Link2Off,
  LoaderCircle,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Ticket,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { GuestArt } from "./art/illustrations";
import DonationAdmin from "./donation-admin";
import "./account.css";

type Row = Record<string, unknown>;
type Tab =
  | "review"
  | "seats"
  | "reports"
  | "orders"
  | "invitations"
  | "support"
  | "donations"
  | "journey"
  | "settings"
  | "audit";
type AdminData = {
  seats: Row[];
  orders: Row[];
  reports: Row[];
  pending: Row[];
  audit: Row[];
  invitations: Row[];
  support: Row[];
  neighborhoods: Row[];
  packages: Row[];
  page: number;
  total: number;
  journey: Row;
};
const str = (value: unknown) =>
  typeof value === "string"
    ? value
    : typeof value === "number"
      ? String(value)
      : "";
const obj = (value: unknown): Row =>
  value && typeof value === "object" ? (value as Row) : {};
const arr = (value: unknown): Row[] =>
  Array.isArray(value) ? value.map(obj) : [];
const value = (row: Row, camel: string, snake?: string) =>
  row[camel] ?? (snake ? row[snake] : undefined);
const dateLabel = (date: unknown) =>
  date ? new Date(str(date)).toLocaleString() : "—";
const amountLabel = (amount: unknown) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(amount || 0) / 100,
  );
const empty: AdminData = {
  seats: [],
  orders: [],
  reports: [],
  pending: [],
  audit: [],
  invitations: [],
  support: [],
  neighborhoods: [],
  packages: [],
  page: 1,
  total: 0,
  journey: {},
};
const tabs: { id: Tab; label: string; icon: typeof Flag }[] = [
  { id: "review", label: "Review queue", icon: ClipboardList },
  { id: "seats", label: "Seats & guests", icon: LayoutGrid },
  { id: "reports", label: "Reports", icon: Flag },
  { id: "orders", label: "Payments", icon: Ticket },
  { id: "invitations", label: "Invitations", icon: Users },
  { id: "support", label: "Support", icon: ShieldCheck },
  { id: "donations", label: "Beyond the table", icon: HeartHandshake },
  { id: "journey", label: "Purchase journey", icon: TrendingUp },
  { id: "settings", label: "Table settings", icon: Settings2 },
  { id: "audit", label: "Audit log", icon: FileClock },
];

export default function AdminPanel({
  brandName = "A Seat at the Internet",
}: {
  brandName?: string;
}) {
  const [data, setData] = useState<AdminData>(empty);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [donationStatus, setDonationStatus] = useState<{
    active: boolean;
    setupMissing: string[];
  } | null>(null);
  const [tab, setTab] = useState<Tab>("review");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<{
    error: boolean;
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/admin?q=${encodeURIComponent(search)}&page=${page}`,
        { cache: "no-store" },
      );
      if (response.status === 401 || response.status === 403) {
        setDenied(true);
        return;
      }
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          str(body.error?.message || body.error) ||
            "Could not load the host’s desk.",
        );
      const next: AdminData = { ...empty, ...body };
      for (const key of [
        "seats",
        "orders",
        "reports",
        "pending",
        "audit",
        "invitations",
        "support",
        "neighborhoods",
        "packages",
      ] as const)
        next[key] = arr(body[key]);
      setData(next);
      setDenied(false);
      setBlockers(
        Array.isArray(body.launchBlockers) ? body.launchBlockers.map(str) : [],
      );
      try {
        const donationResponse = await fetch("/api/admin/donations", {
          cache: "no-store",
        });
        if (donationResponse.ok) {
          const donation = await donationResponse.json();
          setDonationStatus({
            active: donation.active === true,
            setupMissing: Array.isArray(donation.setupMissing)
              ? donation.setupMissing.map(str)
              : [],
          });
        }
      } catch {
        // Donation administration has its own retry state; moderation stays usable.
      }
    } catch (error) {
      setNotice({ error: true, message: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, [search, page]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);
  async function action(input: Row, success: string) {
    setBusy(str(input.action));
    setNotice(null);
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          str(body.error?.message || body.error || body.message) ||
            "The action could not be completed.",
        );
      setNotice({ error: false, message: success });
      setConfirm(null);
      setReason("");
      await refresh();
    } catch (error) {
      setNotice({ error: true, message: (error as Error).message });
    } finally {
      setBusy("");
    }
  }
  function requireReason(input: Row) {
    setConfirm(input);
    setReason("");
  }
  function controls(profile: Row) {
    const seatId = Number(profile.seatId || profile.seat_id);
    return (
      <div className="admin-actions">
        <button
          title="Approve for public display"
          className="account-button secondary"
          disabled={!!busy}
          onClick={() =>
            void action(
              {
                action: "approve",
                seatId,
                reason: "Content reviewed against table manners.",
              },
              `Seat ${seatId} approved for public display.`,
            )
          }
        >
          <Check size={15} /> Approve
        </button>
        <button
          className="account-button text"
          disabled={!!busy}
          onClick={() => requireReason({ action: "hide", seatId })}
        >
          <EyeOff size={15} /> Hide
        </button>
        {profile.link ? (
          <button
            className="account-button text"
            disabled={!!busy}
            onClick={() => requireReason({ action: "disable_link", seatId })}
          >
            <Link2Off size={15} /> Disable link
          </button>
        ) : null}
        <Link
          className="account-button text"
          href={`/seat/${seatId}`}
          target="_blank"
        >
          View <ExternalLink size={13} />
        </Link>
      </div>
    );
  }

  return (
    <div className="account-shell admin-shell">
      <header className="account-header">
        <Link href="/" className="account-wordmark">
          {brandName}
          <span aria-hidden="true">✳</span>
        </Link>
        <Link href="/account" className="account-back">
          <ArrowLeft size={16} /> Your account
        </Link>
      </header>
      <main className="account-main">
        <div className="account-page-title">
          <div>
            <p className="account-eyebrow">BEHIND THE DINNER PARTY</p>
            <h1>The host’s desk.</h1>
            <p className="account-intro">
              Keep the table welcoming. Leave a clear paper trail.
            </p>
          </div>
          <span className="admin-secure-label">
            <ShieldCheck size={17} /> Server-authorized administration
          </span>
        </div>
        {notice && (
          <div
            className={`account-notice ${notice.error ? "error" : "success"}`}
            role={notice.error ? "alert" : "status"}
          >
            <span>{notice.message}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice(null)}
            >
              <X size={17} />
            </button>
          </div>
        )}
        {denied ? (
          <section className="admin-denied">
            <ShieldCheck size={40} />
            <h2>This seat is for the hosts.</h2>
            <p>
              Sign in with an account explicitly authorized as an administrator.
              Access is checked on the server for every request.
            </p>
            <Link className="account-button primary" href="/account">
              Sign in to your account <ArrowRight size={17} />
            </Link>
          </section>
        ) : (
          <div className="admin-layout">
            <aside className="admin-sidebar">
              <nav aria-label="Administration">
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    className={tab === item.id ? "active" : ""}
                    onClick={() => {
                      setTab(item.id);
                      setPage(1);
                    }}
                    aria-current={tab === item.id ? "page" : undefined}
                  >
                    <item.icon size={17} />
                    <span>{item.label}</span>
                    {item.id === "review" && data.pending.length > 0 && (
                      <span className="admin-nav-count">
                        {data.pending.length}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
              <p className="account-small">
                Content moderation never changes payment records or silently
                reallocates seats.
              </p>
              <Link href="/content" className="account-back">
                Read table manners <ArrowRight size={14} />
              </Link>
              <Link href="/admin/studio" className="account-back">
                Promotional scene studio <ArrowRight size={14} />
              </Link>
            </aside>
            <div className="admin-workspace">
              <div className="admin-toolbar">
                <label className="admin-search">
                  <Search size={17} />
                  <span className="sr-only">
                    Search seats, guests, or orders
                  </span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Seat number, guest, email, or order…"
                  />
                </label>
                <button
                  className="account-button secondary icon-only"
                  title="Refresh current records"
                  aria-label="Refresh current records"
                  onClick={() => void refresh()}
                >
                  <RefreshCw size={17} className={loading ? "spin" : ""} />
                </button>
              </div>
              {blockers.length > 0 && (
                <details className="admin-launch-gate">
                  <summary>
                    <ShieldCheck size={16} /> Live purchases are disabled ·{" "}
                    {blockers.length} launch requirements
                  </summary>
                  <p>
                    Review and verify these requirements before explicitly
                    enabling live payments.
                  </p>
                  <ul>
                    {blockers.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </details>
              )}
              {donationStatus &&
                !donationStatus.active &&
                tab !== "donations" && (
                  <aside className="account-notice" role="status">
                    <div>
                      <strong>Donation setup needs attention.</strong>
                      <p>
                        Public donation claims are hidden until the recipient,
                        commitment, and financial records are verified.
                      </p>
                      {donationStatus.setupMissing.length > 0 && (
                        <p className="account-small">
                          {donationStatus.setupMissing.join(" · ")}
                        </p>
                      )}
                      <button
                        className="account-button secondary"
                        onClick={() => setTab("donations")}
                      >
                        Review donation setup <ArrowRight size={14} />
                      </button>
                    </div>
                  </aside>
                )}
              {loading && (
                <div className="admin-loading" role="status">
                  <LoaderCircle size={17} className="spin" /> Updating the
                  host’s desk…
                </div>
              )}
              {tab === "review" && (
                <section>
                  <div className="admin-section-title">
                    <div>
                      <h2>A little look before dinner.</h2>
                      <p>
                        Manual review queue. Pending guests appear as neutral
                        reserved seats in public.
                      </p>
                    </div>
                    <span className="account-pill">
                      {data.pending.length} on this page
                    </span>
                  </div>
                  {data.pending.length === 0 ? (
                    <EmptyState
                      icon={Check}
                      title="Everyone’s been looked after."
                      description="No profiles are awaiting review on this page."
                    />
                  ) : (
                    <div className="moderation-cards">
                      {data.pending.map((profile) => (
                        <article
                          className="moderation-card"
                          key={str(profile.seatId)}
                        >
                          <div className="moderation-portrait">
                            <GuestArt
                              customization={obj(profile.customization)}
                              variant={Number(profile.seatId)}
                            />
                          </div>
                          <div>
                            <p className="account-eyebrow">
                              SEAT {str(profile.seatId)} ·{" "}
                              {str(profile.neighborhood)}
                            </p>
                            <h3>{str(profile.displayName)}</h3>
                            <p className="review-message">
                              “{str(profile.message)}”
                            </p>
                            <dl className="review-meta">
                              <div>
                                <dt>Bringing</dt>
                                <dd>{str(profile.dish)}</dd>
                              </div>
                              <div>
                                <dt>Link</dt>
                                <dd>
                                  {profile.link ? (
                                    <a
                                      href={str(profile.link)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {str(profile.link)}{" "}
                                      <ExternalLink size={12} />
                                    </a>
                                  ) : (
                                    "No external link"
                                  )}
                                </dd>
                              </div>
                            </dl>
                            {controls(profile)}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}
              {tab === "seats" && (
                <section>
                  <div className="admin-section-title">
                    <div>
                      <h2>Places & peculiar people.</h2>
                      <p>
                        Seat allocation and public visibility are shown
                        separately.
                      </p>
                    </div>
                    <span className="account-pill">
                      {data.total || data.seats.length} matching seats
                    </span>
                  </div>
                  <div className="account-table-wrap">
                    <table className="account-table">
                      <thead>
                        <tr>
                          <th>Seat</th>
                          <th>Guest / owner</th>
                          <th>Allocation</th>
                          <th>Public content</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.seats.map((seat) => {
                          const profile: Row = {
                            ...obj(seat.profile),
                            seatId: seat.seatId,
                          };
                          return (
                            <tr key={str(seat.seatId)}>
                              <td>
                                <Link href={`/seat/${str(seat.seatId)}`}>
                                  #{str(seat.seatId)}
                                </Link>
                              </td>
                              <td>
                                <strong>
                                  {str(profile.displayName) || "No profile"}
                                </strong>
                                <br />
                                <span className="account-small">
                                  {str(seat.ownerEmail) || "Unassigned"}
                                </span>
                              </td>
                              <td>
                                <span className="account-status">
                                  {str(seat.state)}
                                </span>
                              </td>
                              <td>{str(profile.visibility) || "—"}</td>
                              <td>
                                {profile.visibility ? (
                                  <div className="admin-actions">
                                    <button
                                      className="account-button text"
                                      disabled={!!busy}
                                      onClick={() =>
                                        requireReason({
                                          action:
                                            profile.visibility === "hidden"
                                              ? "restore"
                                              : "hide",
                                          seatId: Number(seat.seatId),
                                        })
                                      }
                                    >
                                      {profile.visibility === "hidden"
                                        ? "Restore"
                                        : "Hide"}
                                    </button>
                                    {profile.link ? (
                                      <button
                                        className="account-button text"
                                        disabled={!!busy}
                                        onClick={() =>
                                          requireReason({
                                            action: "disable_link",
                                            seatId: Number(seat.seatId),
                                          })
                                        }
                                      >
                                        Disable link
                                      </button>
                                    ) : null}
                                  </div>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {data.seats.length === 0 && (
                      <EmptyState
                        icon={Search}
                        title="No seats matched."
                        description="Try a seat number or another search."
                      />
                    )}
                  </div>
                </section>
              )}
              {tab === "reports" && (
                <section>
                  <div className="admin-section-title">
                    <div>
                      <h2>Something needs a host.</h2>
                      <p>
                        Reports are signals for human review. Review the context
                        before taking action.
                      </p>
                    </div>
                  </div>
                  {data.reports.length === 0 ? (
                    <EmptyState
                      icon={Flag}
                      title="Nothing reported on this page."
                      description="New reports will appear here, with the relevant seat number."
                    />
                  ) : (
                    <div className="admin-record-list">
                      {data.reports.map((report) => (
                        <article className="admin-record" key={str(report.id)}>
                          <div>
                            <span className="account-eyebrow">
                              REPORT · SEAT {str(report.seatId)}
                            </span>
                            <h3>
                              {str(report.displayName) ||
                                `Guest at seat ${str(report.seatId)}`}
                            </h3>
                            <p>{str(report.reason)}</p>
                            <span className="account-small">
                              {dateLabel(report.createdAt)} ·{" "}
                              {str(report.status)}
                            </span>
                          </div>
                          <div className="admin-actions">
                            <Link
                              className="account-button secondary"
                              href={`/seat/${str(report.seatId)}`}
                              target="_blank"
                            >
                              Review guest <ExternalLink size={13} />
                            </Link>
                            <button
                              className="account-button text"
                              disabled={!!busy}
                              onClick={() =>
                                requireReason({
                                  action: "hide",
                                  seatId: Number(report.seatId),
                                  reportId: report.id,
                                })
                              }
                            >
                              <EyeOff size={15} /> Hide content
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}
              {tab === "orders" && (
                <section>
                  <div className="admin-section-title">
                    <div>
                      <h2>Payments, with receipts.</h2>
                      <p>
                        Reconcile against the checkout provider. Refund requests
                        are auditable and never silently substitute seats.
                      </p>
                    </div>
                  </div>
                  <div className="account-table-wrap">
                    <table className="account-table">
                      <thead>
                        <tr>
                          <th>Order / buyer</th>
                          <th>Seats</th>
                          <th>Total</th>
                          <th>Payment</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.orders.map((order) => (
                          <tr key={str(order.id)}>
                            <td>
                              <strong>{str(order.id).slice(0, 8)}</strong>
                              <br />
                              <span className="account-small">
                                {str(
                                  order.email ||
                                    order.buyerEmail ||
                                    order.userId,
                                )}
                              </span>
                              <br />
                              <span className="account-small">
                                {dateLabel(order.createdAt)}
                              </span>
                            </td>
                            <td>
                              {Array.isArray(order.seatIds)
                                ? order.seatIds.join(", ")
                                : str(order.packageId)}
                            </td>
                            <td>
                              {amountLabel(order.amount)}
                              <br />
                              <span className="account-small">
                                {str(order.provider)}
                              </span>
                            </td>
                            <td>
                              <span className="account-status">
                                {str(order.status || order.paymentStatus)}
                              </span>
                              {order.fulfillmentStatus ? (
                                <span className="order-fulfillment">
                                  {str(order.fulfillmentStatus)}
                                </span>
                              ) : null}
                            </td>
                            <td>
                              <div className="admin-actions">
                                <button
                                  className="account-button text"
                                  disabled={!!busy}
                                  onClick={() =>
                                    void action(
                                      {
                                        action: "reconcile",
                                        orderId: order.id,
                                      },
                                      "Reconciliation completed. Check payment and fulfillment status for the result.",
                                    )
                                  }
                                >
                                  <RefreshCw size={14} /> Reconcile
                                </button>
                                <button
                                  className="account-button text danger"
                                  disabled={
                                    !!busy ||
                                    ![
                                      "paid",
                                      "fulfilled",
                                      "processing",
                                      "fulfillment_conflict",
                                      "fulfillment_issue",
                                      "refund_requested",
                                      "disputed",
                                    ].includes(
                                      str(order.status || order.paymentStatus),
                                    )
                                  }
                                  onClick={() =>
                                    requireReason({
                                      action: "refund",
                                      orderId: order.id,
                                    })
                                  }
                                >
                                  Request refund
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {data.orders.length === 0 && (
                      <EmptyState
                        icon={Ticket}
                        title="No matching orders."
                        description="Orders and their payment status appear here as checkout begins."
                      />
                    )}
                  </div>
                </section>
              )}
              {tab === "invitations" && (
                <section>
                  <div className="admin-section-title">
                    <div>
                      <h2>Who’s bringing a friend?</h2>
                      <p>
                        Courtesy holds and paid-seat claims use separate token
                        types. Secret tokens are never displayed here.
                      </p>
                    </div>
                  </div>
                  <RecordTable
                    rows={data.invitations}
                    columns={[
                      ["type", "Type"],
                      ["sourceSeatId", "From seat"],
                      ["targetSeatId", "For seat"],
                      ["status", "Status"],
                      ["expiresAt", "Expires"],
                      ["createdAt", "Created"],
                    ]}
                    emptyTitle="No invitations on this page."
                  />
                </section>
              )}
              {tab === "support" && (
                <section>
                  <div className="admin-section-title">
                    <div>
                      <h2>A helping hand.</h2>
                      <p>
                        Support issues, fulfillment conflicts, and deletion
                        requests require a human response.
                      </p>
                    </div>
                  </div>
                  {data.support.length === 0 ? (
                    <EmptyState
                      icon={ShieldCheck}
                      title="No support issues on this page."
                      description="Customer requests and payment fulfillment issues are recorded here."
                    />
                  ) : (
                    <div className="admin-record-list">
                      {data.support.map((item) => (
                        <article className="admin-record" key={str(item.id)}>
                          <div>
                            <span className="account-eyebrow">
                              {str(item.kind)} · {str(item.status)}
                            </span>
                            <h3>
                              {str(
                                item.subject || item.kind || "Support request",
                              )}
                            </h3>
                            <p className="preserve-whitespace">
                              {str(item.message)}
                            </p>
                            <span className="account-small">
                              {str(item.email || item.userId)} ·{" "}
                              {dateLabel(item.createdAt)}
                              {item.orderId
                                ? ` · Order ${str(item.orderId)}`
                                : ""}
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}
              {tab === "settings" && (
                <section>
                  <div className="admin-section-title">
                    <div>
                      <h2>Set the table.</h2>
                      <p>
                        Changes apply to future checkouts. Existing orders
                        retain their original total.
                      </p>
                    </div>
                  </div>
                  <SettingsEditor
                    data={data}
                    disabled={!!busy}
                    onSave={(settings) =>
                      void action(
                        {
                          action: "settings",
                          settings,
                          reason:
                            "Pricing and neighborhood labels updated from the host’s desk.",
                        },
                        "Table settings saved. Existing orders are unchanged.",
                      )
                    }
                  />
                </section>
              )}
              {tab === "donations" && (
                <DonationAdmin onStatusChange={setDonationStatus} />
              )}
              {tab === "journey" && <JourneySummary summary={data.journey} />}
              {tab === "audit" && (
                <section>
                  <div className="admin-section-title">
                    <div>
                      <h2>A record of the hosts.</h2>
                      <p>
                        Administrative changes are timestamped and tied to the
                        acting account.
                      </p>
                    </div>
                  </div>
                  <RecordTable
                    rows={data.audit}
                    columns={[
                      ["createdAt", "When"],
                      ["actorId", "Host"],
                      ["action", "Action"],
                      ["target", "Target"],
                      ["details", "Details"],
                    ]}
                    emptyTitle="No administrative changes on this page."
                  />
                </section>
              )}
              {tab !== "donations" && tab !== "journey" && (
                <div className="admin-pagination">
                  <span className="account-small">
                    Page {page} · up to 30 records per list
                  </span>
                  <div>
                    <button
                      className="account-button secondary"
                      disabled={page <= 1 || loading}
                      onClick={() =>
                        setPage((current) => Math.max(1, current - 1))
                      }
                    >
                      <ArrowLeft size={15} /> Previous
                    </button>
                    <button
                      className="account-button secondary"
                      disabled={
                        loading ||
                        Math.max(
                          data.seats.length,
                          data.orders.length,
                          data.audit.length,
                          data.reports.length,
                          data.pending.length,
                          data.invitations.length,
                          data.support.length,
                        ) < 30
                      }
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Next <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {confirm && (
          <section
            className="admin-confirm"
            aria-label="Confirm administrative action"
          >
            <div>
              <p className="account-eyebrow">AUDITABLE ACTION</p>
              <h2>
                {str(confirm.action) === "refund"
                  ? "Request a refund."
                  : str(confirm.action) === "disable_link"
                    ? "Disable this external link."
                    : str(confirm.action) === "restore"
                      ? "Restore this guest."
                      : "Hide this public content."}
              </h2>
              <p>
                {str(confirm.action) === "refund"
                  ? "The server will record the request and use the configured provider when available. A request alone is not a confirmed refund."
                  : "The permanent seat allocation and financial records remain separate from this content decision."}
              </p>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void action(
                  { ...confirm, reason },
                  str(confirm.action) === "refund"
                    ? "Refund request recorded. Review the order and support queue for provider confirmation."
                    : "Administrative action saved to the audit log.",
                );
              }}
            >
              <label className="account-label">
                Reason for the audit log
                <textarea
                  required
                  minLength={5}
                  maxLength={500}
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  autoFocus
                />
              </label>
              <div className="admin-actions">
                <button className="account-button primary" disabled={!!busy}>
                  {busy ? "Saving…" : "Confirm action"}
                </button>
                <button
                  type="button"
                  className="account-button secondary"
                  onClick={() => setConfirm(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}

function JourneySummary({ summary }: { summary: Row }) {
  const counts = arr(summary?.counts);
  return (
    <section aria-label="Measured acquisition and purchase events">
      <div className="admin-section-title">
        <div>
          <h2>From a peculiar guest to good company.</h2>
          <p>
            Recorded events, separated by environment and source. These counts
            are actions, not unique visitors or conversion rates.
          </p>
        </div>
      </div>
      <dl className="selected-order-details">
        <div>
          <dt>Analytics adapter</dt>
          <dd>{str(summary?.adapter) || "Not available"}</dd>
        </div>
        <div>
          <dt>Browser collection</dt>
          <dd>
            {summary?.enabled === true
              ? "Enabled, with privacy controls"
              : "Disabled"}
          </dd>
        </div>
        <div>
          <dt>Reporting cutoff</dt>
          <dd>{dateLabel(summary?.cutoffAt)}</dd>
        </div>
      </dl>
      <p className="account-small">
        {str(summary?.attributionRule)} Confirmed fulfillment events are
        recorded by the server and deduplicated by order. Opening a share sheet
        records an invocation; it does not prove an invitation was shared.
      </p>
      {counts.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No journey events recorded."
          description="Actual permitted browser events and confirmed server events will appear here. Development actions remain labeled separately."
        />
      ) : (
        <div className="account-table-wrap">
          <table className="account-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Recorded count</th>
                <th>Source</th>
                <th>Environment</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((row) => (
                <tr
                  key={`${str(row.name)}:${str(row.source)}:${Boolean(row.isDevelopment)}`}
                >
                  <td>{str(row.name).replaceAll("_", " ")}</td>
                  <td>{Number(row.count || 0).toLocaleString()}</td>
                  <td>{str(row.source)}</td>
                  <td>
                    <span className="account-pill">
                      {row.isDevelopment === true
                        ? "Development · test activity"
                        : "Production"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Flag;
  title: string;
  description: string;
}) {
  return (
    <div className="account-simple-empty">
      <Icon size={29} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
function RecordTable({
  rows,
  columns,
  emptyTitle,
}: {
  rows: Row[];
  columns: [string, string][];
  emptyTitle: string;
}) {
  return (
    <div className="account-table-wrap">
      <table className="account-table">
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <th key={key}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={str(row.id) || index}>
              {columns.map(([key]) => (
                <td key={key}>
                  {key.endsWith("At") ? (
                    dateLabel(row[key])
                  ) : typeof row[key] === "object" ? (
                    <code className="audit-details">
                      {JSON.stringify(row[key])}
                    </code>
                  ) : (
                    str(row[key]) || "—"
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title={emptyTitle}
          description="Records appear here when there is activity to review."
        />
      )}
    </div>
  );
}
function SettingsEditor({
  data,
  disabled,
  onSave,
}: {
  data: AdminData;
  disabled: boolean;
  onSave: (settings: Row) => void;
}) {
  const [packages, setPackages] = useState(data.packages);
  const [neighborhoods, setNeighborhoods] = useState(data.neighborhoods);
  useEffect(() => {
    setPackages(data.packages);
    setNeighborhoods(data.neighborhoods);
  }, [data.packages, data.neighborhoods]);
  return (
    <form
      className="admin-settings"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          packages: packages.map((item) => ({
            id: item.id,
            count: Number(item.count),
            amount: Number(item.amount),
            label: item.label,
          })),
          neighborhoods: neighborhoods.map((item) => ({
            id: item.id,
            name: item.name,
          })),
        });
      }}
    >
      <div className="settings-block">
        <h3>USD package prices</h3>
        <p className="account-small">
          Amounts are stored in integer cents. Customers see the server’s
          current price before paying.
        </p>
        {packages.map((item, index) => (
          <div className="settings-row" key={str(item.id)}>
            <label className="account-label">
              Package label
              <input
                required
                maxLength={60}
                value={str(item.label)}
                onChange={(event) =>
                  setPackages((current) =>
                    current.map((value, position) =>
                      position === index
                        ? { ...value, label: event.target.value }
                        : value,
                    ),
                  )
                }
              />
            </label>
            <label className="account-label">
              Amount in cents
              <input
                required
                type="number"
                min={100}
                max={100000}
                step={1}
                value={str(item.amount)}
                onChange={(event) =>
                  setPackages((current) =>
                    current.map((value, position) =>
                      position === index
                        ? { ...value, amount: Number(event.target.value) }
                        : value,
                    ),
                  )
                }
              />
            </label>
            <span className="account-small">
              {str(item.count)} seat{Number(item.count) === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
      <div className="settings-block">
        <h3>Neighborhood labels</h3>
        <p className="account-small">
          Seat ranges stay fixed. Membership is a guest’s choice, never inferred
          from identity.
        </p>
        {neighborhoods.map((item, index) => (
          <label
            className="account-label settings-neighborhood"
            key={str(item.id)}
          >
            <span>
              Seats {str(value(item, "startSeat", "start_seat"))}–
              {str(value(item, "endSeat", "end_seat"))}
            </span>
            <input
              required
              maxLength={60}
              value={str(item.name)}
              onChange={(event) =>
                setNeighborhoods((current) =>
                  current.map((value, position) =>
                    position === index
                      ? { ...value, name: event.target.value }
                      : value,
                  ),
                )
              }
            />
          </label>
        ))}
      </div>
      <button className="account-button primary" disabled={disabled}>
        <Check size={16} /> Save table settings
      </button>
    </form>
  );
}
