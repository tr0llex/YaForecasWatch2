#include "calendar_layer.h"
#include "c/appendix/ui_fonts.h"
#include "c/appendix/theme.h"
#include "c/appendix/config.h"
#include "c/appendix/memory_log.h"
#include "c/appendix/persist.h"
#include "c/services/watch_services.h"
#include <time.h>

// emery: the row count is a user setting (two or three weeks), so the grid is
// laid out at runtime. Other platforms keep the fixed three-row grid.
#ifdef PBL_PLATFORM_EMERY
#define NUM_WEEKS (calendar_grid_weeks())
#define MAX_WEEKS 6
#else
#define NUM_WEEKS 3
#define MAX_WEEKS 3
#endif
#define DAYS_PER_WEEK 7
#define FONT_OFFSET 5
// Roboto reports its own vertical padding in the measured size, so the cell
// text is centred on the measurement alone — no hand-tuned nudge.
#define EMERY_CALENDAR_TEXT_SHIFT_Y 0
#define EMERY_CALENDAR_TEXT_SHIFT_X 1

// emery: render calendar dates with larger fonts
#ifdef PBL_PLATFORM_EMERY
#define CALENDAR_FONT_KEY FONT_KEY_GOTHIC_24
#define CALENDAR_FONT_KEY_BOLD FONT_KEY_GOTHIC_24_BOLD
#else
#define CALENDAR_FONT_KEY FONT_KEY_GOTHIC_18
#define CALENDAR_FONT_KEY_BOLD FONT_KEY_GOTHIC_18_BOLD
#endif

static Layer *s_calendar_layer;
#ifdef PBL_PLATFORM_EMERY
/** Row count for the grid, from the user setting. */
static int calendar_grid_weeks(void) {
    return config_calendar_weeks();
}
#endif

/* Переопределение сетки (calendar_layer_set_grid) осталось от отдельного
 * экрана календаря, который убрали вместе со свайпами: его никто не вызывал,
 * а поля жили во всех сборках и мешали компилятору. */

/** Index of today's cell. */
static int calendar_index_of_today(void) {
    return config_n_today();
}

typedef struct {
    bool slot_1;
    bool slot_2;
} HolidayMatch;

static GRect calendar_cell_rect(GRect bounds, int i) {
    /* Ширина клетки как w/7 теряла остаток от деления: семь колонок по 28 px
     * занимали 196 из 200, и справа оставалась мёртвая полоса. Границы считаем
     * от следующей колонки, так сетка ложится ровно во всю ширину. */
    const int col = i % DAYS_PER_WEEK;
    const int row = i / DAYS_PER_WEEK;
    const int x0 = col * bounds.size.w / DAYS_PER_WEEK;
    const int x1 = (col + 1) * bounds.size.w / DAYS_PER_WEEK;
    const int y0 = row * bounds.size.h / NUM_WEEKS;
    const int y1 = (row + 1) * bounds.size.h / NUM_WEEKS;
    return GRect(x0, y0, x1 - x0, y1 - y0);
}

#ifdef PBL_PLATFORM_EMERY
// Apply a tiny Emery-only horizontal tweak for two-digit dates that start with "1"
// to ensure they stay visually centered within calendar boxes.
static int emery_calendar_text_shift_x(const char *text) {
    /* Порядок проверок важен: на пустой строке text[1] лежит за концом. */
    if (text[0] == '1' && text[1] != '\0') {
        return EMERY_CALENDAR_TEXT_SHIFT_X;
    }

    return 0;
}
#endif

