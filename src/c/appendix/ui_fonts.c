#include "ui_fonts.h"

#ifndef PBL_PLATFORM_APLITE

static GFont s_fonts[UI_TEXT_COUNT];

// Aligns Roboto's baseline with the system font it replaces.
static const int8_t TEXT_OFFSET_Y[UI_TEXT_COUNT] = {
    [UI_TEXT_SMALL] = 1,
    [UI_TEXT_MEDIUM] = 3,
    [UI_TEXT_LARGE] = 3,
};

// Non-ASCII characters in the bundled subset, besides Cyrillic А-я, Ё and ё.
static const uint16_t SUBSET_SYMBOLS[] = { 0x00AB, 0x00B0, 0x00BB, 0x2013, 0x2014, 0x2022 };

static bool prv_in_subset(uint32_t cp) {
    if ((cp >= 0x0410 && cp <= 0x044F) || cp == 0x0401 || cp == 0x0451) {
        return true;
    }
    for (unsigned i = 0; i < ARRAY_LENGTH(SUBSET_SYMBOLS); ++i) {
        if (cp == SUBSET_SYMBOLS[i]) {
            return true;
        }
    }
    return false;
}

bool ui_text_needs_bundled_font(const char *text) {
    bool cyrillic = false;
    const unsigned char *p = (const unsigned char *)text;

    while (p && *p) {
        uint32_t cp;
        int extra;
        if (*p < 0x80) {
            p++;
            continue;
        }
        if ((*p & 0xE0) == 0xC0) {
            cp = *p & 0x1F;
            extra = 1;
        }
        else if ((*p & 0xF0) == 0xE0) {
            cp = *p & 0x0F;
            extra = 2;
        }
        else {
            return false;
        }
        p++;
        for (; extra > 0; --extra, ++p) {
            if ((*p & 0xC0) != 0x80) {
                return false;
            }
            cp = (cp << 6) | (*p & 0x3F);
        }
        // A character outside the subset (e.g. accented Latin, Ukrainian i)
        // keeps the whole string on the system font.
        if (!prv_in_subset(cp)) {
            return false;
        }
        if (cp >= 0x0401 && cp <= 0x0451) {
            cyrillic = true;
        }
    }
    return cyrillic;
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
    if (!ui_text_needs_bundled_font(text)) {
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
#endif
