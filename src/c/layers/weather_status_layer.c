#include "weather_status_layer.h"
#include <string.h>
#include "c/appendix/ui_fonts.h"
#include "c/appendix/persist.h"
#include "c/appendix/config.h"
#include "c/appendix/memory_log.h"
#include "c/appendix/theme.h"
#include "condition_icon.h"

/* Строка погоды: город слева, текущая температура со значком погоды по центру,
 * время последнего обновления со значком обновления справа. Раньше здесь стояли
 * два времени подряд — обновления и заката — и различить их было нельзя; время
 * заката уехало в верхнюю строку, где рядом с ним рисуется стрелка вверх/вниз.
 *
 * Температура держится ровно по центру строки вместе со значком: это главное
 * число здесь, и ищется оно взглядом по центру, а не по левому краю. */

#define FONT_14_OFFSET 3
#define CITY_INIT_WIDTH 100
/* MARGIN — внешнее поле строки, ROW_GAP — просвет между её элементами. */
#define MARGIN 1
#define ROW_GAP 4
/* Значок погоды слева от температуры и значок обновления слева от времени. */
#define COND_ICON_W 24
/* Ширина рамки значка обновления: даёт кольцо радиусом 4. Мельче не делаем —
 * на радиусе 3 разрыв в кольце не переживает растеризацию (см. комментарий у
 * reload_icon_draw). */
#define RELOAD_ICON_W 10
/* Просвет между значком и временем. Раньше его не было вовсе: кольцо стояло к
 * цифрам вплотную и читалось как ноль перед ними. */
#define RELOAD_ICON_GAP 4
#define FEELS_LIKE_UNAVAILABLE (-32767 - 1)

static GRect frame_curr_temp;
static GRect frame_updated;

static Layer *s_weather_status_layer;
static TextLayer *s_city_layer;
static TextLayer *s_current_temp_layer;
static TextLayer *s_updated_layer;

static void text_layer_move_frame(TextLayer *text_layer, GRect frame) {
    layer_set_frame(text_layer_get_layer(text_layer), frame);
}

#ifdef PBL_PLATFORM_EMERY
// emery: the legacy FONT_*_OFFSET constants encode the internal padding of the
// system Gothic faces. Roboto pads differently, so the row is centred from the
// measured height instead of a hand-tuned offset.
static int emery_text_y(int band_h, int text_h) {
    /* Измеренная высота — строчный бокс Roboto: чернила сидят в нём ниже
     * середины, поэтому одной центровки бокса мало. Восьмая часть бокса — та же
     * поправка, что в клетках календаря и в заголовке даты. */
    const int y = (band_h - text_h) / 2 - text_h / 8;
    return y < 0 ? 0 : y;
}
#endif

/**
 * Drop a trailing partial UTF-8 sequence.
 *
 * persist_read_string() truncates on a byte boundary, which for Cyrillic (two
 * bytes per character) can leave half a character behind and render as garbage.
 */
static void trim_partial_utf8(char *text) {
    int len = (int) strlen(text);
    int i = len - 1;
    int continuation = 0;

    while (i >= 0 && ((unsigned char) text[i] & 0xC0) == 0x80) {
        continuation += 1;
        i -= 1;
    }
    if (i < 0) {
        return;
    }

    const unsigned char lead = (unsigned char) text[i];
    int expected = 0;
    if ((lead & 0x80) == 0x00) expected = 0;
    else if ((lead & 0xE0) == 0xC0) expected = 1;
    else if ((lead & 0xF0) == 0xE0) expected = 2;
    else if ((lead & 0xF8) == 0xF0) expected = 3;

    if (continuation < expected) {
        text[i] = '\0';
    }
}

/** Temperature, centred in the row together with the weather icon. */
static void current_temp_layer_refresh() {
    static char s_temp_buffer[16];
    int feels_like = persist_get_current_feels_like();
    if (g_config->show_feels_like && feels_like != FEELS_LIKE_UNAVAILABLE) {
        /* Без знака градуса число читалось как ещё одна подпись оси. */
        snprintf(s_temp_buffer, sizeof(s_temp_buffer), "%d° (%d°)",
            config_localize_temp(persist_get_current_temp()),
            config_localize_temp(feels_like));
    }
    else {
        snprintf(s_temp_buffer, sizeof(s_temp_buffer), "%d°",
            config_localize_temp(persist_get_current_temp()));
    }
    text_layer_set_text(s_current_temp_layer, s_temp_buffer);

    // Make it big so content doesn't get clipped, then shrink to the measurement.
    text_layer_move_frame(s_current_temp_layer, GRect(0, 0, 100, 100));
    GSize size = text_layer_get_content_size(s_current_temp_layer);
    const GRect bounds = layer_get_bounds(s_weather_status_layer);
#ifdef PBL_PLATFORM_EMERY
    const int temp_y = emery_text_y(bounds.size.h, size.h);
    const int icon_w = COND_ICON_W;
#else
    const int temp_y = -FONT_14_OFFSET;
    const int icon_w = 0;
#endif
    /* По центру строки стоит группа «значок + число», а не одно число: иначе
     * значок утаскивал видимый центр влево. */
    int group_x = (bounds.size.w - (icon_w + size.w)) / 2;
    if (group_x < MARGIN) {
        group_x = MARGIN;
    }

    text_layer_move_frame(s_current_temp_layer, GRect(group_x + icon_w, temp_y, size.w, size.h));
    frame_curr_temp = GRect(group_x, temp_y, icon_w + size.w, size.h);
}