#ifdef PBL_PLATFORM_EMERY
static GRect calendar_text_rect(GRect cell_rect, const char *text, GFont font) {
    // emery: measure real glyph bounds and vertically center text in each date cell.
    const GRect measure_box = GRect(0, 0, cell_rect.size.w, cell_rect.size.h);
    const GSize text_size = graphics_text_layout_get_content_size(
        text, font, measure_box, GTextOverflowModeFill, GTextAlignmentCenter);
    /* Измеренная высота — это строчный бокс Roboto, а не сами чернила: при
     * центровке по нему цифра садилась на 3 px ниже центра плашки «сегодня».
     * Восьмая часть бокса как раз компенсирует нижний внутренний отступ. */
    const int text_top = cell_rect.origin.y + (cell_rect.size.h - text_size.h) / 2
                       - EMERY_CALENDAR_TEXT_SHIFT_Y - text_size.h / 8;
    return GRect(cell_rect.origin.x - emery_calendar_text_shift_x(text), text_top, cell_rect.size.w, text_size.h);
}
#else
static GRect calendar_text_rect(GRect cell_rect, const char *text, GFont font) {
    (void)text;
    (void)font;
    return GRect(cell_rect.origin.x,
                 cell_rect.origin.y - FONT_OFFSET,
                 cell_rect.size.w,
                 cell_rect.size.h + FONT_OFFSET);
}
#endif

/* Copy struct tm out of localtime's static buffer — see localtime(3). */
static struct tm relative_tm(int days_from_today)
{
    /* Get a time structure for n days from today (only accurate to the day)
    Use this function to avoid edge cases from daylight savings time
    */
    struct tm base_time = watch_services_localtime();
    // Set arbitrary hour so there's no daylight savings rounding error:
    base_time.tm_hour = 5;
    time_t timestamp = mktime(&base_time) + days_from_today * SECONDS_PER_DAY;
    struct tm *result = localtime(&timestamp);
    struct tm out = *result;
    return out;
}

static bool is_leap_year(int year) {
    return ((year % 4 == 0) && (year % 100 != 0)) || (year % 400 == 0);
}

static int day_of_year(struct tm *t) {
    static const uint16_t month_offsets[] = {
        0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334
    };
    int year = t->tm_year + 1900;
    int day = month_offsets[t->tm_mon] + t->tm_mday - 1;

    if (t->tm_mon > 1 && is_leap_year(year)) {
        day += 1;
    }

    return day;
}

/* Набор праздников на время одной отрисовки.
 *
 * Прежде holiday_year_has_day() читала его с флеша заново на каждую клетку и
 * каждый из двух слотов: на сетке в шесть недель это около двухсот пятидесяти
 * обращений к хранилищу за одну перерисовку календаря. Сетка охватывает от силы
 * два календарных года, и набор за год — полсотни байт, так что держать их
 * рядом дешевле любого повторного чтения.
 *
 * Кеш живёт ровно один проход отрисовки: сбрасывается в начале update_proc,
 * потому что между проходами телефон мог прислать новый набор. */
#define HOLIDAY_CACHE_SLOTS 4

typedef struct {
    uint8_t slot;
    int16_t year;
    bool valid;
    HolidayYear data;
} HolidayCacheEntry;

static HolidayCacheEntry s_holiday_cache[HOLIDAY_CACHE_SLOTS];
static int s_holiday_cache_used;

static void holiday_cache_reset(void) {
    s_holiday_cache_used = 0;
}

/** Набор за год, читая с флеша не более одного раза на пару (слот, год). */
static const HolidayYear *holiday_cache_get(uint8_t slot, int16_t year) {
    for (int i = 0; i < s_holiday_cache_used; ++i) {
        if (s_holiday_cache[i].slot == slot && s_holiday_cache[i].year == year) {
            return s_holiday_cache[i].valid ? &s_holiday_cache[i].data : NULL;
        }
    }

    if (s_holiday_cache_used >= HOLIDAY_CACHE_SLOTS) {
        /* Больше четырёх пар сетка дать не может: два слота на два года. */
        return NULL;
    }

    HolidayCacheEntry *entry = &s_holiday_cache[s_holiday_cache_used++];
    entry->slot = slot;
    entry->year = year;
    entry->valid = persist_get_holiday_year(slot, year, &entry->data);
    return entry->valid ? &entry->data : NULL;
}

static bool holiday_year_has_day(uint8_t slot, uint8_t holiday_set, struct tm *t) {
    const HolidayYear *holiday_year;
    int bit_index;

    if (holiday_set == HOLIDAY_SET_NONE) {
        return false;
    }

    holiday_year = holiday_cache_get(slot, (int16_t)(t->tm_year + 1900));
    if (!holiday_year) {
        return false;
    }

    if (holiday_year->holiday_set != holiday_set) {
        return false;
    }

    bit_index = day_of_year(t);
    if (bit_index < 0 || bit_index >= 366) {
        return false;
    }

    return (holiday_year->bits[bit_index / 8] & (1 << (bit_index % 8))) != 0;
}

