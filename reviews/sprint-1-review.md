# Sprint 1 Review: Text-to-ASCII Engine

**Reviewed**: 2026-04-09
**Verdict**: PASS

---

## Acceptance Criteria Results

### AC1: User can type any English text string and receive ASCII block letter output
**PASS**

Tested with 5 inputs: `Hello`, `world`, `ASCII`, `Test123`, `abcdefg`. All produced multi-line ASCII block letter output. The engine uses figlet.js with the Standard font, which covers the full printable ASCII range.

### AC2: Output renders multi-line ASCII art (not single-line) for each character
**PASS**

Single character `A` renders 5 non-empty lines:
```
     _    
    / \   
   / _ \  
  / ___ \ 
 /_/   \_\
```
This is definitively multi-line block art, not single-line.

### AC3: Multi-word input preserves spacing between words in the ASCII output
**PASS**

Tested `Hi World` — output lines contain multi-space gaps (3+ consecutive spaces) between the two word renderings. Figlet's `horizontalLayout: 'default'` preserves word boundaries.

### AC4: Special characters (!, ?, @, #) either render or are gracefully ignored without breaking output
**PASS**

All four special characters (`!`, `?`, `@`, `#`) individually produce valid multi-line figlet output (5-6 lines each). Tested in combination with text (`Hello!`, `Why?`, `test@test`, `hash#tag`, `!?@#`) — all return strings without exceptions.

Additionally, the engine has a fallback: if figlet throws on exotic characters, it strips non-printable-ASCII chars and retries, or returns empty string. Robust error handling.

### AC5: Empty input produces no output (no errors or placeholder junk)
**PASS**

Tested: `''`, `'   '`, `null`, `undefined` — all return empty string `''`. The UI uses `:empty::before` CSS to show a non-intrusive placeholder ("Your ASCII art will appear here...") only when empty, which disappears as soon as output is rendered. This is appropriate UX, not "placeholder junk."

### AC6: Output uses a default character ramp that produces visually clear, readable letters
**PASS**

The Standard figlet font uses structural characters (`|`, `/`, `\`, `_`, `(`, `)`) that produce clean, universally readable block lettering. `HELLO` renders with clear letterforms.

Note: The `character-ramp.js` module (with ramps like `classic`, `bold`, etc.) is built but not wired into the text engine. This is correct — character ramps map luminance-to-character for image conversion (Sprint 2). For text-to-ASCII, the figlet font IS the "character ramp" and the Standard font satisfies "visually clear, readable."

### AC7: Very long input (50+ characters) renders without crashing or hanging the browser
**PASS**

Tested three inputs:
- 49-char sentence: renders in <5s
- 53-char mixed case: renders in <5s
- 80-char repeated `A`: renders in <5s

The HTML input has `maxlength="80"`, which allows 50+ character input. Figlet's `whitespaceBreak: true` handles long text by wrapping at word boundaries.

### AC8: Each letter in the output is recognizable as its intended character
**PASS**

Rendered all 26 uppercase letters individually — **26/26 are visually distinct** from each other. The Standard figlet font is one of the most widely-used and recognizable ASCII art fonts.

---

## Additional Observations

### Build Integrity
- Vite build succeeds cleanly: 120KB JS bundle (includes figlet + 5 fonts), 2KB CSS
- HTML correctly references both bundles
- All DOM element IDs (`text-input`, `ascii-output`, `font-select`) present in HTML and wired in JS

### Code Quality
- `textContent` used instead of `innerHTML` — no XSS risk
- `input` event listener provides true keystroke-by-keystroke live rendering
- 5 figlet fonts bundled (Standard, Big, Banner3, Block, Slant) — provides variety for future sprints
- Error handling is defensive: double try/catch with character filtering fallback

### Minor Notes (not failures)
- `maxlength="80"` on the text input is a reasonable guard against extremely long input, but could be noted — it does allow 50+ characters as required
- The font selector dropdown works but will be superseded by the preset system in Sprint 3

---

## Summary

All 8 acceptance criteria pass with clear evidence. The text-to-ASCII engine is solid: figlet integration is correct, error handling is robust, the UI wiring is sound, and the build pipeline works. The character ramp module is built as foundational infrastructure for Sprint 2. No issues found.
