
var WundergroundProvider = require('./weather/wunderground.js');
var OpenWeatherMapProvider = require('./weather/openweathermap.js')
var OpenMeteoProvider = require('./weather/openmeteo.js');
var YandexProvider = require('./weather/yandex.js');
var WeatherProvider = require('./weather/provider.js');
var createTelemetryClient = require('./telemetry.js');
var Clay = require('./clay/_source.js');
var clayConfig = require('./clay/config.js');
var customClay = require('./clay/inject.js');
var clayI18n = require('./clay/i18n.js');
var storageKeys = require('./storage-keys.js');
var pkg = require('../../package.json');
var activeFixture = require('./active-fixture.generated.js');
var pebbleColors = require('./pebble-colors.js');
var holidays = require('./holidays.js');
var travelMonitor = require('./travel-monitor.js');
var clay = new Clay(clayConfig, customClay, { autoHandleEvents: false });
/**
 * @type {{
 *     fetchInProgress: boolean,
 *     pendingStartupFetch: boolean,
 *     settings?: Object,
 *     telemetry?: Object,
 *     provider?: Object,
 *     watchInfo?: Object,
 *     devConfig?: Object,
 *     travelLocationInProgress: boolean
 * }}
 */
var app = {};  // Namespace for global app variables
var KEY_FETCH_ATTEMPT = storageKeys.FETCH_ATTEMPT_KEY;
var KEY_FETCH_BACKOFF = storageKeys.FETCH_BACKOFF_KEY;
var KEY_FETCH_BACKOFF_FALLBACK = storageKeys.FETCH_BACKOFF_FALLBACK_KEY;
var KEY_LAST_FETCH_SUCCESS = storageKeys.LAST_FETCH_SUCCESS_KEY;
var KEY_LAST_FETCH_ATTEMPT = storageKeys.LAST_FETCH_ATTEMPT_KEY;
var KEY_LAST_WEATHER_COORDINATES = storageKeys.LAST_WEATHER_COORDINATES_KEY;
var KEY_TRAVEL_MONITOR_STATE = storageKeys.TRAVEL_MONITOR_STATE_KEY;
var KEY_DEBUG_WEATHER_LOG = storageKeys.DEBUG_WEATHER_LOG_KEY;
var KEY_GEOCODE_CACHE = storageKeys.GEOCODE_CACHE_KEY;
var KEY_REVERSE_GEOCODE_CACHE = storageKeys.REVERSE_GEOCODE_CACHE_KEY;
var KEY_GEOCODE_BACKOFF = storageKeys.GEOCODE_BACKOFF_KEY;
var KEY_V1_34_0_WEEKEND_HOLIDAY_COLOR_MIGRATION = 'v1.34.0_weekend_holiday_color_migration';
var KEY_UV_FIXTURE_CLEANUP = 'uv_fixture_cleanup_v1';
var DEFAULT_WEATHER_REFRESH_MINUTES = 30;
var YANDEX_WEATHER_REFRESH_MINUTES = 120;
var OPEN_METEO_WEATHER_REFRESH_MINUTES = 120;
var DEFAULT_FETCH_FAILURE_BACKOFF_MS = 5 * 60 * 1000;
var YANDEX_FETCH_FAILURE_BACKOFF_MS = 60 * 60 * 1000;
var OPEN_METEO_FETCH_FAILURE_BACKOFF_MS = 60 * 60 * 1000;
var BACKOFF_FALLBACK_INTERVAL_MS = 60 * 60 * 1000;
var FETCH_WATCHDOG_MS = 2 * 60 * 1000;
var DEFAULT_COLOR_WHITE = pebbleColors.GColorWhite;
var DEFAULT_COLOR_FOLLY = pebbleColors.GColorFolly;
var DEFAULT_COLOR_YELLOW = pebbleColors.GColorYellow;
var DEFAULT_COLOR_HOLIDAY_2 = pebbleColors.GColorVividCerulean;
var IS_DEBUG_BUILD = pkg.buildProfile === 'debug';
var DEBUG_WEATHER_STATE_NORMAL = 0;
var DEBUG_WEATHER_STATE_OPENMETEO_TEMP = 1;
var DEBUG_WEATHER_STATE_STALE_CACHE = 2;
var DEBUG_STALE_CACHE_MS = 4 * 60 * 60 * 1000;
var DEBUG_LOG_MAX_ENTRIES = 50;
var DEBUG_LOG_MAX_BYTES = 8192;
var DEBUG_LOG_MAX_HOLIDAY_ENTRIES = 20;

app.fetchInProgress = false;
app.fetchStartedAt = 0;
app.pendingStartupFetch = false;
app.travelLocationInProgress = false;

/**
 * Return true when a debug entry belongs to holiday synchronization.
 *
 * @param {Object} entry Debug log entry.
 * @returns {boolean} True for holiday events.
 */
function isHolidayDebugEntry(entry) {
    return Boolean(entry && typeof entry.event === 'string'
        && entry.event.indexOf('holiday_') === 0);
}

/**
 * Remove the oldest holiday entry from a debug log.
 *
 * @param {Object[]} entries Debug log entries.
 * @returns {boolean} True when an entry was removed.
 */
function removeOldestHolidayDebugEntry(entries) {
    var index;

    for (index = 0; index < entries.length; index += 1) {
        if (isHolidayDebugEntry(entries[index])) {
            entries.splice(index, 1);
            return true;
        }
    }

    return false;
}

/**
 * Count holiday synchronization entries in a debug log.
 *
 * @param {Object[]} entries Debug log entries.
 * @returns {number} Holiday entry count.
 */
function countHolidayDebugEntries(entries) {
    var count = 0;

    entries.forEach(function(entry) {
        if (isHolidayDebugEntry(entry)) {
            count += 1;
        }
    });

    return count;
}

Pebble.addEventListener('appmessage', function(e) {
    var payload = e && e.payload;

    if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'WATCH_HAS_FORECAST_DATA')) {
        return;
    }

    var hasForecastData = Boolean(payload.WATCH_HAS_FORECAST_DATA);

    if (hasForecastData) {
        console.log('Watch reported valid forecast data at startup.');
        app.pendingStartupFetch = false;
        return;
    }

    console.log('Watch reported no forecast data at startup.');
    app.pendingStartupFetch = true;

    if (app.provider) {
        app.pendingStartupFetch = false;
        fetch(app.provider, true, false);
    }
});

Pebble.addEventListener('showConfiguration', function(e) {
    var language = getSettingsLanguage();

    clay.config = clayI18n.localizeConfig(clayConfig, language);
    clay.meta.userData.strings = clayI18n.pageStrings(language);
    // Set the userData here rather than in the Clay() constructor so it's actually up to date
    clay.meta.userData.lastFetchSuccess = localStorage.getItem(KEY_LAST_FETCH_SUCCESS);
    clay.meta.userData.lastFetchAttempt = localStorage.getItem(KEY_LAST_FETCH_ATTEMPT);
    clay.meta.userData.debugWeatherLog = localStorage.getItem(KEY_DEBUG_WEATHER_LOG);
    Pebble.openURL(clay.generateUrl());
    console.log('Showing clay: ' + JSON.stringify(getClaySettings()));
});

