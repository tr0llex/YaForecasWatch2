#include "face_layout.h"

// Proportions of the original 144x168 face.
#define CALENDAR_WEIGHT 45
#define CLOCK_WEIGHT 45
#define FORECAST_WEIGHT 51

// Wide screens (emery) lose a few pixels under the bezel.
#define INSET_MIN_WIDTH 200
#define INSET_X 2
#define INSET_TOP 2
#define INSET_BOTTOM 4

FaceLayout face_layout_compute(GRect bounds, int status_h, int weather_h) {
    const int w = bounds.size.w;
    const int h = bounds.size.h;
    const bool inset = w >= INSET_MIN_WIDTH;
    const int x = inset ? INSET_X : 0;
    const int top = inset ? INSET_TOP : 0;
    const int bottom = inset ? INSET_BOTTOM : 0;
    const int content_w = w - x * 2;

    const int flexible_h = h - top - bottom - status_h - weather_h;
    const int weight_sum = CALENDAR_WEIGHT + CLOCK_WEIGHT + FORECAST_WEIGHT;
    const int calendar_h = flexible_h * CALENDAR_WEIGHT / weight_sum;
    const int clock_h = flexible_h * CLOCK_WEIGHT / weight_sum;
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
