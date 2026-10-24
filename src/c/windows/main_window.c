#include "main_window.h"
#include "emery_layout.h"
#include "c/layers/time_layer.h"
#include "c/layers/forecast_layer.h"
#include "c/layers/weather_status_layer.h"
#include "c/layers/calendar_layer.h"
#include "c/layers/calendar_status_layer.h"
#include "c/layers/loading_layer.h"
#include "c/appendix/theme.h"
#include "c/appendix/app_message.h"
#include "c/appendix/config.h"
#include "c/appendix/persist.h"
#include "c/appendix/memory_log.h"

#define FORECAST_HEIGHT 51
#define WEATHER_STATUS_HEIGHT 14
#define TIME_HEIGHT 45
#define CALENDAR_HEIGHT 45
#define EMERY_WINDOW_PAD_X 2
#define EMERY_WINDOW_PAD_TOP 2
#define EMERY_WINDOW_PAD_BOTTOM 4
// emery: increase top calendar status row height to fit larger month and icon alignment.
#ifndef PBL_PLATFORM_EMERY
#define CALENDAR_STATUS_HEIGHT 13
#endif

static Window *s_main_window;
#ifdef PBL_PLATFORM_EMERY
// emery: overview, calendar and forecast share the existing layer implementations.
static uint8_t s_page;
static bool s_input_active;
static bool s_touch_down;
static GPoint s_touch_start;
static void change_page(int delta);
#endif

static void content_create(Window *window) {
    // Get information about the Window
    Layer *window_layer = window_get_root_layer(window);
    GRect bounds = layer_get_bounds(window_layer);
    int w = bounds.size.w;
    int h = bounds.size.h;
    window_set_background_color(window, theme_bg());

#ifdef PBL_PLATFORM_EMERY
    EmeryLayout l = emery_layout_compute(bounds);
    if (s_page == 1) {
        l.calendar = GRect(0, 20, w, h - 20 - 60);
        l.clock = GRect(0, h - 60, w, 60);
    } else if (s_page == 2) {
        l.clock = GRect(0, 20, w, 50);
        l.weather = GRect(0, 70, w, 26);
        l.forecast = GRect(0, 96, w, h - 96);
    }

    // emery: create only the content visible on the selected page.
    if (s_page != 1) {
        forecast_layer_create(window_layer, l.forecast);
        weather_status_layer_create(window_layer, l.weather);
    }
    time_layer_create(window_layer, l.clock);
    calendar_layer_set_grid(s_page == 1 ? 4 : 0, 1);
    if (s_page != 2) calendar_layer_create(window_layer, l.calendar);
    calendar_status_layer_create(window_layer, l.status);
    if (s_page != 1) {
        loading_layer_create(window_layer,
                GRect(0, l.weather.origin.y, w, l.weather.size.h + l.forecast.size.h));
    }
#else
    forecast_layer_create(window_layer,
            GRect(0, h - FORECAST_HEIGHT, w, FORECAST_HEIGHT));
    weather_status_layer_create(window_layer,
            GRect(0, h - FORECAST_HEIGHT - WEATHER_STATUS_HEIGHT, w, WEATHER_STATUS_HEIGHT));
    time_layer_create(window_layer,
            GRect(0, h - FORECAST_HEIGHT - WEATHER_STATUS_HEIGHT - TIME_HEIGHT,
            bounds.size.w, TIME_HEIGHT));
    calendar_layer_create(window_layer,
            GRect(0, CALENDAR_STATUS_HEIGHT, bounds.size.w, CALENDAR_HEIGHT));
    calendar_status_layer_create(window_layer,
            GRect(0, 0, bounds.size.w, CALENDAR_STATUS_HEIGHT + 1));  // +1 to stop text clipping
    loading_layer_create(window_layer,
            GRect(0, h - FORECAST_HEIGHT - WEATHER_STATUS_HEIGHT, w, FORECAST_HEIGHT + WEATHER_STATUS_HEIGHT));
#endif
    /* Раньше на emery заметка «Нет данных» оставалась поверх погоды и графика
     * до первого тика — до минуты с валидными данными в памяти, — а телефону
     * безусловно сообщалось, что данные есть, и стартовая загрузка не
     * запускалась. Спрашиваем хранилище, как и на остальных платформах. */
    loading_layer_refresh();

    MEMORY_LOG_HEAP("after_window_load");
}

static void content_destroy(Window *window) {
    MEMORY_LOG_HEAP("before_window_unload");
    time_layer_destroy();
    weather_status_layer_destroy();
    forecast_layer_destroy();
    calendar_layer_destroy();
    calendar_status_layer_destroy();
    loading_layer_destroy();
    MEMORY_LOG_HEAP("after_window_unload");
}

