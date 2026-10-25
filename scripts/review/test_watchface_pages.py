"""The complete production window must always retain the overview."""
from pathlib import Path
import re
import unittest
from test_service_regressions import run_c
ROOT = Path(__file__).resolve().parents[2]

class WatchfacePagesTests(unittest.TestCase):
    def test_lifecycle_and_updates_keep_overview(self):
        folder = ROOT / 'src/c/windows'
        source = (folder / 'main_window.c').read_text()
        layout = (folder / 'emery_layout.c').read_text()
        source = re.sub(r'^#include.*\n', '', source, flags=re.M)
        layout = re.sub(r'^#include.*\n', '', layout, flags=re.M)
        # No input subscription mocks: reintroducing page gestures fails to link.
        run_c(r'''
#include <assert.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <time.h>
#define PBL_PLATFORM_EMERY 1
#define MEMORY_LOG_HEAP(...) ((void)0)
typedef struct { int x, y; } Point;
typedef struct { int w, h; } Size;
typedef struct { Point origin; Size size; } GRect;
#define GRect(x,y,w,h) ((GRect){{x,y},{w,h}})
typedef struct { GRect status, calendar, clock, weather, forecast; } EmeryLayout;
typedef int Layer;
typedef int Window;
typedef int TimeUnits;
typedef struct { void (*load)(Window*); void (*unload)(Window*); } WindowHandlers;
enum { MINUTE_UNIT=1, HOUR_UNIT=2, DAY_UNIT=4 };
static Window window;
static Layer root;
static WindowHandlers handlers;
static void (*tick)(struct tm*, TimeUnits);
static int created, destroyed, refreshed, startup;
static GRect frames[6];
static Window *window_create(void) { return &window; }
static Layer *window_get_root_layer(Window *w) { return &root; }
static GRect layer_get_bounds(Layer *l) { return GRect(0,0,200,228); }
static int theme_bg(void) { return 0; }
static void window_set_background_color(Window *w, int c) {}
static void window_set_window_handlers(Window *w, WindowHandlers h) { handlers=h; }
static void window_stack_push(Window *w, bool a) { handlers.load(w); }
static void window_destroy(Window *w) { handlers.unload(w); }
static void tick_timer_service_subscribe(TimeUnits u, void (*cb)(struct tm*,TimeUnits)) { tick=cb; }
static void tick_timer_service_unsubscribe(void) { tick=NULL; }
static bool loading_layer_needs_refresh(void) { return false; }
static void app_message_send_startup_state(bool has_data) { startup++; }
#define MOCK_LAYER(name, index) \
 static void name##_create(Layer *p, GRect f) { frames[index]=f; created++; } \
 static void name##_destroy(void) { destroyed++; } \
 static void name##_refresh(void) { refreshed++; }
MOCK_LAYER(time_layer, 0)
MOCK_LAYER(calendar_layer, 1)
MOCK_LAYER(weather_status_layer, 2)
MOCK_LAYER(forecast_layer, 3)
MOCK_LAYER(calendar_status_layer, 4)
MOCK_LAYER(loading_layer, 5)
static void time_layer_tick(void) { refreshed++; }
static void status_icons_refresh(void) { refreshed++; }
''' + layout + source + r'''
static void overview(void) {
  assert(frames[1].origin.y==20 && frames[1].size.h==56);
  assert(frames[0].origin.y==76 && frames[0].size.h==64);
  assert(frames[2].origin.y==140 && frames[2].size.h==26);
  assert(frames[3].origin.y==166 && frames[3].size.h==62);
  assert(frames[4].origin.y==0);
}
int main(void) {
  struct tm clock={0};
  for (int launch=0; launch<3; launch++) {
    main_window_create();
    assert(created==(launch+1)*6 && startup==launch+1 && tick);
    overview();
    for (int minute=1; minute<=1440; minute++) {
      tick(&clock, MINUTE_UNIT | (minute%60==0 ? HOUR_UNIT:0)
           | (minute==1440 ? DAY_UNIT:0));
      main_window_refresh();
      overview();
      assert(created==(launch+1)*6 && destroyed==launch*6);
    }
    main_window_destroy();
    assert(!tick && !s_main_window && created==destroyed);
    main_window_refresh();
  }
  assert(refreshed>0);
}
''')
