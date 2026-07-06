# ZMK Module Template - Web Frontend

This is a minimal web application template for interacting with ZMK firmware
modules that implement custom Studio RPC subsystems.

## Features

- **Dual transport with feature detection**: Connect via USB (Web Serial) or
  Bluetooth (Web Bluetooth), whichever the browser supports; shows guidance
  when neither is available (both are Chromium-only and require HTTPS or
  localhost). Some firmware only advertises the Studio Bluetooth service once
  unlocked (`&studio_unlock`) -- the browser's device picker won't show the
  keyboard until then, so the UI hints at this under the Bluetooth button.
- **Auto-reconnect**: On page load, silently reconnects to a previously
  paired serial port if one exists, no picker shown. If more than one device
  has been paired, prefers whichever one was last successfully connected to
  (remembered in `sessionStorage`) instead of an arbitrary one.
- **Studio unlock flow**: Prompts the user to press `&studio_unlock` when a
  secured RPC call is rejected, and retries automatically once the device
  reports it's unlocked (manual Retry button as a fallback).
- **Custom RPC**: Communicate with your custom firmware module using protobuf
  via `useCustomSubsystem`.
- **React + TypeScript**: Modern web development with Vite for fast builds.
- **react-zmk-studio**: Uses the `@cormoran/zmk-studio-react-hook` library for
  simplified ZMK integration.

## Quick Start

```bash
# Install dependencies
npm install

# Generate TypeScript types from proto
npm run generate

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Project Structure

```
src/
├── main.tsx              # React entry point
├── App.tsx               # Main application with connection UI
├── App.css               # Styles
└── proto/                # Generated protobuf TypeScript types
    └── your-name/template/
        └── template.ts

test/
├── App.spec.tsx              # Tests for App component
└── RPCTestSection.spec.tsx   # Tests for RPC functionality
```

## How It Works

### 1. Protocol Definition

The protobuf schema is defined in `../proto/your-name/template/template.proto`.

### 2. Code Generation

TypeScript types are generated using `ts-proto`:

```bash
npm run generate
```

This runs `buf generate` which uses the configuration in `buf.gen.yaml`.

### 3. Using react-zmk-studio

The app uses the `@cormoran/zmk-studio-react-hook` library. `App.tsx` uses the
higher-level `useCustomSubsystem` hook, which collapses
`findSubsystem` + `ZMKCustomSubsystem` + protobuf encode/decode into one call:

```typescript
import { useCustomSubsystem } from "@cormoran/zmk-studio-react-hook";
import { Request, Response } from "./proto/your-name/template/template";

const { ready, call } = useCustomSubsystem("your_name__template", {
  encode: (r: Request) => Request.encode(r).finish(),
  decode: Response.decode,
});

if (ready) {
  const response = await call({ sample: { value: 42 } });
}
```

### 4. Dual transport with feature detection

`App.tsx` shows a "🔌 Connect USB" button when `isWebSerialSupported()` is
true and a "📶 Connect Bluetooth" button when `isWebBluetoothSupported()` is
true (both are Chromium-only APIs and require a secure context: HTTPS or
localhost). When neither is available, the app shows a short message asking
for a Chromium-based browser instead of a dead connect button.

### 5. Auto-reconnect

`<ZMKConnection autoReconnect>` tries once, on mount, to reconnect to a
previously-paired serial port (`navigator.serial.getPorts()`) without
prompting the user again. If there is no paired port, or reconnecting fails
(e.g. the device was unplugged), the app just stays on the normal
disconnected screen -- no error is shown.

### 6. Studio unlock flow

Secured custom RPCs (and the settings subsystem) reject calls with an
`UNLOCK_REQUIRED` error while ZMK Studio is locked on the device. This
template ships the full flow by default, even though the sample firmware
handler in `src/studio/template_handler.c` is registered as
`ZMK_STUDIO_RPC_HANDLER_UNSECURED` (so the sample RPC never actually hits it)
-- switching that handler to `ZMK_STUDIO_RPC_HANDLER_SECURED` requires no web
changes:

- `useStudioLockState()` tracks the device's lock state and disables the Send
  button (with a slim "🔒 ZMK Studio is locked" banner) whenever it's locked.
- If a call is rejected with `isUnlockRequiredError(error)`, the app shows an
  unlock prompt card ("press `&studio_unlock` on your keyboard") instead of
  the response box.
- Once `useStudioLockState()` reports the device unlocked again, the pending
  request retries automatically; a manual **Retry** button covers a missed
  notification.

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

Use the test helpers from `@cormoran/zmk-studio-react-hook/testing`:

```typescript
import {
  createConnectedMockZMKApp,
  ZMKAppProvider,
} from "@cormoran/zmk-studio-react-hook/testing";

const mockZMKApp = createConnectedMockZMKApp({
  deviceName: "Test Device",
  subsystems: ["your_name__template"],
});

render(
  <ZMKAppProvider value={mockZMKApp}>
    <YourComponent />
  </ZMKAppProvider>
);
```

`test/App.spec.tsx` mocks both `@zmkfirmware/zmk-studio-ts-client/transport/serial`
and `.../transport/gatt` to cover feature detection and both connect buttons;
jsdom defines neither `navigator.serial` nor `navigator.bluetooth` by default,
so tests define/delete them per case. `test/RPCTestSection.spec.tsx` covers
the unlock flow by mocking `call_rpc` to reject with a `MetaError` whose
condition is `UNLOCK_REQUIRED`, then asserting the prompt appears and that
both the manual Retry button and a simulated `lockStateChanged` notification
successfully retry the request.

## Customization

To adapt this template for your own ZMK module:

1. **Update the proto file**: Modify `../proto/your-name/template/template.proto` with
   your message types
2. **Regenerate types**: Run `npm run generate`
3. **Update subsystem identifier**: Change `SUBSYSTEM_IDENTIFIER` in `App.tsx`
   to match your firmware registration
4. **Update RPC logic**: Modify the request/response handling in `App.tsx`
5. **Update tests**: Modify tests to match your custom subsystem identifier and
   functionality
