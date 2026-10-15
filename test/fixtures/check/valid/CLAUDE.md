# CLAUDE.md - Building Log to Jira

## Read order

INDEX, SPEC, DECISIONS, PLAN, then only what the task references.

## One task at a time

Statuses: todo, in-progress, done, blocked.

## Tests first

Turn tests/cases.json entries into pytest tests, run them red, then implement.

## Done means green

A task is done only when its tests pass.

## Assumption tripwire

If an assumption test fails, stop and report two options with a recommendation.

## Generated files

Never edit the generated schema files by hand.

## Never change the spec to pass a test

Never edit SPEC.md or DECISIONS.md to make a test pass.

## Secrets

Secrets come from environment variables or .env, listed in .gitignore.

## User language

Talk to the user in the language in .ite/coverage.json. Files stay in English.

## Commands

pytest
