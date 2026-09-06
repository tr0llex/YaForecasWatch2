var meta = require('../../../package.json');
var profileLabel = meta.buildProfile === "release" ? "" : " (" + meta.buildProfile + ")";
var versionLabel = "v" + meta.version + profileLabel;

var config = [
    {
        "type": "heading",
        "defaultValue": "YaForecasWatch2"
    },
    {
        "type": "text",
        "defaultValue": "Contribute on <a href=\"https://github.com/Dreamkeeper/YaForecasWatch2\">GitHub!</a>"
    },
    {
        "type": "section",
        "items": [
            {
                "type": "heading",
                "defaultValue": "Страница настроек",
            },
            {
                "type": "select",
                "label": "Тема",
                "messageKey": "configTheme",
                "defaultValue": "light",
                "description": "Оформление этой страницы. «Применить» сохраняет и оставляет её открытой.",
                "options": [
                    {
                        "label": "Светлая",
                        "value": "light"
                    },
                    {
                        "label": "Тёмная",
                        "value": "dark"
                    }
                ]
            },
        ]
    },
    {
        "type": "section",
        "items": [
            {
                "type": "heading",
                "defaultValue": "Часы",
            },
            {
                "type": "select",
                "label": "Тема циферблата",
                "messageKey": "faceTheme",
                "defaultValue": "dark",
                "options": [
                    {
                        "label": "Тёмная",
                        "value": "dark"
                    },
                    {
                        "label": "Светлая",
                        "value": "light"
                    }
                ]
            },
            {
                "type": "toggle",
                "label": "Ведущий ноль",
                "messageKey": "timeLeadingZero",
            },
            {
                "type": "toggle",
                "label": "Показывать AM/PM",
                "messageKey": "timeShowAmPm",
            },
            {
                "type": "select",
                "label": "Формат оси графика",
                "messageKey": "axisTimeFormat",
                "defaultValue": "24h",
                "description": "Формат самих часов (12/24) меняется на часах: Settings > Date &amp; Time > Time Format",
                "options": [
                    {
                        "label": "12h",
                        "value": "12h"
                    },
                    {
                        "label": "24h",
                        "value": "24h"
                    }
                ]
            },
            {
                "type": "select",
                "label": "Шрифт часов",
                "messageKey": "timeFont",
                "defaultValue": "roboto",
                "options": [
                    {
                        "label": "Roboto",
                        "value": "roboto"
                    },
                    {
                        "label": "Leco",
                        "value": "leco"
                    },
                    {
                        "label": "Bitham",
                        "value": "bitham"
                    },
                ]
            },
            {
                "type": "color",
                "label": "Цвет часов",
                "messageKey": "colorTime",
                "defaultValue": "#FFFFFF",
                "sunlight": false,
                "capabilities": ["COLOR"]
            },
        ]
    },
    {
        "type": "section",
        "items": [
            {
                "type": "heading",
                "defaultValue": "Календарь",
            },
            {
                "type": "select",
                "label": "Начало недели",
                "messageKey": "weekStartDay",
                "defaultValue": "sun",
                "options": [
                    {
                        "label": "Воскресенье",
                        "value": "sun"
                    },
                    {
                        "label": "Понедельник",
                        "value": "mon"
                    }
                ]
            },
            {
                "type": "select",
                "label": "Рядов календаря",
                "messageKey": "calendarWeeks",
                "defaultValue": "2",
                "description": "Третий ряд занимает место — часы автоматически станут меньше.",
                "options": [
                    {
                        "label": "2 недели",
                        "value": "2"
                    },
                    {
                        "label": "3 недели",
                        "value": "3"
                    }
                ]
            },
            {
                "type": "select",
                "label": "Первый ряд",
                "messageKey": "firstWeek",
                "defaultValue": "prev",
                "options": [
                    {
                        "label": "Прошлая неделя",
                        "value": "prev"
                    },
                    {
                        "label": "Текущая неделя",
                        "value": "curr"
                    }
                ]
            },
            {
                "type": "color",
                "label": "Подсветка сегодня",
                "messageKey": "colorToday",
                "defaultValue": "#000000",
                "description": "Чёрный (по умолчанию) — цвет как у даты; любой другой цвет переопределяет.",
                "sunlight": false,
                "capabilities": ["COLOR"]
            },
            {
                "type": "color",
                "label": "Цвет воскресений",
                "messageKey": "colorSunday",
                "defaultValue": "#FF0055",
                "sunlight": false,
                "capabilities": ["COLOR"]
            },
            {
                "type": "color",
                "label": "Цвет суббот",
                "messageKey": "colorSaturday",
                "defaultValue": "#FF0055",
                "sunlight": false,
                "capabilities": ["COLOR"]
            },
            {
                "type": "select",
                "label": "Набор праздников 1",
                "messageKey": "holidaySet1",
                "defaultValue": "1",
                "options": [
                    {
                        "label": "Нет",
                        "value": "0"
                    },
                    {
                        "label": "США",
                        "value": "1"
                    },
                    {
                        "label": "Россия",
                        "value": "2"
                    },
                    {
                        "label": "Испания",
                        "value": "3"
                    },
                    {
                        "label": "Испания + Каталония",
                        "value": "4"
                    }
                ]
            },
            {
                "type": "color",
                "label": "Цвет набора 1",
                "messageKey": "colorHoliday1",
                "defaultValue": "#FF0055",
                "sunlight": false,
                "capabilities": ["COLOR"]
            },
            {
                "type": "select",
                "label": "Набор праздников 2",
                "messageKey": "holidaySet2",
                "defaultValue": "0",
                "options": [
                    {
                        "label": "Нет",
                        "value": "0"
                    },
                    {
                        "label": "США",
                        "value": "1"
                    },
                    {
                        "label": "Россия",
                        "value": "2"
                    },
                    {
                        "label": "Испания",
                        "value": "3"
                    },
                    {
                        "label": "Испания + Каталония",
                        "value": "4"
                    }
                ]
            },
            {
                "type": "color",
                "label": "Цвет набора 2",
                "messageKey": "colorHoliday2",
                "defaultValue": "#00AAFF",
                "sunlight": false,
                "capabilities": ["COLOR"]
            },
        ]
    },
    {
        "type": "section",
        "items": [
            {
                "type": "heading",
                "defaultValue": "Погода"
            },
            {
                "type": "select",
                "defaultValue": "f",
                "messageKey": "temperatureUnits",
                "label": "Единицы температуры",
                "options": [
                    {
                        "label": "°F",
                        "value": "f"
                    },
                    {
                        "label": "°C",
                        "value": "c"
                    }
                ]
            },
            {
                "type": "toggle",
                "label": "Затенение ночи",
                "messageKey": "dayNightShading",
                "defaultValue": true,
                "description": "Штриховка между закатом и рассветом, чтобы отличать ночь на графике."
            },
            {
                "type": "toggle",
                "label": "Показывать «ощущается как»",
                "messageKey": "showFeelsLike",
                "defaultValue": false,
                "description": "Показывать «ощущается как» пунктиром, если источник её отдаёт."
            },
            {
                "type": "color",
                "label": "Цвет «ощущается как»",
                "messageKey": "colorFeelsLike",
                "defaultValue": "#FFFF00",
                "capabilities": ["COLOR"]
            },
            {
                "type": "radiogroup",
                "label": "Источник погоды",
                "messageKey": "provider",
                "defaultValue": "wunderground",
                "options": [
                    {
                        "label": "Weather Underground",
                        "value": "wunderground"
                    },
                    {
                        "label": "OpenWeatherMap",
                        "value": "openweathermap"
                    },
                    {
                        "label": "Open-Meteo",
                        "value": "openmeteo"
                    },
                    {
                        "label": "Yandex Weather",
                        "value": "yandex"
                    }
                ]
            },
            {
                "type": "input",
                "label": "Ключ API OpenWeatherMap",
                "messageKey": "owmApiKey",
                "description": "<a href='https://openweathermap.org/'>Зарегистрируйтесь в OpenWeatherMap</a> и вставьте сюда ключ API",
                "attributes": {
                    "type": "password",
                    "autocomplete": "off",
                    "autocapitalize": "none",
                    "autocorrect": "off",
                    "spellcheck": "false"
                }
            },
            {
                "type": "input",
                "label": "Ключ API Яндекс.Погоды",
                "messageKey": "yandexApiKey",
                "description": "<a href='https://yandex.ru/pogoda/b2b/smarthome'>Получите ключ API Яндекс.Погоды</a> и вставьте его сюда. На бесплатном тарифе доступны только сегодня и завтра, УФ-индекс не отдаётся, лимит — 30 запросов в сутки и 1000 в месяц; циферблат сам держится в этих рамках и обновляет погоду раз в два часа. Данные предоставлены сервисом Яндекс Погода.",
                "attributes": {
                    "type": "password",
                    "autocomplete": "off",
                    "autocapitalize": "none",
                    "autocorrect": "off",
                    "spellcheck": "false"
                }
            },
            {
                "type": "toggle",
                "label": "Обновить погоду сейчас",
                "messageKey": "fetch",
                "description": "Последнее успешное обновление:<br><span id='lastFetchSpan'>ещё не было</span><span id='lastAttemptBlock'></span>"
            },
            {
                "type": "input",
                "label": "Задать местоположение",
                "messageKey": "location",
                "description": "Например: «Москва» или «Тверская 7, Москва».<br><a href=\"https://locationiq.com/demo\">Проверить запрос</a>.<br>Для GPS оставьте поле пустым и включите геолокацию на телефоне.",
                "attributes": {
                    "placeholder": "Using GPS",
                }
            }
        ]
    },
    {
        "type": "section",
        "items": [
            {
                "type": "heading",
                "defaultValue": "Прочее"
            },
            {
                "type": "toggle",
                "label": "Значок «не беспокоить»",
                "messageKey": "showQt",
                "defaultValue": true
            },
            {
                "type": "toggle",
                "label": "Вибрация при потере связи",
                "messageKey": "vibe",
                "defaultValue": false
            },
            {
                "type": "select",
                "defaultValue": "both",
                "messageKey": "btIcons",
                "label": "Значок Bluetooth",
                "options": [
                    {
                        "label": "При обрыве связи",
                        "value": "disconnected"
                    },
                    {
                        "label": "При наличии связи",
                        "value": "connected"
                    },
                    {
                        "label": "Всегда",
                        "value": "both"
                    },
                    {
                        "label": "Нет",
                        "value": "none"
                    }
                ]
            },
        ]
    },
    {
        "type": "submit",
        "defaultValue": "Сохранить и закрыть"
    },
    {
        "type": "text",
        "defaultValue": versionLabel
    }
];

if (meta.buildProfile === "debug") {
    config.splice(config.length - 2, 0, {
        "type": "section",
        "items": [
            {
                "type": "heading",
                "defaultValue": "Debug"
            },
            {
                "type": "text",
                "defaultValue": "<textarea id='debugWeatherLog' readonly style='box-sizing:border-box;width:100%;min-height:180px;background:#202124;color:#f1f3f4;border:1px solid #5f6368;border-radius:4px;padding:8px;font-family:monospace;font-size:12px;line-height:1.35;white-space:pre-wrap;'>No debug log yet.</textarea>"
            }
        ]
    });
}

module.exports = config;
