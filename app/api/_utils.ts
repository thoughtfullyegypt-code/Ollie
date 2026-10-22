import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isIP } from "node:net";
import { config, trustedProxyHeadersEnabled } from "@/lib/config";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const same = new URL(request.url).origin;
  if (!origin || (origin !== same && origin !== config.url))
    throw Object.assign(
      new Error("This request must come from this website."),
      { status: 403 },
    );
}
export async function body(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") || 0) > 16_384)
    throw Object.assign(new Error("Request is too large."), { status: 413 });
  const text = await request.text();
  if (text.length > 16_384)
    throw Object.assign(new Error("Request is too large."), { status: 413 });
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Please send valid JSON."), { status: 400 });
  }
}
export function fail(error: unknown) {
  if (error instanceof ZodError)
    return json({ error: error.issues.map((x) => x.message).join(" ") }, 400);
  const e = error as {
    status?: number;
    statusCode?: number;
    code?: string;
    message?: string;
  };
  const status = e.status || e.statusCode || (e.code === "23505" ? 409 : 500);
  // Do not expose SQL, payment payloads, tokens, or infrastructure details.
  if (status >= 500) {
    const reference = randomUUID();
    // Operational metadata only: never log request bodies, URLs, tokens, SQL,
    // email addresses, invitation links, or payment payloads.
    console.error(
      JSON.stringify({
        event: "request_failed",
        reference,
        status,
        category:
          typeof e.code === "string" && /^[A-Z0-9_]{1,40}$/.test(e.code)
            ? e.code
            : "INTERNAL",
      }),
    );
    return json(
      {
        error:
          "Something went wrong. Your seats and payment status are safe to check again.",
        reference,
      },
      status,
    );
  }
  return json(
    { error: e.message || "The request could not be completed." },
    status,
  );
}
export function actorHash(request: Request) {
  const key = process.env.BETTER_AUTH_SECRET || "local-no-identity";
  // Next.js does not expose a verified socket peer here. Never use arbitrary
  // X-Forwarded-For as an identity: a direct client can freely forge it. With no
  // verified edge we deliberately use a conservative shared abuse bucket.
  const candidate = trustedProxyHeadersEnabled()
    ? request.headers.get("x-real-ip")?.trim()
    : undefined;
  const address =
    candidate && isIP(candidate) ? candidate : "shared-unverified-edge";
  return createHash("sha256").update(`${key}:${address}`).digest("hex");
}
export function seatId(raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1 || id > 10000)
    throw Object.assign(new Error("Seat number must be from 1 to 10,000."), {
      status: 400,
    });
  return id;
}
