## Dev Iteration Flow

After you've added a feature run `mise build` to verify it builds.

If you need runtime logs, `mise install-emulator --logs` runs it in an emulator and prints logs to the terminal. The process stays alive until the emulator is closed

## Debugging

- C: `APP_LOG(APP_LOG_LEVEL_DEBUG, "msg", args)`
- Heap probes: use `MEMORY_LOG_HEAP("tag")` for dev-only `MEM|...` logs around lifecycle and redraw checkpoints.
- JS: `console.log("msg")`

## Pebble Memory Tips

- Lazy-load bitmaps and destroy them when they are not needed to keep startup and steady-state heap usage low.
- Prefer drawing directly in an update proc over creating extra layer objects when a simple render path is enough.
- If a UI element only exists to paint pixels, keep it as light as possible instead of modeling it as a full layer.
- Avoid floating-point math and 64-bit division in watch-side C, prefer integer multiply-before-divide so linked software math helper code doesn't consume heap. See #163.

## Code Conventions

- For new JavaScript functions, add brief JSDoc (`@param`/`@returns`) annotations since this project does not use TypeScript.
- Prefer `Boolean(value)` over `!!value` in new/edited code for readability.
- When branching on `#ifdef PBL_PLATFORM_EMERY`, add a brief `emery:` comment explaining the Emery-specific behavior.

## Supabase migrations

Never write `migrations/` files manually. Edit declarative `schemas/` and generate migrations as-needed before commits with `supabase db diff -f <label>`

## Russian production calendar

Working weekends are transmitted separately in `HOLIDAY_WORKING_BITS`.
Keep new message keys appended to `package.template.json` so existing IDs
remain stable. When changing `HolidayYear`, preserve migration from the
previous persisted layout. Run `node scripts/test-holidays.js` and
`mise build release` after calendar changes.

## Emery layout

Keep one permanent overview: date/status, calendar, clock, weather and the
bottom 62px forecast band. Never add touch, accelerometer or focus callbacks
that switch layouts or hide the calendar/weather. A screen-sized calendar or
forecast is not a supported state, even after an intentional gesture.
Background refreshes must reuse the layers; only window lifecycle creates or
destroys them. Respect the configured two/three calendar rows in the fixed band.
The face has no Health strip/subscriptions/capability. Bluetooth and battery
colours affect screen icons only, never the backlight.

Missing feels-like forecasts must invalidate the previous optional series.
`persist_get_feels_like_trend` fills unread or incomplete entries with
`FEELS_LIKE_UNAVAILABLE`; never byte-fill an int16 array with this sentinel.
