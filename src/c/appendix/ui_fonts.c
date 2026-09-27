#include "ui_fonts.h"

static GFont s_fonts[UI_TEXT_COUNT];

// Aligns Roboto's baseline with the system font it replaces.
static const int8_t TEXT_OFFSET_Y[UI_TEXT_COUNT] = {
    [UI_TEXT_SMALL] = 1,
    [UI_TEXT_MEDIUM] = 3,
    [UI_TEXT_LARGE] = 3,
};

bool ui_text_is_ascii(const char *text) {
    if (!text) {
        return true;
    }
    for (const unsigned char *p = (const unsigned char *)text; *p; ++p) {
        if (*p >= 0x80) {
            return false;
        }
    }
    return true;
}

static uint32_t prv_resource_id(UiTextSize size) {
    switch (size) {
        case UI_TEXT_SMALL:
            return RESOURCE_ID_FONT_TEXT_13;
#ifdef PBL_PLATFORM_EMERY
        // emery: the large size is only bundled for emery.
        case UI_TEXT_LARGE:
            return RESOURCE_ID_FONT_TEXT_20;
#endif
        default:
            return RESOURCE_ID_FONT_TEXT_15;
    }
}

static GFont prv_text_font(UiTextSize size) {
    if (size >= UI_TEXT_COUNT) {
        size = UI_TEXT_MEDIUM;
    }
#ifndef PBL_PLATFORM_EMERY
    if (size == UI_TEXT_LARGE) {
        size = UI_TEXT_MEDIUM;
    }
#endif
    if (!s_fonts[size]) {
        s_fonts[size] = fonts_load_custom_font(resource_get_handle(prv_resource_id(size)));
    }
    return s_fonts[size];
}

GFont ui_font_for_text(const char *text, GFont system_font, UiTextSize size) {
    if (ui_text_is_ascii(text)) {
        return system_font;
    }
    const GFont font = prv_text_font(size);
    return font ? font : system_font;
}

int ui_font_text_offset_y(UiTextSize size) {
    return size < UI_TEXT_COUNT ? TEXT_OFFSET_Y[size] : 0;
}

void ui_fonts_unload(void) {
    for (int i = 0; i < UI_TEXT_COUNT; ++i) {
        if (s_fonts[i]) {
            fonts_unload_custom_font(s_fonts[i]);
            s_fonts[i] = NULL;
        }
    }
}
