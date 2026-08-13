#!/usr/bin/env node

const assert = require('assert');

const storage = {};
let requestMode = 'success';

global.localStorage = {
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
  },
  setItem(key, value) {
    storage[key] = value;
  },
  removeItem(key) {
    delete storage[key];
  }
};

global.XMLHttpRequest = function XMLHttpRequest() {
  this.status = 0;
  this.responseText = '';
};

global.XMLHttpRequest.prototype.open = function open() {};
global.XMLHttpRequest.prototype.setRequestHeader = function setRequestHeader() {};
global.XMLHttpRequest.prototype.send = function send() {
  if (requestMode === 'success') {
    this.status = 200;
    this.responseText = JSON.stringify({
      address: {
        City: 'Moscow',
        CountryCode: 'RUS'
      }
    });
    this.onload();
    return;
  }

  if (requestMode === 'parse_error') {
    this.status = 200;
    this.responseText = '{invalid';
    this.onload();
    return;
  }

  this.ontimeout();
};

const WeatherProvider = require('../src/pkjs/weather/provider.js');

function makeProvider() {
  const provider = new WeatherProvider();
  provider.warnings = [];
  provider.diagnostics = {};
  return provider;
}

let place;
let provider = makeProvider();
provider.withCityName(55.7558, 37.6173, function(cityName, countryCode) {
  place = { cityName, countryCode };
});
assert.deepStrictEqual(place, { cityName: 'Moscow', countryCode: 'RUS' });
assert.deepStrictEqual(provider.diagnostics.reverseGeocode, { status: 'success' });

requestMode = 'timeout';
provider = makeProvider();
provider.withCityName(55.76, 37.62, function(cityName, countryCode) {
  place = { cityName, countryCode };
});
assert.deepStrictEqual(place, { cityName: 'Moscow', countryCode: 'RUS' });
assert.strictEqual(provider.diagnostics.reverseGeocode.status, 'cached');
assert.deepStrictEqual(provider.warnings.map(function(warning) {
  return warning.code;
}), ['timeout', 'cached_fallback']);

requestMode = 'parse_error';
provider = makeProvider();
provider.withCityName(55.76, 37.62, function(cityName, countryCode) {
  place = { cityName, countryCode };
});
assert.deepStrictEqual(place, { cityName: 'Moscow', countryCode: 'RUS' });
assert.strictEqual(provider.diagnostics.reverseGeocode.error, 'parse_error');

requestMode = 'timeout';
provider = makeProvider();
provider.withCityName(56.9972, 40.9714, function(cityName, countryCode) {
  place = { cityName, countryCode };
});
assert.deepStrictEqual(place, { cityName: 'Unknown', countryCode: null });
assert.strictEqual(provider.diagnostics.reverseGeocode.status, 'unknown');
assert.deepStrictEqual(provider.warnings.map(function(warning) {
  return warning.code;
}), ['timeout', 'unknown_fallback']);

console.log('Provider tests passed');