Pebble.addEventListener('webviewclosed', function(e) {
    if (e && !e.response) {
        return;
    }

    clay.getSettings(e.response, false);  // This triggers the update in localStorage
    app.settings = getClaySettings();  // This reads from localStorage in sensible format
    app.telemetry = createTelemetryClient(getRuntimeTelemetryConfig());
    refreshProvider();
    sendClaySettings();
    holidays.sendHolidayBitsets(app.settings, null, appendDebugWeatherLog);

    // Fetching goes last, after other settings have been handled
    if (app.settings.fetch === true) {
        console.log('Force fetch!');
        fetch(app.provider, true, true);
    }
    console.log('Closing clay: ' + JSON.stringify(getClaySettings()));
});

// Listen for when the watchface is opened
Pebble.addEventListener('ready',
    function (e) {
        var migratedWeekendHolidayColors;
        var hadStoredClaySettings;

        app.devConfig = getDevConfig();
        maybeHandleDevStorageReset(app.devConfig);
        // Remember this before clayTryDefaults() fills an empty store: a phone whose
        // PKJS storage came back empty (fresh install, or the phone app lost it across
        // a restart) must not push freshly written defaults over the settings the
        // watch still holds in its own persistent storage.
        hadStoredClaySettings = localStorage.getItem('clay-settings') !== null;
        clayTryDefaults();
        migratedWeekendHolidayColors = clayTryWeekendHolidayColorMigration(hadStoredClaySettings);
        clayTryDevConfig(app.devConfig);
        clayTryFixtureSettings(activeFixture);
        console.log('PebbleKit JS ready!');
        app.settings = getClaySettings();
        try {
            app.watchInfo = Pebble.getActiveWatchInfo();
        }
        catch (ex) {
            app.watchInfo = null;
            console.log('Unable to read watch info: ' + ex.message);
        }
        app.telemetry = createTelemetryClient(getRuntimeTelemetryConfig());
        refreshProvider();
        if (activeFixture) {
            sendClaySettings(function() {
                holidays.sendHolidayBitsets(app.settings, function() {
                    sendFixtureWeather(activeFixture);
                }, appendDebugWeatherLog);
            }, function() {
                sendFixtureWeather(activeFixture);
            });
            return;
        }
        if (localStorage.getItem(KEY_UV_FIXTURE_CLEANUP) === null) {
            // Replace weather accidentally persisted by an earlier UV dev build
            // that bundled the deterministic Chicago screenshot fixture.
            localStorage.removeItem(KEY_LAST_FETCH_SUCCESS);
            localStorage.setItem(KEY_UV_FIXTURE_CLEANUP, 'complete');
            holidays.sendHolidayBitsets(app.settings, null, appendDebugWeatherLog);
            app.pendingStartupFetch = false;
            fetch(app.provider, true, false);
            startTick();
            return;
        }
        if (migratedWeekendHolidayColors) {
            sendClaySettings(markWeekendHolidayColorMigrationComplete);
        }
        holidays.sendHolidayBitsets(app.settings, null, appendDebugWeatherLog);
        if (app.pendingStartupFetch) {
            app.pendingStartupFetch = false;
            fetch(app.provider, true, false);
        }
        startTick();
    }
);

/**
 * Language for phone-side text: the settings page and place names.
 *
 * @returns {string} Supported language code, e.g. 'en' or 'ru'.
 */
function getSettingsLanguage() {
    var watchInfo = null;
    var settings = app.settings || getClaySettings();

    try {
        watchInfo = Pebble.getActiveWatchInfo();
    }
    catch (ex) {
        watchInfo = null;
    }

    return clayI18n.resolveLanguage(
        settings && settings.locale,
        watchInfo,
        typeof navigator !== 'undefined' ? navigator.language : null
    );
}

/**
 * Build telemetry runtime config from package.json.
 *
 * @returns {{enabled: boolean, endpoint: string, appVersion: string, buildProfile: string}} Runtime telemetry config.
 */
function getRuntimeTelemetryConfig() {
    return {
        enabled: false,
        endpoint: '',
        appVersion: pkg.version,
        buildProfile: pkg.buildProfile
    };
}

/**
 * Optionally edit PKJS localStorage on boot when enabled in dev-config.js.
 *
 * @param {Object} devConfig Developer configuration object.
 * @returns {void}
 */
function maybeHandleDevStorageReset(devConfig) {
    var shouldClear = Boolean(devConfig && devConfig.clearPkjsStorageOnBoot);
    var shouldResetV134WeekendHolidayColorMigration = Boolean(
        devConfig &&
        devConfig.resetV134WeekendHolidayColorMigration
    );

    if (shouldClear) {
        console.log('[dev] clearPkjsStorageOnBoot=true, clearing localStorage');
        localStorage.clear();
    }

    if (shouldResetV134WeekendHolidayColorMigration) {
        console.log('[dev] resetV134WeekendHolidayColorMigration=true, clearing migration marker');
        localStorage.removeItem(KEY_V1_34_0_WEEKEND_HOLIDAY_COLOR_MIGRATION);
    }
}

/**
 * Read the persisted weather fetch attempt counter.
 *
 * @returns {number} Non-negative integer attempt counter.
 */
function getFetchAttemptCounter() {
    var raw = localStorage.getItem(KEY_FETCH_ATTEMPT);
    var parsed = Number(raw);

    if (!isFinite(parsed) || parsed < 0) {
        return 0;
    }

    return Math.floor(parsed);
}

/**
 * Increment and persist the weather fetch attempt counter.
 *
 * @returns {number} New attempt number after increment.
 */
function incrementFetchAttemptCounter() {
    var nextAttempt = getFetchAttemptCounter() + 1;
    localStorage.setItem(KEY_FETCH_ATTEMPT, String(nextAttempt));
    return nextAttempt;
}

/**
 * Reset the weather fetch attempt counter after success.
 *
 * @returns {void}
 */
function resetFetchAttemptCounter() {
    localStorage.setItem(KEY_FETCH_ATTEMPT, '0');
}

/**
 * Read all provider fetch cooldowns from localStorage.
 *
 * @returns {Object} Fetch cooldown map.
 */
function readFetchBackoffMap() {
    var raw = localStorage.getItem(KEY_FETCH_BACKOFF);
    var parsed;

    if (raw === null) {
        return {};
    }

    try {
        parsed = JSON.parse(raw);
    }
    catch (ex) {
        localStorage.removeItem(KEY_FETCH_BACKOFF);
        return {};
    }

    return parsed && typeof parsed === 'object' ? parsed : {};
}

/**
 * Return the active cooldown record for a provider.
 *
 * @param {string} providerId Weather provider id.
 * @returns {{until: number, reason: string}|null} Cooldown record, or null when inactive.
 */
function getActiveFetchBackoff(providerId) {
    var backoffMap = readFetchBackoffMap();
    var record = backoffMap[providerId];

    if (!record || typeof record.until !== 'number') {
        return null;
    }

    if (Date.now() >= record.until) {
        delete backoffMap[providerId];
        localStorage.setItem(KEY_FETCH_BACKOFF, JSON.stringify(backoffMap));
        return null;
    }

    return record;
}

/**
 * Clear a provider fetch cooldown after success or explicit force refresh.
 *
 * @param {string} providerId Weather provider id.
 * @returns {void}
 */
function clearFetchBackoff(providerId) {
    var backoffMap = readFetchBackoffMap();

    if (Object.prototype.hasOwnProperty.call(backoffMap, providerId)) {
        delete backoffMap[providerId];
        localStorage.setItem(KEY_FETCH_BACKOFF, JSON.stringify(backoffMap));
    }
}

