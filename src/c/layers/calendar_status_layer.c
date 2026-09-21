#include "calendar_status_layer.h"
#include "battery_layer.h"
#include "c/appendix/config.h"
#include "c/appendix/persist.h"
#include "c/appendix/i18n.h"
#include "c/appendix/theme.h"
#include "c/appendix/ui_fonts.h"
#include "c/appendix/memory_log.h"
#include "c/services/watch_services.h"

#define BATTERY_W 29
#define BATTERY_H 10
#define PADDING 4
#define MONTH_FONT_OFFSET 7
#define ICON_W 10
#ifdef PBL_PLATFORM_EMERY
/* emery: the calendar below is a 7-column grid; the status icons and the
 * battery sit on the same columns instead of floating at an arbitrary inset,
 * so the top row reads as part of the same layout. */
#define STATUS_COL_W(bounds_w) ((bounds_w) / 7)
#define ICON_SLOT_1_X(bounds_w) ((void)(bounds_w), EDGE)
#define ICON_SLOT_2_X(bounds_w) ((void)(bounds_w), EDGE * 2 + ICON_W)
/* Экран узкий, поэтому поля везде по одному пикселю. */
#define EDGE 1
#define BATTERY_X(bounds_w) ((bounds_w) - BATTERY_W - EDGE)
#else
#define ICON_SLOT_1_X(bounds_w) ((void)(bounds_w), PADDING)
#define ICON_SLOT_2_X(bounds_w) ((void)(bounds_w), PADDING * 2 + 10)
#define BATTERY_X(bounds_w) ((bounds_w) - BATTERY_W - PADDING)
#endif
#define ICON_SLOT_1 GRect(PADDING, 0, ICON_W, ICON_W)
#define ICON_SLOT_2 GRect(PADDING * 2 + ICON_W, 0, ICON_W, ICON_W)
// emery: center icons in the taller status row.
#ifdef PBL_PLATFORM_EMERY
#define STATUS_ICON_Y(bounds_h, icon_h) (((bounds_h) - (icon_h)) / 2)
#define BATTERY_Y(bounds_h) (((bounds_h) - BATTERY_H) / 2)
#define MONTH_FONT_KEY FONT_KEY_GOTHIC_24
#else
#define STATUS_ICON_Y(bounds_h, icon_h) ((void)(bounds_h), (void)(icon_h), 0)
#define BATTERY_Y(bounds_h) ((void)(bounds_h), 1)
#define MONTH_FONT_KEY FONT_KEY_GOTHIC_18
#endif

static Layer *s_calendar_status_layer;
static char s_calendar_month_text[32];
static GBitmap *s_mute_bitmap;
static GBitmap *s_bt_bitmap;
static GBitmap *s_bt_disconnect_bitmap;
static GColor s_bt_palette[2];
static GColor s_bt_disconnect_palette[2];
static GColor s_mute_palette[2];

static GRect month_text_rect(GRect bounds, GFont font) {
#ifdef PBL_PLATFORM_EMERY
    // emery: vertically center month text using measured height to match taller status bar.
    const GRect measure_box = GRect(0, 0, bounds.size.w, bounds.size.h);
    const GSize text_size = graphics_text_layout_get_content_size(
        s_calendar_month_text, font, measure_box, GTextOverflowModeFill, GTextAlignmentCenter);
    /* -5 компенсировали внутренние поля системного Gothic; у Roboto они другие,
     * и надпись вылезала на самую кромку экрана. Центрируем по измеренной
     * высоте, как это уже сделано в строке погоды. */
    /* Измеренная высота — строчный бокс Roboto, чернила в нём сидят ниже
     * середины: без поправки хвосты «р» и «я» ложились на календарь. Та же
     * восьмая часть бокса, что и в клетках календаря. */
    int text_y = (bounds.size.h - text_size.h) / 2 - text_size.h / 8;
    if (text_y < 0) {
        text_y = 0;
    }
    return GRect(0, text_y, bounds.size.w, text_size.h + 3);
#else
    (void)font;
    return GRect(0, -MONTH_FONT_OFFSET, bounds.size.w, 25);
#endif
}

static void draw_month_text(GContext *ctx, GRect bounds) {
    const GFont month_font = ui_font_bold_16();
    GRect rect = month_text_rect(bounds, month_font);

    graphics_context_set_text_color(ctx, theme_fg());
    graphics_draw_text(
        ctx,
        s_calendar_month_text,
        month_font,
        rect,
        GTextOverflowModeFill,
        GTextAlignmentCenter,
        NULL);
}

static void draw_bitmap(GContext *ctx, GBitmap *bitmap, GRect frame) {
    /* Загрузка ресурса может не удаться, а рисование NULL — это падение, а не
     * отсутствующий значок. Проверяем здесь: так покрыты все три вызова, и
     * добавить четвёртый без проверки уже нельзя. */
    if (!bitmap) {
        return;
    }
    graphics_context_set_compositing_mode(ctx, GCompOpSet);
    graphics_draw_bitmap_in_rect(ctx, bitmap, frame);
    graphics_context_set_compositing_mode(ctx, GCompOpAssign);
}

