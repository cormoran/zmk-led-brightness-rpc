#include <stdio.h>

#include <pb_decode.h>
#include <pb_encode.h>
#include <zephyr/sys/util.h>
#include <zmk/studio/custom.h>
#include <cormoran/led-brightness/led_brightness.h>
#include <cormoran/led-brightness/led_brightness.pb.h>

#include <zephyr/logging/log.h>
LOG_MODULE_DECLARE(zmk, CONFIG_ZMK_LOG_LEVEL);

static struct zmk_rpc_custom_subsystem_meta led_brightness_subsystem_meta = {
    ZMK_RPC_CUSTOM_SUBSYSTEM_UI_URLS("https://cormoran.github.io/zmk-led-brightness-rpc/"),
    // Unsecured is suggested by default to avoid unlocking in un-reliable
    // environments.
    // The web template already implements the unlock prompt/retry flow (see
    // web/src/App.tsx), so switching this to ZMK_STUDIO_RPC_HANDLER_SECURED
    // requires no web changes.
    .security = ZMK_STUDIO_RPC_HANDLER_UNSECURED,
};

ZMK_RPC_CUSTOM_SUBSYSTEM(cormoran__led_brightness, &led_brightness_subsystem_meta,
                         led_brightness_rpc_handle_request);

ZMK_RPC_CUSTOM_SUBSYSTEM_RESPONSE_BUFFER(cormoran__led_brightness,
                                         cormoran_led_brightness_Response);
BUILD_ASSERT(CONFIG_ZMK_STUDIO_RPC_TX_BUF_SIZE >= 64,
             "LED brightness Studio RPC needs a 64-byte TX buffer");

static int handle_get_brightness_request(cormoran_led_brightness_Response *resp);
static int handle_set_brightness_request(const cormoran_led_brightness_SetBrightnessRequest *req,
                                         cormoran_led_brightness_Response *resp);

static bool led_brightness_rpc_handle_request(const zmk_custom_CallRequest *raw_request,
                                              pb_callback_t *encode_response) {
    cormoran_led_brightness_Response *resp = ZMK_RPC_CUSTOM_SUBSYSTEM_RESPONSE_BUFFER_ALLOCATE(
        cormoran__led_brightness, encode_response);

    cormoran_led_brightness_Request req = cormoran_led_brightness_Request_init_zero;

    pb_istream_t req_stream =
        pb_istream_from_buffer(raw_request->payload.bytes, raw_request->payload.size);
    if (!pb_decode(&req_stream, cormoran_led_brightness_Request_fields, &req)) {
        LOG_WRN("Failed to decode led_brightness request: %s", PB_GET_ERROR(&req_stream));
        cormoran_led_brightness_ErrorResponse err = cormoran_led_brightness_ErrorResponse_init_zero;
        snprintf(err.message, sizeof(err.message), "Failed to decode request");
        resp->which_response_type = cormoran_led_brightness_Response_error_tag;
        resp->response_type.error = err;
        return true;
    }

    int rc = 0;
    switch (req.which_request_type) {
    case cormoran_led_brightness_Request_get_brightness_tag:
        rc = handle_get_brightness_request(resp);
        break;
    case cormoran_led_brightness_Request_set_brightness_tag:
        rc = handle_set_brightness_request(&req.request_type.set_brightness, resp);
        break;
    default:
        LOG_WRN("Unsupported led_brightness request type: %d", req.which_request_type);
        rc = -1;
    }

    if (rc != 0) {
        cormoran_led_brightness_ErrorResponse err = cormoran_led_brightness_ErrorResponse_init_zero;
        snprintf(err.message, sizeof(err.message), "Failed to process request");
        resp->which_response_type = cormoran_led_brightness_Response_error_tag;
        resp->response_type.error = err;
    }
    return true;
}

static int populate_brightness_response(cormoran_led_brightness_Response *resp) {
    int32_t brightness;
    int rc = zmk_led_brightness_get(&brightness);
    if (rc != 0) {
        return rc;
    }

    resp->which_response_type = cormoran_led_brightness_Response_brightness_tag;
    resp->response_type.brightness.value = brightness;
    resp->response_type.brightness.device_available = zmk_led_brightness_device_available();
    return 0;
}

static int handle_get_brightness_request(cormoran_led_brightness_Response *resp) {
    return populate_brightness_response(resp);
}

static int handle_set_brightness_request(const cormoran_led_brightness_SetBrightnessRequest *req,
                                         cormoran_led_brightness_Response *resp) {
    int rc = zmk_led_brightness_set(req->value);
    if (rc != 0) {
        LOG_WRN("Failed to set LED brightness: %d", rc);
        return rc;
    }

    return populate_brightness_response(resp);
}
