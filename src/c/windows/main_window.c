#include "main_window.h"
#include "emery_layout.h"
#include "c/layers/time_layer.h"
#include "c/layers/forecast_layer.h"
#include "c/layers/weather_status_layer.h"
#include "c/layers/calendar_layer.h"
#include "c/layers/calendar_status_layer.h"
#include "c/layers/loading_layer.h"
#include "c/appendix/theme.h"
#include "c/services/backlight_tint.h"
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

static void main_window_load(Window *window) {
    // Get information about the Window
    Layer *window_layer = window_get_root_layer(window);
    GRect bounds = layer_get_bounds(window_layer);
    int w = bounds.size.w;
    int h = bounds.size.h;
    window_set_background_color(window, theme_bg());

#ifdef PBL_PLATFORM_EMERY
    (void) w;
    (void) h;
    const EmeryLayout l = emery_layout_compute(bounds);

    /* Same stack as upstream: month row, weeks, clock, weather line, hourly
     * graph. Only the band heights are scaled to the taller screen. */
    forecast_layer_create(window_layer, l.forecast);
    weather_status_layer_create(window_layer, l.weather);
    time_layer_create(window_layer, l.clock);
    calendar_layer_create(window_layer, l.calendar);
    calendar_status_layer_create(window_layer, l.status);
    loading_layer_create(window_layer,
            GRect(0, l.weather.origin.y, w, l.weather.size.h + l.forecast.size.h));

    backlight_tint_init();
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
#ifdef PBL_PLATFORM_EMERY
    app_message_send_startup_state(true);
#else
    loading_layer_refresh();
    app_message_send_startup_state(!loading_layer_needs_refresh());
#endif
    MEMORY_LOG_HEAP("after_window_load");
}

static void main_window_unload(Window *window) {
    MEMORY_LOG_HEAP("before_window_unload");
#ifdef PBL_PLATFORM_EMERY
    backlight_tint_deinit();
#endif
    time_layer_destroy();
    weather_status_layer_destroy();
    forecast_layer_destroy();
    calendar_layer_destroy();
    calendar_status_layer_destroy();
    loading_layer_destroy();
    MEMORY_LOG_HEAP("after_window_unload");
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
    status_icons_refresh();
    loading_layer_refresh();
#ifdef PBL_PLATFORM_EMERY
    backlight_tint_refresh();
#endif
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
