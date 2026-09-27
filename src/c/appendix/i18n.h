#pragma once

#include <pebble.h>

typedef enum {
    LANG_EN = 0,
    LANG_RU = 1,
    LANG_COUNT
} Lang;

// LOCALE_AUTO follows the watch's system language.
Lang i18n_lang(void);

bool i18n_system_is_ru(void);

const char *i18n_month_short(int tm_mon);

const char *i18n_no_data(void);
