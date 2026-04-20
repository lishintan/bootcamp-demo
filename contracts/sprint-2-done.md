# Sprint 2 — Done

## Goal
Jira tickets are automatically grouped into semantically coherent insight clusters with Temperature scores and AI-generated metadata computed for each group.

## What was built

### `dashboard/lib/clustering.ts`
Core clustering library. Implements:
- **Text preprocessing**: builds a corpus per ticket from `summary + description + featureName + featureTitle`, lowercased, with English stopwords removed, tokenised on word boundaries.
- **TF-IDF vectorisation**: computes IDF with add-1 smoothing; includes only terms that appear in ≥2 documents (vocabulary pruning for performance on 5,410 tickets).
- **Cosine similarity**: standard dot-product over L2 norms.
- **Single-linkage clustering via Union-Find**: O(n²) pair comparisons within each category pool; union when cosine ≥ threshold. Bug and Feedback pools are clustered independently (they never merge).
- **Threshold**: 0.25 when `AI_PROVIDER=none` (TF-IDF mode); 0.80 when an AI key is present (reserved for semantic embeddings).
- **Group representative**: earliest-created ticket in the cluster.
- **Recency**: ISO date of the most recently created ticket in the group.
- **Temperature scoring**: min-max normalised frequency (×0.40), impact (×0.30), and inverted recency days (×0.30). Hot = top 30%, Medium = 31st–70th, Cold = bottom 29%.
- **Hook generation**: first sentence of representative ticket description (cleaned of markdown/ADF), truncated to 150 chars, ending with a period. Falls back to summary.
- **Why Tag classification**: keyword frequency match across combined group text. Tags: Friction, Delight, Retention, Revenue. Defaults to Friction.
- **Module-level cache**: keyed on `ticketCount:aiProvider`. Clustering is skipped on subsequent calls in the same process lifetime.

### `dashboard/app/api/insights/route.ts`
New API route. Accepts query params:
- `?status=parking_lot|wont_do` — filter tickets by Jira status before clustering
- `?category=Bug|Feedback` — filter groups by category after clustering
- `?team=<name>` — filter tickets by team name before clustering

Response shape:
```json
{
  "groups": [...InsightGroup[]],
  "total": 5410,
  "parkingLot": 947,
  "wontDo": 4463
}
```

### `dashboard/app/insights/page.tsx` (updated)
Replaced the raw ticket list with:
- Summary banner showing total tickets, Parking Lot/Won't Do counts, total groups, and Hot/Medium/Cold breakdown.
- Three sections (Hot, Medium, Cold) each rendering `InsightCard` components.
- `InsightCard` shows: ticket key link, category badge, temperature badge with score, why tag badge, frequency count, hook sentence, representative summary, team/feature/impact/labels meta row, grouped ticket keys (up to 8, then "+N more"), and recency date.

## Decisions made

1. **No external dependencies added**: TF-IDF and cosine similarity are implemented from scratch to avoid adding npm packages and keep the bundle lean.

2. **Vocabulary pruning (df ≥ 2)**: Reduces vector dimensionality significantly on large corpora, making the O(n²) similarity loop practical at 5,000+ tickets.

3. **Union-Find for single-linkage**: More efficient than naive recursive merging; avoids stack overflow on large ticket sets.

4. **Category separation enforced at pool level**: Bugs and Feedback are vectorised and clustered in separate pools. Uncategorised tickets fall into the Feedback pool as a safe default.

5. **Process-lifetime cache with `Map`**: Simpler than `unstable_cache` for a module-level cache. The cache key encodes ticket count + AI provider, so it naturally invalidates when Jira data changes size between restarts.

6. **Insights page uses server-side clustering directly**: Rather than fetching `/api/insights`, the page calls `fetchJiraTickets` + `clusterTickets` directly, sharing the same cache. The API route is available for client-side use in future sprints.

## Known limitations

1. **TF-IDF similarity is vocabulary-based, not semantic**: Tickets that describe the same problem with different words (synonyms, paraphrases) will not be grouped. Semantic embeddings (when AI key is added) will handle these cases.

2. **O(n²) complexity**: At 5,410 tickets, this computes ~14.6 million similarity pairs per category pool on first load. On a modern server this completes in 5–15 seconds. Subsequent requests are instant (cache hit).

3. **The 0.25 threshold was chosen empirically**: It's lower than semantic similarity thresholds to compensate for TF-IDF's precision limits. In practice this may still produce many singleton groups for short or unique summaries.

4. **Hook quality without AI**: First-sentence extraction from raw ADF text is heuristic. Some hooks may be truncated mid-thought or contain residual markup characters not caught by the cleaner regex.

5. **Temperature tiers are percentile-based on the current filtered set**: Filters applied via query params before clustering will change which groups are Hot/Medium/Cold relative to the unfiltered view.
