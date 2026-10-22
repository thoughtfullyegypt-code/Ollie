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
import { GuestArt, DishArt } from "@/components/art/illustrations";
import { GiftEnvelope } from "@/components/art/gift-art";
import { getGiftSharePreview } from "@/lib/gifts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve our pure original SVG layers into intrinsic nodes for Satori. No gift
// names, letter, private URLs or credentials enter the image renderer.
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
function art(node: ReactNode, width: number, height: number) {
  const drawing = resolveSvg(node);
  return isValidElement(drawing)
    ? cloneElement(
        drawing as React.ReactElement<{ width: number; height: number }>,
        { width, height },
      )
    : drawing;
}
const fonts = Promise.all([
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
const defaultArt = {
  senderCustomization: {
    base: "raccoon",
    accessory: "none",
    outfit: "suit",
    skin: "#bd805a",
    color: "#776074",
  },
  recipientCustomization: {
    base: "plant",
    accessory: "sunglasses",
    outfit: "bowtie",
    skin: "#bd805a",
    color: "#9baf8d",
  },
  dish: "garlic-bread",
  isDemo: false,
};
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // The shared default image is intentionally unrelated to any gift record.
  // A gift UUID grants artwork access only, never letter or claim access.
  if (
    id !== "default" &&
    id !== "invitation" &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    return new Response("Invitation image not found.", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  const gift =
    id === "default" || id === "invitation"
      ? defaultArt
      : await getGiftSharePreview(id);
  if (!gift)
    return new Response("Invitation image not found.", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  const [displayFont, textFont, boldFont] = await fonts;
  const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet";
  const response = new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        position: "relative",
        display: "flex",
        overflow: "hidden",
        background: "#f7f3e8",
        color: "#29372b",
        fontFamily: "DM Sans",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 55,
          right: 55,
          top: 37,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 600 }}>{brand}</span>
        <span style={{ fontSize: 13, letterSpacing: 3, color: "#68745d" }}>
          A SEAT SAVED FOR YOU
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          display: "flex",
          flexDirection: "column",
          left: 55,
          top: 142,
          width: 610,
        }}
      >
        <span
          style={{
            fontSize: 13,
            letterSpacing: 3,
            color: "#b7402b",
            marginBottom: 20,
          }}
        >
          {gift.isDemo
            ? "DEVELOPMENT INVITATION"
            : "A LITTLE ROOM FOR SOMEONE SPECIAL"}
        </span>
        <span
          style={{
            display: "flex",
            fontFamily: "Fraunces",
            fontSize: 72,
            lineHeight: 1.04,
            maxWidth: 600,
          }}
        >
          Someone saved you a seat.
        </span>
        <span
          style={{
            display: "flex",
            fontSize: 24,
            lineHeight: 1.5,
            maxWidth: 540,
            marginTop: 25,
          }}
        >
          A little surprise is waiting at the table.
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          display: "flex",
          left: 641,
          top: 207,
          width: 236,
          height: 308,
        }}
      >
        {art(<GuestArt customization={gift.senderCustomization} />, 236, 308)}
      </div>
      <div
        style={{
          position: "absolute",
          display: "flex",
          left: 895,
          top: 191,
          width: 236,
          height: 308,
        }}
      >
        {art(
          <GuestArt customization={gift.recipientCustomization} />,
          236,
          308,
        )}
      </div>
      <div
        style={{
          position: "absolute",
          display: "flex",
          left: -30,
          right: -30,
          height: 190,
          top: 440,
          transform: "rotate(-3deg)",
          backgroundColor: "#efd3bf",
          backgroundImage:
            "linear-gradient(90deg, #b75a3b24 50%, transparent 50%), linear-gradient(#b75a3b24 50%, transparent 50%)",
          backgroundSize: "38px 38px",
          borderTop: "3px solid #6f654f",
        }}
      />
      <div
        style={{
          position: "absolute",
          display: "flex",
          left: 787,
          top: 453,
          width: 192,
          height: 118,
        }}
      >
        {art(<DishArt dish={gift.dish} />, 192, 118)}
      </div>
      <div
        style={{
          position: "absolute",
          display: "flex",
          left: 1018,
          top: 394,
          width: 158,
          height: 122,
          transform: "rotate(8deg)",
        }}
      >
        {art(<GiftEnvelope />, 158, 122)}
      </div>
      <div
        style={{
          position: "absolute",
          display: "flex",
          left: 55,
          bottom: 39,
          padding: "13px 19px",
          border: "2px solid #364331",
          background: "#f7f3e8",
          borderRadius: 35,
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        {gift.isDemo
          ? "DEMONSTRATION · NO REAL CHARGE"
          : "A LITTLE DINNER. A PERSONAL SURPRISE."}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Fraunces", data: displayFont, weight: 500 },
        { name: "DM Sans", data: textFont, weight: 400 },
        { name: "DM Sans", data: boldFont, weight: 600 },
      ],
    },
  );
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (new URL(request.url).searchParams.get("download") === "1")
    response.headers.set(
      "Content-Disposition",
      'attachment; filename="gift-invitation.png"',
    );
  return response;
}