/**
 * Read timestamps of cache-only attempts made during provider cooldowns.
 *
 * @returns {Object} Provider-to-timestamp map.
 */
function readBackoffFallbackMap() {
    var raw = localStorage.getItem(KEY_FETCH_BACKOFF_FALLBACK);
    var parsed;

    if (raw === null) {
        return {};
    }

    try {
        parsed = JSON.parse(raw);
    }
    catch (ex) {
        localStorage.removeItem(KEY_FETCH_BACKOFF_FALLBACK);
        return {};
    }

    return parsed && typeof parsed === 'object' ? parsed : {};
}

/**
 * Record a cache-only attempt so the one-minute scheduler cannot repeat it.
 *
 * @param {string} providerId Weather provider id.
 * @returns {void}
 */
function markBackoffFallbackAttempt(providerId) {
    var fallbackMap = readBackoffFallbackMap();

    fallbackMap[providerId] = Date.now();
    localStorage.setItem(KEY_FETCH_BACKOFF_FALLBACK, JSON.stringify(fallbackMap));
}

/**
 * Return whether cached data may be re-aligned during an active cooldown.
 *
 * @param {string} providerId Weather provider id.
 * @returns {boolean} True at most once per hour.
 */
function canAttemptBackoffFallback(providerId) {
    var fallbackMap = readBackoffFallbackMap();
    var lastAttempt = Number(fallbackMap[providerId]);

    return !isFinite(lastAttempt) || Date.now() - lastAttempt >= BACKOFF_FALLBACK_INTERVAL_MS;
}

/**
 * Return the cooldown duration after a failed weather fetch.
 *
 * @param {Object} provider Weather provider instance.
 * @returns {number} Cooldown duration in milliseconds.
 */
function getFailureBackoffMs(provider) {
    if (provider && provider.id === 'yandex') {
        return YANDEX_FETCH_FAILURE_BACKOFF_MS;
    }
    if (provider && provider.id === 'openmeteo') {
        return OPEN_METEO_FETCH_FAILURE_BACKOFF_MS;
    }

    return DEFAULT_FETCH_FAILURE_BACKOFF_MS;
}

/**
 * Persist a fetch cooldown after provider failure.
 *
 * @param {Object} provider Weather provider instance.
 * @param {{stage: string, code: string}} failure Fetch failure object.
 * @returns {{until: number, durationMs: number, reason: string}} Stored cooldown record.
 */
function writeFetchBackoff(provider, failure) {
    var providerId = provider && provider.id ? provider.id : 'unknown';
    var durationMs = getFailureBackoffMs(provider);
    var backoffMap = readFetchBackoffMap();
    var record = {
        until: Date.now() + durationMs,
        durationMs: durationMs,
        reason: failure && failure.code ? failure.code : 'unknown_error'
    };

    backoffMap[providerId] = record;
    localStorage.setItem(KEY_FETCH_BACKOFF, JSON.stringify(backoffMap));

    return record;
}

/**
 * Append a copy-friendly weather diagnostic entry in debug builds.
 *
 * @param {string} event Event name.
 * @param {Object=} details Small JSON-safe details object.
 * @returns {void}
 */
function appendDebugWeatherLog(event, details) {
    var entries;
    var raw;

    if (!IS_DEBUG_BUILD) {
        return;
    }

    raw = localStorage.getItem(KEY_DEBUG_WEATHER_LOG);
    try {
        entries = raw ? JSON.parse(raw) : [];
    }
    catch (ex) {
        entries = [];
    }

    if (!Array.isArray(entries)) {
        entries = [];
    }

    entries.push({
        time: new Date().toISOString(),
        event: event,
        details: details || {}
    });

    while (countHolidayDebugEntries(entries) > DEBUG_LOG_MAX_HOLIDAY_ENTRIES) {
        removeOldestHolidayDebugEntry(entries);
    }

    while (entries.length > DEBUG_LOG_MAX_ENTRIES) {
        entries.shift();
    }

    raw = JSON.stringify(entries);
    while (raw.length > DEBUG_LOG_MAX_BYTES && entries.length > 1) {
        if (!removeOldestHolidayDebugEntry(entries)) {
            entries.shift();
        }
        raw = JSON.stringify(entries);
    }

    localStorage.setItem(KEY_DEBUG_WEATHER_LOG, raw);
}

/**
 * Show or clear debug weather indicators on the watch.
 *
 * @param {boolean} hasError True when the debug marker should be visible.
 * @param {number} weatherState Debug weather source/state indicator.
 * @returns {void}
 */
function sendDebugWeatherStatus(hasError, weatherState) {
    var payload;

    if (!IS_DEBUG_BUILD) {
        return;
    }

    payload = {
        DEBUG_FETCH_ERROR: hasError ? 1 : 0,
        DEBUG_WEATHER_STATE: weatherState || DEBUG_WEATHER_STATE_NORMAL
    };

    Pebble.sendAppMessage(payload, function() {
        console.log('[debug] Fetch error marker sent: ' + JSON.stringify(payload));
    }, function(e) {
        console.log('[debug] Fetch error marker failed: ' + JSON.stringify(e));
        appendDebugWeatherLog('debug_weather_status_send_failed', e || {});
    });
}

/**
 * Return provider warnings recorded during an otherwise successful fetch.
 *
 * @param {Object} provider Weather provider instance.
 * @returns {Object[]} Warning list.
 */
function getProviderWarnings(provider) {
    if (!provider || !Array.isArray(provider.warnings)) {
        return [];
    }

    return provider.warnings.slice(0);
}

/**
 * Return provider-specific diagnostic details for debug logs.
 *
 * @param {Object} provider Weather provider instance.
 * @returns {Object} Diagnostic details.
 */
function getProviderDiagnostics(provider) {
    if (!provider || !provider.diagnostics || typeof provider.diagnostics !== 'object') {
        return {};
    }

    return provider.diagnostics;
}

/**
 * Return true when an ISO timestamp is older than the debug stale-cache threshold.
 *
 * @param {string|null} fetchedAtUtc Cache timestamp.
 * @returns {boolean}
 */
function isDebugCacheTimestampStale(fetchedAtUtc) {
    var timestamp;

    if (typeof fetchedAtUtc !== 'string' || fetchedAtUtc === '') {
        return false;
    }

    timestamp = new Date(fetchedAtUtc).getTime();
    return isFinite(timestamp) && Date.now() - timestamp > DEBUG_STALE_CACHE_MS;
}

/**
 * Compute the debug time-color state from provider diagnostics.
 *
 * @param {Object} diagnostics Provider diagnostics.
 * @returns {number} Debug weather state.
 */
function getDebugWeatherState(diagnostics) {
    var cache = diagnostics && diagnostics.cache ? diagnostics.cache : {};
    var source = typeof cache.source === 'string' ? cache.source : '';
    var usesCache = source.indexOf('cache') !== -1
        || Boolean(diagnostics && diagnostics.openMeteo && diagnostics.openMeteo.cachedSupplement);
    var staleCache = usesCache && (
        isDebugCacheTimestampStale(cache.primaryFetchedAtUtc)
        || isDebugCacheTimestampStale(cache.supplementFetchedAtUtc)
        || isDebugCacheTimestampStale(cache.yandexFetchedAtUtc)
        || isDebugCacheTimestampStale(cache.openMeteoFetchedAtUtc)
    );

    if (staleCache) {
        return DEBUG_WEATHER_STATE_STALE_CACHE;
    }

    if (source === 'openmeteo' || source === 'openmeteo_cache') {
        return DEBUG_WEATHER_STATE_OPENMETEO_TEMP;
    }

    return DEBUG_WEATHER_STATE_NORMAL;
}

