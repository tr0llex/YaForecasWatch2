var WeatherProvider = require('./provider.js');
var request = WeatherProvider.request;

var CONDITION = WeatherProvider.CONDITION;

/**
 * Map an OpenWeatherMap condition id onto the shared condition set.
 *
 * Groups are documented at openweathermap.org/weather-conditions: 2xx
 * thunderstorm, 3xx drizzle, 5xx rain, 6xx snow, 7xx atmosphere (fog, haze,
 * dust), 800 clear, 801/802 few and scattered clouds, 803/804 overcast.
 *
 * @param {*} id OpenWeatherMap condition id.
 * @returns {number} Shared condition code.
 */
function owmCondition(id) {
    if (typeof id !== 'number' || !isFinite(id)) {
        return CONDITION.UNKNOWN;
    }
    if (id >= 200 && id < 300) {
        return CONDITION.THUNDERSTORM;
    }
    if (id >= 300 && id < 600) {
        return CONDITION.RAIN;
    }
    if (id >= 600 && id < 700) {
        return CONDITION.SNOW;
    }
    if (id >= 700 && id < 800) {
        return CONDITION.FOG;
    }
    if (id === 800) {
        return CONDITION.CLEAR;
    }
    if (id === 801 || id === 802) {
        return CONDITION.PARTLY_CLOUDY;
    }
    if (id === 803 || id === 804) {
        return CONDITION.CLOUDY;
    }

    return CONDITION.UNKNOWN;
}

var OpenWeatherMapProvider = function(apiKey) {
    this._super.call(this);
    this.name = 'OpenWeatherMap';
    this.id = 'openweathermap';
    this.apiKey = apiKey;
    this.weatherDataCache = null;
    console.log('Constructed with ' + apiKey);
};

OpenWeatherMapProvider.prototype = Object.create(WeatherProvider.prototype);
OpenWeatherMapProvider.prototype.constructor = OpenWeatherMapProvider;
OpenWeatherMapProvider.prototype._super = WeatherProvider;

OpenWeatherMapProvider.prototype.withOwmResponse = function(lat, lon, callback, onFailure) {
    var url = 'https://api.openweathermap.org/data/3.0/onecall?appid=' + this.apiKey + '&lat=' + lat + '&lon=' + lon + '&units=imperial&exclude=alerts,minutely';

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
                onFailure({ stage: 'provider_data', code: 'owm_parse_error' });
                return;
            }
            if (!weatherData || !weatherData.hourly || !weatherData.current || !weatherData.daily) {
                onFailure({ stage: 'provider_data', code: 'owm_missing_fields' });
                return;
            }
            console.log('Found timezone: ' + weatherData.timezone);
            // cache weather data (use same request for sun events and weather forecast)
            this.weatherDataCache = weatherData;
            callback(weatherData);
        }).bind(this),
        function(error) {
            console.log('[!] OpenWeatherMap request failed: ' + JSON.stringify(error));
            onFailure({ stage: 'provider_data', code: 'owm_' + error.code });
        }
    );
};

OpenWeatherMapProvider.prototype.withWeatherData = function(lat, lon, callback, onFailure) {
    if (this.weatherDataCache === null) {
        this.withOwmResponse(lat, lon, function(owmResponse) {
            callback(owmResponse);
        }, onFailure);
    }
    else {
        callback(this.weatherDataCache);
    }
};

// ============== IMPORTANT OVERRIDE ================
OpenWeatherMapProvider.prototype.withSunEvents = function(lat, lon, callback, onFailure) {
    console.log('This is the overridden implementation of withSunEvents');
    this.withOwmResponse(lat, lon, (function(owmResponse) {
        var days = owmResponse.daily;
        var sunEvents;
        var now;
        var nextSunEvents;
        var next24HourSunEvents;

        if (!Array.isArray(days) || days.length < 2) {
            onFailure({ stage: 'sun_events', code: 'owm_missing_daily' });
            return;
        }

        sunEvents = [
            { type: 'sunrise', date: new Date(days[0].sunrise * 1000) },
            { type: 'sunset', date: new Date(days[0].sunset * 1000) },
            { type: 'sunrise', date: new Date(days[1].sunrise * 1000) },
            { type: 'sunset', date: new Date(days[1].sunset * 1000) }
        ];
        now = new Date();
        nextSunEvents = sunEvents.filter(function(sunEvent) {
            return sunEvent.date > now;
        });
        next24HourSunEvents = nextSunEvents.slice(0, 2);
        console.log('The next ' + sunEvents[0].type + ' is at ' + sunEvents[0].date.toTimeString());
        console.log('The next ' + sunEvents[1].type + ' is at ' + sunEvents[1].date.toTimeString());
        callback(next24HourSunEvents);
    }).bind(this), onFailure);
};

OpenWeatherMapProvider.prototype.withProviderData = function(lat, lon, force, onSuccess, onFailure) {
    // onSuccess expects that this.hasValidData() will be true
    console.log('This is the overridden implementation of withProviderData');
    this.withWeatherData(lat, lon, (function(weatherData) {
        this.tempTrend = weatherData.hourly.map(function(entry) {
            return entry.temp;
        });
        this.feelsLikeTrend = weatherData.hourly.map(function(entry) {
            return typeof entry.feels_like === 'number' ? entry.feels_like : null;
        });
        this.precipTrend = weatherData.hourly.map(function(entry) {
            return entry.pop;
        });
        this.uvTrend = weatherData.hourly.map(function(entry) {
            return entry.uvi;
        });
        this.startTime = weatherData.hourly[0].dt;
        this.currentTemp = weatherData.current.temp;
        this.currentFeelsLike = typeof weatherData.current.feels_like === 'number'
            ? weatherData.current.feels_like
            : null;
        this.condition = owmCondition(Array.isArray(weatherData.current.weather)
            && weatherData.current.weather[0]
            ? weatherData.current.weather[0].id
            : null);
        onSuccess();
    }).bind(this), onFailure);
};

module.exports = OpenWeatherMapProvider;
