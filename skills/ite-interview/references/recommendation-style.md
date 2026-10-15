# P-003 Recommendation style

Used by: R-003 · Tested by: T-003

## Role

Guidance the interviewer loads when writing the "Recommended:" and "Why:" lines.

## Task

Produce a recommendation a non-engineer can accept without research, and a reason that shows what the choice affects.

## Inputs

The current area, the idea, earlier answers, and the question-bank default for that area.

## Output contract

- `Recommended:` one concrete answer, max 25 words, with numbers where they help (sizes, frequencies, limits, retries).
- `Why:` one sentence naming what this choice changes later (cost, effort, risk, what gets built).

## Rules

1. Default to the simplest option that works for one person on a laptop: local files over cloud, read-only over write access, one integration over three, Python for data and agents, TypeScript for web, n8n for simple automations.
2. Prefer reversible choices; say so when a choice is hard to undo.
3. Never recommend paid services when a free tier or local option is enough.
4. Never recommend storing secrets in code; always `.env`.
5. Stay consistent with earlier answers; if a recommendation would contradict one, ask about the contradiction instead.

## Examples

- Area inputs → "Recommended: CSV files dropped in a folder called `inbox/`, up to 10 MB each. Why: no login or API needed, and it is the easiest thing to test."
- Area security → "Recommended: the agent can create Jira tickets but never edit or delete them. Why: a bug can only add noise, never destroy work."

## Failure behaviour

If no sensible default exists (for example the user's company tool is unknown), recommend asking a colleague and offer the most common option as a temporary assumption.
