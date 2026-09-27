#include "i18n.h"

#ifndef PBL_PLATFORM_APLITE
#include "config.h"
#include <string.h>

static const char *const MONTHS_SHORT[LANG_COUNT][12] = {
    [LANG_EN] = {
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    },
    [LANG_RU] = {
        "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
        "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"
    },
};

static const char *const NO_DATA[LANG_COUNT] = {
    [LANG_EN] = "No data :(",
    [LANG_RU] = "Нет данных :(",
};

bool i18n_system_is_ru(void) {
    const char *locale = i18n_get_system_locale();
    return locale && strncmp(locale, "ru", 2) == 0;
}

Lang i18n_lang(void) {
    const int locale = g_config ? g_config->locale : LOCALE_EN;

    if (locale == LOCALE_EN) {
        return LANG_EN;
    }
    if (locale == LOCALE_RU) {
        return LANG_RU;
    }
    return i18n_system_is_ru() ? LANG_RU : LANG_EN;
}

void i18n_format_month_year(char *buffer, size_t size, const struct tm *tm) {
    if (i18n_lang() == LANG_EN) {
        strftime(buffer, size, "%b %Y", tm);
        return;
    }
    snprintf(buffer, size, "%s %d", MONTHS_SHORT[i18n_lang()][tm->tm_mon], tm->tm_year + 1900);
}

const char *i18n_no_data(void) {
    return NO_DATA[i18n_lang()];
}
#endif
