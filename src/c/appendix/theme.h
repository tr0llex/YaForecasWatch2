#pragma once

#include <pebble.h>

bool theme_is_light(void);

GColor theme_bg(void);

GColor theme_fg(void);

GColor theme_pick(GColor dark, GColor light);

// Unchanged on the dark theme; darkened to 3:1 contrast on the light one.
GColor theme_readable(GColor color);
