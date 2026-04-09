# Sprint 1: Text-to-ASCII Engine — Complete

**Date**: 2026-04-09

## What Was Built

### Project Setup
- Vite + vanilla JS project initialized
- figlet.js integrated for font rendering with 5 bundled fonts (Standard, Big, Banner3, Block, Slant)

### Core Modules
- **`src/text-engine.js`** — Text-to-ASCII conversion engine using figlet. Handles English text, special characters, empty input, and long strings gracefully.
- **`src/character-ramp.js`** — Character ramp system with 5 named ramps (classic, bold, minimal, dotwork, blocky) and intensity-to-character mapping. Ready for Sprint 2 (image engine) and Sprint 3 (presets).
- **`src/main.js`** — App entry point wiring text input and font selector to live ASCII output.
- **`src/styles.css`** — Dark theme UI with monospace output display.

### UI
- Single-page app with text input, font selector, and ASCII output panel
- Live rendering on every keystroke
- Sample text ("Hello") pre-rendered on page load

## Acceptance Criteria — All Passed

| # | Criterion | Status |
|---|-----------|--------|
| 1 | English text renders ASCII block output | Pass |
| 2 | Multi-line ASCII art per character | Pass |
| 3 | Multi-word spacing preserved | Pass |
| 4 | Special chars (!?@#) handled gracefully | Pass |
| 5 | Empty input produces no output | Pass |
| 6 | Default ramp produces clear, readable letters | Pass |
| 7 | 50+ char input renders without crash/hang | Pass |
| 8 | Letters are recognizable | Pass |

## Known Gaps

- Character ramp system is built but not yet wired into text output (it will apply to image-to-ASCII in Sprint 2 and presets in Sprint 3).
- Font selector is a basic `<select>` — will be replaced by the preset bar in Sprint 3/4.
- No drag-and-drop, no export — these are future sprints.
