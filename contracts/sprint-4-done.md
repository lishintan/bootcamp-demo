# Sprint 4 — Insight Detail Panel

**Status:** Done  
**Date:** 2026-04-18

## What was built

### Clickable insight cards
- `InsightCard` now accepts an `onSelect` prop and fires it on click (and on Enter/Space for keyboard users)
- Cards have `cursor-pointer` styling and a `focus:ring` outline for keyboard navigation
- The bookmark button stops click propagation so it does not open the detail panel

### Slide-in detail panel (`DetailPanel` component)
- Fixed, right-aligned, full-height panel (~560px wide), scrollable
- Semi-transparent black backdrop behind the panel
- Backdrop click closes the panel; Escape key closes the panel
- Close button (×) in the top-right corner
- Panel does not change the URL — state is held in React state (`selectedGroup`)
- Focus trap: Tab/Shift-Tab cycle stays inside the panel; first focusable element receives focus on open

### Panel sections (in order)

**Header**
- Category badge (Bug / Feedback)
- Temperature badge with score
- WhyTag badge
- Full `hook` text as the panel title

**Narrative**
- Three labelled paragraphs: **Problem**, **Likely Cause**, **Impact**
- With `AI_PROVIDER=none` (current): template-based generation from `representativeTicket`, `whyTag`, and `temperature`
- Code is structured for a single conditional swap to a real AI call when `AI_PROVIDER !== 'none'`

**Temperature Breakdown**
- 3-row card: Frequency (reports), Impact Score (fixed to 1 decimal or "—" if 0), Most Recent (formatted date)

**AI Summary (conditional)**
- Rendered only when `group.frequency >= 50`
- With `AI_PROVIDER=none`: placeholder message stating the count
- Omitted entirely for groups with fewer than 50 tickets

**Ticket List**
- All ticket IDs listed as `PF-XXXX` hyperlinks to `https://mindvalley.atlassian.net/browse/PF-XXXX`
- Opens in a new tab (`target="_blank" rel="noopener noreferrer"`)
- First 20 shown by default with a "Show all N tickets" toggle for groups exceeding 20

**Feature & Team Labels**
- Small labelled tags at the bottom
- Rendered only when `featureName` / `teamName` are non-empty strings

## Files changed
- `app/insights/InsightsClient.tsx` — added `DetailPanel`, `CategoryBadge`, `generateNarrative`; wired `onSelect` into `InsightCard` and `CategorySection`; added `selectedGroup` state to main component

## Build
`pnpm build` passes with zero TypeScript errors.
