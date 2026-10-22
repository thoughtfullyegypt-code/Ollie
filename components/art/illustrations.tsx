import type { CSSProperties, ReactNode } from "react";
import "./art.css";

/** Original editable drawings for A Seat at the Internet. All figures share the same ink system. */
export const BASES = [
  { id: "human", label: "A fellow overthinker" },
  { id: "astronaut", label: "Exhausted astronaut" },
  { id: "grandma", label: "Very glamorous grandma" },
  { id: "raccoon", label: "Business raccoon" },
  { id: "vampire", label: "Dramatic vampire" },
  { id: "plant", label: "Social houseplant" },
  { id: "detective", label: "Suspicious detective" },
  { id: "ghost", label: "Polite ghost" },
  { id: "mushroom", label: "Fun little fungus" },
  { id: "cat", label: "Dinner-party cat" },
  { id: "robot", label: "Sentimental robot" },
  { id: "frog", label: "Well-dressed frog" },
] as const;
export const ACCESSORIES = [
  { id: "none", label: "Come as you are" },
  { id: "curls", label: "Tousled curls" },
  { id: "bob", label: "Inky bob" },
  { id: "bun", label: "Very messy bun" },
  { id: "beret", label: "Artist's beret" },
  { id: "party-hat", label: "Party hat" },
  { id: "flower", label: "A flower behind the ear" },
  { id: "crown", label: "Paper crown" },
  { id: "beanie", label: "Little red beanie" },
  { id: "sunglasses", label: "Enormous sunglasses" },
  { id: "bow", label: "Silk hair bow" },
  { id: "headphones", label: "Oversized headphones" },
  { id: "halo", label: "Slightly wonky halo" },
] as const;
export const OUTFITS = [
  { id: "signature", label: "The signature look" },
  { id: "stripes", label: "Marinière stripes" },
  { id: "suit", label: "Serious business suit" },
  { id: "overalls", label: "Gardening overalls" },
  { id: "knit", label: "Cozy butter knit" },
  { id: "turtleneck", label: "Plum turtleneck" },
  { id: "bowtie", label: "A little bow tie" },
  { id: "cardigan", label: "Tomato cardigan" },
  { id: "party", label: "Going-out polka dots" },
  { id: "chef", label: "Chef's whites" },
] as const;
export const SKIN_TONES = [
  { id: "#f4d6b9", label: "Porcelain" },
  { id: "#edbd91", label: "Peach" },
  { id: "#dca276", label: "Honey" },
  { id: "#bd805a", label: "Warm brown" },
  { id: "#925b3f", label: "Deep brown" },
  { id: "#654335", label: "Rich umber" },
] as const;
export const DISHES = [
  { id: "spaghetti", label: "Emotionally supportive pasta" },
  { id: "soup", label: "Suspiciously good soup" },
  { id: "garlic-bread", label: "Fearless garlic bread" },
  { id: "cake", label: "Unbirthday cake" },
  { id: "fries", label: "Fries for the table" },
  { id: "dumplings", label: "Lucky little dumplings" },
  { id: "pie", label: "A very personal pie" },
  { id: "salad", label: "Existential salad" },
  { id: "sushi", label: "Perfectly rolled sushi" },
  { id: "pancakes", label: "Midnight pancakes" },
  { id: "olives", label: "Emergency olives" },
  { id: "mystery-jelly", label: "Unidentified jelly" },
] as const;
export const DECORATIONS = [
  { id: "flowers", label: "Wildflowers" },
  { id: "candle", label: "Wobbly candle" },
  { id: "bread", label: "Passing bread basket" },
  { id: "wine", label: "A little red" },
  { id: "salt", label: "Salt and pepper" },
  { id: "tomatoes", label: "Heirloom tomatoes" },
  { id: "teapot", label: "Tea for two" },
  { id: "napkin", label: "A saved-seat napkin" },
] as const;

const INK = "#302d27";
const RED = "#d7503e";
const BUTTER = "#eed989";
const SAGE = "#9baf8d";
const BLUE = "#9caebd";
const PLUM = "#776074";
const CREAM = "#fff8e6";
const stroke = {
  stroke: INK,
  strokeWidth: 2.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const colors = [RED, SAGE, BLUE, PLUM, BUTTER];
const safeColor = (value: string | undefined, fallback: string) =>
  value && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value) ? value : fallback;

