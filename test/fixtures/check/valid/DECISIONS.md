# DECISIONS - Log to Jira

## Decisions

### D-001 Jira Cloud REST API

- **Decision:** use the Jira Cloud REST API with an API token.
- **Why:** the team already uses Jira Cloud.
- **Alternatives considered:** email to Jira.
- **Affects:** R-002, F-4.1

## Assumptions

### D-005 Logs arrive as JSON

- **Assumption:** every log line is a JSON object.
- **Why it matters:** the classifier reads fields.
- **If wrong:** add a plain-text parser.
- **Tripwire:** T-005
