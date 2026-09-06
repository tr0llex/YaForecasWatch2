#pragma once

#include <pebble.h>

void calendar_layer_create(Layer* parent_layer, GRect frame);

void calendar_layer_refresh();

void calendar_layer_destroy();

/**
 * Override the grid shape before creating the layer.
 *
 * The full-screen calendar shows more weeks than the old in-face band did.
 * Pass weeks = 0 to go back to the configured row count.
 *
 * @param weeks Number of week rows to draw.
 * @param rows_before_today How many of those rows precede today's row.
 */