/**
 * Read one JSON value from localStorage without propagating parse failures.
 *
 * @param {string} key Storage key.
 * @returns {*} Parsed value, or null.
 */
function readStoredJson(key) {
    var raw = localStorage.getItem(key);

    if (raw === null) {
        return null;
    }

    try {
        return JSON.parse(raw);
    }
    catch (ex) {
        localStorage.removeItem(key);
        return null;
    }
}

/**
 * Persist the coordinates represented by a successful weather payload.
 *
 * @param {Object} provider Active weather provider.
 * @returns {{lat: number, lon: number}|null} Stored coordinates.
 */
function persistLastWeatherCoordinates(provider) {
    var coordinates = provider && provider.weatherCoordinates
        ? provider.weatherCoordinates
        : provider && provider.requestCoordinates;
    var lat = coordinates ? Number(coordinates.lat) : NaN;
    var lon = coordinates ? Number(coordinates.lon) : NaN;

    if (!isFinite(lat) || !isFinite(lon)) {
        return null;
    }

    localStorage.setItem(KEY_LAST_WEATHER_COORDINATES, JSON.stringify({
        lat: lat,
        lon: lon,
        provider: provider.id,
        updatedAtUtc: new Date().toISOString()
    }));
    return { lat: lat, lon: lon };
}

/**
 * Clear travel state once displayed weather belongs to the sampled location.
 *
 * @param {{lat: number, lon: number}|null} weatherCoordinates Displayed weather point.
 * @returns {void}
 */
function reconcileTravelStateAfterSuccess(weatherCoordinates) {
    var state = travelMonitor.normalizeState(readStoredJson(KEY_TRAVEL_MONITOR_STATE));
    var sample = state.lastSample;

    if (!weatherCoordinates || !sample) {
        return;
    }
    if (travelMonitor.distanceKm(
        weatherCoordinates.lat,
        weatherCoordinates.lon,
        sample.lat,
        sample.lon
    ) >= travelMonitor.MOVEMENT_DISTANCE_KM) {
        return;
    }

    state.movementDetected = false;
    state.stationary = false;
    state.lastRefreshAttempt = null;
    localStorage.setItem(KEY_TRAVEL_MONITOR_STATE, JSON.stringify(state));
}

/**
 * Return whether an arrival refresh may bypass an active provider cooldown.
 *
 * @param {Object|null} backoff Active cooldown record.
 * @returns {boolean} True only for transient connectivity failures.
 */
function canTravelRefreshBypassBackoff(backoff) {
    var reason = backoff && typeof backoff.reason === 'string' ? backoff.reason : '';

    return reason.indexOf('timeout') !== -1 || reason.indexOf('network_error') !== -1;
}

/**
 * Round a debug distance without adding noisy precision to the copyable log.
 *
 * @param {number|null} distance Distance in kilometres.
 * @returns {number|null} Distance rounded to one decimal place.
 */
function debugDistance(distance) {
    return typeof distance === 'number' && isFinite(distance)
        ? Math.round(distance * 10) / 10
        : null;
}

/**
 * Sample low-accuracy GPS periodically and refresh weather after arrival.
 *
 * @returns {void}
 */
function maybeMonitorTravel() {
    var now = Date.now();
    var state;

    if (activeFixture || !app.settings || app.settings.location || app.fetchInProgress
        || app.travelLocationInProgress || !isWatchConnected()
        || !navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== 'function') {
        return;
    }

    state = travelMonitor.normalizeState(readStoredJson(KEY_TRAVEL_MONITOR_STATE));
    if (!travelMonitor.isSampleDue(state, now)) {
        return;
    }

    state = travelMonitor.markSampleAttempt(state, now);
    localStorage.setItem(KEY_TRAVEL_MONITOR_STATE, JSON.stringify(state));
    app.travelLocationInProgress = true;
    navigator.geolocation.getCurrentPosition(function(position) {
        var currentState;
        var weatherCoordinates;
        var sample;
        var result;
        var activeBackoff;
        var bypassBackoff;
        var fetchStarted;

        app.travelLocationInProgress = false;
        currentState = travelMonitor.normalizeState(readStoredJson(KEY_TRAVEL_MONITOR_STATE));
        weatherCoordinates = readStoredJson(KEY_LAST_WEATHER_COORDINATES);
        sample = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracy: position.coords.accuracy
        };
        result = travelMonitor.evaluateSample(
            currentState,
            weatherCoordinates,
            sample,
            Date.now()
        );
        localStorage.setItem(KEY_TRAVEL_MONITOR_STATE, JSON.stringify(result.state));

        appendDebugWeatherLog('travel_location_sample', {
            valid: result.valid,
            reason: result.reason || null,
            accuracyMeters: Math.round(position.coords.accuracy),
            distanceFromWeatherKm: debugDistance(result.distanceFromWeatherKm),
            distanceFromPreviousKm: debugDistance(result.distanceFromPreviousKm),
            movementDetected: Boolean(result.state.movementDetected),
            stationary: Boolean(result.state.stationary)
        });
        if (result.movementStarted) {
            appendDebugWeatherLog('travel_movement_detected', {
                distanceFromWeatherKm: debugDistance(result.distanceFromWeatherKm)
            });
        }
        if (result.stationaryStarted) {
            appendDebugWeatherLog('travel_stationary', {
                distanceFromWeatherKm: debugDistance(result.distanceFromWeatherKm),
                distanceFromPreviousKm: debugDistance(result.distanceFromPreviousKm)
            });
        }
        if (!result.shouldRefresh) {
            return;
        }

        activeBackoff = getActiveFetchBackoff(app.provider.id);
        bypassBackoff = activeBackoff !== null && canTravelRefreshBypassBackoff(activeBackoff);
        if (activeBackoff !== null && !bypassBackoff) {
            appendDebugWeatherLog('travel_refresh_deferred', {
                provider: app.provider.id,
                reason: activeBackoff.reason,
                until: new Date(activeBackoff.until).toISOString()
            });
            return;
        }

        appendDebugWeatherLog('travel_refresh_triggered', {
            provider: app.provider.id,
            distanceFromWeatherKm: debugDistance(result.distanceFromWeatherKm),
            bypassedTransientBackoff: bypassBackoff
        });
        fetchStarted = fetch(app.provider, false, bypassBackoff, 'travel_arrival');
        if (!fetchStarted) {
            appendDebugWeatherLog('travel_refresh_not_started', {
                provider: app.provider.id
            });
        }
    }, function(error) {
        app.travelLocationInProgress = false;
        appendDebugWeatherLog('travel_location_failed', {
            code: error && error.code,
            message: error && error.message
        });
    }, {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000,
        timeout: 10 * 1000
    });
}

function startTick() {
    console.log('Tick from PKJS!');
    // Scheduled first so an exception below cannot end the loop.
    setTimeout(startTick, 60 * 1000); // 60 * 1000 milsec = 1 minute
    try {
        tryFetch(app.provider);
        maybeMonitorTravel();
    }
    catch (ex) {
        console.log('[!] Tick failed: ' + ex.message);
    }
}

