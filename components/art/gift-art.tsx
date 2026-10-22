import { DecorationArt } from "./illustrations";
import type { GiftOccasion, GiftProp } from "@/lib/gift-input";

const ink = "#302d27";
const drawing = {
  stroke: ink,
  strokeWidth: 2.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Original folded stationery, using the dinner world's shared ink and paper. */
export function GiftEnvelope({
  open = false,
  className = "",
}: {
  open?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={`gift-envelope-art ${open ? "is-open" : ""} ${className}`}
      viewBox="0 0 320 240"
      fill="none"
      aria-hidden="true"
    >
      <ellipse
        cx="161"
        cy="211"
        rx="131"
        ry="12"
        fill="#61583d"
        opacity=".08"
      />
      <g {...drawing}>
        <path d="M33 74 160 22l128 52-2 129-250 4Z" fill="#e5d9b3" />
        <path d="m35 76 125 77L288 74l-2 129-250 4Z" fill="#fff8e6" />
        <path d="m37 205 98-76m150 73-100-75" />
        <path
          className="gift-envelope-flap"
          d="m34 75 126 96L288 74l-128-51Z"
          fill="#f5eccf"
        />
        <path d="m43 66 10-15m225 9-7-13M159 6l1-5" stroke="#9aab91" />
        <path
          d="M155 148c-17-17-38 10 5 32 43-27 20-49 0-32l-3 4Z"
          fill="#c94b36"
        />
        <path d="m64 177 27-4m-26 13 16-2" stroke="#8c9174" strokeWidth="1.7" />
      </g>
    </svg>
  );
}

export function GiftHeartNote() {
  return (
    <svg viewBox="0 0 160 125" fill="none" aria-hidden="true">
      <g {...drawing}>
        <path d="M13 60q63-25 134-3l-8 48q-58 17-116 0Z" fill="#c8945c" />
        <path
          d="M20 58c-5-33 25-49 43-25 10-35 52-31 54 3 23-18 39 1 29 24Z"
          fill="#edcf8a"
        />
        <path d="m39 41 7 12m29-25 6 18m29-6 8 12" />
        <path d="m54 67 48-5 6 44-46 4Z" fill="#fff8e6" />
        <path
          d="M78 80c-13-11-21 7 6 19 23-17 8-30-1-18l-2 3Z"
          fill="#cf513d"
        />
        <path d="M17 78q64 21 126-3M27 98q50 17 110-3" strokeWidth="1.4" />
      </g>
    </svg>
  );
}

export function GiftBanner() {
  return (
    <svg viewBox="0 0 280 150" fill="none" aria-hidden="true">
      <g {...drawing}>
        <path d="M14 19q129 48 252 0" />
        <path
          d="m31 24 9 49 28-35m15 3 15 48 23-41m15 1 22 45 16-47m14-3 26 38 9-48m18-7 29 28 1-40"
          fill="#e7c46e"
        />
        <path d="m18 112 19-8m218 6 10 9m-118 6 1 13" stroke="#9aab91" />
        <path d="M62 109q76-24 158 0l-5-31q-75-23-149 0Z" fill="#fff8e6" />
      </g>
      <text
        x="140"
        y="101"
        textAnchor="middle"
        fill={ink}
        fontFamily="Georgia,serif"
        fontSize="20"
        letterSpacing="3"
      >
        HOORAY!
      </text>
    </svg>
  );
}

export function GiftCake() {
  return (
    <svg viewBox="0 0 190 170" fill="none" aria-hidden="true">
      <g {...drawing}>
        <ellipse cx="95" cy="143" rx="82" ry="17" fill="#fff8e6" />
        <path d="M29 92v42q66 23 132 0V91Z" fill="#dfb380" />
        <path
          d="M30 95q63 26 130-1v16q-11 16-19 1-11 16-20 2-13 18-23 2-13 14-22-1-13 17-22-4-14 11-24-3Z"
          fill="#fff6dd"
        />
        <ellipse cx="95" cy="91" rx="66" ry="18" fill="#fff8e6" />
        <path
          d="m57 77-1-31m38 39V37m38 40 2-30"
          stroke="#c44f39"
          strokeWidth="7"
        />
        <path
          d="m54 55 4 5m34-10 4 5m36 1 4 5"
          stroke="#eed989"
          strokeWidth="2"
        />
        <g className="gift-candle-flames" fill="#e7bf60" strokeWidth="1.8">
          <path d="M56 42q-14-8 1-24 13 18-1 24ZM94 34q-14-7 1-25 12 18-1 25ZM134 43q-13-8 2-24 11 19-2 24Z" />
        </g>
        <path d="m46 130 6 2m21 4 8 1m21 0h7m22-4 7-2" stroke="#a87551" />
      </g>
    </svg>
  );
}

export function GiftWave() {
  return (
    <svg viewBox="0 0 180 150" fill="none" aria-hidden="true">
      <g {...drawing}>
        <g className="gift-wave-hand">
          <path
            d="m49 121-7-37-12-24q-2-11 5-12 7 0 15 21l-5-38q0-11 7-10 8 1 10 38l2-48q2-8 8-5 6 4 2 51l9-40q2-8 8-4 7 5-6 47l14-21q7-7 11-1 5 10-18 39l-11 40Z"
            fill="#edbd91"
          />
          <path d="m43 84 14 17m5-15 19 4" />
        </g>
        <path d="m120 44 10-9m-4 25 17-1m-30-34 1-12" stroke="#9aab91" />
      </g>
      <path d="m113 112 20-14 16 20-20 12Z" fill="#fff8e6" {...drawing} />
      <path d="M130 105c-9-7-13 4 2 11 14-11 5-17 0-10Z" fill="#c94b36" />
    </svg>
  );
}

const defaults: Record<GiftOccasion, GiftProp> = {
  birthday: "cake",
  congratulations: "banner",
  "thank-you": "flowers",
  "miss-you": "wave",
  "just-because": "bread-heart",
};
export function OccasionProp({
  occasion = "birthday",
  prop,
}: {
  occasion?: GiftOccasion;
  prop?: GiftProp;
}) {
  const item = prop || defaults[occasion];
  if (item === "cake") return <GiftCake />;
  if (item === "banner") return <GiftBanner />;
  if (item === "flowers") return <DecorationArt kind="flowers" />;
  if (item === "wave") return <GiftWave />;
  return <GiftHeartNote />;
}
