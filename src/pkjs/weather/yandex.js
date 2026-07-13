var WeatherProvider = require('./provider.js');
var forecastCache = require('./forecast-cache.js');
var storageKeys = require('../storage-keys.js');
var request = WeatherProvider.request;

var YANDEX_API_URL = 'https://api.weather.yandex.ru/graphql/query';
var YANDEX_WEATHER_CACHE_KEY = storageKeys.YANDEX_WEATHER_CACHE_KEY;
var YANDEX_CACHE_VERSION = 2;

var YANDEX_QUERY = [
    '{',
    '  serverTime',
    '  weatherByPoint(request: { lat: LATITUDE, lon: LONGITUDE }) {',
    '    now {',
    '      temperature',
    '      feelsLike',
    '      condition',
    '      icon(format: PNG_64)',
    '      windSpeed',
    '      uvIndex',
    '      precProbability',
    '    }',
    '    forecast {',
    '      days {',
    '        hours {',
    '          time',
    '          temperature',
    '          feelsLike',
    '          condition',
    '          icon(format: PNG_64)',
    '          windSpeed',
    '          uvIndex',
    '          precProbability',
    '        }',
    '      }',
    '    }',
    '  }',
    '}'
].join('\n');

/**
 * Convert Celsius to Fahrenheit for the common watch payload.
 *
 * @param {number} tempC Temperature in Celsius.
 * @returns {number} Temperature in Fahrenheit.
 */
function celsiusToFahrenheit(tempC) {
    return tempC * 9 / 5 + 32;
}

/**
 * Convert an ISO timestamp to Unix seconds.
 *
 * @param {string} value ISO timestamp.
 * @returns {number|null} Unix seconds, or null.
 */
