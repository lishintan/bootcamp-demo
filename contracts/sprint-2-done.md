# Sprint 2: Image-to-ASCII Engine — Complete

**Date**: 2026-04-09

## What Was Built

### Core Module
- **`src/image-engine.js`** — Image-to-ASCII conversion engine:
  - Loads images via `createObjectURL` + `HTMLImageElement` (client-side only, no network)
  - Draws onto an offscreen `<canvas>` downsampled to the target character width
  - Extracts per-pixel luminance using ITU-R BT.709 formula
  - Maps luminance to characters via the existing `character-ramp.js` system
  - Transparent pixels (alpha < 10) render as spaces
  - GIF first-frame rendering via native `Image` element behavior
  - File type validation: accepts JPEG, PNG, WebP, GIF; rejects others with clear message
  - Default output width: 100 characters

### UI Updates
- **Mode tabs** (Text Mode / Image Mode) to switch between the two engines
- **Image upload area** with:
  - Drag-and-drop support with visual hover feedback
  - File picker via browse button or click on drop zone
  - Filename display after upload
  - Error messages for unsupported file types
- **`index.html`** updated with image upload section and mode tab markup
- **`src/styles.css`** updated with mode tab, upload area, error, and `.hidden` utility styles
- **`src/main.js`** rewritten to handle both text and image modes, mode switching, drag-drop events, and file validation

## Acceptance Criteria — All Passed

| # | Criterion | Status |
|---|-----------|--------|
| 1 | JPEG upload → ASCII output | Pass |
| 2 | PNG (with transparency) → ASCII output | Pass |
| 3 | WebP → ASCII output | Pass |
| 4 | Animated GIF → first frame ASCII output | Pass |
| 5 | High-contrast image → distinguishable light/dark regions | Pass |
| 6 | Default output width 80-120 chars (100) | Pass |
| 7 | Large image (4000x3000) renders without crash | Pass |
| 8 | Unsupported file types rejected with message | Pass |
| 9 | All processing client-side, no network requests | Pass |

## Known Gaps
- Output width is fixed at 100 — configurable width slider is Sprint 3 (advanced controls).
- No contrast/brightness adjustment yet — Sprint 3.
- No preset integration for image mode yet — Sprint 3.
- Drag-and-drop is on the upload zone only, not the full page — Sprint 4 may expand this.
