#include "forecast_layer.h"
#include "c/appendix/theme.h"
#include "c/appendix/ui_fonts.h"
#include "c/appendix/persist.h"
#include "c/appendix/math.h"
#include "c/appendix/config.h"
#include "c/appendix/memory_log.h"
#include "c/services/watch_services.h"

#define LEFT_AXIS_LABEL_STRIP_MIN_W 15
/* Цифры слева прижимались вплотную к вертикальной оси. */
#define LEFT_AXIS_LABEL_TO_GRAPH_GAP 4
#define LEFT_AXIS_GRAPH_INSET_DEFAULT (LEFT_AXIS_LABEL_STRIP_MIN_W + LEFT_AXIS_LABEL_TO_GRAPH_GAP)
#ifdef PBL_PLATFORM_EMERY
/* Хватает на двузначное «10» шрифтом 12 px вместе с длинным штрихом шкалы. */
#define RIGHT_UV_AXIS_W 23
#else
#define RIGHT_UV_AXIS_W 19
#endif
#define UV_AXIS_MINOR_TICK_W 2
#define UV_AXIS_MAJOR_TICK_W 5
#define UV_AXIS_LABEL_GAP 2
#define TEMP_LABEL_PAD 2
#define TEMP_LABEL_H 20
#define TEMP_LABEL_MEASURE_BOX_W 200
#define TEMP_LABEL_MEASURE_BOX_H 40
#define BOTTOM_AXIS_FONT_OFFSET 4 // Adjustment for whitespace at top of font
#ifdef PBL_PLATFORM_EMERY
/* Подписям часов шрифтом 12 px нужно ~13 px плюс зазор до самой оси. */
#define BOTTOM_AXIS_H 15
#else
#define BOTTOM_AXIS_H 10          // Height of the bottom axis (hour labels)
#endif
#define MARGIN_TEMP_H 7           // Height of margins for the temperature plot
// emery: reserve extra bottom space for larger hour labels and tick marks.
#ifdef PBL_PLATFORM_EMERY
#define HOUR_LABEL_MIN_SPACING 24 // Minimum horizontal spacing for hour labels
/* 10 px внизу полосы никто не рисовал — график просто не доходил до кромки. */
#define FORECAST_BOTTOM_PAD 1
#define EMERY_AXIS_LABEL_TOP 2
#define EMERY_AXIS_LABEL_H 13
#else
#define HOUR_LABEL_MIN_SPACING 20 // Minimum horizontal spacing for hour labels
#define FORECAST_BOTTOM_PAD 0
#endif
/* Штриховка кроет всю высоту графика, включая пустое небо над кривой; при
 * шаге 6 px на полутора дюймах это заметный шум. */
#define NIGHT_HATCH_SPACING PBL_IF_COLOR_ELSE(8, 7)
#define NIGHT_HATCH_COLOR PBL_IF_COLOR_ELSE(theme_dim(), theme_fg())
#define PRECIP_FILL_COLOR PBL_IF_COLOR_ELSE(GColorCobaltBlue, GColorLightGray)
/* На тёмной теме тёмно-синяя ночная заливка давала контраст 2.15 к чёрному
 * и пропадала; ночь и без того размечена штриховкой и границами. */
#define NIGHT_PRECIP_FILL_COLOR PBL_IF_COLOR_ELSE(theme_night_precip(), GColorLightGray)
#define NIGHT_HATCH_COLOR_PRECIP PBL_IF_COLOR_ELSE(theme_night_hatch_precip(), GColorWhite)
#define NIGHT_BOUNDARY_COLOR PBL_IF_COLOR_ELSE(theme_dim(), GColorLightGray)
#define NIGHT_BOUNDARY_COLOR_PRECIP PBL_IF_COLOR_ELSE(GColorVividCerulean, GColorWhite)
#define FORECAST_STEP_SECONDS (60 * 60)
#define DAY_SECONDS (24 * 60 * 60)
#define UV_INDEX_MAX 11
#define UV_INDEX_UNAVAILABLE 255
#define FEELS_LIKE_UNAVAILABLE (-32767 - 1)
#define FEELS_LIKE_DOT_RADIUS PBL_IF_COLOR_ELSE(2, 1)

typedef struct
{
    time_t start;
    time_t end;
} NightSegment;

typedef struct
{
    int count;
    NightSegment segments[3];
} NightSegments;

typedef struct
{
    time_t timestamp;
    int type; // 0 = sunrise, 1 = sunset
} SunEvent;

typedef struct
{
    bool draw_night_overlay;
    GColor axis_color;
} RenderSpec;

typedef struct
{
    GRect graph_bounds;
    GRect graph_plot_rect;
    int16_t w;
    int16_t h;
} ForecastLayout;

static Layer *s_forecast_layer;
static int s_axis_left_w = LEFT_AXIS_GRAPH_INSET_DEFAULT;
static int s_label_strip_w = LEFT_AXIS_LABEL_STRIP_MIN_W;
static char s_buffer_lo[12];
static char s_buffer_hi[12];
static GPoint s_points_temp[MAX_FORECAST_ENTRIES];
static GPoint s_points_feels_like[MAX_FORECAST_ENTRIES];
static GPoint s_points_precip[MAX_FORECAST_ENTRIES + 2];
static GPoint s_points_uv[MAX_FORECAST_ENTRIES];
static GPath s_path_precip_area_under;
static GPath s_path_precip_top;
static GPath s_path_temp;
static GPath s_path_uv;

static bool is_feels_like_available(int16_t temp)
{
    return temp != FEELS_LIKE_UNAVAILABLE;
}

