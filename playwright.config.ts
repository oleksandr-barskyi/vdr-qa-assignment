import { defineConfig, devices } from "@playwright/test";
import { env } from "./src/config";

export default defineConfig({
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "api",
      testDir: "./tests/api",
      use: { baseURL: env.apiUrl },
    },
    {
      name: "e2e",
      testDir: "./tests/e2e",
      retries: 1,
      use: { ...devices["Desktop Chrome"], baseURL: env.webUrl },
    },
    {
      name: "ux",
      testDir: "./tests/ux",
      use: { ...devices["Desktop Chrome"], baseURL: env.webUrl },
    },
  ],
});
