#include "i18n.h"

static const char *const MONTHS_FULL[12] = {
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
};

static const char *const MONTHS_SHORT[12] = {
    "янв", "фев", "мар", "апр", "май", "июн",
    "июл", "авг", "сен", "окт", "ноя", "дек"
};

static const char *const WEEKDAYS_SHORT[7] = {
    "вс", "пн", "вт", "ср", "чт", "пт", "сб"
};

/* Russian dates read "18 июня", not "18 июнь", so the date line needs the
 * genitive forms alongside the nominative ones used by the month header. */
static const char *const MONTHS_GENITIVE[12] = {
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"
};

const char *i18n_month_genitive(int tm_mon) {
    if (tm_mon < 0 || tm_mon > 11) return "";
    return MONTHS_GENITIVE[tm_mon];
}

const char *i18n_month_full(int tm_mon) {
    if (tm_mon < 0 || tm_mon > 11) return "";
    return MONTHS_FULL[tm_mon];
}

const char *i18n_month_short(int tm_mon) {
    if (tm_mon < 0 || tm_mon > 11) return "";
    return MONTHS_SHORT[tm_mon];
}

const char *i18n_weekday_short(int tm_wday) {
    if (tm_wday < 0 || tm_wday > 6) return "";
    return WEEKDAYS_SHORT[tm_wday];
}
