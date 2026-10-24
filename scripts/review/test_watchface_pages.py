"""Проверка жестов и подписок реальными обработчиками циферблата."""
from pathlib import Path
import unittest

from test_service_regressions import function, run_c

ROOT = Path(__file__).resolve().parents[2]


class WatchfacePagesTests(unittest.TestCase):
    def test_background_updates_do_not_rebuild_or_switch_pages(self):
        source = (ROOT / "src/c/windows/main_window.c").read_text()
        run_c(r'''
#include <assert.h>
#include <time.h>
#define PBL_PLATFORM_EMERY 1
typedef int Window;
typedef int TimeUnits;
enum { MINUTE_UNIT = 1, HOUR_UNIT = 2, DAY_UNIT = 4 };
static Window window;
static Window *s_main_window = &window;
static int s_page, rebuilt, refreshed;
static void content_create(Window *w) { rebuilt++; }
static void content_destroy(Window *w) { rebuilt++; }
static int theme_bg(void) { return 0; }
static void window_set_background_color(Window *w, int color) {}
#define REFRESH(name) static void name(void) { refreshed++; }
REFRESH(time_layer_tick)
REFRESH(time_layer_refresh)
REFRESH(weather_status_layer_refresh)
REFRESH(forecast_layer_refresh)
REFRESH(calendar_layer_refresh)
REFRESH(calendar_status_layer_refresh)
REFRESH(loading_layer_refresh)
REFRESH(status_icons_refresh)
''' + "\n".join(function(source, name) for name in
                   ("minute_handler", "main_window_refresh")) + r'''
int main(void) {
  struct tm clock = {0};
  for (int page = 0; page < 3; page++) {
    s_page = page;
    for (int minute = 1; minute <= 1440; minute++) {
      minute_handler(&clock, MINUTE_UNIT | (minute % 60 == 0 ? HOUR_UNIT : 0)
                     | (minute == 1440 ? DAY_UNIT : 0));
      if (minute % 60 == 0) main_window_refresh();
      assert(s_page == page && rebuilt == 0);
    }
  }
  assert(refreshed > 0);
}
''')

    def test_navigation_respects_focus_and_wake_only_contacts(self):
        source = (ROOT / "src/c/windows/main_window.c").read_text()
        run_c(r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <time.h>
typedef struct { int x, y; } GPoint;
#define GPoint(x_, y_) ((GPoint){(x_), (y_)})
typedef int Window;
typedef int AccelAxisType;
enum { TouchEvent_Touchdown, TouchEvent_Liftoff };
typedef struct { int type, x, y; bool non_navigational; } TouchEvent;
static Window window;
static Window *s_main_window = &window;
static bool s_input_active, s_touch_down;
static uint8_t s_page;
static GPoint s_touch_start;
static int created, destroyed, subscriptions;
static void (*motion_callback)(AccelAxisType, int32_t);
static void content_create(Window *w) { created++; }
static void content_destroy(Window *w) { destroyed++; }
static void time_layer_refresh(void) {}
static void touch_service_subscribe(void (*cb)(const TouchEvent *, void *), void *ctx) {
  subscriptions++;
}
static void touch_service_unsubscribe(void) { subscriptions--; }
static void accel_tap_service_subscribe(void (*cb)(AccelAxisType, int32_t)) {
  motion_callback = cb;
  subscriptions++;
}
static void accel_tap_service_unsubscribe(void) { motion_callback = NULL; subscriptions--; }
''' + "\n".join(function(source, name) for name in
                   ("change_page", "touch_handler", "focus_handler")) + r'''
static void swipe(int dx, int dy, bool wake_only) {
  TouchEvent down = {TouchEvent_Touchdown, 100, 100, wake_only};
  TouchEvent up = {TouchEvent_Liftoff, 100 + dx, 100 + dy, wake_only};
  touch_handler(&down, NULL);
  touch_handler(&up, NULL);
}
int main(void) {
  focus_handler(true);
  focus_handler(true);
  assert(subscriptions == 1 && motion_callback == NULL);
  for (int i = 0; i < 100; i++) {
    if (motion_callback) motion_callback(i % 3, i % 2 ? 1 : -1);
  }
  assert(s_page == 0 && created == 0);
  swipe(-100, 0, true);
  swipe(-10, 0, false);
  swipe(-40, 90, false);
  assert(s_page == 0 && created == 0);
  swipe(100, 0, false);
  assert(s_page == 2);
  swipe(-100, 0, false);
  assert(s_page == 0);
  for (int i = 0; i < 30; i++) swipe(-100, 0, false);
  assert(s_page == 0 && created == destroyed && created == 32);
  focus_handler(false);
  focus_handler(false);
  assert(subscriptions == 0);
  swipe(-100, 0, false);
  assert(s_page == 0);
  focus_handler(true);
  TouchEvent down = {TouchEvent_Touchdown, 170, 100, false};
  TouchEvent up = {TouchEvent_Liftoff, 30, 100, false};
  touch_handler(&down, NULL);
  focus_handler(false);
  focus_handler(true);
  touch_handler(&up, NULL); // A popup interrupted this contact; it cannot become a swipe.
  assert(s_page == 0 && created == 32);
  focus_handler(false);
  assert(subscriptions == 0 && motion_callback == NULL);
}
''')