#ifdef PBL_PLATFORM_EMERY
// emery: only an explicit horizontal swipe changes pages, never wrist motion.
static void change_page(int delta) {
    if (!s_main_window || !s_input_active) return;
    s_page = (s_page + 3 + delta) % 3;
    content_destroy(s_main_window);
    content_create(s_main_window);
    time_layer_refresh();
}

static void touch_handler(const TouchEvent *event, void *context) {
    if (!s_input_active || event->non_navigational) {
        s_touch_down = false;
        return;
    }
    if (event->type == TouchEvent_Touchdown) {
        s_touch_start = GPoint(event->x, event->y);
        s_touch_down = true;
    } else if (event->type == TouchEvent_Liftoff && s_touch_down) {
        s_touch_down = false;
        const int dx = event->x - s_touch_start.x;
        const int dy = event->y - s_touch_start.y;
        if (abs(dx) >= 30 && abs(dx) > abs(dy)) change_page(dx < 0 ? 1 : -1);
    }
}

static void focus_handler(bool focused) {
    s_touch_down = false;
    if (focused == s_input_active) return;
    s_input_active = focused;
    if (focused) {
        touch_service_subscribe(touch_handler, NULL);
    } else {
        touch_service_unsubscribe();
    }
}
#endif

static void main_window_load(Window *window) {
    content_create(window);
    app_message_send_startup_state(!loading_layer_needs_refresh());
#ifdef PBL_PLATFORM_EMERY
    // emery: keep the original single-page layout on platforms without touch.
    app_focus_service_subscribe(focus_handler);
    focus_handler(true);
#endif
}

static void main_window_unload(Window *window) {
#ifdef PBL_PLATFORM_EMERY
    // emery: unsubscribe before destroying the layers used by callbacks.
    focus_handler(false);
    app_focus_service_unsubscribe();
#endif
    content_destroy(window);
}

static void minute_handler(struct tm *tick_time, TimeUnits units_changed) {
    time_layer_tick();
    if (units_changed & HOUR_UNIT) {
        forecast_layer_refresh();
    }
    /* tm_hour==0 missed day changes from emulator time jumps (same clock, new date). */
    if (units_changed & DAY_UNIT) {
        calendar_layer_refresh();
        calendar_status_layer_refresh();
    }
    /* Значок «не беспокоить» службы событий не имеет — он только опрашивается,
     * и включается-выключается по расписанию. Ежеминутная перерисовка строки
     * состояния нужна ради него; связь и заряд приходят событиями. */
    status_icons_refresh();
    /* Заметка «Нет данных» на тик не подписана намеренно. Она смотрит только
     * на то, есть ли прогноз в памяти, а это меняется в одном месте — когда
     * приходит погода, и оттуда же слой и обновляется. Ежеминутный опрос стоил
     * четырёх чтений хранилища, то есть почти шести тысяч обращений к флешу за
     * сутки ради ответа, который между ними не меняется. */
}

/*----------------------------
-------- EXTERNAL ------------
----------------------------*/

void main_window_create() {
    // Create main Window element and assign to pointer
    s_main_window = window_create();

    // Set handlers to manage the elements inside the Window
    window_set_window_handlers(s_main_window, (WindowHandlers) {
        .load = main_window_load,
        .unload = main_window_unload
    });

    // Register with TickTimerService
    tick_timer_service_subscribe(MINUTE_UNIT | HOUR_UNIT | DAY_UNIT, minute_handler);

    // Show the window on the watch with animated=true
    window_stack_push(s_main_window, true);
    time_layer_refresh();
}

void main_window_refresh() {
    if (!s_main_window) {
        return;
    }
#ifdef PBL_PLATFORM_EMERY
    // The theme can change after the window was loaded, so the background is
    // repainted here rather than only in main_window_load().
    if (s_main_window) {
        window_set_background_color(s_main_window, theme_bg());
    }
#endif
    time_layer_refresh();
    weather_status_layer_refresh();
    forecast_layer_refresh();
    calendar_layer_refresh();
    calendar_status_layer_refresh();
    /* Заметка тоже красится темой, а тема меняется здесь. */
    loading_layer_refresh();
}

void main_window_destroy() {
    /* Тик отписываем до сноса окна: обработчик красит слои, которые окно
     * уносит с собой, и без отписки он продолжал бы приходить на уже снесённые.
     * То же самое было с подпиской на связь в строке статуса. */
    tick_timer_service_unsubscribe();

    // Interface for destroying the main window (implicitly unloads contents)
    window_destroy(s_main_window);
    s_main_window = NULL;
}