function sendClaySettings(onSuccess, onFailure) {
    var holidaySet1 = normalizeHolidaySetId(app.settings.holidaySet1);
    var holidaySet2 = normalizeHolidaySetId(app.settings.holidaySet2);
    var payload = {
        "CLAY_CELSIUS": app.settings.temperatureUnits === 'c',
        "CLAY_TIME_LEAD_ZERO": app.settings.timeLeadingZero,
        "CLAY_AXIS_12H": app.settings.axisTimeFormat === '12h',
        "CLAY_COLOR_TODAY": app.settings.hasOwnProperty('colorToday') ? app.settings.colorToday : DEFAULT_COLOR_WHITE,
        "CLAY_START_MON": app.settings.weekStartDay === 'mon',
        "CLAY_PREV_WEEK": app.settings.firstWeek === 'prev',
        "CLAY_FACE_THEME": app.settings.faceTheme === 'light' ? 1 : 0,
        "CLAY_WEATHER_TIME": app.settings.weatherTime === 'updated' ? 1 : 0,
        "CLAY_LOCALE": ['auto', 'en', 'ru'].indexOf(app.settings.locale) > 0
            ? ['auto', 'en', 'ru'].indexOf(app.settings.locale)
            : 0,
        "CLAY_TIME_FONT": ['roboto', 'leco', 'bitham'].indexOf(app.settings.timeFont),
        "CLAY_SHOW_QT": app.settings.showQt,
        "CLAY_SHOW_BT": app.settings.btIcons === "connected" || app.settings.btIcons === "both",
        "CLAY_SHOW_BT_DISCONNECT": app.settings.btIcons === "disconnected" || app.settings.btIcons === "both",
        "CLAY_VIBE": app.settings.vibe,
        "CLAY_SHOW_AM_PM": app.settings.timeShowAmPm,
        "CLAY_COLOR_SUNDAY": app.settings.hasOwnProperty('colorSunday') ? app.settings.colorSunday : DEFAULT_COLOR_FOLLY,
        "CLAY_COLOR_SATURDAY": app.settings.hasOwnProperty('colorSaturday') ? app.settings.colorSaturday : DEFAULT_COLOR_FOLLY,
        "CLAY_COLOR_US_FEDERAL": app.settings.hasOwnProperty('colorUSFederal') ? app.settings.colorUSFederal : DEFAULT_COLOR_FOLLY,
        "CLAY_HOLIDAY_SET_1": holidaySet1,
        "CLAY_HOLIDAY_SET_2": holidaySet2,
        "CLAY_COLOR_HOLIDAY_1": app.settings.hasOwnProperty('colorHoliday1') ? app.settings.colorHoliday1 : DEFAULT_COLOR_FOLLY,
        "CLAY_COLOR_HOLIDAY_2": app.settings.hasOwnProperty('colorHoliday2') ? app.settings.colorHoliday2 : DEFAULT_COLOR_HOLIDAY_2,
        "CLAY_COLOR_TIME": app.settings.hasOwnProperty('colorTime') ? app.settings.colorTime : DEFAULT_COLOR_WHITE,
        "CLAY_DAY_NIGHT_SHADING": app.settings.hasOwnProperty('dayNightShading') ? app.settings.dayNightShading : true,
        "CLAY_SHOW_FEELS_LIKE": app.settings.hasOwnProperty('showFeelsLike') ? app.settings.showFeelsLike : false,
        "CLAY_COLOR_FEELS_LIKE": app.settings.hasOwnProperty('colorFeelsLike') ? app.settings.colorFeelsLike : DEFAULT_COLOR_YELLOW,
    }
    Pebble.sendAppMessage(payload, function() {
        console.log('Message sent successfully: ' + JSON.stringify(payload));
        if (typeof onSuccess === 'function') {
            onSuccess();
        }
    }, function(e) {
        console.log('Message failed: ' + JSON.stringify(e));
        if (typeof onFailure === 'function') {
            onFailure(e);
        }
    });
}

/**
 * Normalize holiday set settings stored by Clay selects into numeric IDs.
 *
 * @param {*} value Clay setting value.
 * @returns {number} Holiday set ID.
 */
function normalizeHolidaySetId(value) {
    var parsed = typeof value === 'number' ? value : parseInt(value, 10);

    if (
        parsed === holidays.HOLIDAY_SET_NONE ||
        parsed === holidays.HOLIDAY_SET_US ||
        parsed === holidays.HOLIDAY_SET_RU ||
        parsed === holidays.HOLIDAY_SET_ES_NATIONAL ||
        parsed === holidays.HOLIDAY_SET_ES_CATALONIA ||
        parsed === holidays.HOLIDAY_SET_RU_PRODUCTION
    ) {
        return parsed;
    }

    return holidays.HOLIDAY_SET_NONE;
}

function refreshProvider() {
    var oldLocation = app.provider ? app.provider.location : null;
    setProvider(app.settings.provider);
    app.provider.location = app.settings.location === '' ? null : app.settings.location;
    app.provider.geocodeLanguage = getSettingsLanguage().toUpperCase();

    // Clear geocode cache when location changes so a fresh lookup always happens
    if (oldLocation !== app.provider.location) {
        localStorage.removeItem(KEY_GEOCODE_CACHE);
        localStorage.removeItem(KEY_REVERSE_GEOCODE_CACHE);
        localStorage.removeItem(KEY_GEOCODE_BACKOFF);
    }
}

function setProvider(providerId) {
    switch (providerId) {
        case 'openweathermap':
            app.provider = new OpenWeatherMapProvider(app.settings.owmApiKey);
            break;
        case 'openmeteo':
            app.provider = new OpenMeteoProvider();
            break;
        case 'yandex':
            app.provider = new YandexProvider(app.settings.yandexApiKey);
            break;
        case 'wunderground':
            app.provider = new WundergroundProvider();
            break;
        default:
            console.log('Unknown provider: "' + providerId + '", defaulting to wunderground');
            clay.setSettings("provider", "wunderground");
            app.provider = new WundergroundProvider();
    }
    console.log('Set provider: ' + app.provider.name);
}

function clayTryDefaults() {
    /* Clay only considers `defaultValue` upon first startup, but we need
     * defaults set even if the user has not made a custom config
     */
    var persistClayString = localStorage.getItem('clay-settings');
    var defaults = getDefaultClaySettings();
    var persistClay;
    var prop;
    if (persistClayString === null) {
        console.log('No clay settings found, setting defaults');
        applyRegionalDefaults(defaults, getSettingsLanguage());
        localStorage.setItem('clay-settings', JSON.stringify(defaults));
        return;
    }

    try {
        persistClay = JSON.parse(persistClayString);
    }
    catch (ex) {
        console.log('Malformed clay settings found, resetting defaults');
        localStorage.setItem('clay-settings', JSON.stringify(defaults));
        return;
    }

    for (prop in defaults) {
        if (
            Object.prototype.hasOwnProperty.call(defaults, prop) &&
            !Object.prototype.hasOwnProperty.call(persistClay, prop)
        ) {
            if (prop === 'colorHoliday1' && Object.prototype.hasOwnProperty.call(persistClay, 'colorUSFederal')) {
                persistClay[prop] = persistClay.colorUSFederal;
            }
            else {
                persistClay[prop] = defaults[prop];
            }
        }
    }
    localStorage.setItem('clay-settings', JSON.stringify(persistClay));

}

/**
 * Get the full Clay settings defaults needed to send a complete config payload.
 *
 * @returns {Object} Default Clay-compatible settings.
 */
