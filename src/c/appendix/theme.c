#include "theme.h"
#include "config.h"

#ifndef PBL_PLATFORM_APLITE

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

// Hue in degrees (0..359), or -1 for greys, from 2-bit channels.
static int prv_hue(GColor c) {
    const int r = c.r, g = c.g, b = c.b;
    const int max = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const int min = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const int d = max - min;
    int h;

    if (d == 0) {
        return -1;
    }
    if (max == r) {
        h = 60 * (g - b) / d;
    }
    else if (max == g) {
        h = 120 + 60 * (b - r) / d;
    }
    else {
        h = 240 + 60 * (r - g) / d;
    }
    return h < 0 ? h + 360 : h;
}

static int prv_hue_distance(int a, int b) {
    if (a < 0 || b < 0) {
        return (a < 0 && b < 0) ? 0 : 180;
    }
    const int d = a > b ? a - b : b - a;
    return d > 180 ? 360 - d : d;
}
#endif

GColor theme_readable(GColor color) {
    if (!theme_is_light()) {
        return color;
    }
#ifdef PBL_COLOR
    if (prv_contrast(color, GColorWhite) >= 300) {
        return color;
    }
    const int hue = prv_hue(color);
    const int luminance = prv_luminance(color);
    GColor best = GColorBlack;
    int best_hue = 181;
    int best_lum = -1;
    for (int i = 0; i < 64; ++i) {
        const GColor c = (GColor){ .argb = (uint8_t)(0xC0 | i) };
        if (prv_contrast(c, GColorWhite) < 300) {
            continue;
        }
        const int dh = prv_hue_distance(hue, prv_hue(c));
        const int lum = prv_luminance(c);
        if (dh < best_hue || (dh == best_hue && lum > best_lum && lum <= luminance)) {
            best = c;
            best_hue = dh;
            best_lum = lum;
        }
    }
    return best;
#else
    return gcolor_equal(color, theme_bg()) ? theme_fg() : color;
#endif
}
#endif
