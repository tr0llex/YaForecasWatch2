#pragma once

#include <pebble.h>

#define WEATHER_STATUS_LAYER_HEIGHT 14

void weather_status_layer_create(Layer* parent_layer, GRect frame);

void weather_status_layer_refresh();

void weather_status_layer_destroy();