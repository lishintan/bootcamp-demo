# Sprint Plan: ASCII Art Generator

**Source PRD**: [ascii-art-generator.md](../prd/ascii-art-generator.md)
**Total Sprints**: 5
**Approach**: Dependency-ordered, starting with core engine logic and layering UI, presets, and export on top.

---

## Sprint 1: Text-to-ASCII Engine

**Goal**: Build the foundational text-to-ASCII conversion engine that renders typed English text as large ASCII block lettering.

**Features**:
- Text input processing
- ASCII font/banner rendering engine (figlet-style)
- Character ramp system for mapping tonal values to characters
- Default character set and font style

**Acceptance Criteria**:
1. User can type any English text string and receive ASCII block letter output
2. Output renders multi-line ASCII art (not single-line) for each character
3. Multi-word input preserves spacing between words in the ASCII output
4. Special characters (!, ?, @, #) either render or are gracefully ignored without breaking output
5. Empty input produces no output (no errors or placeholder junk)
6. Output uses a default character ramp that produces visually clear, readable letters
7. Very long input (50+ characters) renders without crashing or hanging the browser
8. Each letter in the output is recognizable as its intended character

**Dependencies**: None — this is the foundation.

---

## Sprint 2: Image-to-ASCII Engine

**Goal**: Build the image-to-ASCII conversion engine that takes an uploaded image and converts it to ASCII art using luminance/pattern-based mapping.

**Features**:
- Image file loading (JPEG, PNG, WebP, GIF first-frame)
- Luminance extraction from pixel data
- Luminance-to-character mapping using the character ramp system
- Configurable output width (characters per line)

**Acceptance Criteria**:
1. User can upload a JPEG image and see ASCII art output generated from it
2. User can upload a PNG image (including with transparency) and see ASCII output
3. User can upload a WebP image and see ASCII output
4. User can upload an animated GIF and see ASCII output generated from the first frame only
5. A high-contrast image (e.g., black circle on white background) produces clearly distinguishable light and dark regions in the ASCII output
6. Output width defaults to a readable number of characters (e.g., 80-120) that fits a typical viewport
7. Uploading a very large image (4000x3000px) does not crash the browser — it processes and renders
8. Unsupported file types (e.g., PDF, SVG) are rejected with a clear message
9. All processing happens client-side — no network requests are made during conversion

**Dependencies**: Sprint 1 (shares the character ramp system).

---

## Sprint 3: Preset System & Creative Controls

**Goal**: Implement the 5 named style presets and advanced creative controls that let users customize the output.

**Features**:
- 5 presets: Bold, Minimal, Classic, Dotwork, Blocky
- Each preset bundles: character set, contrast/brightness mapping, density
- Advanced controls panel (progressive disclosure via toggle):
  - Output width slider
  - Contrast / Brightness adjustment
  - Custom character set input
  - Inversion toggle (light-on-dark vs dark-on-light)

**Acceptance Criteria**:
1. User can click "Bold" preset and the output re-renders using heavy characters (#, @, M, W)
2. User can click "Minimal" preset and the output re-renders using sparse, light characters (., :, -)
3. User can click "Classic" preset and the output uses a traditional balanced character set
4. User can click "Dotwork" preset and the output uses dots/periods at varying density
5. User can click "Blocky" preset and the output uses Unicode block characters (█, ▓, ▒, ░)
6. Switching between presets re-renders the output instantly (no page reload, no perceptible delay)
7. User can open the advanced controls panel and adjust output width — the output re-renders at the new width
8. User can toggle inversion and the light/dark mapping of the output reverses
9. User can type a custom character set (e.g., "ABC123") and the output uses only those characters
10. Adjusting contrast/brightness slider visibly changes the character distribution in the output

**Dependencies**: Sprint 1 and Sprint 2 (presets and controls apply to both conversion engines).

---

## Sprint 4: UI/UX & Live Preview

**Goal**: Build the single-page interface with real-time preview, modern styling, and the zero-friction first experience.

**Features**:
- Single-page app layout: input area (text field + image upload/drag-drop), preset bar, live output canvas, advanced controls toggle
- Real-time rendering: output updates live as user types or adjusts any setting
- Sample ASCII art pre-rendered on page load
- Drag-and-drop image upload
- Modern, clean, "artistic" visual design
- Tab or toggle to switch between text mode and image mode

**Acceptance Criteria**:
1. On first page load, a sample piece of ASCII art is visible without any user action
2. User can click different presets on the sample art and watch it change before providing their own input
3. User can type text and see the ASCII output update character-by-character in real-time as they type
4. User can drag and drop an image onto the page and see it converted to ASCII art
5. User can adjust any slider or control and the preview updates with no perceptible lag (<100ms)
6. The interface has no sign-up wall, no landing page — the tool is immediately usable
7. The preset bar is visually prominent and clickable without scrolling on a standard desktop viewport
8. Advanced controls are hidden by default and revealed via a toggle/button
9. The page is visually polished — no unstyled elements, consistent spacing, readable typography
10. A casual user can go from opening the page to seeing their own ASCII art in under 30 seconds

**Dependencies**: Sprints 1, 2, and 3 (all engine and preset logic must exist to wire into the UI).

---

## Sprint 5: Export

**Goal**: Enable users to copy their ASCII art to clipboard and download it as a styled image.

**Features**:
- One-click copy to clipboard (plain text)
- Download as PNG with styled background, font, and sizing
- Download as SVG with styled output
- Visual feedback on successful copy/download

**Acceptance Criteria**:
1. User can click a "Copy" button and the ASCII art plain text is placed on the system clipboard
2. Pasting the copied text into a plain text editor preserves the ASCII art formatting (line breaks, spacing)
3. User can click "Download PNG" and receives a .png file of the ASCII art
4. The downloaded PNG has a clean background (not transparent/broken), readable monospace font, and appropriate sizing
5. User can click "Download SVG" and receives a .svg file of the ASCII art
6. The downloaded SVG renders correctly when opened in a browser
7. After clicking copy, the user sees a brief visual confirmation (e.g., "Copied!" tooltip or button state change)
8. Export works correctly regardless of which preset or custom settings are active
9. Exporting a large ASCII art piece (high character width, detailed image) completes without error

**Dependencies**: Sprint 4 (needs the rendered output in the UI to export from).

---

## Sprint Dependency Graph

```
Sprint 1 (Text Engine)
    ↓
Sprint 2 (Image Engine)  ← shares character ramp from Sprint 1
    ↓
Sprint 3 (Presets & Controls)  ← applies to both engines
    ↓
Sprint 4 (UI/UX & Live Preview)  ← wires everything together
    ↓
Sprint 5 (Export)  ← exports from the rendered UI
```
