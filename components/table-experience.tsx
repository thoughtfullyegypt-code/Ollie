"use client";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Search,
  UserRound,
  Plus,
  MoveHorizontal,
  SlidersHorizontal,
  List,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Check,
  Copy,
  Flag,
  ExternalLink,
  ChevronDown,
  Share2,
  X,
  MapPin,
  Armchair,
  MousePointer2,
  Heart,
  LoaderCircle,
} from "lucide-react";
import { GuestArt, DishArt, DecorationArt } from "./art/illustrations";
import Modal from "./modal";
import SceneBoundary from "./scene-boundary";
import PurchaseFlow from "./purchase-flow";
import "./experience-refinement.css";
import DonationBlurb from "./donation-blurb";
import { captureAttribution, track, setJourneyConsent } from "./journey-events";

type Guest = {
  seatId: number;
  displayName: string;
  message: string;
  dish: string;
  neighborhood: string;
  customization: Record<string, string>;
  reactionCount: number;
  joinedAt: string;
  link?: string;
  isDemo?: boolean;
  reactionsEnabled?: boolean;
  celebration?: boolean;
  kind?: "purchased" | "complimentary" | "demo";
};
const neighborhoodIds = [
  "night-owls",
  "cat-people",
  "overthinkers",
  "creative-chaos",
  "founders-corner",
  "med-students",
  "birthday-end",
  "quiet-corner",
];
const defaultNeighborhoods = [
  {
    name: "The Night Owls",
    color: "#b5b4cc",
    note: "For one more conversation.",
  },
  {
    name: "The Cat People",
    color: "#d8a36e",
    note: "The good seats have fur.",
  },
  {
    name: "The Overthinkers",
    color: "#9eaf9c",
    note: "Was that a weird thing to say?",
  },
  {
    name: "The Creative Chaos",
    color: "#dca69c",
    note: "A beautifully unfinished idea.",
  },
  {
    name: "The Founders’ Corner",
    color: "#b5bf9b",
    note: "Bring your next big thing.",
  },
  {
    name: "The Med Students",
    color: "#a6bcc3",
    note: "A well-deserved dinner break.",
  },
  {
    name: "The Birthday End",
    color: "#e4c879",
    note: "There is always room for cake.",
  },
  {
    name: "The Quiet Corner",
    color: "#b4bfa6",
    note: "Good company. Fewer words.",
  },
];
const SceneGuest = memo(
  GuestArt,
  (before, after) =>
    before.variant === after.variant &&
    before.base === after.base &&
    before.className === after.className &&
    before.portrait === after.portrait &&
    (["base", "accessory", "outfit", "skin", "color"] as const).every(
      (key) => before.customization?.[key] === after.customization?.[key],
    ),
);
const SceneDish = memo(DishArt);
const SceneDecoration = memo(DecorationArt);
const PITCH = 192;
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
async function jsonRequest(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      data.error || data.message || "Something went wrong. Please try again.",
    );
  return data;
}
function Wordmark({ name }: { name: string }) {
  return (
    <Link className="wordmark" href="/" aria-label={`${name} home`}>
      <svg
        className="brand-plate"
        width="36"
        height="38"
        viewBox="0 0 36 38"
        aria-hidden="true"
      >
        <ellipse
          cx="19"
          cy="19"
          rx="11"
          ry="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <ellipse
          cx="19"
          cy="19"
          rx="7"
          ry="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M3 4v12m3-12v12M1 4v8q0 5 5 4m-3 0v18M34 4q-5 8-1 15v15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <span>
        {name === "A Seat at the Internet" ? (
          <>
            A Seat at
            <br />
            the Internet<span className="wordmark-dot">.</span>
          </>
        ) : (
          name
        )}
      </span>
    </Link>
  );
}
export default function TableExperience({
  initialSeat = 1,
  brandName = "A Seat at the Internet",
  openGuestOnLoad = true,
}: {
  initialSeat?: number;
  brandName?: string;
  openGuestOnLoad?: boolean;
}) {
  const initialGuestOpened = useRef(false);
  const previousGuestIds = useRef<Set<number> | null>(null);
  const previousWindow = useRef("");
  const [arrivingSeats, setArrivingSeats] = useState<number[]>([]);
  const [column, setColumn] = useState(
    Math.max(0, Math.floor((initialSeat - 1) / 2) - 2),
  );
  const [width, setWidth] = useState(1440);
  const scene = useRef<HTMLDivElement>(null);
  const heroAction = useRef<HTMLButtonElement>(null);
  const [heroActionVisible, setHeroActionVisible] = useState(true);
  const [configuredPackages, setConfiguredPackages] = useState<
    { id: string; amount: number; count: number }[]
  >([]);
  const [donationActive, setDonationActive] = useState(false);
  const [analyticsChoice, setAnalyticsChoice] = useState(false);

  const drag = useRef<{ x: number; column: number } | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [inventory, setInventory] = useState<Record<number, string>>({});
  const [neighborhoods, setNeighborhoods] = useState(defaultNeighborhoods);
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [stats, setStats] = useState({
    publishedGuests: 0,
    totalSeats: 10000,
    isDevelopment: true,
    purchasedGuests: 0,
    complimentaryGuests: 0,
    demoGuests: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Guest | null>(null);
  const [purchase, setPurchase] = useState(false);
  const [purchaseSeat, setPurchaseSeat] = useState<number | undefined>();
  const [panel, setPanel] = useState<"search" | "how" | null>(null);
  const [listView, setListView] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Guest[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [neighborhood, setNeighborhood] = useState(0);
  const [motion, setMotion] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const [sound, setSound] = useState(false);
  const [toast, setToast] = useState("");
  const [breadArrival, setBreadArrival] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);
  const audio = useRef<AudioContext | null>(null);
  const audioNodes = useRef<AudioNode[]>([]);
  useEffect(() => {
    captureAttribution();
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => {
        if (Array.isArray(c.packages)) setConfiguredPackages(c.packages);
        setAnalyticsChoice(Boolean(c.analytics?.productionConfigured));
      })
      .catch(() => {});
    fetch("/api/donations")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDonationActive(Boolean(d?.commitment)))
      .catch(() => {});
    const observer = new IntersectionObserver(
      (entries) => setHeroActionVisible(entries[0].isIntersecting),
      { threshold: 0.5 },
    );
    if (heroAction.current) observer.observe(heroAction.current);
    return () => observer.disconnect();
  }, []);
  function createGuest(
    placement: "header" | "hero" | "mobile" | "table" | "footer",
  ) {
    track("main_cta_clicked", { placement });
    openPurchase();
  }
  const singlePrice = configuredPackages.find(
    (p) => p.id === "one" && p.count === 1,
  );
  const pairPrice = configuredPackages.find(
    (p) => p.id === "two" && p.count === 2,
  );
  const formatPrice = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: n % 100 ? 2 : 0,
    }).format(n / 100);
  async function curiousGuest() {
    try {
      const data = await jsonRequest("/api/curious");
      if (!data.guest) {
        showToast(
          "The table is waiting for its first published guest. You can create one.",
        );
        return;
      }
      jump(data.guest.seatId);
      setListView(false);
      setSelected(data.guest);
      scene.current?.scrollIntoView({
        behavior: motion ? "smooth" : "instant",
        block: "center",
      });
    } catch (e) {
      showToast((e as Error).message);
    }
  }
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    const target = scene.current;
    const visibility = new IntersectionObserver(
      (entries) => {
        if (target) target.dataset.paused = String(!entries[0].isIntersecting);
      },
      { rootMargin: "80px" },
    );
    if (target) {
      observer.observe(target);
      visibility.observe(target);
    }
    return () => {
      observer.disconnect();
      visibility.disconnect();
    };
  }, [listView]);
  useEffect(() => {
    setNeighborhood(
      Math.min(7, Math.floor(((column + width / PITCH / 2) * 2) / 1250)),
    );
  }, [column, width]);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("table-motion");
    } catch {}
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMotion(!preference.matches && saved !== "off");
    setMotionReady(true);
    const reduce = () => {
      if (preference.matches) setMotion(false);
    };
    const visibility = () =>
      document.documentElement.classList.toggle("page-hidden", document.hidden);
    visibility();
    preference.addEventListener("change", reduce);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      preference.removeEventListener("change", reduce);
      document.removeEventListener("visibilitychange", visibility);
      document.documentElement.classList.remove("page-hidden");
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.motion = motion ? "on" : "off";
    if (motionReady) {
      try {
        localStorage.setItem("table-motion", motion ? "on" : "off");
      } catch {}
    }
  }, [motion, motionReady]);
  const firstCol = Math.max(0, Math.floor(column) - 2);
  const lastCol = Math.min(4999, Math.ceil(column + width / PITCH) + 2);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/table?start=${firstCol * 2 + 1}&end=${lastCol * 2 + 2}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error("The table is taking a moment to arrive.");
        return r.json();
      })
      .then((d) => {
        if (
          previousGuestIds.current &&
          previousWindow.current === `${firstCol}:${lastCol}`
        ) {
          const fresh = (d.guests || [])
            .filter((g: Guest) => !previousGuestIds.current!.has(g.seatId))
            .map((g: Guest) => g.seatId);
          setArrivingSeats(fresh);
          if (fresh.length) setTimeout(() => setArrivingSeats([]), 1800);
        } else setArrivingSeats([]);
        previousWindow.current = `${firstCol}:${lastCol}`;
        previousGuestIds.current = new Set(
          (d.guests || []).map((g: Guest) => g.seatId),
        );
        setGuests(d.guests || []);
        setInventory(
          Object.fromEntries(
            (d.seats || []).map((s: { seatId: number; state: string }) => [
              s.seatId,
              s.state,
            ]),
          ),
        );
        setStats(d.stats || stats);
        if (d.neighborhoods)
          setNeighborhoods(
            d.neighborhoods.map(
              (n: { name: string; color: string }, i: number) => ({
                ...defaultNeighborhoods[i],
                name: n.name,
                color: n.color,
              }),
            ),
          );
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [firstCol, lastCol, refresh]);
  useEffect(() => {
    if (
      openGuestOnLoad &&
      !initialGuestOpened.current &&
      !loading &&
      (initialSeat > 1 || location.pathname.startsWith("/seat/"))
    ) {
      const guest = guests.find((g) => g.seatId === initialSeat);
      if (guest) {
        setSelected(guest);
        initialGuestOpened.current = true;
      }
    }
  }, [initialSeat, loading, guests]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setRefresh((v) => v + 1);
    }, 20000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.has("seat")) jump(Number(p.get("seat")));
    if (p.has("checkout") || p.has("invite") || p.has("join")) {
      if (p.has("seat")) setPurchaseSeat(Number(p.get("seat")));
      setPurchase(true);
    }
  }, []);
  useEffect(() => {
    setResultsPage(1);
  }, [query]);
  useEffect(() => {
    if (panel !== "search" && !listView) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchLoading(true);
      fetch(
        `/api/table?q=${encodeURIComponent(query)}&start=1&end=10000&page=${resultsPage}`,
        { signal: controller.signal },
      )
        .then((r) => r.json())
        .then((d) => {
          setResults(d.guests || []);
          setResultsTotal(d.total || 0);
        })
        .catch((e) => {
          if (e.name !== "AbortError")
            showToast("Search is unavailable for a moment. Please try again.");
        })
        .finally(() => setSearchLoading(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, panel, listView, refresh, resultsPage]);
  function jump(seat: number) {
    if (!Number.isFinite(seat)) return;
    const valid = clamp(Math.round(seat), 1, 10000);
    setColumn(
      clamp(
        Math.floor((valid - 1) / 2) - Math.floor(width / PITCH / 2),
        0,
        5000 - width / PITCH,
      ),
    );
    setNeighborhood(Math.floor((valid - 1) / 1250));
  }
  async function findAvailable() {
    try {
      const data = await jsonRequest(
        `/api/available?count=1&near=${Math.floor(column) * 2 + 1}`,
      );
      const id = data.seatIds?.[0];
      if (id) {
        jump(id);
        setPurchaseSeat(id);
        setPurchase(true);
      } else showToast("No seats are available here right now.");
    } catch (e) {
      showToast((e as Error).message);
    }
  }
  function openPurchase(seat?: number) {
    setPurchaseSeat(seat);
    setPurchase(true);
  }
  function changeNeighborhood(index: number) {
    setNeighborhood(index);
    jump(index * 1250 + 1);
  }
  async function share(guest: Guest) {
    const url = `${location.origin}/seat/${guest.seatId}`;
    track("share_action_invoked", {
      seatId: guest.seatId,
      method: typeof navigator.share === "function" ? "native" : "copy",
    });
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Sit beside ${guest.displayName}`,
          text: "The internet is a weird place. Come sit with us.",
          url,
        });
      } catch (e) {
        if (!(e instanceof Error && e.name === "AbortError")) {
          try {
            await navigator.clipboard.writeText(url);
            showToast("Guest link copied.");
          } catch {
            showToast(`Your guest’s public link: ${url}`);
          }
        }
      }
    } else {
      await navigator.clipboard.writeText(url);
      showToast("Guest link copied. Make a little room.");
    }
  }
  async function passBread(guest: Guest) {
    try {
      const key = crypto.randomUUID();
      const d = await jsonRequest(`/api/seats/${guest.seatId}/bread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: key }),
      });
      setBreadArrival(guest.seatId);
      setSelected({
        ...guest,
        reactionCount: d.count ?? d.reactionCount ?? guest.reactionCount + 1,
      });
      setTimeout(() => setBreadArrival(null), 3500);
      showToast("A little bread. A little kindness.");
    } catch (e) {
      showToast((e as Error).message);
    }
  }
  async function report(guest: Guest) {
    const reason = window.prompt(
      "What should our moderators review? (No personal information, please.)",
    );
    if (!reason) return;
    try {
      await jsonRequest(`/api/seats/${guest.seatId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      showToast("Thank you. A moderator will review this guest.");
    } catch (e) {
      showToast((e as Error).message);
    }
  }
  function toggleSound() {
    if (sound) {
      audio.current?.suspend();
      setSound(false);
      return;
    }
    if (!audio.current) {
      const ctx = new AudioContext();
      audio.current = ctx;
      const gain = ctx.createGain();
      gain.gain.value = 0.014;
      gain.connect(ctx.destination);
      [130.81, 164.81, 196].forEach((frequency, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = frequency;
        const sub = ctx.createGain();
        sub.gain.value = 0.3;
        osc.connect(sub);
        sub.connect(gain);
        osc.start();
        audioNodes.current.push(osc, sub);
      });
    }
    audio.current?.resume();
    setSound(true);
  }
  return (
    <>
      <header className="site-header">
        <Wordmark name={brandName} />
        <nav aria-label="Main navigation">
          <button
            className="nav-link active"
            onClick={() => {
              setListView(false);
              scene.current?.focus();
            }}
          >
            Explore the table
          </button>
          <button className="nav-link" onClick={() => setPanel("search")}>
            Find a guest
          </button>
          <button className="nav-link" onClick={() => setPanel("how")}>
            How it works <ArrowUpRight size={13} />
          </button>
        </nav>
        <div className="header-actions">
          <Link
            className="account-link"
            href="/account"
            aria-label="Your account"
          >
            <UserRound size={19} />
          </Link>
          <button
            className="btn btn-primary header-cta"
            onClick={() => createGuest("header")}
          >
            Create your guest <ArrowUpRight size={17} />
          </button>
        </div>
      </header>
      <main id="main">
        <section className="table-introduction" aria-labelledby="main-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="little-star">✳</span> A VERY LONG TABLE. A VERY
              OPEN INVITATION.
            </p>
            <h1 id="main-title">
              The internet is weird.
              <br />
              Let’s have <em>dinner.</em>
            </h1>
            <p className="hero-tagline">
              Create your peculiar dinner guest, bring someone you love, and
              join a table of 10,000.
            </p>
            <div className="hero-journey-actions">
              <button
                ref={heroAction}
                className="btn btn-primary hero-create"
                onClick={() => createGuest("hero")}
              >
                Create your guest <ArrowUpRight size={17} />
              </button>
              <button
                className="text-link"
                onClick={() =>
                  scene.current?.scrollIntoView({
                    behavior: motion ? "smooth" : "instant",
                    block: "center",
                  })
                }
              >
                Explore the table <ArrowRight size={16} />
              </button>
            </div>
            <Link className="hero-gift-link" href="/save-a-seat">
              Save a seat for someone <Heart size={15} />
            </Link>
            <p className="hero-pricing">
              {singlePrice && pairPrice ? (
                <>
                  One guest {formatPrice(singlePrice.amount)} <span>·</span> You
                  + a friend {formatPrice(pairPrice.amount)}
                  <small>
                    One-time purchase. Your guest, your dish, your place.
                  </small>
                </>
              ) : (
                <span className="sr-only">Loading current prices.</span>
              )}
            </p>
          </div>
          <div className="invitation-note">
            <span className="note-star">✶</span>
            <h2>
              10,000 seats. <br />
              One wonderfully <br />
              <em>strange dinner.</em>
            </h2>
            <p>
              Bring a dish, make yourself comfortable,
              <br className="desktop-only" /> and save a seat for someone.
            </p>
            <button className="text-link curious-guest" onClick={curiousGuest}>
              Find a curious guest <ArrowUpRight size={16} />
            </button>
            <span className="note-doodle" aria-hidden="true">
              <svg width="68" height="39" viewBox="0 0 68 39">
                <path
                  d="M2 3C25 4 15 36 60 24m-12-6 15 5-10 11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </div>
        </section>
        <section
          className="table-section"
          aria-label="The shared dinner table"
          data-neighborhood={neighborhood}
        >
          <div className="scene-toolbar">
            <div className="neighborhood-label">
              <span
                className="status-dot"
                style={{ background: neighborhoods[neighborhood].color }}
              />
              <span>{neighborhoods[neighborhood].name}</span>
              {stats.isDevelopment && (
                <span className="sample-table-badge">SAMPLE TABLE</span>
              )}
              <span className="toolbar-separator">/</span>
              <span className="scene-caption">
                one table, a little room for everyone
              </span>
            </div>
            <div className="scene-switches">
              <Link
                className="small-control neighborhood-share"
                href={`/neighborhood/${neighborhoodIds[neighborhood]}`}
                aria-label={`Open shareable link for ${neighborhoods[neighborhood].name}`}
              >
                <Share2 size={15} />
                <span>Neighborhood link</span>
              </Link>
              <button
                className="small-control curious-control"
                onClick={curiousGuest}
                aria-label="Find a curious guest"
              >
                <Search size={15} />
                <span>Curious guest</span>
              </button>
              <button
                className={`small-control ${listView ? "selected" : ""}`}
                onClick={() => setListView(!listView)}
                aria-label="List view"
                aria-pressed={listView}
              >
                <List size={15} />
                <span>List view</span>
              </button>
              <button
                className="small-control"
                onClick={() => setMotion(!motion)}
                aria-label={motion ? "Pause motion" : "Enable motion"}
                aria-pressed={!motion}
              >
                {motion ? <Pause size={14} /> : <Play size={14} />}
                <span>Motion {motion ? "on" : "off"}</span>
              </button>
              <button
                className="small-control sound-control"
                onClick={toggleSound}
                aria-label={sound ? "Mute ambience" : "Play gentle ambience"}
                aria-pressed={sound}
              >
                {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
            </div>
          </div>
          {!listView ? (
            <SceneBoundary
              onList={() => setListView(true)}
              onFind={findAvailable}
            >
              <div
                ref={scene}
                tabIndex={0}
                role="region"
                aria-label="Illustrated table. Use left and right arrows to move, or use the navigation controls below."
                className={`table-viewport ${loading ? "is-loading" : ""}`}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    setColumn((v) =>
                      clamp(
                        v + (e.key === "ArrowRight" ? 2 : -2),
                        0,
                        5000 - width / PITCH,
                      ),
                    );
                  }
                  if (e.key === "Home" || e.key === "End") {
                    e.preventDefault();
                    setColumn(
                      e.key === "Home" ? 0 : Math.max(0, 5000 - width / PITCH),
                    );
                  }
                }}
                onWheel={(e) => {
                  if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey)
                    setColumn((v) =>
                      clamp(
                        v + (e.deltaX || e.deltaY) / PITCH,
                        0,
                        5000 - width / PITCH,
                      ),
                    );
                }}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  drag.current = { x: e.clientX, column };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (drag.current)
                    setColumn(
                      clamp(
                        drag.current.column +
                          (drag.current.x - e.clientX) / PITCH,
                        0,
                        5000 - width / PITCH,
                      ),
                    );
                }}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
              >
                <div className="scene-floor" />
                <div className="table-shadow" />
                <div className="table-edge" />
                <div className="gingham-table">
                  <div className="table-running-line" />
                </div>
                <div className="table-drapes" />
                {Array.from({ length: lastCol - firstCol + 1 }, (_, j) => {
                  const col = firstCol + j;
                  const x = (col - column) * PITCH + 24;
                  return (
                    <div
                      className="table-column"
                      key={col}
                      style={{
                        left: 0,
                        transform: `translate3d(${x}px, 0, 0)`,
                      }}
                      data-paused={x + PITCH < 0 || x > width}
                    >
                      {[0, 1].map((row) => {
                        const id = col * 2 + row + 1;
                        const g = guests.find((g) => g.seatId === id);
                        const state = inventory[id] || "loading";
                        const available = state === "available";
                        return (
                          <div
                            className={`place-setting row-${row} ${g ? "occupied" : "empty"} ${breadArrival === id ? "bread-arrival" : ""} ${arrivingSeats.includes(id) ? "guest-just-published" : ""}`}
                            key={id}
                          >
                            <div className="dinner-chair">
                              <span />
                            </div>
                            <button
                              className="guest-button"
                              onClick={() =>
                                g
                                  ? setSelected(g)
                                  : available
                                    ? openPurchase(id)
                                    : showToast(
                                        `Seat ${id} is ${state === "loading" ? "loading" : "reserved"}. Let’s find you another place.`,
                                      )
                              }
                              aria-label={
                                g
                                  ? `${g.displayName}, seat ${id}`
                                  : available
                                    ? `Available seat ${id}. Design your dinner guest.`
                                    : `Seat ${id} is ${state === "loading" ? "loading" : "reserved"}`
                              }
                            >
                              {g ? (
                                <SceneGuest
                                  customization={g.customization}
                                  variant={id}
                                />
                              ) : (
                                <span className="empty-guest">
                                  {available ? (
                                    <Plus size={21} />
                                  ) : (
                                    <Armchair size={21} />
                                  )}
                                  <span>
                                    {available ? (
                                      <>
                                        Your kind
                                        <br />
                                        of weird?
                                      </>
                                    ) : state === "loading" ? (
                                      "Setting the table…"
                                    ) : (
                                      "Quietly reserved."
                                    )}
                                  </span>
                                </span>
                              )}
                            </button>
                            <div className={`dish-setting plate-${id % 3}`}>
                              {g ? (
                                <SceneDish dish={g.dish} />
                              ) : (
                                <svg viewBox="0 0 120 76" aria-hidden="true">
                                  <ellipse
                                    cx="60"
                                    cy="44"
                                    rx="43"
                                    ry="23"
                                    fill="#fff4df"
                                    stroke="#655c48"
                                    strokeWidth="1.6"
                                  />
                                  <ellipse
                                    cx="60"
                                    cy="44"
                                    rx="33"
                                    ry="16"
                                    fill="none"
                                    stroke="#9ca185"
                                    strokeWidth="1.2"
                                  />
                                  <path
                                    d="m43 46 18-29 19 29-19 12Z"
                                    fill="#efe8d4"
                                    stroke="#a4a48a"
                                    strokeWidth="1.3"
                                  />
                                  <path
                                    d="M61 19v37"
                                    fill="none"
                                    stroke="#a4a48a"
                                    strokeWidth="1"
                                  />
                                </svg>
                              )}
                            </div>
                            <span className="seat-number">
                              {String(id).padStart(4, "0")}
                            </span>
                            {g && (
                              <span className="guest-tooltip">
                                {g.displayName}
                                <span>Seat {id} · say hello</span>
                              </span>
                            )}
                            {g?.celebration && (
                              <div
                                className="celebration-props"
                                aria-label="Celebration table decorations"
                              >
                                <svg viewBox="0 0 150 45" aria-hidden="true">
                                  <path
                                    d="M2 5Q75 37 148 5"
                                    fill="none"
                                    stroke="#665645"
                                    strokeWidth="1.3"
                                  />
                                  {[20, 45, 70, 95, 120].map((x, i) => (
                                    <path
                                      key={x}
                                      d={`m${x} ${13 + Math.sin(x / 45) * 7} 9 18 7-17Z`}
                                      fill={
                                        ["#c45a40", "#edcf76", "#98ac8c"][i % 3]
                                      }
                                      stroke="#786244"
                                      strokeWidth=".6"
                                    />
                                  ))}
                                </svg>
                                <SceneDecoration kind="candle" />
                              </div>
                            )}
                            {breadArrival === id && (
                              <div className="traveling-bread">
                                <SceneDecoration kind="bread" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div
                        className={`table-centerpiece centerpiece-${col % 4}`}
                      >
                        <SceneDecoration
                          kind={
                            col % 4 === 0
                              ? [
                                  "flowers",
                                  "teapot",
                                  "salt",
                                  "tomatoes",
                                  "wine",
                                  "teapot",
                                  "candle",
                                  "flowers",
                                ][neighborhood]
                              : ["flowers", "candle", "bread", "wine"][col % 4]
                          }
                        />
                      </div>
                      {col % 3 === 1 && (
                        <div className="table-side-prop">
                          <SceneDecoration kind="salt" />
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="table-side-fade fade-left" />
                <div className="table-side-fade fade-right" />
                <div className="scene-handwritten">
                  <span>All sorts welcome.</span>
                  <svg
                    width="65"
                    height="28"
                    viewBox="0 0 65 28"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 5q28 24 53 9m-4-7 9 6-10 7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                  </svg>
                </div>
                {error && (
                  <div className="table-error" role="status">
                    {error}
                    <button onClick={() => setRefresh((v) => v + 1)}>
                      Try again
                    </button>
                    <button onClick={() => setListView(true)}>
                      Use list view
                    </button>
                  </div>
                )}
              </div>
            </SceneBoundary>
          ) : (
            <div className="accessible-list">
              <div className="search-input-wrap">
                <Search size={18} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search guests or a seat number"
                  aria-label="Search table list"
                />
              </div>
              <div className="guest-list">
                {results.map((g) => (
                  <button
                    className="guest-list-card"
                    key={g.seatId}
                    onClick={() => setSelected(g)}
                  >
                    <div className="list-portrait">
                      <GuestArt customization={g.customization} />
                    </div>
                    <div>
                      <span className="eyebrow">SEAT {g.seatId}</span>
                      <strong>{g.displayName}</strong>
                      <p>{g.message}</p>
                      <span className="muted">{g.neighborhood}</span>
                    </div>
                    <ArrowUpRight size={19} />
                  </button>
                ))}
                {!results.length && (
                  <p>
                    {searchLoading
                      ? "Finding dinner guests…"
                      : "No published guests match that search."}
                  </p>
                )}
              </div>
              <div className="list-pagination">
                <button
                  className="btn btn-secondary"
                  disabled={resultsPage === 1}
                  onClick={() => setResultsPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {resultsPage} · {resultsTotal} guests
                </span>
                <button
                  className="btn btn-secondary"
                  disabled={resultsPage * 50 >= resultsTotal}
                  onClick={() => setResultsPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
          <div className="table-navigation">
            <div className="navigation-left">
              <div className="arrow-controls">
                <button
                  className="icon-button"
                  aria-label="Previous table section"
                  onClick={() =>
                    setColumn((v) => clamp(v - 3, 0, 5000 - width / PITCH))
                  }
                  disabled={column <= 0}
                >
                  <ArrowLeft size={20} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Next table section"
                  disabled={column >= 5000 - width / PITCH}
                  onClick={() =>
                    setColumn((v) => clamp(v + 3, 0, 5000 - width / PITCH))
                  }
                >
                  <ArrowRight size={20} />
                </button>
              </div>
              <span className="drag-hint">
                <MoveHorizontal size={17} /> Drag to wander. Click to say hello.
              </span>
            </div>
            <div className="position-label">
              SEATS{" "}
              <b>
                {String(Math.floor(column) * 2 + 1).padStart(4, "0")}—
                {String(
                  Math.min(10000, Math.ceil(column + width / PITCH) * 2),
                ).padStart(4, "0")}
              </b>
              <span>/ 10,000</span>
            </div>
            <button
              className="text-link available-link"
              onClick={findAvailable}
            >
              Find an available seat <Plus size={16} />
            </button>
          </div>
          <div className="overview-navigator">
            <label htmlFor="table-position" className="sr-only">
              Jump across the entire table
            </label>
            <input
              id="table-position"
              type="range"
              min="0"
              max={Math.max(0, 5000 - width / PITCH)}
              step="0.01"
              value={column}
              onChange={(e) => {
                setColumn(
                  clamp(Number(e.target.value), 0, 5000 - width / PITCH),
                );
                setNeighborhood(
                  Math.min(7, Math.floor((Number(e.target.value) * 2) / 1250)),
                );
              }}
            />
            <div className="overview-ticks">
              {neighborhoods.map((n, i) => (
                <button
                  key={n.name}
                  onClick={() => changeNeighborhood(i)}
                  aria-label={`Visit ${n.name}`}
                  title={n.name}
                >
                  <span style={{ background: n.color }} />
                </button>
              ))}
            </div>
          </div>
          <div className="table-footnote">
            <p>
              <span className="tiny-plate" />{" "}
              {stats.purchasedGuests.toLocaleString()} purchased guests
              <span className="footnote-dot">·</span>{" "}
              {stats.complimentaryGuests} complimentary
              {stats.demoGuests > 0 && (
                <>
                  <span className="footnote-dot">·</span>
                  {stats.demoGuests} demonstration characters
                </>
              )}
            </p>
            <span>
              {stats.isDevelopment
                ? "DEVELOPMENT TABLE · NO REAL PURCHASES"
                : "ONE SHARED TABLE. EVERYONE’S INVITED."}
            </span>
          </div>
        </section>
        <section className="neighborhood-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                FIND YOUR PEOPLE. OR MEET SOME NEW ONES.
              </p>
              <h2>A very mixed seating plan.</h2>
            </div>
            <button className="text-link" onClick={() => setPanel("how")}>
              What is all this? <ArrowUpRight size={17} />
            </button>
          </div>
          <div className="neighborhood-grid">
            {neighborhoods.map((n, i) => (
              <button
                className={`neighborhood-card ${neighborhood === i ? "chosen" : ""}`}
                key={n.name}
                onClick={() => {
                  changeNeighborhood(i);
                  setListView(false);
                  scene.current?.scrollIntoView({
                    behavior: motion ? "smooth" : "instant",
                    block: "center",
                  });
                }}
              >
                <span
                  className="neighborhood-art"
                  style={{ background: n.color }}
                >
                  <svg viewBox="0 0 60 60" aria-hidden="true">
                    {i === 0 ? (
                      <>
                        <path
                          d="M40 11a20 20 0 1 0 7 33A23 23 0 0 1 40 11Z"
                          fill="#f7f2de"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                        <path
                          d="m12 11 2 4 4 1-4 2-1 4-2-4-4-1 4-2M46 7v8m-4-4h8"
                          stroke="currentColor"
                          fill="none"
                        />
                      </>
                    ) : i === 1 ? (
                      <>
                        <path
                          d="m12 26 2-15 13 8h8l12-8 1 19q5 22-19 22T12 26"
                          fill="#f5e2b8"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                        <path
                          d="m24 31 1 1m11-1 1 1m-7 3 3 1-2 3m-12-1-10-2m31 2 11-2"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </>
                    ) : i === 2 ? (
                      <>
                        <path
                          d="M15 36C0 21 20 8 28 20c9-17 30-2 20 10 13 12-5 25-13 14-8 16-31 6-20-8Z"
                          fill="#eee9d2"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                        <path
                          d="m28 24 9 11m-15-3 17-5m-12 6 3 10"
                          fill="none"
                          stroke="currentColor"
                        />
                      </>
                    ) : i === 3 ? (
                      <>
                        <path
                          d="m13 45 26-33 8 7-27 33Z"
                          fill="#e4ce73"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                        <path
                          d="m10 43 3 12 7-3m18-38 7 7M9 17l7 2m-4-10 7 6m28 26 5 4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                      </>
                    ) : (
                      <>
                        <ellipse
                          cx="30"
                          cy="34"
                          rx="19"
                          ry="13"
                          fill="#f7efd8"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                        <ellipse
                          cx="30"
                          cy="34"
                          rx="12"
                          ry="7"
                          fill="none"
                          stroke="currentColor"
                        />
                        <path
                          d="M10 11v15m-4-15v9q0 6 8 6m-4 0v24M50 11q-6 7-2 17v22"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                        {i === 6 && (
                          <path
                            d="M24 13h13v15H24Zm6 0V6"
                            fill="#cd684c"
                            stroke="currentColor"
                          />
                        )}
                      </>
                    )}
                  </svg>
                </span>
                <span className="neighborhood-card-copy">
                  <strong>{n.name}</strong>
                  <span>{n.note}</span>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))}
          </div>
        </section>
        <DonationBlurb />
        <section className="bottom-invitation">
          <div className="bottom-flower">
            <DecorationArt kind="flowers" />
          </div>
          <p>
            Somewhere between strangers
            <br />
            and <em>“pass the bread.”</em>
          </p>
          <button className="btn btn-primary" onClick={() => openPurchase()}>
            Come sit with us <ArrowUpRight size={18} />
          </button>
        </section>
      </main>
      <footer className="site-footer">
        <span>
          {brandName}
          <span className="wordmark-dot">.</span>
        </span>
        <p>An ongoing experiment in being here, together.</p>
        <div>
          {donationActive && (
            <Link href="/beyond-the-table">Beyond the table</Link>
          )}
          {analyticsChoice && (
            <button
              className="privacy-choice"
              onClick={() => {
                setJourneyConsent(
                  window.confirm(
                    "Allow minimal journey measurement? No names, emails, private invitation links or payment details are collected.",
                  )
                    ? "granted"
                    : "denied",
                );
                showToast("Your privacy choice is saved.");
              }}
            >
              Privacy choices
            </button>
          )}
          <Link href="/content">Table manners</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/support">Need a hand?</Link>
        </div>
      </footer>
      {!heroActionVisible && !purchase && !selected && !panel && (
        <div className="mobile-action-bar">
          <button
            className="icon-button"
            onClick={() => setPanel("search")}
            aria-label="Find a guest"
          >
            <Search size={20} />
          </button>
          <button
            className="btn btn-primary"
            onClick={() => createGuest("mobile")}
          >
            Create your guest <ArrowUpRight size={17} />
          </button>
          <button
            className="icon-button"
            onClick={findAvailable}
            aria-label="Find an available seat"
          >
            <Armchair size={22} />
          </button>
        </div>
      )}
      {panel === "how" && (
        <Modal
          title="An invitation to dinner"
          onClose={() => setPanel(null)}
          className="how-modal"
        >
          <p className="eyebrow">PULL UP A CHAIR</p>
          <h2>
            One table.
            <br />
            <em>So many stories.</em>
          </h2>
          <p>
            This is a participatory internet artwork: an impossibly long
            illustrated dinner table, with one permanent number for every seat.
          </p>
          <ol className="how-steps">
            <li>
              <span>01</span>
              <div>
                <h3>Create someone peculiar.</h3>
                <p>
                  Exploring is always free. Wander the table or pick your
                  neighborhood.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>See yourself at the table.</h3>
                <p>
                  Choose a neighborhood and available chair, preview your actual
                  place, then choose one seat or a neighboring group. The final
                  price appears before payment.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Make a little room.</h3>
                <p>
                  Save a nearby place for a friend, or invite them to a seat
                  you’ve already purchased. And don’t forget to pass the bread.
                </p>
              </div>
            </li>
          </ol>
          <p className="fine-print">
            A digital customization and display service. No property or
            investment rights. Service commitment and refund terms appear before
            checkout. This development edition cannot charge real cards.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              setPanel(null);
              openPurchase();
            }}
          >
            Create your guest <ArrowUpRight size={17} />
          </button>
        </Modal>
      )}
      {panel === "search" && (
        <Modal
          title="Find your dinner company"
          onClose={() => setPanel(null)}
          className="search-modal"
        >
          <p className="eyebrow">THERE’S SOMEONE FOR EVERYONE</p>
          <h2>Who’s at the table?</h2>
          <div className="search-input-wrap">
            <Search size={20} />
            <input
              autoFocus
              aria-label="Search guests, seat numbers or neighborhoods"
              placeholder="A name, a seat, a neighborhood…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <form
            className="jump-form"
            onSubmit={(e) => {
              e.preventDefault();
              const val = Number(new FormData(e.currentTarget).get("seat"));
              if (val >= 1 && val <= 10000) {
                jump(val);
                setPanel(null);
              }
            }}
          >
            <label htmlFor="jump-seat">Or go straight to seat</label>
            <input
              id="jump-seat"
              name="seat"
              type="number"
              min="1"
              max="10000"
              placeholder="1–10,000"
              required
            />
            <button className="icon-button" aria-label="Jump to seat">
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="search-results">
            {searchLoading ? (
              <p className="muted">Finding your dinner company…</p>
            ) : (
              results.map((g) => (
                <button
                  key={g.seatId}
                  onClick={() => {
                    jump(g.seatId);
                    setSelected(g);
                    setPanel(null);
                  }}
                >
                  <span className="search-avatar">
                    <GuestArt customization={g.customization} />
                  </span>
                  <span>
                    <strong>{g.displayName}</strong>
                    <small>
                      Seat {g.seatId} · {g.neighborhood}
                    </small>
                  </span>
                  <ArrowUpRight size={17} />
                </button>
              ))
            )}
            {!searchLoading && !results.length && (
              <p className="muted">
                No guests found. Try another name, or find your own seat.
              </p>
            )}
          </div>
          {resultsTotal > 50 && (
            <div className="list-pagination">
              <button
                className="btn btn-secondary"
                disabled={resultsPage === 1}
                onClick={() => setResultsPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>
                {resultsPage} / {Math.ceil(resultsTotal / 50)}
              </span>
              <button
                className="btn btn-secondary"
                disabled={resultsPage * 50 >= resultsTotal}
                onClick={() => setResultsPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </Modal>
      )}
      {selected && (
        <Modal
          title={`${selected.displayName}, seat ${selected.seatId}`}
          onClose={() => setSelected(null)}
          className="profile-modal"
        >
          <div className="profile-art">
            <span className="profile-seat">
              SEAT {String(selected.seatId).padStart(4, "0")}
            </span>
            <GuestArt customization={selected.customization} />
            <div className="profile-dish">
              <DishArt dish={selected.dish} />
            </div>
            <span className="profile-spark">✳</span>
          </div>
          <div className="profile-content">
            <p className="eyebrow">{selected.neighborhood}</p>
            <h2>{selected.displayName}</h2>
            <p className="dinner-message">“{selected.message}”</p>
            <p className="profile-bringing">
              BROUGHT TO THE TABLE{" "}
              <span>{selected.dish.replaceAll("-", " ")}</span>
            </p>
            {selected.link && /^https?:\/\//i.test(selected.link) && (
              <a
                className="text-link"
                href={selected.link}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
              >
                A little more about me <ExternalLink size={14} />
              </a>
            )}
            <div className="profile-meta">
              <span>
                Joined{" "}
                {new Date(selected.joinedAt).toLocaleDateString("en", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
              {selected.kind === "demo" || selected.isDemo ? (
                <span className="badge">Demonstration character</span>
              ) : selected.kind === "complimentary" ? (
                <span className="badge">Complimentary founding guest</span>
              ) : (
                <span className="badge">Purchased seat</span>
              )}
            </div>
            <div className="profile-actions">
              <button
                className="btn btn-primary"
                onClick={() => passBread(selected)}
                disabled={selected.reactionsEnabled === false}
              >
                <svg
                  width="23"
                  height="18"
                  viewBox="0 0 23 18"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 11C1 2 20-2 21 9v6H2Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="m8 5 2 5m4-6 2 5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
                Pass the bread{" "}
                <span className="reaction-count">
                  {selected.reactionCount || 0}
                </span>
              </button>
              <button
                className="icon-button"
                onClick={() => share(selected)}
                aria-label="Share this guest"
              >
                <Share2 size={19} />
              </button>
            </div>
            <div className="profile-bottom-links">
              <a
                href={`/api/og/seat/${selected.seatId}?download=1`}
                download={`seat-${selected.seatId}.png`}
                onClick={() =>
                  track("share_action_invoked", {
                    seatId: selected.seatId,
                    method: "download",
                    placement: "profile",
                  })
                }
              >
                Download portrait <ArrowUpRight size={12} />
              </a>
              <button onClick={() => report(selected)}>
                <Flag size={12} /> Report
              </button>
            </div>
          </div>
        </Modal>
      )}
      {purchase && (
        <PurchaseFlow
          initialSeat={purchaseSeat}
          onClose={() => setPurchase(false)}
          onComplete={() => {
            setRefresh((v) => v + 1);
            showToast(
              "Your place is saved. Your guest is waiting for a moderation review.",
            );
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </>
  );
}
