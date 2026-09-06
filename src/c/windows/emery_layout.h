#pragma once

#include <pebble.h>

/* Layout for the Emery (Pebble Time 2, 200x228) main window.
 *
 * The bands are the ones the upstream watchface has always had, in the same
 * order and the same proportions — the screen is simply 1.36 times taller than
 * the 144x168 it was drawn for, so every band is scaled by that factor rather
 * than the layout being re-invented:
 *
 *   status   — month and the bluetooth/battery icons
 *   calendar — the week rows
 *   clock    — time
 *   weather  — one line: place and conditions
 *   forecast — the hourly graph
 *
 * Everything is on one screen; there is no navigation.
 */

typedef struct {
    GRect status;
    GRect calendar;
    GRect clock;
    GRect weather;
    GRect forecast;
} EmeryLayout;

/**
 * Compute the band rects for a window of the given size.
 *
 * @param bounds Root layer bounds.
 */
EmeryLayout emery_layout_compute(GRect bounds);
