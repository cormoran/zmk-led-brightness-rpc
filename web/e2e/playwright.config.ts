import { defineConfig, devices } from "@playwright/test";

// The firmware side is owned by `west zmk-web-e2e` (see e2e/rpc.spec.ts); this
// config owns only the browser and the web UI it serves.
const PORT = Number(process.env.E2E_PORT || 4173);

export default defineConfig({
  testDir: ".",
  // Everything talks to one emulated device, so specs must not overlap.
  workers: 1,
  fullyParallel: false,
  // Renode is far slower than hardware: a connect handshake takes seconds.
  timeout: 180_000,
  expect: { timeout: 60_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Build and serve at the root: the deployed app lives under /<repo>/ (see
    // vite.config.ts), which `page.goto("/")` would miss. Building here also
    // means the tests can never run against a stale dist.
    //
    // `--host 127.0.0.1` pins the bind to IPv4, matching baseURL: vite preview
    // otherwise listens on `localhost`, which resolves to ::1 first on GitHub
    // runners -- the port check passes (it resolves the same way) and then
    // every page.goto is refused.
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    port: PORT,
    env: { VITE_BASE: "/" },
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
