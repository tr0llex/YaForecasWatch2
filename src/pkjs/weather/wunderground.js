var WeatherProvider = require('./provider.js');
var request = WeatherProvider.request;

var CONDITION = WeatherProvider.CONDITION;

/* The Weather Company icon codes, as used by both the hourly forecast
 * (icon_code) and the current observation (iconCode). Only the groups the
 * watch can draw are listed; anything else stays unknown and no icon is
 * drawn. */
var WU_ICON_CONDITIONS = {
    0: CONDITION.THUNDERSTORM, 1: CONDITION.THUNDERSTORM, 2: CONDITION.THUNDERSTORM,
    3: CONDITION.THUNDERSTORM, 4: CONDITION.THUNDERSTORM,
    5: CONDITION.SNOW, 6: CONDITION.SNOW, 7: CONDITION.SNOW,
    8: CONDITION.RAIN, 9: CONDITION.RAIN, 10: CONDITION.RAIN,
    11: CONDITION.RAIN, 12: CONDITION.RAIN,
    13: CONDITION.SNOW, 14: CONDITION.SNOW, 15: CONDITION.SNOW, 16: CONDITION.SNOW,
    17: CONDITION.SNOW, 18: CONDITION.SNOW,
    19: CONDITION.FOG, 20: CONDITION.FOG, 21: CONDITION.FOG, 22: CONDITION.FOG,
    23: CONDITION.CLOUDY, 24: CONDITION.CLOUDY, 25: CONDITION.CLOUDY,
    26: CONDITION.CLOUDY, 27: CONDITION.CLOUDY, 28: CONDITION.CLOUDY,
    29: CONDITION.PARTLY_CLOUDY, 30: CONDITION.PARTLY_CLOUDY,
    31: CONDITION.CLEAR, 32: CONDITION.CLEAR, 33: CONDITION.CLEAR, 34: CONDITION.CLEAR,
    35: CONDITION.RAIN, 36: CONDITION.CLEAR,
    37: CONDITION.THUNDERSTORM, 38: CONDITION.THUNDERSTORM,
    39: CONDITION.RAIN, 40: CONDITION.RAIN,
    41: CONDITION.SNOW, 42: CONDITION.SNOW, 43: CONDITION.SNOW,
    45: CONDITION.RAIN, 46: CONDITION.SNOW, 47: CONDITION.THUNDERSTORM
};

/**
 * Map a Weather Company icon code onto the shared condition set.
 *
 * @param {*} iconCode Icon code from the API.
 * @returns {number} Shared condition code.
 */
function wuCondition(iconCode) {
    if (typeof iconCode !== 'number' || !isFinite(iconCode)) {
        return CONDITION.UNKNOWN;
    }

    return Object.prototype.hasOwnProperty.call(WU_ICON_CONDITIONS, iconCode)
        ? WU_ICON_CONDITIONS[iconCode]
        : CONDITION.UNKNOWN;
}

var WundergroundProvider = function() {
    this._super.call(this);
    this.name = 'Weather Underground';
    this.id = 'wunderground';
};

WundergroundProvider.prototype = Object.create(WeatherProvider.prototype);
WundergroundProvider.prototype.constructor = WundergroundProvider;
WundergroundProvider.prototype._super = WeatherProvider;

WundergroundProvider.prototype.withWundergroundForecast = function(lat, lon, apiKey, callback, onFailure) {
    // callback(wundergroundResponse)
    var url = 'https://api.weather.com/v1/geocode/' + lat + '/' + lon + '/forecast/hourly/48hour.json?apiKey=' + apiKey + '&language=en-US';

    console.log('Requesting ' + url);

    request(
        url,
        'GET',
        function(response) {
            var weatherData;
            try {
                weatherData = JSON.parse(response);
            }
            catch (ex) {
                onFailure({ stage: 'provider_data', code: 'wu_forecast_parse_error' });
                return;
            }

            if (!weatherData || !Array.isArray(weatherData.forecasts) || weatherData.forecasts.length === 0) {
                onFailure({ stage: 'provider_data', code: 'wu_forecast_missing_fields' });
                return;
            }

            callback(weatherData.forecasts);
        },
        function(error) {
            onFailure({ stage: 'provider_data', code: 'wu_forecast_' + error.code });
        }
    );
};

WundergroundProvider.prototype.withWundergroundCurrent = function(lat, lon, apiKey, callback, onFailure) {
    // callback(wundergroundResponse)
    var url = 'https://api.weather.com/v3/wx/observations/current?language=en-US&units=e&format=json'
        + '&apiKey=' + apiKey
        + '&geocode=' + lat + ',' + lon;

    console.log('Requesting ' + url);

    request(
        url,
        'GET',
        (function(response) {
            var weatherData;
            try {
                weatherData = JSON.parse(response);
            }
            catch (ex) {
                onFailure({ stage: 'provider_data', code: 'wu_current_parse_error' });
                return;
            }

            if (!weatherData || typeof weatherData.temperature !== 'number') {
                onFailure({ stage: 'provider_data', code: 'wu_current_missing_fields' });
                return;
            }

            callback({
                temp: weatherData.temperature,
                feelsLike: typeof weatherData.temperatureFeelsLike === 'number'
                    ? weatherData.temperatureFeelsLike
                    : null,
                iconCode: typeof weatherData.iconCode === 'number'
                    ? weatherData.iconCode
                    : null
            });
        }).bind(this),
        function(error) {
            onFailure({ stage: 'provider_data', code: 'wu_current_' + error.code });
        }
    );
};

