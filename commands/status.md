---
description: Show interview coverage and checker results
argument-hint: '[folder]'
---

Arguments: $ARGUMENTS

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs" status $ARGUMENTS` with your shell tool (no argument means the current folder).

- Exit code 4: there is no interview in that folder. Tell the user, in one sentence in their language, to run start first. Stop.
- Exit code 0: show the six printed lines, translated into the `language` stored in `.ite/coverage.json`. Keep area ids, numbers and checker codes (such as `W-ERRORS-THIN`) exactly as printed. Add nothing else.
