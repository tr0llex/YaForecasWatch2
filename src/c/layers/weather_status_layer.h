#pragma once

#include <pebble.h>

int weather_status_layer_height(void);

void weather_status_layer_create(Layer* parent_layer, GRect frame);

void weather_status_layer_refresh();

void weather_status_layer_destroy();