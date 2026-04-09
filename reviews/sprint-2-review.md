# Sprint 2 Review: Image-to-ASCII Engine

**Reviewed**: 2026-04-09
**Verdict**: PASS

---

## Acceptance Criteria Results

### AC1: User can upload a JPEG image and see ASCII art output generated from it
**PASS**

`validateImageFile` accepts `image/jpeg`. The `<input type="file">` has `accept="image/jpeg,image/png,image/webp,image/gif"`. `loadImage()` uses `URL.createObjectURL` + `HTMLImageElement` which handles JPEG natively in all browsers. The canvas draws the image, extracts pixel data via `getImageData`, computes per-pixel luminance, and maps to characters. The output is set via `asciiOutput.textContent`. The full pipeline is present and wired.

### AC2: User can upload a PNG image (including with transparency) and see ASCII output
**PASS**

`image/png` is in the `SUPPORTED_TYPES` set. Transparency is explicitly handled: pixels with alpha < 10 render as spaces (image-engine.js:102). This prevents transparent regions from producing garbage characters. Canvas handles PNG alpha compositing natively.

### AC3: User can upload a WebP image and see ASCII output
**PASS**

`image/webp` is in `SUPPORTED_TYPES`. Modern browsers (Chrome, Edge, Firefox, Safari 14+) support WebP on canvas natively. No special handling needed beyond what's already implemented.

### AC4: User can upload an animated GIF and see ASCII output generated from the first frame only
**PASS**

`image/gif` is accepted. The engine uses `new Image()` + `drawImage()` which renders only the first frame of an animated GIF — this is standard browser behavior. The `Image` element does not animate; `drawImage` captures the static first frame. This is the correct and well-established approach.

### AC5: A high-contrast image produces clearly distinguishable light and dark regions in the ASCII output
**PASS**

Verified programmatically:
- Black pixels (RGB 0,0,0) → luminance 0.0 → character `@` (densest in classic ramp)
- White pixels (RGB 255,255,255) → luminance ~1.0 → character ` ` (space, lightest)
- Mid-tones (luminance 0.5) → character `=` (middle of ramp)

The BT.709 luminance formula `(0.2126*R + 0.7152*G + 0.0722*B) / 255` is the industry-standard perceptual luminance calculation. The 10-character classic ramp (`@%#*+=-:. `) provides sufficient granularity for clear tonal distinction. A high-contrast image (e.g., black circle on white background) will produce `@` in dark regions and spaces in light regions — clearly distinguishable.

### AC6: Output width defaults to a readable number of characters (e.g., 80-120) that fits a typical viewport
**PASS**

`DEFAULT_WIDTH = 100` in image-engine.js:15. `handleImageFile` calls `imageToAscii(file, { width: 100 })` in main.js:61. 100 characters is squarely within the 80-120 range specified. At the `<pre>` font-size of 0.7rem with a monospace font, 100 characters fits comfortably in the 960px max-width container.

### AC7: Uploading a very large image (4000x3000px) does not crash the browser — it processes and renders
**PASS**

Verified: a 4000x3000 image is downsampled to canvas dimensions of 100x38 (100 chars wide, 38 lines tall based on aspect ratio with 0.5 height correction). That's 3,800 pixels = 15,200 bytes of pixel data to process. This is trivial for any browser. The heavy lifting (downsampling) is done by `canvas.drawImage()` which is GPU-accelerated. No full-resolution pixel array is ever created in JS.

### AC8: Unsupported file types (e.g., PDF, SVG) are rejected with a clear message
**PASS**

Verified programmatically:
- `{ type: 'application/pdf', name: 'doc.pdf' }` → `"Unsupported file type "pdf". Please upload a JPEG, PNG, WebP, or GIF image."`
- `{ type: 'image/svg+xml', name: 'icon.svg' }` → `"Unsupported file type "svg". Please upload a JPEG, PNG, WebP, or GIF image."`

The validation runs on **every** file — both from the file picker and from drag-and-drop (the `drop` handler calls `handleImageFile` → `validateImageFile`). This is important because the HTML `accept` attribute only constrains the file picker dialog, not drag-and-drop. The JS validation catches both paths.

Error display: `showImageError()` unhides a styled `.image-error` div with red text/border. `clearImageError()` is called at the start of each new file to reset state.

### AC9: All processing happens client-side — no network requests are made during conversion
**PASS**

Audited all source files:
- Zero instances of `fetch`, `XMLHttpRequest`, `axios`, `.ajax`, or any HTTP client in `src/`
- Image loading uses `URL.createObjectURL` (blob URL, no network)
- Pixel processing uses offscreen `<canvas>` + `getImageData` (local)
- Character mapping is pure JS math
- No external CDN imports, no analytics, no telemetry

The entire pipeline is: `File → ObjectURL → Image → Canvas → getImageData → luminance math → character ramp → string`.

---

## Build Integrity

- Vite production build succeeds: 123.58 KB JS, 3.48 KB CSS
- Built bundle contains: `textSync` (figlet), `getImageData` (canvas), `Unsupported file type` (validation), `dragover` (drag-drop), `0.2126` (luminance), `data-mode` (tabs)
- All 10 DOM element IDs in `main.js` have matching `id` attributes in `index.html`
- File input `accept` attribute matches `SUPPORTED_TYPES` set

## Sprint 1 Regression

- Text mode still works: `textToAscii` import is present, `renderText()` function unchanged, event listeners for `text-input` and `font-select` remain wired
- Sample text "Hello" renders on page load
- Mode switching preserves text state (switching back to text mode calls `renderText()`)

## Additional Observations

- The `browseBtn` click handler calls `e.stopPropagation()` to prevent the click from bubbling to the drop zone's click handler (which would open the file picker twice). Good defensive coding.
- `URL.revokeObjectURL` is called in both `onload` and `onerror` paths — no memory leaks from blob URLs.
- The `.hidden` class uses `display: none !important` ensuring it wins specificity battles with `.input-section`'s display flex. This is needed because both sections share the `.input-section` class.

---

## Summary

All 9 acceptance criteria pass with verified evidence. The image-to-ASCII engine is correctly implemented: canvas-based processing with BT.709 luminance, proper transparency handling, file type validation on both upload paths, and zero network calls. The build is clean, DOM wiring is complete, and Sprint 1 text functionality is preserved.
