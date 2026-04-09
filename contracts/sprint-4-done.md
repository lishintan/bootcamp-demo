# Sprint 4 — Done

## What was built

### UI/UX Overhaul
- **Modern visual design**: Dark theme with refined color system (subtle gradients, glow effects, layered shadows), Inter + JetBrains Mono font pairing via Google Fonts, consistent spacing/radius/transition tokens via CSS custom properties.
- **Header**: Badge pill ("ASCII"), larger title, descriptive subtitle.
- **Mode tabs**: SVG icons alongside text labels for visual clarity.
- **Preset buttons**: Two-line layout with character preview on top and label below, hover lift effect, active glow ring. Visually prominent and above the fold.
- **Advanced controls**: 2-column CSS Grid layout, value badges styled as mono-font pills.
- **Output section**: Labeled header row with contextual hint text.
- **Footer**: Minimal branding line, separated by subtle border.
- **Responsive**: Single-column grid on mobile, full-width tabs, smaller font sizes.

### Presets work in both modes (AC2)
- Each preset is mapped to a figlet font in text mode:
  - Classic → Standard, Bold → Block, Minimal → Big, Dotwork → Slant, Blocky → Banner3
- Clicking a preset in text mode immediately re-renders the sample "Hello" (or user text) in the corresponding font.
- In image mode, presets still switch character ramps as before.
- Font dropdown (now in Advanced Controls) stays synced with preset selection.

### Page-level drag-and-drop
- Dragging a file anywhere on the page shows a full-screen overlay with drop instructions.
- Dropping auto-switches to image mode and processes the file.
- The drop zone inside image mode also still works independently.

### Advanced controls visibility per mode
- In text mode: only the Font dropdown is shown in Advanced Controls (width/contrast/brightness/charset/invert are image-specific).
- In image mode: all image controls shown, font hidden.

### Image upload UX
- Upload prompt hides after a file is loaded, showing only the filename.
- Browse button styled as a primary action button instead of an underline link.

### Sample art on load (AC1)
- "Hello" rendered in Standard font on first load, visible immediately.

## Decisions made
- **AC2 approach**: Option (a) — presets map to figlet fonts in text mode. This keeps text mode as the default and makes presets functional in both modes without requiring a bundled sample image.
- **Font dropdown moved to Advanced Controls**: Since presets now serve as the primary font switcher in text mode, the dropdown is secondary and lives in the expandable panel.
- **Advanced controls hidden by default** in both modes (AC8). The toggle reveals mode-appropriate controls.
- **Presets and advanced section visible in both modes** (not hidden in text mode like Sprint 3).

## Known limitations
- Page-level drag overlay does not distinguish between image files and other file types until drop.
- No animation/transition on output text changes (could add a subtle fade).
- Google Fonts loaded externally — if offline, falls back to system fonts.
- The preset-to-font mapping is a design choice; users may prefer different pairings.