static HolidayMatch holiday_match(struct tm *t) {
    HolidayMatch match = (HolidayMatch) {
        .slot_1 = holiday_year_has_day(1, g_config->holiday_set_1, t),
        .slot_2 = holiday_year_has_day(2, g_config->holiday_set_2, t)
    };

    if (g_config->holiday_set_1 == g_config->holiday_set_2) {
        match.slot_2 = false;
    }

    return match;
}

#ifdef PBL_COLOR
static GColor holiday_color(HolidayMatch match) {
    /* Как и цвета выходных: настройка переживает смену темы, поэтому оттенок
     * подтягивается до читаемого на текущем фоне. Запасной GColorWhite тоже
     * заменён — на белой теме он был невидим. */
    if (match.slot_1) {
        return theme_readable(g_config->color_holiday_1);
    }
    if (match.slot_2) {
        return theme_readable(g_config->color_holiday_2);
    }
    return theme_fg();
}

/* Split fill is still used for the "today" chip when today falls in both
 * holiday sets, so it stays available on every platform. */
static void fill_split_rect(GContext *ctx, GRect rect, GColor left_color, GColor right_color) {
    int left_w = rect.size.w / 2;

    graphics_context_set_fill_color(ctx, left_color);
    graphics_fill_rect(ctx, GRect(rect.origin.x, rect.origin.y, left_w, rect.size.h), 1, GCornersLeft);
    graphics_context_set_fill_color(ctx, right_color);
    graphics_fill_rect(ctx, GRect(rect.origin.x + left_w, rect.origin.y, rect.size.w - left_w, rect.size.h), 1, GCornersRight);
}

#ifndef PBL_PLATFORM_EMERY
/* Emery tints the digit instead of drawing a chip behind holidays, so these
 * two are only needed on the other platforms. */
static GRect holiday_highlight_rect(GRect cell_rect) {
    return GRect(cell_rect.origin.x + 2, cell_rect.origin.y + 1, cell_rect.size.w - 4, cell_rect.size.h - 2);
}

static void draw_holiday_highlight(GContext *ctx, GRect rect, HolidayMatch match) {
    if (match.slot_1 && match.slot_2) {
        fill_split_rect(ctx, rect, g_config->color_holiday_1, g_config->color_holiday_2);
        return;
    }

    graphics_context_set_fill_color(ctx, holiday_color(match));
    graphics_fill_rect(ctx, rect, 1, GCornersAll);
}
#endif
#endif  /* PBL_COLOR */

#ifdef PBL_COLOR
static GColor date_color(struct tm *t) {
    /* Цвета выходных приходят из настроек и переживают смену темы: выбранный
     * на тёмной теме светлый оттенок на белом фоне пропадал. theme_readable()
     * подтягивает его до читаемого, сохраняя сам оттенок. */
    if (t->tm_wday == 0)
        return theme_readable(g_config->color_sunday);
    if (t->tm_wday == 6)
        return theme_readable(g_config->color_saturday);
    return theme_fg();
}
#endif

static GColor today_color() {
    // Either follow the date color or override to configured value
#ifdef PBL_COLOR
    struct tm t = relative_tm(0);
    HolidayMatch match = holiday_match(&t);
    return gcolor_equal(g_config->color_today, GColorBlack) && (match.slot_1 || match.slot_2)
        ? holiday_color(match)
        : (gcolor_equal(g_config->color_today, GColorBlack) ? date_color(&t) : g_config->color_today);
#else
    return GColorWhite;
#endif
}

