/**
 * End-to-end: this web UI, in a real browser, against this module's real
 * firmware -- with no hardware.
 *
 * The firmware runs in the Renode emulator, booted by zmk-west-commands'
 * `west zmk-web-e2e`, which serves the DUT's ZMK Studio RPC (carried over its
 * emulated USB CDC) to the browser and hands us a `navigator.serial` shim at
 * $ZMK_WEB_E2E_SHIM_URL. Installing that shim is the only thing faked here: the
 * app, its transport, the RPC framing and the firmware are all real.
 *
 *   west zmk-build tests/zmk-config -af web_e2e
 *   west zmk-web-e2e --elf build/web_e2e/zephyr/zmk.elf -- npm --prefix web run e2e
 *
 * Rewrite the RPC assertions for your own module's requests; the connect half
 * stays as is.
 */
import { test, expect } from "@playwright/test";

const SHIM_URL = process.env.ZMK_WEB_E2E_SHIM_URL;
// CONFIG_ZMK_KEYBOARD_NAME of the DUT (tests/zmk-config/config/tester_xiao.conf).
const DEVICE_NAME = process.env.ZMK_WEB_E2E_DEVICE_NAME || "Module Test";
const BRIGHTNESS = "62";

test("the web UI saves LED brightness through real firmware", async ({
  page,
  request,
}) => {
  test.skip(
    !SHIM_URL,
    "no DUT: run this through `west zmk-web-e2e` (see the file header)"
  );

  // Install the navigator.serial shim before the app's own scripts run, so the
  // app sees a serial port -- the DUT's Studio CDC in Renode -- to connect to.
  await page.addInitScript(await (await request.get(SHIM_URL!)).text());
  await page.goto("/");

  // Click the app's real Connect button. Its transport opens the shimmed port,
  // completes the Studio handshake against the firmware, and the app renders
  // the name the firmware reported.
  await page.getByRole("button", { name: /Connect USB/ }).click();
  await expect(page.getByText(`Connected to: ${DEVICE_NAME}`)).toBeVisible();

  // The firmware registered this module's custom subsystem: the app found it
  // and rendered its panel (it renders a "not found" warning otherwise).
  await expect(
    page.getByRole("heading", { name: "LED brightness" })
  ).toBeVisible();

  // The module's own RPC, end to end: the app reads the stored value, sends a
  // SetBrightness request, and the firmware persists the requested value.
  const brightness = page.getByLabel("Brightness");
  await brightness.press("End");
  for (let value = 100; value > Number(BRIGHTNESS); value -= 1) {
    await brightness.press("ArrowLeft");
  }
  await page.getByRole("button", { name: /Save brightness/ }).click();
  await expect(
    page.getByText("Brightness saved to your keyboard.")
  ).toBeVisible();
  await expect(page.getByText("62%")).toBeVisible();
});
