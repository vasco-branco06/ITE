# CLAUDE.md - Building <!-- ite: fill project name -->

This folder is the spec for <!-- ite: fill project name -->, written by ITE. Treat it as the single source of truth.

## Read order

1. `INDEX.md` - map of every file and ID.
2. `SPEC.md` - requirements `R-xxx`.
3. `DECISIONS.md` - decisions and assumptions `D-xxx`.
4. `PLAN.md` - find the first task that is not `done`.
5. Only the files the current task references. Do not load the rest.

## One task at a time

Work only on the current task in `PLAN.md`. Statuses: `todo` → `in-progress` → `done`, or `blocked` with a reason. Update the status and the date when it changes. Do not start the next task in the same turn unless the user says so.

## Tests first

Turn the `tests/cases.json` entries named in the task's `Done when` line into executable tests with <!-- ite: fill test runner, e.g. pytest or vitest -->. Run them and see them fail, then implement.

## Done means green

A task is `done` only when every test it names passes.

## Assumption tripwire

If a test linked to an assumption (a `D-` in the Assumptions section of `DECISIONS.md`) fails, stop. Do not work around it. Report which assumption broke, what you observed, and two options with a recommendation.

## Generated files

Never edit `schemas/*.zod.ts` or `schemas/*.py` by hand. Edit the `.schema.json` and ask the user to re-run compile.

## Never change the spec to pass a test

Never edit `SPEC.md` or `DECISIONS.md` to make a test pass. If the spec is wrong, stop and ask the user.

## Secrets

Read secrets only from environment variables or a `.env` file. `.env` is listed in `.gitignore`. Never write a secret into code, logs or these files.

## User language

Talk to the user in the language stored in `.ite/coverage.json` (`language`: <!-- ite: fill language tag -->). Every file stays in English. Tripwire stop reports use plain words in that language and no code.

## Commands

```
<!-- ite: fill stack-specific install, test and run commands, one per line -->
```

To start building in a fresh session: `claude "Read CLAUDE.md, then follow PLAN.md from the first task that is not done."`
