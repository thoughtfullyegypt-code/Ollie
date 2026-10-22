import { z } from "zod";
import { react } from "@/lib/domain";
import {
  actorHash,
  assertOrigin,
  body,
  fail,
  json,
  seatId,
} from "../../../_utils";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    const input = z
      .object({ idempotencyKey: z.string().min(8).max(100) })
      .parse(await body(request));
    return json(
      await react(
        seatId((await params).id),
        actorHash(request),
        input.idempotencyKey,
      ),
    );
  } catch (e) {
    return fail(e);
  }
}
