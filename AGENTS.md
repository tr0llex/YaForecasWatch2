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

## Face Conventions

- Colors go through `theme_bg()`, `theme_fg()`, `theme_pick()` and `theme_readable()` (`theme.h`); the dark theme keeps the original colors. On aplite the helpers are constants and `THEME_IS_FIXED` is 1, so refresh paths that re-apply colors are skipped there.
- Band rectangles come from `face_layout_compute()` (`face_layout.h`).
- Face strings come from `i18n.c`; text that may contain Cyrillic is measured and drawn with `ui_font_for_text()` (`ui_fonts.h`). Settings page translations live in `src/pkjs/clay/i18n.js`, keyed by `messageKey` (`scripts/test-clay-i18n.js` checks coverage). On aplite the i18n layer is compiled out (`I18N_IS_FIXED`).
- Tests: `node scripts/test-*.js` (after `mise build`, which generates `package.json`).
- Append new `Config` fields and `messageKeys` at the end, and read new Clay tuples as optional in `app_message.c`. Options aplite leaves out go in the `#ifndef PBL_PLATFORM_APLITE` block of `Config` and are hidden in the settings page with `NOT_PLATFORM_APLITE`. Run `pebble clean` after adding a message key.

## Code Conventions

- For new JavaScript functions, add brief JSDoc (`@param`/`@returns`) annotations since this project does not use TypeScript.
- Prefer `Boolean(value)` over `!!value` in new/edited code for readability.
- When branching on `#ifdef PBL_PLATFORM_EMERY`, add a brief `emery:` comment explaining the Emery-specific behavior.

## Supabase migrations

Never write `migrations/` files manually. Edit declarative `schemas/` and generate migrations as-needed before commits with `supabase db diff -f <label>`
