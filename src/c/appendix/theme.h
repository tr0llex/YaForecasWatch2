#pragma once

#include <pebble.h>

#ifdef PBL_PLATFORM_APLITE
// aplite: dark only, to keep its heap headroom; these compile to constants.
#define theme_is_light() false
#define theme_bg() GColorBlack
#define theme_fg() GColorWhite
#define theme_pick(dark, light) (dark)
#define theme_readable(color) (color)
// Colours never change at runtime, so refresh paths skip re-applying them.
#define THEME_IS_FIXED 1
#else
#define THEME_IS_FIXED 0
bool theme_is_light(void);

GColor theme_bg(void);

GColor theme_fg(void);

GColor theme_pick(GColor dark, GColor light);

// Unchanged on the dark theme. On the light theme, the palette colour with at
// least 3:1 contrast against white that is closest in hue, then brightness.
GColor theme_readable(GColor color);
#endif
