# Web UI improvements (implemented)

Scope: `web/` of this template. Goal: keep the template minimal while adding
(1) a GitHub repo link, (2) default Studio-unlock handling (prompt + retry),
(3) USB (Web Serial) + BLE (Web Bluetooth) connect support with feature
detection, and (4) silent auto-reconnect to a previously paired serial port.

Guiding constraint: **this is a template** -- every addition must be
something a downstream module author would keep, not delete.

> **History note**: this doc originally proposed hand-rolling
> `useStudioLockState`/unlock-retry/auto-reconnect logic directly in this
> template (porting from the pmw3610 module), with library changes
> explicitly out of scope. Before that plan was implemented,
> [react-zmk-studio](https://github.com/cormoran/react-zmk-studio) PR #6 and
> PR #7 shipped equivalent APIs in the library itself
> (`useStudioLockState`, `isUnlockRequiredError`, `getPairedSerialPorts` /
> `connectToSerialPort` / `connectToPairedSerial`, `ZMKConnection`'s
> `autoReconnect` prop, `isWebSerialSupported` / `isWebBluetoothSupported`,
> `isUserCancelledError`, and `useCustomSubsystem`). This revision records
> what was actually built: the template now consumes those library APIs
> instead of reimplementing them, which keeps the template smaller than the
> original plan. The requirements, placeholder pitfalls, and test guidance
> below still apply; the "implementation" sections describe the final state.

## 1. GitHub repo link

`web/src/App.tsx` defines:

```ts
export const GITHUB_REPO = "cormoran/zmk-module-template";
```

and renders a footer link to `https://github.com/${GITHUB_REPO}` (plain text
link, no icon asset -- dependency-free). The same constant is reused in
`RPCTestSection`'s "subsystem not found" warning, linking to
`https://github.com/${GITHUB_REPO}#readme`.

**Why this exact string**: `scripts/init_module.py` replaces the literal
`cormoran/zmk-module-template` with `{owner}/{repo}`, and `zmk-module-template`
is in the placeholder list checked by `--verify-only`/pre-commit. The full
`cormoran/zmk-module-template-with-custom-studio-rpc` repo name must never
appear in a URL built from this constant: the replacement list rewrites the
repo-name literal *first*, which would leave `cormoran/` as the owner after
init.

`web/index.html`'s `<title>` is `ZMK Module Template` (an existing
placeholder in `build_replacements()`), so init renames it along with the
rest of the UI text.

## 2. Studio unlock handling (prompt + retry), provided by default

Library facts (from `@cormoran/zmk-studio-react-hook`, pinned to a
`feature/dx-helpers` commit of react-zmk-studio -- see the dependency note in
`web/README.md`):

- `useStudioLockState()` returns `{ locked: boolean, lockState: "locked" |
  "unlocked" | "unknown" }`. On connect it queries `core.getLockState` once
  (state stays `"unknown"` until that resolves) and then stays in sync via
  `lockStateChanged` core notifications. `locked` treats `"unknown"` as
  `false` (optimistic).
- `isUnlockRequiredError(error)` detects the `MetaError` with condition
  `UNLOCK_REQUIRED` that secured RPCs reject with while Studio is locked.
- Unlock is physical: the user presses `&studio_unlock` on the keyboard.
  There is no web-side unlock RPC (the devtool module's unlock is a dev-only
  hack -- do not use it here).
- This template's firmware handler is deliberately
  `ZMK_STUDIO_RPC_HANDLER_UNSECURED` (see `src/studio/template_handler.c`), so
  the sample RPC never triggers unlock by default. The web side still ships
  the full flow so that flipping the firmware to `SECURED` "just works".

Implementation, all inline in `RPCTestSection` (`App.tsx`) -- no separate
`studioLock.tsx` file was needed since the library owns the hook and error
helper:

- `useStudioLockState()` drives two UI states: a slim locked banner
  ("🔒 ZMK Studio is locked.") and a disabled Send button whenever
  `locked === true`.
- `sendSampleRequest` wraps the `useCustomSubsystem(...).call(...)` in
  try/catch: on `isUnlockRequiredError(e)`, sets `awaitingUnlock = true` and
  renders an unlock prompt card ("Press the unlock key (`&studio_unlock`
  behavior) on your keyboard -- the request will retry automatically.") with
  a manual **Retry** button, instead of the response box.
- A `useEffect` on `locked` auto-retries once when it flips from `true` to
  `false` while `awaitingUnlock` is set (clears the flag, re-invokes the send
  function). The manual Retry button covers a missed/absent notification
  transition (e.g. if `locked` was already `false` when the RPC failed and
  never changes again).