function Eyes({
  tired = false,
  suspicious = false,
  x = 80,
  y = 71,
}: {
  tired?: boolean;
  suspicious?: boolean;
  x?: number;
  y?: number;
}) {
  return (
    <g className="guest-eyes" style={{ transformOrigin: `${x}px ${y}px` }}>
      {tired ? (
        <>
          <path
            d={`M${x - 17} ${y - 2}q6 4 12 0M${x + 6} ${y - 2}q6 4 12 0`}
            fill="none"
          />
          <path
            d={`M${x - 15} ${y + 6}q5 3 9 0M${x + 7} ${y + 6}q5 3 9 0`}
            opacity=".32"
            fill="none"
          />
        </>
      ) : (
        <>
          <ellipse cx={x - 11} cy={y} rx="2" ry="3" fill={INK} stroke="none" />
          <ellipse cx={x + 11} cy={y} rx="2" ry="3" fill={INK} stroke="none" />
          {suspicious && (
            <path
              d={`M${x - 18} ${y - 9}l11 4M${x + 6} ${y - 4}l12-6`}
              fill="none"
            />
          )}
        </>
      )}
    </g>
  );
}
function BowTie({ y = 113, color = RED }: { y?: number; color?: string }) {
  return (
    <g fill={color}>
      <path d={`M77 ${y}l-13-7v16l13-6M83 ${y}l13-7v16l-13-6`} />
      <circle cx="80" cy={y + 1} r="4" />
    </g>
  );
}
function Outfit({
  outfit,
  color,
  variant,
  skin,
}: {
  outfit: string;
  color: string;
  variant: number;
  skin: string;
}) {
  const fill =
    outfit === "knit"
      ? BUTTER
      : outfit === "suit"
        ? PLUM
        : outfit === "chef"
          ? CREAM
          : outfit === "turtleneck"
            ? PLUM
            : outfit === "cardigan"
              ? RED
              : outfit === "overalls"
                ? BLUE
                : color;
  return (
    <g>
      <path
        d="M46 110Q32 116 29 143l-5 39q24 13 56 13t56-13l-5-39q-3-27-17-33L93 101H67Z"
        fill={fill}
      />
      <path d="M46 130l-4 45M114 130l4 45" fill="none" />
      {outfit === "stripes" && (
        <g fill="none" stroke={CREAM} strokeWidth="8">
          <path d="M38 130h85M34 148h93M31 166h99M39 184h82" />
        </g>
      )}
      {outfit === "suit" && (
        <>
          <path d="M65 104l15 63 15-63" fill={CREAM} />
          <path
            d="M58 107l-9 21 17 7-9 9 23 23M102 107l9 21-17 7 9 9-23 23"
            fill="none"
          />
          <path d="M77 112h6l3 24-6 8-6-8Z" fill={RED} />
          <path d="M98 151h15" />
          <circle cx="80" cy="178" r="2" fill={INK} />
        </>
      )}
      {outfit === "overalls" && (
        <>
          <path d="M53 108h12v31h30v-31h12v73H53Z" fill={SAGE} />
          <path d="M65 139h30v30H65Z" fill="none" />
          <circle cx="60" cy="134" r="3" fill={BUTTER} />
          <circle cx="101" cy="134" r="3" fill={BUTTER} />
        </>
      )}
      {outfit === "knit" && (
        <g fill="none" strokeWidth="1.4" opacity=".65">
          <path d="M62 113q18 17 36 0M57 120q23 19 46 0M70 138v48m10-48v48m10-48v48M45 147l-3 31m75-31 3 31" />
          <path d="M76 149l4 4 4-4m-8 12 4 4 4-4m-8 12 4 4 4-4" />
        </g>
      )}
      {outfit === "cardigan" && (
        <>
          <path d="M66 107l14 30 14-30" fill={BUTTER} />
          <path d="M80 137v54" fill="none" />
          {[147, 160, 173, 186].map((y) => (
            <circle key={y} cx="85" cy={y} r="2" fill={BUTTER} />
          ))}
          <path d="M46 154h19v18H46m49-18h19v18H95" fill="none" />
        </>
      )}
      {outfit === "party" && (
        <g fill={CREAM} stroke="none">
          {[46, 68, 91, 113].flatMap((x, i) =>
            [128, 151, 175].map((y, j) => (
              <circle
                key={`${i}-${j}`}
                cx={x + (j % 2 ? 7 : 0)}
                cy={y}
                r="3.4"
              />
            )),
          )}
        </g>
      )}
      {outfit === "chef" && (
        <>
          <path d="M74 108v82M103 114v76" fill="none" />
          {[128, 149, 170].map((y) => (
            <g key={y}>
              <circle cx="84" cy={y} r="2.5" fill={INK} />
              <circle cx="113" cy={y} r="2.5" fill={INK} />
            </g>
          ))}
        </>
      )}
      {outfit === "turtleneck" && (
        <path d="M62 103v16q18 10 36 0v-16Z" fill={PLUM} />
      )}
      {outfit === "bowtie" && (
        <>
          <path d="M64 105l16 18 16-18" fill={CREAM} />
          <BowTie y={119} color={variant % 2 ? RED : PLUM} />
          <path d="M80 130v57" fill="none" />
        </>
      )}
      <path
        d="M28 170q4-11 13-3l10 8q3 5-3 7l-11-3M132 170q-4-11-13-3l-10 8q-3 5 3 7l11-3"
        fill={skin}
      />
    </g>
  );
}
function Accessory({ kind }: { kind: string }) {
  switch (kind) {
    case "curls":
      return (
        <g fill="#69503b">
          <path d="M44 61q-16-14-2-25-3-18 15-18 8-17 24-7 18-12 27 7 20-2 18 18 13 13-3 29l-10-26q-14 4-22-4-11 12-31 6Z" />
          <path
            d="M48 29q4-8 12-2m14-6q3-7 10-2m13 6q5-5 9 2"
            fill="none"
            stroke="#96735a"
          />
        </g>
      );
    case "bob":
      return (
        <g fill="#3e3832">
          <path d="M42 96V48q2-33 38-33 38 0 39 34l1 47-18 7V49Q81 62 56 48v55Z" />
          <path d="M61 28q18 10 37-1" stroke="#776074" fill="none" />
        </g>
      );
    case "bun":
      return (
        <g fill="#523f31">
          <circle cx="84" cy="13" r="13" />
          <path d="M46 61q-13-36 22-42 42-9 48 33l-12 3q-22 0-33-18-6 21-25 24Z" />
          <path d="M76 5q12 4 11 13" fill="none" stroke="#a38464" />
        </g>
      );
    case "beret":
      return (
        <g fill={RED}>
          <path d="M40 40q-11-19 21-25 47-14 60 16l-7 10Z" />
          <path d="M45 40q32-9 69-2l-1 9q-31-7-66 3Z" />
          <path d="M83 13l4-9" fill="none" />
        </g>
      );
    case "party-hat":
      return (
        <g>
          <path d="M57 37L83 0l24 41Z" fill={BUTTER} />
          <path d="M69 21l28 9m-34 2 39 8" stroke={RED} strokeWidth="6" />
          <circle cx="83" cy="2" r="5" fill={RED} />
          <path d="M57 37q26 9 50 4" fill="none" />
        </g>
      );
    case "flower":
      return (
        <g transform="translate(112 43)">
          <path d="M0 0l-7 27" stroke={SAGE} />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <ellipse
              key={a}
              transform={`rotate(${a})`}
              cx="0"
              cy="-8"
              rx="5"
              ry="8"
              fill={CREAM}
            />
          ))}
          <circle r="5" fill={BUTTER} />
        </g>
      );
    case "crown":
      return (
        <g>
          <path d="M48 41l-3-28 19 12L80 7l16 18 20-12-4 28Z" fill={BUTTER} />
          <path d="M50 35h61" />
          <circle cx="80" cy="30" r="3" fill={RED} />
        </g>
      );
    case "beanie":
      return (
        <g fill={RED}>
          <path d="M45 42q0-35 35-35t35 35Z" />
          <path d="M43 34q37-9 74 0v14q-37-9-74 0Z" />
          <path
            d="M59 15l-3 17m18-22v21m13-21 2 21m12-15 4 16"
            stroke="#ad3930"
            fill="none"
          />
          <circle cx="81" cy="7" r="7" />
        </g>
      );
    case "sunglasses":
      return (
        <g fill={PLUM}>
          <path d="M44 63l31-1-3 20q-22 7-28-8ZM85 62l31 1v11q-6 15-28 8Z" />
          <path d="M74 67q6-5 12 0M43 65l-9-4m82 4 10-4" fill="none" />
          <path d="M51 67l-3 8m46-8-3 8" stroke={CREAM} strokeWidth="2" />
        </g>
      );
    case "bow":
      return (
        <g fill={PLUM} transform="translate(108 31) rotate(15)">
          <path d="M-3 0q-30-25-25-1-4 19 25 8M3 0q30-25 25-1 4 19-25 8" />
          <circle cx="0" cy="4" r="5" />
        </g>
      );
    case "headphones":
      return (
        <g>
          <path
            d="M39 70V49q0-35 41-35t41 35v21"
            fill="none"
            stroke={INK}
            strokeWidth="8"
          />
          <rect x="31" y="57" width="17" height="31" rx="7" fill={BLUE} />
          <rect x="112" y="57" width="17" height="31" rx="7" fill={BLUE} />
          <path d="M119 88q0 21-22 20" fill="none" />
        </g>
      );
    case "halo":
      return (
        <ellipse
          cx="80"
          cy="12"
          rx="33"
          ry="7"
          transform="rotate(-8 80 12)"
          fill="none"
          stroke={BUTTER}
          strokeWidth="5"
        />
      );
    default:
      return null;
  }
}

