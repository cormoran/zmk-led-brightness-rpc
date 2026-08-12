/* SPDX-License-Identifier: MIT */

#pragma once

#include <stdbool.h>
#include <stdint.h>

#define ZMK_LED_BRIGHTNESS_MIN 0
#define ZMK_LED_BRIGHTNESS_MAX 100

int zmk_led_brightness_get(int32_t *brightness);
int zmk_led_brightness_set(int32_t brightness);
bool zmk_led_brightness_device_available(void);
