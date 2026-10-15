---
description: Start or resume an ITE interview about an idea
argument-hint: '[--quick] "<idea>"'
---

You run ITE's interview in the current folder. Follow the steps in order. Use the `ite-interview` skill for the interview itself (turn format, rules, references). Everything you say to the user is in their language; every file is English.

Arguments: $ARGUMENTS

## Step 1: Node check (D-014)

Before anything else, run `node --version` with your shell tool.

- If it prints a version of 18 or later, say nothing about Node and go on.
- If the command fails, is not found, or prints a version below 18, ITE runs in manual mode. Tell the user this message, translated into the language of their idea, and keep the link https://nodejs.org in it:

  "Node.js 18 or later was not found, so ITE continues in manual mode: Claude runs the checks itself and every report carries the banner MANUAL MODE - not machine-verified. To get machine-verified checks, install Node.js from nodejs.org and run start again."

  In manual mode you keep `.ite/coverage.json` yourself, following the S-001 schema in `${CLAUDE_PLUGIN_ROOT}/schemas/coverage.schema.json`, with `"mode": "manual"`, and you do by hand what each script call below would do. Every report you write starts with the line `MANUAL MODE - not machine-verified`.

## Step 2: read the arguments

If the arguments start with `--quick`, quick mode is requested and the idea is the rest. Otherwise the whole argument text is the idea. The idea may be empty.

## Step 3: resume or create

If `.ite/coverage.json` exists in this folder, resume. Never run init on it.

1. If `--quick` was given, say this one line in the user's language: "Quick mode is chosen only when an interview starts. Your saved setting is kept."
2. Read the state. Summarise what is already decided in 3 to 5 lines, in the stored `language`.
3. If `question_budget` is not null, the question turns already reach it, and the last turn is not an answered stop offer, the first turn is the stop offer (step 5). Otherwise run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs" next` and continue the interview at that area. Never repeat a question that already has an answer in `history`.

If there is no state:

1. No idea given: ask the user, in one sentence, to describe the idea in one sentence. Stop until they answer.
2. Detect the language of the idea (a short tag such as `pt`, `en`, `es`).
3. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs" init "<idea>" --lang <tag>`, adding `--quick` when quick mode was requested. If the folder is not writable, explain that in one sentence and stop.
4. Infer, using each area's "Clear when" line and hints in the skill's areas reference (a hint that says the idea settles an area means clear, for example a named language settles stack): for every area the idea already answers, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs" answer <area> --state clear --summary "<what the idea says>"` (or `--state not_applicable --reason "<one line>"`). For every area the idea touches but does not settle (for example it names the input format but not where the file comes from), keep what it says: `node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs" answer <area> --state open --summary "<what the idea says>"`, and never ask again about that part. Then tell the user, in one short paragraph, what you inferred and which areas you marked settled, and that they can say "enough" (in their language, for example "chega") at any time.

## Step 4: the interview

Repeat until no area is open:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs" next` to get the area to ask about.
2. Before asking, log the question: `node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs" log-question <area> --question "<question>" --recommended "<recommendation>"`. If it exits 5, do not ask that question; go to step 5.
3. Ask it in the skill's turn format and wait for the answer. The header count `n/12 areas settled` is the number of areas whose state is not open in `.ite/coverage.json` right now; read it from the file, never estimate it.
4. Write the answer before anything else: `node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs" answer <area> --state <clear|assumed|not_applicable|open> --summary "<summary>" --answer "<the user's reply>"`, adding `--accepted` when they took the recommendation. An area that needs more questions stays `open`. "I don't know" means `assumed` with the recommendation, plus `--decision D-xxx --test T-xxx` (the next free numbers in the state).
5. If the user says enough in any language ("enough", "stop", "that's it", "chega", "basta", "já chega", "pára", or the same in another language), go to step 6.

## Step 5: the stop offer (quick mode budget)

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs" log-stop-offer --question "<the offer in the user's language>" --recommended "<Yes, in the user's language>"`, then ask, in the turn format: "Shall I assume the rest? Each assumption gets a test you will approve." Recommended: Yes. Why: "Every assumption gets a test you approve before anything is built."

- Yes: go to step 6, and run `assume-rest` there as `node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs" assume-rest --answer "<the user's reply>" --accepted`.
- No: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs" budget off --answer "<the user's reply>"`, log the pending question again with `log-question` (it now succeeds), ask it, and continue step 4. Say nothing about the budget.

## Step 6: early stop

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs" assume-rest` (add `--answer "<the user's reply>" --accepted` when you came here from a Yes to the stop offer). It prints the areas it turned into assumed. For each one, choose ITE's recommended answer, then record one assumption and one "if this, test that" test for it: `node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs" answer <area> --state assumed --summary "<the assumption>" --decision D-xxx --test T-xxx`, using the next free D- and T- numbers. Then go to step 7.

## Step 7: approval

When nothing is open, show every test as one line in the user's language. Mark each test that checks an assumption and name its D-. Ask the user to approve or edit. An edit goes back into the right area through `answer`. When they approve, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs" approve` and tell them, in their language, to run `/ite:compile` next.
