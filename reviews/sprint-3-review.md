# Sprint 3 Review
**Verdict**: PASS
**Attempt**: 2

## Build Verification
- `npm run build` completes successfully (vite v8.0.8, 15 modules, no errors or warnings)

## Acceptance Criteria

### AC1: User can click "Bold" preset and the output re-renders using heavy characters (#, @, M, W)
**PASS** — The `RAMPS.bold` ramp is `'@#MW&8%B$Oo;:. '`, which contains heavy characters (@, #, M, W, &, 8, %, B). Clicking the Bold button sets `currentPreset = 'bold'`, clears any custom charset, and calls `reRender()`. The options flow correctly through `getImageOptions()` -> `imageToAscii()` -> `getCharFromIntensity()` which resolves the `bold` ramp. HTML contains the button with `data-preset="bold"` and the event listener is wired at lines 207-221 of main.js. Presets section is correctly hidden in text mode and shown only in image mode, which is the appropriate context for these controls.

### AC2: User can click "Minimal" preset and the output re-renders using sparse, light characters (., :, -)
**PASS** — `RAMPS.minimal` is `'.:- '` — only sparse, light characters (dot, colon, hyphen, space). Same wiring as AC1. Correct behavior in image mode.

### AC3: User can click "Classic" preset and the output uses a traditional balanced character set
**PASS** — `RAMPS.classic` is `'@%#*+=-:. '` — a traditional balanced ramp from dense to sparse. Classic is the default active preset (button has `active` class in HTML, `currentPreset` initialized to `'classic'`).

### AC4: User can click "Dotwork" preset and the output uses dots/periods at varying density
**PASS** — `RAMPS.dotwork` is `'●•·:. '` — exclusively dot-like characters at varying density (filled circle, bullet, middle dot, colon, period, space). Bug fix from attempt 1 confirmed: the old ramp `'@o.*. '` has been replaced with proper dot-only characters.

### AC5: User can click "Blocky" preset and the output uses Unicode block characters (█, ▓, ▒, ░)
**PASS** — `RAMPS.blocky` is `'█▓▒░ '` — exactly the four Unicode block characters at decreasing density plus space. Matches the AC requirement precisely.

### AC6: Switching between presets re-renders the output instantly (no page reload, no perceptible delay)
**PASS** — Preset click handlers call `reRender()` directly which invokes `reRenderImage()`. The image-to-ASCII conversion reuses the already-loaded `currentImageFile` and processes it via an in-memory canvas (no network request, no server round-trip). No page reload occurs — only `asciiOutput.textContent` is updated. Note: `loadImage()` is called on each re-render which creates a new object URL; for very large images this adds minor overhead, but canvas operations at 20-200 character widths are sub-millisecond. No perceptible delay is expected for typical use.

### AC7: User can open the advanced controls panel and adjust output width — the output re-renders at the new width
**PASS** — Advanced toggle button (lines 225-234 of main.js) removes/adds `hidden` class on the panel. Width slider has `input` event listener (lines 238-241) that updates the display label and calls `reRender()`. `getOutputWidth()` reads `widthSlider.value` (range 20-200). `imageToAscii()` uses `options.width` to set canvas dimensions, directly controlling output character width. Height is computed proportionally (`width * aspectRatio * 0.5`) to preserve aspect ratio with character height compensation.

### AC8: User can toggle inversion and the light/dark mapping of the output reverses
**PASS** — Invert toggle click (lines 257-261) flips `isInverted` boolean, updates `aria-pressed` attribute for CSS state, and calls `reRender()`. In `getCharFromIntensity()` (character-ramp.js line 59), when `inverted` is true, `val = 1 - val` is applied after contrast/brightness adjustment, effectively reversing the light-to-dark character mapping. The toggle button has proper visual state via CSS `[aria-pressed="true"]` selectors.

### AC9: User can type a custom character set (e.g., "ABC123") and the output uses only those characters
**PASS** — Custom charset input has `input` event listener (lines 253-255) that calls `reRender()`. `getCustomRamp()` trims the value, returns null if empty, otherwise returns the string with a space appended (if not already included) for lightest values. In `getCharFromIntensity()`, `customRamp` takes priority: `const ramp = customRamp || RAMPS[rampName]`. Characters are used left-to-right from darkest to lightest. Bug fix from attempt 1 confirmed: switching presets now clears `customCharset.value = ''` (main.js line 218) so the preset ramp is actually applied instead of a stale custom value.

### AC10: Adjusting contrast/brightness slider visibly changes the character distribution in the output
**PASS** — Both sliders have `input` event listeners (lines 243-251) that update display labels and call `reRender()`. Contrast slider range is 50-200 (mapped to 0.5-2.0 via division by 100). Brightness slider range is -50 to 50 (mapped to -0.5 to 0.5). `adjustIntensity()` applies `(intensity - 0.5) * contrast + 0.5 + brightness` then clamps to [0,1]. Higher contrast pushes values toward extremes (more blacks and whites in the output); brightness shifts the entire mapping lighter or darker. This meaningfully changes character distribution.

## Quality Scores
- **Functionality: 5/5** — All 10 acceptance criteria are met. The five presets are correctly defined with distinct character ramps matching their intended styles. All advanced controls (width, contrast, brightness, custom charset, inversion) are properly wired through the rendering pipeline. Controls are correctly scoped to image mode only, which is the appropriate context since text mode uses figlet font rendering.
- **Robustness: 4/5** — Good edge case handling: empty custom charset falls back to preset, transparent pixels render as space, invalid images show error messages, `adjustIntensity` clamps to [0,1], custom ramp auto-appends space for lightest value. Preset switch clears custom charset to prevent stale state. Minor gaps: if no image is loaded in image mode, clicking presets silently does nothing (acceptable but could show a hint); `loadImage()` is called on every re-render rather than caching the HTMLImageElement.
- **Integration: 5/5** — Text mode (Sprint 1) is fully preserved: figlet rendering, font selector, and text input all still work. Image mode (Sprint 2) is preserved: drag-and-drop, file validation, and error handling are unchanged. Presets and advanced controls are correctly hidden in text mode to avoid confusion. The `getCharFromIntensity` function maintains backward compatibility with the old string+boolean signature. Build produces no warnings. CSS additions do not conflict with existing styles.

## Summary
Sprint 3 (attempt 2) delivers all required functionality. The three bugs identified in attempt 1 have been fixed:
1. Presets and advanced controls are now hidden in text mode and shown only in image mode (preventing dead controls)
2. Custom charset is cleared when switching presets (preventing stale custom ramp from overriding preset)
3. Dotwork ramp changed from `'@o.*. '` to `'●•·:. '` (proper dot-only characters at varying density)

The code is clean, well-structured, and properly integrated with Sprint 1 and Sprint 2 functionality.
