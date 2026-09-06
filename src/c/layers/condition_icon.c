#include "condition_icon.h"
#include "c/appendix/theme.h"

/* Значки рисуются кодом, а не битмапами: цвета берутся из темы, а на каждое
 * состояние не нужно держать по паре PNG. Геометрия задана в долях рамки,
 * поэтому один и тот же набор годится и для строки погоды, и для будущих мест.
 *
 * Расчётная рамка — примерно 22x22 в строке погоды. Всё, что мельче 16 px,
 * вырождается: облако перестаёт читаться, капли сливаются с ним. */

#ifdef PBL_COLOR
#define SUN_COLOR   theme_readable(GColorYellow)
#define CLOUD_COLOR theme_dim()
#define RAIN_COLOR  theme_readable(GColorPictonBlue)
#define SNOW_COLOR  theme_fg()
#define BOLT_COLOR  theme_readable(GColorYellow)
#define FOG_COLOR   theme_dim()
#else
#define SUN_COLOR   theme_fg()
#define CLOUD_COLOR theme_fg()
#define RAIN_COLOR  theme_fg()
#define SNOW_COLOR  theme_fg()
#define BOLT_COLOR  theme_fg()
#define FOG_COLOR   theme_fg()
#endif

/* Высота силуэта облака: от верха средней доли до плоского основания. */
#define CLOUD_GLYPH_H 12

/**
 * Draw the sun disc with rays.
 *
 * @param ctx Graphics context.
 * @param c Disc centre.
 * @param r Disc radius.
 * @param rays Whether to draw the rays.
 */
static void prv_draw_sun(GContext *ctx, GPoint c, int r, bool rays) {
    graphics_context_set_fill_color(ctx, SUN_COLOR);
    graphics_fill_circle(ctx, c, r);

    if (!rays) {
        return;
    }

    /* Восемь лучей: четыре по сторонам света и четыре по диагоналям. Диагональ
     * короче на пиксель, иначе она выглядит длиннее прямой — сказывается шаг
     * пикселя по диагонали. */
    graphics_context_set_stroke_color(ctx, SUN_COLOR);
    graphics_context_set_stroke_width(ctx, 1);

    const int in = r + 2;
    const int out = r + 4;
    const int din = (r + 2) * 7 / 10;
    const int dout = (r + 4) * 7 / 10;

    graphics_draw_line(ctx, GPoint(c.x, c.y - in), GPoint(c.x, c.y - out));
    graphics_draw_line(ctx, GPoint(c.x, c.y + in), GPoint(c.x, c.y + out));
    graphics_draw_line(ctx, GPoint(c.x - in, c.y), GPoint(c.x - out, c.y));
    graphics_draw_line(ctx, GPoint(c.x + in, c.y), GPoint(c.x + out, c.y));

    graphics_draw_line(ctx, GPoint(c.x - din, c.y - din), GPoint(c.x - dout, c.y - dout));
    graphics_draw_line(ctx, GPoint(c.x + din, c.y - din), GPoint(c.x + dout, c.y - dout));
    graphics_draw_line(ctx, GPoint(c.x - din, c.y + din), GPoint(c.x - dout, c.y + dout));
    graphics_draw_line(ctx, GPoint(c.x + din, c.y + din), GPoint(c.x + dout, c.y + dout));
}

/**
 * Draw a cloud with a flat base inside the given width band.
 *
 * Силуэт собирается из трёх долей и плоского основания: маленькая слева,
 * большая по центру, средняя справа. Двух долей, как было раньше, не хватало —
 * значок читался как две слипшиеся кляксы, а не как облако.
 *
 * @param ctx Graphics context.
 * @param left Left edge of the cloud.
 * @param right Right edge of the cloud, inclusive.
 * @param base_y Y of the flat base, inclusive.
 * @param color Cloud colour.
 */
