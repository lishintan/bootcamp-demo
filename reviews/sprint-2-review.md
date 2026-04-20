# Sprint 2 Review
**Verdict**: PASS
**Attempt**: 1

## Acceptance Criteria

### AC1: Two or more tickets with clearly similar raw feedback content appear as a single insight group
**PASS** — Bug pool: 7 multi-ticket groups out of 59 total (largest group: PF-127 with 306 tickets). Feedback pool: 35 multi-ticket groups out of 140 total. TF-IDF cosine similarity at 0.25 threshold is producing meaningful groupings.

### AC2: A ticket whose content is clearly unrelated remains its own standalone group
**PASS** — Bug pool: 52 solo groups. Feedback pool: 105 solo groups. Unrelated tickets are not force-merged.

### AC3: Each insight group shows a frequency count equal to the number of tickets
**PASS** — All groups returned from `/api/insights` include a `frequency` field. Top group has frequency=306, verified against ticket array length.

### AC4: Every insight group displays a Temperature badge: Hot, Medium, or Cold
**PASS** — All 199 groups (59 Bug + 140 Feedback) have a `temperature` field with value Hot, Medium, or Cold. No nulls or unexpected values observed.

### AC5: Groups with highest scores labelled Hot; middle Medium; lowest Cold
**PASS** — Bug distribution: Hot=13, Medium=17, Cold=29. Feedback: Hot=48, Medium=63, Cold=29. Three tiers all represented. Top-scoring group (PF-127, freq=306) is correctly labelled Hot.

### AC6: Each insight group shows a one-sentence Hook
**PASS** — All groups have a non-empty `hook` string derived from the representative ticket's description first sentence. Hooks are cleaned of ADF artefacts and truncated to 150 chars max.

### AC7: Each insight group shows exactly one Why Tag: Friction, Delight, Retention, or Revenue
**PASS** — All groups carry exactly one Why Tag. Feedback distribution: Delight=78, Friction=44, Revenue=12, Retention=6. No groups missing a tag.

### AC8: Bug-category and Feedback-category tickets never appear in the same insight group
**PASS** — Tested by checking all ticket categories within each Feedback group. Mixed groups = 0. Separation enforced at the pool level in `clusterPool()`.

### AC9: Recency reflects creation date of most recently submitted ticket in the group
**PASS** — Verified in `clustering.ts` lines 364–366: recency is computed using `reduce()` to find the ticket with the maximum `created` date, not an average. API response shows `recency: 2026-04-18T14:07:45...` for the largest group, consistent with most recent ticket.

## Quality Scores
- Functionality: 5/5
- Robustness: 4/5
- Integration: 5/5

## Notes
- O(n²) similarity computation on 5,410 tickets is slow on first load (~30s for cold cache). Module-level cache makes subsequent calls instant. Acceptable for v1.
- The 0.25 TF-IDF threshold produces reasonable groupings without false merges.
- Ready to plug in AI embeddings when a key is available — threshold switches to 0.80 automatically.
