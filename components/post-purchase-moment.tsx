"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  LoaderCircle,
  Share2,
} from "lucide-react";
import {
  GuestArt,
  DishArt,
  EmptyChair,
  DecorationArt,
} from "./art/illustrations";
import { track } from "./journey-events";
import "./post-purchase.css";

type Profile = {
  displayName?: string;
  message?: string;
  dish?: string;
  customization?: Record<string, string>;
};
type Invite = {
  id: string;
  url: string;
  type: "courtesy" | "paid";
  targetSeatId: number;
  expiresAt: string;
};
type OwnedSeat = {
  seatId: number;
  state: string;
  canInvitePaid?: boolean;
  canInviteCourtesy?: boolean;
  profile?: Profile;
};
type OwnerInvitation = {
  type: "courtesy" | "paid";
  sourceSeatId: number;
  targetSeatId: number;
  status: string;
  expiresAt: string;
};
async function request(path: string, body?: unknown) {
  const response = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error || "We could not check your place. Please try again.",
    );
  return data;
}
export default function PostPurchaseMoment({
  orderId,
  profile,
  seatIds,
  packageId,
  onClose,
}: {
  orderId: string;
  profile: Profile;
  seatIds: number[];
  packageId: string;
  onClose: () => void;
}) {
  const [verified, setVerified] = useState(false);
  const [development, setDevelopment] = useState(false);
  const [actualProfile, setActualProfile] = useState(profile);
  const [actualSeats, setActualSeats] = useState(seatIds);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [price, setPrice] = useState<number | null>(null);
  const [inviteTarget, setInviteTarget] = useState(seatIds[1] || 0);
  const [eligiblePaidSeats, setEligiblePaidSeats] = useState<number[]>([]);
  const [canInviteCourtesy, setCanInviteCourtesy] = useState(false);
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    let active = true;
    setCanShare(typeof navigator.share === "function");
    setMotion(
      !matchMedia("(prefers-reduced-motion: reduce)").matches &&
        document.documentElement.dataset.motion !== "off",
    );
    Promise.all([
      request(`/api/orders/${encodeURIComponent(orderId)}`),
      request("/api/me"),
      request("/api/config"),
    ])
      .then(async ([order, owner, config]) => {
        if (!active) return;
        const ids = (order.seatIds || []).map(Number);
        const own = (owner.seats || []) as OwnedSeat[];
        if (
          order.status !== "paid" ||
          !ids.length ||
          !own.some((s) => s.seatId === ids[0] && s.state === "purchased")
        )
          throw new Error(
            "Your payment or exact seat fulfillment is still being confirmed. Check your account before trying to pay again.",
          );
        // A claimed group chair belongs to the friend, while its original order
        // item remains with the buyer. Check every exact purchased chair rather
        // than requiring the buyer to still own a friend's claimed seat.
        const inventory = await request(
          `/api/table?start=${Math.min(...ids)}&end=${Math.max(...ids)}`,
        );
        if (!active) return;
        if (
          ids.some(
            (id: number) =>
              !inventory.seats?.some(
                (seat: { seatId: number; state: string }) =>
                  seat.seatId === id && seat.state === "purchased",
              ),
          )
        )
          throw new Error(
            "Your exact seat fulfillment is still being confirmed. Check your account before trying to pay again.",
          );
        const invitations = (owner.invitations || []) as OwnerInvitation[];
        const unavailableForInvitation = (invitation: OwnerInvitation) =>
          invitation.status === "claimed" ||
          (invitation.status === "active" &&
            new Date(invitation.expiresAt).getTime() > Date.now());
        const eligible = ids
          .slice(1)
          .filter((id: number) =>
            own.some(
              (s) =>
                s.seatId === id &&
                s.state === "purchased" &&
                s.canInvitePaid === true &&
                !invitations.some(
                  (invitation) =>
                    invitation.type === "paid" &&
                    invitation.targetSeatId === id &&
                    unavailableForInvitation(invitation),
                ),
            ),
          );
        setDevelopment(
          order.isDemo === true || order.provider === "development",
        );
        setActualSeats(ids);
        setActualProfile(
          own.find((s) => s.seatId === ids[0])?.profile || profile,
        );
        setEligiblePaidSeats(eligible);
        setInviteTarget(eligible[0] || 0);
        setCanInviteCourtesy(
          ids.length === 1 &&
            own.some((s) => s.seatId === ids[0] && s.canInviteCourtesy) &&
            !invitations.some(
              (invitation) =>
                invitation.type === "courtesy" &&
                invitation.sourceSeatId === ids[0] &&
                invitation.status === "active" &&
                unavailableForInvitation(invitation),
            ),
        );
        setPrice(
          config.packages?.find((p: { id: string }) => p.id === "one")
            ?.amount ?? null,
        );
        setVerified(true);
        try {
          const saved = JSON.parse(
            sessionStorage.getItem(`dinner-invite:${orderId}`) || "null",
          );
          if (saved?.id && saved?.url) {
            const token = new URL(saved.url, location.origin).pathname
              .split("/")
              .pop();
            request(`/api/invitations/${encodeURIComponent(token || "")}`)
              .then((resolved) => {
                if (active && resolved.status !== "revoked") setInvite(saved);
              })
              .catch(() =>
                sessionStorage.removeItem(`dinner-invite:${orderId}`),
              );
          }
        } catch {}
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [orderId]);
  async function createInvite() {
    setBusy(true);
    setError("");
    try {
      const isGroup = actualSeats.length > 1;
      if (
        (isGroup && !eligiblePaidSeats.includes(inviteTarget)) ||
        (!isGroup && !canInviteCourtesy)
      )
        throw new Error(
          "This place has already been invited or claimed. Manage your invitations in My seats & invitations.",
        );
      const data = await request("/api/invitations", {
        seatId: isGroup ? inviteTarget : actualSeats[0],
        type: isGroup ? "paid" : "courtesy",
      });
      const shareUrl = new URL(data.url, location.origin);
      shareUrl.searchParams.set("ref", data.id);
      const next: Invite = {
        id: data.id,
        url: shareUrl.toString(),
        type: data.type,
        targetSeatId: data.targetSeatId,
        expiresAt: data.expiresAt,
      };
      setInvite(next);
      if (isGroup) {
        const remaining = eligiblePaidSeats.filter(
          (seatId) => seatId !== data.targetSeatId,
        );
        setEligiblePaidSeats(remaining);
        setInviteTarget(remaining[0] || 0);
      } else setCanInviteCourtesy(false);
      try {
        sessionStorage.setItem(
          `dinner-invite:${orderId}`,
          JSON.stringify(next),
        );
      } catch {}
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!invite) return;
    track("share_action_invoked", {
      method: "copy",
      invitationType: invite.type,
      seatId: actualSeats[0],
    });
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(
        "Your invitation is ready below. Select and copy the full link.",
      );
      document.getElementById("arrival-invite-url")?.focus();
    }
  }
  async function share() {
    if (!invite) return;
    track("share_action_invoked", {
      method: "native",
      invitationType: invite.type,
      seatId: actualSeats[0],
    });
    try {
      await navigator.share({
        title: "Dinner would be weirder with you.",
        text: "I joined the internet’s strangest dinner. Come sit beside me.",
        url: invite.url,
      });
    } catch {
      setError(
        "The share sheet closed or was unavailable. Your invitation is still ready—use Copy invitation link below.",
      );
    }
  }
  const money =
    price === null
      ? "the price shown before checkout"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(price / 100);
  if (!verified)
    return (
      <section className="arrival-check" aria-live="polite">
        <LoaderCircle className="spin" size={24} />
        <h2>Your place, carefully checked.</h2>
        <p>
          {error ||
            "We’re checking the payment and every seat with the server."}
        </p>
        <Link className="btn btn-secondary" href="/account">
          Check my order
        </Link>
        <button className="text-link" onClick={onClose}>
          Back to the table
        </button>
      </section>
    );
  return (
    <section
      className={`arrival-moment ${motion ? "arrival-motion" : "arrival-still"}`}
    >
      <div
        className="arrival-scene"
        role="img"
        aria-label={`Your guest at seat ${actualSeats[0]} beside an invitation chair`}
      >
        <span className="arrival-seat-label">
          YOUR PLACE · SEAT {actualSeats[0]}
        </span>
        <div className="arrival-chair">
          <EmptyChair />
        </div>
        <div className="arrival-guest">
          <GuestArt customization={actualProfile.customization} />
        </div>
        <div className="arrival-neighbor">
          <EmptyChair color="#d8bf7d" />
        </div>
        <div className="arrival-table" />
        <div className="arrival-dish">
          <DishArt dish={actualProfile.dish || "soup"} />
        </div>
        <div className="arrival-flowers">
          <DecorationArt kind="flowers" />
        </div>
        <div className="arrival-napkin">
          <span>
            for someone
            <br />
            <em>you love.</em>
          </span>
        </div>
      </div>
      <div className="arrival-copy">
        <p className="eyebrow">
          {development
            ? "DEVELOPMENT PREVIEW · NO REAL CHARGE"
            : "YOU’RE PART OF THE DINNER"}
        </p>
        <h2>
          Dinner would be
          <br />
          <em>weirder with you.</em>
        </h2>
        <p className="arrival-subtitle">Send someone a seat beside yours.</p>
        <p className="arrival-review-note">
          Your seat is fulfilled. Your public guest appears after the hosts’
          moderation review; this is your private arrival preview.
        </p>
        {actualSeats.length > 1 ? (
          <p className="arrival-invite-explainer">
            <strong>Already paid. All it needs is your friend.</strong> They
            verify their account, claim the seat, and customize their own guest.
            They will not pay again.
          </p>
        ) : (
          <p className="arrival-invite-explainer">
            <strong>A nearby place, with a separate purchase.</strong> Your
            friend’s single seat is {money}. A courtesy invitation can hold it
            briefly; its exact expiry is shown before checkout.
          </p>
        )}
        {!invite &&
          (actualSeats.length > 1
            ? eligiblePaidSeats.length > 0
            : canInviteCourtesy) && (
            <>
              {eligiblePaidSeats.length > 1 && (
                <label className="field">
                  Which friend’s place shall we share?
                  <select
                    className="input"
                    value={inviteTarget}
                    onChange={(e) => setInviteTarget(Number(e.target.value))}
                  >
                    {eligiblePaidSeats.map((id) => (
                      <option key={id} value={id}>
                        Already-paid seat {id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                className="btn btn-primary"
                onClick={createInvite}
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <>
                    Fold my invitation <ArrowRight size={17} />
                  </>
                )}
              </button>
            </>
          )}
        {!invite &&
          (actualSeats.length > 1
            ? eligiblePaidSeats.length === 0
            : !canInviteCourtesy) && (
            <p className="fine-print">
              {actualSeats.length > 1
                ? "Your included places have already been invited or claimed. You can review their status in My seats & invitations."
                : "You already have an active courtesy invitation. Manage it in My seats & invitations."}
            </p>
          )}
        {invite && (
          <div className="arrival-share">
            <p className="arrival-invite-kind">
              {invite.type === "paid"
                ? `Already-paid seat ${invite.targetSeatId} · no second payment`
                : `Nearby unpaid seat ${invite.targetSeatId} · separate purchase`}
            </p>
            <p className="fine-print">
              {invite.type === "paid"
                ? "Claim invitation"
                : "Temporary courtesy hold"}{" "}
              expires {new Date(invite.expiresAt).toLocaleString()}. The server
              checks expiry and availability.
            </p>
            <label className="field" htmlFor="arrival-invite-url">
              Your private invitation link
              <input
                className="input"
                id="arrival-invite-url"
                readOnly
                value={invite.url}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
            <div className="arrival-share-actions">
              {canShare && (
                <button className="btn btn-primary" onClick={share}>
                  <Share2 size={16} />
                  Invite someone
                </button>
              )}
              <button
                className={`btn ${canShare ? "btn-secondary" : "btn-primary"}`}
                onClick={copy}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
                {copied ? "Invitation copied" : "Copy invitation link"}
              </button>
              <a
                className="btn btn-secondary"
                href={`/api/og/invitation/${encodeURIComponent(invite.id)}?download=1`}
                download="dinner-invitation.png"
                onClick={() =>
                  track("share_action_invoked", {
                    method: "download",
                    invitationType: invite.type,
                    seatId: actualSeats[0],
                  })
                }
              >
                <Download size={16} />
                Download invitation image
              </a>
            </div>
            {eligiblePaidSeats.length > 0 && (
              <button
                className="text-link"
                onClick={() => {
                  setInvite(null);
                  setError("");
                  setCopied(false);
                }}
              >
                Invite another friend <ArrowRight size={16} />
              </button>
            )}
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="arrival-return">
          <Link className="text-link" href={`/seat/${actualSeats[0]}`}>
            Return to my seat <ArrowRight size={16} />
          </Link>
          <Link className="text-link" href="/account">
            My seats & invitations
          </Link>
        </div>
      </div>
    </section>
  );
}
