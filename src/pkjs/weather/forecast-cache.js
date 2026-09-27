var conditions = require('./conditions.js');
var UV_UNAVAILABLE = null;
var CACHE_COORDINATE_MATCH_KM = 25;

/**
 * Convert a value to a finite number.
 *
 * @param {*} value Candidate number.
 * @returns {number|null} Number, or null.
 */
function finiteNumber(value) {
    var numeric = typeof value === 'number' ? value : parseFloat(value);

    return isFinite(numeric) ? numeric : null;
}

/**
 * Round the current time down to an hour in Unix seconds.
 *
 * @returns {number} Unix seconds.
 */
function currentHourUnixSeconds() {
    var rounded = new Date();

    rounded.setMinutes(0);
    rounded.setSeconds(0);
    rounded.setMilliseconds(0);
    return Math.floor(rounded.getTime() / 1000);
}

/**
 * Build the fixed hourly graph window used by the watch.
 *
 * @param {number} startTime First graph hour in Unix seconds.
 * @param {number} numEntries Number of hourly entries.
 * @returns {number[]} Hour timestamps.
 */
function buildHourlyWindow(startTime, numEntries) {
    var times = [];
    var index;

    for (index = 0; index < numEntries; index += 1) {
        times.push(startTime + index * 60 * 60);
    }

    return times;
}

/**
 * Normalize a precipitation probability to the provider range of 0 to 1.
 *
 * @param {*} value Probability expressed as 0..1 or 0..100.
 * @returns {number|null} Normalized probability, or null.
 */
function normalizeProbability(value) {
    var numeric = finiteNumber(value);

    if (numeric === null) {
        return null;
    }
    if (numeric > 1) {
        numeric /= 100;
    }

    return Math.max(0, Math.min(1, numeric));
}

/**
 * Read a versioned compact weather cache.
 *
 * @param {string} key localStorage key.
 * @param {number} version Expected cache version.
 * @returns {Object|null} Cached weather data.
 */
function readWeatherCache(key, version) {
    var raw = localStorage.getItem(key);
    var cache;

    if (raw === null) {
        return null;
    }

    try {
        cache = JSON.parse(raw);
    }
    catch (ex) {
        localStorage.removeItem(key);
        return null;
    }

    if (!cache || cache.version !== version || !Array.isArray(cache.hourly)) {
        return null;
    }

    return cache;
}

/**
 * Write a compact weather cache.
 *
 * @param {string} key localStorage key.
 * @param {Object} cache Weather cache.
 * @returns {void}
 */
function writeWeatherCache(key, cache) {
    localStorage.setItem(key, JSON.stringify(cache));
}

/**
 * Return distance between coordinates in kilometres.
 *
 * @param {number} lat1 First latitude.
 * @param {number} lon1 First longitude.
 * @param {number} lat2 Second latitude.
 * @param {number} lon2 Second longitude.
 * @returns {number} Distance in kilometres.
 */
function distanceKm(lat1, lon1, lat2, lon2) {
    var earthRadiusKm = 6371;
    var toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad;
    var dLon = (lon2 - lon1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad)
        * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusKm * c;
}

/**
 * Check whether a cache belongs to approximately the same point.
 *
 * @param {Object} cache Cached weather data.
 * @param {number} lat Latitude.
 * @param {number} lon Longitude.
 * @returns {boolean} True when coordinates are within the cache radius.
 */
function cacheMatchesCoordinates(cache, lat, lon) {
    var cacheLat = cache && cache.coordinates ? finiteNumber(cache.coordinates.lat) : null;
    var cacheLon = cache && cache.coordinates ? finiteNumber(cache.coordinates.lon) : null;

    if (cacheLat === null || cacheLon === null) {
        return false;
    }

    return distanceKm(cacheLat, cacheLon, lat, lon) <= CACHE_COORDINATE_MATCH_KM;
}

/**
 * Determine if hourly data reaches the end of the graph window.
 *
 * @param {Object[]} hourly Hourly entries.
 * @param {number[]} windowTimes Graph timestamps.
 * @returns {boolean} True when the graph horizon is covered.
 */
