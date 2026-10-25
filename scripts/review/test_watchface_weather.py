"""Неполный прогноз не должен добавлять ложные точки или брать старый ряд."""
from pathlib import Path
import unittest

from test_service_regressions import function, run_c

ROOT = Path(__file__).resolve().parents[2]


class WatchfaceWeatherTests(unittest.TestCase):
    def test_missing_truncated_and_replaced_feels_like_series(self):
        source = (ROOT / "src/c/appendix/persist.c").read_text()
        run_c(r'''
#include <assert.h>
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#define FEELS_LIKE_UNAVAILABLE INT16_MIN
#define FEELS_LIKE_TREND 1
static unsigned char stored[48];
static int stored_size = -1;
static int persist_read_data(int key, void *data, size_t size) {
  if (stored_size < 0) return -1;
  int count = stored_size < (int)size ? stored_size : (int)size;
  memcpy(data, stored, count);
  return count;
}
static int persist_write_data(int key, const void *data, size_t size) {
  assert(size <= sizeof(stored));
  memcpy(stored, data, size);
  stored_size = size;
  return size;
}
static void persist_delete(int key) { stored_size = -1; }
''' + "\n".join(function(source, name) for name in
                   ("persist_get_feels_like_trend", "persist_set_feels_like_trend")) + r'''
int main(void) {
  int16_t values[24], fresh[] = {0, -12, 58};
  memset(values, 0, sizeof(values));
  assert(persist_get_feels_like_trend(values, 24) == -1);
  for (int i = 0; i < 24; i++) assert(values[i] == INT16_MIN);

  persist_set_feels_like_trend(fresh, 3);
  assert(persist_get_feels_like_trend(values, 24) == 6);
  assert(values[0] == 0 && values[1] == -12 && values[2] == 58);
  for (int i = 3; i < 24; i++) assert(values[i] == INT16_MIN);

  stored_size = 3; // A half-written int16 is missing, not a temperature.
  assert(persist_get_feels_like_trend(values, 24) == 3);
  assert(values[0] == 0);
  for (int i = 1; i < 24; i++) assert(values[i] == INT16_MIN);

  persist_set_feels_like_trend(fresh, 3);
  persist_set_feels_like_trend(NULL, 0);
  assert(persist_get_feels_like_trend(values, 24) == -1);
  for (int i = 0; i < 24; i++) assert(values[i] == INT16_MIN);
}
''')
