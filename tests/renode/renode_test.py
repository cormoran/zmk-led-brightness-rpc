#!/usr/bin/env python3
"""Hardware-free functional test: boot this module's firmware in the Renode
emulator and exercise its own custom Studio RPC subsystem end to end.

This is the one test file a real module built from this template is
expected to rewrite -- everything generic (booting, the core Studio RPC
GetDeviceInfo round-trip) already ran as the "smoke test" step of the
`zmk-renode-test` GitHub Action (see cormoran/zmk-workspace's
`.github/actions/zmk-renode-test/`) before this file even runs. This file
only needs to know about *this module's own* RPC surface.

How it's wired together (see README.md's "Hardware-free Renode testing"
section for the full story):
  - `ZMK_RENODE_ELF` (env var) points at the firmware ELF the action already
    built with the Renode Studio-RPC-over-UART overlay + transport (real
    hardware normally carries Studio RPC over USB; Renode's USB model is a
    non-functional register stub, so testing under emulation swaps in a
    wired-UART carrier with identical RPC framing -- see zmk-workspace's
    skills/test-zmk-renode/SKILL.md for why).
  - `renode_harness` (a module from that same zmk-workspace checkout) is
    importable via PYTHONPATH -- the action sets this up. It provides
    RenodeSession/boot_single/wait_for_text/proto compiling, so this file
    doesn't need to reimplement any of the Renode-specific plumbing.
  - The custom RPC "envelope": ZMK Studio's `zmk.custom` subsystem is a
    generic pass-through -- a module's own proto messages travel as opaque
    `bytes` inside `zmk.custom.CallRequest.payload`/`CallResponse.payload`,
    addressed by a runtime-assigned `subsystem_index` (see dependencies'
    zmk-studio-messages proto/zmk/custom.proto). This module registers
    itself under the fixed string identifier "your_name__template"
    (src/studio/template_handler.c,
    `ZMK_RPC_CUSTOM_SUBSYSTEM(your_name__template, ...)`), always as the
    first (and, in this stock template, only) registered subsystem, i.e.
    index 0.

*** KNOWN RENODE-ENVIRONMENT LIMITATION, found by this test suite (2026-07-08) ***
Under Renode -- and, as far as we know, ONLY under Renode; the same code
path is hardware-validated in zmk-feature-studio-rpc-perf -- Studio RPC
responses that go through a *registered* custom subsystem's callback-based
response encoding (`ZMK_RPC_CUSTOM_SUBSYSTEM_RESPONSE_BUFFER_ALLOCATE` /
`zmk_rpc_custom_subsystem_encode_response_payload`) stop being delivered
once the response grows past a few tens of bytes, or after a couple of
successful smaller round trips:

  - zmk-feature-studio-rpc-perf (SAME vendored ZMK fork commit 618f083,
    same custom-subsystem macros, validated on real hardware): under
    Renode, a ~28-byte framed custom response round-trips OK twice, then
    the third request times out; a first-call response of ~55-65 bytes
    framed times out immediately.
  - This template's SampleResponse (~51 bytes framed) and its own
    ErrorResponse both time out on the very first call.
  - Small, callback-free responses stay reliable indefinitely: core
    GetDeviceInfo (~21B; the action's smoke test), and meta.simple_error
    (~10B; see test_custom_rpc_invalid_index_dispatch below -- a genuine,
    affirmative proof the custom envelope/dispatch machinery itself works:
    framing, oneof selection, index validation).

During the hang the firmware is NOT crashed: Renode's
`sysbus.cpu ExecutedInstructions` keeps growing steadily and
`sysbus.cpu PC` samples land inside `ring_buf_area_claim`/
`ring_buf_area_finish` (dependencies/zephyr/lib/utils/ring_buffer.c),
consistent with the studio RPC TX path waiting on a TX ring buffer that
never drains. Ruled out individually: request-delivery timing (byte-paced
UART sends behave identically), CONFIG_ZMK_STUDIO_RPC_RX_BUF_SIZE (30 vs
128), CONFIG_ZMK_STUDIO_RPC_TX_BUF_SIZE (64 vs 256, verified in .config),
and always-enabling the TX IRQ in the Renode UART transport module. The
precise mechanism (most plausibly an interaction between rpc.c's
tx_notify batching heuristics and Renode's nRF52840 UARTE TX-interrupt
model) was deliberately not chased further -- it does not affect real
hardware, and fixing it means emulator/harness work, not module work.

Per this project's own convention for documented-but-not-chased-further
findings (see zmk-workspace's test-zmk-renode skill, T3/BLE), the real
end-to-end round trip is captured below as a test that asserts the *known
failure under Renode* (so a future harness/emulator fix will make it
visibly start failing, prompting an update) rather than silently skipped.

Run locally (from this repo's root, with a west workspace already set up --
see README.md):

    python3 tests/renode/renode_test.py -v

(Named `renode_test.py`, not `test_renode.py`, on purpose: the existing
`python3 -m unittest -v` build-job step at the repo root auto-discovers
every `test*.py`, and this file needs a real firmware ELF + PYTHONPATH the
build job doesn't set up -- keeping it out of that pattern keeps the two
test surfaces independent. The `zmk-renode-test` action instead runs
everything under `tests/renode/` explicitly, with `ZMK_RENODE_ELF` and
PYTHONPATH already set.)

The Renode-testable ELF must already be built; see README.md for the exact
`build_fw.py` invocation, or let the composite action do it in CI.
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# renode_harness comes from the zmk-workspace checkout the action provides
# on PYTHONPATH. Support running this file directly too by falling back to
# conventional relative locations: first the zmk-workspace west dependency
# this repo now has (west/west-dependency/west-test-dependency.yml --
# nicer than requiring a sibling checkout, since `west update` already
# fetches it), then a sibling `zmk-workspace` checkout next to this repo.
try:
    import renode_harness
except ImportError:  # pragma: no cover - convenience fallback for local dev
    fallback_candidates = [
        REPO_ROOT
        / "dependencies"
        / "zmk-workspace"
        / "skills"
        / "test-zmk-renode"
        / "scripts",
        REPO_ROOT.parent / "zmk-workspace" / "skills" / "test-zmk-renode" / "scripts",
    ]
    for fallback in fallback_candidates:
        if fallback.is_dir():
            sys.path.insert(0, str(fallback))
            import renode_harness

            break
    else:
        raise


SUBSYSTEM_IDENTIFIER = "your_name__template"
# This template registers exactly one custom subsystem, so its index is
# deterministically 0 -- but see the KNOWN RENODE-ENVIRONMENT LIMITATION
# note above: `ListCustomSubsystemRequest` (the normal way to discover this
# at runtime) returns a large response (identifier + UI URL, ~80+ bytes,
# well past the observed size threshold) and so also times out under
# Renode; this test hardcodes the index rather than discovering it.
KNOWN_SUBSYSTEM_INDEX = 0
# Always out of range regardless of how many custom subsystems a given
# module registers -- used to exercise the *working* fast-path dispatch
# (see test_custom_rpc_invalid_index_dispatch).
INVALID_SUBSYSTEM_INDEX = 99


class RenodeTemplateModuleTests(unittest.TestCase):
    """Boots the module's own Renode-testable ELF once for the whole class
    (like the skill's own T0/T1 tests, boot is the slow part) and exercises
    the custom subsystem envelope/dispatch machinery."""

    renode_path: str
    elf: Path
    studio_pb2 = None
    template_pb2 = None

    @classmethod
    def setUpClass(cls):
        cls.renode_path = renode_harness.find_or_install_renode()
        if cls.renode_path is None:
            raise unittest.SkipTest(
                "Renode is not installed and could not be auto-installed"
            )

        elf_env = os.environ.get("ZMK_RENODE_ELF")
        if not elf_env:
            raise unittest.SkipTest(
                "ZMK_RENODE_ELF not set -- build the Renode-testable ELF first (see README.md)"
            )
        cls.elf = Path(elf_env)
        if not cls.elf.is_file():
            raise unittest.SkipTest(f"ZMK_RENODE_ELF does not exist: {cls.elf}")

        # Core zmk.studio.* messages (Request/Response envelope, core.proto,
        # custom.proto for the generic custom-subsystem envelope).
        studio_proto_dir = renode_harness.find_studio_proto_dir(REPO_ROOT)
        cls.studio_pb2 = renode_harness.load_studio_pb2(studio_proto_dir)

        # This module's own proto (proto/your-name/template/template.proto,
        # package your_name.template) -- compiled separately since it lives
        # outside zmk-studio-messages. protoc normalizes the hyphenated
        # on-disk path ("your-name") to a valid Python package
        # ("your_name") in its generated output.
        out_dir = renode_harness.compile_protos(
            [REPO_ROOT / "proto" / "your-name" / "template" / "template.proto"],
            include_dirs=[REPO_ROOT / "proto"],
        )
        sys.path.insert(0, str(out_dir))
        import your_name.template.template_pb2 as template_pb2  # type: ignore

        cls.template_pb2 = template_pb2

    def setUp(self):
        self.session, self.console, self.rpc = renode_harness.boot_single(
            self.renode_path, self.elf
        )
        self.addCleanup(self.session.stop)
        self.addCleanup(self.console.close)
        self.addCleanup(self.rpc.close)

        banner = renode_harness.wait_for_text(
            self.console._sock, "Welcome to ZMK", timeout=15
        )
        self.assertIn(
            "Welcome to ZMK", banner, f"never saw ZMK boot banner; got:\n{banner}"
        )

    def _send_call(self, subsystem_index: int, payload: bytes, request_id: int = 1):
        req = self.studio_pb2.Request()
        req.request_id = request_id
        req.custom.call.subsystem_index = subsystem_index
        req.custom.call.payload = payload
        self.rpc.send(req.SerializeToString())

    # -- Affirmative proof the custom-subsystem envelope works -----------

    def test_custom_rpc_invalid_index_dispatch(self):
        """`custom.call` to a subsystem index that doesn't exist proves the
        whole custom-subsystem *envelope* round-trips correctly end to end
        (Request.custom oneof selection, CallRequest field encoding,
        subsystem-count/index validation, meta.simple_error response
        encoding/decoding) -- everything except actually returning a real
        subsystem's (larger) response, which hits the known Renode-only
        limitation documented in this file's module docstring."""
        self._send_call(INVALID_SUBSYSTEM_INDEX, b"", request_id=7)

        resp_bytes = self.rpc.read_frame(timeout=10.0)
        self.assertIsNotNone(
            resp_bytes, "no response to custom.call with an invalid index (timeout)"
        )
        resp = self.studio_pb2.Response()
        resp.ParseFromString(resp_bytes)
        self.assertEqual(resp.WhichOneof("type"), "request_response")
        self.assertEqual(resp.request_response.request_id, 7)
        self.assertEqual(resp.request_response.WhichOneof("subsystem"), "meta")
        self.assertEqual(
            resp.request_response.meta.WhichOneof("response_type"), "simple_error"
        )
        # zmk.meta.ErrorConditions.RPC_NOT_FOUND == 2
        self.assertEqual(resp.request_response.meta.simple_error, 2)

    # -- Known Renode limitation: documented, asserted, not silently skipped --

    def test_custom_rpc_sample_round_trip_KNOWN_BROKEN_UNDER_RENODE(self):
        """Documents the known Renode-environment limitation (see this
        file's module docstring): sending a real SampleRequest to this
        module's own registered subsystem (index 0) should get back a
        SampleResponse with `"Hello from firmware! Received: 42"` (see
        handle_sample_request() in src/studio/template_handler.c) -- and
        does, on real hardware -- but under Renode the ~51-byte response
        never arrives (RPC TX path stalls; smaller callback-free responses
        are unaffected). This test asserts *that exact failure* (a read
        timeout) so it will start failing -- loudly, as a signal to update
        this test to assert the real round trip -- the day the underlying
        emulation/harness limitation is fixed."""
        inner_req = self.template_pb2.Request()
        inner_req.sample.value = 42
        self._send_call(KNOWN_SUBSYSTEM_INDEX, inner_req.SerializeToString())

        resp_bytes = self.rpc.read_frame(timeout=10.0)
        self.assertIsNone(
            resp_bytes,
            "custom.call to the real registered subsystem got a response under Renode -- "
            "the known Renode-only limitation documented in this file's module docstring "
            "appears to be fixed! Update this test to assert the real SampleResponse "
            "round-trip instead (see test_custom_rpc_invalid_index_dispatch for the "
            "request-building pattern), and consider re-adding subsystem discovery via "
            "ListCustomSubsystemRequest.",
        )


if __name__ == "__main__":
    unittest.main()
