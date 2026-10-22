"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Heart,
  LoaderCircle,
  Mail,
  RotateCcw,
  X,
} from "lucide-react";
import {
  GuestArt,
  DishArt,
  EmptyChair,
  DecorationArt,
} from "./art/illustrations";
import { GiftEnvelope, OccasionProp } from "./art/gift-art";
import type {
  GiftCustomization,
  GiftOccasion,
  GiftProp,
} from "@/lib/gift-input";
import "./gift-reveal.css";

export type GiftRevealData = {
  id?: string;
  occasion: GiftOccasion;
  senderName: string;
  recipientName: string;
  message: string;
  senderCustomization: GiftCustomization | Record<string, string>;
  recipientCustomization: GiftCustomization | Record<string, string>;
  dish: string;
  prop?: GiftProp;
  senderSeatId?: number | null;
  sourceSeatId?: number | null;
  recipientSeatId?: number | null;
  status?: string;
  claimed?: boolean;
  claimedAt?: string | null;
  thankYouAt?: string | null;
  updatedAt?: string;
  isDemo?: boolean;
};
type Stage = "invitation" | "arriving" | "occasion" | "message" | "opened";
const occasionCopy: Record<
  GiftOccasion,
  { label: string; title: string; note: string }
> = {
  birthday: {
    label: "A LITTLE BIRTHDAY DINNER",
    title: "A candle. A wish. A place beside them.",
    note: "Your own peculiar little birthday party.",
  },
  congratulations: {
    label: "SOMETHING WORTH CELEBRATING",
    title: "A very big hooray. A very small banner.",
    note: "Good news deserves good company.",
  },
  "thank-you": {
    label: "A LITTLE THANK-YOU",
    title: "Some flowers. A seat. A lot of gratitude.",
    note: "A small dinner for a big thank-you.",
  },
  "miss-you": {
    label: "FOR SOMEONE A LITTLE FAR AWAY",
    title: "The chair beside them was always yours.",
    note: "A little closer, even from here.",
  },
  "just-because": {
    label: "NO REASON NEEDED",
    title: "A little bread. A little room for you.",
    note: "Sometimes, just because is reason enough.",
  },
};

