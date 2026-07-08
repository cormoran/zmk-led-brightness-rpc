# cormoran's ZMK Module Template for ZMK (with Custom Studio RPC)

![ZMK Version](https://img.shields.io/badge/ZMK-master-blue)
[![Test](https://github.com/cormoran/zmk-module-template/actions/workflows/zmk-module.yml/badge.svg?branch=main)](https://github.com/cormoran/zmk-module-template/actions/workflows/zmk-module.yml) [![Devcontainer](https://github.com/cormoran/zmk-module-template/actions/workflows/devcontainer.yml/badge.svg?branch=main)](https://github.com/cormoran/zmk-module-template/actions/workflows/devcontainer.yml)

This repository contains a template for a ZMK module with Web UI using the **unofficial** custom ZMK Studio RPC protocol.

It's extended from ZMK official template with [zmk-west-commands](https://github.com/cormoran/zmk-west-commands), test code template, coding agent support, and custom Studio RPC protocol support.

## Summary

This template includes:

- **Firmware**: Sample custom Studio RPC handler (`src/studio/template_handler.c`)
- **Protocol**: Protobuf definition (`proto/your-name/template/template.proto`)
- **Web UI**: React + TypeScript app (`web/`) using [@cormoran/zmk-studio-react-hook](https://github.com/cormoran/react-zmk-studio)
- **Tests**: Firmware unit tests (`tests/studio/`) and build tests (`tests/zmk-config/`)

Read through the [ZMK Module Creation](https://zmk.dev/docs/development/module-creation) page for details on how to configure this template.

## More Info

For more info on modules, you can read through through the [Zephyr modules page](https://docs.zephyrproject.org/3.5.0/develop/modules.html) and [ZMK's page on using modules](https://zmk.dev/docs/features/modules). [Zephyr's west manifest page](https://docs.zephyrproject.org/3.5.0/develop/west/manifest.html#west-manifests) may also be of use.

## Module User Guide

1. Add dependency to your `config/west.yml`. Note: this module requires a patched ZMK with custom Studio RPC support.

   ```yml
   manifest:
       remotes:
           ...
           - name: cormoran
           url-base: https://github.com/cormoran
       projects:
           ...
           - name: zmk-module-template
           remote: cormoran
           revision: main+custom-studio-protocol # or latest commit hash
           import: true
           ...
           # Required: patched ZMK with custom Studio RPC support
           - name: zmk
           remote: cormoran
           revision: main+custom-studio-protocol
           import:
               file: app/west.yml
   ```

2. Enable flags in your `config/<shield>.conf`

   ```conf
   CONFIG_ZMK_TEMPLATE_FEATURE=y

   # Optionally enable custom Studio RPC
   CONFIG_ZMK_STUDIO=y
   CONFIG_ZMK_TEMPLATE_FEATURE_STUDIO_RPC=y
   CONFIG_ZMK_CUSTOM_SETTINGS=y
   CONFIG_ZMK_CUSTOM_SETTINGS_STUDIO_RPC=y
   CONFIG_ZMK_STUDIO_RPC_RX_BUF_SIZE=128
   CONFIG_ZMK_LOW_PRIORITY_THREAD_STACK_SIZE=2048
   ```

3. Implement your custom protocol by editing:
   - `proto/your-name/template/template.proto` — message types
   - `src/studio/template_handler.c` — firmware RPC handler
   - `web/src/App.tsx` — web UI

### Web UI

See [web/README.md](./web/README.md) for web UI development instructions.

### Publishing Web UI

**GitHub Pages**: Merge a pull request into `main+custom-studio-protocol` to deploy to `https://<account>.github.io/<repo>/`.

**Cloudflare Workers (PR previews)**: Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

## Module Development Guide

### Initialize from template

Right after creating a repository from this template, run the initialization
script and follow the checklist in [AGENTS.md](./AGENTS.md):

```bash
python3 scripts/init_module.py --namespace <your-github-name> --module <feature-name>
```

It replaces every template placeholder (identifiers, paths, URLs, artifact
names) and verifies nothing is left (`--verify-only` re-checks at any time).

### Setup for running test

#### Option0: Dev container (recommended)

Open this repository in VS Code with the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers). The container automatically initializes the west workspace using the isolated layout.

#### Option1: west workspace directory layout

Set west topdir as parent of repository root and download dependencies under `../`.
This layout is useful to reduce disk usage by sharing dependencies with other zephyr modules.
The build result is located in `../build`.

```bash
mkdir west-workspace
cd west-workspace # this directory becomes west workspace root (topdir)
git clone <this repository>
# rm -r .west # if exists to reset workspace
west init -l . --mf west/west-test-workspace.yml
west update --narrow
west zephyr-export
```

#### Option2: isolated directory layout

Set west topdir as repository root and download dependencies under `./dependencies`.
This layout is useful if you don't want to share dependencies to other zephyr modules.
Dev container and github actions uses this layout.
The build result is located in `./build`.

```bash
git clone <this repository>
cd <cloned directory>
west init -l west --mf west-test-isolated.yml
west update --narrow
west zephyr-export
```

### Pre-commit

Every commit need to pass pre-commit verification. The verification contains formatting code and running tests.

```
pip install pre-commit
pre-commit install

# Run pre-commit manually
pre-commit run --all-files
# Run for git staged files
pre-commit run
```

### Running Test

```bash
# Run unit test + build test and verify the results
python3 -m unittest
# Run build test directly
west zmk-build tests/zmk-config
# Run unit test directly
west zmk-test tests -m .
# Run web tests
cd web && npm test
```

### Hardware-free Renode testing

CI also boots this module's firmware in the [Renode](https://renode.io/)
emulator (no physical board needed) and exercises it functionally: the real
ZMK boot banner, a core Studio RPC `GetDeviceInfo` round trip, and this
module's own custom Studio RPC subsystem. This is a *step* in the `Build`
job in `.github/workflows/zmk-module.yml` (not a separate job) -- it tests
the `renode_smoke_test` artifact `python3 -m unittest -v` already built
(see `tests/zmk-config/build.yaml`) using a reusable action,
[`cormoran/zmk-workspace`'s
`zmk-renode-test`](https://github.com/cormoran/zmk-workspace/tree/main/.github/actions/zmk-renode-test).
**That action does not build firmware** -- this module's own build flow
does, using the `renode-studio-uart` Zephyr snippet that `zmk-workspace`
provides as a west dependency (see
`west/west-dependency/west-test-dependency.yml`); the action only boots the
resulting ELF and runs tests against it.

To reproduce locally (after the usual `west update`, which also fetches
`zmk-workspace` into `dependencies/zmk-workspace`):

```bash
# 1. Build the Renode-testable artifact (Studio-RPC-over-UART overlay + the
#    Renode-only transport that bypasses the USB-gated real one -- real
#    hardware still uses the studio-rpc-usb-uart snippet as normal). This
#    builds every tests/zmk-config/build.yaml artifact; -af filters to just
#    the Renode one by (substring) artifact name.
west zmk-build tests/zmk-config -af renode
# (equivalent to letting the full `python3 -m unittest -v` build sweep run)

# 2. Generic smoke test (boot banner + core Studio RPC).
python3 dependencies/zmk-workspace/skills/test-zmk-renode/scripts/renode_smoke.py \
  --elf build/renode_smoke_test/zephyr/zmk.elf --west-topdir "$PWD"

# 3. This module's own Renode test (custom Studio RPC subsystem). PYTHONPATH
#    is optional -- tests/renode/renode_test.py falls back to
#    dependencies/zmk-workspace/skills/test-zmk-renode/scripts automatically.
ZMK_RENODE_ELF="$PWD/build/renode_smoke_test/zephyr/zmk.elf" \
python3 tests/renode/renode_test.py -v
```

To adapt `tests/renode/renode_test.py` for your own module: it imports
`renode_harness` (from the `zmk-workspace` west dependency, via
`PYTHONPATH` in CI or the automatic fallback locally) for all the
Renode/RPC plumbing, reads the built ELF's path from `ZMK_RENODE_ELF`, and
only needs to know your module's own custom-subsystem identifier and proto
messages -- see the file's own module docstring for how the `zmk.custom`
envelope (subsystem discovery/addressing) works.

### Sync changes from template

Run `Actions > Sync Changes in Template > Run workflow` to get the latest template changes as a pull request.

If the template contains changes in `.github/workflows/*`, register a GitHub personal access token as `GH_TOKEN` repository secret (`repo` + `workflow` scopes).

### Coding agent on actions

Actions for github copilot and claude are available.

- Mention `@copilot`
- Setup `ANTHROPIC_API_KEY` secret and mention `@claude`
  - Or fix [claude.yml](./github/workflows/claude.yml) to use `CLAUDE_CODE_OAUTH_TOKEN`
