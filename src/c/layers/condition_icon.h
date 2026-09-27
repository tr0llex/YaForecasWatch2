#pragma once

#include <pebble.h>

// Codes must match CONDITION in src/pkjs/weather/conditions.js.
typedef enum {
    WEATHER_CONDITION_UNKNOWN = 0,
    WEATHER_CONDITION_CLEAR = 1,
    WEATHER_CONDITION_PARTLY_CLOUDY = 2,
    WEATHER_CONDITION_CLOUDY = 3,
    WEATHER_CONDITION_RAIN = 4,
    WEATHER_CONDITION_SNOW = 5,
    WEATHER_CONDITION_THUNDERSTORM = 6,
    WEATHER_CONDITION_FOG = 7,
    WEATHER_CONDITION_COUNT
} WeatherCondition;

bool condition_icon_is_known(int condition);

void condition_icon_draw(GContext *ctx, GRect box, int condition);
