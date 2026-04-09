---
description: Run an independent code review using OpenAI Codex CLI — a second opinion from a different AI. Use standalone or as part of the build loop.
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
argument-hint: '[sprint <N> | diff [base-branch] | auto]'
---

# /codex-review — Independent Code Review via OpenAI Codex CLI

You are a review coordinator. Your job is to get an **independent code review
from OpenAI's Codex CLI** so that Claude never reviews its own code.

---

## 1. Routing

Parse `$ARGUMENTS` and route:

| Input               | Action                                                                 |
| ------------------- | ---------------------------------------------------------------------- |
| `sprint <N>`        | Review the changes from sprint N (diff contracts/sprint-N-done.md)     |
| `diff [base]`       | Review the git diff against a base branch (default: `main`)            |
| `auto`              | Review all uncommitted changes (staged + unstaged + untracked)         |
| *(empty)*           | Same as `auto`                                                         |

---

## 2. Gather the diff

Based on the route, determine what to review:

### For `sprint <N>`:
1. Read `contracts/sprint-{N}-done.md` to understand what was built
2. Find the relevant git commits for this sprint (look at git log for sprint-related commits)
3. Generate the diff: `git diff HEAD~{commits}` or against the commit before the sprint started

### For `diff [base]`:
1. Run `git diff {base}...HEAD` to get all changes against the base branch

### For `auto` / empty:
1. Run `git diff HEAD` for staged+unstaged changes
2. Also check `git status` for untracked files — include their content

---

## 3. Run Codex Review

Execute the Codex CLI review command. Choose the appropriate form:

```bash
# For uncommitted changes:
codex review --uncommitted "Review this code for bugs, security issues, code quality, and architectural concerns. Be rigorous — flag anything suspicious."

# For changes against a base branch:
codex review --base {branch} "Review this code for bugs, security issues, code quality, and architectural concerns. Be rigorous — flag anything suspicious."

# For a specific commit:
codex review --commit {sha} "Review this code for bugs, security issues, code quality, and architectural concerns. Be rigorous — flag anything suspicious."
```

**Important**: Run codex from the project root directory. Use a timeout of 300000ms (5 minutes) since reviews can take time.

If custom review instructions exist in `codex-review-instructions.md` at the project root, append those to the prompt.

---

## 4. Capture and format the output

1. Capture the full Codex CLI output
2. Write the review to `reviews/codex-review-latest.md` with this format:

```markdown
# Codex Code Review
**Date**: {date}
**Scope**: {what was reviewed — sprint N, diff against main, uncommitted changes}
**Reviewer**: OpenAI Codex CLI

## Review Output
{paste full codex output here}

## Action Items
{extract any concrete issues or suggestions into a numbered list}
```

3. If this is a sprint review, also write to `reviews/codex-sprint-{N}-review.md`

---

## 5. Report to user

Print a summary:
- What was reviewed (scope, number of files changed)
- Number of issues found (critical / warning / suggestion)
- Path to the full review file

If there are critical issues, highlight them prominently.

---

## Integration with /build

When called from the build orchestrator with `sprint <N>`, this command acts as
an **additional review gate**. The build command can spawn this as an agent
and use the output alongside its own evaluator. The key value: **Codex is a
completely different AI model reviewing Claude's code — true independent review.**

The build orchestrator should:
1. After its own evaluator passes a sprint, run `/codex-review sprint N`
2. If Codex flags critical issues, treat it as a FAIL and retry
3. Include the Codex feedback in the generator's retry prompt
