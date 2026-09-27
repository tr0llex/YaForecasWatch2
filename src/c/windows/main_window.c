#include "main_window.h"
#include "face_layout.h"
#include "c/layers/time_layer.h"
#include "c/layers/forecast_layer.h"
#include "c/layers/weather_status_layer.h"
#include "c/layers/calendar_layer.h"
#include "c/layers/calendar_status_layer.h"
#include "c/layers/loading_layer.h"
#include "c/appendix/app_message.h"
#include "c/appendix/persist.h"
#include "c/appendix/memory_log.h"

static Window *s_main_window;

static void main_window_load(Window *window) {
    // Get information about the Window
    Layer *window_layer = window_get_root_layer(window);
    window_set_background_color(window, GColorBlack);

    // The face is fullscreen, so the display size is the window size; as a
    // compile-time constant it lets the layout fold into fixed rectangles.
    const FaceLayout layout = face_layout_compute(
            GSize(PBL_DISPLAY_WIDTH, PBL_DISPLAY_HEIGHT),
            CALENDAR_STATUS_LAYER_HEIGHT, WEATHER_STATUS_LAYER_HEIGHT);

    forecast_layer_create(window_layer, layout.forecast);
    weather_status_layer_create(window_layer, layout.weather);
    time_layer_create(window_layer, layout.clock);
    calendar_layer_create(window_layer, layout.calendar);
    calendar_status_layer_create(window_layer, layout.status);
    loading_layer_create(window_layer, layout.loading);
    loading_layer_refresh();
    app_message_send_startup_state(!loading_layer_needs_refresh());
    MEMORY_LOG_HEAP("after_window_load");
}

static void main_window_unload(Window *window) {
    MEMORY_LOG_HEAP("before_window_unload");
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
    time_layer_refresh();
    weather_status_layer_refresh();
    forecast_layer_refresh();
    calendar_layer_refresh();
    calendar_status_layer_refresh();
}

void main_window_destroy() {
    tick_timer_service_unsubscribe();

    // Interface for destroying the main window (implicitly unloads contents)
    window_destroy(s_main_window);
    s_main_window = NULL;
}