export interface Customization {
  base?: string;
  accessory?: string;
  outfit?: string;
  skin?: string;
  color?: string;
}
export interface GuestArtProps {
  customization?: Customization;
  base?: string;
  variant?: number;
  className?: string;
  portrait?: boolean;
}
export function GuestArt({
  customization = {},
  base: baseProp,
  variant = 0,
  className = "",
  portrait = false,
}: GuestArtProps) {
  const base =
    customization.base ||
    baseProp ||
    BASES[((variant % BASES.length) + BASES.length) % BASES.length].id;
  const skin = safeColor(
    customization.skin,
    SKIN_TONES[Math.abs(variant) % SKIN_TONES.length].id,
  );
  const color = safeColor(
    customization.color,
    colors[Math.abs(variant) % colors.length],
  );
  const accessory = customization.accessory || "none";
  const chosenOutfit = customization.outfit || "signature";
  let drawing: ReactNode;
  const outfitFor = (defaultOutfit: string) =>
    chosenOutfit === "signature" ? defaultOutfit : chosenOutfit;
  const outfit = (defaultOutfit: string) => (
    <Outfit
      outfit={outfitFor(defaultOutfit)}
      color={color}
      variant={variant}
      skin={skin}
    />
  );
  switch (base) {
    case "astronaut":
      drawing = (
        <>
          {outfit("chef")}
          <path d="M50 109q30-11 60 0l-4 15H54Z" fill="#b7c3bf" />
          <path d="M52 142h55v34H52Z" fill="#e2e5dc" />
          <path d="M63 149h21v9H63Z" fill={BLUE} />
          <circle cx="97" cy="153" r="4" fill={RED} />
          <path d="M64 169h31" fill="none" />
          <path d="M33 143l14 4m-15 5 14 4m81-12-13 4m14 5-13 4" fill="none" />
          <path d="M37 65q0-50 43-50t43 50q2 53-43 53T37 65Z" fill="#f1f1df" />
          <path d="M45 68q0-39 35-39t35 39q0 34-35 34T45 68Z" fill="#b9d0cb" />
          <ellipse cx="80" cy="68" rx="26" ry="30" fill={skin} />
          <path
            d="M55 52q2-22 25-22 18 0 24 17-20 0-28-10-8 15-21 15"
            fill="#74604d"
          />
          <Eyes tired />
          <path d="M80 76v7h5m-13 10h13" fill="none" />
          <path
            d="M48 44q7-18 23-19"
            stroke={CREAM}
            strokeWidth="5"
            fill="none"
          />
          <path
            className="guest-straw"
            d="M89 94l16 19 13-4"
            fill="none"
            stroke={RED}
          />
          <circle cx="39" cy="75" r="7" fill={BLUE} />
          <circle cx="121" cy="75" r="7" fill={BLUE} />
        </>
      );
      break;
    case "grandma":
      drawing = (
        <>
          {outfit("cardigan")}
          <path
            d="M56 108q24 25 48 0"
            stroke={CREAM}
            strokeWidth="5"
            fill="none"
          />
          {[60, 68, 79, 90, 100].map((x, i) => (
            <circle
              key={x}
              cx={x}
              cy={112 + Math.sin((i / 4) * Math.PI) * 9}
              r="3"
              fill={CREAM}
            />
          ))}
          <path
            d="M42 80Q22 60 40 48q-7-17 8-22-1-21 20-19 16-15 30 2 22-8 27 13 20 6 11 25 18 17-1 33Z"
            fill="#e7ded5"
          />
          <path
            d="M48 58q7-28 32-25 30 0 34 27l-7 35q-6 21-27 22-25-5-30-25Z"
            fill={skin}
          />
          <path d="M51 51q15 4 25-16 15 21 36 14" fill="#e7ded5" />
          <path
            d="M42 35q10-8 15 3m18-19q8-4 13 4m26 7q8 2 5 10"
            fill="none"
            stroke="#b6ada8"
          />
          <Accessory kind="sunglasses" />
          <path d="M80 82l-3 8h7m-18 10q14 12 28-1" fill="none" />
          <path d="M62 94l-4-2m43 0-4 3" opacity=".5" />
          <circle cx="47" cy="88" r="5" fill={BUTTER} />
          <circle cx="113" cy="88" r="5" fill={BUTTER} />
        </>
      );
      break;
    case "raccoon":
      drawing = (
        <>
          <path d="M117 153q44-17 30-55-12-17-22-1 15 22-4 27" fill="#99968b" />
          <path
            d="M135 100l10-3m-10 15 12 2m-14 8 11 8"
            stroke={INK}
            strokeWidth="9"
          />
          {outfit("suit")}
          <path
            d="M49 45Q28 20 35 13q23-5 34 22m22 1q11-23 34-22 9 9-11 34"
            fill="#99968b"
          />
          <path d="M44 37l-4-14 16 11m49 1 14-11-4 15" fill={PLUM} />
          <path
            d="M41 57q6-28 39-28t39 28l11 25q-13 29-50 33-39-7-50-33Z"
            fill="#a5a397"
          />
          <path
            d="M39 66q17-16 38-3l3 13 4-13q21-13 38 3l-7 20q-20 5-35-6-15 11-35 6Z"
            fill="#3f413b"
          />
          <path d="M55 87q25-25 50 0l-10 18-15 10-15-10Z" fill={CREAM} />
          <g stroke={CREAM} strokeWidth="3.3">
            <path d="M54 73h7m38 0h7" />
          </g>
          <path d="M72 86q8-6 16 0l-8 8Z" fill={INK} />
          <path
            d="M80 95v6m-9 0q9 6 18 0M40 92l18 1m-18 7 19-2m43-4 17-3m-17 7 18 3"
            fill="none"
          />
          <path d="M68 37l12 12 13-12" fill="none" />
        </>
      );
      break;
    case "vampire":
      drawing = (
        <>
          <path d="M50 97L18 184q62 22 124 0l-32-87Z" fill={PLUM} />
          <path
            d="M55 101L32 82l3 42 20 14m50-37 23-19-3 42-20 14"
            fill={RED}
          />
          {outfit("turtleneck")}
          <path
            d="M49 64L34 58l9 24 14 3m54-21 15-6-9 24-14 3"
            fill="#d6d9be"
          />
          <path
            d="M48 48q2-32 32-32t32 32l-5 44q-6 25-27 27-22-4-27-27Z"
            fill="#d6d9be"
          />
          <path
            d="M47 61V43q2-31 33-31t33 31v18l-13-27-20 21-20-21Z"
            fill="#3c343b"
          />
          <Eyes suspicious y={70} />
          <path d="M80 75l-4 12h8m-19 8q15 12 30 0" fill="none" />
          <path d="M68 97l4 11 5-8m11 0 4 8 3-11" fill={CREAM} />
          <BowTie y={124} color={RED} />
        </>
      );
      break;
    case "plant":
      drawing = (
        <>
          <path
            d="M79 119V36M78 83q-23-34-41-37m43 52q22-35 41-37m-42 9 25-42"
            fill="none"
            stroke="#638765"
            strokeWidth="5"
          />
          <path
            d="M78 64Q44 72 26 38q34-10 52 26M81 85q30-38 61-18-13 32-61 18M80 42Q53 30 67 4q31 12 13 38M93 47q-5-33 26-38 17 32-26 38M62 95q-30 6-39-21 26-11 39 21"
            fill={SAGE}
          />
          <path
            d="M78 64L41 43m42 40 44-14M78 39 71 16m24 29 17-23"
            fill="none"
            stroke="#638765"
            strokeWidth="1.4"
          />
          <path d="M43 123h75l-9 64q-31 17-57 0Z" fill="#c67c5d" />
          <path d="M40 114h80v17H40Z" fill="#d5916d" />
          <path d="M54 138l5 42m49-42-5 42" fill="none" stroke="#b56349" />
          <Eyes x={80} y={153} />
          <path d="M75 168q6 5 12-1" fill="none" />
          <BowTie y={114} color={chosenOutfit === "signature" ? PLUM : color} />
          <path
            d="M48 148q-22-12-24 8m91-8q22-12 24 8"
            fill="none"
            stroke="#638765"
            strokeWidth="5"
          />
        </>
      );
      break;
    case "detective":
      drawing = (
        <>
          {outfit("knit")}
          <path
            d="M48 108l-13 22 17 5-7 12 34 28 35-28-7-12 17-5-13-22Z"
            fill="#bca17a"
          />
          <path d="M80 131v60" fill="none" />
          <path
            d="M50 53q0-28 30-28t31 28l-5 41q-5 20-26 22-24-5-27-22Z"
            fill={skin}
          />
          <path d="M49 57l8-22h19q-10 19-27 22" fill="#6b4d38" />
          <Eyes suspicious y={71} />
          <path d="M81 77l-5 12h10m-15 11 19-2" fill="none" />
          <path d="M46 37l10-30 22 9 26-8 10 29" fill="#bca17a" />
          <path d="M49 29q31 12 62 0v11H49Z" fill={PLUM} />
          <path d="M30 39q51-12 101 0l-4 9q-47-8-94 0Z" fill="#bca17a" />
          <g transform="rotate(-12 113 136)">
            <path d="M114 143v37" stroke="#5e4f3a" strokeWidth="7" />
            <circle cx="114" cy="126" r="19" fill="#c9ddd6" fillOpacity=".55" />
            <path d="M103 119l7-6" stroke={CREAM} strokeWidth="3" />
            <circle cx="114" cy="126" r="19" fill="none" />
          </g>
        </>
      );
      break;
    case "ghost":
      drawing = (
        <>
          <path
            d="M42 76q-1-47 37-47t39 47l5 39 18 65-20-5-11 17-17-8-16 11-17-11-15 8-12-17-17 5 20-64Z"
            fill="#f7f4e7"
          />
          <path
            d="M40 117q-14-9-18 8-8 16-13 12 6 22 23 5m87-25q14-9 18 8 8 16 13 12-6 22-23 5"
            fill="#f7f4e7"
          />
          <path
            d="M49 155l-5 16m64-23 9 23M45 77q3-27 21-32"
            stroke="#dfdfd1"
            strokeWidth="3"
            fill="none"
          />
          <Eyes y={79} />
          <ellipse cx="80" cy="98" rx="5" ry="7" fill={PLUM} />
          <path d="M53 94h8m38 0h8" stroke="#e4b6a5" strokeWidth="5" />
          <BowTie y={125} color={color} />
          {chosenOutfit === "party" && (
            <g fill={BUTTER} stroke="none">
              <circle cx="53" cy="143" r="4" />
              <circle cx="101" cy="153" r="4" />
              <circle cx="75" cy="169" r="4" />
            </g>
          )}
        </>
      );
      break;
    case "mushroom":
      drawing = (
        <>
          {outfit("overalls")}
          <path d="M58 58h44l5 37q-3 25-27 25-24 0-27-25Z" fill="#efdec1" />
          <Eyes y={88} />
          <path d="M74 103q6 5 12-1" fill="none" />
          <path d="M17 61Q20 12 80 9q57 2 63 52-54 25-126 0Z" fill={RED} />
          <path d="M17 61q59 13 126 0-15 22-63 22T17 61Z" fill="#e9c6a6" />
          <path
            d="M31 68l13 9m5-7 9 10m9-8 2 10m12-10v10m13-11-3 10m16-12-6 11m19-13-9 10"
            stroke="#b78269"
            strokeWidth="1.3"
          />
          <g fill={CREAM}>
            <path d="M41 36q-6-11 5-14 12-2 12 9-3 12-17 5Z" />
            <path d="M86 20q10-9 17 2 3 12-7 14-13-3-10-16Z" />
            <path d="M114 43q13-8 16 5-6 12-16 4Z" />
            <path d="M66 50q4-13 15-6 7 12-6 15-12-1-9-9Z" />
          </g>
        </>
      );
      break;
    case "cat":
      drawing = (
        <>
          <path
            d="M122 170q30-8 23-39-5-14-10-2"
            fill="none"
            stroke="#cc9366"
            strokeWidth="10"
          />
          {outfit("stripes")}
          <path
            d="M44 56l-3-41 30 23q12-5 22 0l26-23 1 42q11 41-39 57-48-12-37-58Z"
            fill="#d4a175"
          />
          <path d="M48 44l-2-19 15 16m42 0 12-16-1 20" fill="#d6a099" />
          <path
            d="M67 36l4 14m10-17v15m13-12-4 14M45 67l14 6m-16 3 14 4m63-13-14 6m15 3-14 4"
            fill="none"
            stroke="#986948"
            strokeWidth="4"
          />
          <Eyes y={72} />
          <path d="M74 85h12l-6 7Z" fill={PLUM} />
          <path
            d="M80 93q-3 9-12 3m12-3q3 9 12 3M51 88l-18-4m18 12-21 3m79-11 18-4m-18 12 21 3"
            fill="none"
          />
        </>
      );
      break;
    case "robot":
      drawing = (
        <>
          {outfit("chef")}
          <path d="M64 105v13h32v-13" fill="#babdb0" />
          <path d="M80 32V14" fill="none" />
          <circle cx="80" cy="10" r="6" fill={RED} />
          <rect x="38" y="35" width="84" height="75" rx="17" fill="#c4c6b5" />
          <path d="M41 88h78v8H41Z" fill="#a6ad9f" stroke="none" />
          <rect x="48" y="48" width="64" height="34" rx="9" fill="#3f5147" />
          <g className="guest-eyes" fill={BUTTER} stroke="none">
            <ellipse cx="64" cy="65" rx="6" ry="7" />
            <ellipse cx="96" cy="65" rx="6" ry="7" />
          </g>
          <path d="M66 98h28m-20-5v10m12-10v10" fill="none" />
          <path
            d="M31 54h7v32h-7q-9-16 0-32m98 0h-7v32h7q9-16 0-32"
            fill={BUTTER}
          />
          <path d="M57 43h3m40 0h3" stroke={CREAM} />
          <path d="M65 145q15-19 30 0-2 12-15 19-13-7-15-19Z" fill={RED} />
        </>
      );
      break;
    case "frog":
      drawing = (
        <>
          {outfit("bowtie")}
          <path
            d="M43 64q-10-26 12-31 18-5 23 15h5q6-20 23-15 21 5 11 31 14 25-4 39-13 13-33 13t-34-13Q27 88 43 64Z"
            fill={SAGE}
          />
          <ellipse cx="57" cy="53" rx="11" ry="13" fill={CREAM} />
          <ellipse cx="103" cy="53" rx="11" ry="13" fill={CREAM} />
          <g className="guest-eyes">
            <ellipse cx="59" cy="54" rx="3.5" ry="5" fill={INK} />
            <ellipse cx="101" cy="54" rx="3.5" ry="5" fill={INK} />
          </g>
          <path d="M46 82q34 27 68 0" fill="none" />
          <path d="M56 79h4m40 0h4" stroke="#627f62" strokeWidth="3" />
          <path d="M48 94q32 24 64 0" fill="#c0cca4" stroke="none" />
          <path d="M49 83q31 23 62 0" fill="none" />
        </>
      );
      break;
    default:
      drawing = (
        <>
          {outfit("stripes")}
          <path d="M69 93v15q11 10 22 0V93" fill={skin} />
          <path
            d="M49 54q-12-14 0-29 9-22 31-12 22-10 32 11 14 16-1 33Z"
            fill="#5b4635"
          />
          <path
            d="M48 56q5-23 31-23 28-1 32 23l-4 34q-6 23-27 26-24-6-28-26Z"
            fill={skin}
          />
          <path
            d="M47 61V43q3-24 24-21 29-13 41 18v20L96 40Q75 59 58 47Z"
            fill="#5b4635"
          />
          <path
            d="M47 65q-13-7-12 6 0 11 15 11m61-17q13-7 12 6 0 11-15 11"
            fill={skin}
          />
          <Eyes y={72} />
          <path d="M80 78l-3 10h6m-16 10q14 10 27-3" fill="none" />
          <g fill="#a2664f" stroke="none" opacity=".5">
            <circle cx="56" cy="85" r="1.4" />
            <circle cx="62" cy="88" r="1.4" />
            <circle cx="101" cy="85" r="1.4" />
            <circle cx="96" cy="88" r="1.4" />
          </g>
        </>
      );
  }
  return (
    <svg
      viewBox="0 0 160 200"
      width="160"
      height="200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`guest-art ${portrait ? "guest-art-portrait" : ""} ${className}`}
      role="img"
      aria-label={
        BASES.find((b) => b.id === base)?.label || "An unusual dinner guest"
      }
      style={
        {
          "--guest-delay": `${-Math.abs(variant * 1.83) % 13}s`,
        } as CSSProperties
      }
    >
      <g {...stroke}>
        {drawing}
        <Accessory kind={accessory} />
      </g>
    </svg>
  );
}

