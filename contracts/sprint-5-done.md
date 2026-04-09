# Sprint 5 — Export & Share (Done)

## What was built

1. **Copy to Clipboard** — "Copy" button uses `navigator.clipboard.writeText()` to place the ASCII art plain text on the system clipboard. Line breaks and spacing are preserved since we copy the raw `textContent` from the `<pre>` element.

2. **Download PNG** — "Download PNG" button renders the ASCII art onto an offscreen `<canvas>` with:
   - Dark background (`#0a0a0f`) matching the app theme
   - Accent-colored text (`#7c6aef`) in JetBrains Mono / monospace fallback
   - 14px font size, 1.2 line-height, 32px padding
   - Canvas auto-sized to fit the widest line and all rows
   - Downloaded via `canvas.toBlob()` + `URL.createObjectURL()`

3. **Download SVG** — "Download SVG" button generates an SVG document with:
   - `<rect>` dark background
   - `<text>` with `<tspan>` per line, styled with monospace font
   - XML-safe escaping for special characters (`&`, `<`, `>`, `"`, `'`)
   - `xml:space="preserve"` to maintain whitespace
   - Downloaded via `Blob` + `URL.createObjectURL()`

4. **Visual Feedback** — All three buttons show a brief success state:
   - Button gets a green border/text color (`.success` class)
   - Label changes to "Copied!" or "Done!"
   - Reverts after 1.5 seconds

## Files changed

- `index.html` — Added export bar with 3 buttons below the ASCII output
- `src/export.js` — New module with `copyToClipboard()`, `downloadPNG()`, `downloadSVG()`
- `src/main.js` — Import export module, wire up button click handlers
- `src/styles.css` — Added `.export-bar`, `.export-btn`, `.export-icon`, `.success` styles

## Decisions

- Font size in exported PNG/SVG is 14px (larger than the 0.65rem on-screen display) for readability when viewed standalone.
- Background color in exports uses `#0a0a0f` (the app's `--bg` value) for a clean dark look.
- Text measurement for PNG/SVG width uses an offscreen canvas `measureText()` to handle variable-width edge cases correctly.
- Copy fallback: if `navigator.clipboard` fails (e.g., insecure context), we select the text in the output element so the user can Cmd+C manually.

## Known limitations

- PNG export relies on system-installed monospace fonts; if JetBrains Mono isn't loaded when `toBlob` fires, the browser falls back to the next monospace font in the stack. In practice, the font is already loaded by the time a user clicks export.
- Very large ASCII art (200+ width, high detail images) may produce large PNG files but will not error out.
- SVG width estimation uses canvas `measureText` which may differ slightly from actual SVG rendering in some browsers.
