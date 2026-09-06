#include <pebble.h>
#include "windows/main_window.h"
#include "appendix/app_message.h"
#include "appendix/persist.h"
#include "appendix/config.h"
#include "appendix/ui_fonts.h"
#include "appendix/memory_log.h"


static void init() {
    MEMORY_LOG_HEAP("boot");
    ui_fonts_load();
    app_message_init();
    persist_init();
    config_load();
    main_window_create();
    MEMORY_LOG_HEAP("after_main_window_create");
}

static void deinit() {
    MEMORY_LOG_HEAP("before_teardown");
    /* Окно сносится первым: window_destroy() дёргает выгрузку окна, а та —
     * деструкторы слоёв, которые читают g_config и шрифты. При обратном
     * порядке они работали с уже освобождённой памятью. */
    main_window_destroy();
    ui_fonts_unload();
    config_unload();
    MEMORY_LOG_HEAP("after_teardown");
}

int main(void) {
    init();
    app_event_loop();
    deinit();
}