export function DishArt({
  dish = "spaghetti",
  className = "",
}: {
  dish?: string;
  className?: string;
}) {
  let food: ReactNode;
  switch (dish) {
    case "soup":
      food = (
        <>
          <path d="M23 32h74q-2 30-37 30T23 32Z" fill={BLUE} />
          <ellipse cx="60" cy="32" rx="37" ry="12" fill="#c98650" />
          <path
            d="M36 31q8-6 13 1m12 2 6-4m12 3 5-2"
            stroke={CREAM}
            fill="none"
          />
          <path d="M93 24l15-13" stroke="#8b8e82" strokeWidth="4" />
          <g className="dish-steam" stroke="#827a68" opacity=".6" fill="none">
            <path d="M46 17q-7-7 0-14m14 12q8-7 1-14m14 14q-6-6 0-11" />
          </g>
        </>
      );
      break;
    case "garlic-bread":
      food = (
        <>
          <path
            d="M24 39q-4-12 12-19l49-6q11 0 12 12L86 47l-51 6Z"
            fill="#c48b4e"
          />
          <path d="M28 34l14-11 47-6 4 10-13 16-44 5Z" fill={BUTTER} />
          <path
            d="M42 28l-2 12m14-14-2 12m15-14-2 12m16-14-3 12"
            stroke="#b1894e"
          />
          <path
            d="M37 34l4 2m11-5 3 3m11-4 4 1m10-5 3 3"
            stroke="#6f8a59"
            strokeWidth="3"
          />
        </>
      );
      break;
    case "cake":
      food = (
        <>
          <path d="M35 29L68 16l23 14v27H35Z" fill="#dfb88c" />
          <path d="M35 41h56v7H35Z" fill={RED} />
          <path d="M35 29l33-13 23 14-31 13Z" fill={CREAM} />
          <path
            d="M35 29q7 13 13 9 8 12 15 4l28-12v9q-6 8-11 3-6 11-13 6"
            fill={CREAM}
          />
          <path d="M67 25V10" stroke={RED} strokeWidth="4" />
          <path
            className="candle-flame"
            d="M66 9q-7-4 1-10 7 7-1 10"
            fill={BUTTER}
          />
          <circle cx="45" cy="30" r="2" fill={RED} />
          <circle cx="77" cy="29" r="2" fill={PLUM} />
        </>
      );
      break;
    case "fries":
      food = (
        <>
          <g fill={BUTTER}>
            <path d="M35 43l-5-28 8-2 6 29m1-3-1-31h8l2 30m3 2 4-34 8 1-5 35m5-1 10-29 8 3-11 30m7 1 13-23 7 4-13 24" />
          </g>
          <path d="M32 33q29 13 57 0l-6 27H40Z" fill={RED} />
          <path d="M44 43q17 7 32 0" stroke={CREAM} fill="none" />
        </>
      );
      break;
    case "dumplings":
      food = (
        <>
          {[
            [36, 37],
            [66, 27],
            [82, 45],
          ].map(([x, y], i) => (
            <g
              key={i}
              transform={`translate(${x} ${y}) rotate(${i * 12 - 10})`}
            >
              <path
                d="M-18 3q0-25 17-22Q16-22 19 3q-17 13-37 0Z"
                fill="#f0dec1"
              />
              <path
                d="M-12 1l6-14 6 16 6-16 7 14"
                fill="none"
                stroke="#bb9d76"
              />
            </g>
          ))}
          <ellipse cx="22" cy="54" rx="11" ry="5" fill={PLUM} />
        </>
      );
      break;
    case "pie":
      food = (
        <>
          <path d="M27 33h66l-7 25H34Z" fill="#bd8056" />
          <ellipse cx="60" cy="32" rx="34" ry="16" fill="#d8a564" />
          <path
            d="M31 31q29 13 58 0M36 24l46 18M47 18l44 16M29 36l43-21M39 44l44-24"
            stroke={BUTTER}
            strokeWidth="5"
          />
          <ellipse
            cx="60"
            cy="32"
            rx="34"
            ry="16"
            fill="none"
            stroke="#a87044"
            strokeWidth="4"
          />
          <path
            className="dish-steam"
            d="M55 9q-5-4-1-9m14 9q5-5 0-9"
            fill="none"
            opacity=".5"
          />
        </>
      );
      break;
    case "salad":
      food = (
        <>
          <path d="M24 35h72q-5 26-36 26T24 35Z" fill={SAGE} />
          <g fill="#80976b">
            <path d="M28 34q-10-16 7-16 6-16 17-3 13-17 21-3 16-12 19 4 18-1 10 18Z" />
            <path d="M44 26q9-17 17 2m11-5q13-10 16 2" />
          </g>
          <g fill={RED}>
            <circle cx="42" cy="30" r="7" />
            <circle cx="75" cy="19" r="7" />
            <circle cx="87" cy="34" r="6" />
          </g>
          <path d="M52 28l10-8 7 10-11 6Z" fill={CREAM} />
          <path d="M25 35q35 18 71 0" fill="none" />
        </>
      );
      break;
    case "sushi":
      food = (
        <>
          {[
            [35, 32],
            [60, 24],
            [83, 36],
            [57, 48],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <path d="M-11-4v15q11 10 22 0V-4" fill="#485744" />
              <ellipse cy="-4" rx="11" ry="8" fill={CREAM} />
              <ellipse cy="-4" rx="5" ry="3.5" fill={i % 2 ? RED : SAGE} />
            </g>
          ))}
          <path d="M96 55l9-4-2 9-8 1Z" fill={SAGE} />
          <path d="M23 58l73-37m-69 42 73-37" stroke="#ad7b50" />
        </>
      );
      break;
    case "pancakes":
      food = (
        <>
          <g fill="#d49d60">
            <path d="M30 48v7q30 17 60 0v-7" />
            <ellipse cx="60" cy="48" rx="30" ry="12" />
            <path d="M30 38v8q30 17 60 0v-8" />
            <ellipse cx="60" cy="38" rx="30" ry="12" />
            <path d="M30 29v8q30 17 60 0v-8" />
            <ellipse cx="60" cy="29" rx="30" ry="12" fill={BUTTER} />
          </g>
          <path
            d="M39 25q8-8 18-4 8-6 18 1l6 9q-5 5-7 14-9 3-8-10-12 0-13 7-9 3-8-7-13 1-6-10"
            fill="#b97643"
          />
          <path d="M54 19l10-4 9 5-9 5-10-2Z" fill="#f8e9a2" />
        </>
      );
      break;
    case "olives":
      food = (
        <>
          <path d="M30 35h60q-3 22-30 22T30 35Z" fill={BUTTER} />
          <ellipse cx="60" cy="35" rx="30" ry="10" fill="#c5b982" />
          {[
            [41, 31],
            [56, 27],
            [73, 29],
            [48, 38],
            [66, 37],
            [81, 37],
          ].map(([x, y], i) => (
            <g key={i}>
              <ellipse
                cx={x}
                cy={y}
                rx="7"
                ry="5"
                fill={i % 2 ? "#7e8d55" : "#4e6144"}
              />
              <circle cx={x + 2} cy={y} r="1.5" fill={RED} stroke="none" />
            </g>
          ))}
          <path d="M71 30l20-22" stroke="#b1895f" />
        </>
      );
      break;
    case "mystery-jelly":
      food = (
        <>
          <path d="M34 47l9-26q17-13 34 0l10 26q-27 18-53 0Z" fill="#b47b91" />
          <ellipse cx="60" cy="22" rx="17" ry="8" fill="#c596a6" />
          <path
            d="M47 25l-6 22m32-22 6 22m-19-20v25"
            stroke="#d5a7b8"
            fill="none"
          />
          <path d="M48 21q5-18 13-8 11-9 12 7" fill={CREAM} />
          <circle cx="61" cy="10" r="5" fill={RED} />
          <path d="M62 5l4-5" stroke={SAGE} />
        </>
      );
      break;
    default:
      food = (
        <>
          <ellipse cx="60" cy="39" rx="32" ry="18" fill={BUTTER} />
          <g stroke="#bd8d47" strokeWidth="2" fill="none">
            <path d="M34 35q10-20 21-5t20-7 10 16-19 8-19 2-8-15 13-9 20 2-1 14-14 1-8-9 10-6 16 9-9 8-13-3 1-7" />
            <path d="M33 43q9 9 15 1t14 6 17-5 7-11" />
          </g>
          <path d="M45 34q12-20 29-6l4 11q-20 12-33-5Z" fill={RED} />
          <path d="M57 25q-5-13 7-9l-1 8q10-10 14-2l-13 5Z" fill={SAGE} />
          <path
            d="M98 22L86 53m8-33-12 30m18-27L88 55"
            stroke="#99988b"
            strokeWidth="2"
          />
        </>
      );
  }
  return (
    <svg
      viewBox="0 0 120 76"
      width="120"
      height="76"
      xmlns="http://www.w3.org/2000/svg"
      className={`dish-art ${className}`}
      role="img"
      aria-label={
        DISHES.find((d) => d.id === dish)?.label || "A dish for the table"
      }
    >
      <g {...stroke}>
        <ellipse cx="60" cy="53" rx="51" ry="18" fill="#fbf6e7" />
        <ellipse
          cx="60"
          cy="53"
          rx="43"
          ry="13"
          fill="none"
          stroke="#a9b1a1"
          strokeWidth="1.5"
        />
        {food}
      </g>
    </svg>
  );
}