static int forecast_visible_offset(time_t forecast_start, int num_entries)
{
    const time_t now = watch_services_now();

    if (num_entries < 2 || now <= forecast_start)
    {
        return 0;
    }

    int offset = (int)((now - forecast_start) / FORECAST_STEP_SECONDS);
    const int max_offset = num_entries - 2;
    return offset < max_offset ? offset : max_offset;
}

static RenderSpec make_render_spec()
{
    RenderSpec spec = {
        .draw_night_overlay = g_config->day_night_shading,
        .axis_color = PBL_IF_COLOR_ELSE(theme_dim(), GColorWhite)};

    return spec;
}

static ForecastLayout compute_layout(GRect bounds)
{
    ForecastLayout layout;
    layout.graph_bounds = GRect(s_axis_left_w, 0, bounds.size.w - s_axis_left_w - RIGHT_UV_AXIS_W,
                                bounds.size.h - FORECAST_BOTTOM_PAD);
    layout.graph_plot_rect = GRect(layout.graph_bounds.origin.x, 0, layout.graph_bounds.size.w, layout.graph_bounds.size.h - BOTTOM_AXIS_H);
    layout.w = layout.graph_bounds.size.w;
    layout.h = layout.graph_bounds.size.h;
    return layout;
}

static void draw_uv_axis(GContext *ctx, GRect graph_plot_rect)
{
    const int16_t axis_x = graph_plot_rect.origin.x + graph_plot_rect.size.w;
    const int16_t axis_bottom = graph_plot_rect.origin.y + graph_plot_rect.size.h;
    const GColor uv_color = PBL_IF_COLOR_ELSE(theme_warm(), GColorWhite);

    graphics_context_set_stroke_color(ctx, uv_color);
    graphics_context_set_text_color(ctx, uv_color);
    graphics_context_set_stroke_width(ctx, 1);
    graphics_draw_line(ctx, GPoint(axis_x, graph_plot_rect.origin.y), GPoint(axis_x, axis_bottom));

    for (int uv_index = 1; uv_index <= UV_INDEX_MAX; ++uv_index)
    {
        const int16_t tick_y = axis_bottom - uv_index * graph_plot_rect.size.h / UV_INDEX_MAX;
        const bool is_major_tick = uv_index == 5 || uv_index == 10;
        const int16_t tick_w = is_major_tick ? UV_AXIS_MAJOR_TICK_W : UV_AXIS_MINOR_TICK_W;
        graphics_draw_line(ctx, GPoint(axis_x, tick_y), GPoint(axis_x + tick_w, tick_y));

        if (is_major_tick)
        {
            char label[3];
            const GFont label_font = ui_font_axis();
            const int16_t label_w = RIGHT_UV_AXIS_W - UV_AXIS_MAJOR_TICK_W - UV_AXIS_LABEL_GAP;
            GSize label_size;

            snprintf(label, sizeof(label), "%d", uv_index);
            /* Сдвиг на 8 px подбирался под шрифт 16 px; теперь высоту меряем,
             * чтобы цифра стояла ровно на своём штрихе. */
            label_size = graphics_text_layout_get_content_size(
                    label, label_font, GRect(0, 0, label_w, 40),
                    GTextOverflowModeFill, GTextAlignmentLeft);
            graphics_draw_text(ctx, label,
                               label_font,
                               GRect(axis_x + UV_AXIS_MAJOR_TICK_W + UV_AXIS_LABEL_GAP,
                                     tick_y - label_size.h / 2, label_w, label_size.h),
                               GTextOverflowModeFill,
                               GTextAlignmentLeft,
                               NULL);
        }
    }
}

static void night_segments_add(NightSegments *night_segments, time_t start, time_t end)
{
    if (night_segments->count >= (int)(sizeof(night_segments->segments) / sizeof(night_segments->segments[0])) || end <= start)
    {
        return;
    }

    night_segments->segments[night_segments->count].start = start;
    night_segments->segments[night_segments->count].end = end;
    night_segments->count += 1;
}

static bool get_valid_sun_events(time_t sun_event_times[2], int *sun_event_start_type)
{
    const int num_sun_events = 2;
    const int sun_events_read = persist_get_sun_event_times(sun_event_times, num_sun_events);
    if (sun_events_read < (int)(sizeof(time_t) * num_sun_events))
    {
        return false;
    }

    const int start_type = persist_get_sun_event_start_type();
    if ((start_type != 0 && start_type != 1) || sun_event_times[0] <= 0 || sun_event_times[1] <= 0 || sun_event_times[1] <= sun_event_times[0])
    {
        return false;
    }

    if (sun_event_start_type)
    {
        *sun_event_start_type = start_type;
    }

    return true;
}

static NightSegments compute_night_segments(time_t graph_start, time_t graph_end)
{
    NightSegments night_segments = {0};

    if (graph_end <= graph_start)
    {
        return night_segments;
    }

    time_t sun_event_times[2] = {0, 0};
    int sun_event_start_type;
    if (!get_valid_sun_events(sun_event_times, &sun_event_start_type))
    {
        return night_segments;
    }

    SunEvent events[6];
    int event_count = 0;

    for (int day_offset = -1; day_offset <= 1; ++day_offset)
    {
        const time_t offset_seconds = (time_t)day_offset * DAY_SECONDS;
        events[event_count++] = (SunEvent){
            .timestamp = sun_event_times[0] + offset_seconds,
            .type = sun_event_start_type};
        events[event_count++] = (SunEvent){
            .timestamp = sun_event_times[1] + offset_seconds,
            .type = 1 - sun_event_start_type};
    }

    for (int i = 1; i < event_count; ++i)
    {
        SunEvent current = events[i];
        int j = i - 1;
        while (j >= 0 && events[j].timestamp > current.timestamp)
        {
            events[j + 1] = events[j];
            --j;
        }
        events[j + 1] = current;
    }

    for (int i = 0; i < event_count - 1; ++i)
    {
        const SunEvent event_start = events[i];
        const SunEvent event_end = events[i + 1];
        if (event_start.type != 1 || event_end.type != 0)
        {
            continue;
        }

        night_segments_add(&night_segments, event_start.timestamp, event_end.timestamp);
    }

    return night_segments;
}

