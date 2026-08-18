var SAMPLE_INTERVAL_MS = 10 * 60 * 1000;
var MOVEMENT_DISTANCE_KM = 10;
var STATIONARY_RADIUS_KM = 1;
var STATIONARY_MIN_MS = 10 * 60 * 1000;
var REFRESH_ATTEMPT_COOLDOWN_MS = 60 * 60 * 1000;
var MAX_STATIONARY_ACCURACY_METERS = 1000;

/**
 * Convert a candidate value to a finite number.
 *
 * @param {*} value Candidate number.
 * @returns {number|null} Finite number, or null.
 */
function finiteNumber(value) {
    var numeric = typeof value === 'number' ? value : parseFloat(value);

    return isFinite(numeric) ? numeric : null;
}

/**
 * Return the distance between two points in kilometres.
 *
 * @param {number} lat1 First latitude.
 * @param {number} lon1 First longitude.
 * @param {number} lat2 Second latitude.
 * @param {number} lon2 Second longitude.
 * @returns {number} Great-circle distance in kilometres.
 */
function distanceKm(lat1, lon1, lat2, lon2) {
    var earthRadiusKm = 6371;
    var toRadians = Math.PI / 180;
    var deltaLat = (lat2 - lat1) * toRadians;
    var deltaLon = (lon2 - lon1) * toRadians;
    var a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
        + Math.cos(lat1 * toRadians) * Math.cos(lat2 * toRadians)
        * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Normalize one persisted coordinate sample.
 *
 * @param {*} value Candidate sample.
 * @returns {{lat: number, lon: number, accuracy: number|null, time: number}|null} Normalized sample.
 */
function normalizeSample(value) {
    var lat = value ? finiteNumber(value.lat) : null;
    var lon = value ? finiteNumber(value.lon) : null;
    var accuracy = value ? finiteNumber(value.accuracy) : null;
    var time = value ? finiteNumber(value.time) : null;

    if (lat === null || lon === null || time === null) {
        return null;
    }

    return {
        lat: lat,
        lon: lon,
        accuracy: accuracy,
        time: time
    };
}

/**
 * Normalize persisted travel-monitor state.
 *
 * @param {*} value Candidate state.
 * @returns {Object} Safe state object.
 */
function normalizeState(value) {
    var state = value && typeof value === 'object' ? value : {};

    return {
        lastLocationAttemptAt: finiteNumber(state.lastLocationAttemptAt),
        lastSample: normalizeSample(state.lastSample),
        movementDetected: Boolean(state.movementDetected),
        stationary: Boolean(state.stationary),
        lastRefreshAttempt: normalizeSample(state.lastRefreshAttempt)
    };
}

/**
 * Return whether another low-frequency location sample is due.
 *
 * @param {*} state Persisted travel state.
 * @param {number} now Current Unix milliseconds.
 * @returns {boolean} True when GPS may be sampled.
 */
function isSampleDue(state, now) {
    var normalized = normalizeState(state);

    return normalized.lastLocationAttemptAt === null
        || now - normalized.lastLocationAttemptAt >= SAMPLE_INTERVAL_MS;
}

/**
 * Record the start of a location request so failures are also throttled.
 *
 * @param {*} state Persisted travel state.
 * @param {number} now Current Unix milliseconds.
 * @returns {Object} Updated state.
 */
function markSampleAttempt(state, now) {
    var normalized = normalizeState(state);

    normalized.lastLocationAttemptAt = now;
    return normalized;
}

/**
 * Evaluate a travel sample against the coordinates of displayed weather.
 *
 * @param {*} state Persisted travel state.
 * @param {{lat: number, lon: number}} weatherCoordinates Displayed weather point.
 * @param {{lat: number, lon: number, accuracy?: number}} sample Current phone position.
 * @param {number} now Current Unix milliseconds.
 * @returns {Object} Updated state and travel decisions.
 */
function evaluateSample(state, weatherCoordinates, sample, now) {
    var normalized = normalizeState(state);
    var weatherLat = weatherCoordinates ? finiteNumber(weatherCoordinates.lat) : null;
    var weatherLon = weatherCoordinates ? finiteNumber(weatherCoordinates.lon) : null;
    var current = normalizeSample({
        lat: sample && sample.lat,
        lon: sample && sample.lon,
        accuracy: sample && sample.accuracy,
        time: now
    });
    var previous = normalized.lastSample;
    var distanceFromWeather;
    var distanceFromPrevious = null;
    var previousDistanceFromWeather = null;
    var previousIsAccurate;
    var currentIsAccurate;
    var stable = false;
    var refreshAttemptIsNearby = false;
    var refreshAttemptIsRecent = false;
    var movementStarted;
    var stationaryStarted;
    var shouldRefresh;

    // Space successful samples from their callback time, not request start time.
    normalized.lastLocationAttemptAt = now;
    if (weatherLat === null || weatherLon === null || current === null) {
        return {
            state: normalized,
            valid: false,
            reason: 'missing_coordinates'
        };
    }

    distanceFromWeather = distanceKm(weatherLat, weatherLon, current.lat, current.lon);
    movementStarted = distanceFromWeather >= MOVEMENT_DISTANCE_KM && !normalized.movementDetected;

    if (distanceFromWeather < MOVEMENT_DISTANCE_KM) {
        normalized.lastSample = current;
        normalized.movementDetected = false;
        normalized.stationary = false;
        return {
            state: normalized,
            valid: true,
            movementStarted: false,
            stationaryStarted: false,
            shouldRefresh: false,
            distanceFromWeatherKm: distanceFromWeather,
            distanceFromPreviousKm: null
        };
    }

    normalized.movementDetected = true;
    if (previous !== null) {
        distanceFromPrevious = distanceKm(previous.lat, previous.lon, current.lat, current.lon);
        previousDistanceFromWeather = distanceKm(
            weatherLat,
            weatherLon,
            previous.lat,
            previous.lon
        );
        previousIsAccurate = previous.accuracy !== null
            && previous.accuracy <= MAX_STATIONARY_ACCURACY_METERS;
        currentIsAccurate = current.accuracy !== null
            && current.accuracy <= MAX_STATIONARY_ACCURACY_METERS;
        stable = previousDistanceFromWeather >= MOVEMENT_DISTANCE_KM
            && now - previous.time >= STATIONARY_MIN_MS
            && distanceFromPrevious <= STATIONARY_RADIUS_KM
            && previousIsAccurate
            && currentIsAccurate;
    }

    stationaryStarted = stable && !normalized.stationary;
    normalized.stationary = stable;
    if (normalized.lastRefreshAttempt !== null) {
        refreshAttemptIsNearby = distanceKm(
            normalized.lastRefreshAttempt.lat,
            normalized.lastRefreshAttempt.lon,
            current.lat,
            current.lon
        ) < MOVEMENT_DISTANCE_KM;
        refreshAttemptIsRecent = now - normalized.lastRefreshAttempt.time
            < REFRESH_ATTEMPT_COOLDOWN_MS;
    }

    shouldRefresh = stable && !(refreshAttemptIsNearby && refreshAttemptIsRecent);
    if (shouldRefresh) {
        normalized.lastRefreshAttempt = current;
    }
    normalized.lastSample = current;

    return {
        state: normalized,
        valid: true,
        movementStarted: movementStarted,
        stationaryStarted: stationaryStarted,
        shouldRefresh: shouldRefresh,
        distanceFromWeatherKm: distanceFromWeather,
        distanceFromPreviousKm: distanceFromPrevious
    };
}

module.exports = {
    SAMPLE_INTERVAL_MS: SAMPLE_INTERVAL_MS,
    MOVEMENT_DISTANCE_KM: MOVEMENT_DISTANCE_KM,
    STATIONARY_RADIUS_KM: STATIONARY_RADIUS_KM,
    STATIONARY_MIN_MS: STATIONARY_MIN_MS,
    REFRESH_ATTEMPT_COOLDOWN_MS: REFRESH_ATTEMPT_COOLDOWN_MS,
    distanceKm: distanceKm,
    normalizeState: normalizeState,
    isSampleDue: isSampleDue,
    markSampleAttempt: markSampleAttempt,
    evaluateSample: evaluateSample
};
