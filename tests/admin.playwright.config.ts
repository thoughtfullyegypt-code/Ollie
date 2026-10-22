import { defineConfig } from "@playwright/test";
process.loadEnvFile(".env.local");
export default defineConfig({
  testDir: ".",
  testMatch: "admin.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "../test-results/admin",
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    launchOptions: {
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
  },
});
