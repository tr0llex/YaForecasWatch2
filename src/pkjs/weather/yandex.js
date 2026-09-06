var WeatherProvider = require('./provider.js');
var forecastCache = require('./forecast-cache.js');
var storageKeys = require('../storage-keys.js');
var request = WeatherProvider.request;

var YANDEX_API_URL = 'https://api.weather.yandex.ru/graphql/query';
var YANDEX_WEATHER_CACHE_KEY = storageKeys.YANDEX_WEATHER_CACHE_KEY;
var YANDEX_DENIED_FIELDS_KEY = storageKeys.YANDEX_DENIED_FIELDS_KEY;
var YANDEX_BUDGET_KEY = storageKeys.YANDEX_BUDGET_KEY;

/* Условия бесплатного тарифа (yandex.ru/legal/apib2c_weather_agreement):
 * 30 запросов в сутки, 1000 в месяц, 10 в секунду; превышение — повод
 * закрыть ключ. Держим запас на разведочный повторный запрос и на ручное
 * «Обновить погоду сейчас». */
var YANDEX_MAX_REQUESTS_PER_DAY = 28;
var YANDEX_MAX_REQUESTS_PER_MONTH = 950;

/* Бесплатный тариф отдаёт только сегодня и завтра, поэтому под утро вторых
 * суток горизонта на все 24 часа графика уже не хватает. Меньше этого
 * числа часов рисовать нечего. */
var YANDEX_MIN_ENTRIES = 6;
var YANDEX_CACHE_VERSION = 2;

/* Тарифы Яндекс.Погоды различаются набором полей: на бесплатном («basic»)
 * feelsLike и uvIndex закрыты, и GraphQL на такой запрос отвечает не частичными
 * данными, а errors[] с пустым data — погода не приходит вообще. Поэтому эти
 * два поля запрашиваются отдельно от остальных и выбрасываются из запроса, как
 * только ключ ответил «access denied for basic role»; что закрыто, помним в
 * localStorage, чтобы не тратить лишний запрос при каждом обновлении. */
var YANDEX_OPTIONAL_FIELDS = ['feelsLike', 'uvIndex'];
var YANDEX_ACCESS_DENIED = 'access denied for basic role';

var YANDEX_BASE_FIELDS = [
    'temperature',
    'condition',
    'icon(format: PNG_64)',
    'windSpeed',
    'precProbability'
];

/**
 * Build the GraphQL query for a point.
 *
 * @param {number} lat Latitude.
 * @param {number} lon Longitude.
 * @param {string[]} optionalFields Optional fields this key may read.
 * @returns {string} GraphQL query.
 */
function buildYandexQuery(lat, lon, optionalFields) {
    var nowFields = YANDEX_BASE_FIELDS.concat(optionalFields);
    var hourFields = ['time'].concat(nowFields);

    function indent(fields, pad) {
        return fields.map(function(field) {
            return pad + field;
        }).join('\n');
    }

    return [
        '{',
        '  serverTime',
        '  weatherByPoint(request: { lat: ' + lat + ', lon: ' + lon + ' }) {',
        '    now {',
        indent(nowFields, '      '),
        '    }',
        '    forecast {',
        '      days {',
        '        hours {',
        indent(hourFields, '          '),
        '        }',
        '      }',
        '    }',
        '  }',
        '}'
    ].join('\n');
}

/**
 * Read today's request counters, resetting them when the period rolled over.
 *
 * @param {Date} now Current time.
 * @returns {Object} Counters for the current day and month.
 */
function readBudget(now) {
    var day = now.toISOString().slice(0, 10);
    var month = day.slice(0, 7);
    var stored;

    try {
        stored = JSON.parse(localStorage.getItem(YANDEX_BUDGET_KEY) || 'null');
    }
    catch (ex) {
        stored = null;
    }
    if (!stored || typeof stored !== 'object') {
        stored = {};
    }

    return {
        day: day,
        month: month,
        dayCount: stored.day === day ? (stored.dayCount || 0) : 0,
        monthCount: stored.month === month ? (stored.monthCount || 0) : 0
    };
}

/**
 * Whether one more request fits inside the free tariff's quota.
 *
 * @returns {boolean} True when the request may be sent.
 */
