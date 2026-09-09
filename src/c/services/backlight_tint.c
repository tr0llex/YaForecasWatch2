#include "backlight_tint.h"
#include "watch_services.h"

#define TINT_DISCONNECTED 0x00FF3020
#define TINT_BATTERY_LOW  0x00FFA000
#define BATTERY_LOW_PERCENT 20

/* Deliberately no service subscriptions here: Pebble keeps one battery and one
 * connection handler per app, and battery_layer / calendar_status_layer already
 * own them. Subscribing again would silently replace their handlers, so those
 * call backlight_tint_refresh() instead. */

/* Последний выставленный оттенок. Обновление зовётся и по событиям, и раз в
 * минуту с тика, а меняется оттенок только при смене связи или заряда: без
 * этой защёлки каждая минута тратилась на системный вызов, который ставил уже
 * стоящее значение. */
#define TINT_SYSTEM 0

#ifdef PBL_COLOR
static uint32_t s_current_tint = TINT_SYSTEM;
static bool s_tint_known;

static void prv_apply_tint(uint32_t tint) {
    if (s_tint_known && tint == s_current_tint) {
        return;
    }
    s_current_tint = tint;
    s_tint_known = true;
    if (tint == TINT_SYSTEM) {
        light_set_system_color();
    } else {
        light_set_color_rgb888(tint);
    }
}
#endif

void backlight_tint_refresh(void) {
#ifdef PBL_COLOR
    const BatteryChargeState battery = watch_services_battery_state();

    if (!connection_service_peek_pebble_app_connection()) {
        prv_apply_tint(TINT_DISCONNECTED);
        return;
    }

    if (!battery.is_charging && battery.charge_percent <= BATTERY_LOW_PERCENT) {
        prv_apply_tint(TINT_BATTERY_LOW);
        return;
    }

    prv_apply_tint(TINT_SYSTEM);
#endif
}

void backlight_tint_init(void) {
    backlight_tint_refresh();
}

void backlight_tint_deinit(void) {
#ifdef PBL_COLOR
    /* Не через защёлку: циферблат уходит, и системный цвет надо вернуть даже
     * если мы считаем, что он уже стоит. */
    s_tint_known = false;
    light_set_system_color();
#endif
}
