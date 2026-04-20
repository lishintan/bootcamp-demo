---
title: 'Automated Feedback Prioritization & Insight Delivery'
slug: 'automated-feedback-prioritization'
scope: product
status: discovery
parent: null
children: []
created: 2026-04-14
updated: 2026-04-14
resolution: 8/8
open-questions: 0
---

# Automated Feedback Prioritization & Insight Delivery

## Problem

Squad leads and Product Ops spend approximately 2 hours every week manually reviewing Jira tickets in the **Product Feedback** project to identify recurring themes, group similar tickets, and prioritize what gets built. The process is entirely manual: someone opens the Jira board, reads through individual tickets under "Parking Lot," identifies semantic patterns, groups them, and decides what moves to To Do vs. Won't Do.

This bottleneck has three compounding costs:
1. 2 hours/week of high-context labour that displaces strategic thinking
2. Grouping quality is person-dependent — different squad leads apply different standards
3. High-value, recurring signals get buried because no one has time to track them across weeks

The goal is to reduce this to a 30-minute monthly review by automating grouping, ranking, and delivery of insights, while preserving human decision-making authority for final disposition (To Do vs. Won't Do).

## Vision

A fully automated feedback intelligence layer that:
- Groups semantically similar tickets (≥80% similarity, full-context NLP, not keyword matching) into parent/child clusters every week
- Cross-references the Product Feedback board against team delivery projects to surface whether a requested feature is already being built or planned
- Delivers a weekly bug digest to Product Ops every Monday at 8:00 AM, and a monthly feature insight digest to squad leads on the first Monday of each month at 8:00 AM
- Sends digests to Slack (`#shin-test-space` for now) and writes summaries to Confluence (Product Management space)
- Surfaces Won't Do candidates with one-click Slack approval, with reminders every 24 hours up to 3 times if no response

Success is: grooming time drops from 2 hours/week to 30 minutes/month, grouping error rate stays below 10%, and at least 1 insight per quarter is turned into a shipped deliverable.

## Users

**Squad Leads** — receive the monthly feature insight digest, approve or skip Won't Do proposals for their team's tickets, and use the digest to make prioritization decisions

| Squad Lead | Team(s) |
|---|---|
| Sambruce Joseph | Transform |
| Palak Varma | Engage |
| Natasha Tomkinson | Identity & Payments |
| Amanda Shin | Academy |
| Suresh Sakadivan | AI & Innovation |

**Product Ops** — receive the weekly bug digest; responsible for reviewing tickets flagged for Won't Do due to insufficient description

| Product Ops | Teams Covered |
|---|---|
| Darshini Mohanadass | Academy, Engage |
| Bryan Swee | Identity & Payments |
| Jin Choy Chew | AI & Innovation, Transform |

**Customers** — submit tickets directly; do not interact with this system post-submission

**Anti-users:** Engineering teams, executives, and CSMs are not direct recipients of this system's outputs.

## Core Capabilities

### 1. Semantic Ticket Grouping (Weekly, every Monday 8:00 AM)

- Source: All tickets with status **Parking Lot** in the **Product Feedback** Jira project
- Issue type: **Idea**, categorised as Bug or Feature Request
- Scope: Only tickets in Parking Lot — all other statuses are excluded
- Similarity threshold: **≥80% semantic similarity** using full-ticket context (title + description + tags). Keyword matching alone is insufficient — meaning must be derived holistically
- If similarity is uncertain or below threshold: leave as individual ticket, do not force a group
- Deduplication unit: **unique user + unique issue**. If the same user submits 15 tickets about the same problem, it counts as 1 unique signal

**Grouping logic:**
1. Read all Parking Lot tickets
2. For each ticket, compute semantic similarity against all existing groups
3. If ≥80% similar to an existing group → add ticket as child to that parent
4. If no existing group matches → promote the earliest ticket (by creation date) as the new parent; all subsequent similar tickets become children
5. If a new ticket arrives in week 3 matching a group from week 1 → add to existing parent, do not create a new parent

**Metadata preservation:** Child ticket fields (reporter, attachments, comments, priority, customer segment, AI severity, linked PRs) remain unchanged on the child. The parent ticket inherits no metadata — it is a linking/organisational construct.

**Language:** Tickets are already translated to English upstream (in the Make.com automation). No additional translation required.

**First run:** Process all historical Parking Lot tickets. From the second run onwards, process only newly created tickets (those created after the first run's timestamp).

### 2. Cross-Project Reference Check

When a ticket group is created or updated, the system checks the following Jira projects for related work items:

- **Engage**, **Transform**, **AI & Innovation**, **Academy**, **Identity & Payments**

Match logic: semantic similarity between the Product Feedback ticket content and existing work items (stories, tasks, epics) in the team projects.

If a match is found:
- Link the Product Feedback parent ticket to the matching work item in Jira (bidirectional link)
- Include this linkage in the weekly/monthly digest ("This request is linked to [ticket ID] already in the team's backlog")
- Do not modify the work item's status or priority — linking only
- If the matched work item's priority should be bumped based on the volume of Product Feedback signals, surface this as a recommendation in the digest with a **direct link to the work item in Jira**. The squad lead reading the digest is responsible for acting on this — no auto-update

### 3. Won't Do Candidate Identification & Approval

**Automatic Won't Do candidates:**

| Condition | Who Reviews | Reason in Slack Message |
|---|---|---|
| Ticket has insufficient description (no actionable content) | Product Ops | "Insufficient information to action" |
| Ticket's linked delivery work item is In Progress, in current sprint, or planned for next sprint | Squad Lead (for that team) | "Already being delivered in [ticket ID]" |
| Ticket is low priority after cross-referencing impact score | Squad Lead | Impact score + justification |

**Approval flow:**
1. System sends a Slack message listing proposed Won't Do tickets for that team
2. Each ticket has an individual **Approve** button
3. A global **Approve All** button appears at the bottom of the message
4. **Skip** = do not change status; ticket stays in Parking Lot until next weekly cycle
5. If no response to the message: remind the same person every **24 hours**, up to **3 reminders**
6. After 3 reminders with no response: stop reminding; ticket remains in Parking Lot

**Won't Do approval is manual for all cases.** The system never moves a ticket to Won't Do autonomously.

### 4. Resurface Won't Do Tickets

If a ticket was previously moved to Won't Do and **3 or more** new, similar tickets have arrived since then:
- Include it in the monthly digest with a note: "Previously marked Won't Do on [date]. [X] new similar tickets have surfaced since."
- Do not auto-reopen the ticket; surface it for human re-evaluation

### 5. Weekly Bug Digest (Monday 8:00 AM)

**Audience:** Product Ops (Darshini, Bryan, Jin Choy)
**Scope:** Bug-categorised tickets in Parking Lot

Content per recipient (grouped by their covered teams):
- Grouped bug themes with count of unique users affected
- Impact score per group (from existing Jira formula field)
- Won't Do candidate list with Approve / Approve All buttons
- Tickets flagged for insufficient description (for Product Ops approval)
- Link to parent Jira ticket for each theme

**Delivery:** Slack channel `#shin-test-space` only. No Confluence write for weekly bug reports.

### 6. Monthly Feature Insight Digest (First Monday of each month, 8:00 AM)

**Audience:** Squad Leads (one section per team)
**Scope:** Feature Request-categorised tickets in Parking Lot

Content per team section:
- **Top 5 feature themes** ranked by Impact Score (existing Jira field: combines linked ticket count + customer segment weight + AI severity rating)
- For each theme:
  - Number of unique users who raised it
  - User story (synthesised from ticket content)
  - Current pain point
  - Business value (engagement / consumption / retention — derived by AI from ticket content)
  - Link to the parent Jira ticket
  - Whether it's linked to an existing delivery work item
- **Notable Trends section**: themes that did not make the top 5 but have **2–3 unique reporters**. These are surfaced as early signals of emerging issues rather than by Impact Score rank alone
- Won't Do candidate list with Approve / Approve All buttons
- Hyperlink to the relevant Jira ticket on each insight item (for easy navigation, no in-Slack status change)

**Delivery:** Slack `#shin-test-space` + Confluence page in the **Product Management** space. A new Confluence page is created once per quarter (not per month). Weekly bug reports are Slack-only and do not write to Confluence.

## Boundaries

**In scope:**
- Jira project: Product Feedback (all Parking Lot tickets)
- Jira projects for cross-reference: Engage, Transform, AI & Innovation, Academy, Identity & Payments
- Delivery: Slack + Confluence (Looker dashboard deferred — feasibility unknown)
- Issue types: Ideas (Bug + Feature Request sub-categories)
- Cadence: weekly bugs, monthly features

**Out of scope (v1):**
- Per-team Slack channels (using `#shin-test-space` until defined)
- Looker dashboard delivery
- In-Slack ticket status change (squad leads navigate to Jira via hyperlink)
- Modifying team project work item priority automatically
- Any Jira project outside the 6 named above
- Tickets in any status other than Parking Lot as input source

**Explicit exclusions:**
- Security/compliance tickets: if identified (by label or content), keep as individual tickets — do not auto-merge
- Tickets from non-customer sources are not in scope (all tickets are customer-direct)

**Human authority preserved:**
- Won't Do status changes always require human approval
- Final prioritisation decisions (moving to To Do) remain with squad leads via Jira directly

## Success Criteria

| Metric | Baseline | Target |
|---|---|---|
| Grooming time | 2 hours/week | 30 minutes/month |
| Grouping error rate | N/A | ≤10% (errors must have some topical similarity — completely unrelated topics grouped together = unacceptable) |
| Quarterly adoption | N/A | ≥1 insight turned into a shipped deliverable per quarter |
| Insight accuracy | N/A | Full context captured; digests are actionable without manual ticket review |

**Adoption tracking mechanism:**
The system checks whether a Product Feedback parent ticket has a linked **Delivery Ticket**. If that delivery ticket's status is **Done/Completed**, the insight is counted as successfully adopted. Checked quarterly.

## Open Questions

1. **Per-team Slack channels** — squad leads to define channel names per team before go-live. Currently defaulting to `#shin-test-space` for all delivery.

## Epics

1. **Semantic Grouping Engine** — NLP pipeline that reads Parking Lot tickets, computes similarity, creates/updates parent-child relationships in Jira
2. **Cross-Project Linker** — weekly job that matches Product Feedback groups to work items in team delivery projects and creates Jira links
3. **Impact Scoring & Ranking** — reads existing Impact Score field, deduplicates by unique user/issue, ranks groups for digest ordering
4. **Won't Do Candidate Pipeline** — identifies candidates (insufficient description, sprint-locked, low priority), batches into Slack approval messages, handles reminders and state
5. **Weekly Bug Digest** — formats and delivers the Monday bug report to Product Ops via Slack + Confluence
6. **Monthly Feature Digest** — formats and delivers the first-Monday feature report to squad leads via Slack + Confluence, including Notable Trends section
7. **Resurfacing Engine** — tracks previously Won't Do'd tickets, monitors for re-emergence (≥3 new similar tickets), includes in monthly digest
8. **Adoption Tracker** — queries linked delivery tickets quarterly, checks completion status, reports adoption rate
