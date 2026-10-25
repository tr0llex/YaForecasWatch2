#pragma once

#include <pebble.h>

/* Light/dark theme for the watchface itself (separate from the settings-page
 * theme). Every colour the face paints goes through here so a single setting
 * flips the whole design instead of hunting hardcoded GColorWhite/GColorBlack.
 */

/** Page background. */
GColor theme_bg(void);

/** Primary text and glyphs. */
GColor theme_fg(void);

/** Secondary text: labels, axis ticks, the month header. */
GColor theme_dim(void);

/** Hairlines, axes and separators. */
GColor theme_line(void);

/** True when the light theme is active. */
bool theme_is_light(void);

/** Warm accent (UV): yellow reads bright on black but vanishes on white. */
GColor theme_warm(void);

/** Precipitation fill inside night hours. */
GColor theme_night_precip(void);

/** Night hatching drawn over the precipitation fill. */
GColor theme_night_hatch_precip(void);

/**
 * Nearest readable variant of a colour against the current background.
 *
 * The face is an e-paper panel worn at arm's length, so a hue that merely
 * "exists" is not enough: it has to survive at 200x228 with no backlight.
 * Colours that come from settings are passed through here before painting,
 * which is what keeps a yellow picked on the dark theme from disappearing
 * when the user flips to the light one.
 */
GColor theme_readable(GColor color);
