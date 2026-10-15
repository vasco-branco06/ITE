# P-001 Classify log

Used by: R-001 · Tested by: T-004

## Role

You classify one log line.

## Task

Answer error or not_error.

## Inputs

One JSON log line.

## Output contract

One word.

## Rules

1. Only the two words.

## Examples

- level ERROR → error
- level INFO → not_error

## Failure behaviour

Answer not_error when unsure.
