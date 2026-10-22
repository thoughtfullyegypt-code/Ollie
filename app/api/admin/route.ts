import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import {
  adminData,
  moderate,
  requestRefund,
  updateSettings,
} from "@/lib/domain";
import { issueRefund, reconcileOrder } from "@/lib/payments";
import { publicConfig, launchBlockers } from "@/lib/config";
import { pool } from "@/lib/db";
import { getJourneySummary } from "@/lib/analytics";
import { assertOrigin, body, fail, json } from "../_utils";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireAdmin(request.headers);
    const params = new URL(request.url).searchParams;
    return json({
      ...(await adminData(
        user.id,
        (params.get("q") || "").slice(0, 100),
        Math.max(1, Number(params.get("page")) || 1),
      )),
      config: publicConfig(),
      launchBlockers: launchBlockers(),
      journey: await getJourneySummary(user.id),
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await requireAdmin(request.headers);
    const input = z
      .object({
        action: z.enum([
          "approve",
          "hide",
          "restore",
          "disable_link",
          "private",
          "refund",
          "reconcile",
          "settings",
        ]),
        seatId: z.number().int().min(1).max(10000).optional(),
        orderId: z.string().min(1).max(100).optional(),
        reason: z.string().trim().max(1000).optional(),
        settings: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(await body(request));
    if (input.action === "settings")
      return json(await updateSettings(user.id, input.settings || {}));
    if (input.action === "refund") {
      if (!input.orderId || !input.reason || input.reason.length < 3)
        return json(
          { error: "An order and a refund reason are required." },
          400,
        );
      await requestRefund(user.id, input.orderId, input.reason);
      return json(await issueRefund(input.orderId, input.reason, user.id));
    }
    if (input.action === "reconcile") {
      if (!input.orderId) return json({ error: "An order is required." }, 400);
      const result = await reconcileOrder(input.orderId);
      await pool.query(
        "INSERT INTO audit_events(id,actor_id,action,target,details) VALUES($1,$2,$3,$4,$5)",
        [
          randomUUID(),
          user.id,
          "order.reconciled",
          input.orderId,
          JSON.stringify(result),
        ],
      );
      return json(result);
    }
    if (!input.seatId)
      return json({ error: "Choose a seat to moderate." }, 400);
    return json(
      await moderate(user.id, input.seatId, input.action, input.reason),
    );
  } catch (e) {
    return fail(e);
  }
}
