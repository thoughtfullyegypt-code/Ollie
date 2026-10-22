"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  HeartHandshake,
  Gift,
  LoaderCircle,
  LogOut,
  Mail,
  Plus,
  Shield,
  Ticket,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  GuestArt,
  BASES,
  ACCESSORIES,
  OUTFITS,
  DISHES,
  SKIN_TONES,
} from "./art/illustrations";
import Modal from "./modal";
import PostPurchaseMoment from "./post-purchase-moment";
import GiftManagement from "./gift-management";
import type { GiftRecord } from "@/lib/gift-input";
import "./account.css";

type Row = Record<string, unknown>;
type Notice = { kind: "success" | "error"; message: string } | null;
type Owner = {
  user: { id: string; email: string; name: string; role?: string };
  seats: Row[];
  orders: Row[];
  invitations: Row[];
  support?: Row[];
};
type Arrival = {
  orderId: string;
  profile: {
    displayName: string;
    message: string;
    dish: string;
    customization: Record<string, string>;
  };
  seatIds: number[];
  packageId: string;
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
const field = (row: Row, key: string, other?: string) =>
  row[key] ?? (other ? row[other] : undefined);
const dateLabel = (value: unknown) =>
  value
    ? new Date(str(value)).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
const money = (value: unknown) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(value || 0) / 100,
  );
async function request(path: string, init?: RequestInit): Promise<Row> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      str(body.error?.message || body.error || body.message) ||
        "Something went wrong. Please try again.",
    );
  return body;
}

