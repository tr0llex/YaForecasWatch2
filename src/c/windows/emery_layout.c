#include "emery_layout.h"

/* Proportions of the upstream 144x168 face scaled to the taller screen:
 * 13 / 45 / 45 / 14 / 51 of 168. Порядок полос апстримовский, но по два
 * пикселя отданы верхней строке: 16-пиксельная надпись в 18 px упиралась и в
 * верхнюю кромку экрана, и в календарь, а у календаря с часами запас был. */
#define STATUS_H 20
#define CALENDAR_H 56
/* Полоса часов ниже 64 px опускала циферблат на компактное начертание 58 px;
 * четыре пикселя, освободившиеся у строки погоды после перехода на шрифт 12 px,
 * отданы сюда — и часы переключаются на 78 px. */
#define CLOCK_H 64
/* Здесь живут значок погоды и текущая температура — вторая по важности вещь
 * на экране после часов. На 26 px помещается жирная двадцатка и значок в
 * 24 px; недостающее взято у календаря (строки 28 px, для цифр 22 px хватает)
 * и у графика. */
#define WEATHER_H 26
#define FORECAST_H 62

EmeryLayout emery_layout_compute(GRect bounds) {
    const int w = bounds.size.w;
    const int h = bounds.size.h;

    /* The forecast graph is pinned to the bottom edge and the rest stacks
     * above it, exactly like the original does. */
    const int forecast_y = h - FORECAST_H;
    const int weather_y = forecast_y - WEATHER_H;
    const int clock_y = weather_y - CLOCK_H;

    EmeryLayout l;
    l.status = GRect(0, 0, w, STATUS_H + 1);  // +1: otherwise the text clips
    l.calendar = GRect(0, STATUS_H, w, CALENDAR_H);
    l.clock = GRect(0, clock_y, w, CLOCK_H);
    l.weather = GRect(0, weather_y, w, WEATHER_H);
    l.forecast = GRect(0, forecast_y, w, FORECAST_H);
    return l;
}