/**
 * Fetch hourly UV indices from The Weather Company.
 *
 * @param {string} lat Latitude.
 * @param {string} lon Longitude.
 * @param {string} apiKey Weather Company API key.
 * @param {Function} callback Callback with the hourly UV response.
 * @param {Function} onFailure Callback with normalized error details.
 * @returns {void}
 */
WundergroundProvider.prototype.withWundergroundUv = function(lat, lon, apiKey, callback, onFailure) {
    var url = 'https://api.weather.com/v2/indices/uv/hourly/48hour?language=en-US&format=json'
        + '&apiKey=' + apiKey
        + '&geocode=' + lat + ',' + lon;

    console.log('Requesting ' + url);

    request(
        url,
        'GET',
        function(response) {
            var weatherData;
            try {
                weatherData = JSON.parse(response);
            }
            catch (ex) {
                onFailure({ stage: 'provider_data', code: 'wu_uv_parse_error' });
                return;
            }

            if (!weatherData || !weatherData.uvIndex1hour
                || !Array.isArray(weatherData.uvIndex1hour.fcstValid)
                || !Array.isArray(weatherData.uvIndex1hour.uvIndex)) {
                onFailure({ stage: 'provider_data', code: 'wu_uv_missing_fields' });
                return;
            }

            callback(weatherData.uvIndex1hour);
        },
        function(error) {
            onFailure({ stage: 'provider_data', code: 'wu_uv_' + error.code });
        }
    );
};

WundergroundProvider.prototype.clearApiKey = function() {
    localStorage.removeItem('wundergroundApiKey');
    console.log('Cleared API key');
};

WundergroundProvider.prototype.withApiKey = function(callback, onFailure) {
    // callback(apiKey)

    var apiKey = localStorage.getItem('wundergroundApiKey');
    var url = 'https://www.wunderground.com/';

    if (apiKey === null) {
        console.log('Fetching Weather Underground API key');

        request(
            url,
            'GET',
            function(response) {
                var match = response.match(/observations\/current\?apiKey=([a-z0-9]*)/);
                if (!match || !match[1]) {
                    onFailure({ stage: 'provider_data', code: 'wu_api_key_not_found' });
                    return;
                }

                apiKey = match[1];
                localStorage.setItem('wundergroundApiKey', apiKey);
                console.log('Fetched Weather Underground API key: ' + apiKey);
                callback(apiKey);
            },
            function(error) {
                onFailure({ stage: 'provider_data', code: 'wu_api_key_' + error.code });
            }
        );
    }
    else {
        console.log('Using saved API key for Weather Underground');
        callback(apiKey);
    }
};

// ============== IMPORTANT OVERRIDE ================

WundergroundProvider.prototype.withProviderData = function(lat, lon, force, onSuccess, onFailure) {
    // onSuccess expects that this.hasValidData() will be true
    var currentTemp;
    var currentIconCode = null;
    var forecast;
    var uvData;
    var currentReady = false;
    var forecastReady = false;
    var uvReady = false;
    var failed = false;

    if (force) {
        // In case the API key becomes invalid
        console.log('Clearing Weather Underground API key for forced update');
        this.clearApiKey();
    }

    this.withApiKey((function(apiKey) {
        var failOnce = function(error) {
            if (failed) {
                return;
            }
            failed = true;
            onFailure(error);
        };
        var complete = (function() {
            var uvByTime = {};

            if (failed || !currentReady || !forecastReady || !uvReady) {
                return;
            }

            if (uvData) {
                uvData.fcstValid.forEach(function(timestamp, index) {
                    uvByTime[timestamp] = uvData.uvIndex[index];
                });
            }

            this.tempTrend = forecast.map(function(entry) {
                return entry.temp;
            });
            this.feelsLikeTrend = forecast.map(function(entry) {
                if (typeof entry.feels_like === 'number') {
                    return entry.feels_like;
                }
                if (typeof entry.feelsLike === 'number') {
                    return entry.feelsLike;
                }
                if (typeof entry.temperatureFeelsLike === 'number') {
                    return entry.temperatureFeelsLike;
                }
                return null;
            });
            this.precipTrend = forecast.map(function(entry) {
                return entry.pop / 100.0;
            });
            this.uvTrend = forecast.map(function(entry) {
                return uvByTime.hasOwnProperty(entry.fcst_valid)
                    ? uvByTime[entry.fcst_valid]
                    : 255;
            });
            this.startTime = forecast[0].fcst_valid;
            this.currentTemp = currentTemp;
            /* The observation carries the condition now; the first forecast
             * hour is the fallback when it does not. */
            this.condition = currentIconCode !== null
                ? wuCondition(currentIconCode)
                : wuCondition(forecast[0].icon_code);
            onSuccess();
        }).bind(this);

        this.withWundergroundCurrent(lat, lon, apiKey, function(value) {
            currentTemp = value.temp;
            this.currentFeelsLike = value.feelsLike;
            currentIconCode = value.iconCode;
            currentReady = true;
            complete();
        }.bind(this), failOnce);
        this.withWundergroundForecast(lat, lon, apiKey, function(value) {
            forecast = value;
            forecastReady = true;
            complete();
        }, failOnce);
        this.withWundergroundUv(lat, lon, apiKey, function(value) {
            uvData = value;
            uvReady = true;
            complete();
        }, function(error) {
            console.log('UV forecast unavailable: ' + JSON.stringify(error));
            uvReady = true;
            complete();
        });
    }).bind(this), onFailure);
};

module.exports = WundergroundProvider;
