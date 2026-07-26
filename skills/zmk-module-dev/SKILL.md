---
name: zmk-module-dev
description: Implementation recipe and pitfalls for developing features in this ZMK module (proto → firmware handler → web UI → tests). Read this before writing or modifying proto definitions, firmware RPC/settings code, web UI code, or tests — it contains constraints that otherwise cause silent runtime failures or broken builds.
---

# Develop a feature in this module

## Implementation recipe (repeat per feature slice)

Implement features in small end-to-end slices. Finish and verify one
request/response pair before starting the next.

1. **Proto**: add a request/response message pair to the `oneof`s in
   `proto/<namespace>/<module>/<module>.proto`. Give every `string`/`bytes`
   field a `max_size` in the neighboring `.options` file — fields without one
   generate nanopb callback types that do not work with this template's plain
   struct handlers.
   Done when: `west zmk-build tests/zmk-config -q` compiles.
2. **Firmware**: add a `case` to the handler's request switch. Keep response
   payload data in static storage (see pitfalls). Extend a test under
   `tests/studio/` (or add a new test case directory) to cover it.
   Done when: `west zmk-test tests -m .` passes.
3. **Web**: run `cd web && npm run generate`, then use the new messages in the
   UI. Add or extend a spec in `web/test/`. For UI a user drives end to end,
   extend `web/e2e/rpc.spec.ts` too -- it runs the real UI in a browser against
   the real firmware in Renode (README.md's "Web UI end-to-end testing").
   Done when: `npm test` and `npm run build` pass.
4. **Gate**: `python3 -m unittest` and `pre-commit run --all-files` pass.
   Never start the next slice with anything red.

## Pitfalls

### nanopb / proto

- In proto3, nanopb generates a `has_<field>` boolean for every sub-message
  field. You **must** set `has_<field> = true` alongside any assignment to a
  sub-message field, otherwise nanopb silently skips encoding the entire
  sub-message.
- Never use 64-bit proto field types (`uint64`, `int64`, `sint64`, `fixed64`).
  `CONFIG_ZMK_STUDIO` implies `CONFIG_NANOPB_WITHOUT_64BIT`, so they fail at
  encoding with "invalid data_size". Use `uint32`/`int32` (e.g. uptime in ms
  wraps after ~49 days — acceptable for diagnostics).

### Studio RPC

- Default RPC buffers are tiny (RX 30 / TX 64 bytes). Custom settings needs
  `CONFIG_ZMK_STUDIO_RPC_RX_BUF_SIZE=128`; large/chunked responses need
  `CONFIG_ZMK_STUDIO_RPC_TX_BUF_SIZE` ≥ max encoded response + ~64 bytes of
  framing margin. Put a `BUILD_ASSERT` next to the response definition so a
  too-small buffer fails at compile time, not at runtime.
- Response payload data must live in static buffers: encoding runs after the
  handler returns, possibly multiple times. Stack-allocated data produces
  corrupted responses.

### Kconfig / tests

- Make `ZMK_<MODULE>_STUDIO_RPC` (and `..._CUSTOM_SETTINGS`) depend only on
  `ZMK_STUDIO` / `ZMK_CUSTOM_SETTINGS`, not on your driver/hardware config.
  Provide an API stub returning 0 devices when the driver is not compiled and
  handle 0 devices in handlers. This lets native_sim unit tests cover RPC and
  settings without hardware devicetree nodes.
- Artifact names and CONFIG symbols in `tests/zmk-config/build.yaml` and
  `test.py` must match exactly — always update both together.
- Put device overlays + configs for build tests in
  `tests/zmk-config/snippets/<name>/` (`snippet_root: .` is already set);
  `build.yaml` entries accept both `snippet:` (single) and `snippets:` (list).
- The `tester_xiao` shield uses `xiao_d 0..10` for kscan. Any overlay adding
  SPI/GPIO peripherals on those pins must shrink
  `&kscan0 { input-gpios = ... }` and the matrix transform to
  non-conflicting pins.
- In snippet overlays that redefine a matrix transform, add `#undef RC` and
  re-include `<dt-bindings/zmk/matrix_transform.h>` first: keymap headers
  define a conflicting 1-arg `RC(mods)` macro.

### Custom settings

- `settings_load()` runs from `main()` after all SYS_INIT levels and does NOT
  raise `zmk_custom_setting_changed`. Apply persisted values from your own
  (async, workqueue-delayed) init path, and listen for
  `zmk_custom_setting_changed` only for post-boot changes.
- `ZMK_CUSTOM_SETTING_DEFINE` combined with `ZMK_CUSTOM_SETTING_RANGE_INT32`
  does not compile (nested compound literals in a static initializer). Define
  ranged settings with `STRUCT_SECTION_ITERABLE(zmk_custom_setting, ...)` and
  plain designated initializers instead.

### Web

- When the web UI needs proto files from a dependency module, vendor a pinned
  copy under `web/proto/` (record the source commit in the file header) and
  add that directory to `web/buf.gen.yaml` inputs. Do NOT copy it into the
  top-level `proto/` — the firmware nanopb glob compiles everything there and
  produces duplicate symbols. Do not point `buf.gen.yaml` at
  `../dependencies/...` either: web CI runs without a west workspace, so that
  path does not exist there.