export function DecorationArt({
  kind = "flowers",
  className = "",
}: {
  kind?: string;
  className?: string;
}) {
  let drawing: ReactNode;
  switch (kind) {
    case "candle":
      drawing = (
        <>
          <ellipse cx="40" cy="98" rx="23" ry="7" fill={PLUM} />
          <path d="M40 73v22M26 95q14 8 28 0" fill="none" />
          <path d="M30 29h20v42q-10 7-20 0Z" fill={BUTTER} />
          <ellipse cx="40" cy="29" rx="10" ry="4" fill="#f9e9ae" />
          <path d="M32 31v16q5 5 6-1V33m7-1v24q6 3 5-3" fill={BUTTER} />
          <path d="M40 28v-8" fill="none" />
          <path
            className="candle-flame"
            d="M40 22q-15-8 1-21 12 14-1 21Z"
            fill="#e9b76a"
          />
          <path d="M40 19q-4-5 1-10 4 7-1 10Z" fill={RED} stroke="none" />
        </>
      );
      break;
    case "bread":
      drawing = (
        <>
          <path d="M7 62q33 12 66 0l-8 28q-25 12-50 0Z" fill="#b88c58" />
          <ellipse cx="40" cy="62" rx="33" ry="13" fill="#c9ac7b" />
          <path d="M14 61l-3-9 18-28q13-14 20 0L36 61Z" fill="#dbb174" />
          <path d="M24 41l12 6m-6-17 12 6" stroke="#a57e49" />
          <path d="M35 65l3-22q7-17 21-11 13 9 7 26l-13 9Z" fill={BUTTER} />
          <path d="M47 39l10 5m-14 4 12 6" stroke="#b38d53" />
          <path
            d="M17 72l5 17m6-15 2 18m10-17v19m10-20-2 18m13-20-5 17M16 82h48"
            fill="none"
            stroke="#8e6a43"
            strokeWidth="1.5"
          />
        </>
      );
      break;
    case "wine":
      drawing = (
        <>
          <ellipse cx="40" cy="100" rx="18" ry="5" fill="#efe7d2" />
          <path
            d="M40 62v35M21 11h38l-3 34q-2 18-16 18T24 45Z"
            fill="#f4efe1"
            fillOpacity=".55"
          />
          <path d="M23 31q17 7 34 0l-2 15q-2 13-15 13T26 46Z" fill={PLUM} />
          <path d="M29 17l2 14m0 8 2 8" stroke={CREAM} fill="none" />
        </>
      );
      break;
    case "salt":
      drawing = (
        <>
          <path d="M10 54l5-18h19l5 18v43q-15 8-29 0Z" fill={CREAM} />
          <path d="M14 37v-9q11-7 21 0v9Z" fill={BLUE} />
          <path d="M17 29h2m5-2h1m5 2h1" />
          <path d="M43 60l5-18h19l5 18v37q-15 8-29 0Z" fill="#b59d7b" />
          <path d="M47 43v-9q11-7 21 0v9Z" fill={PLUM} />
          <path d="M50 35h2m5-2h1m5 2h1" />
          <path d="M17 59v29m33-23v23" stroke={CREAM} fill="none" />
        </>
      );
      break;
    case "tomatoes":
      drawing = (
        <>
          <ellipse cx="40" cy="88" rx="35" ry="11" fill={CREAM} />
          <path
            d="M10 70q-5-27 22-25 22-12 29 14 6 26-21 29T10 70Z"
            fill={RED}
          />
          <path d="M29 50l-9-8 13 3 4-11 4 12 15-3-12 11-5-6Z" fill={SAGE} />
          <path
            d="M40 77q1-18 19-18 18-2 18 17-2 17-21 17-14-1-16-16Z"
            fill="#d68f4d"
          />
          <path d="M59 61l-6-6 8 2 5-7-1 10 9 2-10 3Z" fill={SAGE} />
          <path d="M18 61q1-6 8-8m20 21q1-5 5-7" stroke="#e8a58c" fill="none" />
        </>
      );
      break;
    case "teapot":
      drawing = (
        <>
          <path
            d="M21 52q-19-10-17 9 0 19 18 18"
            fill="none"
            stroke={BLUE}
            strokeWidth="8"
          />
          <path d="M59 53l12-11 6 4-6 22-13 10" fill={BLUE} />
          <path
            d="M22 44h35q13 16 8 35-5 18-26 18-22 0-25-18-6-19 8-35Z"
            fill={BLUE}
          />
          <path d="M22 44q17-9 35 0Z" fill="#b9c8ce" />
          <ellipse cx="40" cy="36" rx="5" ry="4" fill={BLUE} />
          <path d="M21 63q20 12 42 0" fill="none" stroke={CREAM} />
          <path
            className="dish-steam"
            d="M36 25q-8-8-1-17m12 15q6-7 0-15"
            fill="none"
            opacity=".6"
          />
        </>
      );
      break;
    case "napkin":
      drawing = (
        <>
          <ellipse
            cx="40"
            cy="95"
            rx="31"
            ry="8"
            fill="#dbd1b9"
            stroke="none"
          />
          <path d="M10 91L40 19l30 72Z" fill={CREAM} />
          <path d="M40 19L32 89l38 2Z" fill="#ece2cb" />
          <path d="M40 19L10 91l22-2" fill="none" />
          <path d="M24 76l8-19 7 15-3 10Z" fill={RED} />
          <path d="M47 76l5-13 5 13" stroke={SAGE} fill="none" />
        </>
      );
      break;
    default:
      drawing = (
        <>
          <path
            d="M38 72l-9-42m13 41 8-49m-9 50 20-32m-22 31-25-23"
            stroke="#6c8961"
            fill="none"
          />
          <path
            d="M32 52q-17-1-17-15 18-4 17 15m13-2q1-18 18-17 2 17-18 17"
            fill={SAGE}
          />
          <path d="M28 71h25l5 23q-19 13-35 0Z" fill={BLUE} />
          <path d="M29 80q12 7 25 0" stroke="#7d94a6" fill="none" />
          {[
            [27, 25, CREAM],
            [51, 17, RED],
            [63, 36, BUTTER],
            [14, 43, PLUM],
          ].map(([x, y, c], i) => (
            <g key={i} transform={`translate(${x} ${y})`} fill={String(c)}>
              {[0, 72, 144, 216, 288].map((a) => (
                <ellipse
                  key={a}
                  cx="0"
                  cy="-6"
                  rx="4"
                  ry="7"
                  transform={`rotate(${a})`}
                />
              ))}
              <circle r="3.5" fill={i % 2 ? BUTTER : RED} />
            </g>
          ))}
        </>
      );
  }
  return (
    <svg
      viewBox="0 0 80 110"
      width="80"
      height="110"
      xmlns="http://www.w3.org/2000/svg"
      className={`decoration-art ${className}`}
      role="img"
      aria-label={
        DECORATIONS.find((d) => d.id === kind)?.label || "Wildflowers"
      }
    >
      <g {...stroke}>{drawing}</g>
    </svg>
  );
}

/** A vacant place, drawn with the same materials as the guests. */
export function EmptyChair({
  className = "",
  color = "#a1ae92",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 160 200"
      width="160"
      height="200"
      xmlns="http://www.w3.org/2000/svg"
      className={`empty-chair-art ${className}`}
      role="img"
      aria-label="An empty chair waiting for a guest"
    >
      <g {...stroke} fill={safeColor(color, SAGE)}>
        <path d="M42 177l-6 22m82-22 6 22" />
        <path d="M40 179V75q40-19 80 0v104" />
        <path d="M49 83v57m20-63v58m22-58v58m20-52v57" fill="none" />
        <path d="M39 145q40-18 82 0l10 33q-49 18-102 0Z" />
        <path d="M37 158q43-17 86 0" fill="none" stroke="#62785d" />
      </g>
    </svg>
  );
}
