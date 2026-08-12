# ZMK LED Brightness

[![Web UI](https://github.com/cormoran/zmk-led-brightness-rpc/actions/workflows/web-ui.yml/badge.svg)](https://github.com/cormoran/zmk-led-brightness-rpc/actions/workflows/web-ui.yml)
[![ZMK module](https://github.com/cormoran/zmk-led-brightness-rpc/actions/workflows/zmk-module.yml/badge.svg)](https://github.com/cormoran/zmk-led-brightness-rpc/actions/workflows/zmk-module.yml)

Control a ZMK keyboard's LED brightness in the browser and keep that value on
the keyboard. The module supports either ZMK backlight or RGB underglow; it
does not provide an LED driver or devicetree configuration itself.

The Web UI is published at <https://cormoran.github.io/zmk-led-brightness-rpc/>.
It communicates with the keyboard using the unofficial custom ZMK Studio RPC
protocol, so use the matching patched ZMK branch.

## Install in a ZMK config

Add the module and patched ZMK to `config/west.yml`:

```yaml
manifest:
  remotes:
    - name: cormoran
      url-base: https://github.com/cormoran
  projects:
    - name: zmk-led-brightness-rpc
      remote: cormoran
      revision: main
      import: true
    - name: zmk
      remote: cormoran
      revision: main+custom-studio-protocol
      import:
        file: app/west.yml
```

Enable the module in your shield `.conf` file. Enable one LED implementation
as usual in the same keyboard configuration.

```conf
CONFIG_ZMK_CUSTOM_SETTINGS=y
CONFIG_ZMK_LED_BRIGHTNESS=y

CONFIG_ZMK_STUDIO=y
CONFIG_ZMK_LED_BRIGHTNESS_STUDIO_RPC=y
CONFIG_ZMK_STUDIO_RPC_RX_BUF_SIZE=128
CONFIG_ZMK_LOW_PRIORITY_THREAD_STACK_SIZE=2048
```

`CONFIG_ZMK_CUSTOM_SETTINGS` selects Zephyr settings storage. The `brightness`
value is constrained to 0–100, defaults to 50, and is written in persistent
mode. It is applied after settings have loaded at boot, and every browser
update is applied immediately.

## Use the Web UI

1. Flash firmware built with the options above.
2. Open <https://cormoran.github.io/zmk-led-brightness-rpc/> in Chrome or
   another Chromium-based browser over HTTPS.
3. Connect through USB or Bluetooth. If Bluetooth discovery is locked, press
   the keyboard's `&studio_unlock` key first.
4. Move the slider and choose **Save brightness**.

The app reports when the firmware has neither backlight nor RGB underglow
enabled. In that case it still saves the value, so it will apply once an LED
implementation is enabled.

## Development

The repository is intended to be opened with the supplied devcontainer. It
initializes the isolated west workspace and installs the pre-commit hook.

```bash
python3 -m unittest
cd web && npm ci && npm run generate && npm test && npm run build
```

The test suite includes native-sim, firmware build, Renode, BLE, and browser
end-to-end workflows. See `tests/renode/` and `web/e2e/` for the emulator-based
commands used by CI.
