import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createConnectedMockZMKApp,
  ZMKAppProvider,
} from "@cormoran/zmk-studio-react-hook/testing";
import { RPCTestSection, SUBSYSTEM_IDENTIFIER } from "../src/App";
import { Response } from "../src/proto/your-name/template/template";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";

// Mock the ZMK client so we can control call_rpc responses directly: both
// useStudioLockState's initial getLockState query and useCustomSubsystem's
// callRPC go through this module.
jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  create_rpc_connection: jest.fn(),
  call_rpc: jest.fn(),
  MetaError: class MetaError extends Error {
    condition: number;
    constructor(condition: number) {
      super(`meta error: ${condition}`);
      this.condition = condition;
      Object.setPrototypeOf(this, MetaError.prototype);
    }
  },
}));

const UNLOCK_REQUIRED = 1; // zmk.meta.ErrorConditions.UNLOCK_REQUIRED

describe("RPCTestSection Component", () => {
  describe("With Subsystem", () => {
    it("should render RPC controls when subsystem is found", () => {
      const mockZMKApp = createConnectedMockZMKApp({
        deviceName: "Test Device",
        subsystems: [SUBSYSTEM_IDENTIFIER],
      });

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <RPCTestSection />
        </ZMKAppProvider>
      );

      expect(screen.getByText(/RPC Test/i)).toBeInTheDocument();
      expect(screen.getByText(/Send a sample request/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Value:/i)).toBeInTheDocument();
      expect(screen.getByText(/Send Request/i)).toBeInTheDocument();
    });

    it("should show default input value", () => {
      const mockZMKApp = createConnectedMockZMKApp({
        subsystems: [SUBSYSTEM_IDENTIFIER],
      });

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <RPCTestSection />
        </ZMKAppProvider>
      );

      const input = screen.getByLabelText(/Value:/i) as HTMLInputElement;
      expect(input.value).toBe("42");
    });
  });

  describe("Without Subsystem", () => {
    it("should show warning when subsystem is not found", () => {
      const mockZMKApp = createConnectedMockZMKApp({
        deviceName: "Test Device",
        subsystems: [],
      });

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <RPCTestSection />
        </ZMKAppProvider>
      );

      expect(
        screen.getByText(/Subsystem "your_name__template" not found/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Make sure your firmware includes the template module/i
        )
      ).toBeInTheDocument();
      const link = screen.getByRole("link", { name: /module README/i });
      expect(link).toHaveAttribute(
        "href",
        "https://github.com/cormoran/zmk-module-template#readme"
      );
    });
  });

  describe("Without ZMKAppContext", () => {
    it("should not render when ZMKAppContext is not provided", () => {
      const { container } = render(<RPCTestSection />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe("Unlock flow", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const zmkClient = require("@zmkfirmware/zmk-studio-ts-client");

    beforeEach(() => {
      jest.clearAllMocks();
    });

    function mockCallRpc({
      lockState,
      customResult,
    }: {
      lockState: LockState;
      customResult: "unlock-required" | "success";
    }) {
      zmkClient.call_rpc.mockImplementation(
        (
          _connection: unknown,
          req: {
            core?: { getLockState?: boolean };
            custom?: { call?: unknown };
          }
        ) => {
          if (req.core?.getLockState) {
            return Promise.resolve({ core: { getLockState: lockState } });
          }
          if (req.custom?.call) {
            if (customResult === "unlock-required") {
              return Promise.reject(new zmkClient.MetaError(UNLOCK_REQUIRED));
            }
            const payload = Response.encode(
              Response.create({ sample: { value: "unlocked response" } })
            ).finish();
            return Promise.resolve({ custom: { call: { payload } } });
          }
          return Promise.reject(new Error("unexpected call_rpc request"));
        }
      );
    }

    it("shows the unlock prompt when a secured RPC call is rejected with UNLOCK_REQUIRED", async () => {
      mockCallRpc({
        lockState: LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED,
        customResult: "unlock-required",
      });

      const mockZMKApp = createConnectedMockZMKApp({
        subsystems: [SUBSYSTEM_IDENTIFIER],
      });

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <RPCTestSection />
        </ZMKAppProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByText(/Send Request/i));

      await waitFor(() => {
        expect(screen.getByText(/ZMK Studio is locked/i)).toBeInTheDocument();
      });
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    it("auto-retries and renders the response once a lockStateChanged notification reports unlocked", async () => {
      // Initial getLockState reports unlocked (optimistic), so the Send
      // button starts enabled; the send itself is what discovers the device
      // requires unlocking (e.g. the firmware handler flipped to SECURED
      // after the initial query).
      mockCallRpc({
        lockState: LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED,
        customResult: "unlock-required",
      });

      // createConnectedMockZMKApp's onNotification is a plain jest mock (it
      // does not dispatch the `notifications` array on its own -- that array
      // only feeds useZMKApp's own notification reader, not this mock
      // context). Capture the core callback useStudioLockState registers so
      // the test can simulate a real-time lockStateChanged notification.
      let coreCallback:
        | ((notification: { lockStateChanged?: LockState }) => void)
        | undefined;
      const mockZMKApp = createConnectedMockZMKApp({
        subsystems: [SUBSYSTEM_IDENTIFIER],
      });
      mockZMKApp.onNotification = jest.fn((subscription) => {
        if (subscription.type === "core") {
          coreCallback = subscription.callback;
        }
        return () => {};
      });

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <RPCTestSection />
        </ZMKAppProvider>
      );

      const user = userEvent.setup();
      await waitFor(() => {
        expect(screen.getByText(/Send Request/i)).not.toBeDisabled();
      });
      await user.click(screen.getByText(/Send Request/i));

      await waitFor(() => {
        expect(screen.getByText("Retry")).toBeInTheDocument();
      });

      // Once the retry (triggered by the notification below) fires, let it
      // succeed.
      mockCallRpc({
        lockState: LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED,
        customResult: "success",
      });

      expect(coreCallback).toBeDefined();
      // The auto-retry effect only fires when `locked` actually *changes* to
      // false. Simulate the realistic sequence: the device confirms it's
      // locked (a real transition, since the hook's `locked` started false
      // optimistically), then reports unlocked once the user presses
      // &studio_unlock -- that second, real true->false transition is what
      // triggers the retry.
      await act(async () => {
        coreCallback?.({
          lockStateChanged: LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED,
        });
      });
      await act(async () => {
        coreCallback?.({
          lockStateChanged: LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED,
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/unlocked response/i)).toBeInTheDocument();
      });
    });

    it("retries manually via the Retry button and renders the response", async () => {
      mockCallRpc({
        lockState: LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED,
        customResult: "unlock-required",
      });

      const mockZMKApp = createConnectedMockZMKApp({
        subsystems: [SUBSYSTEM_IDENTIFIER],
      });

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <RPCTestSection />
        </ZMKAppProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByText(/Send Request/i));

      await waitFor(() => {
        expect(screen.getByText("Retry")).toBeInTheDocument();
      });

      mockCallRpc({
        lockState: LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED,
        customResult: "success",
      });

      await user.click(screen.getByText("Retry"));

      await waitFor(() => {
        expect(screen.getByText(/unlocked response/i)).toBeInTheDocument();
      });
    });
  });
});
