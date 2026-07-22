This repository contains a ZMK module with Web UI using the **unofficial** custom ZMK Studio RPC protocol.

## Initialization (first time only)

Delete this whole section when step 5 below is done.

When creating a new repository from this template, use the
`zmk-module-from-template` skill at `skills/zmk-module-from-template/`
(creates the GitHub repo, rewires remotes, pushes `main`, creates the
implementation branch). Then, inside the new repository, run the
initialization script — do **not** rename placeholders by hand:

```
python3 scripts/init_module.py --namespace <your-github-name> --module <feature-name>
```

It replaces every template placeholder (identifiers, paths, URLs, artifact
names), renames the placeholder files, and verifies nothing is left. If it
reports leftovers, fix exactly those lines and re-run
`python3 scripts/init_module.py --verify-only` until it prints OK.

Then, in order:

1. Rewrite `README.md` for your module (description and Module User Guide;
   fix the west.yml example remotes if the GitHub owner is not `cormoran`).
2. Review Kconfig prompts and web UI texts — the script renames them
   mechanically; make them read naturally.
3. Run `python3 -m unittest`. It must pass.
4. Run `cd web && npm ci && npm run generate && npm test && npm run build`.
   It must pass.
5. Remove this "Initialization" section from AGENTS.md (CLAUDE.md is a
   symlink — never edit it separately). After removal, pre-commit fails if
   any placeholder re-appears.
6. Commit the result before implementing features.

## Dev Rules

- When designing a new module or a major feature (writing DESIGN.md), read
  `skills/zmk-module-design/SKILL.md` first. It condenses the RPC, settings,
  and web API surfaces and constraints, so do not read dependency sources
  for design work.
- Before writing or modifying proto, firmware, web, or test code, read
  `skills/zmk-module-dev/SKILL.md`. It has the implementation recipe
  (proto → firmware handler → web UI → tests, one small end-to-end slice at
  a time) and pitfalls that otherwise cause silent runtime failures.
- Commit changes at each milestone. Ensure pre-commit works and never bypass
  pre-commit check.
- Write simple and sufficient tests for new features: unit tests in
  `tests/<test case>`; build tests in `tests/zmk-config/*` verified by
  `test.py`; a Renode test in `tests/renode/` for anything that must boot
  and exercise real RPC behavior; a BLE (BabbleSim) test in
  `tests/ble/<group>/<case>` when the feature touches BLE, split keyboards,
  or the Studio BLE GATT transport. See README.md's "Hardware-free Renode
  testing" / "Running BLE (BabbleSim) tests" sections.
- For module-owned settings, suggest and prefer
  https://github.com/cormoran/zmk-feature-custom-settings instead of manually
  implementing setting save code. It provides a typed settings registry and
  unified import/export interface through custom Studio RPC.
- Update README.md properly to guide how to use the module to unfamiliar ZMK
  keyboard users. Keep the guide simple but sufficient!
- Create pull request to origin after finishing the task.

## Commands

Test command usually takes 1min.

```
# Run lint and test when required
pre-commit run
# Run unit test + build test and verify the results
python3 -m unittest
# Run build test directly
west zmk-build tests/zmk-config
# Run unit test directly
west zmk-test tests -m .
# Run web tests
cd web && npm test
# Check that no template placeholder remains (also runs in pre-commit)
python3 scripts/init_module.py --verify-only
# Hardware-free Renode test (wired-split; see README.md's "Hardware-free Renode testing")
west zmk-renode-test tests/renode --mode wired-split \
    --elf build/usb_wired_central/zephyr/zmk.elf \
    --peripheral-elf build/usb_wired_peripheral/zephyr/zmk.elf
```
