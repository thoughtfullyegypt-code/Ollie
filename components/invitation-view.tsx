"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Download,
  Link as LinkIcon,
  Mail,
  Share2,
} from "lucide-react";
import { GuestArt, DishArt } from "@/components/art/illustrations";
import {
  captureAttribution,
  captureReferral,
  track,
} from "@/components/journey-events";

type Invitation = {
  id: string;
  type: "courtesy" | "paid";
  sourceSeatId: number;
  targetSeatId: number;
  availableSeatId: number | null;
  status: string;
  expired: boolean;
  expiresAt: string;
  requiresPurchase: boolean;
  sourceGuest: {
    displayName: string;
    customization?: Record<string, string>;
    dish?: string;
  } | null;
};
export default function InvitationView({
  token,
  invitation: initial,
  oneSeatAmount,
  development = false,
}: {
  token: string;
  invitation: Invitation;
  oneSeatAmount: number;
  development?: boolean;
}) {
  const [invitation, setInvitation] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [claimed, setClaimed] = useState(initial.status === "claimed");
  const [claimedHere, setClaimedHere] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nativeShare, setNativeShare] = useState(false);
  const measuredInvitation = useRef<string | null>(null);
  useEffect(() => {
    setNativeShare(typeof navigator.share === "function");
    if (measuredInvitation.current === initial.id) return;
    measuredInvitation.current = initial.id;
    // This public UUID identifies the referral; the private claim token never
    // enters measurement or attribution storage.
    captureReferral(initial.id);
    captureAttribution();
    void track("invitation_link_opened", {
      invitationType: initial.type,
      seatId: initial.targetSeatId,
      placement: "invitation",
    });
  }, [initial.id, initial.type, initial.targetSeatId]);
  const [inbox, setInbox] = useState<{ url: string; createdAt: string }[]>([]);
  const [expiresIn, setExpiresIn] = useState("");
  useEffect(() => {
    const update = () => {
      const remaining = new Date(invitation.expiresAt).getTime() - Date.now();
      setExpiresIn(
        remaining > 0 ? `${Math.ceil(remaining / 60000)} minutes` : "expired",
      );
    };
    update();
    const timer = setInterval(update, 15000);
    return () => clearInterval(timer);
  }, [invitation.expiresAt]);
  const price = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(oneSeatAmount / 100);
  const paid = invitation.type === "paid";
  const seatId = invitation.availableSeatId || invitation.targetSeatId;
  const expired = invitation.expired || expiresIn === "expired";
  async function claim() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/invitations/${encodeURIComponent(token)}/claim`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const data = await response.json();
      if (response.status === 401) {
        setNeedsAuth(true);
        return;
      }
      if (!response.ok)
        throw new Error(
          data.error || "We could not claim this seat. Please try again.",
        );
      setClaimed(true);
      setClaimedHere(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          callbackURL: `/invite/${encodeURIComponent(token)}?ref=${initial.id}`,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Unable to send a sign-in link.");
      setEmailSent(true);
      if (email.endsWith("@example.test")) {
        const dev = await fetch(
          `/api/dev/inbox?email=${encodeURIComponent(email)}`,
        );
        if (dev.ok) {
          const outbox = await dev.json();
          setInbox(outbox.messages || []);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    void track("share_action_invoked", {
      method: "copy",
      placement: "invitation",
      invitationType: invitation.type,
    });
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setError(
        "Copy the invitation link from your address bar. Keep it private.",
      );
    }
  }
  async function share() {
    void track("share_action_invoked", {
      method: "native",
      placement: "invitation",
      invitationType: invitation.type,
    });
    try {
      await navigator.share({
        title: "I saved you a seat.",
        text: "I joined the internet’s strangest dinner. Come sit beside me.",
        url: window.location.href,
      });
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        setError(
          "Sharing was unavailable. You can copy the private invitation link instead.",
        );
    }
  }
  async function refresh() {
    setError("");
    try {
      const response = await fetch(
        `/api/invitations/${encodeURIComponent(token)}`,
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "This invitation is no longer available.",
        );
      setInvitation(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not check this invitation.",
      );
    }
  }
  return (
    <main
      className="invitation-page"
      style={{
        minHeight: "100dvh",
        padding: "30px 24px 70px",
        background: "#f7f3e8",
        color: "#29372b",
      }}
    >
      <Link
        href="/"
        style={{
          display: "block",
          color: "inherit",
          textDecoration: "none",
          textAlign: "center",
          fontWeight: 700,
          marginBottom: 44,
        }}
      >
        {process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet"}
      </Link>
      <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
        <p
          className="eyebrow"
          style={{ color: "#b7402b", letterSpacing: ".18em", fontSize: 12 }}
        >
          {development
            ? "DEVELOPMENT INVITATION · NO REAL CHARGE"
            : "A VERY PERSONAL PLACE SETTING"}
        </p>
        <h1
          style={{
            fontFamily: "var(--font-display, Georgia, serif)",
            fontSize: "clamp(43px, 8vw, 76px)",
            lineHeight: 1.04,
            fontWeight: 500,
            margin: "15px 0 20px",
          }}
        >
          {claimed
            ? claimedHere
              ? "Your chair is waiting."
              : "Someone found their chair."
            : "I saved you a seat."}
        </h1>
        <p
          style={{
            fontSize: 18,
            lineHeight: 1.6,
            maxWidth: 560,
            margin: "0 auto",
          }}
        >
          {invitation.sourceGuest?.displayName || "A dinner guest"} invited you
          to the internet’s longest dinner table.{" "}
          {paid
            ? "Your seat is already paid for. All it needs is you."
            : "Bring a dish. Bring your odd little self."}
        </p>
        <div
          aria-label="Your inviter beside an empty chair with a folded napkin"
          role="img"
          style={{
            height: 330,
            maxWidth: 580,
            margin: "25px auto",
            position: "relative",
            overflow: "hidden",
            borderRadius: 22,
            background: "#eee8d8",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 210,
              height: 260,
              left: "13%",
              top: 8,
            }}
          >
            <GuestArt
              customization={invitation.sourceGuest?.customization}
              portrait
            />
          </div>
          <svg
            width="190"
            height="230"
            viewBox="0 0 190 230"
            style={{ position: "absolute", right: "9%", top: 36 }}
          >
            <g
              stroke="#29372b"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m37 190 9-109q46-17 92 0l13 109" fill="#e6bd60" />
              <path d="m42 167-6 54m110-54 8 54" fill="none" />
              <path d="M42 171q52 23 103 0l-7-36H48Z" fill="#b9cbb6" />
              <path d="m68 129 27-45 27 44-27 15Z" fill="#fffaf0" />
              <path d="m95 87 1 52" fill="none" strokeWidth="2" />
            </g>
          </svg>
          <div
            style={{
              position: "absolute",
              height: 123,
              left: -20,
              right: -20,
              bottom: -28,
              transform: "rotate(-4deg)",
              backgroundColor: "#f2d6cc",
              backgroundImage:
                "linear-gradient(90deg, #b8483320 50%, transparent 50%), linear-gradient(#b8483320 50%, transparent 50%)",
              backgroundSize: "32px 32px",
              borderTop: "3px solid #29372b",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 130,
              height: 82,
              bottom: 15,
              left: "22%",
            }}
          >
            <DishArt dish={invitation.sourceGuest?.dish || "garlic-bread"} />
          </div>
        </div>
        <div
          style={{
            maxWidth: 530,
            margin: "0 auto",
            textAlign: "left",
            padding: "22px 24px",
            border: "1px solid #d7d3c6",
            borderRadius: 16,
            background: "#fffaf0",
          }}
        >
          <p style={{ margin: "0 0 10px", fontWeight: 700 }}>
            {paid
              ? "A paid group-seat invitation"
              : "A courtesy invitation · separate purchase"}
          </p>
          {paid ? (
            <p style={{ lineHeight: 1.65, margin: 0 }}>
              Seat {seatId.toLocaleString()} is included in your friend’s group
              purchase. Verify your account to claim and customize it. You will
              not pay again.
            </p>
          ) : (
            <>
              <p style={{ lineHeight: 1.65, margin: 0 }}>
                This invitation does not include a purchase. A single seat is{" "}
                {price} USD, with the exact final price shown before checkout.
              </p>
              <p style={{ lineHeight: 1.65 }}>
                {expired
                  ? `The original temporary hold has expired. ${invitation.availableSeatId !== invitation.targetSeatId ? `We found seat ${seatId.toLocaleString()} nearby instead.` : "The original place may still be available."} Availability is checked again before checkout; no place has been silently purchased or substituted.`
                  : `Seat ${seatId.toLocaleString()} has a temporary hold${expiresIn ? ` for ${expiresIn}` : ""}. Expires ${new Date(invitation.expiresAt).toUTCString()}.`}
              </p>
            </>
          )}
          {error && (
            <p role="alert" style={{ color: "#b7402b" }}>
              {error}
            </p>
          )}
          {claimed ? (
            <>
              <p
                role="status"
                style={{ color: "#41614a", display: "flex", gap: 8 }}
              >
                <Check size={20} />{" "}
                {claimedHere
                  ? "The paid seat is now linked to your account."
                  : "This invitation has already been accepted."}
              </p>
              <Link
                href="/account"
                className="btn btn-primary"
                style={{ marginTop: 16 }}
              >
                {claimedHere ? "Make your guest" : "Go to my account"}{" "}
                <ArrowRight size={17} />
              </Link>
            </>
          ) : needsAuth ? (
            <form onSubmit={signIn} style={{ marginTop: 20 }}>
              <label
                htmlFor="invite-email"
                style={{ display: "block", fontWeight: 700, marginBottom: 8 }}
              >
                Verify your email to claim your chair
              </label>
              <input
                className="input"
                id="invite-email"
                type="email"
                value={email}
                required
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  width: "100%",
                  padding: 13,
                  border: "1px solid #b8b8a8",
                  borderRadius: 8,
                  color: "inherit",
                  background: "#fffdf5",
                }}
              />
              <button
                className="btn btn-primary"
                disabled={busy}
                type="submit"
                style={{ marginTop: 12 }}
              >
                <Mail size={16} />{" "}
                {busy ? "Sending…" : "Email me a sign-in link"}
              </button>
              {emailSent && (
                <p role="status">
                  Check your inbox, then return here to claim your seat.
                </p>
              )}
              {inbox.length > 0 && (
                <aside
                  style={{
                    padding: 14,
                    background: "#f5e9bc",
                    borderRadius: 8,
                    marginTop: 14,
                  }}
                >
                  <strong>Development inbox · no email sent</strong>
                  <p>
                    This local-only sign-in link is available for development
                    test accounts.
                  </p>
                  {inbox.map((item) => (
                    <a
                      key={item.createdAt}
                      href={item.url}
                      style={{ display: "block", margin: "8px 0" }}
                    >
                      Open development sign-in link →
                    </a>
                  ))}
                </aside>
              )}
            </form>
          ) : paid ? (
            <button
              className="btn btn-primary"
              onClick={claim}
              disabled={busy || expired}
              style={{ marginTop: 22 }}
            >
              {busy
                ? "Checking your invitation…"
                : expired
                  ? "Invitation expired"
                  : "Claim my paid seat"}{" "}
              <ArrowRight size={17} />
            </button>
          ) : (
            <Link
              href={`/?seat=${seatId}&invite=${encodeURIComponent(token)}&ref=${invitation.id}`}
              className="btn btn-primary"
              style={{ marginTop: 8 }}
            >
              Choose my guest · {price} <ArrowRight size={17} />
            </Link>
          )}
          {paid && expired && !claimed && (
            <p>
              This claim invitation expired. Ask the buyer to issue a fresh
              invitation. The paid seat has not been released for sale.
            </p>
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: 18,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 24,
          }}
        >
          <button onClick={copy} className="btn btn-secondary">
            <LinkIcon size={16} /> {copied ? "Copied" : "Copy private invite"}
          </button>
          {nativeShare && (
            <button onClick={share} className="btn btn-secondary">
              <Share2 size={16} /> Send invitation
            </button>
          )}
          <a
            href={`/api/og/invitation/${invitation.id}`}
            download="saved-you-a-seat.png"
            className="btn btn-secondary"
            onClick={() =>
              void track("share_action_invoked", {
                method: "download",
                placement: "invitation",
                invitationType: invitation.type,
              })
            }
          >
            <Download size={16} /> Download invitation
          </a>
        </div>
        <p
          className="muted"
          style={{ fontSize: 12, lineHeight: 1.6, marginTop: 20 }}
        >
          Keep claim links private. The downloadable picture contains no secret
          claim token.
          <br />
          <Link href={`/seat/${invitation.sourceSeatId}`}>
            Just look around the table
          </Link>{" "}
          ·{" "}
          <button
            onClick={refresh}
            style={{
              background: "none",
              border: 0,
              color: "inherit",
              textDecoration: "underline",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            Refresh availability
          </button>
        </p>
      </div>
    </main>
  );
}
