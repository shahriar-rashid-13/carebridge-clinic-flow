import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env.test")) process.loadEnvFile(".env.test");

const LOCAL_PORT = 4173;
const baseURL = process.env["E2E_BASE_URL"] || `http://localhost:${LOCAL_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // The booking flow shares real clinic data, so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env["CI"] ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(process.env["E2E_BASE_URL"]
    ? {}
    : {
        webServer: {
          command: `npm run dev -- --port ${LOCAL_PORT} --strictPort`,
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