/** Reusable original two-guest scene, also used in the sender's private preview. */
export function GiftScene({
  gift,
  stage = "message",
  animated = false,
}: {
  gift: GiftRevealData;
  stage?: Exclude<Stage, "invitation">;
  animated?: boolean;
}) {
  const senderSeat = gift.senderSeatId || gift.sourceSeatId;
  const hasRecipient = stage !== "arriving";
  return (
    <div
      className={`saved-gift-scene gift-scene-${stage} ${animated ? "gift-scene-animated" : "gift-scene-still"}`}
      role="img"
      aria-label={`${gift.senderName} beside ${gift.recipientName}${senderSeat && gift.recipientSeatId ? ` at seats ${senderSeat} and ${gift.recipientSeatId}` : " at the shared dinner table"}`}
    >
      <div className="saved-gift-camera">
        <div className="saved-gift-chair sender">
          <EmptyChair />
        </div>
        <div className="saved-gift-chair recipient">
          <EmptyChair color="#d5b875" />
        </div>
        <div className="saved-gift-guest sender">
          <GuestArt customization={gift.senderCustomization} variant={4} />
        </div>
        <div
          className={`saved-gift-guest recipient ${hasRecipient ? "is-here" : ""}`}
        >
          <GuestArt customization={gift.recipientCustomization} variant={9} />
        </div>
        <div className="saved-gift-cloth" />
        <div className="saved-gift-plate sender">
          <svg viewBox="0 0 130 70" fill="none" aria-hidden="true">
            <ellipse
              cx="65"
              cy="35"
              rx="60"
              ry="28"
              fill="#fff8e6"
              stroke="#302d27"
              strokeWidth="2.5"
            />
            <ellipse
              cx="65"
              cy="35"
              rx="48"
              ry="21"
              stroke="#9baf8d"
              strokeWidth="1.5"
            />
          </svg>
        </div>
        <div className="saved-gift-plate recipient">
          <svg viewBox="0 0 130 70" fill="none" aria-hidden="true">
            <ellipse
              cx="65"
              cy="35"
              rx="60"
              ry="28"
              fill="#e4e7d2"
              stroke="#302d27"
              strokeWidth="2.5"
            />
            <ellipse
              cx="65"
              cy="35"
              rx="48"
              ry="21"
              stroke="#9baf8d"
              strokeWidth="1.5"
            />
          </svg>
        </div>
        <div className="saved-gift-dish">
          <DishArt dish={gift.dish} />
        </div>
        <div className="saved-gift-candle">
          <DecorationArt kind="candle" />
        </div>
        <div className={`saved-gift-occasion ${hasRecipient ? "is-here" : ""}`}>
          <OccasionProp occasion={gift.occasion} prop={gift.prop} />
        </div>
        <div
          className={`saved-gift-letter ${stage === "message" || stage === "opened" ? "is-here" : ""}`}
        >
          <GiftEnvelope />
        </div>
        {gift.occasion === "miss-you" && hasRecipient && (
          <>
            <span className="saved-gift-wave wave-left" aria-hidden="true">
              ⌁
            </span>
            <span className="saved-gift-wave wave-right" aria-hidden="true">
              ⌁
            </span>
          </>
        )}
      </div>
      {senderSeat && gift.recipientSeatId ? (
        <p className="saved-gift-seat-numbers">
          SEAT {senderSeat.toLocaleString()} <span>together at the table</span>{" "}
          SEAT {gift.recipientSeatId.toLocaleString()}
        </p>
      ) : (
        <p className="saved-gift-seat-numbers">
          A PLACE FOR YOU <span>beside someone who cares</span>
        </p>
      )}
    </div>
  );
}
class SceneFallback extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="saved-gift-art-fallback">
        <GiftEnvelope open />
        <p>The illustration took a little detour. Your letter is still here.</p>
      </div>
    ) : (
      this.props.children
    );
  }
}
async function request(path: string, body?: unknown) {
  const r = await fetch(path, {
    cache: "no-store",
    referrerPolicy: "no-referrer",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw Object.assign(
      new Error(
        typeof data.error === "string"
          ? data.error
          : "This surprise could not be checked. Please try again.",
      ),
      { status: r.status },
    );
  return data;
}

export default function GiftReveal({
  gift,
  token,
  preview = false,
  onClose,
  initialSimple = false,
}: {
  gift: GiftRevealData;
  token?: string;
  preview?: boolean;
  onClose?: () => void;
  initialSimple?: boolean;
}) {
  const [stage, setStage] = useState<Stage>(
    initialSimple ? "opened" : "invitation",
  );
  const [reduced, setReduced] = useState(false);
  const [simple, setSimple] = useState(initialSimple);
  const [letterOpen, setLetterOpen] = useState(initialSimple);
  const [thanked, setThanked] = useState(Boolean(gift.thankYouAt));
  const [claimed, setClaimed] = useState(
    Boolean(gift.claimed || gift.claimedAt),
  );
  const [claimedHere, setClaimedHere] = useState(false);
  const [claimPanel, setClaimPanel] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [devLink, setDevLink] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const shell = useRef<HTMLDivElement>(null);
  const letterHeading = useRef<HTMLHeadingElement>(null);
  const messageButton = useRef<HTMLButtonElement>(null);
  const claimHeading = useRef<HTMLHeadingElement>(null);
  const foldedButton = useRef<HTMLButtonElement>(null);
  const skipButton = useRef<HTMLButtonElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const occasion = occasionCopy[gift.occasion] || occasionCopy["just-because"];
  const endpoint = token ? `/api/gifts/open/${encodeURIComponent(token)}` : "";
  const inSequence = stage === "arriving" || stage === "occasion";
  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      let stored = false;
      try {
        stored = localStorage.getItem("table-motion") === "off";
      } catch {}
      const reduce =
        preference.matches ||
        stored ||
        document.documentElement.dataset.motion === "off";
      setReduced(reduce);
      if (reduce) {
        clearTimers();
        setStage((s) => (s === "arriving" || s === "occasion" ? "message" : s));
      }
    };
    update();
    preference.addEventListener("change", update);
    const visibility = () => {
      if (shell.current) shell.current.dataset.paused = String(document.hidden);
    };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(
      (entries) => {
        if (shell.current)
          shell.current.dataset.offscreen = String(!entries[0].isIntersecting);
      },
      { rootMargin: "100px" },
    );
    if (shell.current) observer.observe(shell.current);
    if (!preview) {
      const query = new URLSearchParams(location.search);
      if (query.get("view") === "plain") {
        setSimple(true);
        setStage("opened");
        setLetterOpen(true);
      }
      if (query.get("claim") === "ready") {
        setStage("opened");
        setLetterOpen(true);
        setClaimPanel(true);
        void checkSession();
      }
    }
    return () => {
      clearTimers();
      observer.disconnect();
      preference.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
    };
    // A gift never records views or starts animation on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (stage === "message")
      messageButton.current?.focus({ preventScroll: true });
    if (stage === "opened" && letterOpen) {
      const heading = letterHeading.current;
      heading?.focus({ preventScroll: true });
      const paper = heading?.closest<HTMLElement>(".gift-letter-paper");
      if (paper) {
        const behavior: ScrollBehavior =
          reduced ||
          simple ||
          matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth";
        const dialog = paper.closest("dialog");
        if (dialog) {
          // A sender preview scrolls its dialog, preserving the page beneath it.
          dialog.scrollTo({
            top: Math.max(
              0,
              dialog.scrollTop +
                paper.getBoundingClientRect().top -
                dialog.getBoundingClientRect().top -
                20,
            ),
            behavior,
          });
        } else {
          paper.scrollIntoView({ block: "start", behavior });
        }
      }
    }
    if (stage === "arriving")
      skipButton.current?.focus({ preventScroll: true });
    if (stage === "opened" && !letterOpen)
      foldedButton.current?.focus({ preventScroll: true });
  }, [stage, letterOpen]);
  useEffect(() => {
    if (claimPanel) claimHeading.current?.focus({ preventScroll: false });
  }, [claimPanel]);
  function join() {
    clearTimers();
    setError("");
    setLetterOpen(false);
    setClaimPanel(false);
    if (reduced || simple) {
      setStage("message");
      return;
    }
    setStage("arriving");
    timers.current.push(
      setTimeout(() => setStage("occasion"), 2100),
      setTimeout(() => setStage("message"), 6200),
    );
  }
  function skip() {
    clearTimers();
    setStage("message");
  }
  function openLetter() {
    clearTimers();
    setStage("opened");
    setLetterOpen(true);
  }
  function simpleView() {
    clearTimers();
    setSimple(true);
    setStage("opened");
    setLetterOpen(true);
  }
  async function thanks() {
    if (preview || !endpoint || thanked) return;
    setBusy("thanks");
    setError("");
    try {
      await request(`${endpoint}/thank-you`, {});
      setThanked(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function checkSession() {
    if (preview) return;
    setCheckingSession(true);
    try {
      const me = await request("/api/me");
      setSignedIn(Boolean(me.user?.id));
    } catch {
      setSignedIn(false);
    } finally {
      setCheckingSession(false);
    }
  }
  function openClaim() {
    setClaimPanel(true);
    setError("");
    void checkSession();
  }
  async function sendSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!token || preview) return;
    setBusy("auth");
    setError("");
    try {
      await request("/api/auth/sign-in/magic-link", {
        email,
        callbackURL: `/gift/${encodeURIComponent(token)}?claim=ready`,
      });
      setEmailSent(true);
      const config = await request("/api/config");
      if (config.devTools) {
        const inbox = await request(
          `/api/dev/inbox?email=${encodeURIComponent(email)}`,
        );
        setDevLink(inbox.messages?.at(-1)?.url || "");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function claim() {
    if (preview || !endpoint) return;
    setBusy("claim");
    setError("");
    try {
      const intent = await request(`${endpoint}/claim-intent`, {});
      await request(`${endpoint}/claim`, {
        claimToken: intent.claimToken,
        confirm: true,
      });
      setClaimed(true);
      setClaimedHere(true);
      setClaimPanel(false);
    } catch (e) {
      if ((e as { status?: number }).status === 401) setSignedIn(false);
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const Main = preview ? "div" : "main";
  return (
    <div
      ref={shell}
      className={`gift-recipient ${preview ? "gift-recipient-preview" : ""} ${reduced || simple ? "gift-reveal-static" : ""}`}
      data-stage={stage}
    >
      <header className="gift-reveal-header">
        {preview && onClose ? (
          <button className="text-link" onClick={onClose}>
            <ArrowLeft size={16} />
            Back to your gift
          </button>
        ) : (
          <Link href="/" aria-label="A Seat at the Internet home">
            {process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet"}
            <i>.</i>
          </Link>
        )}
        <span>A SEAT SAVED FOR YOU</span>
      </header>
      {gift.isDemo && (
        <p className="gift-reveal-development">
          DEVELOPMENT SURPRISE · NO REAL PAYMENT COLLECTED
        </p>
      )}
      <Main id={preview ? undefined : "main"} className="gift-reveal-main">
        {stage === "invitation" ? (
          <section
            className="gift-first-invitation"
            aria-labelledby="gift-invitation-heading"
          >
            <div className="gift-invitation-envelope">
              <GiftEnvelope />
              <span className="gift-paper-flower" aria-hidden="true">
                ✳
              </span>
            </div>
            <p className="eyebrow">SOMETHING SMALL. SOMEONE SPECIAL.</p>
            <h1 id="gift-invitation-heading">
              Someone saved
              <br />
              you <em>a seat.</em>
            </h1>
            {gift.senderName && (
              <p className="gift-from">
                A little surprise from <strong>{gift.senderName}.</strong>
              </p>
            )}
            <button className="btn btn-primary gift-join" onClick={join}>
              Join them <ArrowRight size={18} />
            </button>
            <button
              className="text-link gift-read-static"
              onClick={() => {
                setSimple(true);
                setStage("message");
              }}
            >
              Read without animation
            </button>
            <p className="gift-invitation-note">
              A private little dinner. No account needed to open your letter.
            </p>
          </section>
        ) : (
          <>
            <div className="gift-reveal-scene-heading">
              <p className="eyebrow">{occasion.label}</p>
              <h1>
                {inSequence
                  ? `A place beside ${gift.senderName}.`
                  : occasion.title}
              </h1>
              <p role="status" aria-live="polite">
                {stage === "arriving"
                  ? "Your chair is waiting. Make yourself comfortable."
                  : stage === "occasion"
                    ? occasion.note
                    : "There’s something for you on your plate."}
              </p>
              {inSequence && (
                <button
                  ref={skipButton}
                  className="text-link gift-skip"
                  onClick={skip}
                >
                  Skip animation <ArrowRight size={16} />
                </button>
              )}
            </div>
            <SceneFallback>
              <GiftScene
                gift={gift}
                stage={stage}
                animated={!reduced && !simple}
              />
            </SceneFallback>
            {!inSequence && stage !== "opened" && (
              <div className="gift-message-arrival">
                <p>A little letter, just for you.</p>
                <button
                  ref={messageButton}
                  className="btn btn-primary"
                  onClick={openLetter}
                >
                  <Mail size={18} />
                  Open your message
                </button>
              </div>
            )}
            {stage === "opened" && (
              <section
                className="gift-letter-section"
                aria-label="Your private letter"
              >
                {letterOpen ? (
                  <article className="gift-letter-paper">
                    <span className="gift-letter-heart" aria-hidden="true">
                      <Heart size={24} />
                    </span>
                    <p className="eyebrow">A LETTER AT YOUR PLACE</p>
                    <h2 ref={letterHeading} tabIndex={-1}>
                      For {gift.recipientName},<br />
                      <em>from {gift.senderName}.</em>
                    </h2>
                    <div className="gift-private-message">{gift.message}</div>
                    <p className="gift-letter-signoff">
                      There is always a little room for you here.
                    </p>
                    <button
                      className="text-link"
                      onClick={() => setLetterOpen(false)}
                    >
                      Fold your letter <X size={15} />
                    </button>
                  </article>
                ) : (
                  <button
                    ref={foldedButton}
                    className="btn btn-secondary"
                    onClick={() => setLetterOpen(true)}
                  >
                    <Mail size={17} />
                    Read your message again
                  </button>
                )}
                <div className="gift-after-reveal">
                  {preview ? (
                    <p className="gift-preview-explanation">
                      Your recipient can read this surprise and send a simple
                      thank-you without an account. Their character is a
                      suggestion; they can make it their own after claiming
                      their paid seat.
                    </p>
                  ) : (
                    <>
                      {thanked ? (
                        <p className="gift-thank-you-complete" role="status">
                          <Check size={17} />
                          Your thank-you is waiting at their seat.
                        </p>
                      ) : (
                        <>
                          <button
                            className="btn btn-primary"
                            disabled={!!busy}
                            onClick={thanks}
                          >
                            {busy === "thanks" ? (
                              <LoaderCircle className="spin" size={17} />
                            ) : (
                              <Heart size={17} />
                            )}
                            Send a thank-you ❤️
                          </button>
                          <p className="gift-thank-you-explanation">
                            Sends only “Thank you ❤️” to {gift.senderName}’s
                            gift dashboard. No account or email needed.
                          </p>
                        </>
                      )}
                      <div className="gift-after-controls">
                        <button className="text-link" onClick={join}>
                          <RotateCcw size={16} />
                          Replay the surprise
                        </button>
                        {!claimed ? (
                          <button className="text-link" onClick={openClaim}>
                            Make this guest yours <ArrowRight size={16} />
                          </button>
                        ) : (
                          <Link
                            className="text-link"
                            href={
                              claimedHere
                                ? `/account?seat=${gift.recipientSeatId || ""}`
                                : `/seat/${gift.recipientSeatId || gift.senderSeatId || 1}`
                            }
                          >
                            {claimedHere
                              ? "Personalize your guest"
                              : "Visit the guest’s seat"}
                            <ArrowRight size={16} />
                          </Link>
                        )}
                        <Link
                          className="text-link"
                          href={`/seat/${gift.senderSeatId || gift.sourceSeatId || 1}`}
                        >
                          Explore the table <ArrowRight size={16} />
                        </Link>
                      </div>
                      {claimed && (
                        <p className="gift-claim-note">
                          {claimedHere
                            ? "This guest is yours. You can personalize it in your account."
                            : "This guest has already been claimed. You can still replay the surprise and read your letter."}
                        </p>
                      )}
                    </>
                  )}
                  {preview && (
                    <button className="text-link" onClick={join}>
                      <RotateCcw size={16} />
                      Replay the surprise
                    </button>
                  )}
                </div>
              </section>
            )}
          </>
        )}
        {claimPanel && !preview && !claimed && (
          <section
            className="gift-claim-panel"
            aria-labelledby="gift-claim-heading"
          >
            <button
              className="gift-claim-close icon-button"
              onClick={() => setClaimPanel(false)}
              aria-label="Close guest claim"
            >
              <X size={18} />
            </button>
            <p className="eyebrow">YOUR GUEST. YOUR LITTLE PLACE.</p>
            <h2 ref={claimHeading} tabIndex={-1} id="gift-claim-heading">
              Make yourself at home.
            </h2>
            <p>
              This seat is already paid for. A verified account lets you change
              your character and public profile later. Opening the letter has
              not claimed it.
            </p>
            {checkingSession ? (
              <p role="status">Checking your account…</p>
            ) : signedIn ? (
              <>
                <p>
                  Claiming is an explicit transfer of this paid seat to your
                  account. Your sender keeps their own seat and their authored
                  letter.
                </p>
                <button
                  className="btn btn-primary"
                  disabled={!!busy}
                  onClick={claim}
                >
                  {busy === "claim" && (
                    <LoaderCircle className="spin" size={17} />
                  )}
                  Claim and personalize my guest <ArrowRight size={17} />
                </button>
              </>
            ) : (
              <form onSubmit={sendSignIn}>
                <label htmlFor="gift-claim-email">Your email</label>
                <input
                  id="gift-claim-email"
                  className="input"
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={254}
                />
                <button className="btn btn-primary" disabled={!!busy}>
                  {busy === "auth" ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Mail size={17} />
                  )}
                  Send sign-in link
                </button>
                {emailSent && (
                  <p role="status">
                    Your sign-in link is ready. Open it, then confirm the claim
                    here. Your email will not be public.
                  </p>
                )}
                {devLink && (
                  <a className="gift-dev-link" href={devLink}>
                    Open development sign-in link <ArrowRight size={15} />
                  </a>
                )}
              </form>
            )}
          </section>
        )}
        {error && (
          <p className="gift-reveal-error" role="alert">
            {error}
          </p>
        )}
        <footer className="gift-reveal-footer">
          <p>
            {preview
              ? "A PRIVATE PREVIEW · NOTHING IS SENT OR CLAIMED"
              : "A PRIVATE BEARER LINK · KEEP YOUR LITTLE SURPRISE BETWEEN YOU"}
          </p>
          <button className="text-link" onClick={simpleView}>
            Use the simple view
          </button>
        </footer>
      </Main>
    </div>
  );
}