static void prv_draw_cloud(GContext *ctx, int left, int right, int base_y, GColor color) {
    const int w = right - left + 1;
    /* Радиусы пропорциональны ширине, чтобы облако не разъезжалось на другой
     * рамке; при w = 22 это 4 / 6 / 5. */
    const int r_mid = w * 6 / 22;
    const int r_left = w * 4 / 22;
    const int r_right = w * 5 / 22;
    const GPoint c_mid = GPoint(left + w * 9 / 22, base_y - r_mid);
    const GPoint c_left = GPoint(left + r_left, base_y - r_left);
    const GPoint c_right = GPoint(right - r_right, base_y - r_right);

    graphics_context_set_fill_color(ctx, color);
    graphics_fill_circle(ctx, c_mid, r_mid);
    graphics_fill_circle(ctx, c_left, r_left);
    graphics_fill_circle(ctx, c_right, r_right);
    /* Основание: доли сами по себе оставляют между собой выемки снизу. */
    graphics_fill_rect(ctx, GRect(left, base_y - r_left, w, r_left + 1), 0, GCornerNone);
}

/**
 * Draw three slanted rain strokes.
 *
 * @param ctx Graphics context.
 * @param left Left edge of the fall area.
 * @param right Right edge, inclusive.
 * @param top Y to start from.
 * @param color Drop colour.
 */
static void prv_draw_rain(GContext *ctx, int left, int right, int top, GColor color) {
    const int w = right - left + 1;
    const int step = w / 4;

    graphics_context_set_stroke_color(ctx, color);
    graphics_context_set_stroke_width(ctx, 1);
    for (int i = 1; i <= 3; ++i) {
        const int x = left + step * i;
        graphics_draw_line(ctx, GPoint(x + 1, top), GPoint(x - 1, top + 4));
    }
}

/**
 * Draw three snowflakes.
 *
 * @param ctx Graphics context.
 * @param left Left edge of the fall area.
 * @param right Right edge, inclusive.
 * @param top Y to start from.
 * @param color Flake colour.
 */
static void prv_draw_snow(GContext *ctx, int left, int right, int top, GColor color) {
    const int w = right - left + 1;
    const int step = w / 4;

    graphics_context_set_stroke_color(ctx, color);
    graphics_context_set_stroke_width(ctx, 1);
    for (int i = 1; i <= 3; ++i) {
        /* Крестик 3x3 вместо точки: точка на этом размере неотличима от капли,
         * а крестик читается как снежинка. Средняя опущена — снег падает не
         * строем. */
        const int x = left + step * i;
        const int y = top + (i == 2 ? 3 : 1);
        graphics_draw_line(ctx, GPoint(x - 1, y), GPoint(x + 1, y));
        graphics_draw_line(ctx, GPoint(x, y - 1), GPoint(x, y + 1));
    }
}

/**
 * Draw a filled lightning bolt.
 *
 * Молния собрана из двух выпуклых треугольников, а не из одного невыпуклого
 * контура: gpath заливает невыпуклый шестиугольник этого размера в бесформенное
 * пятно, а два треугольника рисуются предсказуемо.
 *
 * @param ctx Graphics context.
 * @param cx Horizontal centre.
 * @param top Y to start from.
 */
static void prv_draw_bolt(GContext *ctx, int cx, int top) {
    const GPathInfo upper = {
        .num_points = 3,
        .points = (GPoint[]) { {cx + 3, top}, {cx - 3, top + 4}, {cx + 1, top + 4} }
    };
    const GPathInfo lower = {
        .num_points = 3,
        .points = (GPoint[]) { {cx + 3, top + 3}, {cx - 2, top + 7}, {cx, top + 3} }
    };
    GPath *path;

    graphics_context_set_fill_color(ctx, BOLT_COLOR);

    path = gpath_create(&upper);
    if (path) {
        gpath_draw_filled(ctx, path);
        gpath_destroy(path);
    }
    path = gpath_create(&lower);
    if (path) {
        gpath_draw_filled(ctx, path);
        gpath_destroy(path);
    }
}