function getDefaultClaySettings() {
    return {
        provider: 'wunderground',
        owmApiKey: '',
        yandexApiKey: '',
        fetch: false,
        location: '',
        temperatureUnits: 'f',
        dayNightShading: true,
        showFeelsLike: false,
        colorFeelsLike: DEFAULT_COLOR_YELLOW,
        timeLeadingZero: false,
        timeShowAmPm: false,
        axisTimeFormat: '24h',
        timeFont: 'roboto',
        colorTime: DEFAULT_COLOR_WHITE,
        weekStartDay: 'sun',
        firstWeek: 'prev',
        faceTheme: 'dark',
        locale: 'auto',
        weatherTime: 'sun',
        colorToday: 0,
        colorSunday: DEFAULT_COLOR_FOLLY,
        colorSaturday: DEFAULT_COLOR_FOLLY,
        colorUSFederal: DEFAULT_COLOR_FOLLY,
        holidaySet1: String(holidays.HOLIDAY_SET_US),
        holidaySet2: String(holidays.HOLIDAY_SET_NONE),
        colorHoliday1: DEFAULT_COLOR_FOLLY,
        colorHoliday2: DEFAULT_COLOR_HOLIDAY_2,
        showQt: true,
        vibe: false,
        btIcons: 'both'
    };
}

/**
 * Adjust fresh-install defaults to the face language.
 *
 * @param {Object} defaults Defaults from getDefaultClaySettings(), modified in place.
 * @param {string} language Language code from getSettingsLanguage().
 * @returns {Object} The same defaults object.
 */
function applyRegionalDefaults(defaults, language) {
    if (language === 'ru') {
        defaults.temperatureUnits = 'c';
        defaults.weekStartDay = 'mon';
        defaults.holidaySet1 = String(holidays.HOLIDAY_SET_RU_PRODUCTION);
    }
    return defaults;
}

/**
 * Move existing installs from the old all-white weekend/holiday defaults to the
 * current highlighted default while preserving any customized color set.
 *
 * @param {boolean} hadStoredClaySettings False when the phone had no stored clay settings before this boot.
 * @returns {boolean} True when the migrated settings should be sent to the watch.
 */
function clayTryWeekendHolidayColorMigration(hadStoredClaySettings) {
    var persistClayString = localStorage.getItem('clay-settings');
    var persistClay;

    if (
        persistClayString === null ||
        localStorage.getItem(KEY_V1_34_0_WEEKEND_HOLIDAY_COLOR_MIGRATION) !== null
    ) {
        return false;
    }

    if (hadStoredClaySettings === false) {
        // clayTryDefaults() has just written the current defaults, which already carry
        // the migrated colors. There is nothing to migrate, and sending these defaults
        // would overwrite whatever the watch has persisted (see the 'ready' handler).
        console.log('No stored clay settings on the phone; keeping the settings saved on the watch');
        markWeekendHolidayColorMigrationComplete();
        return false;
    }

    try {
        persistClay = JSON.parse(persistClayString);
    }
    catch (ex) {
        console.log('Malformed clay settings found, skipping weekend/holiday color migration');
        return false;
    }

    if (
        persistClay.colorSunday === DEFAULT_COLOR_WHITE &&
        persistClay.colorSaturday === DEFAULT_COLOR_WHITE &&
        persistClay.colorUSFederal === DEFAULT_COLOR_WHITE
    ) {
        persistClay.colorSunday = DEFAULT_COLOR_FOLLY;
        persistClay.colorSaturday = DEFAULT_COLOR_FOLLY;
        persistClay.colorUSFederal = DEFAULT_COLOR_FOLLY;
        persistClay.colorHoliday1 = DEFAULT_COLOR_FOLLY;
        localStorage.setItem('clay-settings', JSON.stringify(persistClay));
        console.log('Migrated weekend/holiday color defaults to Folly');
        return true;
    }

    if (
        persistClay.colorSunday === DEFAULT_COLOR_FOLLY &&
        persistClay.colorSaturday === DEFAULT_COLOR_FOLLY &&
        persistClay.colorUSFederal === DEFAULT_COLOR_FOLLY
    ) {
        return true;
    }

    markWeekendHolidayColorMigrationComplete();
    return false;
}

/**
 * Mark the v1.34.0 weekend/holiday color migration as complete.
 *
 * @returns {void}
 */
function markWeekendHolidayColorMigrationComplete() {
    localStorage.setItem(KEY_V1_34_0_WEEKEND_HOLIDAY_COLOR_MIGRATION, '1');
}

function getDevConfig() {
    try {
        return require('./dev-config.js');
    }
    catch (ex) {
        console.log('No developer configuration file found');
        return {};
    }
}

function clayTryDevConfig(devConfig) {
    /* Use values from a dev-config.js file to configure clay settings
     * by iterating over the exported properties
     */
    var persistClay;
    var prop;

    var localOnlyDevConfigKeys = {
        clearPkjsStorageOnBoot: true,
        resetV134WeekendHolidayColorMigration: true,
    };

    persistClay = getClaySettings();
    for (prop in devConfig) {
        if (Object.prototype.hasOwnProperty.call(devConfig, prop)) {
            if (Object.prototype.hasOwnProperty.call(localOnlyDevConfigKeys, prop)) {
                console.log('Found local-only dev setting: ' + prop);
                continue;
            }
            persistClay[prop] = devConfig[prop];
            console.log('Found dev setting: ' + prop + '=' + devConfig[prop]);
        }
    }
    localStorage.setItem('clay-settings', JSON.stringify(persistClay));
}

/**
 * Apply Clay-compatible settings from the active fixture.
 *
 * @param {Object|null} fixture Active fixture, or null when fixtures are disabled.
 * @returns {void}
 */
function clayTryFixtureSettings(fixture) {
    var persistClay;
    var settings;
    var prop;

    if (!fixture || !fixture.claySettings || typeof fixture.claySettings !== 'object' || Array.isArray(fixture.claySettings)) {
        return;
    }

    settings = fixture.claySettings;
    persistClay = getClaySettings();
    for (prop in settings) {
        if (Object.prototype.hasOwnProperty.call(settings, prop)) {
            persistClay[prop] = normalizeFixtureSetting(prop, settings[prop]);
        }
    }
    localStorage.setItem('clay-settings', JSON.stringify(persistClay));
}

/**
 * Normalize fixture settings into the same shape Clay stores locally.
 *
 * @param {string} key Clay setting key.
 * @param {*} value Fixture setting value.
 * @returns {*} Normalized setting value.
 */
function normalizeFixtureSetting(key, value) {
    if (isColorSettingKey(key)) {
        return normalizeFixtureColor(value);
    }

    return value;
}

/**
 * Determine whether a Clay setting is a color value.
 *
 * @param {string} key Clay setting key.
 * @returns {boolean} True for color settings.
 */
function isColorSettingKey(key) {
    return key === 'colorTime' ||
        key === 'colorToday' ||
        key === 'colorSunday' ||
        key === 'colorSaturday' ||
        key === 'colorUSFederal' ||
        key === 'colorHoliday1' ||
        key === 'colorHoliday2' ||
        key === 'colorFeelsLike';
}

/**
 * Normalize fixture colors from SDK color constant names.
 *
 * @param {*} value Fixture color value.
 * @returns {number} Clay-compatible RGB integer.
 */
function normalizeFixtureColor(value) {
    if (typeof value === 'string') {
        if (Object.prototype.hasOwnProperty.call(pebbleColors, value)) {
            return pebbleColors[value];
        }
    }

    return value;
}

