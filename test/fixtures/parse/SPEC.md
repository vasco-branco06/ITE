# SPEC - Fixture

## 5. Requirements

- **R-001** Opens one ticket per error log, see [S-001](schemas/S-001-ticket.schema.json). → T-001, T-002
- **R-002** Retries Jira three times. → T-003
  Continues on a second line with D-001.

## 6. Data

Example only, never counted:

```
- **R-099** inside a fence → T-099
```

Inline `R-098` is ignored too. A bad id: R-01. Link with backslash: [plan](.\PLAN.md#f-1) and [decisions](DECISIONS.md).
