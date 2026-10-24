#pragma once

#include <pebble.h>

/* Значок текущей погоды.
 *
 * По графику видно вероятность осадков, но не видно, что происходит за окном
 * прямо сейчас: дождь, снег, гроза или ясно. Провайдер присылает тип одним
 * байтом, а рисуется он примитивами, без битмап-ресурсов: 18x18 в этой строке
 * — размер, на котором отрисовка кодом читается не хуже картинки, зато цвета
 * берутся из темы и не приходится держать по паре PNG на каждое состояние.
 *
 * Коды совпадают с WeatherProvider.CONDITION в src/pkjs/weather/provider.js.
 */
typedef enum {
    WEATHER_CONDITION_UNKNOWN = 0,
    WEATHER_CONDITION_CLEAR = 1,
    WEATHER_CONDITION_PARTLY_CLOUDY = 2,
    WEATHER_CONDITION_CLOUDY = 3,
    WEATHER_CONDITION_RAIN = 4,
    WEATHER_CONDITION_SNOW = 5,
    WEATHER_CONDITION_THUNDERSTORM = 6,
    WEATHER_CONDITION_FOG = 7
} WeatherCondition;

/**
 * Draw the icon for a weather condition inside the given box.
 *
 * @param ctx Graphics context.
 * @param box Square-ish area to draw in; the icon is centred inside it.
 * @param condition Condition code; nothing is drawn for UNKNOWN.
 */
void condition_icon_draw(GContext *ctx, GRect box, int condition);

/**
 * Draw a circular "refreshed" arrow.
 *
 * Помечает время последнего обновления погоды, чтобы его нельзя было принять за
 * время восхода или заката.
 *
 * @param ctx Graphics context.
 * @param box Area to draw in; the glyph is centred inside it.
 * @param color Glyph colour.
 */
void reload_icon_draw(GContext *ctx, GRect box, GColor color);
