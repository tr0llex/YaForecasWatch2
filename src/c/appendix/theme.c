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

GColor theme_dim(void) {
#ifdef PBL_COLOR
    /* Mid grey reads as secondary against either background. */
    return theme_is_light() ? GColorDarkGray : GColorLightGray;
#else
    return theme_fg();
#endif
}

GColor theme_line(void) {
#ifdef PBL_COLOR
    return theme_is_light() ? GColorLightGray : GColorDarkGray;
#else
    return theme_fg();
#endif
}

GColor theme_night_precip(void) {
#ifdef PBL_COLOR
    /* Тёмно-синяя ночная заливка на чёрном фоне давала контраст 2.15 и
     * пропадала; на тёмной теме ночь размечена только штриховкой. */
    return theme_is_light() ? GColorDukeBlue : GColorCobaltBlue;
#else
    return GColorLightGray;
#endif
}

GColor theme_night_hatch_precip(void) {
#ifdef PBL_COLOR
    return theme_is_light() ? GColorBlue : GColorVividCerulean;
#else
    return theme_fg();
#endif
}

GColor theme_warm(void) {
#ifdef PBL_COLOR
    /* Yellow on white measures a contrast of 1.2 on the e-paper simulation --
     * effectively invisible. Windsor tan keeps the "warm" reading at 5.2. */
    return theme_is_light() ? GColorWindsorTan : GColorYellow;
#else
    return theme_fg();
#endif
}

#ifdef PBL_COLOR
/* Relative luminance x1000, sRGB weights, integer only: the soft-float library
 * costs more binary than this table. Channels are 0/85/170/255. */
static int prv_channel_lin(uint8_t v) {
    switch (v) {
        case 0:   return 0;
        case 85:  return 100;   /* (85/255)^2.2 ~ 0.100 */
        case 170: return 402;
        default:  return 1000;
    }
}

static int prv_luminance(GColor c) {
    return (213 * prv_channel_lin(c.r * 85) +
            715 * prv_channel_lin(c.g * 85) +
             72 * prv_channel_lin(c.b * 85)) / 1000;
}

/** Contrast ratio x100, as in WCAG: (L1 + 0.05) / (L2 + 0.05). */
static int prv_contrast(GColor a, GColor b) {
    const int la = prv_luminance(a) + 50;
    const int lb = prv_luminance(b) + 50;
    return la > lb ? la * 100 / lb : lb * 100 / la;
}

/** One step darker (or lighter) inside the 4-level channel grid. */
static GColor prv_step(GColor c, bool darker) {
    GColor out = c;
    if (darker) {
        out.r = c.r > 0 ? c.r - 1 : 0;
        out.g = c.g > 0 ? c.g - 1 : 0;
        out.b = c.b > 0 ? c.b - 1 : 0;
    }
    else {
        out.r = c.r < 3 ? c.r + 1 : 3;
        out.g = c.g < 3 ? c.g + 1 : 3;
        out.b = c.b < 3 ? c.b + 1 : 3;
    }
    return out;
}
#endif

GColor theme_readable(GColor color) {
#ifdef PBL_COLOR
    const GColor bg = theme_bg();
    const bool darker = theme_is_light();
    GColor out = color;

    /* 300 = 3.0:1. Below that a 2px dot is guesswork on the panel. */
    for (int i = 0; i < 3 && prv_contrast(out, bg) < 300; ++i) {
        const GColor next = prv_step(out, darker);
        if (gcolor_equal(next, out)) {
            break;
        }
        out = next;
    }
    return out;
#else
    (void) color;
    return theme_fg();
#endif
}