static int16_t graph_x_for_time(time_t timestamp, time_t graph_start, time_t graph_end, GRect graph_plot_rect)
{
    const int16_t graph_left = graph_plot_rect.origin.x;
    const int16_t graph_right = graph_plot_rect.origin.x + graph_plot_rect.size.w;

    if (timestamp <= graph_start)
    {
        return graph_left;
    }
    if (timestamp >= graph_end)
    {
        return graph_right;
    }

    // The forecast window is bounded (<= (MAX_FORECAST_ENTRIES-1) * FORECAST_STEP_SECONDS,
    // ~82800s) and elapsed <= total, so elapsed * size.w stays well within int32. Narrowing
    // from int64 here drops __udivmoddi4/__divdi3 from the binary; the int32 divide is a
    // single hardware instruction on the Cortex-M3.
    const int32_t elapsed = (int32_t)(timestamp - graph_start);
    const int32_t total = (int32_t)(graph_end - graph_start);
    return graph_left + (int16_t)((elapsed * graph_plot_rect.size.w) / total);
}

static int16_t aligned_hatch_start_y(int16_t x, int16_t y_start, int16_t spacing)
{
    int16_t modulo = (x + y_start) % spacing;
    if (modulo < 0)
    {
        modulo += spacing;
    }

    if (modulo == 0)
    {
        return y_start;
    }

    return y_start + (spacing - modulo);
}

static void draw_night_hatch_rect(GContext *ctx, GRect rect, int16_t spacing)
{
    if (spacing <= 0 || rect.size.w <= 0 || rect.size.h <= 0)
    {
        return;
    }

    const int16_t x_end = rect.origin.x + rect.size.w;
    const int16_t y_end = rect.origin.y + rect.size.h;
    for (int16_t x = rect.origin.x; x < x_end; ++x)
    {
        int16_t hatch_y = aligned_hatch_start_y(x, rect.origin.y, spacing);
        for (int16_t y = hatch_y; y < y_end; y += spacing)
        {
            graphics_draw_pixel(ctx, GPoint(x, y));
        }
    }
}

static void draw_night_regions(GContext *ctx, GRect graph_plot_rect, time_t graph_start, time_t graph_end,
                               const NightSegments *night_segments)
{
    if (!night_segments || night_segments->count == 0)
    {
        return;
    }

    const int16_t graph_left = graph_plot_rect.origin.x;
    const int16_t graph_right = graph_plot_rect.origin.x + graph_plot_rect.size.w;

    const int16_t hatch_spacing = NIGHT_HATCH_SPACING;
    const bool is_color = PBL_IF_COLOR_ELSE(true, false);
    graphics_context_set_stroke_color(ctx, is_color ? NIGHT_HATCH_COLOR : theme_fg());

    for (int i = 0; i < night_segments->count; ++i)
    {
        int16_t x0 = graph_x_for_time(night_segments->segments[i].start, graph_start, graph_end, graph_plot_rect);
        int16_t x1 = graph_x_for_time(night_segments->segments[i].end, graph_start, graph_end, graph_plot_rect);

        if (x0 < graph_left)
        {
            x0 = graph_left;
        }
        if (x1 > graph_right)
        {
            x1 = graph_right;
        }
        if (x1 <= x0)
        {
            continue;
        }

        GRect night_rect = GRect(x0, graph_plot_rect.origin.y, x1 - x0, graph_plot_rect.size.h);
        draw_night_hatch_rect(ctx, night_rect, hatch_spacing);
    }
}

static int16_t precip_top_y_for_x(const GPoint *points_precip, int num_entries, int16_t x)
{
    if (x <= points_precip[0].x)
    {
        return points_precip[0].y;
    }

    for (int i = 0; i < num_entries - 1; ++i)
    {
        const int16_t x0 = points_precip[i].x;
        const int16_t y0 = points_precip[i].y;
        const int16_t x1 = points_precip[i + 1].x;
        const int16_t y1 = points_precip[i + 1].y;

        if (x > x1)
        {
            continue;
        }

        if (x1 == x0)
        {
            return y0 < y1 ? y0 : y1;
        }

        return y0 + (int16_t)(((int32_t)(y1 - y0) * (x - x0)) / (x1 - x0));
    }

    return points_precip[num_entries - 1].y;
}

static int16_t clamped_precip_top_y_for_x(GRect graph_plot_rect,
                                          const GPoint *points_precip, int num_entries, int16_t x)
{
    const int16_t y_top_limit = graph_plot_rect.origin.y;
    int16_t precip_y = precip_top_y_for_x(points_precip, num_entries, x);
    if (precip_y < y_top_limit)
    {
        precip_y = y_top_limit;
    }

    return precip_y;
}

