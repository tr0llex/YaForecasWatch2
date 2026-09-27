#pragma once

#include <pebble.h>

// System fonts cover Latin only; other text uses bundled Roboto subsets.

typedef enum {
    UI_TEXT_SMALL,   // stands in for Gothic 14
    UI_TEXT_MEDIUM,  // Gothic 18
    UI_TEXT_LARGE,   // Gothic 24, emery only
    UI_TEXT_COUNT
} UiTextSize;

bool ui_text_is_ascii(const char *text);

// system_font for ASCII text, else the bundled font; measure and draw with it.
GFont ui_font_for_text(const char *text, GFont system_font, UiTextSize size);

// Added to y positions tuned for the system font when drawing with Roboto.
int ui_font_text_offset_y(UiTextSize size);

void ui_fonts_unload(void);
