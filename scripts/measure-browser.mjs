import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  headless: true,
  args: ["--no-sandbox"],
});
const results = [];
for (const spec of [
  { label: "desktop", width: 1440, height: 1000, cpu: 1 },
  { label: "mobile-emulation-4x-cpu", width: 390, height: 844, cpu: 4 },
]) {
  const context = await browser.newContext({
    viewport: { width: spec.width, height: spec.height },
    isMobile: spec.width < 500,
    hasTouch: spec.width < 500,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (spec.cpu > 1)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: spec.cpu });
  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      window.__lcp = entries.at(-1)?.startTime || 0;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await page.goto(process.env.E2E_BASE_URL || "http://localhost:3000");
  await page
    .getByRole("button", { name: "Luna, probably tired, seat 1", exact: true })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  const metrics = await page.evaluate(() => {
    const r = performance.getEntriesByType("resource");
    const js = r.filter((x) => /\/_next\/.*\.js(?:\?|$)/.test(x.name));
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      navigationLoadMs: Math.round(nav.loadEventEnd),
      lcpMs: Math.round(window.__lcp),
      initialJsRequests: js.length,
      initialJsEncodedBytes: js.reduce((sum, x) => sum + x.encodedBodySize, 0),
      initialJsTransferBytes: js.reduce((sum, x) => sum + x.transferSize, 0),
      initialTableColumns: document.querySelectorAll(".table-column").length,
      initialGuestSvgNodes: document.querySelectorAll(
        ".table-viewport .guest-art",
      ).length,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    };
  });
  const scene = page.getByRole("region", { name: /^Illustrated table/ });
  await scene.focus();
  await page.evaluate(() => {
    window.__frameSamples = [];
    window.__measuring = true;
    let previous = performance.now();
    function frame(now) {
      window.__frameSamples.push(now - previous);
      previous = now;
      if (window.__measuring) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  for (let i = 0; i < 12; i++) {
    await scene.press("ArrowRight");
    await page.waitForTimeout(60);
  }
  const frameMetrics = await page.evaluate(() => {
    window.__measuring = false;
    const values = window.__frameSamples.slice(2).sort((a, b) => a - b);
    return {
      panningAnimationFrames: values.length,
      panningFrameMedianMs: Number(
        values[Math.floor(values.length * 0.5)].toFixed(2),
      ),
      panningFrameP95Ms: Number(
        values[Math.floor(values.length * 0.95)].toFixed(2),
      ),
      panningMaxFrameMs: Number(values.at(-1).toFixed(2)),
      mountedColumnsAfterPanning:
        document.querySelectorAll(".table-column").length,
    };
  });
  results.push({ ...spec, ...metrics, ...frameMetrics });
  await context.close();
}
await browser.close();
const output = {
  measuredAt: new Date().toISOString(),
  environment:
    "Local optimized Next.js server, headless system Chromium. Fresh browser contexts. Mobile is emulation with 4x CPU throttling, not physical Safari or a real phone. Frame timing is an indicative local measurement during keyboard panning, not a guarantee.",
  budgets: {
    maxInitialEncodedJavascriptBytes: 512000,
    maxMountedTableColumns: 20,
    indicativeLocalP95FrameMs: 34,
  },
  results,
};
await mkdir("screenshots", { recursive: true });
await writeFile(
  path.resolve("screenshots/performance.json"),
  JSON.stringify(output, null, 2),
);
console.log(JSON.stringify(output, null, 2));
