module.exports = function (minified) {
    clayConfig = this;
    var $ = minified.$;

    /**
     * Parse stored JSON safely.
     *
     * @param {string|null} value Raw JSON string.
     * @returns {Object|null} Parsed object or null.
     */
    function parseStoredJson(value) {
        if (value === null) {
            return null;
        }

        try {
            return JSON.parse(value);
        }
        catch (ex) {
            return null;
        }
    }

    /**
     * Format a rolling debug log for a copy-friendly textarea.
     *
     * @param {string|null} value Raw JSON string.
     * @returns {string} Human-readable log text.
     */
    function formatDebugWeatherLog(value) {
        var entries = parseStoredJson(value);

        if (!Array.isArray(entries) || entries.length === 0) {
            return 'Пока пусто.';
        }

        return entries.map(function(entry) {
            var details = entry && entry.details ? entry.details : {};
            return [
                entry.time || '(no time)',
                entry.event || '(event)',
                JSON.stringify(details)
            ].join(' | ');
        }).join('\n');
    }

    /**
     * Add a compact reveal control to a masked Clay input.
     *
     * @param {Object} clayItem Clay input item.
     * @param {string} fieldName Human-readable field name for accessibility.
     * @returns {void}
     */
    function addApiKeyRevealButton(clayItem, fieldName) {
        var input = clayItem && clayItem.$manipulatorTarget
            ? clayItem.$manipulatorTarget[0]
            : null;
        var wrapper = input && input.parentNode;
        var button;

        if (!input || !wrapper || wrapper.querySelector('.api-key-reveal')) {
            return;
        }

        input.type = 'password';
        input.style.paddingRight = '4.6rem';

        button = document.createElement('button');
        button.type = 'button';
        button.className = 'api-key-reveal';
        button.textContent = 'Показать';
        button.setAttribute('aria-label', 'Показать: ' + fieldName);
        button.setAttribute('aria-pressed', 'false');
        button.style.position = 'absolute';
        button.style.top = '0';
        button.style.right = '0';
        button.style.height = '100%';
        button.style.minWidth = '4.1rem';
        button.style.padding = '0 0.55rem';
        button.style.border = '0';
        button.style.borderLeft = '1px solid #5f6368';
        button.style.borderRadius = '0 0.25rem 0.25rem 0';
        button.style.background = '#444444';
        button.style.color = '#ffffff';
        button.style.fontSize = '0.85rem';

        button.addEventListener('click', function(event) {
            var reveal = input.type === 'password';

            event.preventDefault();
            event.stopPropagation();
            input.type = reveal ? 'text' : 'password';
            button.textContent = reveal ? 'Скрыть' : 'Показать';
            button.setAttribute('aria-label',
                (reveal ? 'Скрыть: ' : 'Показать: ') + fieldName);
            button.setAttribute('aria-pressed', reveal ? 'true' : 'false');
            input.focus();
        });

        wrapper.appendChild(button);
    }

    /**
     * Restore the masked presentation for an API-key field.
     *
     * @param {Object} clayItem Clay input item.
     * @param {string} fieldName Human-readable field name for accessibility.
     * @returns {void}
     */
    function maskApiKeyInput(clayItem, fieldName) {
        var input = clayItem && clayItem.$manipulatorTarget
            ? clayItem.$manipulatorTarget[0]
            : null;
        var button = input && input.parentNode
            ? input.parentNode.querySelector('.api-key-reveal')
            : null;

        if (!input) {
            return;
        }

        input.type = 'password';
        if (button) {
            button.textContent = 'Показать';
            button.setAttribute('aria-label', 'Показать: ' + fieldName);
            button.setAttribute('aria-pressed', 'false');
        }
    }

    /* Payload tag understood by index.js: save, then reopen the page instead of
     * returning to the app. The platform only hands settings back on close, so
     * "apply without closing" is really "close and immediately reopen". */
    var KEEP_OPEN_KEY = '_keepConfigOpen';

    /* Clay ships a dark page; these override its actual class names
     * (.section #484848, inputs #333333, .description #a4a4a4). */
    var LIGHT_THEME_CSS = [
        'body { background: #ececed !important; color: #1c1c1e !important; }',
        '.section { background: #ffffff !important; box-shadow: #d9d9de 0 0.15rem 0.25rem !important; }',
        '.label { color: #1c1c1e !important; }',
        /* Section headers keep Clay's dark #414141 bar unless overridden,
         * which left dark text on a dark bar. */
        '.section .component-heading {',
        '  background: #e4e4e8 !important; color: #1c1c1e !important;',
        '  border-bottom: 1px solid #d9d9de !important;',
        '}',
        '.section .component-heading * { color: #1c1c1e !important; }',
        '.description, .component-text, .component-footer { color: #5f6368 !important; }',
        '.component-input .input input, .component-select .value,',
        '.component-slider .value, input, select, textarea {',
        '  background: #f4f4f6 !important; color: #1c1c1e !important;',
        '  border: 1px solid #c7c7cc !important;',
        '}',
        '.component-color .picker-wrap .picker {',
        '  background: #ffffff !important;',
        '  box-shadow: 0 0.17647rem 0.88235rem rgba(0, 0, 0, 0.25) !important;',
        '}',
        '.button { color: #ffffff !important; }',
        '.api-key-reveal {',
        '  background: #e9e9ee !important; color: #1c1c1e !important;',
        '  border-left: 1px solid #c7c7cc !important;',
        '}',
        'a { color: #0a62c2 !important; }'
    ].join(' ');

    /**
     * Apply or remove the light-theme stylesheet.
     *
     * @param {string} theme Either "light" or "dark".
     * @returns {void}
     */
    function applyConfigTheme(theme) {
        var styleId = 'fcw2-config-theme';
        var existing = document.getElementById(styleId);
        var style;

        if (theme !== 'light') {
            if (existing && existing.parentNode) {
                existing.parentNode.removeChild(existing);
            }
            return;
        }

        if (existing) {
            return;
        }

        style = document.createElement('style');
        style.id = styleId;
        style.type = 'text/css';
        style.appendChild(document.createTextNode(LIGHT_THEME_CSS));
        document.head.appendChild(style);
    }

    clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function() {
        var clayFetch;
        var clayOwmApiKey;
        var clayYandexApiKey;
        var clayProvider;
        var clayLocation;
        var initProvider;
        var initOwmApiKey;
        var initYandexApiKey;
        var initLocation;
        var lastFetchSuccessString;
        var lastFetchSuccess;
        var date;
        var lastFetchSuccessTime;
        var lastFetchAttemptString;
        var lastFetchAttempt;
        var attemptDate;
        var attemptTime;
        var attemptText;
        var shouldShowLastAttempt;
        var debugWeatherLog;
        var clayConfigTheme;

        /* AFTER_BUILD навешивает всё остальное — кнопки «Показать», «Применить»,
         * светлую тему. Раньше любой отсутствующий ключ (переименовали настройку,
         * не обновили страницу) ронял обработчик на первом же get, и страница
         * молча оставалась без всего, что идёт ниже. */
        clayFetch = clayConfig.getItemByMessageKey('fetch');
        clayOwmApiKey = clayConfig.getItemByMessageKey('owmApiKey');
        clayYandexApiKey = clayConfig.getItemByMessageKey('yandexApiKey');
        clayProvider = clayConfig.getItemByMessageKey('provider');
        clayLocation = clayConfig.getItemByMessageKey('location');

        if (!clayFetch || !clayOwmApiKey || !clayYandexApiKey || !clayProvider || !clayLocation) {
            console.log('[clay] config page is missing expected items, skipping enhancements');
            return;
        }

        clayFetch.set(false);
        addApiKeyRevealButton(clayOwmApiKey, 'ключ API OpenWeatherMap');
        addApiKeyRevealButton(clayYandexApiKey, 'ключ API Яндекс.Погоды');
        initProvider = clayProvider.get();
        initOwmApiKey = clayOwmApiKey.get();
        initYandexApiKey = clayYandexApiKey.get();
        initLocation = clayLocation.get();

        // Configure default provide section layout
        if (initProvider !== 'openweathermap') {
            clayOwmApiKey.hide()
        }
        if (initProvider !== 'yandex') {
            clayYandexApiKey.hide()
        }

        // Configure logic for updating the provider section layout
        clayProvider.on('change', function() {
            if (this.get() === 'openweathermap') {
                clayOwmApiKey.show();
            }
            else {
                maskApiKeyInput(clayOwmApiKey, 'ключ API OpenWeatherMap');
                clayOwmApiKey.hide();
            }
            if (this.get() === 'yandex') {
                clayYandexApiKey.show();
            }
            else {
                maskApiKeyInput(clayYandexApiKey, 'ключ API Яндекс.Погоды');
                clayYandexApiKey.hide();
            }
            console.log('Provider set to ' + this.get());
        })

        // Show last weather fetch status
        lastFetchSuccessString = clayConfig.meta.userData.lastFetchSuccess;
        lastFetchSuccessTime = null;
        lastFetchSuccess = parseStoredJson(lastFetchSuccessString);
        if (lastFetchSuccess !== null) {
            date = new Date(lastFetchSuccess.time);
            lastFetchSuccessTime = date.getTime();
            $('#lastFetchSpan').ht(date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
                + ', источник: ' + lastFetchSuccess.name);
        }

        lastFetchAttemptString = clayConfig.meta.userData.lastFetchAttempt;
        lastFetchAttempt = parseStoredJson(lastFetchAttemptString);
        if (lastFetchAttempt !== null) {
            if (lastFetchAttempt.error) {
                attemptDate = new Date(lastFetchAttempt.time);
                attemptTime = attemptDate.getTime();
                shouldShowLastAttempt = !Boolean(lastFetchSuccessTime) || attemptTime > lastFetchSuccessTime;

                if (shouldShowLastAttempt) {
                    attemptText = '<br>Последняя неудачная попытка:<br>';
                    attemptText += attemptDate.toLocaleDateString() + ' ' + attemptDate.toLocaleTimeString()
                        + ', источник: ' + lastFetchAttempt.name;
                    attemptText += '<br>Ошибка: ' + lastFetchAttempt.error.stage
                        + ': ' + lastFetchAttempt.error.code;
                    $('#lastAttemptBlock').ht(attemptText);
                }
            }
        }

        debugWeatherLog = $('#debugWeatherLog');
        if (debugWeatherLog.length > 0) {
            debugWeatherLog.set('value', formatDebugWeatherLog(clayConfig.meta.userData.debugWeatherLog));
            debugWeatherLog.on('|click', function() {
                if (this[0] && typeof this[0].select === 'function') {
                    this[0].select();
                }
            });
        }

        /**
         * Serialise and hand the settings back to the watch.
         *
         * @param {boolean} keepOpen Reopen the page after saving.
         * @returns {void}
         */
        function submitConfig(keepOpen) {
            var returnTo;
            var payload;

            if (clayProvider.get() !== initProvider
                || clayOwmApiKey.get() !== initOwmApiKey
                || clayYandexApiKey.get() !== initYandexApiKey
                || clayLocation.get() !== initLocation) {
                clayFetch.set(true);
            }

            payload = clayConfig.serialize();
            if (keepOpen) {
                payload[KEEP_OPEN_KEY] = { value: true };
            }

            // Copied from original handler ($.off requires non-anonymous handler)
            returnTo = window.returnTo || 'pebblejs://close#';
            location.href = returnTo + encodeURIComponent(JSON.stringify(payload));
        }

        /**
         * Add an "apply and stay" button next to the save button.
         *
         * @returns {void}
         */
        function addApplyButton() {
            var form = document.getElementById('main-form');
            var submitButton = form ? form.querySelector('[type="submit"]') : null;
            var apply;

            if (!form || !submitButton || document.getElementById('fcw2-apply')) {
                return;
            }

            apply = document.createElement('button');
            apply.id = 'fcw2-apply';
            apply.type = 'button';
            apply.className = submitButton.className;
            apply.textContent = 'Применить';
            apply.style.marginBottom = '0.5rem';
            apply.addEventListener('click', function(event) {
                event.preventDefault();
                submitConfig(true);
            });

            submitButton.parentNode.insertBefore(apply, submitButton);
        }

        // Override submit handler to force re-fetch if provider config changed
        $('#main-form').on('submit', function() {
            submitConfig(false);
        })

        addApplyButton();

        clayConfigTheme = clayConfig.getItemByMessageKey('configTheme');
        if (clayConfigTheme) {
            applyConfigTheme(clayConfigTheme.get());
            clayConfigTheme.on('change', function() {
                applyConfigTheme(this.get());
            });
        }
    });
};
