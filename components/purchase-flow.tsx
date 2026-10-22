"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Armchair,
  Check,
  LoaderCircle,
  Mail,
  ShieldCheck,
  Shuffle,
  X,
} from "lucide-react";
import {
  GuestArt,
  DishArt,
  DecorationArt,
  EmptyChair,
  BASES,
  ACCESSORIES,
  OUTFITS,
  DISHES,
  SKIN_TONES,
} from "./art/illustrations";
import Modal from "./modal";
import DonationBlurb from "./donation-blurb";
import PostPurchaseMoment from "./post-purchase-moment";
import { getAttribution, track } from "./journey-events";
import "./guest-builder.css";

type Customization = {
  base: string;
  accessory: string;
  outfit: string;
  skin: string;
  color: string;
};
type Profile = {
  displayName: string;
  message: string;
  dish: string;
  customization: Customization;
  link: string;
};
type PackageId = "one" | "two" | "six" | "celebration";
type Package = {
  id: PackageId;
  count: number;
  amount: number;
  label: string;
  taxMinor?: number;
  taxesIncluded?: boolean;
};
type Neighborhood = {
  id: string;
  name: string;
  startSeat: number;
  endSeat: number;
  color: string;
};
type Guest = {
  isDemo?: boolean;
  kind?: string;
  seatId: number;
  displayName: string;
  customization: Customization;
  dish: string;
};
type Settings = {
  packages: Package[];
  neighborhoods: Neighborhood[];
  mode: string;
  serviceMonths: number;
  refundDays: number;
  supportEmail: string | null;
  taxExplanation?: string;
};
type Draft = {
  version: number;
  savedAt: number;
  step: number;
  profile: Profile;
  packageId: PackageId;
  seatIds: number[];
  near: number;
  invitationToken?: string;
  orderId?: string;
};
const DRAFT_KEY = "dinner-draft";
const INITIAL_PROFILE: Profile = {
  displayName: "",
  message: "Here for the company. Staying for the bread.",
  dish: "spaghetti",
  customization: {
    base: "human",
    accessory: "none",
    outfit: "signature",
    skin: "#dca276",
    color: "#b6b98e",
  },
  link: "",
};
const packageDescriptions: Record<
  string,
  { title: string; description: string }
> = {
  one: {
    title: "A wonderfully strange you.",
    description: "One guest. Your own little place at the table.",
  },
  two: {
    title: "You + your favorite weirdo.",
    description: "Two neighboring seats. Two characters. One invitation.",
  },
  six: {
    title: "Your whole dinner party.",
    description:
      "Six neighboring seats. Invite five friends to claim their paid places.",
  },
  celebration: {
    title: "A reason to celebrate.",
    description:
      "Six neighboring seats, five paid invitations, and celebration decorations.",
  },
};
const money = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount / 100);
const random = <T,>(items: readonly T[]) =>
  items[Math.floor(Math.random() * items.length)];
function validLink(link: string) {
  if (!link) return true;
  try {
    const u = new URL(link);
    return (
      ["https:", "http:"].includes(u.protocol) && !u.username && !u.password
    );
  } catch {
    return false;
  }
}
async function api(path: string, body?: unknown) {
  const response = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : data.message ||
            "That didn’t quite work. Your guest draft is safe; please try again.",
    );
  return data;
}
function restoredProfile(value: unknown): Profile | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Partial<Profile>;
  const c = p.customization;
  if (!c || !BASES.some((x) => x.id === c.base)) return null;
  return {
    displayName:
      typeof p.displayName === "string" ? p.displayName.slice(0, 30) : "",
    message: typeof p.message === "string" ? p.message.slice(0, 140) : "",
    dish: DISHES.some((x) => x.id === p.dish) ? p.dish! : "spaghetti",
    link: typeof p.link === "string" ? p.link.slice(0, 500) : "",
    customization: {
      base: c.base,
      accessory: ACCESSORIES.some((x) => x.id === c.accessory)
        ? c.accessory
        : "none",
      outfit: OUTFITS.some((x) => x.id === c.outfit) ? c.outfit : "signature",
      skin: /^#[0-9a-f]{6}$/i.test(c.skin || "") ? c.skin : "#dca276",
      color: /^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : "#b6b98e",
    },
  };
}