/** Time of the last accepted weather payload, at the right edge. */
static void updated_layer_refresh() {
    static char s_buffer[8];
    const time_t updated = persist_get_weather_updated();
    const GRect bounds = layer_get_bounds(s_weather_status_layer);
    struct tm *updated_tm;
    GSize size;
    int y;

    if (updated == 0) {
        layer_set_hidden(text_layer_get_layer(s_updated_layer), true);
        frame_updated = GRect(bounds.size.w - MARGIN, 0, 0, 0);
        return;
    }

    layer_set_hidden(text_layer_get_layer(s_updated_layer), false);
    updated_tm = localtime(&updated);
    config_format_time(s_buffer, sizeof(s_buffer), updated_tm);
    text_layer_set_text(s_updated_layer, s_buffer);

    text_layer_move_frame(s_updated_layer, GRect(0, 0, 100, 100));
    size = text_layer_get_content_size(s_updated_layer);
#ifdef PBL_PLATFORM_EMERY
    y = emery_text_y(bounds.size.h, size.h);
#else
    y = -FONT_14_OFFSET;
#endif
    /* frame_updated включает значок обновления и просвет за ним: город
     * упирается в значок, а не в сам текст. */
    const int lead = RELOAD_ICON_W + RELOAD_ICON_GAP;
    frame_updated = GRect(bounds.size.w - MARGIN - size.w - lead, y,
                          size.w + lead, size.h);
    text_layer_move_frame(s_updated_layer,
            GRect(frame_updated.origin.x + lead, y, size.w, size.h));
}

/** City name, left-aligned, truncated to whatever the row has left. */
static void city_layer_refresh() {
    // 48 bytes holds ~23 Cyrillic characters; Russian place names such as
    // "Петропавловск-Камчатский" do not fit in the old 20-byte buffer.
    static char s_city_buffer[48];
    persist_get_city(s_city_buffer, sizeof(s_city_buffer));
    s_city_buffer[sizeof(s_city_buffer) - 1] = '\0';
    trim_partial_utf8(s_city_buffer);
    text_layer_set_text(s_city_layer, s_city_buffer);

    GRect bounds = layer_get_bounds(s_weather_status_layer);
    /* Мерить во всю ширину: иначе размер режется рамкой прошлого города. */
    text_layer_move_frame(s_city_layer, GRect(0, 0, bounds.size.w, 100));
    GSize size = text_layer_get_content_size(s_city_layer);
    int y;
    int h;

    (void) bounds;  /* используется только в ветке emery */
#ifdef PBL_PLATFORM_EMERY
    y = emery_text_y(bounds.size.h, size.h);
    h = size.h;
#else
    y = -FONT_14_OFFSET;
    h = size.h + FONT_14_OFFSET;
#endif
    /* Город занимает всё до центральной группы. Он же и уступает место, когда
     * название длинное: обрезать имя города не так больно, как двигать
     * температуру с центра. */
    int w = frame_curr_temp.origin.x - MARGIN - ROW_GAP;
    /* Но уступает не больше, чем нужно. Справа от температуры до времени
     * обновления обычно остаётся воздух, и «Санкт-Петербург» резался в
     * «Санкт-Пете…», пока там было пусто. Длинному городу группа уступает
     * этот воздух: сдвигается вправо ровно настолько, чтобы имя влезло, и не
     * дальше времени обновления. Короткий город центра не трогает. */
    if (size.w > w) {
        const int room_x = frame_updated.origin.x - ROW_GAP - frame_curr_temp.size.w;
        int group_x = MARGIN + size.w + ROW_GAP;
        if (group_x > room_x) {
            group_x = room_x;
        }
        const int shift = group_x - frame_curr_temp.origin.x;
        if (shift > 0) {
            frame_curr_temp.origin.x += shift;
            GRect temp_frame = layer_get_frame(text_layer_get_layer(s_current_temp_layer));
            temp_frame.origin.x += shift;
            text_layer_move_frame(s_current_temp_layer, temp_frame);
            w = frame_curr_temp.origin.x - MARGIN - ROW_GAP;
        }
    }
    if (w < 0) {
        w = 0;
    }
    text_layer_move_frame(s_city_layer, GRect(MARGIN, y, w, h));
}

