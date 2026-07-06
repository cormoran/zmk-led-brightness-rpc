import { useContext, useEffect, useState } from "react";
import "./App.css";
import { connect as gattConnect } from "@zmkfirmware/zmk-studio-ts-client/transport/gatt";
import {
  ZMKConnection,
  ZMKAppContext,
  useStudioLockState,
  isUnlockRequiredError,
  isWebSerialSupported,
  isWebBluetoothSupported,
  useCustomSubsystem,
  connectSerial,
} from "@cormoran/zmk-studio-react-hook";
import { Request, Response } from "./proto/your-name/template/template";

export const SUBSYSTEM_IDENTIFIER = "your_name__template";

// Template placeholder: `scripts/init_module.py` rewrites this literal to
// `{owner}/{repo}`. Never write the full
// `...-with-custom-studio-rpc` repo name in a URL built from this constant --
// the replacement targets this exact string first, which would otherwise
// leave the owner unreplaced.
export const GITHUB_REPO = "cormoran/zmk-module-template";

// Unlike GITHUB_REPO above, this always credits the original template
// project, regardless of which repo this module was forked into. The
// trailing comment is scripts/init_module.py's IGNORE_MARKER: it keeps this
// line from being rewritten (like GITHUB_REPO is) or flagged as a leftover
// placeholder once initialized.
export const TEMPLATE_CREDIT_REPO = "cormoran/zmk-module-template"; // zmk-module-template:keep

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>🔧 ZMK Module Template</h1>
        <p>Custom Studio RPC Demo</p>
      </header>

      <ZMKConnection
        autoReconnect
        renderDisconnected={({ connect, isLoading, error }) => (
          <section className="card">
            <h2>Device Connection</h2>
            {isLoading && <p>⏳ Connecting...</p>}
            {error && (
              <div className="error-message">
                <p>🚨 {error}</p>
              </div>
            )}
            {!isLoading && (
              <>
                <div className="connect-buttons">
                  {isWebSerialSupported() && (
                    <button
                      className="btn btn-primary"
                      onClick={() => connect(connectSerial)}
                    >
                      🔌 Connect USB
                    </button>
                  )}
                  {isWebBluetoothSupported() && (
                    <button
                      className="btn btn-primary"
                      onClick={() => connect(gattConnect)}
                    >
                      📶 Connect Bluetooth
                    </button>
                  )}
                  {!isWebSerialSupported() && !isWebBluetoothSupported() && (
                    <div className="warning-message">
                      <p>
                        ⚠️ Web Serial and Web Bluetooth are unavailable here.
                        Use a Chromium-based browser (Chrome, Edge, ...) over
                        HTTPS or localhost to connect to your keyboard.
                      </p>
                    </div>
                  )}
                </div>
                {isWebBluetoothSupported() && (
                  <p className="hint-message">
                    📶 Not showing up? Some firmware only advertises the Studio
                    Bluetooth service once unlocked — press the unlock key (
                    <code>&amp;studio_unlock</code> behavior) on your keyboard,
                    then try connecting again.
                  </p>
                )}
              </>
            )}
          </section>
        )}
        renderConnected={({ disconnect, deviceName }) => (
          <>
            <section className="card">
              <h2>Device Connection</h2>
              <div className="device-info">
                <h3>✅ Connected to: {deviceName}</h3>
              </div>
              <button className="btn btn-secondary" onClick={disconnect}>
                Disconnect
              </button>
            </section>

            <RPCTestSection />
          </>
        )}
      />

      <footer className="app-footer">
        <p>
          <strong>Template Module</strong> - Customize this for your ZMK module
        </p>
        <p>
          <a
            href={`https://github.com/${GITHUB_REPO}`}
            target="_blank"
            rel="noreferrer"
          >
            {GITHUB_REPO}
          </a>
        </p>
        <p className="template-credit">
          Built from{" "}
          <a
            href={`https://github.com/${TEMPLATE_CREDIT_REPO}`}
            target="_blank"
            rel="noreferrer"
          >
            {TEMPLATE_CREDIT_REPO}
          </a>{" "}
          - AI ready ZMK module template by{" "}
          <a
            href="https://github.com/cormoran"
            target="_blank"
            rel="noreferrer"
          >
            @cormoran
          </a>
        </p>
      </footer>
    </div>
  );
}

export function RPCTestSection() {
  const zmkApp = useContext(ZMKAppContext);
  const { ready, subsystem, call } = useCustomSubsystem(SUBSYSTEM_IDENTIFIER, {
    encode: (r: Request) => Request.encode(r).finish(),
    decode: Response.decode,
  });
  const { locked } = useStudioLockState();
  const [inputValue, setInputValue] = useState<number>(42);
  const [response, setResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [awaitingUnlock, setAwaitingUnlock] = useState(false);

  const sendSampleRequest = async () => {
    if (!ready) return;

    setIsLoading(true);
    setResponse(null);

    try {
      const resp = await call({ sample: { value: inputValue } });
      setAwaitingUnlock(false);
      console.log("Decoded response:", resp);

      if (resp?.sample) {
        setResponse(resp.sample.value);
      } else if (resp?.error) {
        setResponse(`Error: ${resp.error.message}`);
      }
    } catch (error) {
      if (isUnlockRequiredError(error)) {
        setAwaitingUnlock(true);
      } else {
        console.error("RPC call failed:", error);
        setResponse(
          `Failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-retry once the device reports it's unlocked again -- covers the
  // common case where the user presses &studio_unlock after seeing the
  // prompt below without needing to click "Retry" themselves.
  useEffect(() => {
    if (awaitingUnlock && !locked) {
      // This mirrors an external system (the device's lock state) rather
      // than deriving from props/state, so a direct setState here is
      // intentional -- see react-hooks/set-state-in-effect's rationale (same
      // pattern used by useStudioLockState itself).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAwaitingUnlock(false);
      void sendSampleRequest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  if (!zmkApp) return null;

  if (!subsystem) {
    return (
      <section className="card">
        <div className="warning-message">
          <p>
            ⚠️ Subsystem "{SUBSYSTEM_IDENTIFIER}" not found. Make sure your
            firmware includes the template module. See the{" "}
            <a href={`https://github.com/${GITHUB_REPO}#readme`}>
              module README
            </a>{" "}
            for firmware setup.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>RPC Test</h2>
      <p>Send a sample request to the firmware:</p>

      {locked && (
        <div className="locked-banner">
          <p>🔒 ZMK Studio is locked.</p>
        </div>
      )}

      <div className="input-group">
        <label htmlFor="value-input">Value:</label>
        <input
          id="value-input"
          type="number"
          value={inputValue}
          onChange={(e) => setInputValue(parseInt(e.target.value) || 0)}
        />
      </div>

      <button
        className="btn btn-primary"
        disabled={isLoading || locked}
        onClick={sendSampleRequest}
      >
        {isLoading ? "⏳ Sending..." : "📤 Send Request"}
      </button>

      {awaitingUnlock && (
        <div className="unlock-prompt card">
          <p>
            🔒 ZMK Studio is locked. Press the unlock key (
            <code>&amp;studio_unlock</code> behavior) on your keyboard — the
            request will retry automatically.
          </p>
          <button className="btn btn-secondary" onClick={sendSampleRequest}>
            Retry
          </button>
        </div>
      )}

      {response && (
        <div className="response-box">
          <h3>Response from Firmware:</h3>
          <pre>{response}</pre>
        </div>
      )}
    </section>
  );
}

export default App;
