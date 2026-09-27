#pragma once

#include <pebble.h>

// System fonts lack Cyrillic; such text uses a bundled Roboto subset.

typedef enum {
    UI_TEXT_SMALL,   // stands in for Gothic 14
    UI_TEXT_MEDIUM,  // Gothic 18
    UI_TEXT_LARGE,   // Gothic 24, emery only
    UI_TEXT_COUNT
} UiTextSize;

#ifdef PBL_PLATFORM_APLITE
// aplite: English only (see i18n.h), so text always uses the system font.
#define ui_text_needs_bundled_font(text) false
#define ui_font_for_text(text, system_font, size) (system_font)
#define ui_font_text_offset_y(size) 0
#define ui_fonts_unload()
#else
// True for text with Cyrillic that the bundled subset fully covers.
bool ui_text_needs_bundled_font(const char *text);

// The bundled font when the text needs it, else system_font; measure and draw with it.
GFont ui_font_for_text(const char *text, GFont system_font, UiTextSize size);

// Added to y positions tuned for the system font when drawing with Roboto.
int ui_font_text_offset_y(UiTextSize size);

void ui_fonts_unload(void);
#endif