- `template_handler.c`'s security comment gained one line: the web template
  already implements the unlock prompt/retry flow, so switching to
  `ZMK_STUDIO_RPC_HANDLER_SECURED` needs no web changes. `web/README.md` has
  a matching "Studio unlock flow" section.

## 3. USB + BLE connect, with feature detection

- Both transports are imported directly:
  ```ts
  import { connect as serialConnect } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
  import { connect as gattConnect } from "@zmkfirmware/zmk-studio-ts-client/transport/gatt";
  ```
  `ZMKConnection`'s `connect(factory)` accepts either as-is.
- `renderDisconnected` shows two independently-gated buttons:
  - `isWebSerialSupported()` -> "🔌 Connect USB"
  - `isWebBluetoothSupported()` -> "📶 Connect Bluetooth"
  - Neither -> a message asking for a Chromium-based browser over HTTPS or
    localhost.
- User-cancelled device pickers no longer need any client-side filtering:
  `connect()` from the library silently ignores `isUserCancelledError`
  errors itself (`state.error` stays `null`), so the existing
  loading/error rendering needed no changes for that case.
- BLE requires the firmware's Studio BLE transport; this was not
  hardware-tested as part of this change (no BLE-enabled build in
  `tests/zmk-config`).

## 4. Auto-reconnect

`<ZMKConnection autoReconnect ...>` is the only change needed: on mount, the
library tries once to reconnect to a previously-paired serial port
(`connectToPairedSerial()`), silently staying disconnected if there is none
or opening it fails. No template-owned state was needed for this.

## 5. Tests

`web/test/App.spec.tsx` and `web/test/RPCTestSection.spec.tsx` were extended
rather than rewritten:

- `jest.mock` added for `@zmkfirmware/zmk-studio-ts-client/transport/gatt`
  alongside the existing `.../transport/serial` mock.
- Feature detection: `navigator.serial` / `navigator.bluetooth` are defined
  or deleted per test (jsdom has neither by default) to cover both buttons,
  one button, and neither (guidance message).
- Connect flow: clicking each button reaches the connected state (via
  `setupZMKMocks`).
- Unlock flow: mocking `call_rpc` from `@zmkfirmware/zmk-studio-ts-client` to
  reject with `new MetaError(ErrorConditions.UNLOCK_REQUIRED)` shows the
  prompt; the manual Retry button (mock now resolving) renders the response.
  For auto-retry, `createConnectedMockZMKApp`'s `onNotification` is a plain
  jest mock that does not dispatch the `notifications` array on its own (that
  array only feeds `useZMKApp`'s own reader) -- so the test captures the
  `{ type: "core", callback }` subscription `useStudioLockState` registers
  and invokes it directly (wrapped in `act`) to simulate a real-time
  `lockStateChanged` notification.
- A jsdom + `@bufbuild/protobuf` gotcha surfaced once tests actually
  exercised `Request.encode`/`Response.decode`: jsdom's global scope does not
  provide `TextEncoder`/`TextDecoder`, so `test/setup.ts` now polyfills them
  from Node's `node:util`.
- `autoReconnect` calls `connectToPairedSerial()` on mount; with no
  `navigator.serial` defined it resolves `null` silently, so no test setup
  was needed to avoid it interfering with other assertions.

## 6. Out of scope / follow-ups (not implemented here)

- Build metadata in the footer (commit SHA via `VITE_*` env in
  `web-ui.yml`) -- optional, skipped as non-trivial for this change.
- Styling/dark mode -- skipped.
- Re-pinning `@cormoran/zmk-studio-react-hook` off the `feature/dx-helpers`
  branch commit once react-zmk-studio PRs #6/#7 merge (tracked in
  `web/README.md`'s "Dependency note").

## Pitfalls recap for the implementer

- Do not edit CLAUDE.md (symlink to AGENTS.md).
- Do not bump or modify the pinned `@zmkfirmware/zmk-studio-ts-client` dep.
- `jest.mock` paths must match the exact import specifiers (subpath imports).
- The full template repo name in a URL breaks init's owner replacement -- use
  the `cormoran/zmk-module-template` placeholder form only.
- `useCustomSubsystem`/`useStudioLockState` degrade gracefully (no context,
  no connection) instead of throwing -- but they don't distinguish "no
  `ZMKAppContext` provider at all" from "connected but subsystem not found".
  If a component needs to render nothing at all without a provider (as
  `RPCTestSection` does, for standalone-render tests), keep an explicit
  `useContext(ZMKAppContext)` guard alongside the hook.
- The auto-retry effect only fires on an actual `locked` transition
  (`true -> false`); if the RPC fails with `UNLOCK_REQUIRED` while
  `useStudioLockState()` never reports `true` (e.g. a stale/racy failure with
  no corresponding notification), only the manual Retry button will recover
  it. This is intentional, not a bug to fix.
