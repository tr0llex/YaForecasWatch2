#include "theme.h"
#include "config.h"

bool theme_is_light(void) {
    return g_config && g_config->face_theme == FACE_THEME_LIGHT;
}

GColor theme_bg(void) {
    return theme_is_light() ? GColorWhite : GColorBlack;
}

GColor theme_fg(void) {
    return theme_is_light() ? GColorBlack : GColorWhite;
}

GColor theme_pick(GColor dark, GColor light) {
    return theme_is_light() ? light : dark;
}

#ifdef PBL_COLOR
// Integer luminance x1000 per 2-bit channel level, to avoid soft-float.
static int prv_channel_lin(uint8_t level) {
    switch (level) {
        case 0: return 0;
        case 1: return 100;
        case 2: return 402;
        default: return 1000;
    }
}

static int prv_luminance(GColor c) {
    return (213 * prv_channel_lin(c.r) +
            715 * prv_channel_lin(c.g) +
            72 * prv_channel_lin(c.b)) / 1000;
}

// WCAG contrast ratio x100.
static int prv_contrast(GColor a, GColor b) {
    const int la = prv_luminance(a) + 50;
    const int lb = prv_luminance(b) + 50;
    return la > lb ? la * 100 / lb : lb * 100 / la;
}

static GColor prv_darker(GColor c) {
    GColor out = c;
    out.r = c.r > 0 ? c.r - 1 : 0;
    out.g = c.g > 0 ? c.g - 1 : 0;
    out.b = c.b > 0 ? c.b - 1 : 0;
    return out;
}
#endif

GColor theme_readable(GColor color) {
    if (!theme_is_light()) {
        return color;
    }
#ifdef PBL_COLOR
    GColor out = color;
    for (int i = 0; i < 3 && prv_contrast(out, GColorWhite) < 300; ++i) {
        out = prv_darker(out);
    }
    return out;
#else
    return gcolor_equal(color, theme_bg()) ? theme_fg() : color;
#endif
}