static void draw_night_hatch_over_precip(GContext *ctx, GRect graph_plot_rect, time_t graph_start, time_t graph_end,
                                         const NightSegments *night_segments,
                                         const GPoint *points_precip, int num_entries)
{
    if (!night_segments || night_segments->count == 0)
    {
        return;
    }

    const int16_t graph_left = graph_plot_rect.origin.x;
    const int16_t graph_right = graph_plot_rect.origin.x + graph_plot_rect.size.w;
    const int16_t y_bottom_exclusive = graph_plot_rect.origin.y + graph_plot_rect.size.h;
    const int16_t y_bottom_inclusive = y_bottom_exclusive - 1;
    const int16_t hatch_spacing = NIGHT_HATCH_SPACING;
    const bool is_color = PBL_IF_COLOR_ELSE(true, false);

    for (int i = 0; i < night_segments->count; ++i)
    {
        int16_t x0 = graph_x_for_time(night_segments->segments[i].start, graph_start, graph_end, graph_plot_rect);
        int16_t x1 = graph_x_for_time(night_segments->segments[i].end, graph_start, graph_end, graph_plot_rect);

        if (x0 < graph_left)
        {
            x0 = graph_left;
        }
        if (x1 > graph_right)
        {
            x1 = graph_right;
        }
        if (x1 <= x0)
        {
            continue;
        }

        if (is_color)
        {
            graphics_context_set_stroke_color(ctx, NIGHT_PRECIP_FILL_COLOR);
            for (int16_t x = x0; x < x1; ++x)
            {
                const int16_t precip_y = clamped_precip_top_y_for_x(graph_plot_rect, points_precip, num_entries, x);
                if (precip_y <= y_bottom_inclusive)
                {
                    graphics_draw_line(ctx, GPoint(x, precip_y), GPoint(x, y_bottom_inclusive));
                }
            }
        }

        graphics_context_set_stroke_color(ctx, is_color ? NIGHT_HATCH_COLOR_PRECIP : theme_fg());
        for (int16_t x = x0; x < x1; ++x)
        {
            const int16_t precip_y = clamped_precip_top_y_for_x(graph_plot_rect, points_precip, num_entries, x);
            int16_t hatch_y = aligned_hatch_start_y(x, precip_y, hatch_spacing);
            for (int16_t y = hatch_y; y < y_bottom_exclusive; y += hatch_spacing)
            {
                graphics_draw_pixel(ctx, GPoint(x, y));
            }
        }
    }
}

static void draw_night_boundaries(GContext *ctx, GRect graph_plot_rect, time_t graph_start, time_t graph_end,
                                  const NightSegments *night_segments)
{
    if (!night_segments || night_segments->count == 0)
    {
        return;
    }

    graphics_context_set_stroke_color(ctx, NIGHT_BOUNDARY_COLOR);
    graphics_context_set_stroke_width(ctx, 1);

    const int16_t y0 = graph_plot_rect.origin.y;
    const int16_t y1 = graph_plot_rect.origin.y + graph_plot_rect.size.h - 1;
    for (int i = 0; i < night_segments->count; ++i)
    {
        const time_t segment_start = night_segments->segments[i].start;
        const time_t segment_end = night_segments->segments[i].end;

        if (segment_start > graph_start && segment_start < graph_end)
        {
            const int16_t start_x = graph_x_for_time(segment_start, graph_start, graph_end, graph_plot_rect);
            graphics_draw_line(ctx, GPoint(start_x, y0), GPoint(start_x, y1));
        }

        if (segment_end > graph_start && segment_end < graph_end)
        {
            const int16_t end_x = graph_x_for_time(segment_end, graph_start, graph_end, graph_plot_rect);
            graphics_draw_line(ctx, GPoint(end_x, y0), GPoint(end_x, y1));
        }
    }
}

static void draw_night_boundaries_over_precip(GContext *ctx, GRect graph_plot_rect, time_t graph_start, time_t graph_end,
                                               const NightSegments *night_segments,
                                               const GPoint *points_precip, int num_entries)
{
    if (!night_segments || night_segments->count == 0)
    {
        return;
    }

    graphics_context_set_stroke_color(ctx, NIGHT_BOUNDARY_COLOR_PRECIP);
    graphics_context_set_stroke_width(ctx, 1);

    const int16_t y_bottom = graph_plot_rect.origin.y + graph_plot_rect.size.h - 1;
    for (int i = 0; i < night_segments->count; ++i)
    {
        const time_t segment_start = night_segments->segments[i].start;
        const time_t segment_end = night_segments->segments[i].end;

        if (segment_start > graph_start && segment_start < graph_end)
        {
            const int16_t start_x = graph_x_for_time(segment_start, graph_start, graph_end, graph_plot_rect);
            const int16_t start_precip_y = clamped_precip_top_y_for_x(graph_plot_rect, points_precip, num_entries, start_x);
            graphics_draw_line(ctx, GPoint(start_x, start_precip_y), GPoint(start_x, y_bottom));
        }

        if (segment_end > graph_start && segment_end < graph_end)
        {
            const int16_t end_x = graph_x_for_time(segment_end, graph_start, graph_end, graph_plot_rect);
            const int16_t end_precip_y = clamped_precip_top_y_for_x(graph_plot_rect, points_precip, num_entries, end_x);
            graphics_draw_line(ctx, GPoint(end_x, end_precip_y), GPoint(end_x, y_bottom));
        }
    }
}

#ifdef PBL_PLATFORM_EMERY
static GSize temp_label_size_with_font(const char *text, GFont font);
#else
static GSize temp_label_string_size(const char *text);
#endif

