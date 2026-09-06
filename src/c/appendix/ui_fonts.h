#pragma once

#include <pebble.h>

/* Custom font resources.
 *
 * The built-in Pebble system fonts carry no Cyrillic glyphs, so every piece of
 * UI text that can contain Russian is drawn with these Roboto subsets instead.
 * Custom fonts are owned by the app, so they are loaded once at startup and
 * released on teardown.
 */

/** Load every custom font. Call once, before any layer is created. */
void ui_fonts_load(void);

/** Release every custom font. Call once, after all layers are destroyed. */
void ui_fonts_unload(void);

/** Bold 24px Roboto with Cyrillic. */
GFont ui_font_bold_24(void);

/** Bold 16px Roboto with Cyrillic — month header, compact labels. */
GFont ui_font_bold_16(void);

/** Bold 20px Roboto with Cyrillic — current temperature. */
GFont ui_font_bold_20(void);

/** Regular 20px Roboto with Cyrillic — secondary text. */
GFont ui_font_20(void);

/** 12px Roboto, digits only — numbers along the graph axes. */
GFont ui_font_axis(void);

/** Regular 12px Roboto with Cyrillic — the weather row. */
GFont ui_font_12(void);

/** Regular 22px Roboto, digits only — calendar cells. */
GFont ui_font_cal(void);

/** Bold 22px Roboto, digits only — highlighted calendar cells. */
GFont ui_font_cal_bold(void);

/**
 * Calendar face that fits the given row height.
 *
 * @param row_h Height of one calendar row in pixels.
 * @param bold Whether the cell is highlighted.
 */
GFont ui_font_cal_for_height(int row_h, bool bold);

/**
 * Clock face that fits the given band height.
 *
 * @param band_h Height of the clock band in pixels.
 */
GFont ui_font_clock_for_height(int band_h);