static void weather_status_layer_init(GRect bounds) {
    int w = bounds.size.w;

    // Current temperature
    s_current_temp_layer = text_layer_create(GRect(MARGIN, 0, 40, 25));
    text_layer_set_background_color(s_current_temp_layer, GColorClear);
    text_layer_set_text_alignment(s_current_temp_layer, GTextAlignmentLeft);
    text_layer_set_text_color(s_current_temp_layer, theme_fg());
#ifdef PBL_PLATFORM_EMERY
    // emery: the reading everyone actually looks for in this row, so it gets
    // the only bold weight here.
    text_layer_set_font(s_current_temp_layer, ui_font_bold_20());
#else
    text_layer_set_font(s_current_temp_layer, ui_font_20());
#endif

    // City where weather was fetched
    s_city_layer = text_layer_create(GRect(MARGIN, 0, CITY_INIT_WIDTH, 25));
    text_layer_set_background_color(s_city_layer, GColorClear);
    text_layer_set_text_alignment(s_city_layer, GTextAlignmentLeft);
    text_layer_set_text_color(s_city_layer, theme_dim());
    text_layer_set_font(s_city_layer, ui_font_12());
    // A name too wide for its share of the row gets an ellipsis rather than
    // being sliced mid-glyph.
    text_layer_set_overflow_mode(s_city_layer, GTextOverflowModeTrailingEllipsis);

    // When the weather itself was last refreshed
    s_updated_layer = text_layer_create(GRect(w - MARGIN - 40, 0, 40, 25));
    text_layer_set_background_color(s_updated_layer, GColorClear);
    text_layer_set_text_alignment(s_updated_layer, GTextAlignmentLeft);
    text_layer_set_text_color(s_updated_layer, theme_dim());
    text_layer_set_font(s_updated_layer, ui_font_12());

    current_temp_layer_refresh();
    updated_layer_refresh();
    city_layer_refresh();
}

static void weather_status_update_proc(Layer *layer, GContext *ctx) {
    MEMORY_LOG_HEAP("weather_status_update:enter");
#ifdef PBL_PLATFORM_EMERY
    GRect bounds = layer_get_bounds(layer);
    /* Осадки в значке рисуются до низа его рамки, поэтому рамку держим на пару
     * пикселей выше строки — иначе капли упираются в график. */
    const int icon_h = bounds.size.h - 4;
    const int icon_y = (bounds.size.h - icon_h) / 2;

    condition_icon_draw(ctx, GRect(frame_curr_temp.origin.x, icon_y, COND_ICON_W - 2, icon_h),
                        persist_get_condition());

    if (!layer_get_hidden(text_layer_get_layer(s_updated_layer))) {
        /* Кольцо центруем по самому времени, а не по всей полосе: полоса выше
         * строки, и по её центру значок вставал ниже цифр. */
        reload_icon_draw(ctx, GRect(frame_updated.origin.x, frame_updated.origin.y,
                                    RELOAD_ICON_W, frame_updated.size.h),
                         theme_dim());
    }
#else
    (void) layer;
    (void) ctx;
#endif
    MEMORY_LOG_HEAP("weather_status_update:exit");
}

void weather_status_layer_create(Layer* parent_layer, GRect frame) {
    s_weather_status_layer = layer_create(frame);
    GRect bounds = layer_get_bounds(s_weather_status_layer);

    weather_status_layer_init(bounds);
    layer_add_child(s_weather_status_layer, text_layer_get_layer(s_city_layer));
    layer_add_child(s_weather_status_layer, text_layer_get_layer(s_current_temp_layer));
    layer_add_child(s_weather_status_layer, text_layer_get_layer(s_updated_layer));
    layer_set_update_proc(s_weather_status_layer, weather_status_update_proc);

    layer_add_child(parent_layer, s_weather_status_layer);
    MEMORY_LOG_HEAP("after_weather_status_layer_create");
}

void weather_status_layer_refresh() {
    if (!s_weather_status_layer) {
        return;
    }
    // Colours are theme-dependent and set at create time, so they are
    // re-applied here for the case where the theme changed since.
    if (s_city_layer) {
        text_layer_set_text_color(s_city_layer, theme_dim());
        text_layer_set_text_color(s_current_temp_layer, theme_fg());
        text_layer_set_text_color(s_updated_layer, theme_dim());
    }
    /* Порядок важен: город меряется от рамки температуры, значки рисуются от
     * обеих рамок, поэтому перерисовку слоя просим последней. */
    current_temp_layer_refresh();
    updated_layer_refresh();
    city_layer_refresh();
    layer_mark_dirty(s_weather_status_layer);
    MEMORY_LOG_HEAP("after_weather_refresh");
}

void weather_status_layer_destroy() {
    /* Same guard the other layers carry: a second destroy must be a no-op,
     * not a double free of text layers whose pointers were left dangling. */
    if (!s_weather_status_layer) {
        return;
    }
    MEMORY_LOG_HEAP("weather_status_layer_destroy:before");
    text_layer_destroy(s_city_layer);
    text_layer_destroy(s_current_temp_layer);
    text_layer_destroy(s_updated_layer);
    layer_destroy(s_weather_status_layer);
    s_city_layer = NULL;
    s_current_temp_layer = NULL;
    s_updated_layer = NULL;
    s_weather_status_layer = NULL;
    MEMORY_LOG_HEAP("weather_status_layer_destroy:after");
}
