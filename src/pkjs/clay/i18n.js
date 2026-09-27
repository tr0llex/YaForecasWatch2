// Settings page translations. `items` is keyed by messageKey, `text` by the
// English defaultValue of headings and text blocks, `page` holds strings
// built by inject.js.

var LANGUAGES = ['en', 'ru'];

var TRANSLATIONS = {
    ru: {
        items: {
            faceTheme: {
                label: 'Тема',
                options: { dark: 'Тёмная', light: 'Светлая' }
            },
            locale: {
                label: 'Язык',
                description: '«Авто» — как язык часов.',
                options: { auto: 'Авто' }
            },
            timeLeadingZero: { label: 'Ноль в начале часа' },
            timeShowAmPm: { label: 'Показывать AM/PM' },
            axisTimeFormat: {
                label: 'Формат часов на графике',
                description: 'Формат основного времени меняется на самих часах: '
                    + 'Settings > Date & Time > Time Format'
            },
            timeFont: { label: 'Шрифт часов' },
            colorTime: { label: 'Цвет часов' },
            weekStartDay: {
                label: 'Первый день недели',
                options: { sun: 'Воскресенье', mon: 'Понедельник' }
            },
            calendarWeeks: { label: 'Сколько недель показывать' },
            firstWeek: {
                label: 'Первая неделя',
                options: { prev: 'Прошлая', curr: 'Текущая' }
            },
            colorToday: {
                label: 'Выделение сегодняшнего дня',
                description: 'Чёрный (по умолчанию) — цвет самой даты, любой другой заменяет его.'
            },
            colorSunday: { label: 'Цвет воскресенья' },
            colorSaturday: { label: 'Цвет субботы' },
            colorHoliday1: { label: 'Цвет праздников 1' },
            holidaySet1: {
                label: 'Праздники 1',
                options: {
                    0: 'Нет',
                    1: 'США',
                    2: 'Россия',
                    3: 'Испания',
                    4: 'Испания + Каталония'
                }
            },
            colorHoliday2: { label: 'Цвет праздников 2' },
            holidaySet2: {
                label: 'Праздники 2',
                options: {
                    0: 'Нет',
                    1: 'США',
                    2: 'Россия',
                    3: 'Испания',
                    4: 'Испания + Каталония'
                }
            },
            temperatureUnits: { label: 'Единицы температуры' },
            dayNightShading: {
                label: 'Штриховка ночи',
                description: 'Штриховка от заката до восхода, чтобы на графике были видны день и ночь.'
            },
            showFeelsLike: {
                label: 'Показывать «ощущается как»',
                description: 'Ощущаемая температура точками на графике, если источник её сообщает.'
            },
            colorFeelsLike: { label: 'Цвет «ощущается как»' },
            provider: {
                label: 'Источник погоды',
                options: { yandex: 'Яндекс Погода' }
            },
            owmApiKey: {
                label: 'Ключ API OpenWeatherMap',
                description: "<a href='https://openweathermap.org/'>Зарегистрируйтесь в OpenWeatherMap</a> "
                    + 'и вставьте сюда ключ API'
            },
            yandexApiKey: {
                label: 'Ключ API Яндекс Погоды',
                description: "<a href='https://yandex.ru/pogoda/b2b/smarthome'>Получите ключ API Яндекс Погоды</a> "
                    + 'и вставьте его сюда'
            },
            fetch: {
                label: 'Обновить погоду сейчас',
                description: "Последнее успешное обновление:<br><span id='lastFetchSpan'>ещё не было</span>"
                    + "<span id='lastAttemptBlock'></span>"
            },
            location: {
                label: 'Своё местоположение',
                description: 'Например: «Москва, Тверская 1».<br>'
                    + '<a href="https://locationiq.com/demo">Здесь</a> можно проверить запрос.<br>'
                    + 'Чтобы определять место по GPS, оставьте поле пустым и включите GPS на телефоне.',
                placeholder: 'По GPS'
            },
            showQt: { label: 'Значок «Не беспокоить»' },
            vibe: { label: 'Вибрация при потере Bluetooth' },
            btIcons: {
                label: 'Значок Bluetooth',
                options: {
                    disconnected: 'При отключении',
                    connected: 'При подключении',
                    both: 'Всегда',
                    none: 'Никогда'
                }
            }
        },
        text: {
            'Contribute on <a href="https://github.com/Dreamkeeper/YaForecasWatch2">GitHub!</a>':
                'Исходный код и замечания — на <a href="https://github.com/Dreamkeeper/YaForecasWatch2">GitHub</a>',
            'Face': 'Циферблат',
            'Time': 'Время',
            'Calendar': 'Календарь',
            'Weather': 'Погода',
            'Misc': 'Разное',
            'Debug': 'Отладка',
            'Save Settings': 'Сохранить'
        },
        page: {
            show: 'Показать',
            hide: 'Скрыть',
            owmKey: 'ключ API OpenWeatherMap',
            yandexKey: 'ключ API Яндекс Погоды',
            via: ', источник: ',
            lastFailedAttempt: 'Последняя неудачная попытка:',
            error: 'Ошибка: ',
            noDebugLog: 'Пока пусто.'
        }
    }
};

