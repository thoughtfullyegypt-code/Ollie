import { ImageResponse } from "next/og";
import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  type ReactNode,
} from "react";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GuestArt, DishArt, EmptyChair } from "@/components/art/illustrations";

// Satori requires intrinsic SVG nodes. Resolve our pure drawing layers before rendering.
function resolveSvg(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(resolveSvg);
  if (!isValidElement<{ children?: ReactNode }>(node)) return node;
  if (node.type === Fragment) return resolveSvg(node.props.children);
  if (typeof node.type === "function")
    return resolveSvg((node.type as (props: unknown) => ReactNode)(node.props));
  return cloneElement(
    node,
    undefined,
    ...Children.toArray(node.props.children).map(resolveSvg),
  );
}

const fontFiles = Promise.all([
  readFile(
    join(
      process.cwd(),
      "node_modules/@fontsource/fraunces/files/fraunces-latin-500-normal.woff",
    ),
  ),
  readFile(
    join(
      process.cwd(),
      "node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff",
    ),
  ),
  readFile(
    join(
      process.cwd(),
      "node_modules/@fontsource/dm-sans/files/dm-sans-latin-600-normal.woff",
    ),
  ),
]);
function sizedArt(node: ReactNode, width: number, height: number) {
  const drawing = resolveSvg(node);
  return isValidElement(drawing)
    ? cloneElement(
        drawing as React.ReactElement<{ width: number; height: number }>,
        { width, height },
      )
    : drawing;
}

type ShareGuest = {
  displayName: string;
  seatId: number;
  dish?: string;
  customization?: Record<string, string | undefined>;
};

export async function tableCard({
  guest,
  seatId,
  invitation = false,
  headline,
  subtitle,
  eyebrow,
  footer,
}: {
  guest?: ShareGuest | null;
  seatId: number;
  invitation?: boolean;
  headline?: string;
  subtitle?: string;
  eyebrow?: string;
  footer?: string;
}) {
  const [displayFont, interfaceFont, boldFont] = await fontFiles;
  const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet";
  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        display: "flex",
        position: "relative",
        background: "#f7f3e8",
        color: "#29372b",
        overflow: "hidden",
        fontFamily: "DM Sans",
      }}
    >
      <div
        style={{
          position: "absolute",
          display: "flex",
          top: 42,
          left: 58,
          right: 58,
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 22,
        }}
      >
        <span style={{ fontWeight: 800 }}>{brand}</span>
        <span style={{ fontSize: 15, letterSpacing: 3, color: "#66745f" }}>
          THERE IS ROOM FOR YOU.
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          display: "flex",
          top: 117,
          left: 58,
          width: 580,
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            color: "#b7402b",
            fontSize: 15,
            letterSpacing: 3,
            marginBottom: 18,
          }}
        >
          {eyebrow ||
            (invitation
              ? "AN INVITATION TO SOMETHING ODD"
              : `A GUEST AT SEAT ${seatId.toLocaleString("en-US")}`)}
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Fraunces",
            fontWeight: 500,
            fontSize: invitation
              ? 64
              : (guest?.displayName.length || 0) > 20
                ? 58
                : 72,
            lineHeight: 1.02,
            letterSpacing: -2,
          }}
        >
          {headline ||
            (invitation
              ? "I saved you a seat."
              : guest?.displayName || "This could be your chair.")}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 24,
            lineHeight: 1.45,
            maxWidth: 520,
          }}
        >
          {subtitle ||
            (invitation
              ? "At the internet’s longest dinner table. Bring your beautifully peculiar self."
              : "The internet is a weird place. Come sit with us.")}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          display: "flex",
          right: 45,
          bottom: 142,
          width: 480,
          height: 290,
          alignItems: "flex-end",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            width: invitation ? 230 : 280,
            height: invitation ? 288 : 350,
          }}
        >
          {sizedArt(
            guest ? (
              <GuestArt customization={guest.customization} portrait />
            ) : (
              <EmptyChair />
            ),
            invitation ? 230 : 280,
            invitation ? 288 : 350,
          )}
        </div>
        {invitation && (
          <svg width="180" height="215" viewBox="0 0 180 215">
            <g
              stroke="#29372b"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M32 184 43 79Q90 65 137 79l12 105" fill="#e2b451" />
              <path d="m40 162-6 47m105-47 8 47" fill="none" />
              <path d="M38 168q52 24 104 0l-6-34H44Z" fill="#bcd0bb" />
              <path d="m72 123 26-40 22 39-23 16Z" fill="#fff9ec" />
              <path d="m99 86-1 44" fill="none" strokeWidth="2" />
            </g>
          </svg>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          display: "flex",
          left: -30,
          right: -30,
          bottom: -40,
          height: 228,
          transform: "rotate(-4deg)",
          backgroundColor: "#f2d6cc",
          backgroundImage:
            "linear-gradient(90deg, rgba(184,72,51,.12) 50%, transparent 50%), linear-gradient(rgba(184,72,51,.12) 50%, transparent 50%)",
          backgroundSize: "48px 48px",
          borderTop: "4px solid #29372b",
          borderBottom: "4px solid #29372b",
        }}
      />
      <div
        style={{
          position: "absolute",
          display: "flex",
          bottom: 61,
          right: 117,
          width: 170,
          height: 108,
          transform: "rotate(-5deg)",
        }}
      >
        {sizedArt(<DishArt dish={guest?.dish || "garlic-bread"} />, 170, 108)}
      </div>
      <div
        style={{
          position: "absolute",
          display: "flex",
          bottom: 47,
          left: 58,
          fontSize: 17,
          fontWeight: 700,
          background: "#f7f3e8",
          border: "2px solid #29372b",
          borderRadius: 50,
          padding: "12px 20px",
        }}
      >
        {footer ||
          (invitation
            ? `SEAT ${seatId.toLocaleString("en-US")} · A PLACE BESIDE ME`
            : `SEAT ${seatId.toLocaleString("en-US")} · COME MEET THE NEIGHBORS`)}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Fraunces", data: displayFont, weight: 500, style: "normal" },
        { name: "DM Sans", data: interfaceFont, weight: 400, style: "normal" },
        { name: "DM Sans", data: boldFont, weight: 600, style: "normal" },
      ],
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${invitation ? "saved-you-a-seat" : `seat-${seatId}`}.png"`,
      },
    },
  );
}
