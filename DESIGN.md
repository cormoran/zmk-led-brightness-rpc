# LED brightness design

## Scope

This module provides one persisted 0–100% brightness value for the keyboard's
ZMK backlight or RGB underglow. It deliberately does not configure LED
effects, hue, saturation, or hardware devicetree nodes. If neither backlight
nor RGB underglow is enabled, the setting and RPC remain available but report
that no compatible LED device is present.

## Configuration and persistence

The module requires `CONFIG_ZMK_CUSTOM_SETTINGS`. It registers the public,
unsecured `brightness` `INT32` custom setting, with a default of 50 and an
inclusive 0–100 constraint. Updates use `PERSIST` mode, so the value is stored
in the keyboard's Zephyr settings backend. The custom-settings initialized
event applies the loaded value after `settings_load()`; changed-setting events
apply later UI or RPC updates immediately.

## RPC

Subsystem: `cormoran__led_brightness` (unsecured).

| Request | Response | Notes |
| --- | --- | --- |
| `GetBrightness` | `Brightness { value, device_available }` | Returns the saved value and LED availability. |
| `SetBrightness { value }` | `Brightness { value, device_available }` | Rejects values outside 0–100; persists before applying. |

The largest encoded response is under 8 bytes. The handler uses the template's
static response buffer and asserts the Studio TX buffer is at least 64 bytes.

## LED application

When backlight support is enabled, the module calls `zmk_backlight_set_brt()`.
When RGB underglow support is enabled, it retains the current hue/saturation,
sets the HSB brightness, and calls `zmk_rgb_underglow_set_hsb()`. Backlight
takes precedence if both are compiled. There is no LED driver implementation
in this module, so native-sim and Studio RPC tests can run without hardware.

## Web UI and validation

The published React UI discovers the custom subsystem, reads brightness on
connect, and offers a labeled range control plus an explicit save action.
Unit tests cover rendering, get and set RPCs, validation, and unavailable
hardware. Firmware tests cover RPC round trips, with the normal ZMK build,
Renode, BLE, and browser E2E workflows providing integration coverage.
