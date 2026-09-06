#pragma once

#include <pebble.h>

/* Pebble Time 2 has an RGB backlight. Instead of leaving it plain white, the
 * watchface tints it to carry state you would otherwise have to look for:
 *
 *   phone disconnected  -> red
 *   battery low         -> amber
 *   otherwise           -> the user's own default colour
 *
 * The tint only applies while the watchface is foregrounded, which for a
 * watchface is all the time; the system restores the default on exit.
 * No-op on platforms without a colour backlight.
 */

/** Subscribe to battery and connection changes and apply the current tint. */
void backlight_tint_init(void);

/** Unsubscribe and restore the user's default backlight colour. */
void backlight_tint_deinit(void);

/** Re-evaluate the tint, e.g. after settings changed. */
void backlight_tint_refresh(void);
