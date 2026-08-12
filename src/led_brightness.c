#include <errno.h>

#include <zephyr/kernel.h>
#include <zmk/event_manager.h>

#include <cormoran/led-brightness/led_brightness.h>
#include <cormoran/zmk/custom_settings.h>

#if IS_ENABLED(CONFIG_ZMK_BACKLIGHT)
#include <zmk/backlight.h>
#elif IS_ENABLED(CONFIG_ZMK_RGB_UNDERGLOW)
#include <zmk/rgb_underglow.h>
#endif

#include <zephyr/logging/log.h>
LOG_MODULE_DECLARE(zmk, CONFIG_ZMK_LOG_LEVEL);

#define LED_BRIGHTNESS_SUBSYSTEM "cormoran__led_brightness"
#define LED_BRIGHTNESS_KEY "brightness"

ZMK_CUSTOM_SETTING_DEFINE(led_brightness_value, LED_BRIGHTNESS_SUBSYSTEM, LED_BRIGHTNESS_KEY,
                          ZMK_CUSTOM_SETTING_VALUE_TYPE_INT32, ZMK_CUSTOM_SETTING_VALUE_INT32(50),
                          ZMK_CUSTOM_SETTING_CONFIDENTIALITY_RPC_PUBLIC,
                          ZMK_CUSTOM_SETTING_PERMISSION_UNSECURE,
                          ZMK_CUSTOM_SETTING_PERMISSION_UNSECURE,
                          ZMK_CUSTOM_SETTING_RANGE_INT32(ZMK_LED_BRIGHTNESS_MIN,
                                                         ZMK_LED_BRIGHTNESS_MAX));

bool zmk_led_brightness_device_available(void) {
    return IS_ENABLED(CONFIG_ZMK_BACKLIGHT) || IS_ENABLED(CONFIG_ZMK_RGB_UNDERGLOW);
}

static int apply_brightness(int32_t brightness) {
    if (brightness < ZMK_LED_BRIGHTNESS_MIN || brightness > ZMK_LED_BRIGHTNESS_MAX) {
        return -EINVAL;
    }

#if IS_ENABLED(CONFIG_ZMK_BACKLIGHT)
    return zmk_backlight_set_brt((uint8_t)brightness);
#elif IS_ENABLED(CONFIG_ZMK_RGB_UNDERGLOW)
    struct zmk_led_hsb color = zmk_rgb_underglow_calc_brt(0);
    color.b = (uint8_t)brightness;
    return zmk_rgb_underglow_set_hsb(color);
#else
    ARG_UNUSED(brightness);
    return -ENODEV;
#endif
}

int zmk_led_brightness_get(int32_t *brightness) {
    if (brightness == NULL) {
        return -EINVAL;
    }

    return zmk_custom_setting_get_int32(&led_brightness_value, brightness);
}

int zmk_led_brightness_set(int32_t brightness) {
    if (brightness < ZMK_LED_BRIGHTNESS_MIN || brightness > ZMK_LED_BRIGHTNESS_MAX) {
        return -EINVAL;
    }

    int rc = zmk_custom_setting_set_int32(&led_brightness_value, brightness,
                                          ZMK_CUSTOM_SETTING_WRITE_MODE_PERSIST);
    if (rc != 0) {
        return rc;
    }

    rc = apply_brightness(brightness);
    if (rc == -ENODEV) {
        LOG_WRN("LED brightness saved but no backlight or RGB underglow is enabled");
        return 0;
    }
    return rc;
}

static int apply_saved_brightness(void) {
    int32_t brightness;
    int rc = zmk_led_brightness_get(&brightness);
    if (rc != 0) {
        return rc;
    }

    rc = apply_brightness(brightness);
    if (rc == -ENODEV) {
        return ZMK_EV_EVENT_BUBBLE;
    }
    return rc == 0 ? ZMK_EV_EVENT_BUBBLE : rc;
}

static int led_brightness_listener(const zmk_event_t *eh) {
    if (as_zmk_custom_settings_initialized(eh) != NULL) {
        return apply_saved_brightness();
    }

    const struct zmk_custom_setting_changed *changed = as_zmk_custom_setting_changed(eh);
    if (changed != NULL && changed->setting == &led_brightness_value) {
        return apply_saved_brightness();
    }

    return ZMK_EV_EVENT_BUBBLE;
}

ZMK_LISTENER(led_brightness, led_brightness_listener);
ZMK_SUBSCRIPTION(led_brightness, zmk_custom_settings_initialized);
ZMK_SUBSCRIPTION(led_brightness, zmk_custom_setting_changed);