function budgetAllowsRequest() {
    var budget = readBudget(new Date());

    return budget.dayCount < YANDEX_MAX_REQUESTS_PER_DAY
        && budget.monthCount < YANDEX_MAX_REQUESTS_PER_MONTH;
}

/**
 * Count one request against the quota.
 *
 * @returns {void}
 */
function budgetRecordRequest() {
    var budget = readBudget(new Date());

    try {
        localStorage.setItem(YANDEX_BUDGET_KEY, JSON.stringify({
            day: budget.day,
            month: budget.month,
            dayCount: budget.dayCount + 1,
            monthCount: budget.monthCount + 1
        }));
    }
    catch (ex) {
        console.log('[!] Yandex Weather: cannot persist request budget: ' + ex.message);
    }
}

/**
 * Optional fields this key is still allowed to request.
 *
 * @returns {string[]} Allowed optional fields.
 */
function allowedOptionalFields() {
    var denied;

    try {
        denied = JSON.parse(localStorage.getItem(YANDEX_DENIED_FIELDS_KEY) || '[]');
    }
    catch (ex) {
        denied = [];
    }
    if (!Array.isArray(denied)) {
        denied = [];
    }

    return YANDEX_OPTIONAL_FIELDS.filter(function(field) {
        return denied.indexOf(field) === -1;
    });
}

/**
 * Optional fields the API just refused, read out of a GraphQL errors array.
 *
 * @param {Object[]} errors GraphQL errors.
 * @returns {string[]} Refused optional fields.
 */
function deniedOptionalFields(errors) {
    var denied = [];

    errors.forEach(function(error) {
        var path = error && Array.isArray(error.path) ? error.path : null;
        var field = path ? path[path.length - 1] : null;

        if (error && error.message === YANDEX_ACCESS_DENIED
            && YANDEX_OPTIONAL_FIELDS.indexOf(field) !== -1
            && denied.indexOf(field) === -1) {
            denied.push(field);
        }
    });

    return denied;
}

/**
 * Remember which optional fields this key cannot read.
 *
 * @param {string[]} fields Refused optional fields.
 * @returns {void}
 */
function rememberDeniedFields(fields) {
    var allowed = allowedOptionalFields();
    var denied = YANDEX_OPTIONAL_FIELDS.filter(function(field) {
        return fields.indexOf(field) !== -1 || allowed.indexOf(field) === -1;
    });

    try {
        localStorage.setItem(YANDEX_DENIED_FIELDS_KEY, JSON.stringify(denied));
    }
    catch (ex) {
        console.log('[!] Yandex Weather: cannot persist denied fields: ' + ex.message);
    }
}

var CONDITION = WeatherProvider.CONDITION;

/* Условия Яндекса приходят строкой. Список из документации GraphQL-схемы;
 * всё неизвестное остаётся UNKNOWN, и часы просто не рисуют значок. */
var YANDEX_CONDITIONS = {
    CLEAR: CONDITION.CLEAR,
    PARTLY_CLOUDY: CONDITION.PARTLY_CLOUDY,
    CLOUDY: CONDITION.PARTLY_CLOUDY,
    OVERCAST: CONDITION.CLOUDY,
    LIGHT_RAIN: CONDITION.RAIN,
    RAIN: CONDITION.RAIN,
    HEAVY_RAIN: CONDITION.RAIN,
    SHOWERS: CONDITION.RAIN,
    DRIZZLE: CONDITION.RAIN,
    WET_SNOW: CONDITION.SNOW,
    LIGHT_SNOW: CONDITION.SNOW,
    SNOW: CONDITION.SNOW,
    SNOWFALL: CONDITION.SNOW,
    HAIL: CONDITION.SNOW,
    THUNDERSTORM: CONDITION.THUNDERSTORM,
    THUNDERSTORM_WITH_RAIN: CONDITION.THUNDERSTORM,
    THUNDERSTORM_WITH_HAIL: CONDITION.THUNDERSTORM
};

/**
 * Map a Yandex condition string onto the shared condition set.
 *
 * @param {*} condition Yandex condition value.
 * @returns {number} Shared condition code.
 */
