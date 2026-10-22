import { z } from "zod";
import { json, fail } from "../_utils";
export function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Vary", "Cookie");
  return response;
}
export function giftJson(value: unknown, status = 200) {
  return privateResponse(json(value, status));
}
export function giftFail(error: unknown) {
  return privateResponse(fail(error));
}
export function giftId(value: string) {
  return z.string().uuid().parse(value);
}
export const emptyInput = z.object({}).strict();
