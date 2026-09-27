#pragma once

#include <pebble.h>

// emery: taller row for the larger month font.
#ifdef PBL_PLATFORM_EMERY
#define CALENDAR_STATUS_LAYER_HEIGHT 20
#else
#define CALENDAR_STATUS_LAYER_HEIGHT 13
#endif

void calendar_status_layer_create(Layer* parent_layer, GRect frame);

void status_icons_refresh();

void bluetooth_icons_refresh(bool connected);

void bluetooth_callback(bool connected);

bool show_qt_icon();

void calendar_status_layer_refresh();

void calendar_status_layer_destroy();