function yandexCondition(condition) {
    if (typeof condition !== 'string') {
        return CONDITION.UNKNOWN;
    }

    return Object.prototype.hasOwnProperty.call(YANDEX_CONDITIONS, condition)
        ? YANDEX_CONDITIONS[condition]
        : CONDITION.UNKNOWN;
}

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
        condition: yandexCondition(now.condition),
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
    var apiKey = this.apiKey;
    var attempt;

    if (!apiKey) {
        onFailure({ stage: 'provider_data', code: 'yandex_missing_api_key' });
        return;
    }

    /**
     * Run one query, retrying once without the fields the key cannot read.
     *
     * @param {string[]} optionalFields Optional fields to ask for.
     * @param {boolean} mayRetry Whether an access-denied answer may be retried.
     * @returns {void}
     */
    attempt = function(optionalFields, mayRetry) {
        var query = buildYandexQuery(lat, lon, optionalFields);

        if (!budgetAllowsRequest()) {
            console.log('[!] Yandex Weather: free-tariff quota spent for today');
            onFailure({ stage: 'provider_data', code: 'yandex_quota_exhausted' });
            return;
        }
        budgetRecordRequest();

        console.log('Requesting ' + YANDEX_API_URL
            + (optionalFields.length ? ' with ' + optionalFields.join(', ') : ' (base fields only)'));
        request(
            YANDEX_API_URL,
            'POST',
            function(response) {
                var body;
                var denied;

                try {
                    body = JSON.parse(response);
                }
                catch (ex) {
                    onFailure({ stage: 'provider_data', code: 'yandex_parse_error' });
                    return;
                }

                if (body && Array.isArray(body.errors) && body.errors.length > 0) {
                    denied = deniedOptionalFields(body.errors);
                    if (denied.length > 0) {
                        rememberDeniedFields(denied);
                        console.log('[!] Yandex Weather: tariff denies ' + denied.join(', '));
                        if (mayRetry) {
                            attempt(optionalFields.filter(function(field) {
                                return denied.indexOf(field) === -1;
                            }), false);
                            return;
                        }
                    }
                    else {
                        console.log('[!] Yandex Weather errors: ' + JSON.stringify(body.errors));
                    }
                    if (!body.data || !body.data.weatherByPoint || !body.data.weatherByPoint.now) {
                        onFailure({ stage: 'provider_data', code: 'yandex_graphql_error' });
                        return;
                    }
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
                    'X-Yandex-Weather-Key': apiKey
                }
            }
        );
    };

    attempt(allowedOptionalFields(), true);
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
    var graphStartTime;

    /* Провайдер переживает обновления, а короткий горизонт бывает разовым —
     * под утро вторых суток. Без сброса однажды укороченный график таким и
     * оставался бы навсегда. */
    this.numEntries = WeatherProvider.DEFAULT_NUM_ENTRIES;
    graphStartTime = forecastCache.currentHourUnixSeconds();
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
        var windowTimes = graphWindowTimes;

        /* Прогноз обрывается концом завтрашних суток, и под утро второго дня
         * до конца 24-часового окна данных уже нет. Раньше это считалось
         * отказом и погода просто переставала обновляться; вместо этого
         * укорачиваем сам график до того, что прислали. */
        if (hourly.length > 0) {
            var available = Math.floor((hourly[hourly.length - 1].time - graphStartTime) / 3600) + 1;
            if (available < this.numEntries) {
                if (available < YANDEX_MIN_ENTRIES) {
                    handleYandexFailure({ stage: 'provider_data', code: 'yandex_short_forecast' });
                    return;
                }
                console.log('[yandex] forecast horizon is ' + available + 'h, shortening the graph');
                windowTimes = forecastCache.buildHourlyWindow(graphStartTime, available);
            }
        }

        if (!cache || !forecastCache.populateProviderFromCache(this, cache, windowTimes, 'yandex')) {
            handleYandexFailure({ stage: 'provider_data', code: 'yandex_insufficient_forecast' });
            return;
        }
        this.numEntries = windowTimes.length;

        this.condition = typeof cache.condition === 'number' ? cache.condition : CONDITION.UNKNOWN;
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