static void ensure_mute_bitmap_loaded(void) {
    if (!s_mute_bitmap) {
        s_mute_bitmap = gbitmap_create_with_resource(RESOURCE_ID_IMAGE_MUTE);
        s_mute_palette[0] = theme_fg();
        s_mute_palette[1] = GColorClear;
        gbitmap_set_palette(s_mute_bitmap, s_mute_palette, false);
    }
}

static void ensure_bt_bitmap_loaded(void) {
    if (!s_bt_bitmap) {
        s_bt_bitmap = gbitmap_create_with_resource(RESOURCE_ID_IMAGE_BT_CONNECT);
        s_bt_palette[0] = PBL_IF_COLOR_ELSE(theme_readable(GColorPictonBlue), GColorWhite);
        s_bt_palette[1] = GColorClear;
        gbitmap_set_palette(s_bt_bitmap, s_bt_palette, false);
    }
}

static void ensure_bt_disconnect_bitmap_loaded(void) {
    if (!s_bt_disconnect_bitmap) {
        s_bt_disconnect_bitmap = gbitmap_create_with_resource(RESOURCE_ID_IMAGE_BT_DISCONNECT);
        s_bt_disconnect_palette[0] = PBL_IF_COLOR_ELSE(GColorRed, GColorWhite);
        s_bt_disconnect_palette[1] = GColorClear;
        gbitmap_set_palette(s_bt_disconnect_bitmap, s_bt_disconnect_palette, false);
    }
}

/** Drop the cached icons so their palettes are rebuilt from the current theme. */
static void drop_cached_bitmaps(void) {
    if (s_mute_bitmap) {
        gbitmap_destroy(s_mute_bitmap);
        s_mute_bitmap = NULL;
    }
    if (s_bt_bitmap) {
        gbitmap_destroy(s_bt_bitmap);
        s_bt_bitmap = NULL;
    }
    if (s_bt_disconnect_bitmap) {
        gbitmap_destroy(s_bt_disconnect_bitmap);
        s_bt_disconnect_bitmap = NULL;
    }
}

static void maybe_unload_calendar_status_bitmaps(bool show_qt, bool connected) {
    bool show_bt = connected && g_config->show_bt;
    bool show_bt_disconnect = !connected && g_config->show_bt_disconnect;

    if (!show_qt && s_mute_bitmap) {
        gbitmap_destroy(s_mute_bitmap);
        s_mute_bitmap = NULL;
    }

    if (!show_bt && s_bt_bitmap) {
        gbitmap_destroy(s_bt_bitmap);
        s_bt_bitmap = NULL;
    }

    if (!show_bt_disconnect && s_bt_disconnect_bitmap) {
        gbitmap_destroy(s_bt_disconnect_bitmap);
        s_bt_disconnect_bitmap = NULL;
    }
}

static void calendar_status_update_proc(Layer *layer, GContext *ctx) {
    GRect bounds = layer_get_bounds(layer);
    bool show_qt = show_qt_icon();
    bool connected = connection_service_peek_pebble_app_connection();
    int icon_x = show_qt ? ICON_SLOT_2_X(bounds.size.w) : ICON_SLOT_1_X(bounds.size.w);
    bool show_bt = connected && g_config->show_bt;
    bool show_bt_disconnect = !connected && g_config->show_bt_disconnect;

    maybe_unload_calendar_status_bitmaps(show_qt, connected);

    if (show_qt) {
        ensure_mute_bitmap_loaded();
        draw_bitmap(ctx, s_mute_bitmap, GRect(ICON_SLOT_1_X(bounds.size.w),
                                              STATUS_ICON_Y(bounds.size.h, ICON_SLOT_1.size.h),
                                              ICON_SLOT_1.size.w, ICON_SLOT_1.size.h));
    }

    if (show_bt) {
        ensure_bt_bitmap_loaded();
        draw_bitmap(ctx, s_bt_bitmap, GRect(icon_x, STATUS_ICON_Y(bounds.size.h, 10), 10, 10));
    } else if (show_bt_disconnect) {
        ensure_bt_disconnect_bitmap_loaded();
        draw_bitmap(ctx, s_bt_disconnect_bitmap, GRect(icon_x, STATUS_ICON_Y(bounds.size.h, 10), 10, 10));
    }

    draw_month_text(ctx, bounds);
}