// The return URL is only a reason to check. Payment and the exact inventory
// must both be confirmed by the server before the arrival is shown.
async function confirmedArrival(order: Row): Promise<Arrival | null> {
  if (order.status !== "paid" || order.giftId) return null;
  const ids = Array.isArray(order.seatIds) ? order.seatIds.map(Number) : [];
  if (
    !ids.length ||
    ids.some((id) => !Number.isInteger(id) || id < 1 || id > 10000)
  )
    return null;
  const [account, table] = await Promise.all([
    request("/api/me"),
    request(`/api/table?start=${Math.min(...ids)}&end=${Math.max(...ids)}`),
  ]);
  const primary = arr(account.seats).find(
    (seat) =>
      Number(field(seat, "seatId", "id")) === ids[0] &&
      seat.state === "purchased",
  );
  if (
    !obj(account.user).id ||
    !primary ||
    ids.some(
      (id) =>
        !arr(table.seats).some(
          (seat) =>
            Number(field(seat, "seatId", "id")) === id &&
            seat.state === "purchased",
        ),
    )
  )
    return null;
  const profile = { ...primary, ...obj(primary.profile) };
  return {
    orderId: str(order.id),
    profile: {
      displayName: str(profile.displayName || profile.display_name),
      message: str(profile.message),
      dish: str(profile.dish) || "soup",
      customization: Object.fromEntries(
        Object.entries(obj(profile.customization)).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
    },
    seatIds: ids,
    packageId: str(order.packageId),
  };
}

export default function AccountPanel({
  brandName = "A Seat at the Internet",
}: {
  brandName?: string;
}) {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [loading, setLoading] = useState(true);
  const [development, setDevelopment] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const [inbox, setInbox] = useState<Row[]>([]);
  const [invite, setInvite] = useState<Row | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Row | null>(null);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [arrivalCandidate, setArrivalCandidate] = useState<string | null>(null);
  const seenArrivals = useRef(new Set<string>());
  const [developmentCheckout, setDevelopmentCheckout] = useState(false);
  const [giftRecords, setGiftRecords] = useState<GiftRecord[]>([]);
  const [giftFocusId, setGiftFocusId] = useState<string | null>(null);
  const [section, setSection] = useState<
    "seats" | "orders" | "invitations" | "gifts" | "help"
  >("seats");
  const refreshGifts = useCallback(async () => {
    const result = await request("/api/gifts");
    setGiftRecords(
      Array.isArray(result.gifts) ? (result.gifts as GiftRecord[]) : [],
    );
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      if (response.status === 401) {
        setOwner(null);
        return;
      }
      const body = await response.json();
      setDevelopment(Boolean(body.config?.devTools));
      if (!response.ok)
        throw new Error(
          str(body.error?.message || body.error) ||
            "Could not load your account.",
        );
      if (!body.user) {
        setOwner(null);
        return;
      }
      setOwner({
        ...body,
        seats: arr(body.seats),
        orders: arr(body.orders),
        invitations: arr(body.invitations),
      });
      await refreshGifts().catch(() => {});
    } catch (error) {
      setNotice({ kind: "error", message: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, [refreshGifts]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!owner?.user.id) {
      setGiftRecords([]);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const giftId = params.get("gift");
    if (giftId) {
      setGiftFocusId(giftId);
      setSection("gifts");
    } else if (params.get("section") === "gifts") {
      setSection("gifts");
    }
  }, [owner?.user.id]);
  useEffect(() => {
    if (
      !owner?.user.id ||
      !giftRecords.some((g) => ["awaiting_payment", "ready"].includes(g.status))
    )
      return;
    const delay = giftRecords.some((g) => g.status === "awaiting_payment")
      ? 5000
      : 30000;
    const timer = setInterval(() => {
      if (!document.hidden) void refreshGifts().catch(() => {});
    }, delay);
    return () => clearInterval(timer);
  }, [owner?.user.id, giftRecords, refreshGifts]);
  useEffect(() => {
    if (!sent || !email) return;
    let active = true;
    const check = async () => {
      try {
        const response = await fetch(
          `/api/dev/inbox?email=${encodeURIComponent(email)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const data = await response.json();
        if (active && data.development) setInbox(arr(data.messages));
      } catch {
        /* Email delivery remains usable without the development inbox. */
      }
    };
    void check();
    const timer = setInterval(check, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [sent, email]);

  useEffect(() => {
    if (!owner?.user.id) return;
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order");
    if (!orderId) return;
    setSection("orders");
    request(`/api/orders/${encodeURIComponent(orderId)}`)
      .then((order) => {
        if (!active) return;
        setSelectedOrder(order);
        if (params.get("checkout") === "returned") setArrivalCandidate(orderId);
      })
      .catch((error) => {
        if (active)
          setNotice({ kind: "error", message: (error as Error).message });
      });
    return () => {
      active = false;
    };
  }, [owner?.user.id]);

  const rememberArrival = useCallback((userId: string, orderId: string) => {
    const key = `dinner-arrived:${userId}:${orderId}`;
    seenArrivals.current.add(key);
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      // The in-memory guard still prevents repeated dialogs when storage is off.
    }
  }, []);
  useEffect(() => {
    if (!arrivalCandidate || !owner?.user.id) return;
    const userId = owner.user.id;
    const key = `dinner-arrived:${userId}:${arrivalCandidate}`;
    let alreadySeen = seenArrivals.current.has(key);
    try {
      alreadySeen ||= sessionStorage.getItem(key) === "1";
    } catch {}
    if (alreadySeen) {
      setArrivalCandidate(null);
      return;
    }
    let active = true;
    let checking = false;
    const check = async () => {
      if (!active || checking || document.hidden) return;
      checking = true;
      try {
        const order = await request(
          `/api/orders/${encodeURIComponent(arrivalCandidate)}`,
        );
        if (!active) return;
        setSelectedOrder((previous) =>
          previous?.id === order.id ? order : previous,
        );
        if (order.status === "paid") {
          if (order.giftId) {
            rememberArrival(userId, str(order.id));
            setGiftFocusId(str(order.giftId));
            setSection("gifts");
            setArrivalCandidate(null);
            await refresh();
            return;
          }
          const confirmed = await confirmedArrival(order);
          if (!active || !confirmed) return;
          rememberArrival(userId, confirmed.orderId);
          setArrival(confirmed);
          setArrivalCandidate(null);
          await refresh();
        } else if (
          !["checkout_pending", "processing", "payment_processing"].includes(
            str(order.status),
          )
        ) {
          setArrivalCandidate(null);
        }
      } catch {
        // Keep the authoritative order visible and retry delayed confirmation.
        // An interrupted return never triggers another payment or publication.
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = setInterval(check, 4000);
    document.addEventListener("visibilitychange", check);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [arrivalCandidate, owner?.user.id, refresh, rememberArrival]);
  useEffect(() => {
    if (
      !selectedOrder?.id ||
      arrivalCandidate === selectedOrder.id ||
      !["checkout_pending", "processing", "payment_processing"].includes(
        str(selectedOrder.status),
      )
    )
      return;
    const timer = setInterval(() => {
      request(`/api/orders/${encodeURIComponent(str(selectedOrder.id))}`)
        .then((order) => {
          setSelectedOrder(order);
          if (
            !["checkout_pending", "processing", "payment_processing"].includes(
              str(order.status),
            )
          )
            void refresh();
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [selectedOrder?.id, selectedOrder?.status, arrivalCandidate, refresh]);

  async function reopenArrival(orderId: string) {
    await run(`arrival-${orderId}`, async () => {
      const order = await request(`/api/orders/${encodeURIComponent(orderId)}`);
      setSelectedOrder(order);
      if (order.giftId) {
        setGiftFocusId(str(order.giftId));
        setSection("gifts");
        await refreshGifts();
        return;
      }
      const confirmed = await confirmedArrival(order);
      if (!confirmed)
        throw new Error(
          "Your payment and exact seat fulfillment are still being confirmed. Keep this order reference and ask a host for help; you do not need to pay again.",
        );
      if (owner) rememberArrival(owner.user.id, orderId);
      setArrivalCandidate(null);
      setArrival(confirmed);
    });
  }
  async function viewOrder(orderId: string) {
    await run(`order-${orderId}`, async () => {
      setSelectedOrder(
        await request(`/api/orders/${encodeURIComponent(orderId)}`),
      );
      setDevelopmentCheckout(false);
    });
  }
  async function resumeOrder() {
    if (!selectedOrder?.id) return;
    await run("resume", async () => {
      const result = await request(
        `/api/orders/${encodeURIComponent(str(selectedOrder.id))}`,
        { method: "POST", body: "{}" },
      );
      if (result.url) {
        window.location.assign(str(result.url));
        return;
      }
      if (result.mode === "development") setDevelopmentCheckout(true);
    });
  }
  async function completeDevelopmentOrder(outcome: "paid" | "failed") {
    if (!selectedOrder?.id) return;
    await run("dev-order", async () => {
      await request("/api/dev/pay", {
        method: "POST",
        body: JSON.stringify({ orderId: selectedOrder.id, outcome }),
      });
      const order = await request(
        `/api/orders/${encodeURIComponent(str(selectedOrder.id))}`,
      );
      setSelectedOrder(order);
      setDevelopmentCheckout(false);
      await refresh();
      if (outcome === "paid") setArrivalCandidate(str(order.id));
      setNotice({
        kind: "success",
        message:
          outcome === "paid"
            ? order.status === "paid"
              ? "Development order paid and fulfilled on the server. Your guest is awaiting moderation. No money was charged."
              : "The development payment event was recorded. Check the authoritative order status below before continuing; no money was charged."
            : "Development payment declined. No money was charged. Your guest draft remains saved.",
      });
    });
  }
  function downloadOrder() {
    if (!selectedOrder) return;
    const text = `${brandName}\nORDER RECORD\n\nOrder: ${str(selectedOrder.id)}\nDate: ${dateLabel(selectedOrder.createdAt)}\nAmount: ${money(selectedOrder.amount)} USD\nStatus: ${str(selectedOrder.status)}\nSeats: ${Array.isArray(selectedOrder.seatIds) ? selectedOrder.seatIds.join(", ") : "See account"}\nProvider: ${str(selectedOrder.provider)}\n\n${selectedOrder.provider === "development" ? "DEVELOPMENT ONLY. No payment was collected. This is not a payment receipt." : "This is an order record. Your payment provider receipt is the authoritative payment receipt."}\n`;
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `dinner-order-${str(selectedOrder.id).slice(0, 8)}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function run(key: string, operation: () => Promise<void>) {
    setBusy(key);
    setNotice(null);
    try {
      await operation();
    } catch (error) {
      setNotice({ kind: "error", message: (error as Error).message });
    } finally {
      setBusy("");
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice({
        kind: "success",
        message: "Link copied. There’s room for a friend.",
      });
    } catch {
      setNotice({
        kind: "error",
        message:
          "Your browser could not copy the link. Select and copy it below.",
      });
    }
  }
  function seatId(seat: Row) {
    return Number(field(seat, "seatId", "id"));
  }
  async function inviteFriend(seat: Row, type: "courtesy" | "paid") {
    await run(`invite-${seatId(seat)}`, async () => {
      const result = await request("/api/invitations", {
        method: "POST",
        body: JSON.stringify({ seatId: seatId(seat), type }),
      });
      setInvite(result);
      await refresh();
    });
  }

  return (
    <div className="account-shell">
      <header className="account-header">
        <Link href="/" className="account-wordmark">
          {brandName}
          <span aria-hidden="true">✳</span>
        </Link>
        <Link href="/" className="account-back">
          <ArrowLeft size={16} /> Back to dinner
        </Link>
      </header>
      <main className="account-main">
        {notice && (
          <div
            className={`account-notice ${notice.kind}`}
            role={notice.kind === "error" ? "alert" : "status"}
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
        {development && (
          <div className="account-development-note">
            <strong>Development dinner · no real charges.</strong>
            <span>
              For local sign-in, use an @example.test email address. Sign-in
              links appear in the development inbox below.
            </span>
          </div>
        )}
        {loading ? (
          <div className="account-loading" role="status">
            <LoaderCircle className="spin" size={24} /> Pulling out your chair…
          </div>
        ) : !owner ? (
          <div className="signin-layout">
            <section className="signin-art" aria-hidden="true">
              <div className="signin-frame">
                <GuestArt base="plant" variant={5} />
                <div className="signin-napkin">
                  There’s a place
                  <br />
                  for you here.
                </div>
              </div>
              <p>
                A little less scrolling.
                <br />
                <em>A little more belonging.</em>
              </p>
            </section>
            <section className="signin-form">
              <p className="account-eyebrow">YOUR PLACE AT THE TABLE</p>
              <h1>
                Good to have
                <br />
                you here.
              </h1>
              <p className="account-intro">
                Your guests, your invitations, your wonderfully strange corner
                of the internet.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run("signin", async () => {
                    await request("/api/auth/sign-in/magic-link", {
                      method: "POST",
                      body: JSON.stringify({
                        email,
                        name: name || email.split("@")[0],
                        callbackURL: `${window.location.origin}/account${window.location.search}`,
                      }),
                    });
                    setSent(true);
                    setNotice({
                      kind: "success",
                      message:
                        "Your sign-in link is on its way. It expires shortly and can only be used once.",
                    });
                  });
                }}
              >
                <label className="account-label">
                  What should we call you?
                  <input
                    autoComplete="given-name"
                    maxLength={60}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                  />
                </label>
                <label className="account-label">
                  Email address
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setSent(false);
                      setInbox([]);
                    }}
                    placeholder={
                      development ? "you@example.test" : "you@somewhere.nice"
                    }
                  />
                </label>
                <button
                  className="account-button primary wide"
                  disabled={!!busy}
                >
                  <Mail size={17} />{" "}
                  {busy === "signin"
                    ? "Sending your link…"
                    : sent
                      ? "Send another sign-in link"
                      : "Send me a sign-in link"}
                  <ArrowRight size={17} />
                </button>
              </form>
              <p className="account-small">
                No password to remember. Your email is kept private.
              </p>
              {sent && inbox.length > 0 && (
                <div className="development-inbox">
                  <span className="account-pill">DEVELOPMENT INBOX</span>
                  <h3>Your local sign-in link</h3>
                  <p>
                    Email delivery is disabled in this development environment.
                    This private development tool replaces delivery; it is
                    unavailable in live mode.
                  </p>
                  {inbox.slice(-1).map((message, index) => (
                    <a
                      className="account-button secondary wide"
                      href={str(message.url)}
                      key={index}
                    >
                      Open sign-in link <ArrowRight size={16} />
                    </a>
                  ))}
                </div>
              )}
              <p className="account-small">
                By joining, you agree to our{" "}
                <Link href="/terms">service terms</Link> and{" "}
                <Link href="/privacy">privacy notice</Link>.
              </p>
            </section>
          </div>
        ) : (
          <>
            <div className="account-page-title">
              <div>
                <p className="account-eyebrow">A LITTLE CORNER, ALL YOURS</p>
                <h1>
                  Welcome back, {owner.user.name?.split(" ")[0] || "friend"}.
                </h1>
                <p className="account-intro">
                  Settle in. Your place is right here.
                </p>
              </div>
              <div className="account-title-actions">
                <Link className="account-button secondary" href="/save-a-seat">
                  <Gift size={16} /> Save a seat for someone
                </Link>
                {owner.user.role === "admin" && (
                  <Link className="account-button secondary" href="/admin">
                    <Shield size={16} /> Host’s desk
                  </Link>
                )}
                <button
                  className="account-button text"
                  onClick={() =>
                    void run("signout", async () => {
                      await request("/api/auth/sign-out", {
                        method: "POST",
                        body: "{}",
                      });
                      setOwner(null);
                    })
                  }
                >
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            </div>
            {giftRecords.some((g) => g.thankYouAt) && (
              <div className="gift-dashboard-thanks">
                <span>
                  <strong>A thank-you is waiting at your seat.</strong> Someone
                  opened one of your little surprises and sent “Thank you ❤️”.
                </span>
                <button
                  className="account-button text"
                  onClick={() => {
                    setGiftFocusId(
                      giftRecords.find((g) => g.thankYouAt)?.id || null,
                    );
                    setSection("gifts");
                  }}
                >
                  Read your thank-you <ArrowRight size={15} />
                </button>
              </div>
            )}
            <nav className="account-tabs" aria-label="Account sections">
              {(
                [
                  ["seats", "Your seats", owner.seats.length],
                  ["invitations", "Invitations", owner.invitations.length],
                  ["gifts", "Gifts", giftRecords.length],
                  ["orders", "Orders & receipts", owner.orders.length],
                  ["help", "A little help", null],
                ] as const
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  className={section === id ? "active" : ""}
                  aria-current={section === id ? "page" : undefined}
                  onClick={() => setSection(id)}
                >
                  {label}
                  {count !== null && <span>{count}</span>}
                </button>
              ))}
            </nav>
            {section === "seats" && (
              <section aria-label="Your seats">
                {owner.seats.length === 0 ? (
                  <div className="account-empty">
                    <GuestArt base="ghost" variant={3} />
                    <h2>Your chair is waiting.</h2>
                    <p>Come as you are. Or as a vampire with garlic bread.</p>
                    <Link href="/?join=1" className="account-button primary">
                      Find my seat <ArrowRight size={17} />
                    </Link>
                  </div>
                ) : (
                  <div className="owned-seats">
                    {owner.seats.map((seat) => {
                      const profile = { ...seat, ...obj(seat.profile) };
                      const id = seatId(seat);
                      const customization = obj(profile.customization);
                      const status = str(
                        profile.visibility || profile.status || "pending",
                      );
                      const sourceOrder = owner.orders.find(
                        (order) =>
                          Array.isArray(order.seatIds) &&
                          order.seatIds.includes(id),
                      );
                      const groupSeats = Array.isArray(sourceOrder?.seatIds)
                        ? sourceOrder.seatIds.map(Number)
                        : [id];
                      const groupSeat = seat.packageId
                        ? str(seat.packageId) !== "one"
                        : groupSeats.length > 1;
                      const primarySeat = Math.min(...groupSeats) === id;
                      const recipientGiftReserved =
                        seat.giftReserved === true ||
                        giftRecords.some(
                          (g) =>
                            g.recipientSeatId === id &&
                            !g.claimedAt &&
                            ["awaiting_payment", "ready", "revoked"].includes(
                              g.status,
                            ),
                        );
                      const seatGifts = giftRecords.filter(
                        (g) => g.senderSeatId === id,
                      );
                      const canInviteCourtesy =
                        seat.canInviteCourtesy === true &&
                        !recipientGiftReserved;
                      const canInvitePaid =
                        seat.canInvitePaid === true && !recipientGiftReserved;
                      return (
                        <article className="owned-seat" key={id}>
                          <div className="owned-portrait">
                            <GuestArt
                              customization={customization}
                              base={str(customization.base) || "human"}
                              variant={id}
                            />
                            <span className="seat-number">
                              SEAT {id.toLocaleString()}
                            </span>
                          </div>
                          <div className="owned-seat-content">
                            <div className="owned-seat-heading">
                              <h2>
                                {str(
                                  profile.displayName || profile.display_name,
                                ) || "A guest to be dreamed up"}
                              </h2>
                              <span className={`account-status ${status}`}>
                                {status === "published"
                                  ? "At the table"
                                  : status === "pending"
                                    ? "Awaiting review"
                                    : status}
                              </span>
                            </div>
                            <p>
                              {str(profile.message) ||
                                "Your story starts with a little introduction."}
                            </p>
                            {seatGifts
                              .filter((g) => g.thankYouAt)
                              .map((g) => (
                                <p key={g.id} className="gift-seat-thanks">
                                  Thank you ❤️{" "}
                                  <span>
                                    A thank-you arrived for your{" "}
                                    {g.occasion === "birthday"
                                      ? "birthday"
                                      : "dinner"}{" "}
                                    surprise on {dateLabel(g.thankYouAt)}.
                                  </span>{" "}
                                  <button
                                    className="account-button text"
                                    onClick={() => {
                                      setGiftFocusId(g.id);
                                      setSection("gifts");
                                    }}
                                  >
                                    Open gift details <ArrowRight size={14} />
                                  </button>
                                </p>
                              ))}
                            {recipientGiftReserved && (
                              <p className="account-small">
                                This guest is part of a private saved-seat
                                surprise. Manage its secure gift link in Gifts;
                                an ordinary invitation cannot replace it.
                              </p>
                            )}
                            <div className="owned-seat-actions">
                              <Link
                                className="account-button secondary"
                                href={`/seat/${id}`}
                              >
                                Visit my seat <ExternalLink size={14} />
                              </Link>
                              {!recipientGiftReserved && (
                                <Link
                                  className="account-button text"
                                  href={`/save-a-seat?sourceSeatId=${id}`}
                                >
                                  <Gift size={16} /> Save a seat for someone
                                </Link>
                              )}
                              {seatGifts.length > 0 && (
                                <button
                                  className="account-button text"
                                  onClick={() => {
                                    setGiftFocusId(seatGifts[0].id);
                                    setSection("gifts");
                                  }}
                                >
                                  Manage saved-seat surprise{" "}
                                  <ArrowRight size={15} />
                                </button>
                              )}
                              {canInviteCourtesy && (
                                <button
                                  className="account-button text"
                                  disabled={!!busy}
                                  onClick={() =>
                                    void inviteFriend(seat, "courtesy")
                                  }
                                >
                                  <Users size={16} /> Save a nearby seat
                                </button>
                              )}
                              {canInvitePaid && (
                                <button
                                  className="account-button text"
                                  disabled={!!busy}
                                  onClick={() =>
                                    void inviteFriend(seat, "paid")
                                  }
                                >
                                  <Ticket size={16} /> Invite to this paid seat
                                </button>
                              )}
                            </div>
                            {!recipientGiftReserved && (
                              <details className="seat-editor">
                                <summary>
                                  Customize this guest <Plus size={16} />
                                </summary>
                                <SeatEditor
                                  seat={profile}
                                  onSave={async (input) => {
                                    await run(`save-${id}`, async () => {
                                      await request(`/api/seats/${id}`, {
                                        method: "PUT",
                                        body: JSON.stringify(input),
                                      });
                                      setNotice({
                                        kind: "success",
                                        message:
                                          "Your guest is saved. Public edits enter the manual review queue.",
                                      });
                                      await refresh();
                                    });
                                  }}
                                  disabled={!!busy}
                                />
                              </details>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
            {section === "gifts" && (
              <GiftManagement
                gifts={giftRecords}
                onRefresh={refreshGifts}
                focusGiftId={giftFocusId}
                onViewOrder={(id) => {
                  setSection("orders");
                  void viewOrder(id);
                }}
              />
            )}
            {section === "invitations" && (
              <section className="account-section">
                <div className="account-section-heading">
                  <h2>Pull up another chair.</h2>
                  <p>
                    Courtesy invitations reserve a nearby place temporarily.
                    Paid group invitations give your friend a seat you already
                    purchased.
                  </p>
                </div>
                {owner.invitations.length === 0 ? (
                  <div className="account-simple-empty">
                    <Users size={30} />
                    <h3>A good dinner deserves good company.</h3>
                    <p>Open one of your seats to create an invitation.</p>
                    <button
                      className="account-button secondary"
                      onClick={() => setSection("seats")}
                    >
                      See my seats
                    </button>
                  </div>
                ) : (
                  <div className="invitation-list">
                    {owner.invitations.map((item) => (
                      <article className="invitation-row" key={str(item.id)}>
                        <div className="invitation-icon">
                          <Users size={25} />
                        </div>
                        <div>
                          <h3>
                            {str(item.type) === "paid"
                              ? "A seat, already paid for"
                              : "A nearby chair, held for a friend"}
                          </h3>
                          <p>
                            Seat{" "}
                            {str(
                              item.targetSeatId ||
                                field(item, "seatId", "seat_id"),
                            )}{" "}
                            ·{" "}
                            {str(item.status) ||
                              (item.revokedAt || item.revoked_at
                                ? "Revoked"
                                : item.claimedAt || item.claimed_at
                                  ? "Claimed"
                                  : "Active")}
                            {field(item, "expiresAt", "expires_at")
                              ? ` · Expires ${new Date(str(field(item, "expiresAt", "expires_at"))).toLocaleString()}`
                              : ""}
                          </p>
                        </div>
                        <button
                          className="account-button text danger"
                          disabled={
                            !!busy ||
                            Boolean(
                              item.revokedAt ||
                              item.revoked_at ||
                              item.claimedAt ||
                              item.claimed_at ||
                              ["revoked", "claimed", "expired"].includes(
                                str(item.status),
                              ),
                            )
                          }
                          onClick={() =>
                            void run(`revoke-${str(item.id)}`, async () => {
                              await request(
                                `/api/invitations/${str(item.id)}`,
                                { method: "DELETE" },
                              );
                              setNotice({
                                kind: "success",
                                message:
                                  "Invitation revoked. Its old link can no longer be claimed.",
                              });
                              await refresh();
                            })
                          }
                        >
                          Revoke invitation
                        </button>
                      </article>
                    ))}
                  </div>
                )}
                <p className="account-small">
                  Secure invitation links are shown when created. If you lose
                  one, revoke it and create a new invitation.
                </p>
              </section>
            )}
            {section === "orders" && (
              <section className="account-section">
                <div className="account-section-heading">
                  <h2>The paper trail.</h2>
                  <p>
                    Your payments and seat reservations are separate from public
                    content approval.
                  </p>
                </div>
                {owner.orders.length === 0 ? (
                  <div className="account-simple-empty">
                    <Ticket size={30} />
                    <h3>No orders yet.</h3>
                    <p>When you take a seat, the details will be here.</p>
                  </div>
                ) : (
                  <div className="account-table-wrap">
                    <table className="account-table">
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Payment status</th>
                          <th>Receipt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {owner.orders.map((order) => (
                          <tr key={str(order.id)}>
                            <td>
                              <strong>{str(order.id).slice(0, 8)}</strong>
                              <br />
                              <span className="account-small">
                                {str(order.packageId || order.package_id) ||
                                  "Seats"}
                              </span>
                            </td>
                            <td>
                              {dateLabel(
                                field(order, "createdAt", "created_at"),
                              )}
                            </td>
                            <td>
                              {money(
                                order.amount ||
                                  order.amountTotal ||
                                  order.amount_total,
                              )}
                              <br />
                              {order.provider === "development" ||
                              order.isDemo ||
                              order.isDevelopment ||
                              order.is_development ? (
                                <span className="account-pill">
                                  Development · no charge
                                </span>
                              ) : null}
                            </td>
                            <td>
                              <span className="account-status">
                                {str(
                                  order.paymentStatus ||
                                    order.payment_status ||
                                    order.status,
                                )}
                              </span>
                              {order.fulfillmentStatus ||
                              order.fulfillment_status ? (
                                <small className="order-fulfillment">
                                  {str(
                                    order.fulfillmentStatus ||
                                      order.fulfillment_status,
                                  )}
                                </small>
                              ) : null}
                            </td>
                            <td>
                              {order.receiptUrl || order.receipt_url ? (
                                <a
                                  href={str(
                                    order.receiptUrl || order.receipt_url,
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="account-button text"
                                >
                                  Receipt <ExternalLink size={14} />
                                </a>
                              ) : (
                                <button
                                  onClick={() => void viewOrder(str(order.id))}
                                  className="account-button text"
                                  disabled={!!busy}
                                >
                                  Order details <ArrowRight size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
            {section === "orders" && selectedOrder && (
              <section
                className="selected-order"
                aria-label="Selected order details"
              >
                <div className="account-section-heading">
                  <span className="account-eyebrow">
                    AUTHORITATIVE ORDER STATUS
                  </span>
                  <h2>Your place, on paper.</h2>
                  <p>Order {str(selectedOrder.id)}</p>
                </div>
                <dl className="selected-order-details">
                  <div>
                    <dt>Payment state</dt>
                    <dd>
                      <span className="account-status">
                        {str(selectedOrder.status)}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>{money(selectedOrder.amount)} USD</dd>
                  </div>
                  <div>
                    <dt>Exact seats</dt>
                    <dd>
                      {Array.isArray(selectedOrder.seatIds)
                        ? selectedOrder.seatIds.join(", ")
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{dateLabel(selectedOrder.createdAt)}</dd>
                  </div>
                </dl>
                <p className="account-small">
                  A checkout return is not proof of payment. This status comes
                  from the server. Seats are fulfilled only after a verified
                  payment event; public guest content still requires moderation.
                </p>
                {["processing", "payment_processing"].includes(
                  str(selectedOrder.status),
                ) && (
                  <p className="account-notice" role="status">
                    Payment is still being confirmed. Please keep this order
                    reference; you do not need to pay a second time.
                  </p>
                )}
                {["fulfillment_issue", "fulfillment_conflict"].includes(
                  str(selectedOrder.status),
                ) && (
                  <p className="account-notice error" role="alert">
                    Your payment needs a host’s review. We will not substitute
                    different seats. Contact support with this order reference
                    to arrange a refund or an explicitly approved replacement.
                  </p>
                )}
                <div className="owned-seat-actions">
                  {selectedOrder.status === "paid" && (
                    <button
                      className="account-button primary"
                      disabled={!!busy}
                      onClick={() => void reopenArrival(str(selectedOrder.id))}
                    >
                      {selectedOrder.giftId ? (
                        <>
                          <Gift size={16} /> Manage saved-seat surprise
                        </>
                      ) : (
                        <>
                          <Users size={16} /> Invite someone beside you
                        </>
                      )}
                    </button>
                  )}
                  {str(selectedOrder.status) === "checkout_pending" && (
                    <button
                      className="account-button primary"
                      disabled={!!busy}
                      onClick={() => void resumeOrder()}
                    >
                      Resume{" "}
                      {selectedOrder.provider === "development"
                        ? "development"
                        : "secure"}{" "}
                      checkout <ArrowRight size={16} />
                    </button>
                  )}
                  {selectedOrder.provider === "stripe" &&
                    [
                      "paid",
                      "refunded",
                      "refund_requested",
                      "disputed",
                    ].includes(str(selectedOrder.status)) && (
                      <a
                        className="account-button secondary"
                        href={`/api/orders/${encodeURIComponent(str(selectedOrder.id))}/receipt`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Payment provider receipt <ExternalLink size={14} />
                      </a>
                    )}
                  <button
                    className="account-button secondary"
                    onClick={downloadOrder}
                  >
                    Download order record
                  </button>
                  <button
                    className="account-button text"
                    onClick={() => setSection("help")}
                  >
                    Ask a host for help
                  </button>
                  <button
                    className="account-button text"
                    onClick={() => setSelectedOrder(null)}
                  >
                    Close details
                  </button>
                </div>
                {developmentCheckout && development && (
                  <div className="development-inbox">
                    <span className="account-pill">
                      DEVELOPMENT CHECKOUT · NO REAL CHARGE
                    </span>
                    <h3>Finish your practice dinner.</h3>
                    <p>
                      These controls exercise authoritative server-side
                      fulfillment. They are not connected to a payment network.
                    </p>
                    <div className="owned-seat-actions">
                      <button
                        className="account-button primary"
                        disabled={!!busy}
                        onClick={() => void completeDevelopmentOrder("paid")}
                      >
                        Complete test payment <Check size={16} />
                      </button>
                      <button
                        className="account-button secondary"
                        disabled={!!busy}
                        onClick={() => void completeDevelopmentOrder("failed")}
                      >
                        Test a declined payment
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
            {section === "help" && (
              <section className="account-help">
                <div className="account-help-card">
                  <HeartHandshake size={27} />
                  <h2>Talk to the hosts.</h2>
                  <p>
                    Something odd at the table? Need help with an order? Leave a
                    note in the support queue.
                  </p>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const target = event.currentTarget;
                      void run("support", async () => {
                        await request("/api/me/support", {
                          method: "POST",
                          body: JSON.stringify({
                            subject: form.get("subject"),
                            message: form.get("message"),
                          }),
                        });
                        target.reset();
                        setNotice({
                          kind: "success",
                          message:
                            "Your support request is saved for the hosts to review.",
                        });
                      });
                    }}
                  >
                    <label className="account-label">
                      Subject
                      <input name="subject" required maxLength={100} />
                    </label>
                    <label className="account-label">
                      Your note
                      <textarea
                        name="message"
                        required
                        maxLength={2000}
                        rows={4}
                      />
                    </label>
                    <button
                      className="account-button primary"
                      disabled={!!busy}
                    >
                      Send a support request <ArrowRight size={16} />
                    </button>
                  </form>
                </div>
                <div className="account-help-card deletion-card">
                  <Trash2 size={25} />
                  <h2>Leaving the dinner?</h2>
                  <p>
                    Requesting account deletion removes your public profile and
                    starts a manual account review. Your paid seat allocation is
                    kept while the hosts review your request. Invitations are
                    revoked.
                  </p>
                  <p>
                    Receipts, payment events, and the minimum transaction
                    records required for financial, dispute, and legal
                    obligations are retained separately. Deletion does not
                    automatically refund an order. Read our{" "}
                    <Link href="/privacy">draft privacy notice</Link> before
                    continuing.
                  </p>
                  <details>
                    <summary>Request account deletion</summary>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        void run("delete", async () => {
                          await request("/api/me", {
                            method: "DELETE",
                            body: JSON.stringify({
                              confirmation: form.get("confirmation"),
                            }),
                          });
                          setNotice({
                            kind: "success",
                            message:
                              "Your deletion request is recorded. Your public content has been hidden.",
                          });
                          await refresh();
                        });
                      }}
                    >
                      <label className="account-label">
                        Type DELETE to request removal
                        <input
                          name="confirmation"
                          required
                          pattern="DELETE"
                          placeholder="DELETE"
                          autoComplete="off"
                        />
                      </label>
                      <button
                        className="account-button secondary danger"
                        disabled={!!busy}
                      >
                        Submit deletion request
                      </button>
                    </form>
                  </details>
                </div>
              </section>
            )}
            <footer className="account-footer">
              <span>One table. A little room for everyone.</span>
              <span>
                <Link href="/content">Table manners</Link>
                <Link href="/privacy">Privacy</Link>
                <Link href="/terms">Terms</Link>
              </span>
            </footer>
          </>
        )}
        {invite && (
          <div className="invitation-result" role="status">
            <button
              className="invitation-close"
              aria-label="Close invitation"
              onClick={() => setInvite(null)}
            >
              <X size={19} />
            </button>
            <span className="account-eyebrow">SAVED YOU A SEAT</span>
            <h2>
              Good company is
              <br />
              worth inviting.
            </h2>
            <p>
              {str(invite.type) === "paid"
                ? "Your friend can claim and customize this already-paid seat after verifying their email."
                : "This is a separate purchase for your friend. A courtesy hold, when available, lasts only until the time below."}
            </p>
            {invite.expiresAt || invite.expires_at ? (
              <p className="account-small">
                {str(invite.type) === "paid"
                  ? "Claim invitation expires"
                  : "Hold expires"}{" "}
                {new Date(
                  str(invite.expiresAt || invite.expires_at),
                ).toLocaleString()}
              </p>
            ) : null}
            <label className="account-label">
              Your secure invitation
              <input
                readOnly
                value={
                  str(invite.url) ||
                  (invite.token
                    ? `${window.location.origin}/invite/${str(invite.token)}`
                    : "")
                }
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            <button
              className="account-button primary wide"
              onClick={() =>
                void copy(
                  str(invite.url) ||
                    `${window.location.origin}/invite/${str(invite.token)}`,
                )
              }
            >
              <Copy size={16} /> Copy invitation
            </button>
            <p className="account-small">
              Keep this claim link private. You can revoke it from Invitations.
            </p>
          </div>
        )}
        {arrival && (
          <Modal
            title="Dinner would be weirder with you."
            className="account-arrival-modal"
            onClose={() => {
              setArrival(null);
              void refresh();
            }}
          >
            <div style={{ width: "min(620px, calc(100vw - 38px))" }}>
              <PostPurchaseMoment
                key={arrival.orderId}
                {...arrival}
                onClose={() => {
                  setArrival(null);
                  void refresh();
                }}
              />
            </div>
          </Modal>
        )}
      </main>
    </div>
  );
}

function SeatEditor({
  seat,
  onSave,
  disabled,
}: {
  seat: Row;
  onSave: (input: Row) => Promise<void>;
  disabled: boolean;
}) {
  const custom = obj(seat.customization);
  const [draft, setDraft] = useState({
    displayName: str(seat.displayName || seat.display_name),
    message: str(seat.message),
    link: str(seat.link),
    dish: str(seat.dish) || "soup",
    base: str(custom.base) || "human",
    accessory: str(custom.accessory) || "none",
    outfit: str(custom.outfit) || "signature",
    skin: str(custom.skin) || "#dca276",
    color: str(custom.color) || "#a3b59b",
    reactionsEnabled:
      seat.reactionsEnabled !== false && seat.reactions_enabled !== false,
    visible: !["hidden", "private"].includes(str(seat.visibility)),
  });
  const change = (key: string, value: string | boolean) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  return (
    <form
      className="seat-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          displayName: draft.displayName,
          message: draft.message,
          link: draft.link || null,
          dish: draft.dish,
          customization: {
            base: draft.base,
            accessory: draft.accessory,
            outfit: draft.outfit,
            skin: draft.skin,
            color: draft.color,
          },
          reactionsEnabled: draft.reactionsEnabled,
          visibility: draft.visible ? "pending" : "private",
        });
      }}
    >
      <div className="seat-editor-grid">
        <div className="edit-preview">
          <GuestArt
            customization={{
              base: draft.base,
              accessory: draft.accessory,
              outfit: draft.outfit,
              skin: draft.skin,
              color: draft.color,
            }}
          />
        </div>
        <div>
          <label className="account-label">
            Display name <span>{draft.displayName.length}/30</span>
            <input
              required
              maxLength={30}
              value={draft.displayName}
              onChange={(event) => change("displayName", event.target.value)}
            />
          </label>
          <label className="account-label">
            A little dinner-table message{" "}
            <span>{draft.message.length}/140</span>
            <textarea
              maxLength={140}
              rows={3}
              value={draft.message}
              onChange={(event) => change("message", event.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="edit-options">
        {(
          [
            ["base", "Dinner guest", BASES],
            ["accessory", "Hair & accessories", ACCESSORIES],
            ["outfit", "What to wear", OUTFITS],
            ["dish", "What to bring", DISHES],
            ["skin", "Skin tone", SKIN_TONES],
          ] as const
        ).map(([key, label, options]) => (
          <label className="account-label" key={key}>
            {label}
            <select
              value={draft[key]}
              onChange={(event) => change(key, event.target.value)}
            >
              {options.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="account-label">
          Outfit accent
          <input
            type="color"
            value={draft.color}
            onChange={(event) => change("color", event.target.value)}
          />
        </label>
      </div>
      <label className="account-label">
        Optional website
        <input
          type="url"
          value={draft.link}
          onChange={(event) => change("link", event.target.value)}
          placeholder="https://"
        />
      </label>
      <label className="account-check">
        <input
          type="checkbox"
          checked={draft.reactionsEnabled}
          onChange={(event) => change("reactionsEnabled", event.target.checked)}
        />{" "}
        Let visitors Pass the Bread
      </label>
      <label className="account-check">
        <input
          type="checkbox"
          checked={draft.visible}
          onChange={(event) => change("visible", event.target.checked)}
        />{" "}
        Submit this profile for public display
      </label>
      <p className="account-small">
        Edits are reviewed before appearing publicly. Your permanent seat number
        stays yours while content is pending.
      </p>
      <button className="account-button primary" disabled={disabled}>
        <Check size={16} /> Save my guest
      </button>
    </form>
  );
}
