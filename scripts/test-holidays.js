#!/usr/bin/env node

global.localStorage = {
  getItem() {
    return null;
  },
  setItem() {}
};
global.XMLHttpRequest = function XMLHttpRequest() {};

const assert = require('assert');
const holidays = require('../src/pkjs/holidays.js');

const sampleSpain = [
  { date: '2026-01-01', global: true, counties: null, types: ['Public'] },
  { date: '2026-04-06', global: false, counties: ['ES-CT'], types: ['Public'] },
  { date: '2026-09-11', global: false, counties: ['ES-CT'], types: ['Public'] },
  { date: '2026-10-12', global: true, counties: null, types: ['Public'] },
  { date: '2026-10-12', global: true, counties: null, types: ['Bank'] },
  { date: '2026-12-26', global: false, counties: ['ES-CT'], types: ['Public'] },
  { date: '2026-05-02', global: false, counties: ['ES-MD'], types: ['Public'] },
  { date: '2026-06-01', global: true, counties: null, types: ['Observance'] }
];

const sampleUs = [
  { date: '2026-01-01', global: true, counties: null, types: ['Public', 'Bank'] },
  { date: '2026-02-12', global: false, counties: ['US-CA'], types: ['Observance'] },
  { date: '2026-10-12', global: true, counties: null, types: ['Bank'] }
];

const sampleRu = [
  { date: '2026-01-01', global: true, counties: null, types: ['Public'] },
  { date: '2026-03-08', global: true, counties: null, types: ['Public'] },
  { date: '2026-04-01', global: true, counties: null, types: ['Observance'] }
];

assert.deepStrictEqual(
  holidays.filterHolidayDates(sampleSpain, holidays.HOLIDAY_SET_ES_NATIONAL),
  ['2026-01-01', '2026-10-12']
);

assert.deepStrictEqual(
  holidays.filterHolidayDates(sampleSpain, holidays.HOLIDAY_SET_ES_CATALONIA),
  ['2026-01-01', '2026-04-06', '2026-09-11', '2026-10-12', '2026-12-26']
);

assert.deepStrictEqual(
  holidays.filterHolidayDates(sampleUs, holidays.HOLIDAY_SET_US),
  ['2026-01-01', '2026-10-12']
);

assert.deepStrictEqual(
  holidays.filterHolidayDates(sampleRu, holidays.HOLIDAY_SET_RU),
  ['2026-01-01', '2026-03-08']
);

const packed = holidays.packHolidayBits(2026, ['2026-01-01', '2026-12-31', '2027-01-01']);
assert.strictEqual(packed.length, 46);
assert.strictEqual((packed[0] & 1) !== 0, true);
assert.strictEqual((packed[45] & (1 << 4)) !== 0, true);

assert.strictEqual(holidays.normalizeHolidaySet('4'), holidays.HOLIDAY_SET_ES_CATALONIA);
assert.strictEqual(holidays.normalizeHolidaySet('bogus'), holidays.HOLIDAY_SET_NONE);
assert.strictEqual(holidays._isStale({ fetchedAtUtc: '2026-01-01T00:00:00.000Z' }, Date.parse('2026-02-01T00:00:01.000Z')), true);
assert.strictEqual(holidays._isStale({ fetchedAtUtc: '2026-01-15T00:00:00.000Z' }, Date.parse('2026-02-01T00:00:01.000Z')), false);

(function testStaleCacheAnswersOnce() {
  const WeatherProvider = require('../src/pkjs/weather/provider.js');
  const originalRequest = WeatherProvider.request;
  const originalGetItem = global.localStorage.getItem;
  const stale = JSON.stringify({
    fetchedAtUtc: '2000-01-01T00:00:00.000Z',
    source: 'US:national:2026',
    dates: ['2026-01-01']
  });
  const calls = [];

  global.localStorage.getItem = function() {
    return stale;
  };
  WeatherProvider.request = function(url, method, onSuccess) {
    onSuccess(JSON.stringify(sampleUs));
  };
  try {
    holidays._loadHolidaySetYear(holidays.HOLIDAY_SET_US, 2026, function(dates, meta) {
      calls.push(meta.status);
    });
  } finally {
    WeatherProvider.request = originalRequest;
    global.localStorage.getItem = originalGetItem;
  }
  assert.deepStrictEqual(calls, ['stale']);
})();

(function testFailedRefreshAnswersOnce() {
  const WeatherProvider = require('../src/pkjs/weather/provider.js');
  const originalRequest = WeatherProvider.request;
  const calls = [];

  WeatherProvider.request = function(url, method, onSuccess, onFailure) {
    onFailure({ code: 'offline' });
  };
  try {
    holidays._loadHolidaySetYear(holidays.HOLIDAY_SET_ES_NATIONAL, 2031, function(dates, meta) {
      calls.push(meta.status);
    });
  } finally {
    WeatherProvider.request = originalRequest;
  }
  assert.deepStrictEqual(calls, ['failed_empty']);
})();

// The refreshed year behind a stale cache is sent after it, never in parallel.
(function testStaleCacheSendsRefreshedYear() {
  const WeatherProvider = require('../src/pkjs/weather/provider.js');
  const originalRequest = WeatherProvider.request;
  const originalGetItem = global.localStorage.getItem;
  const stale = JSON.stringify({
    fetchedAtUtc: '2000-01-01T00:00:00.000Z',
    source: 'ES:catalonia',
    dates: []
  });
  const sent = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let doneCalls = 0;

  global.localStorage.getItem = function() {
    return stale;
  };
  WeatherProvider.request = function(url, method, onSuccess) {
    setTimeout(function() {
      onSuccess(JSON.stringify(sampleSpain));
    }, 5);
  };
  global.Pebble = {
    sendAppMessage(payload, onSuccess) {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      sent.push({ slot: payload.HOLIDAY_SLOT, year: payload.HOLIDAY_YEAR, bits: payload.HOLIDAY_BITS.some(Boolean) });
      setTimeout(function() {
        inFlight -= 1;
        onSuccess();
      }, 1);
    }
  };

  holidays.sendHolidayBitsets({ holidaySet1: '4', holidaySet2: '0' }, function() {
    doneCalls += 1;
  });
  setTimeout(function() {
    WeatherProvider.request = originalRequest;
    global.localStorage.getItem = originalGetItem;
    const slot1 = sent.filter(function(entry) { return entry.slot === 1; });
    assert.strictEqual(maxInFlight, 1);
    assert.strictEqual(doneCalls, 1);
    // Each slot-1 year goes out twice: empty stale cache first, then fresh data.
    assert.strictEqual(slot1.length, 6);
    assert.strictEqual(slot1.slice(0, 3).some(function(entry) { return entry.bits; }), false);
    assert.ok(slot1.slice(3).some(function(entry) { return entry.bits; }));
    assert.strictEqual(sent.filter(function(entry) { return entry.slot === 2; }).length, 3);
    console.log('Holiday tests passed');
  }, 200);
})();