void calendar_status_layer_create(Layer* parent_layer, GRect frame) {
    MemoryHeapProbe probe = MEMORY_HEAP_PROBE_START("calendar_status_layer_create");

    s_calendar_status_layer = layer_create(frame);
    MEMORY_HEAP_PROBE_SAMPLE("after_layer_create", &probe);

    GRect bounds = layer_get_bounds(s_calendar_status_layer);
    int w = bounds.size.w;

    // Set up bluetooth handler
    connection_service_subscribe((ConnectionHandlers) {
        .pebble_app_connection_handler = bluetooth_callback
    });
    MEMORY_HEAP_PROBE_SAMPLE("after_connection_subscribe", &probe);

    calendar_status_layer_refresh();

    layer_set_update_proc(s_calendar_status_layer, calendar_status_update_proc);
    MEMORY_HEAP_PROBE_SAMPLE("after_update_proc_set", &probe);

    battery_layer_create(s_calendar_status_layer,
                         GRect(BATTERY_X(w), BATTERY_Y(bounds.size.h), BATTERY_W, BATTERY_H));
    MEMORY_HEAP_PROBE_SAMPLE("after_battery_layer_create", &probe);

    layer_add_child(parent_layer, s_calendar_status_layer);
    MEMORY_HEAP_PROBE_SAMPLE("after_parent_child_added", &probe);

    MEMORY_LOG_HEAP("after_calendar_status_layer_create");
    MEMORY_HEAP_PROBE_LOG_MIN(&probe);
}

bool show_qt_icon(void);

/* Что нарисовано в строке состояния сейчас. Перерисовка стоит разметки и
 * вывода текста, поэтому просим её только когда картинка действительно
 * меняется. */
static bool s_drawn_qt;
static bool s_drawn_connected;
static bool s_drawn_valid;

/* Перерисовать, если состояние значков разошлось с нарисованным.
 *
 * @param force Перерисовать безусловно — когда поменялось что-то помимо
 *              значков: дата, тема, палитра битмапов.
 */
static void prv_redraw_if_changed(bool force) {
    /* g_config обнуляется при выгрузке раньше, чем система перестаёт слать
     * события связи, а show_qt_icon() его разыменовывает. */
    if (!s_calendar_status_layer || !g_config) {
        return;
    }
    const bool qt = show_qt_icon();
    const bool connected = connection_service_peek_pebble_app_connection();
    if (!force && s_drawn_valid && qt == s_drawn_qt && connected == s_drawn_connected) {
        return;
    }
    s_drawn_qt = qt;
    s_drawn_connected = connected;
    s_drawn_valid = true;
    layer_mark_dirty(s_calendar_status_layer);
}

void bluetooth_icons_refresh(bool connected) {
    (void)connected;
    prv_redraw_if_changed(false);
}

void bluetooth_callback(bool connected) {
    bluetooth_icons_refresh(connected);
    /* g_config обнуляется при выгрузке раньше, чем система перестаёт слать
     * события связи, поэтому проверяем и его тоже. */
    if (!connected && g_config && g_config->vibe)
        vibes_double_pulse();
}

bool show_qt_icon() {
    return g_config->show_qt && quiet_time_is_active();
}

void status_icons_refresh() {
    /* Зовётся каждую минуту: у «не беспокоить» нет службы событий, его можно
     * только опрашивать. Но опрос дёшев, а перерисовка — нет, и меняется этот
     * значок пару раз в сутки по расписанию. Раньше слой помечался грязным
     * безусловно, то есть строка состояния перерисовывалась 1440 раз в сутки
     * ради ответа, который между перерисовками почти никогда не меняется.
     * Связь и заряд приходят событиями и идут тем же путём. */
    prv_redraw_if_changed(false);
}

void calendar_status_layer_refresh() {
    if (!s_calendar_status_layer) {
        return;
    }
    struct tm tm_now = watch_services_localtime();

    /* Палитра значков задаётся один раз при загрузке битмапа, а тема может
     * смениться позже — тогда значок оставался в цветах прошлой темы. Сбрасываем
     * кеш, битмапы перезагрузятся с текущими цветами. */
    drop_cached_bitmaps();

    /* The calendar lives on the swipe-in screen now, so this row shows the
     * date itself rather than the month it belonged to. */
    snprintf(s_calendar_month_text, sizeof(s_calendar_month_text), "%s, %d %s",
             i18n_weekday_short(tm_now.tm_wday), tm_now.tm_mday,
             i18n_month_genitive(tm_now.tm_mon));
    /* Поменялась дата и сброшен кеш битмапов — это мимо значков, поэтому
     * перерисовка нужна независимо от них. */
    prv_redraw_if_changed(true);
}

void calendar_status_layer_destroy() {
    MEMORY_LOG_HEAP("calendar_status_layer_destroy:before");
    /* Подписка на связь заводится в create, а сниматься забывали: обработчик
     * оставался жить и после сноса слоя — а он этот слой красит. Батарея
     * отписывается ровно так же, это было просто пропущено. */
    connection_service_unsubscribe();
    battery_layer_destroy();
    if (s_mute_bitmap) {
        gbitmap_destroy(s_mute_bitmap);
        s_mute_bitmap = NULL;
    }
    if (s_bt_bitmap) {
        gbitmap_destroy(s_bt_bitmap);
        s_bt_bitmap = NULL;
    }
    if (s_bt_disconnect_bitmap) {
        gbitmap_destroy(s_bt_disconnect_bitmap);
        s_bt_disconnect_bitmap = NULL;
    }
    layer_destroy(s_calendar_status_layer);
    s_calendar_status_layer = NULL;
    MEMORY_LOG_HEAP("calendar_status_layer_destroy:after");
}
