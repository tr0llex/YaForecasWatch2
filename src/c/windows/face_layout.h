#pragma once

#include <pebble.h>

typedef struct {
    GRect status;
    GRect calendar;
    GRect clock;
    GRect weather;
    GRect forecast;
    GRect loading;
} FaceLayout;

FaceLayout face_layout_compute(GRect bounds, int status_h, int weather_h);
