# ITE (Integrated Thought Environment)

A 5-question interview (or a full one) in your language; you approve a plain list of checks; Claude Code builds against them.

ITE is a Claude Code plugin. It turns a vague idea into a spec folder: requirements, decisions, a plan, schemas and tests, all linked by ID. A fresh Claude Code session builds from that folder, tests first.

Status: in development, before v0.1.

## Who it is for

GTM Engineers and technical marketers first, then founders and anyone else who builds with Claude Code.

## Requirements

- Claude Code.
- Node.js 18 or later on PATH. ITE's checker, schema generator and build gate are Node scripts with no dependencies. Without Node, `/ite:start` warns you and continues in manual mode, and every report it writes is marked `MANUAL MODE - not machine-verified`.

## Install

In a terminal (PowerShell or bash):

```
claude plugin marketplace add vasco-branco06/ite
claude plugin install ite@ite
claude plugin list
```

`claude plugin list` should show `ite`. Inside a Claude Code session the same steps are `/plugin marketplace add vasco-branco06/ite` and `/plugin install ite@ite`.

From a local clone instead of GitHub:

```
claude plugin marketplace add <path-to-the-cloned-folder>
claude plugin install ite@ite
```

## Commands

Run them in the folder where the spec should be written.

| Command | Does |
|---|---|
| `/ite:start "<your idea>"` | Starts the interview, or resumes it. One question at a time, each with a recommended answer. Ends when you approve the list of checks. |
| `/ite:start --quick "<your idea>"` | Same, capped at 5 questions. Areas left open are marked as assumptions, each with a test. |
| `/ite:compile` | Writes the spec folder from the approved interview, generates the schema files and runs the checker. |
| `/ite:status` | Shows which areas are clear, assumed, not applicable or open, plus the checker summary and the next step. |
| `/ite:build` | Runs the build gate. If the folder is complete, it prints two ready-to-copy commands (PowerShell and bash) that start the build in a new Claude Code session. It never builds in the current session. |

## What you get

```
<project>/
  INDEX.md
  SPEC.md
  DECISIONS.md
  PLAN.md
  CLAUDE.md
  prompts/
    P-001-<slug>.md ...        or NOT_APPLICABLE.md
  schemas/
    S-001-<slug>.schema.json   (source)
    S-001-<slug>.zod.ts        (generated)
    S-001-<slug>.py            (generated)
  tests/
    acceptance.md
    cases.json
    promptfooconfig.yaml
  .ite/
    coverage.json
    check-report.json
```

## Privacy

ITE reads no API keys or login data, and its scripts make no network calls. Your own Claude Code does all model work.

## License

MIT. See [LICENSE](LICENSE) and [CREDITS.md](CREDITS.md).
