import type { Metadata, Viewport } from "next";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/400-italic.css";
import "./globals.css";
const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_URL ||
      process.env.BETTER_AUTH_URL ||
      "http://localhost:3000",
  ),
  title: { default: `${brand} — Come sit with us.`, template: `%s · ${brand}` },
  description:
    "The internet is a weird place. Come sit with us. One shared illustrated dinner table. 10,000 seats. Bring a dish and a little of yourself.",
  robots: {
    index: process.env.APP_MODE === "production",
    follow: process.env.APP_MODE === "production",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f2e8",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to the table
        </a>
        {children}
      </body>
    </html>
  );
}
