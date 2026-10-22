import { z } from "zod";
import { reportGuest } from "@/lib/domain";
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
      .object({ reason: z.string().trim().min(3).max(1000) })
      .parse(await body(request));
    return json(
      await reportGuest(
        seatId((await params).id),
        actorHash(request),
        input.reason,
      ),
    );
  } catch (e) {
    return fail(e);
  }
}
