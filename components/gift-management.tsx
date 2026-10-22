"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  Gift,
  LoaderCircle,
  Mail,
  Play,
  RefreshCw,
  Share2,
  ShieldCheck,
  X,
} from "lucide-react";
import { GuestArt, DishArt, EmptyChair } from "./art/illustrations";
import Modal from "./modal";
import GiftReveal, { type GiftRevealData } from "./gift-reveal";
import type { GiftRecord } from "@/lib/gift-input";
import "./gift-management.css";

type Notice = { kind: "success" | "error"; text: string } | null;
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const occasionNames: Record<string, string> = {
  birthday: "Birthday",
  congratulations: "Congratulations",
  "thank-you": "Thank you",
  "miss-you": "I miss you",
  "just-because": "Just because",
};
const statusNames: Record<string, string> = {
  draft: "A surprise in progress",
  awaiting_payment: "Waiting for payment confirmation",
  ready: "Ready for their little surprise",
  revoked: "Private link revoked",
  unavailable: "Surprise unavailable",
};
const storageKey = (id: string) => `saved-seat-gift-link:${id}`;
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    referrerPolicy: "no-referrer",
    ...(body !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "We could not update this surprise. Please try again.",
    );
  return data;
}

export default function GiftManagement({
  gifts,
  onRefresh,
  focusGiftId,
  onViewOrder,
}: {
  gifts: GiftRecord[];
  onRefresh: () => Promise<void>;
  focusGiftId?: string | null;
  onViewOrder?: (id: string) => void;
}) {
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState<GiftRevealData | null>(null);
  const focus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (focusGiftId && focus.current) {
      focus.current.scrollIntoView({ block: "nearest", behavior: "instant" });
      focus.current.focus({ preventScroll: true });
    }
  }, [focusGiftId, gifts.length]);
  const run = useCallback(async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy("");
    }
  }, []);
  async function openPreview(gift: GiftRecord) {
    await run(`preview-${gift.id}`, async () => {
      const result = await api(
        `/api/gifts/${encodeURIComponent(gift.id)}/preview`,
      );
      setPreview((result.gift || result) as GiftRevealData);
    });
  }
  return (
    <section className="gift-management" aria-label="Your saved-seat gifts">
      <div className="account-section-heading gift-management-heading">
        <div>
          <p className="account-eyebrow">SMALL SURPRISES, GOOD COMPANY</p>
          <h2>A seat saved for someone.</h2>
          <p>
            Your private letters, peculiar guests, and little thank-yous. Only
            you can manage these surprises.
          </p>
        </div>
        <div className="gift-management-heading-actions">
          <button
            className="account-button text"
            disabled={!!busy}
            onClick={() =>
              void run("refresh", async () => {
                await onRefresh();
                setNotice({
                  kind: "success",
                  text: "Your gift updates are current.",
                });
              })
            }
          >
            <RefreshCw size={16} /> Check gift updates
          </button>
          <Link href="/save-a-seat" className="account-button primary">
            <Gift size={17} /> Save a seat for someone <ArrowRight size={16} />
          </Link>
        </div>
      </div>
      {notice && (
        <div
          className={`account-notice ${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          <span>{notice.text}</span>
          <button
            aria-label="Dismiss gift notice"
            onClick={() => setNotice(null)}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {!gifts.length ? (
        <div className="gift-management-empty">
          <div className="gift-empty-pair" aria-hidden="true">
            <GuestArt base="plant" />
            <EmptyChair />
          </div>
          <h3>Two chairs. A lovely little reason.</h3>
          <p>
            Make a birthday dinner, say a proper thank-you, or send a small “I
            miss you.” The letter stays off the public table.
          </p>
          <Link href="/save-a-seat" className="account-button secondary">
            Make a dinner surprise <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="gift-management-list">
          {gifts.map((gift) => (
            <article
              key={gift.id}
              ref={gift.id === focusGiftId ? focus : undefined}
              tabIndex={gift.id === focusGiftId ? -1 : undefined}
              className={`managed-gift ${gift.id === focusGiftId ? "managed-gift-focused" : ""}`}
              aria-label={`Gift for ${gift.recipientName}`}
            >
              <GiftCard
                gift={gift}
                busy={busy}
                run={run}
                refresh={onRefresh}
                preview={() => openPreview(gift)}
                notify={setNotice}
                onViewOrder={onViewOrder}
              />
            </article>
          ))}
        </div>
      )}
      <p className="gift-management-privacy">
        <ShieldCheck size={17} />
        <span>
          Gift links are bearer links: anyone with the link can open the
          surprise. Revoking or replacing a link stops future server access; it
          cannot recall content someone already viewed or copied. Reading never
          claims a seat.
        </span>
      </p>
      {preview && (
        <Modal
          title="Preview your saved-seat surprise"
          className="gift-preview-modal"
          onClose={() => setPreview(null)}
        >
          <GiftReveal gift={preview} preview onClose={() => setPreview(null)} />
        </Modal>
      )}
    </section>
  );
}

function GiftCard({
  gift,
  busy,
  run,
  refresh,
  preview,
  notify,
  onViewOrder,
}: {
  gift: GiftRecord;
  busy: string;
  run: (key: string, action: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
  preview: () => Promise<void>;
  notify: (notice: Notice) => void;
  onViewOrder?: (id: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState(gift.message);
  const [confirm, setConfirm] = useState<"revoke" | "replace" | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const urlField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setMessage(gift.message);
  }, [gift.message]);
  useEffect(() => {
    setCanShare(typeof navigator.share === "function");
    if (gift.status !== "ready" || !gift.hasLink) {
      setUrl("");
      try {
        sessionStorage.removeItem(storageKey(gift.id));
      } catch {}
      return;
    }
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(storageKey(gift.id)) || "null",
      );
      if (saved?.url && saved.createdAt === gift.linkCreatedAt)
        setUrl(saved.url);
      else {
        setUrl("");
        sessionStorage.removeItem(storageKey(gift.id));
      }
    } catch {
      setUrl("");
    }
  }, [gift.id, gift.status, gift.hasLink, gift.linkCreatedAt]);
  async function issue(replace = false) {
    await run(`link-${gift.id}`, async () => {
      const data = await api(
        `/api/gifts/${encodeURIComponent(gift.id)}/link`,
        "POST",
        { replace },
      );
      const next = data.gift as GiftRecord;
      const link = String(data.url || "");
      if (!link)
        throw new Error(
          "The server did not return a private link. Refresh and try again.",
        );
      setUrl(link);
      setConfirm(null);
      try {
        sessionStorage.setItem(
          storageKey(gift.id),
          JSON.stringify({ url: link, createdAt: next?.linkCreatedAt || null }),
        );
      } catch {}
      await refresh();
      notify({
        kind: "success",
        text: replace
          ? "Your replacement link is ready. The old link is no longer valid."
          : "Their seat is ready. Send the surprise.",
      });
    });
  }
  async function copy() {
    await run(`copy-${gift.id}`, async () => {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        notify({
          kind: "success",
          text: "Surprise link copied. Send it to someone you love.",
        });
        setTimeout(() => setCopied(false), 2500);
      } catch {
        urlField.current?.focus();
        urlField.current?.select();
        notify({
          kind: "error",
          text: "The link is ready below. Select and copy the full private link.",
        });
      }
    });
  }
  async function share() {
    await run(`share-${gift.id}`, async () => {
      try {
        await navigator.share({
          title: "Someone saved you a seat.",
          text: "I saved you a seat. There’s a little surprise waiting for you.",
          url,
        });
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError"))
          notify({
            kind: "error",
            text: "Sharing was unavailable. Your copy-link option is still ready below.",
          });
      }
    });
  }
  const mayIssue = gift.status === "ready" || gift.status === "revoked";
  return (
    <>
      <div className="managed-gift-art" aria-hidden="true">
        <div className="managed-gift-sender">
          <GuestArt customization={gift.senderCustomization} />
        </div>
        <div className="managed-gift-recipient">
          <GuestArt customization={gift.recipientCustomization} />
        </div>
        <div className="managed-gift-cloth" />
        <div className="managed-gift-dish">
          <DishArt dish={gift.dish} />
        </div>
        <span className="managed-gift-seat-label">
          {gift.senderSeatId
            ? `SEATS ${gift.senderSeatId}${gift.recipientSeatId ? ` + ${gift.recipientSeatId}` : ""}`
            : "A PAIR OF POSSIBILITIES"}
        </span>
      </div>
      <div className="managed-gift-content">
        <div className="managed-gift-title">
          <div>
            <p className="account-eyebrow">
              {occasionNames[gift.occasion] || "A little surprise"}
              {gift.isDemo ? " · DEVELOPMENT" : ""}
            </p>
            <h3>
              For {gift.recipientName}, from {gift.senderName}.
            </h3>
          </div>
          <span className={`account-status ${gift.status}`}>
            {statusNames[gift.status] || gift.status}
          </span>
        </div>
        {gift.claimedAt ? (
          <p className="managed-gift-claim">
            <Check size={16} /> Their guest is theirs now. You can manage your
            letter and its link; their seat and public profile belong to them.
          </p>
        ) : (
          <p className="account-small">
            Your recipient’s character is a suggestion. They can personalize it
            after a verified account claim.
          </p>
        )}
        {gift.thankYouAt && (
          <p className="managed-gift-thanks" role="status">
            <Mail size={18} />
            <span>
              <strong>Thank you ❤️</strong>
              <small>
                A thank-you arrived for this surprise · {date(gift.thankYouAt)}
              </small>
            </span>
          </p>
        )}
        {gift.status === "ready" && (
          <p className="managed-gift-ready">
            Their seat is ready. Send the surprise.
          </p>
        )}
        {gift.status === "awaiting_payment" && (
          <p className="account-small">
            Your surprise waits for server-confirmed payment and exact seat
            fulfillment. A checkout return never activates it. Resume your
            existing order instead of paying again.
          </p>
        )}
        {gift.status === "unavailable" && (
          <p className="account-small">
            The gift is unavailable under its order or account lifecycle. A
            qualifying refund or cancellation does not silently replace the
            seats. Ask a host about the recorded order.
          </p>
        )}
        {gift.explanation && (
          <p className="account-small">{gift.explanation}</p>
        )}
        <div className="managed-gift-actions">
          {gift.status !== "unavailable" && (
            <button
              className="account-button secondary"
              disabled={!!busy}
              onClick={() => void preview()}
            >
              <Play size={15} /> Preview experience
            </button>
          )}
          {["draft", "ready"].includes(gift.status) && (
            <button
              className="account-button text"
              disabled={!!busy}
              onClick={() => {
                setEditing(!editing);
                setMessage(gift.message);
              }}
            >
              <Mail size={15} />{" "}
              {editing ? "Close letter editor" : "Edit private message"}
            </button>
          )}
          {gift.status === "ready" && !gift.claimedAt && (
            <Link
              className="account-button text"
              href={`/save-a-seat?giftId=${encodeURIComponent(gift.id)}&edit=1`}
            >
              Edit suggested guests <ArrowRight size={15} />
            </Link>
          )}
          {(gift.status === "draft" || gift.status === "awaiting_payment") && (
            <Link
              className="account-button primary"
              href={`/save-a-seat?giftId=${encodeURIComponent(gift.id)}`}
            >
              Continue your surprise <ArrowRight size={15} />
            </Link>
          )}
          {gift.orderId && onViewOrder && (
            <button
              className="account-button text"
              onClick={() => onViewOrder(gift.orderId!)}
            >
              Order details <ArrowRight size={15} />
            </button>
          )}
        </div>
        {editing && ["draft", "ready"].includes(gift.status) && (
          <form
            className="managed-gift-letter"
            onSubmit={(e) => {
              e.preventDefault();
              void run(`edit-${gift.id}`, async () => {
                await api(
                  `/api/gifts/${encodeURIComponent(gift.id)}`,
                  "PATCH",
                  { message },
                );
                setEditing(false);
                await refresh();
                notify({
                  kind: "success",
                  text: "Your private letter is saved. Future openings show your updated message.",
                });
              });
            }}
          >
            <label htmlFor={`gift-message-${gift.id}`}>
              Your private letter to {gift.recipientName}
            </label>
            <textarea
              id={`gift-message-${gift.id}`}
              maxLength={1000}
              required
              rows={7}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="managed-letter-meta">
              <span>{message.length}/1,000</span>
              <span>Updated {date(gift.updatedAt)}</span>
            </div>
            <p>
              Paragraphs and emoji are welcome. This text never appears on the
              public table. Edits apply to future openings; already viewed or
              copied text cannot be recalled.
            </p>
            <button
              className="account-button primary"
              disabled={!!busy || !message.trim()}
            >
              {busy === `edit-${gift.id}` ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}{" "}
              Save private letter
            </button>
          </form>
        )}
        {mayIssue && (
          <div className="managed-gift-link-controls">
            {!url && (
              <p>
                {gift.hasLink
                  ? "A secret link was already created. It is stored only in the browser session that received it. Generate a replacement if you need a new copy; the old link will stop working."
                  : "Anyone with the secret link can read this surprise. Create it when you are ready to send it privately."}
              </p>
            )}
            {!gift.hasLink && gift.status === "ready" && (
              <button
                className="account-button primary"
                disabled={!!busy}
                onClick={() => void issue()}
              >
                <Gift size={16} /> Create private gift link
              </button>
            )}
            {url && (
              <>
                <label htmlFor={`gift-link-${gift.id}`}>
                  Your private surprise link
                </label>
                <input
                  ref={urlField}
                  id={`gift-link-${gift.id}`}
                  readOnly
                  value={url}
                  onFocus={(e) => e.target.select()}
                  autoComplete="off"
                />
                <div className="managed-gift-actions">
                  {canShare && (
                    <button
                      className="account-button primary"
                      disabled={!!busy}
                      onClick={() => void share()}
                    >
                      <Share2 size={16} /> Send the surprise
                    </button>
                  )}
                  <button
                    className="account-button secondary"
                    disabled={!!busy}
                    onClick={() => void copy()}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
                    {copied ? "Copied" : "Copy gift link"}
                  </button>
                  <a
                    className="account-button secondary"
                    href={`/api/og/gift/${encodeURIComponent(gift.id)}?download=1`}
                    download="a-seat-saved-for-you.png"
                    referrerPolicy="no-referrer"
                  >
                    <Download size={16} /> Download invitation image
                  </a>
                </div>
              </>
            )}
            {(gift.hasLink || gift.status === "revoked") && (
              <div className="managed-gift-actions">
                <button
                  className="account-button text"
                  disabled={!!busy}
                  onClick={() => setConfirm("replace")}
                >
                  <RefreshCw size={15} /> Generate replacement link
                </button>
                {gift.status === "ready" && (
                  <button
                    className="account-button text danger"
                    disabled={!!busy}
                    onClick={() => setConfirm("revoke")}
                  >
                    Revoke gift link
                  </button>
                )}
              </div>
            )}
            {confirm && (
              <div
                className="managed-gift-confirm"
                role="group"
                aria-label={
                  confirm === "revoke"
                    ? "Confirm gift link revocation"
                    : "Confirm replacement gift link"
                }
              >
                <p>
                  {confirm === "revoke"
                    ? "Stop future access through this gift link?"
                    : "Create a replacement and invalidate the old gift link?"}{" "}
                  Reading or copying that already happened cannot be recalled.
                  Their claimed guest remains theirs.
                </p>
                <div className="managed-gift-actions">
                  <button
                    className="account-button secondary danger"
                    disabled={!!busy}
                    onClick={() =>
                      void (confirm === "replace"
                        ? issue(true)
                        : run(`revoke-${gift.id}`, async () => {
                            await api(
                              `/api/gifts/${encodeURIComponent(gift.id)}/revoke`,
                              "POST",
                              {},
                            );
                            setUrl("");
                            setConfirm(null);
                            try {
                              sessionStorage.removeItem(storageKey(gift.id));
                            } catch {}
                            await refresh();
                            notify({
                              kind: "success",
                              text: "Gift link revoked. Future server access is disabled; viewed or copied content cannot be recalled.",
                            });
                          }))
                    }
                  >
                    {confirm === "replace"
                      ? "Replace private link"
                      : "Revoke this link"}
                  </button>
                  <button
                    className="account-button text"
                    disabled={!!busy}
                    onClick={() => setConfirm(null)}
                  >
                    Keep current link
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
