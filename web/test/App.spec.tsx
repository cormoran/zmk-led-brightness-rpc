import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupZMKMocks } from "@cormoran/zmk-studio-react-hook/testing";
import App from "../src/App";

// Mock the ZMK client
jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  create_rpc_connection: jest.fn(),
  call_rpc: jest.fn(),
}));

jest.mock("@zmkfirmware/zmk-studio-ts-client/transport/gatt", () => ({
  connect: jest.fn(),
}));

// App.tsx uses connectSerial (not the ts-client's raw transport/serial
// connect) so that a manual USB connect remembers the port for auto-reconnect
// -- see @cormoran/zmk-studio-react-hook's README. Mock just that one export,
// keeping everything else (ZMKConnection, hooks, etc.) real.
jest.mock("@cormoran/zmk-studio-react-hook", () => ({
  ...jest.requireActual("@cormoran/zmk-studio-react-hook"),
  connectSerial: jest.fn(),
}));

// jsdom defines neither navigator.serial nor navigator.bluetooth by default;
// define/delete them per test to exercise feature detection.
function setTransportSupport({
  serial,
  bluetooth,
}: {
  serial: boolean;
  bluetooth: boolean;
}) {
  if (serial) {
    Object.defineProperty(navigator, "serial", {
      value: {},
      configurable: true,
    });
  } else {
    delete (navigator as { serial?: unknown }).serial;
  }
  if (bluetooth) {
    Object.defineProperty(navigator, "bluetooth", {
      value: {},
      configurable: true,
    });
  } else {
    delete (navigator as { bluetooth?: unknown }).bluetooth;
  }
}

describe("App Component", () => {
  afterEach(() => {
    setTransportSupport({ serial: false, bluetooth: false });
  });

  describe("Basic Rendering", () => {
    it("should render the application header", () => {
      render(<App />);

      // Scoped to the heading role: the footer's "AI ready ZMK module
      // template" credit line also matches a plain /ZMK Module Template/i
      // text query.
      expect(
        screen.getByRole("heading", { name: /ZMK Module Template/i })
      ).toBeInTheDocument();
      expect(screen.getByText(/Custom Studio RPC Demo/i)).toBeInTheDocument();
    });

    it("should render footer with repo link", () => {
      render(<App />);

      expect(screen.getByText(/Template Module/i)).toBeInTheDocument();
      // In the pristine template, GITHUB_REPO and TEMPLATE_CREDIT_REPO happen
      // to share the same placeholder value -- scripts/init_module.py only
      // rewrites the former (the latter is permanently exempted), so after
      // initialization only one of these links still reads this text.
      const links = screen.getAllByRole("link", {
        name: "cormoran/zmk-module-template",
      });
      expect(links.length).toBe(2);
      for (const link of links) {
        expect(link).toHaveAttribute(
          "href",
          "https://github.com/cormoran/zmk-module-template"
        );
      }
    });

    it("should render a permanent template credit that survives initialization", () => {
      render(<App />);

      expect(screen.getByText(/Built from/i)).toBeInTheDocument();
      expect(
        screen.getByText(/AI ready ZMK module template/i)
      ).toBeInTheDocument();
      const creditLink = screen.getByRole("link", { name: "@cormoran" });
      expect(creditLink).toHaveAttribute("href", "https://github.com/cormoran");
    });
  });

  describe("Transport feature detection", () => {
    it("shows both connect buttons when both transports are supported", () => {
      setTransportSupport({ serial: true, bluetooth: true });
      render(<App />);

      expect(screen.getByText(/Connect USB/i)).toBeInTheDocument();
      expect(screen.getByText(/Connect Bluetooth/i)).toBeInTheDocument();
    });

    it("shows only USB button when only Web Serial is supported", () => {
      setTransportSupport({ serial: true, bluetooth: false });
      render(<App />);

      expect(screen.getByText(/Connect USB/i)).toBeInTheDocument();
      expect(screen.queryByText(/Connect Bluetooth/i)).not.toBeInTheDocument();
    });

    it("shows only Bluetooth button when only Web Bluetooth is supported", () => {
      setTransportSupport({ serial: false, bluetooth: true });
      render(<App />);

      expect(screen.queryByText(/Connect USB/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Connect Bluetooth/i)).toBeInTheDocument();
    });

    it("shows a guidance message when neither transport is supported", () => {
      setTransportSupport({ serial: false, bluetooth: false });
      render(<App />);

      expect(screen.queryByText(/Connect USB/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Connect Bluetooth/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Chromium-based browser/i)).toBeInTheDocument();
    });
  });

  describe("Connection Flow", () => {
    let mocks: ReturnType<typeof setupZMKMocks>;

    beforeEach(() => {
      mocks = setupZMKMocks();
    });

    it("should connect to device via USB when connect button is clicked", async () => {
      setTransportSupport({ serial: true, bluetooth: true });
      mocks.mockSuccessfulConnection({
        deviceName: "Test Keyboard",
        subsystems: ["your_name__template"],
      });

      const { connectSerial } = await import("@cormoran/zmk-studio-react-hook");
      (connectSerial as jest.Mock).mockResolvedValue(mocks.mockTransport);

      render(<App />);

      const user = userEvent.setup();
      await user.click(screen.getByText(/Connect USB/i));

      await waitFor(() => {
        expect(
          screen.getByText(/Connected to: Test Keyboard/i)
        ).toBeInTheDocument();
      });

      expect(screen.getByText(/Disconnect/i)).toBeInTheDocument();
      expect(screen.getByText(/RPC Test/i)).toBeInTheDocument();
    });

    it("should connect to device via Bluetooth when connect button is clicked", async () => {
      setTransportSupport({ serial: true, bluetooth: true });
      mocks.mockSuccessfulConnection({
        deviceName: "Test Keyboard BLE",
        subsystems: ["your_name__template"],
      });

      const { connect: gattConnect } =
        await import("@zmkfirmware/zmk-studio-ts-client/transport/gatt");
      (gattConnect as jest.Mock).mockResolvedValue(mocks.mockTransport);

      render(<App />);

      const user = userEvent.setup();
      await user.click(screen.getByText(/Connect Bluetooth/i));

      await waitFor(() => {
        expect(
          screen.getByText(/Connected to: Test Keyboard BLE/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe("Auto-reconnect", () => {
    it("does not crash and stays disconnected when no serial port was previously paired", async () => {
      // No navigator.serial defined: ZMKConnection's autoReconnect calls
      // connectToPairedSerial(), which resolves null silently in that case.
      setTransportSupport({ serial: false, bluetooth: false });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/Chromium-based browser/i)).toBeInTheDocument();
      });
    });
  });
});
