var WeatherProvider = require('./provider.js');
var forecastCache = require('./forecast-cache.js');
var storageKeys = require('../storage-keys.js');
var request = WeatherProvider.request;

var OPEN_METEO_API_URL = 'https://api.open-meteo.com/v1/forecast';
var OPEN_METEO_WEATHER_CACHE_KEY = storageKeys.OPEN_METEO_WEATHER_CACHE_KEY;
var OPEN_METEO_CACHE_VERSION = 1;
var OPEN_METEO_HOURLY = 'temperature_2m,apparent_temperature,precipitation_probability,uv_index';
var OPEN_METEO_CURRENT = 'temperature_2m,apparent_temperature,weather_code';

var CONDITION = WeatherProvider.CONDITION;

/**
 * Map a WMO weather code onto the shared condition set.
 *
 * Коды по таблице WMO 4677, которой пользуется Open-Meteo: 0 — ясно, 1..2 —
 * переменная облачность, 3 — пасмурно, 45/48 — туман, 51..67 и 80..82 — дождь
 * и морось, 71..77 и 85/86 — снег, 95..99 — гроза.
 *
 * @param {*} code WMO weather code.
 * @returns {number} Shared condition code.
 */
function wmoCondition(code) {
    if (typeof code !== 'number' || !isFinite(code)) {
        return CONDITION.UNKNOWN;
    }
    if (code === 0) {
        return CONDITION.CLEAR;
    }
    if (code === 1 || code === 2) {
        return CONDITION.PARTLY_CLOUDY;
    }
    if (code === 3) {
        return CONDITION.CLOUDY;
    }
    if (code === 45 || code === 48) {
        return CONDITION.FOG;
    }
    if (code >= 95) {
        return CONDITION.THUNDERSTORM;
    }
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
        return CONDITION.SNOW;
    }
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
        return CONDITION.RAIN;
    }

    return CONDITION.UNKNOWN;
}

/**
 * Count finite values in an array for diagnostics.
 *
 * @param {*} values Candidate array.
 * @returns {number} Number of finite values.
 */
function countNumericValues(values) {
    if (!Array.isArray(values)) {
        return 0;
    }

    return values.filter(function(value) {
        return typeof value === 'number' && isFinite(value);
    }).length;
}

/**
 * Build normalized Open-Meteo hourly entries.
 *
 * @param {Object} openMeteoData Parsed API response.
 * @returns {Object[]} Sorted hourly entries.
 */
function getHourlyForecast(openMeteoData) {
    var hourlyData = openMeteoData && openMeteoData.hourly;
    var times = hourlyData && hourlyData.time;
    var temperatures = hourlyData && hourlyData.temperature_2m;
    var apparentTemperatures = hourlyData && hourlyData.apparent_temperature;
    var precipitationProbabilities = hourlyData && hourlyData.precipitation_probability;
    var uvIndices = hourlyData && hourlyData.uv_index;
    var hourly = [];

    if (!Array.isArray(times)) {
        return hourly;
    }

    times.forEach(function(time, index) {
        var timestamp = forecastCache.finiteNumber(time);
        var temperature = Array.isArray(temperatures)
            ? forecastCache.finiteNumber(temperatures[index])
            : null;

        if (timestamp === null || temperature === null) {
            return;
        }

        hourly.push({
            time: Math.floor(timestamp),
            temp: temperature,
            feelsLike: Array.isArray(apparentTemperatures)
                ? forecastCache.finiteNumber(apparentTemperatures[index])
                : null,
            precipProbability: Array.isArray(precipitationProbabilities)
                ? forecastCache.normalizeProbability(precipitationProbabilities[index])
                : null,
            uvIndex: Array.isArray(uvIndices)
                ? forecastCache.finiteNumber(uvIndices[index])
                : null
        });
    });

    hourly.sort(function(a, b) {
        return a.time - b.time;
    });
    return hourly;
}

/**
 * Build a compact Open-Meteo-owned weather cache.
 *
 * @param {Object} openMeteoData Parsed API response.
 * @param {number} lat Latitude.
 * @param {number} lon Longitude.
 * @param {string} cityName Last known city name.
 * @param {string|null} countryCode Country code.
 * @returns {Object|null} Cache object, or null when no temperatures exist.
 */
function buildOpenMeteoCache(openMeteoData, lat, lon, cityName, countryCode) {
    var current = openMeteoData && openMeteoData.current;
    var hourly = getHourlyForecast(openMeteoData);
    var currentTemp = current ? forecastCache.finiteNumber(current.temperature_2m) : null;
    var currentFeelsLike = current ? forecastCache.finiteNumber(current.apparent_temperature) : null;

    if (currentTemp === null && hourly.length > 0) {
        currentTemp = hourly[0].temp;
    }
    if (currentFeelsLike === null && hourly.length > 0) {
        currentFeelsLike = hourly[0].feelsLike;
    }
    if (currentTemp === null || hourly.length === 0) {
        return null;
    }

    return {
        version: OPEN_METEO_CACHE_VERSION,
        source: 'openmeteo',
        fetchedAtUtc: new Date().toISOString(),
        coordinates: {
            lat: lat,
            lon: lon
        },
        cityName: cityName,
        countryCode: countryCode,
        currentTemp: currentTemp,
        currentFeelsLike: currentFeelsLike,
        condition: wmoCondition(current ? current.weather_code : null),
        hourly: hourly
    };
}

