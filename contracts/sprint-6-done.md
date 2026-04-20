# Sprint 6 Contract — Who Are Our Customers Page

## What was built

Implemented the interactive "Who Are Our Customers" customer profile page as a client-side React component backed by static JSON data.

## Files created / modified

| File | Change |
|------|--------|
| `dashboard/app/customers/CustomersClient.tsx` | New — client component with segment toggles, attribute extraction, and recharts bar charts |
| `dashboard/app/customers/page.tsx` | Replaced — now a lightweight server component that imports static JSON and passes it to CustomersClient |

## Acceptance criteria status

1. **Clicking "Who Are Our Customers" tab displays the page** — Page exists at `/customers`, rendered by Next.js App Router. Tab navigation was already in place from Sprint 1.
2. **Two segment toggles appear** — "Premium Programs" and "Mindvalley Membership" buttons render at the top of the page with customer counts.
3. **Selecting a segment updates all charts** — React state (`activeSegment`) drives `useMemo` re-computation of all 7 attribute distributions without a page reload.
4. **All 7 customer attributes displayed** — Age, Life Stage, Job/Profession, Motivation to Join Mindvalley, Tech Literacy/Savviness, Device Preference, and Membership Type each rendered as a horizontal bar chart.
5. **Non-empty charts for both segments** — "Mindvalley Membership" has 44 records; "Premium Programs" has 6 records (refund/quest-only/premium segments). Both show populated distributions.
6. **Hover tooltips show count and percentage** — recharts custom tooltip displays `{count} customers ({pct}%)` on hover over any bar.
7. **No Bookmarked Insights section** — Page contains only header, segment toggles, summary bar, and charts. No bookmark UI present.
8. **Team filter isolation** — Customer profile data is sourced entirely from static JSON with no dependency on team filter state from the Insights tab.

## Implementation notes

- **Data approach**: Static JSON imported directly in `page.tsx` (server component) and passed as a prop to `CustomersClient.tsx`. This avoids a client-side fetch and makes the route statically pre-renderable (confirmed by build output showing `/customers` as `○ (Static)`).
- **Segment mapping**: Premium = segments containing `[Premium]`, `[Quest-only]`, or `Refund`. Membership = all others.
- **Attribute extraction**: All 7 attributes extracted from `summary` markdown text using keyword matching as specified. Age extraction also handles explicit `{N}-year-old` patterns found in the data (e.g. "59-year-old", "71-year-old", "69-year-old") to increase coverage beyond decade keywords.
- **Chart style**: Horizontal `BarChart` (layout="vertical") using recharts. Indigo fill with descending opacity for ranked bars. Active segment uses amber colour for Premium.
- **Build**: `pnpm build` passes with 0 TypeScript errors.
