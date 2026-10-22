import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "./db";
import { config, devToolsEnabled, trustedProxyHeadersEnabled } from "./config";

export type MailEntry = { email: string; url: string; createdAt: string };
const mailDirectory = path.join(
  process.env.DEV_DATA_DIR ||
    path.resolve(process.cwd(), "..", ".seat-at-internet-data"),
  "dev-mail",
);
function mailbox(email: string) {
  return path.join(
    mailDirectory,
    `${createHash("sha256").update(email.toLowerCase()).digest("hex")}.json`,
  );
}
export async function readDevInbox(email: string): Promise<MailEntry[]> {
  if (!devToolsEnabled()) return [];
  try {
    const entries = JSON.parse(
      await readFile(mailbox(email), "utf8"),
    ) as MailEntry[];
    return entries
      .filter(
        (x) => Date.now() - new Date(x.createdAt).getTime() < 10 * 60 * 1000,
      )
      .slice(-3);
  } catch {
    return [];
  }
}
function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error(
      "Authentication requires BETTER_AUTH_SECRET with at least 32 random characters.",
    );
  return betterAuth({
    appName: config.brand,
    baseURL: config.url,
    secret,
    database: pool,
    trustedOrigins: [config.url],
    // Trust a single sanitized edge header only after an operator verifies that
    // direct origin access is blocked and the edge overwrites incoming headers.
    advanced: {
      ipAddress: {
        ipAddressHeaders: trustedProxyHeadersEnabled() ? ["x-real-ip"] : [],
      },
    },
    emailAndPassword: { enabled: false },
    user: {
      additionalFields: {
        role: { type: "string", defaultValue: "user", input: false },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: devToolsEnabled() ? 100 : 20,
    },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const admins = (process.env.ADMIN_EMAILS || "")
              .toLowerCase()
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            return {
              data: {
                ...user,
                role: admins.includes(user.email.toLowerCase())
                  ? "admin"
                  : "user",
              },
            };
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: 600,
        rateLimit: { window: 60, max: devToolsEnabled() ? 100 : 5 },
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => {
          if (devToolsEnabled()) {
            // The local inbox is deliberately usable without an email provider.
            // Never deploy this development-only tool with real customer records.
            if (!email.toLowerCase().endsWith("@example.test"))
              throw new Error(
                "Development sign-in only accepts @example.test addresses.",
              );
            await mkdir(mailDirectory, { recursive: true, mode: 0o700 });
            const entries = await readDevInbox(email);
            entries.push({ email, url, createdAt: new Date().toISOString() });
            await writeFile(mailbox(email), JSON.stringify(entries.slice(-3)), {
              mode: 0o600,
            });
            return;
          }
          if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
            throw new Error("Sign-in email delivery is not configured.");
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: process.env.EMAIL_FROM,
              to: email,
              subject: `Your place at ${config.brand}`,
              text: `Come on in. Sign in to ${config.brand}:\n\n${url}\n\nThis link expires in ten minutes. If you did not request it, you can ignore this email.`,
            }),
          });
          if (!response.ok)
            throw new Error(
              "Sign-in email could not be delivered. Please try again later.",
            );
        },
      }),
    ],
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return instance || (instance = createAuth());
}
export async function getSession(requestHeaders?: Headers) {
  return getAuth().api.getSession({
    headers: requestHeaders || (await headers()),
  });
}
export async function requireUser(requestHeaders?: Headers) {
  const session = await getSession(requestHeaders);
  if (!session?.user?.id || !session.user.emailVerified)
    throw Object.assign(
      new Error("Sign in with a verified email to continue."),
      { status: 401 },
    );
  const current = await pool.query(
    'SELECT "emailVerified",deleted_at FROM "user" WHERE id=$1',
    [session.user.id],
  );
  if (!current.rows[0]?.emailVerified || current.rows[0].deleted_at)
    throw Object.assign(new Error("This account is no longer active."), {
      status: 401,
    });
  return session.user;
}
export async function requireAdmin(requestHeaders?: Headers) {
  const user = await requireUser(requestHeaders);
  // Read the current role server-side; revocation takes effect immediately.
  const result = await pool.query(
    'SELECT role FROM "user" WHERE id = $1 AND deleted_at IS NULL',
    [user.id],
  );
  if (result.rows[0]?.role !== "admin")
    throw Object.assign(new Error("Administrator access required."), {
      status: 403,
    });
  return user;
}
