#pragma once

#include <pebble.h>

#ifdef PBL_PLATFORM_APLITE
// aplite: English only and the i18n layer is compiled out, to keep its heap.
#define I18N_IS_FIXED 1
#define i18n_system_is_ru() false
#define i18n_format_month_year(buffer, size, tm) strftime(buffer, size, "%b %Y", tm)
#define i18n_no_data() "No data :("
#else
#define I18N_IS_FIXED 0

typedef enum {
    LANG_EN = 0,
    LANG_RU = 1,
    LANG_COUNT
} Lang;

// LOCALE_AUTO follows the watch's system language.
Lang i18n_lang(void);

bool i18n_system_is_ru(void);

// Month header text, e.g. "Jun 2026" or "Июн 2026".
void i18n_format_month_year(char *buffer, size_t size, const struct tm *tm);

const char *i18n_no_data(void);
#endif