static void forecast_update_proc(Layer *layer, GContext *ctx)
{
    MEMORY_LOG_HEAP("forecast_update:enter");
    GRect bounds = layer_get_bounds(layer);
    RenderSpec render_spec = make_render_spec();
    ForecastLayout layout = compute_layout(bounds);
    GRect graph_bounds = layout.graph_bounds;
    GRect graph_plot_rect = layout.graph_plot_rect;
    int w = layout.w;
    int h = layout.h;

    // Load data from storage
    const int raw_num_entries = persist_get_num_entries();
    const int stored_num_entries = raw_num_entries > MAX_FORECAST_ENTRIES ? MAX_FORECAST_ENTRIES : raw_num_entries;
    MemoryHeapProbe redraw_probe = MEMORY_HEAP_PROBE_START("forecast_update");
    if (stored_num_entries < 2)
    {
        graphics_context_set_fill_color(ctx, theme_bg());
        graphics_fill_rect(ctx, bounds, 0, GCornerNone);
        MEMORY_LOG_HEAP("forecast_update:exit");
        return;
    }

    const time_t stored_forecast_start = persist_get_forecast_start();
    const int data_offset = forecast_visible_offset(stored_forecast_start, stored_num_entries);
    const int num_entries = stored_num_entries - data_offset;
    const time_t forecast_start = stored_forecast_start + data_offset * FORECAST_STEP_SECONDS;
    const time_t forecast_end = forecast_start + (num_entries - 1) * FORECAST_STEP_SECONDS;
    NightSegments night_segments = {0};
    struct tm *forecast_start_local = localtime(&forecast_start);
    int16_t temps[MAX_FORECAST_ENTRIES] = {0};
    int16_t feels_like_temps[MAX_FORECAST_ENTRIES];
    uint8_t precips[MAX_FORECAST_ENTRIES] = {0};
    uint8_t uv_indices[MAX_FORECAST_ENTRIES];
    memset(feels_like_temps, FEELS_LIKE_UNAVAILABLE, sizeof(feels_like_temps));
    memset(uv_indices, UV_INDEX_UNAVAILABLE, sizeof(uv_indices));
    persist_get_temp_trend(temps, stored_num_entries);
    persist_get_feels_like_trend(feels_like_temps, stored_num_entries);
    persist_get_precip_trend(precips, stored_num_entries);
    persist_get_uv_trend(uv_indices, stored_num_entries);

    // Allocate point arrays for plots
    // Calculate the temperature range
    int lo, hi;
    min_max(temps + data_offset, num_entries, &lo, &hi);
    bool has_feels_like_data = false;
    if (g_config->show_feels_like)
    {
        for (int i = data_offset; i < stored_num_entries; ++i)
        {
            if (is_feels_like_available(feels_like_temps[i]))
            {
                has_feels_like_data = true;
                if (feels_like_temps[i] < lo)
                {
                    lo = feels_like_temps[i];
                }
                if (feels_like_temps[i] > hi)
                {
                    hi = feels_like_temps[i];
                }
            }
        }
    }
    int range = hi - lo;
    const int temp_plot_h = h - MARGIN_TEMP_H * 2 - BOTTOM_AXIS_H;
    const int range_safe = range > 0 ? range : 1;

    // Draw a bounding box for each data entry (the -1 is since we don't want a gap on either side).
    // Pixels per entry is the exact rational graph_w/span; entry positions use integer
    // multiply-before-divide so the soft-float library stays out of the binary.
    const int graph_w = graph_bounds.size.w;
    const int span = num_entries - 1;
    bool has_uv_data = false;
    if (render_spec.draw_night_overlay)
    {
        night_segments = compute_night_segments(forecast_start, forecast_end);
        draw_night_regions(ctx, graph_plot_rect, forecast_start, forecast_end, &night_segments);
        draw_night_boundaries(ctx, graph_plot_rect, forecast_start, forecast_end, &night_segments);
    }

    graphics_context_set_text_color(ctx, theme_fg());
    graphics_context_set_stroke_color(ctx, GColorLightGray);

    // Round this division up by adding (divisor - 1) to the dividend.
    const int entries_per_label = ((HOUR_LABEL_MIN_SPACING - 1) * span + graph_w) / graph_w;
    for (int i = 0; i < num_entries; ++i)
    {
        const int data_i = i + data_offset;
        int entry_x = graph_bounds.origin.x + i * graph_w / span;

        // Save a point for the precipitation probability
        int precip = precips[data_i];
        int precip_h = precip * (h - BOTTOM_AXIS_H) / 100;
        s_points_precip[i] = GPoint(entry_x, h - BOTTOM_AXIS_H - precip_h);

        // Save a point for the temperature reading
        int temp = temps[data_i];
        int temp_h = temp_plot_h / 2;
        if (range > 0)
        {
            temp_h = (int)(((int32_t)(temp - lo) * temp_plot_h) / range_safe);
        }
        s_points_temp[i] = GPoint(entry_x, h - temp_h - MARGIN_TEMP_H - BOTTOM_AXIS_H);

        if (has_feels_like_data && is_feels_like_available(feels_like_temps[data_i]))
        {
            int feels_like_h = temp_plot_h / 2;
            if (range > 0)
            {
                feels_like_h = (int)(((int32_t)(feels_like_temps[data_i] - lo) * temp_plot_h) / range_safe);
            }
            s_points_feels_like[i] = GPoint(entry_x, h - feels_like_h - MARGIN_TEMP_H - BOTTOM_AXIS_H);
        }

        int uv_index = uv_indices[data_i];
        if (uv_index != UV_INDEX_UNAVAILABLE)
        {
            has_uv_data = true;
            if (uv_index > UV_INDEX_MAX)
            {
                uv_index = UV_INDEX_MAX;
            }
        }
        else
        {
            uv_index = 0;
        }
        const int uv_h = uv_index * graph_plot_rect.size.h / UV_INDEX_MAX;
        s_points_uv[i] = GPoint(entry_x, graph_plot_rect.origin.y + graph_plot_rect.size.h - uv_h);

        // emery: draw emphasized major/minor bottom-axis ticks for improved readability.
#ifdef PBL_PLATFORM_EMERY
        /* Цвета были прибиты гвоздями: на тёмной теме мелкие штрихи давали
         * контраст 2.77 к чёрному, на светлой пропадали крупные. Берём из темы:
         * штрих под подписью — основным цветом, промежуточные — приглушённым. */
        const bool is_label_tick = (i % entries_per_label) == 0;
        const GColor tick_color = is_label_tick ? theme_fg() : theme_dim();
        graphics_context_set_stroke_width(ctx, 1);
        graphics_context_set_stroke_color(ctx, tick_color);
        graphics_draw_line(ctx,
                           GPoint(entry_x, h - BOTTOM_AXIS_H - 0),
                           GPoint(entry_x, h - BOTTOM_AXIS_H + (is_label_tick ? 6 : 4)));
#endif
    }

// non-emery: draw labels with classic font-offset positioning and midpoint ticks.
#ifndef PBL_PLATFORM_EMERY
    for (int label_i = 0; label_i < num_entries; label_i += entries_per_label)
    {
        const int label_x = graph_bounds.origin.x + label_i * graph_w / span;
        char buf[4];

        snprintf(buf, sizeof(buf), "%d", config_axis_hour(forecast_start_local->tm_hour + label_i));
        const int label_y = h - BOTTOM_AXIS_H - BOTTOM_AXIS_FONT_OFFSET;
        const int label_h = BOTTOM_AXIS_H;
        graphics_draw_text(ctx, buf,
                           ui_font_axis(),
                           GRect(label_x - 20, label_y, 40, label_h),
                           GTextOverflowModeWordWrap,
                           GTextAlignmentCenter,
                           NULL);

        const int next_label_i = label_i + entries_per_label;
        const int midpoint_i = label_i + entries_per_label / 2;
        if (midpoint_i > label_i && midpoint_i < next_label_i && midpoint_i < num_entries)
        {
            const int tick_x = graph_bounds.origin.x + midpoint_i * graph_w / span;
            graphics_draw_line(ctx,
                               GPoint(tick_x, h - BOTTOM_AXIS_H - 0),
                               GPoint(tick_x, h - BOTTOM_AXIS_H + 4));
        }
    }
// emery: draw labels lower in the reserved pad and skip midpoint tick loop.
#else
    for (int label_i = 0; label_i < num_entries; label_i += entries_per_label)
    {
        const int label_x = graph_bounds.origin.x + label_i * graph_w / span;
        char buf[4];

        snprintf(buf, sizeof(buf), "%d", config_axis_hour(forecast_start_local->tm_hour + label_i));
        const int label_y = h - BOTTOM_AXIS_H + EMERY_AXIS_LABEL_TOP;
        const int label_h = EMERY_AXIS_LABEL_H;
        graphics_draw_text(ctx, buf,
                           ui_font_axis(),
                           GRect(label_x - 20, label_y, 40, label_h),
                           GTextOverflowModeWordWrap,
                           GTextAlignmentCenter,
                           NULL);
    }
#endif

    // Complete the area under the precipitation
    s_points_precip[num_entries] = GPoint(graph_bounds.origin.x + w, h - BOTTOM_AXIS_H);
    s_points_precip[num_entries + 1] = GPoint(graph_bounds.origin.x, h - BOTTOM_AXIS_H);

    // Fill the precipitation area
    s_path_precip_area_under.num_points = num_entries + 2;
    s_path_precip_area_under.points = s_points_precip;
    MEMORY_HEAP_PROBE_SAMPLE("before_precip_path_draw", &redraw_probe);
    graphics_context_set_fill_color(ctx, PRECIP_FILL_COLOR);
    gpath_draw_filled(ctx, &s_path_precip_area_under);
    MEMORY_HEAP_PROBE_SAMPLE("after_precip_path_draw", &redraw_probe);

    if (render_spec.draw_night_overlay)
    {
        draw_night_hatch_over_precip(ctx, graph_plot_rect, forecast_start, forecast_end, &night_segments,
                                     s_points_precip, num_entries);
        draw_night_boundaries_over_precip(ctx, graph_plot_rect, forecast_start, forecast_end, &night_segments,
                                          s_points_precip, num_entries);
    }

    // Draw the precipitation line
    s_path_precip_top.num_points = num_entries;
    s_path_precip_top.points = s_points_precip;
    MEMORY_HEAP_PROBE_SAMPLE("before_precip_top_draw", &redraw_probe);
    /* Светлый голубой контур поверх заливки осадков на белом фоне давал
     * контраст 2.27 — там, где кривая выходит из заливки, её было не видно. */
    graphics_context_set_stroke_color(ctx, theme_readable(GColorPictonBlue));
    graphics_context_set_stroke_width(ctx, 1);
    gpath_draw_outline_open(ctx, &s_path_precip_top);
    MEMORY_HEAP_PROBE_SAMPLE("after_precip_top_draw", &redraw_probe);

    if (has_uv_data)
    {
        s_path_uv.num_points = num_entries;
        s_path_uv.points = s_points_uv;
        graphics_context_set_stroke_color(ctx, PBL_IF_COLOR_ELSE(theme_warm(), GColorWhite));
        // emery: a 1px line vanishes against the precipitation fill and the
        // night hatching, so UV is drawn at the same weight as temperature.
#ifdef PBL_PLATFORM_EMERY
        graphics_context_set_stroke_width(ctx, 3);
#else
        graphics_context_set_stroke_width(ctx, 1);
#endif
        gpath_draw_outline_open(ctx, &s_path_uv);
    }

    // Draw the temperature line
    s_path_temp.num_points = num_entries;
    s_path_temp.points = s_points_temp;
    MEMORY_HEAP_PROBE_SAMPLE("before_temp_path_draw", &redraw_probe);
    graphics_context_set_stroke_color(ctx, PBL_IF_COLOR_ELSE(GColorRed, GColorWhite));
    graphics_context_set_stroke_width(ctx, 3); // Only odd stroke width values supported
    gpath_draw_outline_open(ctx, &s_path_temp);
    MEMORY_HEAP_PROBE_SAMPLE("after_temp_path_draw", &redraw_probe);

    if (has_feels_like_data)
    {
        graphics_context_set_fill_color(ctx,
                PBL_IF_COLOR_ELSE(theme_readable(g_config->color_feels_like), GColorWhite));
        for (int i = 0; i < num_entries; ++i)
        {
            if (is_feels_like_available(feels_like_temps[i + data_offset]))
            {
                graphics_fill_circle(ctx, s_points_feels_like[i], FEELS_LIKE_DOT_RADIUS);
            }
        }
    }

    // Draw a line for the bottom axis
    graphics_context_set_stroke_color(ctx, render_spec.axis_color);
    graphics_context_set_stroke_width(ctx, 1);
    const int16_t axis_y = h - BOTTOM_AXIS_H;
    graphics_draw_line(ctx, GPoint(graph_bounds.origin.x, axis_y), GPoint(graph_bounds.origin.x + w, axis_y));
    // And for the left side axis
    graphics_context_set_fill_color(ctx, theme_bg());
    graphics_fill_rect(ctx, GRect(0, 0, s_axis_left_w, h - BOTTOM_AXIS_H), 0, GCornerNone); // Paint over plot bleeding
    graphics_draw_line(ctx, GPoint(graph_bounds.origin.x, 0), GPoint(graph_bounds.origin.x, axis_y));
    if (has_uv_data)
    {
        draw_uv_axis(ctx, graph_plot_rect);
    }
    graphics_context_set_text_color(ctx, theme_fg());
#ifdef PBL_PLATFORM_EMERY
    // emery: the axis strip is only as tall as whatever the layout left for the
    // graph, so the hi/lo labels pick a face that fits and are only drawn while
    // they can sit clear of each other. Previously both were pinned to the strip
    // edges and collided once the strip got short.
    /* Цифры осей — служебная подпись, а не данные: 20 px спорили по весу с
     * календарём и часами. */
    GFont label_font = ui_font_axis();
    GSize hi_size = temp_label_size_with_font(s_buffer_hi, label_font);
    GSize lo_size = temp_label_size_with_font(s_buffer_lo, label_font);
    const int strip_h = axis_y;
    const int label_gap = 2;

    if (hi_size.h + lo_size.h + label_gap > strip_h) {
        // Axis numbers are digits only, so the compact system face is safe here
        // even though it carries no Cyrillic.
        label_font = fonts_get_system_font(FONT_KEY_GOTHIC_14);
        hi_size = temp_label_size_with_font(s_buffer_hi, label_font);
        lo_size = temp_label_size_with_font(s_buffer_lo, label_font);
    }

    /* Раньше обе подписи прижимались к краям полосы, а не стояли там, где
     * проходят сами максимум и минимум: рядом со шкалой УФ, у которой числа
     * стоят строго на своих штрихах, это читалось как рассогласование двух
     * шкал. Считаем те же координаты, что и точки графика. */
    const int hi_line_y = MARGIN_TEMP_H;
    const int lo_line_y = strip_h - MARGIN_TEMP_H;
    int hi_y = hi_line_y - hi_size.h / 2;
    int lo_y = lo_line_y - lo_size.h / 2;
    bool draw_lo;

    if (hi_y < 0) {
        hi_y = 0;
    }
    if (lo_y > strip_h - lo_size.h) {
        lo_y = strip_h - lo_size.h;
    }
    draw_lo = (lo_y >= hi_y + hi_size.h + label_gap);

    graphics_draw_text(ctx, s_buffer_hi,
                       label_font,
                       GRect(0, hi_y, s_label_strip_w, hi_size.h),
                       GTextOverflowModeFill, GTextAlignmentRight, NULL);
    if (draw_lo) {
        graphics_draw_text(ctx, s_buffer_lo,
                           label_font,
                           GRect(0, lo_y, s_label_strip_w, lo_size.h),
                           GTextOverflowModeFill, GTextAlignmentRight, NULL);
    }
#else
    GSize hi_size = temp_label_string_size(s_buffer_hi);
    GSize lo_size = temp_label_string_size(s_buffer_lo);
    const int hi_y = -3;
    const int lo_y = 22;
    graphics_draw_text(ctx, s_buffer_hi,
                       ui_font_20(),
                       GRect(0, hi_y, s_label_strip_w, hi_size.h),
                       GTextOverflowModeFill, GTextAlignmentRight, NULL);
    graphics_draw_text(ctx, s_buffer_lo,
                       ui_font_20(),
                       GRect(0, lo_y, s_label_strip_w, lo_size.h),
                       GTextOverflowModeFill, GTextAlignmentRight, NULL);
#endif
    MEMORY_HEAP_PROBE_LOG_MIN(&redraw_probe);
    MEMORY_LOG_HEAP("forecast_update:exit");
}

