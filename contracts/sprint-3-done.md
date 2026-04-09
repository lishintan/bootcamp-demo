# Sprint 3 — Done

## What was built

### Modules modified
- **`src/character-ramp.js`** — Added `adjustIntensity()` function for contrast/brightness adjustment. Updated `getCharFromIntensity()` to accept an options object with `rampName`, `inverted`, `contrast`, `brightness`, and `customRamp` parameters (backward-compatible with the old string+boolean signature). Fixed dotwork ramp to use only dot-like characters (`●•·:. `).
- **`src/image-engine.js`** — Updated `imageToAscii()` to accept and pass through `contrast`, `brightness`, and `customRamp` options to the character ramp system.
- **`src/main.js`** — Wired up all new UI controls: preset buttons, advanced controls toggle, width slider, contrast slider, brightness slider, custom character set input, and inversion toggle. All controls trigger immediate re-render. Presets and advanced controls are now hidden in text mode and shown only in image mode. Custom charset input is cleared when switching presets.
- **`src/styles.css`** — Added styles for preset buttons, advanced controls panel, sliders, toggle switch, and layout.

### UI changes
- **`index.html`** — Added preset buttons section (Bold, Minimal, Classic, Dotwork, Blocky) and advanced controls panel with progressive disclosure toggle containing: output width slider (20-200), contrast slider (0.5-2.0), brightness slider (-0.5 to 0.5), custom character set text input, and inversion toggle.

### Features
1. **5 style presets** — Bold, Minimal, Classic, Dotwork, Blocky. Each uses a distinct character ramp defined in `character-ramp.js`. Clicking a preset instantly re-renders the output.
2. **Advanced controls panel** — Hidden by default, revealed via a toggle button (progressive disclosure).
3. **Output width slider** — Adjusts the character width of the ASCII output (20-200 chars).
4. **Contrast/Brightness sliders** — Adjusts character distribution by modifying intensity mapping around the midpoint.
5. **Custom character set** — User can type any characters; the output uses only those characters (plus a trailing space for lightest values if not included).
6. **Inversion toggle** — Reverses light/dark character mapping.

## Bug fixes (Sprint 3 retry)
1. **Presets/advanced controls hidden in text mode** — Preset buttons and advanced controls are now hidden when in text mode and shown when switching to image mode. This prevents user confusion since these controls only affect image-to-ASCII conversion.
2. **Custom charset cleared on preset switch** — Added `customCharset.value = ''` when switching presets so that the preset's ramp is actually used instead of a stale custom charset.
3. **Dotwork ramp uses only dot-like characters** — Changed from `@o.*. ` (which included non-dot characters) to `●•·:. ` (only dot/period-like characters at varying density).

## Decisions on ambiguous criteria
- **Presets apply to image mode only.** Text mode uses figlet fonts which produce block-letter art via their own glyph rendering, not intensity-to-character mapping. The style presets and advanced controls (contrast, brightness, custom charset, inversion, width) apply to image-to-ASCII conversion. In text mode, the font selector already controls styling. The UI now reflects this by hiding irrelevant controls.
- **Custom character set** — When a user enters a custom character set, it takes priority over the active preset's ramp. Characters are ordered left-to-right from darkest to lightest. A space is automatically appended if not included, to represent the lightest intensity.
- **Classic is the default preset** — Matches the existing `DEFAULT_RAMP` from Sprint 1.

## Known limitations
- Contrast and brightness adjustments have no effect in text mode (figlet rendering).
- Width slider has no effect in text mode (figlet controls its own width).
- No preset "preview" or description tooltip — the names are self-explanatory.