function coversWindow(hourly, windowTimes) {
    var latest = null;

    if (!Array.isArray(hourly) || windowTimes.length === 0) {
        return false;
    }

    hourly.forEach(function(entry) {
        if (entry && typeof entry.time === 'number' && (latest === null || entry.time > latest)) {
            latest = entry.time;
        }
    });

    return latest !== null && latest >= windowTimes[windowTimes.length - 1];
}

/**
 * Populate a provider from one provider-owned cache.
 *
 * @param {Object} provider Weather provider instance.
 * @param {Object} cache Provider cache.
 * @param {number[]} windowTimes Graph timestamps.
 * @param {string} sourceName Debug source label.
 * @returns {boolean} True when a complete watch payload was prepared.
 */
function populateProviderFromCache(provider, cache, windowTimes, sourceName) {
    var byTime = {};
    var fallbackTemp;
    var lastTemp;
    var lastFeelsLike;
    var tempMatched = 0;
    var precipMatched = 0;
    var uvMatched = 0;

    if (!cache || !coversWindow(cache.hourly, windowTimes)) {
        return false;
    }

    cache.hourly.forEach(function(entry) {
        if (entry && typeof entry.time === 'number') {
            byTime[entry.time] = entry;
        }
    });

    fallbackTemp = finiteNumber(cache.currentTemp);
    if (fallbackTemp === null) {
        windowTimes.some(function(windowTime) {
            var entry = byTime[windowTime];
            fallbackTemp = entry ? finiteNumber(entry.temp) : null;
            return fallbackTemp !== null;
        });
    }
    if (fallbackTemp === null) {
        return false;
    }

    provider.startTime = windowTimes[0];
    provider.currentTemp = fallbackTemp;
    provider.currentFeelsLike = finiteNumber(cache.currentFeelsLike);
    provider.condition = conditions.normalize(cache.condition);
    provider.tempTrend = [];
    provider.feelsLikeTrend = [];
    provider.precipTrend = [];
    provider.uvTrend = [];
    lastTemp = fallbackTemp;
    lastFeelsLike = provider.currentFeelsLike;

    windowTimes.forEach(function(windowTime) {
        var entry = byTime[windowTime];
        var temp = entry ? finiteNumber(entry.temp) : null;
        var feelsLike = entry ? finiteNumber(entry.feelsLike) : null;
        var precipProbability = entry ? normalizeProbability(entry.precipProbability) : null;
        var uvIndex = entry ? finiteNumber(entry.uvIndex) : null;

        if (temp !== null) {
            lastTemp = temp;
            tempMatched += 1;
        }
        if (feelsLike !== null) {
            lastFeelsLike = feelsLike;
        }
        if (precipProbability !== null) {
            precipMatched += 1;
        }
        if (uvIndex !== null) {
            uvMatched += 1;
        }

        provider.tempTrend.push(lastTemp);
        provider.feelsLikeTrend.push(lastFeelsLike);
        provider.precipTrend.push(precipProbability !== null ? precipProbability : 0);
        provider.uvTrend.push(uvIndex !== null ? uvIndex : UV_UNAVAILABLE);
    });

    if (provider.currentFeelsLike === null && finiteNumber(provider.feelsLikeTrend[0]) !== null) {
        provider.currentFeelsLike = provider.feelsLikeTrend[0];
    }
    provider.weatherCoordinates = {
        lat: finiteNumber(cache.coordinates && cache.coordinates.lat),
        lon: finiteNumber(cache.coordinates && cache.coordinates.lon)
    };
    provider.diagnostics.cache = {
        source: sourceName,
        primaryFetchedAtUtc: cache.fetchedAtUtc,
        graphStart: windowTimes[0],
        graphHours: windowTimes.length,
        temperatureMatchedHours: tempMatched,
        precipMatchedHours: precipMatched,
        uvMatchedHours: uvMatched
    };

    return provider.hasValidData();
}

module.exports = {
    UV_UNAVAILABLE: UV_UNAVAILABLE,
    finiteNumber: finiteNumber,
    currentHourUnixSeconds: currentHourUnixSeconds,
    buildHourlyWindow: buildHourlyWindow,
    normalizeProbability: normalizeProbability,
    readWeatherCache: readWeatherCache,
    writeWeatherCache: writeWeatherCache,
    cacheMatchesCoordinates: cacheMatchesCoordinates,
    populateProviderFromCache: populateProviderFromCache
};