static void calendar_update_proc(Layer *layer, GContext *ctx) {
    holiday_cache_reset();

    GRect bounds = layer_get_bounds(layer);
    int w = bounds.size.w;
    int h = bounds.size.h;
    const int box_w = w / DAYS_PER_WEEK;
    const int box_h = h / NUM_WEEKS;

    // Calculate which box holds today's date
    const int i_today = calendar_index_of_today();

    GRect today_rect = calendar_cell_rect(bounds, i_today);
    (void) box_w;
    (void) box_h;

#ifdef PBL_PLATFORM_EMERY
    /* Плашка занимала клетку целиком, поэтому в нижней строке подходила вплотную
     * к часам, а в верхней — к цифрам соседнего ряда. Пара пикселей поля
     * превращает её обратно в плашку. */
    today_rect = grect_inset(today_rect, GEdgeInsets(2, 1));
#endif

#ifdef PBL_COLOR
    struct tm tm_today = relative_tm(0);
    HolidayMatch today_holiday = holiday_match(&tm_today);

    if (gcolor_equal(g_config->color_today, GColorBlack) && today_holiday.slot_1 && today_holiday.slot_2) {
        fill_split_rect(ctx, today_rect, g_config->color_holiday_1, g_config->color_holiday_2);
    }
    else {
        graphics_context_set_fill_color(ctx, today_color());
        graphics_fill_rect(ctx, today_rect, 1, GCornersAll);
    }
#else
    graphics_context_set_fill_color(ctx, today_color());
    graphics_fill_rect(ctx, today_rect, 1, GCornersAll);
#endif

    for (int i = 0; i < NUM_WEEKS * DAYS_PER_WEEK; ++i) {
        struct tm t = relative_tm(i - i_today);
        HolidayMatch match = holiday_match(&t);
        bool highlight_holiday = (config_highlight_holidays() && (match.slot_1 || match.slot_2));
        bool highlight_sunday = (config_highlight_sundays() && t.tm_wday == 0);
        bool highlight_saturday = (config_highlight_saturdays() && t.tm_wday == 6);
        bool bold = (i == i_today) || highlight_holiday || highlight_sunday || highlight_saturday;
#ifdef PBL_COLOR
#ifdef PBL_PLATFORM_EMERY
        // emery: only "today" wears a filled chip. Holidays tint the digit
        // itself, so the grid has one highlight idiom instead of two competing
        // blocks of colour. Overlapping sets fall back to the slot-1 colour.
        GColor text_color = (i == i_today) ? gcolor_legible_over(today_color())
                                           : (highlight_holiday ? holiday_color(match) : date_color(&t));
#else
        GColor text_color = (i == i_today) ? gcolor_legible_over(today_color())
                                           : (highlight_holiday ? gcolor_legible_over(holiday_color(match)) : date_color(&t));
#endif
#else
        GColor text_color = (i == i_today) ? GColorBlack : GColorWhite;
#endif
        char buffer[4];
        GRect cell_rect = calendar_cell_rect(bounds, i);
        GFont font = ui_font_cal_for_height(cell_rect.size.h, bold);

#ifdef PBL_COLOR
#ifndef PBL_PLATFORM_EMERY
        if (i != i_today && highlight_holiday) {
            draw_holiday_highlight(ctx, holiday_highlight_rect(cell_rect), match);
        }
#endif
#endif
        graphics_context_set_text_color(ctx, text_color);
        graphics_draw_text(ctx,
            (snprintf(buffer, sizeof(buffer), "%d", t.tm_mday), buffer),
            font,
            calendar_text_rect(cell_rect, buffer, font), GTextOverflowModeFill, GTextAlignmentCenter, NULL);
    }
}

void calendar_layer_create(Layer* parent_layer, GRect frame) {
    s_calendar_layer = layer_create(frame);
    layer_set_update_proc(s_calendar_layer, calendar_update_proc);
    calendar_layer_refresh();
    layer_add_child(parent_layer, s_calendar_layer);
    MEMORY_LOG_HEAP("after_calendar_layer_create");
}


void calendar_layer_refresh() {
    if (!s_calendar_layer) {
        return;
    }
    // Request redraw (of today's highlight)
    layer_mark_dirty(s_calendar_layer);
}

void calendar_layer_destroy() {
    MEMORY_LOG_HEAP("calendar_layer_destroy:before");
    if (s_calendar_layer) {
        layer_destroy(s_calendar_layer);
    }
    s_calendar_layer = NULL;
    MEMORY_LOG_HEAP("calendar_layer_destroy:after");
}
