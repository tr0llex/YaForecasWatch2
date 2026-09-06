#include "config.h"
#include "ui_fonts.h"
#include "persist.h"
#include "math.h"
#include "memory_log.h"
#include "c/services/watch_services.h"

Config *g_config;

// Backing storage for g_config. A static struct instead of malloc: the config
// always exists exactly once, so there is nothing to gain from heap allocation
// and no out-of-memory path to worry about.
static Config s_config;

// Returns defaults as a function (not a static const) because GColor values like
// GColorBlack expand to "compound literals" — C's syntax for inline struct values.
// The C standard doesn't allow these in static variable initializers, so we use a
// function instead. See: https://gcc.gnu.org/onlinedocs/gcc/Compound-Literals.html
static Config config_defaults(void) {
    /* Значения до первого сообщения с телефона. Раньше здесь стояли
     * американские: часы без связи показывали Фаренгейт, американские
     * праздники и неделю с воскресенья. Держим их такими же, как значения по
     * умолчанию на странице настроек (src/pkjs/index.js). */
    return (Config) {
        .celsius = true,
        .time_lead_zero = false,
        .axis_12h = false,
        .start_mon = true,
        .prev_week = true,
        .show_qt = true,
        .show_bt = true,
        .show_bt_disconnect = true,
        .vibe = false,
        .show_am_pm = false,
        .show_feels_like = false,
        .time_font = TIME_FONT_ROBOTO,
        .color_today = GColorBlack,
        .color_saturday = GColorFolly,
        .color_sunday = GColorFolly,
        .color_us_federal = GColorFolly,
        .color_time = GColorWhite,
        .color_feels_like = GColorYellow,
        .day_night_shading = true,
        .holiday_set_1 = HOLIDAY_SET_RU,
        .holiday_set_2 = HOLIDAY_SET_NONE,
        .color_holiday_1 = GColorFolly,
        .color_holiday_2 = GColorVividCerulean,
        .calendar_weeks = 2,
        .face_theme = FACE_THEME_DARK
    };
}

static void config_read_or_default(Config *config) {
    *config = config_defaults();
    persist_get_config(config);
}

void config_load() {
    g_config = &s_config;
    config_read_or_default(g_config);
    MEMORY_LOG_HEAP("after_config_load");
}

void config_refresh() {
    g_config = &s_config;
    config_read_or_default(g_config);  // Reload from persistent storage
    MEMORY_LOG_HEAP("after_config_refresh");
}

void config_unload() {
    g_config = NULL;
}

int config_localize_temp(int temp_f) {
    // Convert temperatures as desired
    int result;
    if (g_config->celsius)
        result = f_to_c(temp_f);
    else
        result = temp_f;
    return result;
}

int config_format_time(char *s, size_t maxsize, const struct tm * tm_p) {
    int res = strftime(s, maxsize, watch_services_clock_is_24h_style() ? "%H:%M" : "%I:%M", tm_p);
    if (!g_config->time_lead_zero) {
        // Remove leading zero if configured as such
        if (s[0] == '0') 
            memmove(s, s+1, strlen(s));
    }
    return res;
}

int config_axis_hour(int hour) {
    if (g_config->axis_12h) {
        hour = hour % 12;
        hour = hour == 0 ? 12 : hour;
    }
    else 
        hour = hour % 24;
    return hour;
}

int config_n_today() {
    // Returns the index of the calendar box that holds today's date

    struct tm tm_today = watch_services_localtime();
    int wday = tm_today.tm_wday;
    // Offset if user wants to start the week on monday
    wday = g_config->start_mon ? (wday + 6) % 7 : wday;
    // Offset if user wants to show the previous week first
    if (g_config->prev_week)
        wday += 7;
    return wday;
}

int config_calendar_weeks() {
    const int weeks = g_config->calendar_weeks;
    /* Zero means "written by a build that predates this option". */
    if (weeks != 2 && weeks != 3) return 2;
    return weeks;
}

GFont config_time_font() {
#ifdef PBL_PLATFORM_EMERY
    /* Roboto — собственный ресурс, его размер подбирается под высоту полосы;
     * Leco и Bitham берём системные. Раньше здесь всегда возвращался Roboto,
     * и настройка «Шрифт часов» на emery просто ничего не делала. */
    if (g_config->time_font == TIME_FONT_LECO) {
        return fonts_get_system_font(FONT_KEY_LECO_60_NUMBERS_AM_PM);
    }
    if (g_config->time_font == TIME_FONT_BITHAM) {
        return fonts_get_system_font(FONT_KEY_BITHAM_42_MEDIUM_NUMBERS);
    }
    /* Сюда на emery не приходят: time_layer сам берёт начертание по высоте
     * полосы (ui_font_clock_for_height) и зовёт config_time_font() только
     * для Leco и Bitham. Оставлен системный шрифт как безопасный ответ. */
    return fonts_get_system_font(FONT_KEY_ROBOTO_BOLD_SUBSET_49);
#else
    const char *font_keys[] = {
        [TIME_FONT_ROBOTO] = FONT_KEY_ROBOTO_BOLD_SUBSET_49,
#ifdef PBL_PLATFORM_EMERY
        // emery: use larger LECO font size
        [TIME_FONT_LECO] = FONT_KEY_LECO_60_NUMBERS_AM_PM,
#else
        [TIME_FONT_LECO] = FONT_KEY_LECO_42_NUMBERS,
#endif
        [TIME_FONT_BITHAM] = FONT_KEY_BITHAM_42_MEDIUM_NUMBERS
    };
    int16_t font_index = g_config->time_font;
    const int16_t font_count = (int16_t)(sizeof(font_keys) / sizeof(font_keys[0]));
    if (font_index < 0 || font_index >= font_count)
        font_index = TIME_FONT_ROBOTO;
    return fonts_get_system_font(font_keys[font_index]);
#endif
}

bool config_highlight_holidays() {
    return g_config->holiday_set_1 != HOLIDAY_SET_NONE || g_config->holiday_set_2 != HOLIDAY_SET_NONE;
}

bool config_highlight_sundays() {
    return !gcolor_equal(g_config->color_sunday, GColorWhite);
}

bool config_highlight_saturdays() {
    return !gcolor_equal(g_config->color_saturday, GColorWhite);
}
