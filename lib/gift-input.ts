import { z } from "zod";

export const GIFT_OCCASIONS = [
  "birthday",
  "congratulations",
  "thank-you",
  "miss-you",
  "just-because",
] as const;
export const GIFT_PROPS = [
  "cake",
  "banner",
  "flowers",
  "wave",
  "bread-heart",
] as const;
export type GiftOccasion = (typeof GIFT_OCCASIONS)[number];
export type GiftProp = (typeof GIFT_PROPS)[number];
export type GiftCustomization = {
  base: string;
  accessory: string;
  outfit: string;
  skin: string;
  color: string;
};
export type GiftInput = {
  occasion: GiftOccasion;
  senderName: string;
  recipientName: string;
  message: string;
  senderCustomization: GiftCustomization;
  recipientCustomization: GiftCustomization;
  dish: string;
  prop: GiftProp;
  sourceSeatId?: number;
};
export type GiftStatus =
  "draft" | "awaiting_payment" | "ready" | "revoked" | "unavailable";
export type GiftRecord = GiftInput & {
  id: string;
  status: GiftStatus;
  senderSeatId: number | null;
  recipientSeatId: number | null;
  orderId: string | null;
  packageId: "one" | "two" | null;
  amount: number;
  currency: "usd";
  createdAt: string;
  updatedAt: string;
  thankYouAt: string | null;
  claimedAt: string | null;
  claimedBy: string | null;
  firstReadAt: string | null;
  linkCreatedAt: string | null;
  isDemo: boolean;
  explanation?: string;
  hasLink: boolean;
};
export type GiftPreparation = {
  gift: GiftRecord;
  packageId: "one" | "two" | null;
  seatIds: number[];
  amount: number;
  sourceSeatId: number | null;
  recipientSeatId: number | null;
  explanation: string;
  requiresPayment: boolean;
};
export type RecipientGift = Omit<GiftRecord, "claimedBy"> & {
  claimed: boolean;
  senderName: string;
  recipientName: string;
};
export const giftBasicSchema = z
  .object({
    occasion: z.enum(GIFT_OCCASIONS),
    senderName: z.string().trim().min(1).max(30),
    recipientName: z.string().trim().min(1).max(30),
    message: z.string().trim().min(1).max(1000),
    senderCustomization: z.record(z.string(), z.string()),
    recipientCustomization: z.record(z.string(), z.string()),
    dish: z.string().max(40),
    prop: z.enum(GIFT_PROPS),
    sourceSeatId: z.number().int().min(1).max(10000).optional(),
  })
  .strict();