export default function PurchaseFlow({
  initialSeat,
  onClose,
  onComplete,
}: {
  initialSeat?: number;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>(INITIAL_PROFILE);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [packageId, setPackageId] = useState<PackageId>("one");
  const [seatIds, setSeatIds] = useState<number[]>([]);
  const [near, setNear] = useState(initialSeat || 1);
  const [invitationToken, setInvitationToken] = useState<string | undefined>();
  const [invitationNotice, setInvitationNotice] = useState("");
  const [neighbors, setNeighbors] = useState<Guest[]>([]);
  const [inventory, setInventory] = useState<Record<number, string>>({});
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState("");
  const [orderId, setOrderId] = useState<string | undefined>();
  const [complete, setComplete] = useState(false);
  const opened = useRef(false);
  const regionRequest = useRef(0);
  const pack = settings?.packages.find((p) => p.id === packageId);
  const primarySeat = seatIds[0];
  const neighborhood = settings?.neighborhoods.find(
    (n) =>
      (primarySeat || near) >= n.startSeat &&
      (primarySeat || near) <= n.endSeat,
  );
  const humanSkin = [
    "human",
    "astronaut",
    "grandma",
    "detective",
    "vampire",
  ].includes(profile.customization.base);

  async function loadSettings() {
    const data = await api("/api/config");
    if (
      !Array.isArray(data.packages) ||
      !data.packages.some((p: Package) => p.id === "one")
    )
      throw new Error(
        "Seating prices are unavailable. You can keep designing while we reconnect.",
      );
    setSettings(data);
    return data as Settings;
  }
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let token = params.get("invite") || undefined;
    try {
      const draft = JSON.parse(
        localStorage.getItem(DRAFT_KEY) || "null",
      ) as Draft | null;
      const p = restoredProfile(draft?.profile);
      if (draft && p && Date.now() - draft.savedAt < 86400000) {
        setProfile(p);
        const savedId = ["one", "two", "six", "celebration"].includes(
          draft.packageId,
        )
          ? draft.packageId
          : "one";
        setPackageId(savedId);
        const ids = Array.isArray(draft.seatIds)
          ? draft.seatIds.filter(
              (id) => Number.isInteger(id) && id >= 1 && id <= 10000,
            )
          : [];
        if (!initialSeat) setSeatIds(ids);
        const nextNear = initialSeat || draft.near || ids[0] || 1;
        setNear(Math.max(1, Math.min(10000, nextNear)));
        token ||= draft.invitationToken;
        if (draft.version === 2) {
          setStep(
            params.has("checkout") && ids.length
              ? 3
              : Math.max(0, Math.min(4, draft.step || 0)),
          );
          setOrderId(draft.orderId);
        }
      }
    } catch {
      /* An invalid local draft never changes server data. */
    }
    setInvitationToken(token);
    setHydrated(true);
    loadSettings().catch((e) => setError((e as Error).message));
    api("/api/me")
      .then((data) => setUser(data.user || null))
      .catch(() => {});
    if (!opened.current) {
      opened.current = true;
      track("builder_opened", { stage: 0 });
    }
  }, []);
  useEffect(() => {
    if (!hydrated || complete) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          version: 2,
          savedAt: Date.now(),
          step,
          profile,
          packageId,
          seatIds,
          near,
          invitationToken,
          orderId,
        } satisfies Draft),
      );
    } catch {
      /* The active draft still works if browser storage is unavailable. */
    }
  }, [
    hydrated,
    complete,
    step,
    profile,
    packageId,
    seatIds,
    near,
    invitationToken,
    orderId,
  ]);
  useEffect(() => {
    if (!sent || user) return;
    const timer = setInterval(
      () =>
        api("/api/me")
          .then((data) => {
            if (data.user) {
              setUser(data.user);
              setSent(false);
            }
          })
          .catch(() => {}),
      2000,
    );
    return () => clearInterval(timer);
  }, [sent, user]);
  useEffect(() => {
    if (!primarySeat) {
      setNeighbors([]);
      setInventory({});
      return;
    }
    const controller = new AbortController();
    const start = Math.max(1, primarySeat - 4);
    const end = Math.min(10000, Math.max(...seatIds) + 4);
    fetch(`/api/table?start=${start}&end=${end}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        setNeighbors(data.guests || []);
        setInventory(
          Object.fromEntries(
            (data.seats || []).map((s: { seatId: number; state: string }) => [
              s.seatId,
              s.state,
            ]),
          ),
        );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [seatIds, primarySeat]);
  useEffect(() => {
    if (step !== 4 || !orderId || !user) return;
    api(`/api/orders/${encodeURIComponent(orderId)}`)
      .then((data) => {
        if (data.status === "paid") return confirmFulfilled(orderId);
        else if (
          ["failed", "expired", "refunded", "disputed"].includes(data.status)
        ) {
          setOrderId(undefined);
          setStep(3);
        }
      })
      .catch(() => {});
  }, [step, orderId, user]);

  function customize(key: keyof Customization, value: string) {
    setProfile((p) => ({
      ...p,
      customization: { ...p.customization, [key]: value },
    }));
  }
  function surprise() {
    const choices = [
      {
        base: "raccoon",
        accessory: "none",
        outfit: "suit",
        dish: "fries",
        color: "#776074",
      },
      {
        base: "grandma",
        accessory: "sunglasses",
        outfit: "cardigan",
        dish: "cake",
        color: "#d7503e",
      },
      {
        base: "astronaut",
        accessory: "none",
        outfit: "signature",
        dish: "soup",
        color: "#9caebd",
      },
      {
        base: "plant",
        accessory: "bow",
        outfit: "bowtie",
        dish: "salad",
        color: "#9baf8d",
      },
      {
        base: "vampire",
        accessory: "beret",
        outfit: "turtleneck",
        dish: "garlic-bread",
        color: "#776074",
      },
      {
        base: "frog",
        accessory: "crown",
        outfit: "bowtie",
        dish: "olives",
        color: "#9baf8d",
      },
      {
        base: "human",
        accessory: "curls",
        outfit: "knit",
        dish: "pancakes",
        color: "#eed989",
      },
      {
        base: "mushroom",
        accessory: "none",
        outfit: "overalls",
        dish: "dumplings",
        color: "#9caebd",
      },
    ];
    const idea = random(choices);
    setProfile((p) => ({
      ...p,
      dish: idea.dish,
      customization: {
        base: idea.base,
        accessory: idea.accessory,
        outfit: idea.outfit,
        color: idea.color,
        skin: random(SKIN_TONES).id,
      },
    }));
  }
  function finishCharacter() {
    if (!profile.displayName.trim()) {
      setError("Give your dinner guest a name (up to 30 characters).");
      return;
    }
    if (!validLink(profile.link)) {
      setError("Use an HTTP or HTTPS link without a username or password.");
      return;
    }
    setError("");
    track("customization_completed", { stage: 0 });
    setStep(1);
  }
  async function selectSeats(id: PackageId = packageId, advance = true) {
    const chosen = settings?.packages.find((p) => p.id === id);
    if (!chosen) {
      setError("Please wait for the current seat prices.");
      return false;
    }
    const request = ++regionRequest.current;
    setBusy(true);
    setError("");
    try {
      let ids: number[];
      if (invitationToken && chosen.count === 1) {
        const invite = await api(
          `/api/invitations/${encodeURIComponent(invitationToken)}`,
        );
        if (invite.type !== "courtesy")
          throw new Error(
            "This is an already-paid invitation. Return to the invitation page to claim it without buying again.",
          );
        const target = invite.availableSeatId || invite.targetSeatId;
        if (!target) throw new Error("No nearby place is available right now.");
        ids = [target];
        setInvitationNotice(
          invite.expired
            ? `The original invitation hold has expired. Seat ${target} is offered nearby instead. Review this exact place before checkout.`
            : `Seat ${target} has a courtesy hold until ${new Date(invite.expiresAt).toLocaleString()}. This is a separate purchase, not a paid group seat.`,
        );
      } else {
        const data = await api(
          `/api/available?count=${chosen.count}&near=${primarySeat || near}`,
        );
        ids = data.seatIds;
      }
      if (!Array.isArray(ids) || ids.length !== chosen.count)
        throw new Error(
          "Those places aren’t available together. Try another part of the table.",
        );
      if (request !== regionRequest.current) return false;
      if (primarySeat && primarySeat !== ids[0])
        setInvitationNotice(
          `To keep your ${chosen.count} places together, the available selection moved from seat ${primarySeat} to seat ${ids[0]}. Review the exact seats below before continuing.`,
        );
      setSeatIds(ids);
      setPackageId(id);
      track("seat_selected", { seatId: ids[0], count: ids.length });
      if (advance) setStep(2);
      return true;
    } catch (e) {
      if (request === regionRequest.current) setError((e as Error).message);
      return false;
    } finally {
      if (request === regionRequest.current) setBusy(false);
    }
  }
  async function choosePackage(id: PackageId) {
    if (id === packageId && seatIds.length === pack?.count) return;
    const okay = await selectSeats(id, false);
    if (okay)
      track("package_selected", {
        packageId: id,
        count: settings?.packages.find((p) => p.id === id)?.count || 1,
      });
  }
  async function signIn() {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/sign-in/magic-link", {
        email,
        callbackURL: `${location.origin}/?checkout=1`,
      });
      setSent(true);
      if (settings?.mode === "development") {
        const data = await api(
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
  async function checkout() {
    if (!pack || seatIds.length !== pack.count) {
      setStep(2);
      setError("Review the current package and exact seats before checkout.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/checkout", {
        packageId,
        seatIds,
        profile,
        invitationToken,
        expectedAmount: pack.amount,
        attribution: getAttribution(),
      });
      setOrderId(data.orderId);
      track("checkout_started", {
        packageId,
        seatId: seatIds[0],
        count: seatIds.length,
      });
      if (data.url) {
        location.href = data.url;
        return;
      }
      setStep(4);
    } catch (e) {
      setError((e as Error).message);
      loadSettings().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function confirmFulfilled(id: string) {
    const [saved, mine] = await Promise.all([
      api(`/api/orders/${encodeURIComponent(id)}`),
      api("/api/me"),
    ]);
    const ids = saved.seatIds as number[];
    if (
      saved.status !== "paid" ||
      !Array.isArray(ids) ||
      !ids.length ||
      !ids.every((seatId) =>
        mine.seats?.some(
          (s: { seatId: number; state: string }) =>
            s.seatId === seatId && s.state === "purchased",
        ),
      )
    )
      throw new Error(
        "Your payment is still being confirmed. Your order and character are safe in your account.",
      );
    setSeatIds(ids);
    setOrderId(id);
    setComplete(true);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    onComplete();
  }
  async function developmentPayment(outcome: "paid" | "failed") {
    if (!orderId) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/dev/pay", { orderId, outcome });
      if (outcome === "paid") await confirmFulfilled(orderId);
      else {
        setOrderId(undefined);
        setStep(3);
        setError(
          "Test payment declined. No money was charged. Your guest and seating draft are saved.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectedDescription = packageDescriptions[packageId];
  const publicNeighbor = (id: number) =>
    neighbors.find((g) => g.seatId === id && !seatIds.includes(id));
  const previewNeighborIds = primarySeat
    ? [primarySeat - 2, primarySeat + 2].map((id) =>
        id > 0 && id <= 10000 ? id : undefined,
      )
    : [];
  const confirmationReady = !!pack && seatIds.length === pack.count;

  return (
    <Modal
      title="Create your dinner guest"
      onClose={onClose}
      className={`purchase-modal guest-builder ${complete ? "guest-builder-complete" : ""}`}
    >
      {complete && orderId ? (
        <PostPurchaseMoment
          orderId={orderId}
          profile={profile}
          seatIds={seatIds}
          packageId={packageId}
          onClose={onClose}
        />
      ) : (
        <>
          <aside
            className="guest-live-preview"
            aria-label="Live preview of your dinner guest and neighboring chairs"
          >
            <p className="eyebrow">
              {primarySeat
                ? `${neighborhood?.name || "THE SHARED TABLE"} · SEAT ${primarySeat}`
                : "ONE TABLE. A PLACE FOR YOUR KIND OF WEIRD."}
            </p>
            <button
              className="icon-button preview-close-button"
              aria-label="Close dialog"
              onClick={onClose}
            >
              <X size={20} />
            </button>
            <div className="guest-preview-world">
              <div className="preview-dinner-cloth" />
              {([-1, 1] as const).map((side, index) => {
                const id = previewNeighborIds[index];
                const neighbor = id ? publicNeighbor(id) : undefined;
                const included = !!id && seatIds.includes(id);
                return (
                  <div
                    className={`preview-neighbor preview-neighbor-${side < 0 ? "left" : "right"}`}
                    key={side}
                  >
                    {neighbor ? (
                      <GuestArt
                        customization={neighbor.customization}
                        variant={neighbor.seatId}
                      />
                    ) : (
                      <EmptyChair />
                    )}
                    <span>
                      {neighbor
                        ? neighbor.isDemo || neighbor.kind === "demo"
                          ? `Demo · ${neighbor.displayName}`
                          : neighbor.kind === "complimentary"
                            ? `Founding guest · ${neighbor.displayName}`
                            : neighbor.displayName
                        : included
                          ? "Your friend’s paid place"
                          : id && inventory[id] && inventory[id] !== "available"
                            ? "Quietly reserved"
                            : primarySeat
                              ? `Seat ${id || "nearby"}`
                              : "Someone you’ll meet"}
                    </span>
                    {neighbor && <DishArt dish={neighbor.dish} />}
                  </div>
                );
              })}
              <div className="preview-primary-chair">
                <EmptyChair />
              </div>
              <div className="preview-primary-guest">
                <GuestArt customization={profile.customization} />
              </div>
              <div className="preview-primary-dish">
                <DishArt dish={profile.dish} />
              </div>
              <div className="preview-flowers">
                <DecorationArt kind="flowers" />
              </div>
              <div className="preview-folded-napkin">
                <DecorationArt kind="napkin" />
              </div>
              {packageId === "celebration" && (
                <div className="preview-candle">
                  <DecorationArt kind="candle" />
                </div>
              )}
            </div>
            <h3>{profile.displayName || "A wonderfully strange you."}</h3>
            <p className="preview-caption-copy">
              {primarySeat
                ? `Your exact place: ${seatIds.map((id) => `#${id}`).join(" · ")}`
                : "Your character first. Your place at the table next."}
            </p>
            {seatIds.length > 1 && (
              <div
                className="group-seat-preview"
                aria-label={`${seatIds.length} selected adjacent seats`}
              >
                {seatIds.map((id, i) => (
                  <div key={id} className={i === 0 ? "your-group-seat" : ""}>
                    {i === 0 ? (
                      <GuestArt customization={profile.customization} />
                    ) : (
                      <EmptyChair />
                    )}
                    <span>#{id}</span>
                    <small>{i === 0 ? "You" : "Paid invitation"}</small>
                  </div>
                ))}
              </div>
            )}
            <p className="preview-honesty">
              {primarySeat
                ? "Nearby profiles mirror the published table. Demonstration guests are labeled; availability is checked again at checkout."
                : "Preview illustration. No seat is held while you design."}
            </p>
          </aside>
          <section className="builder-form guest-builder-content">
            <div className="builder-step">
              <span>{step < 4 ? `0${step + 1} / 04` : "TEST CHECKOUT"}</span>
              <span>
                {settings?.mode === "development"
                  ? "DEVELOPMENT · NO REAL CHARGES"
                  : "YOUR LITTLE PLACE AT THE TABLE"}
              </span>
            </div>
            {step === 0 && (
              <>
                <p className="eyebrow">COME AS YOUR PECULIAR SELF</p>
                <h2>
                  Create your
                  <br />
                  <em>dinner guest.</em>
                </h2>
                <p className="builder-description">
                  Be a tired astronaut, a business raccoon, or something
                  entirely you. No account needed to make a little weird.
                </p>
                <div className="builder-choice-heading">
                  <span className="field-label">Character base</span>
                  <button
                    className="text-link surprise-button"
                    onClick={surprise}
                  >
                    <Shuffle size={15} />
                    Surprise me
                  </button>
                </div>
                <div
                  className="character-base-options"
                  role="group"
                  aria-label="Character base"
                >
                  {BASES.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      title={b.label}
                      aria-label={b.label}
                      aria-pressed={profile.customization.base === b.id}
                      className={
                        profile.customization.base === b.id ? "chosen" : ""
                      }
                      onClick={() => customize("base", b.id)}
                    >
                      <GuestArt
                        customization={{ ...profile.customization, base: b.id }}
                      />
                    </button>
                  ))}
                </div>
                {humanSkin ? (
                  <fieldset className="skin-tone-field">
                    <legend>Skin tone</legend>
                    <div
                      className="color-options"
                      role="group"
                      aria-label="Skin tone"
                    >
                      {SKIN_TONES.map((t) => (
                        <button
                          type="button"
                          key={t.id}
                          aria-label={`${t.label} skin tone`}
                          aria-pressed={profile.customization.skin === t.id}
                          title={t.label}
                          style={{ background: t.id }}
                          className={
                            profile.customization.skin === t.id ? "chosen" : ""
                          }
                          onClick={() => customize("skin", t.id)}
                        />
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <p className="fine-print guest-natural-palette">
                    This guest brings its own peculiar natural palette.
                  </p>
                )}
                <div className="form-row">
                  <label className="field">
                    Hair or head accessory
                    <select
                      className="input"
                      value={profile.customization.accessory}
                      onChange={(e) => customize("accessory", e.target.value)}
                    >
                      {ACCESSORIES.map((o) => (
                        <option value={o.id} key={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Outfit
                    <select
                      className="input"
                      value={profile.customization.outfit}
                      onChange={(e) => customize("outfit", e.target.value)}
                    >
                      {OUTFITS.map((o) => (
                        <option value={o.id} key={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  What are you bringing?
                  <select
                    className="input"
                    value={profile.dish}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, dish: e.target.value }))
                    }
                  >
                    {DISHES.map((o) => (
                      <option value={o.id} key={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Your dinner-table name{" "}
                  <span className="input-count">
                    {profile.displayName.length}/30
                  </span>
                  <input
                    className="input"
                    placeholder="Captain Overthink"
                    maxLength={30}
                    value={profile.displayName}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, displayName: e.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  A short dinner message{" "}
                  <span className="input-count">
                    {profile.message.length}/140
                  </span>
                  <textarea
                    className="input"
                    rows={2}
                    maxLength={140}
                    value={profile.message}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, message: e.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  A little more about you{" "}
                  <span className="optional-label">Optional link</span>
                  <input
                    className="input"
                    type="url"
                    inputMode="url"
                    placeholder="https://your-little-corner.example"
                    maxLength={500}
                    value={profile.link}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, link: e.target.value }))
                    }
                  />
                </label>
                <button
                  className="btn btn-primary builder-next"
                  onClick={finishCharacter}
                >
                  Find my place <ArrowRight size={17} />
                </button>
                <p className="fine-print builder-draft-note">
                  <Check size={12} />
                  Your guest is saved on this device as you go.
                </p>
              </>
            )}
            {step === 1 && (
              <>
                <p className="eyebrow">PULL UP A CHAIR</p>
                <h2>
                  Find your
                  <br />
                  <em>little neighborhood.</em>
                </h2>
                <p className="builder-description">
                  One shared table, with a few familiar corners. Choose where
                  you’d like your guest to sit.
                </p>
                <label className="field" htmlFor="your-neighborhood">
                  Your neighborhood
                  <select
                    className="input"
                    id="your-neighborhood"
                    value={
                      settings?.neighborhoods.find(
                        (n) => near >= n.startSeat && near <= n.endSeat,
                      )?.id || ""
                    }
                    onChange={(e) => {
                      const n = settings?.neighborhoods.find(
                        (n) => n.id === e.target.value,
                      );
                      if (n) {
                        setNear(n.startSeat);
                        setSeatIds([]);
                      }
                    }}
                  >
                    <option value="" disabled>
                      Choose a neighborhood
                    </option>
                    {settings?.neighborhoods.map((n) => (
                      <option value={n.id} key={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field" htmlFor="near-seat">
                  Find a place near seat
                  <input
                    className="input large-seat-input"
                    id="near-seat"
                    type="number"
                    min={1}
                    max={10000}
                    value={near}
                    onChange={(e) => {
                      setNear(
                        Math.max(
                          1,
                          Math.min(10000, Number(e.target.value) || 1),
                        ),
                      );
                      setSeatIds([]);
                    }}
                  />
                </label>
                <div className="selection-summary">
                  <Armchair size={26} />
                  <p>
                    <strong>A seat with your own permanent number.</strong>
                    <span>
                      Pick your company next. No payment or sign-in yet.
                    </span>
                  </p>
                </div>
                {invitationToken && (
                  <p className="invitation-seat-notice">
                    You arrived with an invitation. We’ll check its hold and
                    explain whether a separate purchase is needed before
                    checkout.
                  </p>
                )}
                <button
                  className="btn btn-primary builder-next"
                  onClick={() => void selectSeats()}
                  disabled={busy || !settings}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <>
                      See me at the table <ArrowRight size={17} />
                    </>
                  )}
                </button>
                <p className="fine-print">
                  Browsing does not reserve a chair. Checkout rechecks
                  availability and secures every selected seat together.
                </p>
              </>
            )}
            {step === 2 && (
              <>
                <p className="eyebrow">A LITTLE ROOM FOR SOMEONE YOU LOVE</p>
                <h2>
                  Good dinner.
                  <br />
                  <em>Better together.</em>
                </h2>
                <p className="builder-description">
                  That’s you at the actual table. Come solo, or make a place for
                  your favorite kind of company.
                </p>
                <div
                  className="package-options"
                  role="group"
                  aria-label="Choose your seat package"
                >
                  {settings?.packages.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className={`package-option ${p.id === packageId ? "chosen" : ""} ${p.id === "two" ? "pair-package" : ""}`}
                      aria-pressed={p.id === packageId}
                      onClick={() => void choosePackage(p.id)}
                      disabled={busy}
                    >
                      <span className="radio-indicator">
                        {p.id === packageId && <span />}
                      </span>
                      <span>
                        <strong>
                          {packageDescriptions[p.id]?.title || p.label}
                        </strong>
                        <small>
                          {packageDescriptions[p.id]?.description ||
                            `${p.count} seats`}
                        </small>
                        {p.id === "two" && (
                          <span className="pair-package-note">
                            A good excuse to bring someone.
                          </span>
                        )}
                      </span>
                      <b>{money(p.amount)}</b>
                    </button>
                  ))}
                </div>
                {!settings && (
                  <p className="muted">Fetching the current seating prices…</p>
                )}
                {packageId === "two" && (
                  <aside className="builder-gift-option">
                    <strong>A little surprise for someone?</strong>
                    <p>
                      The personalized gift experience is included in this
                      two-seat package. Create their suggested guest and tuck a
                      private letter beside them.
                    </p>
                    <Link
                      href="/save-a-seat?from=builder"
                      className="text-link"
                    >
                      Save a seat for someone <ArrowUpRight size={15} />
                    </Link>
                  </aside>
                )}

                <div className="exact-seat-review" aria-live="polite">
                  <span>YOUR EXACT SEATS</span>
                  <strong>
                    {seatIds.map((id) => `#${id}`).join(" · ") ||
                      "Choose an available place"}
                  </strong>
                  <small>
                    {pack && pack.count > 1
                      ? `${pack.count} neighboring chairs, secured together at checkout. Friends claim their paid seat without paying again.`
                      : "One guest and one place at the shared table."}
                  </small>
                </div>
                <DonationBlurb compact />
                {pack && (
                  <button
                    className="btn btn-primary builder-next"
                    disabled={busy || !confirmationReady}
                    onClick={() => {
                      track("package_selected", {
                        packageId,
                        count: pack.count,
                      });
                      setStep(3);
                      setError("");
                    }}
                  >
                    Keep this seat — {money(pack.amount)}{" "}
                    <ArrowRight size={17} />
                  </button>
                )}
                <p className="fine-print">
                  One-time purchase in USD. {settings?.serviceMonths || 12}{" "}
                  months of digital display service. No subscription, property,
                  or investment rights.
                </p>
              </>
            )}
            {step === 3 && (
              <>
                <p className="eyebrow">MAKE YOURSELF COMFORTABLE</p>
                <h2>
                  Your guest.
                  <br />
                  <em>Your place.</em>
                </h2>
                {pack && (
                  <div className="checkout-summary">
                    <div>
                      <span>{selectedDescription?.title || pack.label}</span>
                      <strong>{money(pack.amount)}</strong>
                    </div>
                    <p>
                      {pack.count} {pack.count === 1 ? "guest" : "guests"} ·
                      Seats {seatIds.join(", ")} · USD
                    </p>
                    <p>
                      {pack.count > 1
                        ? `${pack.count - 1} already-paid invitation${pack.count > 2 ? "s" : ""} included. No second payment for invited friends.`
                        : "A nearby courtesy invitation is available after purchase; that friend’s seat is a separate purchase."}
                    </p>
                    {Number.isInteger(pack.taxMinor) && (
                      <p className="checkout-included-tax">
                        Sales tax included in this total:{" "}
                        {money(pack.taxMinor || 0)} USD.
                      </p>
                    )}
                    <div className="checkout-total-line">
                      <span>Exact total · one-time purchase</span>
                      <b>{money(pack.amount)}</b>
                    </div>
                    <p>
                      {settings?.taxExplanation ||
                        (settings?.mode === "development"
                          ? "Sales tax: $0.00 in this development checkout. No real money is collected."
                          : "No additional tax is added to this displayed total. The operator’s approved tax treatment must be configured before live sales.")}
                    </p>
                  </div>
                )}
                <p className="service-terms">
                  Your purchase is a digital guest customization and display
                  service for{" "}
                  <strong>{settings?.serviceMonths || 12} months</strong>.
                  Refund requests within{" "}
                  <strong>{settings?.refundDays ?? 14} days</strong>.{" "}
                  <a href="/refunds" target="_blank" rel="noopener noreferrer">
                    Refund policy
                  </a>{" "}
                  ·{" "}
                  <a href="/terms" target="_blank" rel="noopener noreferrer">
                    Display-service terms
                  </a>{" "}
                  ·{" "}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer">
                    Privacy
                  </a>
                </p>
                <p className="checkout-support">
                  Need a hand?{" "}
                  {settings?.supportEmail ? (
                    <a href={`mailto:${settings.supportEmail}`}>
                      {settings.supportEmail}
                    </a>
                  ) : (
                    <a
                      href="/support"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Contact the hosts
                    </a>
                  )}
                  {!settings?.supportEmail && (
                    <span>
                      {" "}
                      A public support address is not configured; live purchases
                      remain disabled.
                    </span>
                  )}
                </p>
                <DonationBlurb compact />
                {settings?.mode === "development" && (
                  <div className="development-notice">
                    <ShieldCheck size={20} />
                    <span>
                      <strong>A practice dinner.</strong> Live purchases are
                      disabled. This development checkout cannot charge a card.
                      The service and refund policies are drafts awaiting
                      operator approval.
                    </span>
                  </div>
                )}
                {user ? (
                  <div className="verified-account">
                    <Check size={18} />
                    <span>
                      Signed in as <strong>{user.email}</strong>
                    </span>
                  </div>
                ) : (
                  <div className="checkout-auth">
                    <label className="field" htmlFor="checkout-email">
                      Your email. Just a little link to let you in.
                      <input
                        className="input"
                        type="email"
                        autoComplete="email"
                        id="checkout-email"
                        placeholder={
                          settings?.mode === "development"
                            ? "you@example.test"
                            : "you@example.com"
                        }
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>
                    <button
                      className="btn btn-secondary"
                      disabled={busy || !email}
                      onClick={() => void signIn()}
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={17} />
                      ) : (
                        <Mail size={17} />
                      )}
                      Send sign-in link
                    </button>
                    {sent && (
                      <p className="fine-print" role="status">
                        Your link is ready. Your character and exact-seat
                        preview stay saved while you sign in.
                      </p>
                    )}
                    {devLink && (
                      <a
                        className="development-inbox-link"
                        href={devLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open development sign-in email{" "}
                        <ArrowUpRight size={15} />
                      </a>
                    )}
                    {settings?.mode === "development" && (
                      <p className="fine-print">
                        Use an @example.test address. The development inbox
                        stays local; no email is sent.
                      </p>
                    )}
                  </div>
                )}
                <p className="fine-print">
                  By continuing you accept the display-service terms and table
                  manners. New guests await human moderation before public
                  display. Your private arrival preview appears after confirmed
                  fulfillment.
                </p>
                <button
                  className="btn btn-primary builder-next"
                  disabled={!user || busy || !confirmationReady}
                  onClick={() => void checkout()}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <>
                      {settings?.mode === "development"
                        ? "Continue to test checkout"
                        : `Pay once — ${pack ? money(pack.amount) : "…"}`}{" "}
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>
              </>
            )}
            {step === 4 && (
              <>
                <p className="eyebrow">DEVELOPMENT CHECKOUT</p>
                <h2>
                  A test payment.
                  <br />
                  <em>A complete welcome.</em>
                </h2>
                <div className="development-notice">
                  <ShieldCheck size={23} />
                  <span>
                    <strong>No payment provider connected.</strong> These
                    controls exercise server-confirmed fulfillment and inventory
                    without collecting money or card details.
                  </span>
                </div>
                <div className="checkout-summary">
                  <div>
                    <span>{selectedDescription?.title || pack?.label}</span>
                    <strong>
                      {pack ? money(pack.amount) : "Loading current price…"}
                    </strong>
                  </div>
                  <p>
                    Order {orderId?.slice(0, 8)} · exact seats{" "}
                    {seatIds.join(", ")}
                  </p>
                </div>
                <p className="builder-description">
                  Complete the development payment to see your guest settle in,
                  then make an invitation for someone beside you.
                </p>
                <button
                  className="btn btn-primary builder-next"
                  disabled={busy || !orderId}
                  onClick={() => void developmentPayment("paid")}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <>
                      Complete test payment <Check size={18} />
                    </>
                  )}
                </button>
                <button
                  className="btn btn-secondary builder-next"
                  disabled={busy || !orderId}
                  onClick={() => void developmentPayment("failed")}
                >
                  Test a declined payment
                </button>
                <p className="fine-print">
                  In production, hosted Stripe Checkout confirms payment through
                  signed events. A success redirect never publishes a guest or
                  proves fulfillment.
                </p>
                <a className="text-link" href="/account">
                  Check my saved order <ArrowUpRight size={14} />
                </a>
              </>
            )}
            {invitationNotice && step > 0 && (
              <p className="invitation-seat-notice" role="status">
                {invitationNotice}
              </p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
                {!settings && (
                  <button
                    className="text-link"
                    onClick={() =>
                      loadSettings()
                        .then(() => setError(""))
                        .catch((e) => setError((e as Error).message))
                    }
                  >
                    Reconnect to seating prices
                  </button>
                )}
              </p>
            )}
            {step > 0 && step < 4 && (
              <button
                className="builder-back text-link"
                onClick={() => {
                  setStep((s) => s - 1);
                  setError("");
                }}
              >
                <ArrowLeft size={14} />A step back
              </button>
            )}
          </section>
        </>
      )}
    </Modal>
  );
}
