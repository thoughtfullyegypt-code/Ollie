import type { Metadata } from "next";
import GiftBuilder from "@/components/gift-builder";
export const metadata: Metadata = {
  title: "A Seat Saved for You",
  description:
    "Two peculiar guests. One very personal invitation. Create a small illustrated dinner surprise for someone you love.",
};
export default function SaveASeatPage() {
  return (
    <GiftBuilder
      brandName={process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet"}
    />
  );
}
