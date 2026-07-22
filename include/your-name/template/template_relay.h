/*
 * SPDX-License-Identifier: MIT
 *
 * Split-relay sample feature (template sample code).
 *
 * Demonstrates the ZMK split event-relay: when the sample custom Studio RPC
 * arrives on the split *central*, the received value is forwarded to the
 * split *peripheral(s)* so peripheral-side code can react to it. The peripheral
 * decodes the struct and logs one line (see src/split/template_relay.c).
 *
 * The relay carries a plain, packed C struct -- NOT protobuf. ZMK's relay
 * (`ZMK_RELAY_EVENT_*`, <zmk/event_manager.h>) memcpy()s the whole event
 * struct into the relay payload byte-for-byte, so both split halves must be
 * built from the same struct definition (same layout). Both halves also run
 * the same CPU architecture (nRF52 / bsim x86, both little-endian), so no
 * byte-swapping is needed; if you ever relay between different-endian halves,
 * serialize fields explicitly instead of memcpy'ing a struct.
 */

#pragma once

#include <zephyr/kernel.h>
#include <zmk/event_manager.h>

/* Bump when the wire layout of struct template_relay_sample changes. */
#define TEMPLATE_RELAY_SAMPLE_VERSION 1

/*
 * The relay carrier. `source` is required by the relay macros' loop guard
 * (ZMK_RELAY_EVENT_SOURCE_SELF on send; stamped to the sender index + 1 on
 * receive). The struct must fit CONFIG_ZMK_SPLIT_RELAY_EVENT_DATA_LEN (ZMK's
 * default 128 is plenty for these few bytes) and the identifier string below
 * must fit CONFIG_ZMK_SPLIT_RELAY_EVENT_TYPE_NAME_LEN (default 4); the relay
 * macros BUILD_ASSERT both.
 */
struct template_relay_sample {
    uint8_t source;
    uint8_t version;
    int32_t value;
} __packed;

ZMK_EVENT_DECLARE(template_relay_sample);

/*
 * Central-side entry point, called from the Studio RPC handler when a
 * SampleRequest is received. Raises the relay carrier so the direction macro
 * ships it to the peripheral(s). Only compiled (like this whole sample) when
 * ZMK's CONFIG_ZMK_SPLIT_RELAY_EVENT is enabled -- the sample has no Kconfig
 * of its own.
 */
void template_relay_send_sample(int32_t value);
