// Must match WeatherCondition in src/c/layers/condition_icon.h.

var CONDITION = {
    UNKNOWN: 0,
    CLEAR: 1,
    PARTLY_CLOUDY: 2,
    CLOUDY: 3,
    RAIN: 4,
    SNOW: 5,
    THUNDERSTORM: 6,
    FOG: 7
};

/**
 * Whether a value is a finite number.
 *
 * @param {*} value Candidate.
 * @returns {boolean} True for finite numbers.
 */
function isCode(value) {
    return typeof value === 'number' && isFinite(value);
}

/**
 * Map a WMO 4677 weather code (Open-Meteo `weather_code`).
 *
 * @param {*} code WMO code.
 * @returns {number} CONDITION value.
 */
function fromWmo(code) {
    if (!isCode(code)) {
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
    if (code >= 95 && code <= 99) {
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
 * Map an OpenWeatherMap condition id.
 *
 * @param {*} id OpenWeatherMap id.
 * @returns {number} CONDITION value.
 */
function fromOpenWeatherMap(id) {
    if (!isCode(id)) {
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

// Weather Company icon codes used by Weather Underground.
var WEATHER_COMPANY_ICONS = {
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
 * Map a Weather Company icon code.
 *
 * @param {*} iconCode Icon code.
 * @returns {number} CONDITION value.
 */
function fromWeatherCompany(iconCode) {
    if (!isCode(iconCode) || !Object.prototype.hasOwnProperty.call(WEATHER_COMPANY_ICONS, iconCode)) {
        return CONDITION.UNKNOWN;
    }
    return WEATHER_COMPANY_ICONS[iconCode];
}

var YANDEX_CONDITIONS = {
    CLEAR: CONDITION.CLEAR,
    PARTLY_CLOUDY: CONDITION.PARTLY_CLOUDY,
    CLOUDY: CONDITION.PARTLY_CLOUDY,
    OVERCAST: CONDITION.CLOUDY,
    LIGHT_RAIN: CONDITION.RAIN,
    RAIN: CONDITION.RAIN,
    HEAVY_RAIN: CONDITION.RAIN,
    SHOWERS: CONDITION.RAIN,
    SLEET: CONDITION.SNOW,
    LIGHT_SNOW: CONDITION.SNOW,
    SNOW: CONDITION.SNOW,
    SNOWFALL: CONDITION.SNOW,
    HAIL: CONDITION.SNOW,
    THUNDERSTORM: CONDITION.THUNDERSTORM,
    THUNDERSTORM_WITH_RAIN: CONDITION.THUNDERSTORM,
    THUNDERSTORM_WITH_HAIL: CONDITION.THUNDERSTORM
};

/**
 * Map a Yandex Weather condition string.
 *
 * @param {*} condition Yandex condition.
 * @returns {number} CONDITION value.
 */
function fromYandex(condition) {
    if (typeof condition !== 'string' || !Object.prototype.hasOwnProperty.call(YANDEX_CONDITIONS, condition)) {
        return CONDITION.UNKNOWN;
    }
    return YANDEX_CONDITIONS[condition];
}

/**
 * Normalize a stored condition value.
 *
 * @param {*} value Candidate CONDITION value.
 * @returns {number} The value when valid, UNKNOWN otherwise.
 */
function normalize(value) {
    return isCode(value) && value >= CONDITION.UNKNOWN && value <= CONDITION.FOG
        ? value
        : CONDITION.UNKNOWN;
}

module.exports = {
    CONDITION: CONDITION,
    fromWmo: fromWmo,
    fromOpenWeatherMap: fromOpenWeatherMap,
    fromWeatherCompany: fromWeatherCompany,
    fromYandex: fromYandex,
    normalize: normalize
};