function getClaySettings() {
    return JSON.parse(localStorage.getItem('clay-settings'));
}

/**
 * Determine whether a watch is currently connected.
 *
 * @returns {boolean} True when a watch is connected.
 */
function isWatchConnected() {
    try {
        return Boolean(Pebble.getActiveWatchInfo());
    }
    catch (ex) {
        console.log('Unable to read active watch info: ' + ex.message);
        return false;
    }
}

/**
 * Convert a fixture weather object into the real watch weather AppMessage payload.
 *
 * @param {Object} fixture Active fixture loaded from fixtures/<name>.json.
 * @returns {Object|null} Pebble weather payload, or null when invalid.
 */
function getFixtureWeatherPayload(fixture) {
    var weather;
    var provider;
    var sunEvents;

    if (!fixture || typeof fixture !== 'object') {
        return null;
    }

    weather = fixture.weather;
    if (!weather || typeof weather !== 'object') {
        console.log('[fixture] Missing weather block');
        return null;
    }

    sunEvents = Array.isArray(weather.sunEvents) ? weather.sunEvents.map(function(event) {
        return {
            type: event.type,
            date: new Date(event.epoch * 1000)
        };
    }) : [];

    provider = new WeatherProvider();
    provider.name = 'Fixture';
    provider.id = 'fixture';
    provider.numEntries = Array.isArray(weather.temps) ? weather.temps.length : 0;
    provider.cityName = weather.city || 'Fixture City';
    provider.currentTemp = weather.currentTemp;
    provider.startTime = weather.startEpoch;
    provider.tempTrend = Array.isArray(weather.temps) ? weather.temps.slice(0) : [];
    provider.precipTrend = Array.isArray(weather.precipPct) ? weather.precipPct.map(function(probabilityPercent) {
        return probabilityPercent / 100.0;
    }) : [];
    provider.uvTrend = Array.isArray(weather.uvIndex) ? weather.uvIndex.slice(0) : [];
    provider.sunEvents = sunEvents;
    provider.condition = typeof weather.condition === 'number' ? weather.condition : 0;

    if (provider.numEntries <= 0 || sunEvents.length < 2 || !provider.hasValidData()) {
        console.log('[fixture] Invalid weather data in fixture ' + (fixture.name || '(unknown)'));
        return null;
    }

    return provider.getPayload();
}

/**
 * Send fixture weather directly to the watch, bypassing live provider fetch logic.
 *
 * @param {Object} fixture Active fixture loaded from fixtures/<name>.json.
 * @returns {void}
 */
function sendFixtureWeather(fixture) {
    var payload = getFixtureWeatherPayload(fixture);

    if (!payload) {
        return;
    }

    console.log('[fixture] Sending weather fixture: ' + (fixture.name || '(unknown)'));
    Pebble.sendAppMessage(payload, function() {
        console.log('[fixture] Weather fixture sent successfully');
        sendDebugWeatherStatus(false, DEBUG_WEATHER_STATE_NORMAL);
    }, function(e) {
        console.log('[fixture] Weather fixture failed: ' + JSON.stringify(e));
        appendDebugWeatherLog('fixture_weather_send_failed', e || {});
        sendDebugWeatherStatus(true, DEBUG_WEATHER_STATE_NORMAL);
    });
}

/**
 * @typedef {import("./weather/provider")} WeatherProvider
 * @param {WeatherProvider} provider Weather provider instance.
 * @param {boolean} force Force provider cache refresh.
 * @param {boolean=} bypassFetchBackoff Allow an explicit user refresh through cooldown.
 * @param {string=} fetchReason Optional scheduler reason for diagnostics.
 * @returns {boolean} True when a fetch was started.
 */