static int temp_label_string_width(const char *text)
{
    const GFont font = ui_font_axis();
    const GRect box = GRect(0, 0, TEMP_LABEL_MEASURE_BOX_W, TEMP_LABEL_MEASURE_BOX_H);
    const GSize sz = graphics_text_layout_get_content_size(text, font, box, GTextOverflowModeFill,
                                                           GTextAlignmentRight);
    return sz.w;
}

#ifdef PBL_PLATFORM_EMERY
static GSize temp_label_size_with_font(const char *text, GFont font)
{
    const GRect box = GRect(0, 0, TEMP_LABEL_MEASURE_BOX_W, TEMP_LABEL_MEASURE_BOX_H);
    return graphics_text_layout_get_content_size(text, font, box, GTextOverflowModeFill,
                                                 GTextAlignmentRight);
}
#endif

#ifndef PBL_PLATFORM_EMERY
static GSize temp_label_string_size(const char *text)
{
    const GFont font = ui_font_20();
    const GRect box = GRect(0, 0, TEMP_LABEL_MEASURE_BOX_W, TEMP_LABEL_MEASURE_BOX_H);
    return graphics_text_layout_get_content_size(text, font, box, GTextOverflowModeFill,
                                                 GTextAlignmentRight);
}
#endif

static void text_labels_refresh()
{
    const int raw_num_entries = persist_get_num_entries();
    int stored_num_entries = raw_num_entries > MAX_FORECAST_ENTRIES ? MAX_FORECAST_ENTRIES : raw_num_entries;
    int lo = persist_get_temp_lo();
    int hi = persist_get_temp_hi();
    int data_offset = 0;
    int16_t temps[MAX_FORECAST_ENTRIES];
    int16_t feels_like_temps[MAX_FORECAST_ENTRIES];

    if (stored_num_entries < 0)
    {
        stored_num_entries = 0;
    }

    memset(temps, 0, sizeof(temps));
    memset(feels_like_temps, FEELS_LIKE_UNAVAILABLE, sizeof(feels_like_temps));
    if (stored_num_entries >= 2)
    {
        data_offset = forecast_visible_offset(persist_get_forecast_start(), stored_num_entries);
        persist_get_temp_trend(temps, stored_num_entries);
        min_max(temps + data_offset, stored_num_entries - data_offset, &lo, &hi);
    }

    if (g_config->show_feels_like)
    {
        persist_get_feels_like_trend(feels_like_temps, stored_num_entries);

        for (int i = data_offset; i < stored_num_entries; ++i)
        {
            if (is_feels_like_available(feels_like_temps[i]))
            {
                if (feels_like_temps[i] < lo)
                {
                    lo = feels_like_temps[i];
                }
                if (feels_like_temps[i] > hi)
                {
                    hi = feels_like_temps[i];
                }
            }
        }
    }

    /* Знак градуса отделяет левую шкалу от правой: слева границы того, что
     * нарисовано температурой (и кривая, и точки «ощущается как»), справа —
     * индекс УФ, у которого своя шкала 0..11 и свои штрихи. Без пометки две
     * шкалы читались как одна и «5» справа выглядело затесавшимся между
     * «8» и «18» слева. */
    snprintf(s_buffer_hi, sizeof(s_buffer_hi), "%d°", config_localize_temp(hi));
    snprintf(s_buffer_lo, sizeof(s_buffer_lo), "%d°", config_localize_temp(lo));

    int content_w = temp_label_string_width(s_buffer_hi);
    const int w_lo = temp_label_string_width(s_buffer_lo);
    if (w_lo > content_w)
    {
        content_w = w_lo;
    }
    content_w += TEMP_LABEL_PAD;

    int label_strip_w = content_w;
    if (label_strip_w < LEFT_AXIS_LABEL_STRIP_MIN_W)
    {
        label_strip_w = LEFT_AXIS_LABEL_STRIP_MIN_W;
    }
    s_label_strip_w = label_strip_w;
    const int graph_inset_w = label_strip_w + LEFT_AXIS_LABEL_TO_GRAPH_GAP;

    if (graph_inset_w != s_axis_left_w)
    {
        s_axis_left_w = graph_inset_w;
    }
}

