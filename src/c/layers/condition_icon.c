#include "condition_icon.h"
#include "c/appendix/theme.h"

// aplite: not drawn there, see weather_status_layer.c.
#ifndef PBL_PLATFORM_APLITE

static GColor prv_sun_color(void) {
    return PBL_IF_COLOR_ELSE(theme_readable(GColorYellow), theme_fg());
}

static GColor prv_cloud_color(void) {
    return PBL_IF_COLOR_ELSE(theme_readable(GColorLightGray), theme_fg());
}

static GColor prv_rain_color(void) {
    return PBL_IF_COLOR_ELSE(theme_readable(GColorPictonBlue), theme_fg());
}

bool condition_icon_is_known(int condition) {
    return condition > WEATHER_CONDITION_UNKNOWN && condition < WEATHER_CONDITION_COUNT;
}

static void prv_draw_sun(GContext *ctx, GPoint c, int r, bool rays) {
    graphics_context_set_fill_color(ctx, prv_sun_color());
    graphics_fill_circle(ctx, c, r);
    if (!rays) {
        return;
    }

    // Diagonal rays are shortened to look as long as straight ones.
    const int in = r + 2;
    const int out = r + 3;
    const int din = (r + 2) * 7 / 10;
    const int dout = (r + 3) * 7 / 10;
    graphics_context_set_stroke_color(ctx, prv_sun_color());
    graphics_context_set_stroke_width(ctx, 1);
    graphics_draw_line(ctx, GPoint(c.x, c.y - in), GPoint(c.x, c.y - out));
    graphics_draw_line(ctx, GPoint(c.x, c.y + in), GPoint(c.x, c.y + out));
    graphics_draw_line(ctx, GPoint(c.x - in, c.y), GPoint(c.x - out, c.y));
    graphics_draw_line(ctx, GPoint(c.x + in, c.y), GPoint(c.x + out, c.y));
    graphics_draw_line(ctx, GPoint(c.x - din, c.y - din), GPoint(c.x - dout, c.y - dout));
    graphics_draw_line(ctx, GPoint(c.x + din, c.y - din), GPoint(c.x + dout, c.y - dout));
    graphics_draw_line(ctx, GPoint(c.x - din, c.y + din), GPoint(c.x - dout, c.y + dout));
    graphics_draw_line(ctx, GPoint(c.x + din, c.y + din), GPoint(c.x + dout, c.y + dout));
}

// grow enlarges the shape to cut a background halo around the cloud.
static void prv_fill_cloud(GContext *ctx, int left, int w, int base_y, int grow, GColor color) {
    const int r_side = w / 5;
    const int r_mid = w * 3 / 10;
    const GPoint c_left = GPoint(left + r_side, base_y - r_side);
    const GPoint c_right = GPoint(left + w - 1 - r_side, base_y - r_side);
    const GPoint c_mid = GPoint(left + w / 2, base_y - r_side - 1);

    graphics_context_set_fill_color(ctx, color);
    graphics_fill_circle(ctx, c_left, r_side + grow);
    graphics_fill_circle(ctx, c_right, r_side + grow);
    graphics_fill_circle(ctx, c_mid, r_mid + grow);
    graphics_fill_rect(ctx, GRect(left + r_side - grow, base_y - r_side,
                                  w - 2 * r_side + 2 * grow, r_side + 1 + grow),
                       0, GCornerNone);
}

static void prv_draw_cloud(GContext *ctx, int left, int w, int base_y) {
    prv_fill_cloud(ctx, left, w, base_y, 0, prv_cloud_color());
}

static void prv_draw_bolt(GContext *ctx, int cx, int top, int h) {
    // Two pixels wide; a one-pixel bolt disappears at 12 px.
    const int mid = top + h / 2;
    graphics_context_set_stroke_color(ctx, prv_sun_color());
    graphics_context_set_stroke_width(ctx, 1);
    for (int dx = 0; dx <= 1; ++dx) {
        graphics_draw_line(ctx, GPoint(cx + 1 + dx, top - 1), GPoint(cx - 1 + dx, mid));
        graphics_draw_line(ctx, GPoint(cx - 1 + dx, mid), GPoint(cx + 1 + dx, mid));
        graphics_draw_line(ctx, GPoint(cx + 1 + dx, mid), GPoint(cx - 1 + dx, top + h));
    }
}

void condition_icon_draw(GContext *ctx, GRect box, int condition) {
    const int s = box.size.w < box.size.h ? box.size.w : box.size.h;
    const int x0 = box.origin.x + (box.size.w - s) / 2;
    const int y0 = box.origin.y + (box.size.h - s) / 2;

    if (s < 10 || !condition_icon_is_known(condition)) {
        return;
    }

    const int base_low = y0 + s - 2;
    const int base_high = y0 + s * 6 / 10;
    const int fall_top = base_high + 2;
    const int fall_h = y0 + s - 1 - fall_top;

    switch (condition) {
        case WEATHER_CONDITION_CLEAR:
            prv_draw_sun(ctx, GPoint(x0 + s / 2, y0 + s / 2), s / 5, true);
            break;

        case WEATHER_CONDITION_PARTLY_CLOUDY: {
            const int cloud_w = s * 4 / 5;
            prv_draw_sun(ctx, GPoint(x0 + s * 2 / 3, y0 + s / 3), s / 4, false);
            // The halo separates cloud and sun on black-and-white screens.
            prv_fill_cloud(ctx, x0, cloud_w, base_low, 1, theme_bg());
            prv_draw_cloud(ctx, x0, cloud_w, base_low);
            break;
        }

        case WEATHER_CONDITION_CLOUDY:
            prv_draw_cloud(ctx, x0, s, base_low);
            break;

        case WEATHER_CONDITION_RAIN:
            prv_draw_cloud(ctx, x0, s, base_high);
            graphics_context_set_stroke_color(ctx, prv_rain_color());
            graphics_context_set_stroke_width(ctx, 1);
            for (int i = 1; i <= 3; ++i) {
                const int x = x0 + s * i / 4;
                graphics_draw_line(ctx, GPoint(x, fall_top), GPoint(x - 1, fall_top + fall_h));
            }
            break;

        case WEATHER_CONDITION_SNOW:
            prv_draw_cloud(ctx, x0, s, base_high);
            graphics_context_set_fill_color(ctx, theme_fg());
            for (int i = 1; i <= 3; ++i) {
                const int x = x0 + s * i / 4 - 1;
                const int y = fall_top + ((i == 2) ? fall_h - 1 : 0);
                graphics_fill_rect(ctx, GRect(x, y, 2, 2), 0, GCornerNone);
            }
            break;

        case WEATHER_CONDITION_THUNDERSTORM:
            prv_draw_cloud(ctx, x0, s, base_high);
            prv_draw_bolt(ctx, x0 + s / 2, fall_top, fall_h);
            break;

        case WEATHER_CONDITION_FOG:
            graphics_context_set_stroke_color(ctx, prv_cloud_color());
            graphics_context_set_stroke_width(ctx, 1);
            for (int i = 0; i < 3; ++i) {
                const int y = y0 + s * (i + 1) / 4;
                const int inset = (i % 2) ? 2 : 0;
                graphics_draw_line(ctx, GPoint(x0 + inset, y), GPoint(x0 + s - 1 - (2 - inset), y));
            }
            break;

        default:
            break;
    }
}
#endif
