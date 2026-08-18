#!/usr/bin/env node

const assert = require('assert');
const travelMonitor = require('../src/pkjs/travel-monitor.js');

const minute = 60 * 1000;
const weatherCoordinates = { lat: 55.7558, lon: 37.6173 };
const destination = { lat: 56.0500, lon: 38.0500, accuracy: 50 };
let now = Date.UTC(2026, 7, 18, 10, 0, 0);
let state = travelMonitor.normalizeState(null);

assert.strictEqual(travelMonitor.isSampleDue(state, now), true);
state = travelMonitor.markSampleAttempt(state, now);
assert.strictEqual(travelMonitor.isSampleDue(state, now + 9 * minute), false);
assert.strictEqual(travelMonitor.isSampleDue(state, now + 10 * minute), true);

let result = travelMonitor.evaluateSample(state, weatherCoordinates, destination, now);
assert.strictEqual(result.valid, true);
assert.strictEqual(result.movementStarted, true);
assert.strictEqual(result.stationaryStarted, false);
assert.strictEqual(result.shouldRefresh, false);
assert(result.distanceFromWeatherKm > travelMonitor.MOVEMENT_DISTANCE_KM);

state = result.state;
now += 10 * minute;
result = travelMonitor.evaluateSample(state, weatherCoordinates, {
  lat: destination.lat + 0.001,
  lon: destination.lon + 0.001,
  accuracy: 40
}, now);
assert.strictEqual(result.movementStarted, false);
assert.strictEqual(result.stationaryStarted, true);
assert.strictEqual(result.shouldRefresh, true);
assert(result.distanceFromPreviousKm < travelMonitor.STATIONARY_RADIUS_KM);

state = result.state;
now += 10 * minute;
result = travelMonitor.evaluateSample(state, weatherCoordinates, destination, now);
assert.strictEqual(result.shouldRefresh, false, 'arrival refresh must not repeat within one hour');

state = result.state;
now += 50 * minute;
result = travelMonitor.evaluateSample(state, weatherCoordinates, destination, now);
assert.strictEqual(result.shouldRefresh, true, 'failed arrival refresh may retry after one hour');

state = travelMonitor.normalizeState(null);
now += 10 * minute;
result = travelMonitor.evaluateSample(state, weatherCoordinates, destination, now);
state = result.state;
now += 10 * minute;
result = travelMonitor.evaluateSample(state, weatherCoordinates, {
  lat: destination.lat,
  lon: destination.lon,
  accuracy: 2500
}, now);
assert.strictEqual(result.shouldRefresh, false, 'poor GPS accuracy must not establish stationarity');

state = result.state;
now += 10 * minute;
result = travelMonitor.evaluateSample(state, weatherCoordinates, {
  lat: weatherCoordinates.lat,
  lon: weatherCoordinates.lon,
  accuracy: 25
}, now);
assert.strictEqual(result.state.movementDetected, false);
assert.strictEqual(result.state.stationary, false);
assert.strictEqual(result.shouldRefresh, false);

console.log('Travel monitor tests passed');
