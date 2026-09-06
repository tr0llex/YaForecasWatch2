#include "backlight_tint.h"
#include "watch_services.h"

#define TINT_DISCONNECTED 0x00FF3020
#define TINT_BATTERY_LOW  0x00FFA000
#define BATTERY_LOW_PERCENT 20

/* Deliberately no service subscriptions here: Pebble keeps one battery and one
 * connection handler per app, and battery_layer / calendar_status_layer already
 * own them. Subscribing again would silently replace their handlers, so those
 * call backlight_tint_refresh() instead. */

void backlight_tint_refresh(void) {
#ifdef PBL_COLOR
    const BatteryChargeState battery = watch_services_battery_state();

    if (!connection_service_peek_pebble_app_connection()) {
        light_set_color_rgb888(TINT_DISCONNECTED);
        return;
    }

    if (!battery.is_charging && battery.charge_percent <= BATTERY_LOW_PERCENT) {
        light_set_color_rgb888(TINT_BATTERY_LOW);
        return;
    }

    light_set_system_color();
#endif
}

void backlight_tint_init(void) {
    backlight_tint_refresh();
}

void backlight_tint_deinit(void) {
#ifdef PBL_COLOR
    light_set_system_color();
#endif
}
