import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { updateProfile, profileSchema } from "@/lib/domain";
import { assertOrigin, body, fail, json, seatId } from "../../_utils";
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    const user = await requireUser(request.headers);
    const input = profileSchema.parse(await body(request));
    return json(await updateProfile(user.id, seatId((await params).id), input));
  } catch (e) {
    return fail(e);
  }
}
