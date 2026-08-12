import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupZMKMocks } from "@cormoran/zmk-studio-react-hook/testing";
import App from "../src/App";

jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  create_rpc_connection: jest.fn(),
  call_rpc: jest.fn(),
}));

jest.mock("@zmkfirmware/zmk-studio-ts-client/transport/gatt", () => ({
  connect: jest.fn(),
}));

jest.mock("@cormoran/zmk-studio-react-hook", () => ({
  ...jest.requireActual("@cormoran/zmk-studio-react-hook"),
  connectSerial: jest.fn(),
}));

function setTransportSupport(serial: boolean, bluetooth: boolean) {
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

describe("App", () => {
  afterEach(() => setTransportSupport(false, false));

  it("renders the published LED brightness UI", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /Keyboard LED brightness/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "cormoran/zmk-led-brightness-rpc" })
    ).toHaveAttribute(
      "href",
      "https://github.com/cormoran/zmk-led-brightness-rpc"
    );
  });

  it("offers USB and Bluetooth when the browser supports both", () => {
    setTransportSupport(true, true);
    render(<App />);
    expect(
      screen.getByRole("button", { name: /Connect USB/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Connect Bluetooth/i })
    ).toBeInTheDocument();
  });

  it("connects over USB", async () => {
    setTransportSupport(true, false);
    const mocks = setupZMKMocks();
    mocks.mockSuccessfulConnection({
      deviceName: "Test Keyboard",
      subsystems: ["cormoran__led_brightness"],
    });
    const { connectSerial } = await import("@cormoran/zmk-studio-react-hook");
    (connectSerial as jest.Mock).mockResolvedValue(mocks.mockTransport);

    render(<App />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Connect USB/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Test Keyboard" })
      ).toBeInTheDocument()
    );
  });
});
