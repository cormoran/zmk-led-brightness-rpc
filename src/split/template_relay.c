/*
 * SPDX-License-Identifier: MIT
 *
 * Split-relay sample feature (template sample code) -- see
 * include/your-name/template/template_relay.h for the overview.
 *
 * This file is compiled into BOTH split roles (central and peripheral),
 * independently of the Studio RPC subsystem (only the central runs Studio).
 * The role split below is by CONFIG_ZMK_SPLIT_ROLE_CENTRAL.
 */

#include <zephyr/kernel.h>
#include <zephyr/sys/util.h>
#include <zmk/event_manager.h>
#include <your-name/template/template_relay.h>

#include <zephyr/logging/log.h>
LOG_MODULE_DECLARE(zmk, CONFIG_ZMK_LOG_LEVEL);

/* Event implementation for the relay carrier struct. */
ZMK_EVENT_IMPL(template_relay_sample);

/*
 * Wire the relay carrier central -> peripheral. The direction macros are
 * self-role-gating (the wrong-direction one expands empty per role), and
 * HANDLE only fires when a relay frame with our identifier ("Trs") is actually
 * received -- a central never receives "Trs" (the peripheral never sends it),
 * so listing both here is safe on either role.
 */
ZMK_RELAY_EVENT_CENTRAL_TO_PERIPHERAL(template_relay_sample, Trs, source)
ZMK_RELAY_EVENT_HANDLE(template_relay_sample, Trs, source)

#if !IS_ENABLED(CONFIG_ZMK_SPLIT_ROLE_CENTRAL)

/*
 * Peripheral side: the carrier re-raised locally by ZMK_RELAY_EVENT_HANDLE
 * after the split transport delivers the relay frame. Decode the packed struct
 * and log one deterministic line including the value -- this is the line the
 * BLE test snapshot asserts. Keep this light: it runs on the split
 * relay-receive path (the system work queue).
 */
static int template_relay_on_sample(const zmk_event_t *eh) {
    const struct template_relay_sample *ev = as_template_relay_sample(eh);
    if (ev == NULL) {
        return ZMK_EV_EVENT_BUBBLE;
    }

    LOG_DBG("Peripheral received relayed sample value: %d (v%u)", ev->value, ev->version);
    return ZMK_EV_EVENT_HANDLED;
}

ZMK_LISTENER(template_relay_peripheral, template_relay_on_sample);
ZMK_SUBSCRIPTION(template_relay_peripheral, template_relay_sample);

#endif // !CONFIG_ZMK_SPLIT_ROLE_CENTRAL

/*
 * Raise the carrier with source = SELF. On a split central the
 * CENTRAL_TO_PERIPHERAL listener above ships it to the peripheral(s); the
 * carrier is a plain packed C struct (no protobuf) copied byte-for-byte into
 * the relay payload. Defined on both roles so the linker is happy regardless
 * of role, but in practice only the central (Studio RPC handler) calls it.
 */
void template_relay_send_sample(int32_t value) {
    struct template_relay_sample ev = {
        .source = ZMK_RELAY_EVENT_SOURCE_SELF,
        .version = TEMPLATE_RELAY_SAMPLE_VERSION,
        .value = value,
    };
    raise_template_relay_sample(ev);
}
