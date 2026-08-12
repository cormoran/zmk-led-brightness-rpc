import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createConnectedMockZMKApp,
  ZMKAppProvider,
} from "@cormoran/zmk-studio-react-hook/testing";
import { BrightnessSection, SUBSYSTEM_IDENTIFIER } from "../src/App";
import { Response } from "../src/proto/cormoran/led-brightness/led_brightness";

jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  create_rpc_connection: jest.fn(),
  call_rpc: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const zmkClient = require("@zmkfirmware/zmk-studio-ts-client");

function mockBrightnessRpc(value = 50, deviceAvailable = true) {
  zmkClient.call_rpc.mockImplementation(
    (
      _connection: unknown,
      request: { custom?: { call?: { payload: Uint8Array } } }
    ) => {
      if (!request.custom?.call)
        return Promise.reject(new Error("unexpected request"));
      const response = Response.encode(
        Response.create({ brightness: { value, deviceAvailable } })
      ).finish();
      return Promise.resolve({ custom: { call: { payload: response } } });
    }
  );
}

describe("BrightnessSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads the saved brightness when the subsystem is available", async () => {
    mockBrightnessRpc(62);
    const app = createConnectedMockZMKApp({
      subsystems: [SUBSYSTEM_IDENTIFIER],
    });

    render(
      <ZMKAppProvider value={app}>
        <BrightnessSection />
      </ZMKAppProvider>
    );

    expect(
      screen.getByRole("heading", { name: /LED brightness/i })
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("62%")).toBeInTheDocument());
    expect(screen.getByLabelText("Brightness")).toHaveValue("62");
  });

  it("persists the value selected with the range control", async () => {
    mockBrightnessRpc(50);
    const app = createConnectedMockZMKApp({
      subsystems: [SUBSYSTEM_IDENTIFIER],
    });
    render(
      <ZMKAppProvider value={app}>
        <BrightnessSection />
      </ZMKAppProvider>
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Brightness")).toHaveValue("50")
    );
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Brightness"));
    await user.keyboard(
      "{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}"
    );
    await user.click(screen.getByRole("button", { name: /Save brightness/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Brightness saved to your keyboard/i)
      ).toBeInTheDocument();
    });
    expect(zmkClient.call_rpc).toHaveBeenCalledTimes(2);
  });

  it("explains that a saved value cannot be applied without an LED driver", async () => {
    mockBrightnessRpc(35, false);
    const app = createConnectedMockZMKApp({
      subsystems: [SUBSYSTEM_IDENTIFIER],
    });
    render(
      <ZMKAppProvider value={app}>
        <BrightnessSection />
      </ZMKAppProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/no enabled backlight or RGB underglow/i)
      ).toBeInTheDocument();
    });
  });

  it("shows setup guidance when the firmware has no brightness subsystem", () => {
    const app = createConnectedMockZMKApp({ subsystems: [] });
    render(
      <ZMKAppProvider value={app}>
        <BrightnessSection />
      </ZMKAppProvider>
    );

    expect(screen.getByText(/module is not installed/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /module guide/i })).toHaveAttribute(
      "href",
      "https://github.com/cormoran/zmk-led-brightness-rpc#readme"
    );
  });
});
