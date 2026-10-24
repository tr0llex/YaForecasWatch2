#pragma once

#include <pebble.h>

/* Russian UI strings for the watchface.
 *
 * The Pebble C SDK has no locale data we can rely on for Cyrillic month or
 * weekday names, so they are provided here as UTF-8 literals. Rendering them
 * requires a font with Cyrillic coverage — see resources/fonts.
 */

/**
 * Full month name in the nominative case, e.g. "Август".
 * @param tm_mon 0-based month index as found in struct tm.
 */
const char *i18n_month_full(int tm_mon);

/**
 * Three-letter month abbreviation, e.g. "авг".
 * @param tm_mon 0-based month index as found in struct tm.
 */
const char *i18n_month_short(int tm_mon);

/**
 * Two-letter weekday abbreviation, e.g. "пн".
 * @param tm_wday 0-based weekday index (0 = Sunday) as found in struct tm.
 */
const char *i18n_weekday_short(int tm_wday);

/**
 * Month name in the genitive case, e.g. "июня" — for "18 июня".
 * @param tm_mon 0-based month index as found in struct tm.
 */
const char *i18n_month_genitive(int tm_mon);
