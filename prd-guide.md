# /prd Slash Command Guide

## How It Works

It's a **conversational PRD builder**. Instead of you writing a product spec alone, it acts as a tough-but-fair product strategist who interrogates your idea until it's detailed enough for engineers to build from.

The core loop: **you talk, it challenges, it writes the doc.**

---

## The 6 Commands

### 1. `/prd new <name>` — Starting from scratch

**When to use:** You have an idea but no written spec yet.

**Example:**
```
/prd new Habit Tracker App
```

What happens:
1. It asks you the **scope** — is this a whole product, an epic, or a single feature?
2. Creates `prd/habit-tracker-app.md` with empty sections marked `[UNRESOLVED]`
3. Starts grilling you with questions, phase by phase:
   - **Phase 1:** "What problem are you solving? Who's hurting and why?"
   - **Phase 2:** "Who exactly uses this? What device? What's their skill level?"
   - **Phase 3:** "What are the 3-5 things v1 MUST do? Walk me through the flow."
   - **Phase 4:** "How do you measure success? Give me a number, not a feeling."
   - **Phase 5:** "Break it into epics/features. What gets built first?"

It saves your answers into the file as you go. Each resolved section updates the resolution count (e.g., `3/8`).

**Real scenario:** You tell it "users can track daily habits." It pushes back: *"Track how? A checklist? A streak counter? What happens if they miss a day? What does 'tracking' look like at 9am on a Monday vs 11pm on a Sunday?"*

---

### 2. `/prd import <path>` — You already have a doc

**When to use:** You have an existing Google Doc export, rough notes, or a brief that someone wrote. You want to turn it into a structured PRD.

**Example:**
```
/prd import docs/product-brief.md
```

Or just `/prd import` and paste your text.

What happens:
1. Reads your doc, counts words/lines
2. Auto-detects scope (product/epic/feature) based on content
3. **Maps your content to the PRD template by meaning** — if your doc has "Goals" it maps to "Vision", "Background" maps to "Problem", etc.
4. Shows a gap analysis: what's resolved, what's partially there, what's missing entirely
5. Starts the discovery conversation targeting the gaps

**Real scenario:** Your founder wrote a 2-page brief about a new onboarding flow. You import it. The tool says: *"Your doc covered the problem and user types well. But there's no success criteria, no edge cases, and the workflows are vague. Let's start with: you said 'users complete onboarding easily' — what does 'easily' mean exactly? Under 2 minutes? Under 5 taps?"*

---

### 3. `/prd resume <name>` — Pick up where you left off

**When to use:** You started a PRD in a previous session and want to continue.

**Example:**
```
/prd resume habit-tracker-app
```

What happens:
1. Finds the file (fuzzy-matches if you don't give the exact path)
2. Shows you a status summary — what's resolved, what's still `[UNRESOLVED]`
3. Suggests where to pick up, then continues the conversation

**Real scenario:** You resolved Problem, Vision, and Users last session (3/8). It says: *"You're 3/8 resolved. Core Capabilities, Boundaries, Success Criteria, Open Questions, and Epics are still open. Want to tackle Core Capabilities next?"*

---

### 4. `/prd review <path>` — Audit existing docs

**When to use:** You have a folder of specs or notes (not necessarily PRDs) and want to know how solid they are.

**Example:**
```
/prd review prd/founder/
```

What happens:
1. Reads all markdown files in the directory
2. Scores each file on **6 dimensions**: Problem Clarity, User Specificity, Behavioral Precision, Boundaries & Edge Cases, Measurability, Decomposition
3. Shows a dashboard with STRONG/ADEQUATE/WEAK/ABSENT ratings
4. Identifies the biggest gaps across all files
5. Offers three paths forward: deep-dive one file, fix one dimension across all files, or work top-down by priority

**Real scenario:** You have 6 spec files from the team. The review shows Measurability is ABSENT in 4 of them and Boundaries is WEAK across the board. It offers to work through each file and nail down concrete success metrics and edge cases.

---

### 5. `/prd list` — See everything at a glance

**When to use:** You have multiple PRDs and want to see the tree.

```
/prd list
```

Output:
```
PRD Documents
─────────────
habit-tracker-app (product) — 3/8 resolved — discovery
├── daily-check-in (epic) — 0/7 resolved — draft
│   ├── streak-counter (feature) — 5/7 resolved — discovery
│   └── reminder-system (feature) — 0/7 resolved — draft
└── analytics-dashboard (epic) — 2/7 resolved — draft

Total: 5 documents, 10/36 sections resolved (28%)
```

---

### 6. `/prd status` — Find all the gaps

**When to use:** You want to know what's still unresolved across everything.

```
/prd status
```

Output:
```
Unresolved Gaps Across All PRDs
────────────────────────────────
habit-tracker-app.md:
  - Boundaries: [UNRESOLVED]
  - Success Criteria: [UNRESOLVED]
  - Open Questions: [UNRESOLVED]
  - Epics: [UNRESOLVED]

daily-check-in.md:
  - All sections unresolved (0/7)

Total: 26 unresolved sections across 5 documents
```

---

## When to Use What — Quick Decision Guide

| Situation | Command |
|---|---|
| "I have an idea, let's spec it out" | `/prd new My Idea` |
| "Someone wrote a brief, let's make it rigorous" | `/prd import path/to/brief.md` |
| "I started a PRD last week, where was I?" | `/prd resume my-prd` |
| "Are our specs actually good enough to build from?" | `/prd review docs/specs/` |
| "What PRDs do we have?" | `/prd list` |
| "What's still missing across all our PRDs?" | `/prd status` |
| "I don't remember, just help me" | `/prd` (auto-detects) |

---

## Key Thing to Understand

The tool is **deliberately annoying**. It won't let you get away with "the app should be intuitive" or "users can easily manage their data." It forces you to define what those words actually mean in concrete, buildable terms. That's the value — by the time you're done, an engineer can read the PRD and build without asking you 50 questions.
