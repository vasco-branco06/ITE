# SPEC - Log to Jira

## 1. Problem

Errors in the app logs are noticed late.

## 2. Goal and success measure

Every error log line becomes a Jira ticket within one minute.

## 3. Users

The two-person support team.

## 4. Scope

### In scope

Error lines from one app.

### Out of scope

Warnings.

### Later

Nothing planned.

## 5. Requirements

- **R-001** Classifies each log line as error or not with [P-001](prompts/P-001-classify-log.md). → T-001, T-004
- **R-002** Opens one Jira ticket per error line, shaped as [S-001](schemas/S-001-ticket.schema.json). → T-002
- **R-003** Rejects a log line that is not JSON and writes LOG_NOT_JSON to errors.log. → T-003

## 6. Data

- [S-001](schemas/S-001-ticket.schema.json) Ticket sent to Jira. Used by R-002.

## 7. Integrations

Jira Cloud REST API, token from an environment variable (D-001).

## 8. Permissions and security

The Jira token lives in `.env`.

## 9. Stack

Python 3.12, pytest.

## 10. LLM use

- [P-001](prompts/P-001-classify-log.md) Classifies a log line. Used by R-001.

## 11. Errors and edge cases

| Case | Expected behaviour | Test |
|---|---|---|
| Log line is not JSON | Rejected with LOG_NOT_JSON | T-003 |
| Jira is down | Retry three times, then alert | T-002 |
| Token missing | Stop at start with a clear message | T-002 |
| Duplicate error | One ticket only | T-001 |
| Log arrives as plain text | Rejected, no ticket | T-005 |

## 12. Definition of done

All acceptance tests pass on a sample log.