var OpenMeteoProvider = function() {
    this._super.call(this);
    this.name = 'Open-Meteo';
    this.id = 'openmeteo';
};

OpenMeteoProvider.prototype = Object.create(WeatherProvider.prototype);
OpenMeteoProvider.prototype.constructor = OpenMeteoProvider;
OpenMeteoProvider.prototype._super = WeatherProvider;

/**
 * Fetch a rolling 48-hour Open-Meteo forecast for a point.
 *
 * @param {number} lat Latitude.
 * @param {number} lon Longitude.
 * @param {Function} callback Success callback with parsed data.
 * @param {Function} onFailure Failure callback.
 * @returns {void}
 */
OpenMeteoProvider.prototype.withOpenMeteoResponse = function(lat, lon, callback, onFailure) {
    var url = OPEN_METEO_API_URL
        + '?latitude=' + encodeURIComponent(lat)
        + '&longitude=' + encodeURIComponent(lon)
        + '&current=' + OPEN_METEO_CURRENT
        + '&hourly=' + OPEN_METEO_HOURLY
        + '&forecast_hours=48'
        + '&temperature_unit=fahrenheit'
        + '&timeformat=unixtime';

    console.log('Requesting ' + OPEN_METEO_API_URL + ' as the selected provider');
    request(
        url,
        'GET',
        function(response) {
            var body;

            try {
                body = JSON.parse(response);
            }
            catch (ex) {
                onFailure({ stage: 'provider_data', code: 'openmeteo_parse_error' });
                return;
            }
            if (!body || !body.hourly || !Array.isArray(body.hourly.time)) {
                onFailure({ stage: 'provider_data', code: 'openmeteo_missing_fields' });
                return;
            }

            callback(body);
        },
        function(error) {
            console.log('[!] Open-Meteo request failed: ' + JSON.stringify(error));
            onFailure({ stage: 'provider_data', code: 'openmeteo_' + error.code });
        }
    );
};

/**
 * Fetch Open-Meteo data or use the matching Open-Meteo cache on failure.
 *
 * @param {number|string} lat Latitude.
 * @param {number|string} lon Longitude.
 * @param {boolean} force Force refresh flag.
 * @param {Function} onSuccess Success callback.
 * @param {Function} onFailure Failure callback.
 * @returns {void}
 */
OpenMeteoProvider.prototype.withProviderData = function(lat, lon, force, onSuccess, onFailure) {
    var numericLat = forecastCache.finiteNumber(lat);
    var numericLon = forecastCache.finiteNumber(lon);
    var graphStartTime = forecastCache.currentHourUnixSeconds();
    var graphWindowTimes = forecastCache.buildHourlyWindow(graphStartTime, this.numEntries);
    var handleFailure;

    console.log('This is the Open-Meteo implementation of withProviderData');
    if (numericLat === null || numericLon === null) {
        onFailure({ stage: 'coordinates', code: 'invalid_coordinates' });
        return;
    }

    handleFailure = (function(failure) {
        var normalizedFailure = failure || { stage: 'provider_data', code: 'openmeteo_unknown_error' };
        var cachedOpenMeteo = forecastCache.readWeatherCache(
            OPEN_METEO_WEATHER_CACHE_KEY,
            OPEN_METEO_CACHE_VERSION
        );

        this.fetchBackoffFailure = normalizedFailure;
        this.warnings.push(normalizedFailure);
        this.diagnostics.openMeteo = {
            status: 'failure',
            error: normalizedFailure
        };

        if (cachedOpenMeteo
            && forecastCache.cacheMatchesCoordinates(cachedOpenMeteo, numericLat, numericLon)
            && forecastCache.populateProviderFromCache(
                this,
                cachedOpenMeteo,
                graphWindowTimes,
                'openmeteo_cache'
            )) {
            this.warnings.push({ stage: 'provider_data', code: 'openmeteo_cached_fallback' });
            onSuccess();
            return;
        }

        onFailure(normalizedFailure);
    }).bind(this);

    this.withOpenMeteoResponse(numericLat, numericLon, (function(openMeteoData) {
        var cache = buildOpenMeteoCache(
            openMeteoData,
            numericLat,
            numericLon,
            this.cityName,
            this.countryCode
        );
        var hourlyData = openMeteoData.hourly;

        if (!cache || !forecastCache.populateProviderFromCache(this, cache, graphWindowTimes, 'openmeteo')) {
            handleFailure({ stage: 'provider_data', code: 'openmeteo_insufficient_forecast' });
            return;
        }

        forecastCache.writeWeatherCache(OPEN_METEO_WEATHER_CACHE_KEY, cache);
        this.diagnostics.openMeteo = {
            status: 'success',
            hourlyCount: cache.hourly.length,
            temperatureCount: countNumericValues(hourlyData.temperature_2m),
            apparentTemperatureCount: countNumericValues(hourlyData.apparent_temperature),
            precipitationProbabilityCount: countNumericValues(hourlyData.precipitation_probability),
            uvIndexCount: countNumericValues(hourlyData.uv_index)
        };
        onSuccess();
    }).bind(this), handleFailure);
};

module.exports = OpenMeteoProvider;
