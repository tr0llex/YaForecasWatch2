#!/usr/bin/env node

global.localStorage = {
  getItem() {
    return null;
  },
  setItem() {},
  removeItem() {}
};
global.XMLHttpRequest = function XMLHttpRequest() {};

const assert = require('assert');
const conditions = require('../src/pkjs/weather/conditions.js');
const WeatherProvider = require('../src/pkjs/weather/provider.js');
const C = conditions.CONDITION;

// Shared with condition_icon.h.
assert.deepStrictEqual(C, {
  UNKNOWN: 0, CLEAR: 1, PARTLY_CLOUDY: 2, CLOUDY: 3,
  RAIN: 4, SNOW: 5, THUNDERSTORM: 6, FOG: 7
});
assert.strictEqual(WeatherProvider.CONDITION, C);

assert.strictEqual(conditions.fromWmo(0), C.CLEAR);
assert.strictEqual(conditions.fromWmo(2), C.PARTLY_CLOUDY);
assert.strictEqual(conditions.fromWmo(3), C.CLOUDY);
assert.strictEqual(conditions.fromWmo(48), C.FOG);
assert.strictEqual(conditions.fromWmo(61), C.RAIN);
assert.strictEqual(conditions.fromWmo(81), C.RAIN);
assert.strictEqual(conditions.fromWmo(73), C.SNOW);
assert.strictEqual(conditions.fromWmo(86), C.SNOW);
assert.strictEqual(conditions.fromWmo(95), C.THUNDERSTORM);
assert.strictEqual(conditions.fromWmo(42), C.UNKNOWN);
assert.strictEqual(conditions.fromWmo(null), C.UNKNOWN);

assert.strictEqual(conditions.fromOpenWeatherMap(211), C.THUNDERSTORM);
assert.strictEqual(conditions.fromOpenWeatherMap(301), C.RAIN);
assert.strictEqual(conditions.fromOpenWeatherMap(502), C.RAIN);
assert.strictEqual(conditions.fromOpenWeatherMap(601), C.SNOW);
assert.strictEqual(conditions.fromOpenWeatherMap(741), C.FOG);
assert.strictEqual(conditions.fromOpenWeatherMap(800), C.CLEAR);
assert.strictEqual(conditions.fromOpenWeatherMap(802), C.PARTLY_CLOUDY);
assert.strictEqual(conditions.fromOpenWeatherMap(804), C.CLOUDY);
assert.strictEqual(conditions.fromOpenWeatherMap('800'), C.UNKNOWN);

assert.strictEqual(conditions.fromWeatherCompany(4), C.THUNDERSTORM);
assert.strictEqual(conditions.fromWeatherCompany(12), C.RAIN);
assert.strictEqual(conditions.fromWeatherCompany(16), C.SNOW);
assert.strictEqual(conditions.fromWeatherCompany(20), C.FOG);
assert.strictEqual(conditions.fromWeatherCompany(26), C.CLOUDY);
assert.strictEqual(conditions.fromWeatherCompany(30), C.PARTLY_CLOUDY);
assert.strictEqual(conditions.fromWeatherCompany(32), C.CLEAR);
assert.strictEqual(conditions.fromWeatherCompany(44), C.UNKNOWN);

assert.strictEqual(conditions.fromYandex('CLEAR'), C.CLEAR);
assert.strictEqual(conditions.fromYandex('OVERCAST'), C.CLOUDY);
assert.strictEqual(conditions.fromYandex('LIGHT_SNOW'), C.SNOW);
assert.strictEqual(conditions.fromYandex('THUNDERSTORM_WITH_HAIL'), C.THUNDERSTORM);
assert.strictEqual(conditions.fromYandex('CLOUDY'), C.PARTLY_CLOUDY);
assert.strictEqual(conditions.fromYandex('SLEET'), C.SNOW);
assert.strictEqual(conditions.fromYandex('HAIL'), C.SNOW);
assert.strictEqual(conditions.fromYandex('SOMETHING_NEW'), C.UNKNOWN);
// Not in the Yandex Condition enum
assert.strictEqual(conditions.fromYandex('DRIZZLE'), C.UNKNOWN);
assert.strictEqual(conditions.fromYandex('WET_SNOW'), C.UNKNOWN);

assert.strictEqual(conditions.normalize(7), C.FOG);
assert.strictEqual(conditions.normalize(8), C.UNKNOWN);
assert.strictEqual(conditions.normalize(undefined), C.UNKNOWN);

const provider = new WeatherProvider();
provider.numEntries = 2;
provider.tempTrend = [50, 51];
provider.precipTrend = [0, 0.5];
provider.uvTrend = [1, 2];
provider.startTime = 1780000000;
provider.currentTemp = 50;
provider.cityName = 'Chicago';
provider.sunEvents = [
  { type: 'sunset', date: new Date(1780010000000) },
  { type: 'sunrise', date: new Date(1780040000000) }
];
assert.strictEqual(provider.getPayload().CONDITION, C.UNKNOWN);
provider.condition = C.SNOW;
assert.strictEqual(provider.getPayload().CONDITION, C.SNOW);

console.log('Condition tests passed');
