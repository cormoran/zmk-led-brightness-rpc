import { useContext, useEffect, useRef, useState } from "react";
import "./App.css";
import { connect as gattConnect } from "@zmkfirmware/zmk-studio-ts-client/transport/gatt";
import {
  ZMKConnection,
  ZMKAppContext,
  connectSerial,
  isWebBluetoothSupported,
  isWebSerialSupported,
  useCustomSubsystem,
} from "@cormoran/zmk-studio-react-hook";
import {
  Request,
  Response,
} from "./proto/cormoran/led-brightness/led_brightness";

export const SUBSYSTEM_IDENTIFIER = "cormoran__led_brightness";
export const GITHUB_REPO = "cormoran/zmk-led-brightness-rpc";
export const WEB_UI_URL = "https://cormoran.github.io/zmk-led-brightness-rpc/";

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <p className="eyebrow">ZMK Studio extension</p>
        <h1>Keyboard LED brightness</h1>
        <p>Set and save your backlight or RGB underglow brightness.</p>
      </header>

      <ZMKConnection
        autoReconnect
        renderDisconnected={({ connect, isLoading, error }) => (
          <section className="card">
            <h2>Connect your keyboard</h2>
            {isLoading && <p>Connecting…</p>}
            {error && <p className="error-message">{error}</p>}
            {!isLoading && (
              <div className="connect-buttons">
                {isWebSerialSupported() && (
                  <button
                    className="btn btn-primary"
                    onClick={() => connect(connectSerial)}
                  >
                    Connect USB
                  </button>
                )}
                {isWebBluetoothSupported() && (
                  <button
                    className="btn btn-primary"
                    onClick={() => connect(gattConnect)}
                  >
                    Connect Bluetooth
                  </button>
                )}
                {!isWebSerialSupported() && !isWebBluetoothSupported() && (
                  <p className="warning-message">
                    Use a Chromium-based browser over HTTPS or localhost to
                    connect.
                  </p>
                )}
              </div>
            )}
            {isWebBluetoothSupported() && (
              <p className="hint-message">
                If your keyboard is not listed, press its{" "}
                <code>&amp;studio_unlock</code> key before connecting.
              </p>
            )}
          </section>
        )}
        renderConnected={({ disconnect, deviceName }) => (
          <>
            <section className="card connection-card">
              <div>
                <p className="eyebrow">Connected</p>
                <h2>{deviceName}</h2>
              </div>
              <button className="btn btn-secondary" onClick={disconnect}>
                Disconnect
              </button>
            </section>
            <BrightnessSection />
          </>
        )}
      />

      <footer className="app-footer">
        <a
          href={`https://github.com/${GITHUB_REPO}`}
          target="_blank"
          rel="noreferrer"
        >
          {GITHUB_REPO}
        </a>
      </footer>
    </div>
  );
}

export function BrightnessSection() {
  const zmkApp = useContext(ZMKAppContext);
  const { ready, subsystem, call } = useCustomSubsystem(SUBSYSTEM_IDENTIFIER, {
    encode: (request: Request) => Request.encode(request).finish(),
    decode: Response.decode,
  });
  const [brightness, setBrightness] = useState(50);
  const [deviceAvailable, setDeviceAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const loaded = useRef(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || loaded.current) return;

    loaded.current = true;
    setLoading(true);
    void call({ getBrightness: {} })
      .then((response) => {
        if (response?.brightness) {
          setBrightness(response.brightness.value);
          setDeviceAvailable(response.brightness.deviceAvailable);
        }
      })
      .catch((error: unknown) => {
        setMessage(
          `Could not read brightness: ${error instanceof Error ? error.message : "unknown error"}`
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [call, ready]);

  const saveBrightness = async () => {
    if (!ready || brightness < 0 || brightness > 100) return;

    setSaving(true);
    setMessage(null);
    try {
      const response = await call({ setBrightness: { value: brightness } });
      if (response?.brightness) {
        setBrightness(response.brightness.value);
        setDeviceAvailable(response.brightness.deviceAvailable);
        setMessage("Brightness saved to your keyboard.");
      } else if (response?.error) {
        setMessage(`Could not save brightness: ${response.error.message}`);
      }
    } catch (error) {
      setMessage(
        `Could not save brightness: ${error instanceof Error ? error.message : "unknown error"}`
      );
    } finally {
      setSaving(false);
    }
  };

  if (!zmkApp) return null;

  if (!subsystem) {
    return (
      <section className="card warning-message">
        The LED brightness module is not installed in this keyboard firmware.
        See the{" "}
        <a href={`https://github.com/${GITHUB_REPO}#readme`}>module guide</a>.
      </section>
    );
  }

  return (
    <section className="card brightness-card" aria-busy={loading}>
      <div className="brightness-heading">
        <div>
          <p className="eyebrow">Saved setting</p>
          <h2>LED brightness</h2>
        </div>
        <output htmlFor="brightness">{brightness}%</output>
      </div>

      {!deviceAvailable && (
        <p className="warning-message">
          This firmware has no enabled backlight or RGB underglow. The value
          will still be saved and applied when you enable one.
        </p>
      )}

      <label className="range-label" htmlFor="brightness">
        Brightness
        <input
          id="brightness"
          type="range"
          min="0"
          max="100"
          value={brightness}
          onChange={(event) => setBrightness(Number(event.target.value))}
          disabled={loading || saving}
        />
      </label>
      <div className="range-scale" aria-hidden="true">
        <span>0%</span>
        <span>100%</span>
      </div>
      <button
        className="btn btn-primary"
        disabled={loading || saving}
        onClick={saveBrightness}
      >
        {saving ? "Saving…" : "Save brightness"}
      </button>
      {message && <p className="status-message">{message}</p>}
    </section>
  );
}

export default App;