function fetch(provider, force, bypassFetchBackoff, fetchReason) {
    var activeBackoff;

    provider.skipPrimaryFetch = false;
    provider.skipPrimaryFetchReason = null;
    provider.fetchBackoffFailure = null;

    if (!isWatchConnected()) {
        console.log('Skipping weather fetch: no watch connected.');
        return false;
    }

    if (app.fetchInProgress && Date.now() - app.fetchStartedAt < FETCH_WATCHDOG_MS) {
        console.log('Skipping weather fetch: another fetch is already in progress.');
        return false;
    }

    if (app.fetchInProgress) {
        // An exception inside an async provider callback can leave the flag set
        // forever; without this reset the weather would never refresh again.
        console.log('Previous fetch never completed within the watchdog window; continuing.');
        appendDebugWeatherLog('fetch_watchdog_reset', {
            provider: provider.id,
            stuckForMs: Date.now() - app.fetchStartedAt
        });
    }

    if (typeof provider.isGeocodeBackoffActive === 'function' && provider.isGeocodeBackoffActive()) {
        console.log('Skipping weather fetch: geocoding is in backoff cooldown.');
        return false;
    }

    activeBackoff = getActiveFetchBackoff(provider.id);
    if (activeBackoff !== null && !bypassFetchBackoff) {
        if (provider.id === 'yandex') {
            if (!canAttemptBackoffFallback(provider.id)) {
                console.log('Skipping weather fetch: Yandex cooldown fallback was already attempted this hour.');
                appendDebugWeatherLog('fetch_skipped_backoff', {
                    provider: provider.id,
                    force: Boolean(force),
                    reason: activeBackoff.reason,
                    until: new Date(activeBackoff.until).toISOString(),
                    remainingMs: Math.max(0, activeBackoff.until - Date.now()),
                    fallbackAlreadyAttempted: true
                });
                return false;
            }
            console.log('Skipping Yandex primary fetch: provider is in fetch cooldown; trying fallback data.');
            markBackoffFallbackAttempt(provider.id);
            provider.skipPrimaryFetch = true;
            provider.skipPrimaryFetchReason = activeBackoff.reason;
            appendDebugWeatherLog('fetch_using_backoff_fallback', {
                provider: provider.id,
                force: Boolean(force),
                reason: activeBackoff.reason,
                until: new Date(activeBackoff.until).toISOString(),
                remainingMs: Math.max(0, activeBackoff.until - Date.now())
            });
        }
        else {
            console.log('Skipping weather fetch: provider is in fetch cooldown.');
            appendDebugWeatherLog('fetch_skipped_backoff', {
                provider: provider.id,
                force: Boolean(force),
                reason: activeBackoff.reason,
                until: new Date(activeBackoff.until).toISOString(),
                remainingMs: Math.max(0, activeBackoff.until - Date.now())
            });
            return false;
        }
    }

    if (activeBackoff !== null && bypassFetchBackoff) {
        clearFetchBackoff(provider.id);
    }

    app.fetchInProgress = true;
    app.fetchStartedAt = Date.now();
    console.log('Fetching from ' + provider.name);
    appendDebugWeatherLog('fetch_start', {
        provider: provider.id,
        providerName: provider.name,
        force: Boolean(force),
        reason: fetchReason || 'scheduled',
        location: app.settings ? app.settings.location : null
    });
    var fetchStart = Date.now();
    var attempt = incrementFetchAttemptCounter();
    var fetchStatus = {
        time: new Date(),
        id: provider.id,
        name: provider.name
    }
    localStorage.setItem(KEY_LAST_FETCH_ATTEMPT, JSON.stringify(fetchStatus));
    try {
        provider.fetch(
            function() {
                var warnings = getProviderWarnings(provider);
                var diagnostics = getProviderDiagnostics(provider);
                var weatherCoordinates;
                // Sucess, update recent fetch time
                app.fetchInProgress = false;
                localStorage.setItem(KEY_LAST_FETCH_SUCCESS, JSON.stringify(fetchStatus));
                resetFetchAttemptCounter();
                if (provider.fetchBackoffFailure) {
                    markBackoffFallbackAttempt(provider.id);
                    if (!(provider.skipPrimaryFetch && activeBackoff !== null)) {
                        writeFetchBackoff(provider, provider.fetchBackoffFailure);
                    }
                }
                else {
                    clearFetchBackoff(provider.id);
                }
                weatherCoordinates = persistLastWeatherCoordinates(provider);
                reconcileTravelStateAfterSuccess(weatherCoordinates);
                console.log('Successfully fetched weather!');
                appendDebugWeatherLog(warnings.length > 0 ? 'fetch_success_with_warnings' : 'fetch_success', {
                    provider: provider.id,
                    warnings: warnings,
                    diagnostics: diagnostics,
                    usedGpsCache: provider.usedGpsCache,
                    gpsErrorCode: provider.gpsErrorCode,
                    locationMode: provider.locationMode,
                    countryCode: provider.countryCode,
                    durationMs: Date.now() - fetchStart
                });
                sendDebugWeatherStatus(false, getDebugWeatherState(diagnostics));
                if (fetchReason === 'travel_arrival') {
                    appendDebugWeatherLog('travel_refresh_success', {
                        provider: provider.id,
                        usedFallback: Boolean(provider.fetchBackoffFailure),
                        weatherCoordinates: weatherCoordinates
                    });
                }
                maybeTrackWeatherFetch({
                    provider: provider.id,
                    success: true,
                    attempt: attempt,
                    usedGpsCache: provider.usedGpsCache,
                    gpsErrorCode: provider.gpsErrorCode,
                    locationMode: provider.locationMode,
                    countryCode: provider.countryCode,
                    settings: app.settings,
                    watchInfo: app.watchInfo,
                    durationMs: Date.now() - fetchStart
                });
            },
            function(failure) {
                var backoffRecord;
                var backoffPreserved = false;
                // Failure
                app.fetchInProgress = false;
                if (provider.skipPrimaryFetch && activeBackoff !== null) {
                    backoffRecord = activeBackoff;
                    backoffPreserved = true;
                }
                else {
                    backoffRecord = writeFetchBackoff(provider, failure);
                }
                if (provider.id === 'yandex') {
                    markBackoffFallbackAttempt(provider.id);
                }
                console.log('[!] Provider failed to update weather: ' + JSON.stringify(failure));
                appendDebugWeatherLog('fetch_failed', {
                    provider: provider.id,
                    failure: failure,
                    backoffUntil: new Date(backoffRecord.until).toISOString(),
                    backoffDurationMs: backoffRecord.durationMs,
                    backoffPreserved: backoffPreserved,
                    usedGpsCache: provider.usedGpsCache,
                    gpsErrorCode: provider.gpsErrorCode,
                    locationMode: provider.locationMode,
                    countryCode: provider.countryCode,
                    durationMs: Date.now() - fetchStart
                });
                sendDebugWeatherStatus(true, DEBUG_WEATHER_STATE_NORMAL);
                if (fetchReason === 'travel_arrival') {
                    appendDebugWeatherLog('travel_refresh_failed', {
                        provider: provider.id,
                        failure: failure,
                        retryAt: new Date(backoffRecord.until).toISOString()
                    });
                }
                var attemptStatus = {
                    time: fetchStatus.time,
                    id: fetchStatus.id,
                    name: fetchStatus.name,
                    error: failure
                };
                localStorage.setItem(KEY_LAST_FETCH_ATTEMPT, JSON.stringify(attemptStatus));
                maybeTrackWeatherFetch({
                    provider: provider.id,
                    success: false,
                    attempt: attempt,
                    usedGpsCache: provider.usedGpsCache,
                    gpsErrorCode: provider.gpsErrorCode,
                    locationMode: provider.locationMode,
                    countryCode: provider.countryCode,
                    error: failure,
                    settings: app.settings,
                    watchInfo: app.watchInfo,
                    durationMs: Date.now() - fetchStart
                });
            },
            force
        );
    }
    catch (e) {
        app.fetchInProgress = false;
        console.log('Weather fetch threw synchronously: ' + e.message);
        appendDebugWeatherLog('fetch_exception', {
            provider: provider && provider.id,
            message: e.message
        });
        sendDebugWeatherStatus(true, DEBUG_WEATHER_STATE_NORMAL);
        return false;
    }
    return true;
}

/**
 * Send a weather fetch telemetry event when telemetry is enabled.
 *
 * @param {Object} event Telemetry event details.
 * @returns {void}
 */
function maybeTrackWeatherFetch(event) {
    if (!app.telemetry || app.telemetry.enabled !== true) {
        return;
    }
    app.telemetry.trackWeatherFetch(event || {});
}

function tryFetch(provider) {
    if (needRefresh(provider)) {
        fetch(provider, false);
    };
}

function getRefreshMinutes(provider) {
    if (provider && provider.id === 'yandex') {
        return YANDEX_WEATHER_REFRESH_MINUTES;
    }
    if (provider && provider.id === 'openmeteo') {
        return OPEN_METEO_WEATHER_REFRESH_MINUTES;
    }

    return DEFAULT_WEATHER_REFRESH_MINUTES;
}

/**
 * Return true when a previous provider failure cooldown has expired.
 *
 * @param {string} providerId Weather provider id.
 * @returns {boolean} True when a retry should be attempted now.
 */
function hasExpiredFetchBackoff(providerId) {
    var backoffMap = readFetchBackoffMap();
    var record = providerId ? backoffMap[providerId] : null;

    return Boolean(record && typeof record.until === 'number' && Date.now() >= record.until);
}

/**
 * Parse a stored fetch status timestamp.
 *
 * @param {string|null} statusString JSON fetch status string from localStorage.
 * @returns {number|null} Unix milliseconds, or null when missing/invalid.
 */
function parseFetchStatusTime(statusString) {
    var status;
    var timestamp;

    if (statusString === null) {
        return null;
    }

    try {
        status = JSON.parse(statusString);
    }
    catch (ex) {
        return null;
    }

    if (!status || status.time === null) {
        return null;
    }

    timestamp = new Date(status.time).getTime();
    return isFinite(timestamp) ? timestamp : null;
}

function needRefresh(provider) {
    var refreshMinutes = getRefreshMinutes(provider);
    var lastFetchSuccessTime;
    var activeBackoff;

    if (hasExpiredFetchBackoff(provider && provider.id)) {
        return true;
    }

    activeBackoff = getActiveFetchBackoff(provider && provider.id);
    if (activeBackoff !== null) {
        return provider && provider.id === 'yandex'
            && canAttemptBackoffFallback(provider.id);
    }

    // If the weather has never been fetched
    lastFetchSuccessTime = parseFetchStatusTime(localStorage.getItem(KEY_LAST_FETCH_SUCCESS));
    if (lastFetchSuccessTime === null) {
        return true;
    }

    if (Date.now() < lastFetchSuccessTime) {
        console.log('[!] Last fetch time is in the future; refreshing anyway');
        return true;
    }

    return Date.now() - lastFetchSuccessTime >= 1000 * 60 * refreshMinutes;
}