/**
 * Resolve the Language setting; "auto" follows the watch, then the phone.
 *
 * @param {string} setting Language setting: 'auto', 'en' or 'ru'.
 * @param {Object=} watchInfo Result of Pebble.getActiveWatchInfo().
 * @param {string=} phoneLanguage navigator.language of the phone.
 * @returns {string} Supported language code.
 */
function resolveLanguage(setting, watchInfo, phoneLanguage) {
    var candidate = setting;

    if (LANGUAGES.indexOf(candidate) === -1) {
        candidate = (watchInfo && watchInfo.language) || phoneLanguage || 'en';
    }
    candidate = String(candidate).toLowerCase().slice(0, 2);

    return LANGUAGES.indexOf(candidate) === -1 ? 'en' : candidate;
}

/**
 * Translate one config item in place.
 *
 * @param {Object} item Clay config item (already a copy).
 * @param {Object} dict Translations for one language.
 * @returns {void}
 */
function localizeItem(item, dict) {
    var entry = item.messageKey ? dict.items[item.messageKey] : null;

    if (Array.isArray(item.items)) {
        item.items.forEach(function(child) {
            localizeItem(child, dict);
        });
    }

    if (!item.messageKey && typeof item.defaultValue === 'string'
        && Object.prototype.hasOwnProperty.call(dict.text, item.defaultValue)) {
        item.defaultValue = dict.text[item.defaultValue];
    }

    if (!entry) {
        return;
    }
    if (entry.label) {
        item.label = entry.label;
    }
    if (entry.description) {
        item.description = entry.description;
    }
    if (entry.placeholder && item.attributes) {
        item.attributes.placeholder = entry.placeholder;
    }
    if (entry.options && Array.isArray(item.options)) {
        item.options.forEach(function(option) {
            if (Object.prototype.hasOwnProperty.call(entry.options, option.value)) {
                option.label = entry.options[option.value];
            }
        });
    }
}

/**
 * Return a translated copy of the Clay config.
 *
 * @param {Object[]} config English Clay config.
 * @param {string} language Language code from resolveLanguage().
 * @returns {Object[]} Config to hand to Clay.
 */
function localizeConfig(config, language) {
    var dict = TRANSLATIONS[language];
    var copy = JSON.parse(JSON.stringify(config));

    if (dict) {
        copy.forEach(function(item) {
            localizeItem(item, dict);
        });
    }
    return copy;
}

/**
 * Strings inject.js builds at runtime, for the given language.
 *
 * @param {string} language Language code from resolveLanguage().
 * @returns {Object} Page strings; empty for English, which is the fallback.
 */
function pageStrings(language) {
    var dict = TRANSLATIONS[language];
    return dict ? dict.page : {};
}

module.exports = {
    LANGUAGES: LANGUAGES,
    TRANSLATIONS: TRANSLATIONS,
    resolveLanguage: resolveLanguage,
    localizeConfig: localizeConfig,
    pageStrings: pageStrings
};
