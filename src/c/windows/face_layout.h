#pragma once

#include <pebble.h>

// Proportions of the original 144x168 face.
#define FACE_CALENDAR_WEIGHT 45
#define FACE_CLOCK_WEIGHT 45
#define FACE_FORECAST_WEIGHT 51

// Wide screens (emery) lose a few pixels under the bezel.
#define FACE_INSET_MIN_WIDTH 200
#define FACE_INSET_X 2
#define FACE_INSET_TOP 2
#define FACE_INSET_BOTTOM 4

typedef struct {
    GRect status;
    GRect calendar;
    GRect clock;
    GRect weather;
    GRect forecast;
    GRect loading;
} FaceLayout;

// Inline so that constant arguments fold into constant rectangles.
static inline FaceLayout face_layout_compute(GSize screen, int status_h, int weather_h) {
    const int w = screen.w;
    const int h = screen.h;
    const bool inset = w >= FACE_INSET_MIN_WIDTH;
    const int x = inset ? FACE_INSET_X : 0;
    const int top = inset ? FACE_INSET_TOP : 0;
    const int bottom = inset ? FACE_INSET_BOTTOM : 0;
    const int content_w = w - x * 2;

    const int flexible_h = h - top - bottom - status_h - weather_h;
    const int weight_sum = FACE_CALENDAR_WEIGHT + FACE_CLOCK_WEIGHT + FACE_FORECAST_WEIGHT;
    const int calendar_h = flexible_h * FACE_CALENDAR_WEIGHT / weight_sum;
    const int clock_h = flexible_h * FACE_CLOCK_WEIGHT / weight_sum;
    const int forecast_h = flexible_h - calendar_h - clock_h;

    const int calendar_y = top + status_h;
    const int clock_y = calendar_y + calendar_h;
    const int weather_y = clock_y + clock_h;
    const int forecast_y = weather_y + weather_h;

    FaceLayout layout;
    // +1 to stop text clipping
    layout.status = GRect(x, top, content_w, status_h + 1);
    layout.calendar = GRect(x, calendar_y, content_w, calendar_h);
    layout.clock = GRect(x, clock_y, content_w, clock_h);
    layout.weather = GRect(x, weather_y, content_w, weather_h);
    layout.forecast = GRect(x, forecast_y, w - x, forecast_h);
    layout.loading = GRect(x, weather_y, content_w, h - bottom - weather_y);
    return layout;
}
