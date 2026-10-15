# The 12 coverage areas

Source: ITE spec, rule 01 section 1.2. The ids and their order are fixed; `.ite/coverage.json` stores them in this order. The asking order is different (rule 7 in SKILL.md): goal, users, scope, inputs, outputs, integrations, stack, llm, security, errors, acceptance, done.

An area is `clear` when the spec can state what "Clear when" says. Mark it clear without a question when the idea or an earlier answer already says it, and tell the user what you inferred.

## goal

Goal. Clear when: the spec can state what the thing achieves, for whom, and how success is measured.

- Hint: a verb plus an object in the idea ("opens Jira tickets from logs") usually settles what it achieves; you still need the success measure.
- Hint: words like "every", "within", "without duplicates" or a number in the idea are a success measure; quote them in the summary.

## users

Users. Clear when: the spec can state who uses it, how often, and their technical level.

- Hint: "for me", "my", "I want" means one user, the person typing, at the technical level of a Claude Code user.
- Hint: a team or role in the idea ("support team", "sales reps") names the users; frequency usually follows from the inputs (a daily report means daily use).

## scope

Scope and out of scope. Clear when: the spec can state what v1 does, and at least 3 things it explicitly does not do.

- Hint: the idea itself is the v1 scope; the 3 exclusions almost never come from the idea, so expect to ask or recommend them.
- Hint: "and later", "maybe also", "one day" mark future items; record them as out of scope for v1.

## inputs

Input data. Clear when: the spec can state every input, its source, format, size and frequency.

- Hint: file types in the idea (CSV, PDF, logs, emails) give the format and often the source; size and frequency are usually missing.
- Hint: a trigger word ("every Monday", "when a form is sent") gives the frequency.

## outputs

Output. Clear when: the spec can state every output, its format, destination and who reads it.

- Hint: a named destination ("a Google Sheet", "Jira tickets", "an email to me") settles format and destination; the reader is often the user from the users area.
- Hint: "summary", "report" or "dashboard" means a human reads it; "API", "webhook" or "row" means another system reads it.

## integrations

Integrations. Clear when: the spec can state every external system, how it connects, and what happens when it is down.

- Hint: every product name in the idea (Jira, Slack, n8n, Google Sheets) is an integration; "how it connects" is often an API key or a built-in n8n node.
- Hint: the "what happens when it is down" part is almost never in the idea; recommend queue, retry 3 times, then alert.

## security

Permissions and security. Clear when: the spec can state what it can read, write or delete, which secrets it needs and where they live.

- Hint: each integration implies a secret (an API key or token); it always lives in `.env`, never in code.
- Hint: read-only inputs plus create-only outputs is the safe default; anything that edits or deletes needs an explicit question.

## stack

Stack. Clear when: the spec can state language, runtime, hosting, and why (or "no code: n8n/Make/...").

- Hint: a named language or tool in the idea ("a Python script", "an n8n flow") settles the stack; do not ask about language again.
- Hint: "runs on my laptop" or no hosting word means local; "always on" or "for the team" means hosting is a real question.

## llm

Prompts and LLM use. Clear when: the spec can state whether an LLM is involved, which tasks it does, model choice, and the output contract.

- Hint: words like "classify", "summarise", "write", "decide" or "understand" mean an LLM step; copying, moving or counting usually does not.
- Hint: when no step needs judgement, mark the area `not_applicable` with a one-line reason instead of asking.

## errors

Errors and edge cases. Clear when: the spec can state at least 5 named failure cases and the expected behaviour for each.

- Hint: each input and each integration gives at least one failure case for free (bad file, empty file, service down, wrong credentials, duplicate).
- Hint: ask until 5 exist, but propose them yourself first so the user can just say "ok".

## acceptance

Acceptance tests. Clear when: the spec can state at least one Given/When/Then per requirement.

- Hint: write them from the earlier answers; the user only confirms, they never write tests.
- Hint: every failure case from the errors area becomes one test; add one happy-path end-to-end test.

## done

Definition of done. Clear when: the spec can state the checklist that says v1 is finished.

- Hint: the success measure from goal plus "all acceptance tests pass" is the core of the checklist.
- Hint: add the one thing a non-engineer will actually check by hand, such as "I ran it on last week's files and the sheet looked right".
