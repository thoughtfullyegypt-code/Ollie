"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  Heart,
  LoaderCircle,
  Mail,
  Share2,
  Shuffle,
} from "lucide-react";
import {
  GuestArt,
  DishArt,
  DecorationArt,
  EmptyChair,
  BASES,
  ACCESSORIES,
  OUTFITS,
  SKIN_TONES,
  DISHES,
} from "./art/illustrations";
import type {
  GiftCustomization,
  GiftInput,
  GiftOccasion,
  GiftProp,
  GiftPreparation,
  GiftRecord,
} from "@/lib/gift-input";
import GiftReveal from "./gift-reveal";
import Modal from "./modal";
import DonationBlurb from "./donation-blurb";
import { getAttribution, track } from "./journey-events";
import "./gift-builder.css";

const DRAFT_KEY = "a-seat-saved-gift-draft-v1";
const OCCASIONS: {
  id: GiftOccasion;
  label: string;
  description: string;
  prop: GiftProp;
  example: string;
}[] = [
  {
    id: "birthday",
    label: "Birthday",
    description: "Another trip around the sun. Better with cake.",
    prop: "cake",
    example:
      "Happy birthday, my favorite peculiar person.\n\nIf I could put all the good things you deserve on one table, we would need a much longer table. Here is a little place beside me, just for you.",
  },
  {
    id: "congratulations",
    label: "Congratulations",
    description: "A little fanfare for a very big you.",
    prop: "banner",
    example:
      "You did the thing!\n\nI know how much this took. I saved you a place to pause, celebrate, and be wonderfully proud of yourself. I certainly am.",
  },
  {
    id: "thank-you",
    label: "Thank you",
    description: "For the things a text cannot quite say.",
    prop: "flowers",
    example:
      "Thank you for being there.\n\nFor the big things, the little things, and the things you probably thought I did not notice. This strange little dinner is my way of saying: I noticed. It meant a lot.",
  },
  {
    id: "miss-you",
    label: "I miss you",
    description: "A small table for a very long distance.",
    prop: "wave",
    example:
      "The chair beside me felt a little empty.\n\nUntil we can sit at the same real table again, here is a small corner of the internet where we are neighbors. I miss you, and I am very glad you exist.",
  },
  {
    id: "just-because",
    label: "Just because",
    description: "No occasion. Just a very good person.",
    prop: "bread-heart",
    example:
      "No special occasion. No elaborate reason.\n\nI just thought the internet could use a little more of us, sitting together, passing the bread. I saved you a place.",
  },
];
const PROPS: { id: GiftProp; label: string }[] = [
  { id: "cake", label: "Little birthday cake" },
  { id: "banner", label: "Celebration banner" },
  { id: "flowers", label: "Flowers for you" },
  { id: "wave", label: "A little wave" },
  { id: "bread-heart", label: "Bread and a heart note" },
];
const INITIAL: GiftInput = {
  occasion: "birthday",
  senderName: "",
  recipientName: "",
  message: "",
  senderCustomization: {
    base: "raccoon",
    accessory: "none",
    outfit: "suit",
    skin: "#dca276",
    color: "#776074",
  },
  recipientCustomization: {
    base: "plant",
    accessory: "sunglasses",
    outfit: "bowtie",
    skin: "#bd805a",
    color: "#9baf8d",
  },
  dish: "cake",
  prop: "cake",
};
type Settings = {
  brand: string;
  packages: { id: string; amount: number; count: number; taxMinor?: number }[];
  mode: string;
  serviceMonths: number;
  refundDays: number;
  supportEmail?: string | null;
  taxExplanation?: string;
};
type Draft = {
  input: GiftInput;
  step: number;
  giftId?: string;
  orderId?: string;
  savedAt: number;
};
const money = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );
async function request(path: string, body?: unknown, method = "POST") {
  const response = await fetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Your surprise is safe. Please try again.",
    );
  return data;
}
function customization(
  value: unknown,
  fallback: GiftCustomization,
): GiftCustomization {
  const c =
    value && typeof value === "object"
      ? (value as Partial<GiftCustomization>)
      : {};
  return {
    base: BASES.some((b) => b.id === c.base) ? c.base! : fallback.base,
    accessory: ACCESSORIES.some((a) => a.id === c.accessory)
      ? c.accessory!
      : fallback.accessory,
    outfit: OUTFITS.some((o) => o.id === c.outfit)
      ? c.outfit!
      : fallback.outfit,
    skin: /^#[a-f0-9]{6}$/i.test(c.skin || "") ? c.skin! : fallback.skin,
    color: /^#[a-f0-9]{6}$/i.test(c.color || "") ? c.color! : fallback.color,
  };
}
function restore(value: unknown): GiftInput | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Partial<GiftInput>;
  return {
    ...INITIAL,
    occasion: OCCASIONS.some((o) => o.id === d.occasion)
      ? d.occasion!
      : INITIAL.occasion,
    senderName:
      typeof d.senderName === "string" ? d.senderName.slice(0, 30) : "",
    recipientName:
      typeof d.recipientName === "string" ? d.recipientName.slice(0, 30) : "",
    message: typeof d.message === "string" ? d.message.slice(0, 1000) : "",
    senderCustomization: customization(
      d.senderCustomization,
      INITIAL.senderCustomization,
    ),
    recipientCustomization: customization(
      d.recipientCustomization,
      INITIAL.recipientCustomization,
    ),
    dish: DISHES.some((dish) => dish.id === d.dish) ? d.dish! : "cake",
    prop: PROPS.some((p) => p.id === d.prop) ? d.prop! : "cake",
    ...(Number.isInteger(d.sourceSeatId) &&
    Number(d.sourceSeatId) > 0 &&
    Number(d.sourceSeatId) <= 10000
      ? { sourceSeatId: d.sourceSeatId }
      : {}),
  };
}
function CharacterControls({
  kind,
  value,
  onChange,
}: {
  kind: "sender" | "recipient";
  value: GiftCustomization;
  onChange: (c: GiftCustomization) => void;
}) {
  const human = [
    "human",
    "astronaut",
    "grandma",
    "detective",
    "vampire",
  ].includes(value.base);
  function surprise() {
    const b = BASES[Math.floor(Math.random() * BASES.length)];
    const a = ACCESSORIES[Math.floor(Math.random() * ACCESSORIES.length)];
    onChange({
      ...value,
      base: b.id,
      accessory: a.id,
      outfit:
        b.id === "raccoon"
          ? "suit"
          : b.id === "plant"
            ? "bowtie"
            : OUTFITS[Math.floor(Math.random() * OUTFITS.length)].id,
    });
  }
  return (
    <div className="gift-character-controls">
      <div className="gift-field-heading">
        <span>Character base</span>
        <button type="button" className="text-link" onClick={surprise}>
          <Shuffle size={15} /> Surprise me
        </button>
      </div>
      <div
        className="gift-base-options"
        role="group"
        aria-label={`${kind} character base`}
      >
        {BASES.map((b) => (
          <button
            type="button"
            key={b.id}
            aria-label={b.label}
            aria-pressed={value.base === b.id}
            title={b.label}
            onClick={() => onChange({ ...value, base: b.id })}
          >
            <GuestArt customization={{ ...value, base: b.id }} portrait />
          </button>
        ))}
      </div>
      {human ? (
        <fieldset className="gift-skin-options">
          <legend>Skin tone</legend>
          {SKIN_TONES.map((t) => (
            <button
              type="button"
              key={t.id}
              aria-label={t.label}
              aria-pressed={value.skin === t.id}
              style={{ background: t.id }}
              onClick={() => onChange({ ...value, skin: t.id })}
            />
          ))}
        </fieldset>
      ) : (
        <p className="gift-fine">
          This guest brings their own peculiar palette.
        </p>
      )}
      <div className="gift-field-pair">
        <label htmlFor={`${kind}-accessory`}>
          Hair or head accessory
          <select
            id={`${kind}-accessory`}
            value={value.accessory}
            onChange={(e) => onChange({ ...value, accessory: e.target.value })}
          >
            {ACCESSORIES.map((a) => (
              <option value={a.id} key={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${kind}-outfit`}>
          Outfit
          <select
            id={`${kind}-outfit`}
            value={value.outfit}
            onChange={(e) => onChange({ ...value, outfit: e.target.value })}
          >
            {OUTFITS.map((o) => (
              <option value={o.id} key={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
export default function GiftBuilder({
  brandName = "A Seat at the Internet",
}: {
  brandName?: string;
}) {
  const [input, setInput] = useState<GiftInput>(INITIAL),
    [step, setStep] = useState(0),
    [hydrated, setHydrated] = useState(false),
    [settings, setSettings] = useState<Settings | null>(null),
    [giftId, setGiftId] = useState<string>(),
    [gift, setGift] = useState<GiftRecord | null>(null),
    [preparation, setPreparation] = useState<GiftPreparation | null>(null),
    [orderId, setOrderId] = useState<string>(),
    [orderProvider, setOrderProvider] = useState<
      "development" | "stripe" | null
    >(null),
    [user, setUser] = useState<{ id: string; email: string } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [email, setEmail] = useState(""),
    [sent, setSent] = useState(false),
    [devLink, setDevLink] = useState(""),
    [preview, setPreview] = useState(false),
    [link, setLink] = useState(""),
    [copied, setCopied] = useState(false),
    [nativeShare, setNativeShare] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null),
    scenePreview = useRef<HTMLElement>(null),
    loaded = useRef(false),
    initialDraft = useRef<Draft | null>(null);
  const occasion = OCCASIONS.find((o) => o.id === input.occasion)!;
  const pair = settings?.packages.find((p) => p.id === "two" && p.count === 2),
    single = settings?.packages.find((p) => p.id === "one" && p.count === 1);
  const previewGift = {
    ...input,
    id: "sender-preview",
    status: "draft" as const,
    senderSeatId: preparation?.sourceSeatId || input.sourceSeatId || null,
    recipientSeatId: preparation?.recipientSeatId || null,
    claimed: false,
    isDemo: settings?.mode === "development",
  };
  useEffect(() => {
    let draft: Draft | null = null;
    const params = new URLSearchParams(location.search),
      source = Number(params.get("sourceSeatId") || params.get("source"));
    try {
      const candidate = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (
        candidate?.savedAt &&
        Date.now() - candidate.savedAt < 7 * 86400000 &&
        restore(candidate.input)
      )
        draft = candidate;
    } catch {}
    initialDraft.current = draft;
    let next = draft ? restore(draft.input)! : { ...INITIAL };
    if (source > 0 && source <= 10000 && Number.isInteger(source))
      next.sourceSeatId = source;
    if (!draft && params.get("from") === "builder")
      try {
        const previous = JSON.parse(
          localStorage.getItem("dinner-draft") || "null",
        )?.profile;
        if (previous) {
          next.senderName = String(previous.displayName || "").slice(0, 30);
          next.senderCustomization = customization(
            previous.customization,
            INITIAL.senderCustomization,
          );
        }
      } catch {}
    setInput(next);
    if (draft) {
      setStep(Math.min(7, Math.max(0, draft.step)));
      setGiftId(draft.giftId);
      setOrderId(draft.orderId);
    }
    const queryGift = params.get("giftId") || params.get("gift");
    if (queryGift) setGiftId(queryGift);
    setHydrated(true);
    setNativeShare(typeof navigator.share === "function");
    request("/api/config")
      .then(setSettings)
      .catch((e) => setError(e.message));
    request("/api/me")
      .then((data) => {
        setUser(data.user || null);
        if (!draft && next.sourceSeatId) {
          const owned = data.seats?.find(
            (s: { seatId: number }) => s.seatId === next.sourceSeatId,
          );
          if (owned?.profile)
            setInput((current) => ({
              ...current,
              senderName: owned.profile.displayName || "",
              senderCustomization: customization(
                owned.profile.customization,
                INITIAL.senderCustomization,
              ),
            }));
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (step === 7) {
        localStorage.removeItem(DRAFT_KEY);
        if (giftId) {
          const url = new URL(location.href);
          url.search = new URLSearchParams({ giftId }).toString();
          history.replaceState(null, "", url);
        }
        return;
      }
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          input,
          step,
          giftId,
          orderId,
          savedAt: Date.now(),
        } satisfies Draft),
      );
    } catch {}
  }, [input, step, giftId, orderId, hydrated]);
  useEffect(() => {
    if (!hydrated || !user || !giftId || loaded.current) return;
    loaded.current = true;
    request(`/api/gifts/${encodeURIComponent(giftId)}`)
      .then((data) => {
        const g = data.gift as GiftRecord;
        setGift(g);
        const local = initialDraft.current;
        const keepLocal =
          g.status === "draft" &&
          local?.giftId === g.id &&
          local.savedAt > Date.parse(g.updatedAt);
        if (!keepLocal) setInput(restore(g)!);
        if (g.status === "ready") {
          setStep(
            new URLSearchParams(location.search).get("edit") === "1" &&
              !g.claimedAt
              ? 0
              : 7,
          );
          try {
            const key = `saved-seat-gift-link:${g.id}`;
            const saved = JSON.parse(sessionStorage.getItem(key) || "null");
            const url = saved?.url ? new URL(saved.url, location.origin) : null;
            if (
              g.hasLink &&
              saved?.createdAt === g.linkCreatedAt &&
              url?.origin === location.origin &&
              /^\/gift\/[A-Za-z0-9_-]{43}$/.test(url.pathname)
            )
              setLink(url.toString());
            else {
              sessionStorage.removeItem(key);
              setLink("");
            }
          } catch {
            setLink("");
          }
        } else if (g.status === "awaiting_payment" && g.orderId) {
          setOrderId(g.orderId);
          setStep(6);
        }
      })
      .catch((e) => {
        loaded.current = false;
        setError(e.message);
      });
  }, [hydrated, user, giftId]);
  useEffect(() => {
    if (!sent || user) return;
    const timer = setInterval(() => {
      request("/api/me")
        .then((data) => {
          if (data.user) {
            setUser(data.user);
            setSent(false);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [sent, user]);
  useEffect(() => {
    if (!orderId || !user) return;
    let active = true;
    request(`/api/orders/${encodeURIComponent(orderId)}`)
      .then((order) => {
        if (active)
          setOrderProvider(
            order.provider === "development" ? "development" : "stripe",
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [orderId, user]);
  useEffect(() => {
    if (step !== 6 || !giftId || !user) return;
    let active = true;
    const check = async () => {
      try {
        const data = await request(`/api/gifts/${encodeURIComponent(giftId)}`);
        if (!active) return;
        setGift(data.gift);
        if (data.gift.status === "ready") {
          setStep(7);
          setError("");
        } else if (data.gift.status === "draft") {
          setStep(5);
          setOrderId(undefined);
        }
      } catch {}
    };
    void check();
    const timer = setInterval(check, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [step, giftId, user]);
  useEffect(() => {
    const element = scenePreview.current;
    if (!element) return;
    let visible = true;
    const sync = () => {
      element.dataset.paused = String(!visible || document.hidden);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        sync();
      },
      { rootMargin: "80px" },
    );
    observer.observe(element);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  function update(p: Partial<GiftInput>) {
    setInput((current) => ({ ...current, ...p }));
    setError("");
    setPreparation(null);
  }
  function go(next: number) {
    setStep(next);
    setError("");
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      document
        .querySelector(".gift-builder-controls")
        ?.scrollIntoView({ behavior: "instant", block: "start" });
    });
  }
  function next() {
    if (step === 1 && !input.senderName.trim()) {
      setError("Give your guest a name, up to 30 characters.");
      return;
    }
    if (step === 2 && !input.recipientName.trim()) {
      setError(
        "Who is this little surprise for? Add a name, up to 30 characters.",
      );
      return;
    }
    if (step === 4 && !input.message.trim()) {
      setError(
        "Write a personal message or intentionally choose an example before continuing.",
      );
      return;
    }
    go(Math.min(5, step + 1));
  }
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/api/auth/sign-in/magic-link", {
        email,
        callbackURL: `${location.origin}/save-a-seat?resume=1${giftId ? `&giftId=${encodeURIComponent(giftId)}` : ""}${input.sourceSeatId ? `&sourceSeatId=${input.sourceSeatId}` : ""}`,
      });
      setSent(true);
      if (settings?.mode === "development") {
        const data = await request(
          `/api/dev/inbox?email=${encodeURIComponent(email)}`,
        );
        setDevLink(data.messages?.at(-1)?.url || "");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      const data = giftId
        ? await request(
            `/api/gifts/${encodeURIComponent(giftId)}`,
            input,
            "PATCH",
          )
        : await request("/api/gifts", input);
      const id = data.gift.id;
      setGiftId(id);
      setGift(data.gift);
      loaded.current = true;
      const quote = await request(
        `/api/gifts/${encodeURIComponent(id)}/prepare`,
        { near: input.sourceSeatId || 1 },
      );
      setPreparation(quote);
      setGift(quote.gift);
      request("/api/config")
        .then(setSettings)
        .catch(() => {});
      if (!quote.requiresPayment) {
        setStep(7);
      }
      return quote as GiftPreparation;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function checkout() {
    const quote = preparation || (await prepare());
    if (!quote || !quote.requiresPayment) return;
    setBusy(true);
    setError("");
    try {
      const data = await request("/api/checkout", {
        giftId: quote.gift.id,
        packageId: quote.packageId,
        seatIds: quote.seatIds,
        expectedAmount: quote.amount,
        profile: {
          displayName: input.senderName,
          message: "A seat saved for someone.",
          dish: input.dish,
          customization: input.senderCustomization,
        },
        attribution: getAttribution(),
      });
      setOrderId(data.orderId);
      setOrderProvider(data.mode === "development" ? "development" : "stripe");
      track("checkout_started", {
        packageId: quote.packageId || "two",
        count: quote.seatIds.length,
        placement: "builder",
      });
      if (data.url) {
        location.assign(data.url);
        return;
      }
      setStep(6);
    } catch (e) {
      setError((e as Error).message);
      request("/api/config")
        .then(setSettings)
        .catch(() => {});
      // A provider timeout may follow successful order creation. Recover that
      // exact order before allowing another checkout attempt.
      try {
        const current = await request(
          `/api/gifts/${encodeURIComponent(quote.gift.id)}`,
        );
        setGift(current.gift);
        if (
          current.gift.status === "awaiting_payment" &&
          current.gift.orderId
        ) {
          setOrderId(current.gift.orderId);
          setStep(6);
        } else if (current.gift.status === "ready") setStep(7);
        else setPreparation(null);
      } catch {
        setPreparation(null);
      }
    } finally {
      setBusy(false);
    }
  }
  async function resumeCheckout() {
    if (!orderId) return;
    setBusy(true);
    setError("");
    try {
      const data = await request(
        `/api/orders/${encodeURIComponent(orderId)}`,
        {},
      );
      setOrderProvider(data.mode === "development" ? "development" : "stripe");
      if (data.url) location.assign(data.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pay(outcome: "paid" | "failed") {
    if (!orderId) return;
    setBusy(true);
    setError("");
    try {
      await request("/api/dev/pay", { orderId, outcome });
      const data = await request(`/api/gifts/${encodeURIComponent(giftId!)}`);
      setGift(data.gift);
      if (outcome === "paid" && data.gift.status === "ready") {
        setStep(7);
        setOrderId(undefined);
      } else if (outcome === "failed") {
        setStep(5);
        setOrderId(undefined);
        setPreparation(null);
        setError(
          "Test payment declined. No money was collected. Your characters and private message are saved.",
        );
      } else
        setError(
          "Payment is still being confirmed. Check your gift status before paying again.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createLink(replace = false) {
    if (!giftId) return;
    setBusy(true);
    setError("");
    try {
      const data = await request(
        `/api/gifts/${encodeURIComponent(giftId)}/link`,
        { replace },
      );
      setLink(data.url);
      setGift(data.gift);
      try {
        sessionStorage.setItem(
          `saved-seat-gift-link:${giftId}`,
          JSON.stringify({ url: data.url, createdAt: data.gift.linkCreatedAt }),
        );
      } catch {}
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      track("share_action_invoked", { method: "copy", placement: "builder" });
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("Select and copy your private gift link below.");
      document.getElementById("gift-ready-link")?.focus();
    }
  }
  async function share() {
    track("share_action_invoked", { method: "native", placement: "builder" });
    try {
      await navigator.share({
        title: "Someone saved you a seat.",
        text: "I saved you a seat. There’s a little surprise waiting for you.",
        url: link,
      });
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        setError(
          "Sharing was unavailable. Copy the private gift link below instead.",
        );
    }
  }
  const titles = [
    <>
      A little reason
      <br />
      <em>to sit together.</em>
    </>,
    <>
      First, a little
      <br />
      <em>bit of you.</em>
    </>,
    <>
      And someone
      <br />
      <em>you love.</em>
    </>,
    <>
      Something good
      <br />
      <em>for the table.</em>
    </>,
    <>
      The part that
      <br />
      <em>is just for them.</em>
    </>,
    <>
      A small surprise.
      <br />
      <em>A very real place.</em>
    </>,
    <>
      One last
      <br />
      <em>place setting.</em>
    </>,
    <>
      Their seat is ready.
      <br />
      <em>Send the surprise.</em>
    </>,
  ];
  return (
    <main className="gift-builder-page" id="main">
      <header className="gift-builder-header">
        <Link href="/" className="gift-builder-brand">
          {brandName}
          <i>.</i>
        </Link>
        <Link href="/">
          <ArrowLeft size={16} /> Back to the table
        </Link>
      </header>
      <div className="gift-builder-layout">
        <aside
          ref={scenePreview}
          className="gift-composer-preview"
          aria-label="Your live gift scene"
        >
          <p className="eyebrow">A SEAT SAVED FOR YOU</p>
          <div
            className="gift-composer-scene"
            role="img"
            aria-label={`${input.senderName || "Your guest"} beside ${input.recipientName || "their suggested guest"} at the dinner table`}
          >
            <div className="gift-scene-chair gift-scene-chair-one">
              <EmptyChair />
            </div>
            <div className="gift-scene-chair gift-scene-chair-two">
              <EmptyChair color="#d6b96f" />
            </div>
            <div className="gift-scene-guest gift-scene-sender">
              <GuestArt customization={input.senderCustomization} />
            </div>
            <div className="gift-scene-guest gift-scene-recipient">
              <GuestArt customization={input.recipientCustomization} />
            </div>
            <div className="gift-scene-cloth" />
            <div className="gift-scene-dish">
              <DishArt dish={input.dish} />
            </div>
            <div className="gift-scene-decoration">
              <DecorationArt
                kind={
                  input.prop === "flowers"
                    ? "flowers"
                    : input.prop === "bread-heart"
                      ? "bread"
                      : input.prop === "cake"
                        ? "candle"
                        : "napkin"
                }
              />
            </div>
            <span className="gift-scene-napkin">
              a little
              <br />
              <em>surprise.</em>
            </span>
            {input.prop === "banner" && (
              <span className="gift-scene-banner">HOORAY FOR YOU</span>
            )}
          </div>
          <h2>
            {input.senderName || "You"} <span>&</span>{" "}
            {input.recipientName || "someone lovely"}
          </h2>
          <p className="gift-preview-caption">
            Two peculiar guests. One very personal invitation.
          </p>
          <div className="gift-preview-meta">
            <span>{occasion.label}</span>
            <span>
              {preparation?.sourceSeatId
                ? `Seats ${preparation.sourceSeatId} + ${preparation.recipientSeatId}`
                : input.sourceSeatId
                  ? `From your seat ${input.sourceSeatId}`
                  : "Two neighboring places"}
            </span>
          </div>
          <p className="gift-private-caption">
            <Heart size={13} /> Your message stays off the public table.
          </p>
        </aside>
        <section
          className="gift-builder-controls"
          aria-labelledby="gift-step-title"
        >
          <div className="gift-step-top">
            <span>
              {step < 6
                ? `${String(step + 1).padStart(2, "0")} / 06`
                : step === 6
                  ? "CONFIRMING YOUR PLACE"
                  : "READY TO SEND"}
            </span>
            {settings?.mode === "development" && (
              <span>DEVELOPMENT · NO REAL CHARGES</span>
            )}
          </div>
          <h1 ref={heading} tabIndex={-1} id="gift-step-title">
            {titles[step]}
          </h1>
          {error && (
            <p className="gift-error" role="alert">
              {error}
            </p>
          )}
          {step === 0 && (
            <>
              <p className="gift-lede">
                Make a tiny illustrated dinner surprise for someone. A place
                beside you, a little celebration, and a message only they can
                open.
              </p>
              <fieldset className="gift-occasion-list">
                <legend>What are we celebrating?</legend>
                {OCCASIONS.map((o) => (
                  <button
                    type="button"
                    key={o.id}
                    aria-pressed={input.occasion === o.id}
                    onClick={() =>
                      update({
                        occasion: o.id,
                        prop: o.prop,
                        dish: o.id === "birthday" ? "cake" : input.dish,
                      })
                    }
                  >
                    <span>
                      <strong>{o.label}</strong>
                      <small>{o.description}</small>
                    </span>
                    {input.occasion === o.id ? (
                      <Check size={17} />
                    ) : (
                      <ArrowRight size={17} />
                    )}
                  </button>
                ))}
              </fieldset>
              <p className="gift-price-note">
                {pair ? (
                  <>
                    Two neighboring guests · {money(pair.amount)} · one-time
                    purchase
                  </>
                ) : (
                  "Fetching the current two-seat price…"
                )}
                {input.sourceSeatId && single && (
                  <small>
                    Already own a place? An eligible paid neighboring seat costs
                    nothing again. An available adjacent chair is{" "}
                    {money(single.amount)}; otherwise we’ll explain an available
                    pair elsewhere before you buy.
                  </small>
                )}
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <p className="gift-lede">
                The person on their invitation. Make yourself as peculiar as you
                feel.
              </p>
              <label htmlFor="gift-sender-name">
                Your display name <small>{input.senderName.length}/30</small>
                <input
                  id="gift-sender-name"
                  maxLength={30}
                  autoComplete="off"
                  value={input.senderName}
                  onChange={(e) => update({ senderName: e.target.value })}
                  placeholder="What do they call you?"
                />
              </label>
              <CharacterControls
                kind="sender"
                value={input.senderCustomization}
                onChange={(c) => update({ senderCustomization: c })}
              />
            </>
          )}
          {step === 2 && (
            <>
              <p className="gift-lede">
                Create a suggested guest for your recipient. They can make it
                their own later, without paying again.
              </p>
              <label htmlFor="gift-recipient-name">
                Their display name{" "}
                <small>{input.recipientName.length}/30</small>
                <input
                  id="gift-recipient-name"
                  maxLength={30}
                  autoComplete="off"
                  value={input.recipientName}
                  onChange={(e) => update({ recipientName: e.target.value })}
                  placeholder="Your favorite person"
                />
              </label>
              <CharacterControls
                kind="recipient"
                value={input.recipientCustomization}
                onChange={(c) => update({ recipientCustomization: c })}
              />
              <p className="gift-fine">
                A suggestion, not an identity. No email, birthday, phone number,
                or account is needed from them to read your surprise.
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <p className="gift-lede">
                Bring a dish, and a tiny bit of ceremony. These illustrated
                touches are included with your gift.
              </p>
              <label htmlFor="gift-dish">
                What are you bringing?
                <select
                  id="gift-dish"
                  value={input.dish}
                  onChange={(e) => update({ dish: e.target.value })}
                >
                  {DISHES.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="gift-prop-options">
                <legend>A little celebration</legend>
                {PROPS.map((p) => (
                  <button
                    type="button"
                    aria-pressed={input.prop === p.id}
                    key={p.id}
                    onClick={() => update({ prop: p.id })}
                  >
                    {p.id === "cake" ? (
                      <DishArt dish="cake" />
                    ) : (
                      <DecorationArt
                        kind={
                          p.id === "flowers"
                            ? "flowers"
                            : p.id === "bread-heart"
                              ? "bread"
                              : "napkin"
                        }
                      />
                    )}
                    <span>{p.label}</span>
                  </button>
                ))}
              </fieldset>
              <p className="gift-fine">
                There is no extra charge for the selected dish or illustrated
                celebration.
              </p>
            </>
          )}
          {step === 4 && (
            <>
              <p className="gift-lede">
                A letter on their plate. Be silly, be heartfelt, be yourself.
                This message is private to anyone holding the secret link.
              </p>
              <label htmlFor="gift-private-message">
                Your private message <small>{input.message.length}/1,000</small>
                <textarea
                  id="gift-private-message"
                  rows={8}
                  maxLength={1000}
                  value={input.message}
                  onChange={(e) => update({ message: e.target.value })}
                  placeholder="Dear you,\n\nI saved you a place because…"
                />
              </label>
              <details className="gift-message-example">
                <summary>A little help finding the words</summary>
                <p className="gift-example-letter">{occasion.example}</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => update({ message: occasion.example })}
                >
                  Use this example
                </button>
                <p className="gift-fine">
                  Nothing is added unless you choose it. Edit it to sound like
                  you.
                </p>
              </details>
              <div className="gift-privacy-note">
                <strong>Private letter. Public little guests.</strong>
                <p>
                  Your message never appears in public profiles, search, social
                  previews, or analytics. Character names and illustrations can
                  become public after moderation. Anyone with the gift link can
                  open the letter; share it thoughtfully.
                </p>
              </div>
            </>
          )}
          {step === 5 && (
            <>
              <p className="gift-lede">
                First, see the little dinner they’ll discover. Then we’ll
                confirm the exact available seats and total before payment.
              </p>
              <button
                type="button"
                className="btn btn-secondary gift-preview-button"
                onClick={() => setPreview(true)}
              >
                <Mail size={17} /> Preview their surprise
              </button>
              <div className="gift-review-letter">
                <span>
                  FOR {input.recipientName}, FROM {input.senderName}
                </span>
                <p>{input.message}</p>
              </div>
              <div className="gift-public-private">
                <p>
                  <strong>Public after moderation:</strong> the guest names,
                  character illustrations and selected dish.
                </p>
                <p>
                  <strong>Private:</strong> your {input.message.length}
                  -character message and gift link. Recipient account
                  registration is needed only to claim and edit their guest.
                </p>
              </div>
              {preparation && (
                <div className="gift-seat-summary">
                  <span>YOUR EXACT PLACE SETTING</span>
                  <strong>
                    {preparation.sourceSeatId} + {preparation.recipientSeatId}
                  </strong>
                  <p>{preparation.explanation}</p>
                  <div>
                    <span>
                      {preparation.packageId === "one"
                        ? "One new adjacent seat"
                        : preparation.packageId === "two"
                          ? "Two new neighboring seats"
                          : "Already-owned neighboring seats"}
                    </span>
                    <b>{money(preparation.amount)}</b>
                  </div>
                  <p>
                    Sender and recipient characters, selected dish, occasion
                    reveal and private letter included. No second payment for
                    the recipient.
                  </p>
                  <p>Exact total · one-time purchase · USD</p>
                  {settings?.packages.find(
                    (p) => p.id === preparation.packageId,
                  )?.taxMinor !== undefined && (
                    <p>
                      Sales tax included:{" "}
                      {money(
                        settings.packages.find(
                          (p) => p.id === preparation.packageId,
                        )?.taxMinor || 0,
                      )}
                      .
                    </p>
                  )}
                </div>
              )}
              <DonationBlurb compact />
              <p className="gift-service-terms">
                Digital customization and display service for{" "}
                {settings?.serviceMonths || 12} months; replayable while the
                service is active unless revoked or made unavailable. Refund
                requests within {settings?.refundDays ?? 14} days.{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer">
                  Display-service terms
                </a>{" "}
                ·{" "}
                <a href="/refunds" target="_blank" rel="noopener noreferrer">
                  Refund policy
                </a>{" "}
                ·{" "}
                <a href="/support" target="_blank" rel="noopener noreferrer">
                  Support
                </a>
                .
              </p>
              <p className="gift-fine">
                {settings?.taxExplanation ||
                  "The final displayed amount includes applicable configured taxes; no extra charges are added."}
              </p>
              {settings?.mode === "development" && (
                <p className="gift-development-note">
                  A practice surprise. Live purchases are disabled, and
                  development controls cannot charge a card. Policy drafts await
                  operator review.
                </p>
              )}
              {user ? (
                <>
                  <p className="gift-verified">
                    <Check size={16} /> Signed in as {user.email}
                  </p>
                  {!preparation ? (
                    <button
                      type="button"
                      className="btn btn-primary gift-next"
                      onClick={() => void prepare()}
                      disabled={busy}
                    >
                      {busy ? (
                        <LoaderCircle size={17} className="spin" />
                      ) : (
                        <>
                          Confirm available seating <ArrowRight size={17} />
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary gift-next"
                      onClick={() => void checkout()}
                      disabled={busy}
                    >
                      {busy ? (
                        <LoaderCircle size={17} className="spin" />
                      ) : (
                        <>
                          Keep these seats — {money(preparation.amount)}{" "}
                          <ArrowRight size={17} />
                        </>
                      )}
                    </button>
                  )}
                </>
              ) : (
                <form onSubmit={signIn} className="gift-auth">
                  <label htmlFor="gift-sender-email">
                    Your email, to keep your gift safe
                    <input
                      id="gift-sender-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={
                        settings?.mode === "development"
                          ? "you@example.test"
                          : "you@example.com"
                      }
                    />
                  </label>
                  <p className="gift-fine">
                    Only the sender signs in before checkout. Your recipient
                    needs no account to open the message.
                  </p>
                  <button className="btn btn-primary" disabled={busy || !email}>
                    {busy ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <>
                        <Mail size={17} /> Send sign-in link
                      </>
                    )}
                  </button>
                  {sent && (
                    <p role="status">
                      Your draft stays here while you sign in.
                    </p>
                  )}
                  {devLink && (
                    <a
                      href={devLink}
                      className="gift-dev-link"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open development sign-in email <ArrowRight size={15} />
                    </a>
                  )}
                  {settings?.mode === "development" && (
                    <p className="gift-fine">
                      Use an @example.test address. This inbox stays local; no
                      external email is sent.
                    </p>
                  )}
                </form>
              )}
            </>
          )}
          {step === 6 && (
            <>
              <p className="gift-lede">
                Your gift is not active until the server confirms payment and
                both exact seats. Returning from checkout never activates it by
                itself.
              </p>
              {orderProvider === "development" ? (
                <div className="gift-test-payment">
                  <p className="gift-development-note">
                    No real card or money is involved. These controls exercise
                    the existing payment and seat-fulfillment system.
                  </p>
                  <p>
                    <strong>Order {orderId?.slice(0, 8)}</strong> ·{" "}
                    {preparation
                      ? money(preparation.amount)
                      : "See your order in your account"}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || !orderId}
                    onClick={() => void pay("paid")}
                  >
                    Complete test payment <Check size={17} />
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    disabled={busy || !orderId}
                    onClick={() => void pay("failed")}
                  >
                    Simulate declined payment
                  </button>
                </div>
              ) : (
                <div>
                  <p role="status">
                    <LoaderCircle size={18} className="spin" /> Checking your
                    gift’s confirmed payment status…
                  </p>
                  {orderProvider === "stripe" && (
                    <button
                      type="button"
                      className="btn btn-primary gift-next"
                      disabled={busy}
                      onClick={() => void resumeCheckout()}
                    >
                      Resume secure checkout <ArrowRight size={17} />
                    </button>
                  )}
                </div>
              )}
              <Link href="/account" className="text-link">
                View my order and gift <ArrowRight size={16} />
              </Link>
            </>
          )}
          {step === 7 && (
            <>
              <p className="gift-lede">
                Their place is confirmed. Now send the secret link. The surprise
                opens only when they choose to join you.
              </p>
              {gift?.isDemo && (
                <p className="gift-development-note">
                  Development gift · no real payment was collected.
                </p>
              )}
              <button
                type="button"
                className="btn btn-secondary gift-preview-button"
                onClick={() => setPreview(true)}
              >
                Preview their surprise <ArrowRight size={17} />
              </button>
              <p className="gift-privacy-note">
                Anyone with this bearer link can read the private letter.
                Opening it does not claim a seat. They choose to sign in only if
                they want to make the guest their own.
              </p>
              {link ? (
                <>
                  <label htmlFor="gift-ready-link">
                    Your private gift link
                    <input
                      id="gift-ready-link"
                      readOnly
                      value={link}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </label>
                  <div className="gift-sharing-actions">
                    {nativeShare && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => void share()}
                      >
                        <Share2 size={17} /> Share the surprise
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void copy()}
                    >
                      {copied ? <Check size={17} /> : <Copy size={17} />}{" "}
                      {copied ? "Link copied" : "Copy gift link"}
                    </button>
                    <a
                      className="btn btn-secondary"
                      href={`/api/og/gift/${giftId}?download=1`}
                      download="a-seat-saved-for-you.png"
                      onClick={() =>
                        track("share_action_invoked", {
                          method: "download",
                          placement: "builder",
                        })
                      }
                    >
                      <Download size={17} /> Download invitation image
                    </a>
                  </div>
                  <p className="gift-share-text">
                    “I saved you a seat. There’s a little surprise waiting for
                    you.”
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void createLink(Boolean(gift?.hasLink))}
                  disabled={busy}
                >
                  {busy ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <>
                      <Mail size={17} />{" "}
                      {gift?.hasLink
                        ? "Replace the private link"
                        : "Create the gift link"}
                    </>
                  )}
                </button>
              )}
              {gift?.hasLink && !link && (
                <p className="gift-fine">
                  We store a hash, not your secret link. If it is no longer on
                  this device, generate a replacement. Any previous link will
                  stop working.
                </p>
              )}
              <p className="gift-service-terms">
                Manage the authored message, revoke or replace the link, and
                find their thank-you in your account. Revocation cannot recall a
                letter already viewed or copied.
              </p>
              <Link href="/account?section=gifts" className="text-link">
                Manage my gifts <ArrowRight size={17} />
              </Link>
              <Link href="/" className="text-link">
                Back to the table <ArrowRight size={17} />
              </Link>
            </>
          )}
          {step < 5 && (
            <div className="gift-step-actions">
              {step > 0 ? (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => go(step - 1)}
                >
                  <ArrowLeft size={16} /> Back
                </button>
              ) : (
                <span />
              )}
              <button type="button" className="btn btn-primary" onClick={next}>
                {step === 4 ? "Preview the surprise" : "Continue"}{" "}
                <ArrowRight size={17} />
              </button>
            </div>
          )}
          {step === 5 && !busy && (
            <button
              type="button"
              className="text-link gift-edit-letter"
              onClick={() => go(4)}
            >
              <ArrowLeft size={16} /> Edit the private message
            </button>
          )}
          {step < 6 && (
            <p className="gift-draft-note">
              Your draft is saved on this device for up to seven days. Shared
              device? Clear the draft when you’re finished.{" "}
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem(DRAFT_KEY);
                  } catch {}
                  setInput({ ...INITIAL });
                  setGiftId(undefined);
                  setGift(null);
                  setPreparation(null);
                  setOrderId(undefined);
                  setOrderProvider(null);
                  initialDraft.current = null;
                  loaded.current = false;
                  setStep(0);
                  setLink("");
                  setError("");
                }}
              >
                Start a new draft
              </button>
            </p>
          )}
        </section>
      </div>
      {preview && (
        <Modal
          title="Preview the gift experience"
          className="gift-preview-modal"
          onClose={() => setPreview(false)}
        >
          <GiftReveal
            gift={previewGift}
            preview
            onClose={() => setPreview(false)}
          />
        </Modal>
      )}
    </main>
  );
}
