"use client";
/** First-party, consent-aware journey measurements. No URLs, private link tokens,
 * visitor identifiers, emails, display names, or payment values are collected. */
export type ClientJourneyEvent =
  | "main_cta_clicked"
  | "builder_opened"
  | "customization_completed"
  | "seat_selected"
  | "package_selected"
  | "checkout_started"
  | "invitation_link_opened"
  | "share_action_invoked";
export type JourneyAttribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  referralId?: string;
  capturedAt?: string;
};
export type JourneyProperties = {
  seatId?: number;
  packageId?: "one" | "two" | "six" | "celebration";
  count?: number;
  stage?: number;
  method?: "native" | "copy" | "download" | "recording";
  placement?:
    | "header"
    | "hero"
    | "mobile"
    | "table"
    | "footer"
    | "profile"
    | "invitation"
    | "builder"
    | "account";
  invitationType?: "courtesy" | "paid";
};
export type JourneyConsent = "granted" | "denied" | "unset";
type Settings = { enabled: boolean; consentRequired: boolean; adapter: string };
const ATTRIBUTION_KEY = "dinner-attribution-v1",
  CONSENT_KEY = "dinner-analytics-consent-v1",
  WINDOW_MS = 30 * 86400000;
let settings: Settings | undefined,
  settingsPromise: Promise<Settings> | undefined;
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function privacySignal() {
  if (typeof navigator === "undefined") return true;
  return (
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true ||
    navigator.doNotTrack === "1" ||
    (window as Window & { doNotTrack?: string }).doNotTrack === "1"
  );
}
export function getJourneyConsent(): JourneyConsent {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : "unset";
  } catch {
    return "unset";
  }
}
function allowed() {
  return (
    !privacySignal() &&
    settings?.enabled === true &&
    getJourneyConsent() !== "denied" &&
    (!settings.consentRequired || getJourneyConsent() === "granted")
  );
}
async function getSettings() {
  if (settings) return settings;
  if (!settingsPromise)
    settingsPromise = fetch("/api/events", {
      credentials: "omit",
      referrerPolicy: "no-referrer",
    })
      .then(async (r) =>
        r.ok
          ? await r.json()
          : { enabled: false, consentRequired: true, adapter: "disabled" },
      )
      .catch(() => ({
        enabled: false,
        consentRequired: true,
        adapter: "disabled",
      }))
      .then((value) => (settings = value));
  return settingsPromise;
}
function stored(): JourneyAttribution | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || "null");
    if (!value || typeof value !== "object" || !value.capturedAt) return;
    const age = Date.now() - new Date(value.capturedAt).getTime();
    if (!Number.isFinite(age) || age < -300000 || age > WINDOW_MS) {
      localStorage.removeItem(ATTRIBUTION_KEY);
      return;
    }
    const clean: JourneyAttribution = { capturedAt: value.capturedAt };
    for (const key of ["source", "medium", "campaign", "content"] as const)
      if (typeof value[key] === "string" && identifier.test(value[key]))
        clean[key] = value[key];
    if (typeof value.referralId === "string" && uuid.test(value.referralId))
      clean.referralId = value.referralId;
    return Object.keys(clean).length > 1 ? clean : undefined;
  } catch {
    return;
  }
}
function campaignFromQuery(): JourneyAttribution {
  const params = new URLSearchParams(window.location.search);
  const a: JourneyAttribution = {};
  for (const [field, key] of [
    ["source", "utm_source"],
    ["medium", "utm_medium"],
    ["campaign", "utm_campaign"],
    ["content", "utm_content"],
  ] as const) {
    const value = params.get(key);
    if (value && identifier.test(value)) a[field] = value;
  }
  const referral = params.get("ref");
  if (referral && uuid.test(referral)) a.referralId = referral;
  return a;
}
async function capture(candidate?: JourneyAttribution) {
  await getSettings();
  if (!allowed() || stored()) return;
  const attribution = candidate || campaignFromQuery();
  if (!Object.keys(attribution).length) return;
  try {
    localStorage.setItem(
      ATTRIBUTION_KEY,
      JSON.stringify({ ...attribution, capturedAt: new Date().toISOString() }),
    );
  } catch {}
}
/** The first nonempty campaign/referral touch wins for30days; an empty organic
 * visit does not prevent a later invitation from becoming the first touch. */
export function captureAttribution() {
  if (typeof window !== "undefined") void capture();
}
export function captureReferral(referralId: string) {
  if (typeof window === "undefined" || !uuid.test(referralId)) return;
  void capture({ ...campaignFromQuery(), referralId });
}
export function getAttribution(): JourneyAttribution | undefined {
  return typeof window !== "undefined" && allowed() ? stored() : undefined;
}
export function forgetAttribution() {
  try {
    localStorage.removeItem(ATTRIBUTION_KEY);
  } catch {}
}
export function setJourneyConsent(consent: "granted" | "denied") {
  try {
    localStorage.setItem(CONSENT_KEY, consent);
    if (consent === "denied") forgetAttribution();
    else captureAttribution();
    window.dispatchEvent(new Event("journey-consent-change"));
  } catch {}
}
function cleanProperties(input: JourneyProperties): JourneyProperties {
  const p: JourneyProperties = {};
  if (
    Number.isInteger(input.seatId) &&
    input.seatId! >= 1 &&
    input.seatId! <= 10000
  )
    p.seatId = input.seatId;
  if (["one", "two", "six", "celebration"].includes(input.packageId || ""))
    p.packageId = input.packageId;
  if (Number.isInteger(input.count) && input.count! >= 1 && input.count! <= 6)
    p.count = input.count;
  if (Number.isInteger(input.stage) && input.stage! >= 0 && input.stage! <= 10)
    p.stage = input.stage;
  if (["native", "copy", "download", "recording"].includes(input.method || ""))
    p.method = input.method;
  if (
    [
      "header",
      "hero",
      "mobile",
      "table",
      "footer",
      "profile",
      "invitation",
      "builder",
      "account",
    ].includes(input.placement || "")
  )
    p.placement = input.placement;
  if (["courtesy", "paid"].includes(input.invitationType || ""))
    p.invitationType = input.invitationType;
  return p;
}
export async function track(
  name: ClientJourneyEvent,
  properties: JourneyProperties = {},
) {
  try {
    await getSettings();
    if (!allowed()) return;
    await capture();
    const eventId = crypto.randomUUID();
    await fetch("/api/events", {
      method: "POST",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        eventId,
        properties: cleanProperties(properties),
        attribution: getAttribution(),
        consent: getJourneyConsent() === "granted",
      }),
    });
  } catch {
    /* Optional measurement must never block a guest, invitation or payment. */
  }
}
