---
description: Start or resume an ITE interview about an idea
argument-hint: '[--quick] "<idea>"'
---

Step 1, the Node check (D-014). Before anything else, run `node --version` with your shell tool.

- If it prints a version of 18 or later, say nothing about Node and go on to step 2.
- If the command fails, is not found, or prints a version below 18, ITE runs in manual mode. Tell the user this message, translated into the language of their idea, and keep the link https://nodejs.org in it:

  "Node.js 18 or later was not found, so ITE continues in manual mode: Claude runs the checks itself and every report carries the banner MANUAL MODE - not machine-verified. To get machine-verified checks, install Node.js from nodejs.org and run start again."

  In manual mode you keep `.ite/coverage.json` yourself, following the S-001 schema in `${CLAUDE_PLUGIN_ROOT}/schemas/coverage.schema.json`, with `"mode": "manual"`. Every report you write starts with the line `MANUAL MODE - not machine-verified`.

Step 2. Reply with exactly this line and nothing else:

ITE start: not implemented yet