void condition_icon_draw(GContext *ctx, GRect box, int condition) {
    const int left = box.origin.x;
    const int right = box.origin.x + box.size.w - 1;
    const int w = box.size.w;
    const int h = box.size.h;
    /* Без осадков силуэт центрируется целиком. С осадками основание облака
     * отсчитывается от нижней кромки так, чтобы капли (и молния) доходили ровно
     * до неё: при отсчёте от верхней кромки под значком оставалась пустая
     * полоска, и облако висело выше, чем у остальных состояний. */
    const int bottom = box.origin.y + h - 1;
    const int base_with_fall = bottom - 7;
    const int base_alone = box.origin.y + (h - CLOUD_GLYPH_H) / 2 + CLOUD_GLYPH_H - 1;
    const int fall_top = base_with_fall + 3;

    if (w < 12 || h < 12) {
        return;
    }

    switch (condition) {
        case WEATHER_CONDITION_CLEAR:
            prv_draw_sun(ctx, GPoint(left + w / 2, box.origin.y + h / 2), w / 5, true);
            break;

        case WEATHER_CONDITION_PARTLY_CLOUDY:
            /* Солнце выглядывает из-за облака слева сверху, поэтому лучей нет:
             * на такой рамке они лезли бы на облако. */
            prv_draw_sun(ctx, GPoint(left + w / 4, box.origin.y + h / 3), w / 6, false);
            prv_draw_cloud(ctx, left + w / 4, right, base_alone, CLOUD_COLOR);
            break;

        case WEATHER_CONDITION_CLOUDY:
            prv_draw_cloud(ctx, left, right, base_alone, CLOUD_COLOR);
            break;

        case WEATHER_CONDITION_RAIN:
            prv_draw_cloud(ctx, left, right, base_with_fall, CLOUD_COLOR);
            prv_draw_rain(ctx, left, right, fall_top, RAIN_COLOR);
            break;

        case WEATHER_CONDITION_SNOW:
            prv_draw_cloud(ctx, left, right, base_with_fall, CLOUD_COLOR);
            prv_draw_snow(ctx, left, right, fall_top, SNOW_COLOR);
            break;

        case WEATHER_CONDITION_THUNDERSTORM:
            prv_draw_cloud(ctx, left, right, base_with_fall, CLOUD_COLOR);
            prv_draw_bolt(ctx, left + w / 2, base_with_fall);
            break;

        case WEATHER_CONDITION_FOG:
            /* Четыре полосы разной длины со сдвигом: единственное состояние без
             * облака, и спутать его не с чем. */
            graphics_context_set_stroke_color(ctx, FOG_COLOR);
            graphics_context_set_stroke_width(ctx, 1);
            for (int i = 0; i < 4; ++i) {
                const int y = box.origin.y + (h - 13) / 2 + i * 4;
                const int x0 = left + ((i % 2) ? 4 : 0);
                const int x1 = right - ((i % 2) ? 0 : 4);
                graphics_draw_line(ctx, GPoint(x0, y), GPoint(x1, y));
            }
            break;

        default:
            break;
    }
}

void reload_icon_draw(GContext *ctx, GRect box, GColor color) {
    /* Значок обновления: почти замкнутое кольцо с наконечником на конце дуги —
     * обычная иконка refresh.
     *
     * Пробовал сделать кольцо мельче (радиус 3) и разомкнуть его шире: на
     * семи пикселях разрыв не выживает при растеризации, а если он всё-таки
     * виден, фигура читается уже не кольцом, а буквой «C». Поэтому кольцо
     * оставлено прежнего радиуса, а от соседних цифр его отделяет просвет
     * (RELOAD_ICON_GAP в weather_status_layer.c) — именно вплотную стоящее
     * кольцо и выглядело ещё одним нулём перед временем. */
    const int size = box.size.w < box.size.h ? box.size.w : box.size.h;
    const int r = size / 2 - 1;
    const GPoint c = GPoint(box.origin.x + box.size.w / 2, box.origin.y + box.size.h / 2);
    const GRect ring = GRect(c.x - r, c.y - r, r * 2 + 1, r * 2 + 1);

    if (r < 2) {
        return;
    }

    graphics_context_set_stroke_color(ctx, color);
    graphics_context_set_stroke_width(ctx, 1);
    /* Разрыв в правом верхнем секторе — туда встаёт наконечник. */
    graphics_draw_arc(ctx, ring, GOvalScaleModeFitCircle,
                      DEG_TO_TRIGANGLE(40), DEG_TO_TRIGANGLE(360));

    graphics_context_set_fill_color(ctx, color);
    graphics_fill_circle(ctx, GPoint(c.x + r, c.y - r + 1), 1);
    graphics_draw_line(ctx, GPoint(c.x + r, c.y - r + 1), GPoint(c.x + r - 2, c.y - r + 3));
}
