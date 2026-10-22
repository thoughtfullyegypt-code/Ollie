import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getOrder } from "@/lib/domain";
import { getStripe } from "@/lib/payments";
import { pool } from "@/lib/db";
import { fail, json } from "../../../_utils";
export const dynamic = "force-dynamic";
/** Receipts remain private: resolve only after verifying the exact order owner. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request.headers);
    const order = await getOrder(user.id, (await params).id);
    if (order.provider !== "stripe")
      return json(
        {
          error:
            "Development orders collect no payment and have no payment receipt.",
        },
        409,
      );
    if (
      !["paid", "refund_requested", "refunded", "disputed"].includes(
        order.status,
      )
    )
      return json(
        {
          error:
            "A payment receipt is available after the provider confirms a completed payment.",
        },
        409,
      );
    const stored = (
      await pool.query(
        "SELECT payment_intent_id FROM orders WHERE id=$1 AND user_id=$2",
        [order.id, user.id],
      )
    ).rows[0];
    if (!stored?.payment_intent_id)
      return json(
        {
          error:
            "The provider receipt is not available yet. Please ask support with your order reference.",
        },
        409,
      );
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(
      stored.payment_intent_id,
      { expand: ["latest_charge"] },
    );
    const charge =
      typeof intent.latest_charge === "string"
        ? await stripe.charges.retrieve(intent.latest_charge)
        : intent.latest_charge;
    if (!charge?.receipt_url)
      return json(
        {
          error:
            "The provider receipt is not available yet. Please try again later.",
        },
        409,
      );
    const receipt = new URL(charge.receipt_url);
    if (
      receipt.protocol !== "https:" ||
      receipt.username ||
      receipt.password ||
      !(
        receipt.hostname === "stripe.com" ||
        receipt.hostname.endsWith(".stripe.com")
      )
    )
      throw Object.assign(
        new Error("The provider returned an unsafe receipt address."),
        { status: 502 },
      );
    return NextResponse.redirect(receipt, {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
