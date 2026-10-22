import { requireUser } from "@/lib/auth";
import { getOrder } from "@/lib/domain";
import { assertOrigin, fail, json } from "../../_utils";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request.headers);
    return json(await getOrder(user.id, (await params).id));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    const user = await requireUser(request.headers);
    const order = await getOrder(user.id, (await params).id);
    if (order.status !== "checkout_pending")
      return json(
        { error: "Only an unfinished checkout can be resumed." },
        409,
      );
    if (order.provider === "development")
      return json({ orderId: order.id, mode: "development", order });
    const { createHostedCheckout } = await import("@/lib/payments");
    const checkout = await createHostedCheckout(
      {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        packageId: order.packageId,
        seatIds: order.seatIds,
      },
      user.email,
    );
    return json({ orderId: order.id, mode: "stripe", url: checkout.url });
  } catch (e) {
    return fail(e);
  }
}
