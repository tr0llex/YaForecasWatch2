#include "ui_fonts.h"

static GFont s_clock_xl;
static GFont s_bold_16;
static GFont s_bold_24;
static GFont s_20;
static GFont s_bold_20;
static GFont s_axis;
static GFont s_12;
static GFont s_cal;
static GFont s_cal_bold;
static GFont s_cal_small;
static GFont s_cal_small_bold;

void ui_fonts_load(void) {
    s_clock_xl = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_CLOCK_79));
    s_bold_24 = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_UI_BOLD_24));
    s_bold_16 = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_UI_BOLD_16));
    s_20 = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_UI_20));
    s_bold_20 = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_UI_BOLD_20));
    s_axis = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_AXIS_12));
    s_12 = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_UI_12));
    s_cal = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_CAL_22));
    s_cal_bold = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_CAL_BOLD_22));
    s_cal_small = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_CAL_18));
    s_cal_small_bold = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_CAL_BOLD_18));
}

/* Выгружаем только то, что загрузилось. Геттеры ниже не зря проверяют каждый
 * шрифт на NULL: загрузка ресурса может не удаться, — а выгрузка отдавала этот
 * же NULL в SDK. */
static void prv_unload(GFont font) {
    if (font) {
        fonts_unload_custom_font(font);
    }
}

void ui_fonts_unload(void) {
    prv_unload(s_clock_xl);
    prv_unload(s_bold_24);
    prv_unload(s_bold_16);
    prv_unload(s_20);
    prv_unload(s_bold_20);
    prv_unload(s_axis);
    prv_unload(s_12);
    prv_unload(s_cal);
    prv_unload(s_cal_bold);
    prv_unload(s_cal_small);
    prv_unload(s_cal_small_bold);
    s_clock_xl = s_bold_24 = s_bold_16 = s_20 = s_bold_20 = s_axis = s_12 = NULL;
    s_cal = s_cal_bold = s_cal_small = s_cal_small_bold = NULL;
}

/* Each getter falls back to a system font so a failed resource load degrades
 * to readable Latin text instead of an empty screen. */
GFont ui_font_bold_16(void) {
    return s_bold_16 ? s_bold_16 : fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD);
}

GFont ui_font_bold_24(void) {
    return s_bold_24 ? s_bold_24 : fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD);
}

GFont ui_font_bold_20(void) {
    return s_bold_20 ? s_bold_20 : ui_font_bold_16();
}

GFont ui_font_20(void) {
    return s_20 ? s_20 : fonts_get_system_font(FONT_KEY_GOTHIC_18);
}

GFont ui_font_12(void) {
    return s_12 ? s_12 : fonts_get_system_font(FONT_KEY_GOTHIC_14);
}

GFont ui_font_axis(void) {
    return s_axis ? s_axis : fonts_get_system_font(FONT_KEY_GOTHIC_14);
}

GFont ui_font_cal(void) {
    return s_cal ? s_cal : fonts_get_system_font(FONT_KEY_GOTHIC_24);
}

GFont ui_font_cal_bold(void) {
    return s_cal_bold ? s_cal_bold : fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD);
}

/* A 22px face needs roughly 25px of row to avoid clipping; below that the
 * calendar drops to the 18px cut. */
#define CAL_ROW_H_FOR_22 25
/* 79px — потолок этого начертания. Предел SDK: битовая карта глифа не больше
 * 256 байт. На 80px сборка падает («Glyph too large! codepoint 52: 257 > 256»,
 * codepoint 52 — цифра «4»), на 79px самый тяжёлый глиф занимает 250 байт.
 * Цифры при этом 58 px, полоса часов 64 px — влезает с полями по три пикселя.
 * Проверяется `python3 tools/font-audit.py`. */
#define CLOCK_BAND_H_FOR_79 64

GFont ui_font_cal_for_height(int row_h, bool bold) {
    if (row_h >= CAL_ROW_H_FOR_22) {
        return bold ? ui_font_cal_bold() : ui_font_cal();
    }
    if (bold) {
        return s_cal_small_bold ? s_cal_small_bold : ui_font_cal_bold();
    }
    return s_cal_small ? s_cal_small : ui_font_cal();
}

GFont ui_font_clock_for_height(int band_h) {
    /* Раньше здесь выбиралось одно из трёх начертаний по высоте полосы. Полоса
     * на emery фиксированная, 64 px, поэтому две ветки из трёх не выполнялись
     * никогда, а два шрифта (76 и 58 px) ехали в ресурсах и в кучу впустую.
     * Осталось одно начертание; если полоса вдруг станет ниже или ресурс не
     * загрузится, отдаём системный шрифт — текст останется читаемым. */
    if (band_h >= CLOCK_BAND_H_FOR_79 && s_clock_xl) {
        return s_clock_xl;
    }
    return fonts_get_system_font(FONT_KEY_LECO_42_NUMBERS);
}