void forecast_layer_create(Layer *parent_layer, GRect frame)
{
    s_forecast_layer = layer_create(frame);

    // Fill the contents with values

    layer_set_update_proc(s_forecast_layer, forecast_update_proc);
    text_labels_refresh();

    // Add it as a child layer to the Window's root layer
    layer_add_child(parent_layer, s_forecast_layer);
    MEMORY_LOG_HEAP("after_forecast_layer_create");
}

void forecast_layer_refresh()
{
    /* The forecast graph and the calendar now live on swipe-in screens that
     * are created and destroyed at runtime, and app_message refreshes layers
     * directly. Refreshing one that is not on screen must be a no-op. */
    if (!s_forecast_layer) {
        return;
    }
    text_labels_refresh();
    layer_mark_dirty(s_forecast_layer);
#ifdef FCW2_ENABLE_MEMORY_LOGGING
    APP_LOG(APP_LOG_LEVEL_DEBUG, "MEM|forecast_refresh|entries=%d|free=%lu|used=%lu",
            persist_get_num_entries(),
            (unsigned long)heap_bytes_free(),
            (unsigned long)heap_bytes_used());
#endif
}

void forecast_layer_destroy()
{
    if (!s_forecast_layer) {
        return;
    }
    MEMORY_LOG_HEAP("forecast_layer_destroy:before");
    layer_destroy(s_forecast_layer);
    s_forecast_layer = NULL;
    MEMORY_LOG_HEAP("forecast_layer_destroy:after");
}