function parseUnixSeconds(value) {
    var timestamp = Date.parse(value);

    return isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

/**
 * Normalize Yandex hourly forecast entries for cache and graph use.
 *
 * @param {Object} weatherData Parsed GraphQL response data.
 * @returns {Object[]} Sorted hourly entries.
 */
function getHourlyForecast(weatherData) {
    var weatherByPoint = weatherData && weatherData.weatherByPoint;
    var forecast = weatherByPoint && weatherByPoint.forecast;
    var days = forecast && forecast.days;
    var hourly = [];
    var earliestUsefulTime = forecastCache.currentHourUnixSeconds() - 60 * 60;

    if (!Array.isArray(days)) {
        return hourly;
    }

    days.forEach(function(day) {
        if (!day || !Array.isArray(day.hours)) {
            return;
        }

        day.hours.forEach(function(hour) {
            var time;

            if (!hour || typeof hour.temperature !== 'number') {
                return;
            }

            time = parseUnixSeconds(hour.time);
            if (time === null || time < earliestUsefulTime) {
                return;
            }

            hourly.push({
                time: time,
                temp: celsiusToFahrenheit(hour.temperature),
                feelsLike: typeof hour.feelsLike === 'number'
                    ? celsiusToFahrenheit(hour.feelsLike)
                    : null,
                precipProbability: forecastCache.normalizeProbability(hour.precProbability),
                uvIndex: forecastCache.finiteNumber(hour.uvIndex)
            });
        });
    });

    hourly.sort(function(a, b) {
        return a.time - b.time;
    });

    return hourly;
}

/**
 * Count finite values for provider diagnostics.
 *
 * @param {Object[]} hourly Hourly cache entries.
 * @param {string} field Field name.
 * @returns {number} Number of finite values.
 */
function countHourlyValues(hourly, field) {
    return hourly.filter(function(entry) {
        return entry && typeof entry[field] === 'number' && isFinite(entry[field]);
    }).length;
}

/**
 * Build a compact Yandex-owned weather cache.
 *
 * @param {Object} weatherData Parsed GraphQL response data.
 * @param {number} lat Latitude.
 * @param {number} lon Longitude.
 * @param {string} cityName Last known city name.
 * @param {string|null} countryCode Country code.
 * @returns {Object|null} Cache object, or null when current data is invalid.
 */
function buildYandexCache(weatherData, lat, lon, cityName, countryCode) {
    var now = weatherData && weatherData.weatherByPoint && weatherData.weatherByPoint.now;

    if (!now || typeof now.temperature !== 'number') {
        return null;
    }

    return {
        version: YANDEX_CACHE_VERSION,
        source: 'yandex',
        fetchedAtUtc: new Date().toISOString(),
        coordinates: {
            lat: lat,
            lon: lon
        },
        cityName: cityName,
        countryCode: countryCode,
        currentTemp: celsiusToFahrenheit(now.temperature),
        currentFeelsLike: typeof now.feelsLike === 'number'
            ? celsiusToFahrenheit(now.feelsLike)
            : null,
        hourly: getHourlyForecast(weatherData)
    };
}

var YandexProvider = function(apiKey) {
    this._super.call(this);
    this.name = 'Yandex Weather';
    this.id = 'yandex';
    this.apiKey = typeof apiKey === 'string' ? apiKey.trim() : apiKey;
};

YandexProvider.prototype = Object.create(WeatherProvider.prototype);
YandexProvider.prototype.constructor = YandexProvider;
YandexProvider.prototype._super = WeatherProvider;

/**
 * Fetch Yandex Weather GraphQL data for a point.
 *
 * @param {number} lat Latitude.
 * @param {number} lon Longitude.
 * @param {Function} callback Success callback with response data.
 * @param {Function} onFailure Failure callback.
 * @returns {void}
 */
YandexProvider.prototype.withYandexResponse = function(lat, lon, callback, onFailure) {
    var query;

    if (!this.apiKey) {
        onFailure({ stage: 'provider_data', code: 'yandex_missing_api_key' });
        return;
    }

    query = YANDEX_QUERY
        .replace('LATITUDE', String(lat))
        .replace('LONGITUDE', String(lon));

    console.log('Requesting ' + YANDEX_API_URL);
    request(
        YANDEX_API_URL,
        'POST',
        function(response) {
            var body;

            try {
                body = JSON.parse(response);
            }
            catch (ex) {
                onFailure({ stage: 'provider_data', code: 'yandex_parse_error' });
                return;
            }

            if (body && Array.isArray(body.errors) && body.errors.length > 0) {
                console.log('[!] Yandex Weather errors: ' + JSON.stringify(body.errors));
                onFailure({ stage: 'provider_data', code: 'yandex_graphql_error' });
                return;
            }
            if (!body || !body.data || !body.data.weatherByPoint || !body.data.weatherByPoint.now) {
                onFailure({ stage: 'provider_data', code: 'yandex_missing_fields' });
                return;
            }

            callback(body.data);
        },
        function(error) {
            console.log('[!] Yandex Weather request failed: ' + JSON.stringify(error));
            onFailure({ stage: 'provider_data', code: 'yandex_' + error.code });
        },
        {
            body: JSON.stringify({ query: query }),
            headers: {
                'Content-Type': 'application/json',
                'X-Yandex-Weather-Key': this.apiKey
            }
        }
    );
};

/**
 * Fetch Yandex data or use the matching Yandex cache on failure.
 *
 * @param {number|string} lat Latitude.
 * @param {number|string} lon Longitude.
 * @param {boolean} force Force refresh flag.
 * @param {Function} onSuccess Success callback.
 * @param {Function} onFailure Failure callback.
 * @returns {void}
 */
YandexProvider.prototype.withProviderData = function(lat, lon, force, onSuccess, onFailure) {
    var numericLat = forecastCache.finiteNumber(lat);
    var numericLon = forecastCache.finiteNumber(lon);
    var graphStartTime = forecastCache.currentHourUnixSeconds();
    var graphWindowTimes = forecastCache.buildHourlyWindow(graphStartTime, this.numEntries);
    var handleYandexFailure;

    console.log('This is the Yandex Weather implementation of withProviderData');
    if (numericLat === null || numericLon === null) {
        onFailure({ stage: 'coordinates', code: 'invalid_coordinates' });
        return;
    }

    handleYandexFailure = (function(failure) {
        var normalizedFailure = failure || { stage: 'provider_data', code: 'yandex_unknown_error' };
        var cachedYandex = forecastCache.readWeatherCache(
            YANDEX_WEATHER_CACHE_KEY,
            YANDEX_CACHE_VERSION
        );

        this.fetchBackoffFailure = normalizedFailure;
        this.warnings.push(normalizedFailure);
        this.diagnostics.yandex = {
            status: 'failure',
            error: normalizedFailure
        };

        if (cachedYandex
            && forecastCache.cacheMatchesCoordinates(cachedYandex, numericLat, numericLon)
            && forecastCache.populateProviderFromCache(
                this,
                cachedYandex,
                graphWindowTimes,
                'yandex_cache'
            )) {
            this.warnings.push({ stage: 'provider_data', code: 'yandex_cached_fallback' });
            onSuccess();
            return;
        }

        onFailure(normalizedFailure);
    }).bind(this);

    if (this.skipPrimaryFetch) {
        handleYandexFailure({
            stage: 'provider_data',
            code: this.skipPrimaryFetchReason || 'yandex_backoff'
        });
        return;
    }

    this.withYandexResponse(numericLat, numericLon, (function(weatherData) {
        var cache = buildYandexCache(
            weatherData,
            numericLat,
            numericLon,
            this.cityName,
            this.countryCode
        );
        var hourly = cache ? cache.hourly : [];

        if (!cache || !forecastCache.populateProviderFromCache(this, cache, graphWindowTimes, 'yandex')) {
            handleYandexFailure({ stage: 'provider_data', code: 'yandex_insufficient_forecast' });
            return;
        }

        forecastCache.writeWeatherCache(YANDEX_WEATHER_CACHE_KEY, cache);
        this.diagnostics.yandex = {
            status: 'success',
            hourlyCount: hourly.length,
            temperatureCount: countHourlyValues(hourly, 'temp'),
            apparentTemperatureCount: countHourlyValues(hourly, 'feelsLike'),
            precipitationProbabilityCount: countHourlyValues(hourly, 'precipProbability'),
            uvIndexCount: countHourlyValues(hourly, 'uvIndex')
        };
        onSuccess();
    }).bind(this), handleYandexFailure);
};

module.exports = YandexProvider;
