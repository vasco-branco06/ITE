# Worked interviews

Two complete interviews to copy the rhythm from. They are in English so every reader can follow them; a real interview speaks the language of the idea. Lines starting with `State:` are the script calls you make between turns; the user never sees them.

## Example 1: an agent that stops early

Idea: "An agent that reads our server logs and opens Jira tickets for errors, without duplicates."

Inferred from your idea: the agent reads server logs, opens Jira tickets for errors and must not open the same ticket twice. Jira is the only outside tool so far. I still need a success measure, so no area is settled yet. Correct me if I got anything wrong, and say "enough" at any time to stop; I will then assume the rest and give every assumption a test.

[Area: Goal · 0/12 areas settled]

How quickly should a ticket exist after an error appears in the logs?

Recommended: Within 10 minutes, one ticket per distinct error.
Why: This sets how often the agent runs and is the number we test against.

User: ok
State: `answer goal --state clear --summary "Open one Jira ticket per distinct ERROR within 10 minutes, no duplicates."`

[Area: Users · 1/12 areas settled]

Who will read and work on these tickets day to day?

Recommended: Your support team, 2 to 3 people who already use Jira.
Why: It decides the Jira project, the permissions and how the ticket titles are written.

User: ok, the support team, three people

[Area: Scope · 2/12 areas settled]

What should version 1 not do, even if it sounds useful?

Recommended: No dashboard, no editing or closing existing tickets, and only this one server's logs.
Why: Each of these would double the work, and none is needed to prove the agent helps.

User: ok

[Area: Input data · 3/12 areas settled]

What do the log lines look like?

Recommended: One JSON object per line, with a level, a timestamp and a message.
Why: JSON is the easiest format to read reliably, so it lowers the risk of missed errors.

User: no, they are plain text lines from a Java app, like "2026-10-20 10:02:11 ERROR PaymentService timeout"
State: `answer inputs --state open --summary "Plain-text Java log lines: date, time, level, class, message."`

[Area: Input data · 3/12 areas settled]

How much log does the server write in a day, and where are the files?

Recommended: Up to 50 MB a day in /var/log/app/, read every 5 minutes.
Why: It tells us the agent can read the whole day in one go and still meet the 10-minute goal.

User: ok

[Area: Output · 4/12 areas settled]

What should each ticket contain?

Recommended: A title with the error class and message, the first 20 log lines as the description, a count of repeats, in project SUP.
Why: Your team can act on the ticket without opening the server.

User: ok

[Area: Integrations · 5/12 areas settled]

If Jira is down for an hour, what should the agent do?

Recommended: Keep the tickets in a local queue, retry 3 times over 15 minutes, then write an alert to a file.
Why: No error is lost, and a long outage does not flood Jira later.

User: I don't know
State: `answer integrations --state assumed --summary "Jira down: queue locally, retry 3 times over 15 minutes, then alert." --decision D-001 --test T-001`

That is fine, I will take the recommendation as an assumption and add a test that checks it.

[Area: Stack · 6/12 areas settled]

Do you have a preferred language or place to run it?

Recommended: A Python script on the same server, run every 5 minutes by a scheduler.
Why: Python reads logs easily, and running next to the logs needs no copying.

User: ok

[Area: Prompts and LLM use · 7/12 areas settled]

Is there any step that needs judgement that simple rules cannot handle?

Recommended: No language model; group errors by class and message with plain rules.
Why: Rules are free, fast and testable, and the log already says which lines are errors.

User: ok
State: `answer llm --state not_applicable --reason "Errors are found and grouped by rules on the log level, class and message."`

[Area: Permissions and security · 8/12 areas settled]

What should the agent be allowed to do in Jira?

Recommended: Create tickets and add comments in project SUP only, with an API token in a `.env` file.
Why: A bug can then only add noise, never close or delete your team's work.

User: ok

[Area: Errors and edge cases · 9/12 areas settled]

What should happen when a log line cannot be read, for example a broken or half-written line?

Recommended: Skip the line, write it to `skipped.log`, and keep going.
Why: One bad line must never stop the tickets for the real errors.

User: enough, assume the rest
State: `assume-rest` → errors, acceptance, done. Then one D- and one T- per assumed area.

Ok, I will stop here. Here are all 8 checks I will hand to the build. The ones marked "assumption" test something I assumed for you:

- T-001 (assumption, D-001, integrations): if Jira answers 503 for an hour, no ticket is lost and there are at most 3 retries before an alert is written.
- T-002 (assumption, D-002, errors): if a log line is broken, it lands in `skipped.log` and the rest of the file is still processed.
- T-003 (assumption, D-003, acceptance): if the agent runs on yesterday's real log, every distinct ERROR has exactly one ticket.
- T-004 (assumption, D-004, done): if the support team reads 5 new tickets, they can act on each without opening the server.
- T-005: if the same error appears 40 times in 10 minutes, there is one ticket with a count of 40.
- T-006: if a new error is written to the log, its ticket exists within 10 minutes.
- T-007: if the agent runs twice on the same log, the second run opens no ticket.
- T-008: if the API token is missing from `.env`, the agent stops with a clear message and opens nothing.

Do you approve these checks, or do you want to change any of them?

User: approved
State: `approve`

Done. Run compile next.

## Example 2: an automation that runs to the end

Idea: "An n8n flow that copies new Typeform answers into a Google Sheet and emails me a count every Friday."

Inferred from your idea: it is an n8n flow (stack settled), it copies answers and counts them, so no step needs a language model (LLM use is not applicable). Typeform, Google Sheets and email are the outside tools. Correct me if I got anything wrong, and say "enough" at any time to stop; I will then assume the rest and give every assumption a test.

State: `answer stack --state clear --summary "n8n flow."` and `answer llm --state not_applicable --reason "Answers are copied and counted; no judgement needed."`

[Area: Goal · 2/12 areas settled]

How will you know the flow is working, without opening n8n?

Recommended: Every new answer is in the sheet within 15 minutes, and the Friday email count matches the sheet.
Why: Both are numbers you can check by hand, and they become the main tests.

User: ok

[Area: Users · 3/12 areas settled]

Who uses the sheet and the email?

Recommended: Just you, once a week on Friday.
Why: One reader means no sharing settings and no access rules in v1.

User: ok

[Area: Scope · 4/12 areas settled]

What should version 1 not do, even if it sounds useful?

Recommended: No editing of old rows, only this one form, no charts.
Why: Each would add work without helping you check signups.

User: ok, and later it could also post in Slack
State: `answer scope --state clear --summary "v1: one form to one sheet plus a Friday email. Out: editing old rows, other forms, charts. Later: Slack post."`

Noted: the Slack post goes on the Later list, not into version 1.

[Area: Input data · 5/12 areas settled]

Which form is it, and how many answers do you expect in a busy week?

Recommended: The "Event signup" form, up to 200 answers a week, picked up by n8n's Typeform trigger.
Why: 200 a week is small enough that one sheet and one trigger are plenty.

User: ok

[Area: Output · 6/12 areas settled]

Which columns should each row have, and when should the email arrive?

Recommended: Submitted time, name, email and each answer in its own column; the email arrives on Friday at 09:00 with the week's count.
Why: One column per answer keeps the sheet easy to filter, and a fixed time makes the count easy to compare.

User: ok

[Area: Integrations · 7/12 areas settled]

If Google Sheets is down when an answer arrives, what should happen?

Recommended: n8n retries 3 times over 15 minutes, then emails you the answer so nothing is lost.
Why: You never lose a signup, even during an outage.

User: ok

[Area: Permissions and security · 8/12 areas settled]

What should the flow be allowed to touch?

Recommended: Read the one form, add rows to the one sheet, send email to you only; logins stay in n8n's credential store, never in the flow itself.
Why: A mistake can then only add a row or an email, never delete data or reach other people.

User: ok

[Area: Errors and edge cases · 9/12 areas settled]

What should happen if Typeform sends the same answer twice?

Recommended: Skip it, using Typeform's response id to spot the duplicate.
Why: The count in your Friday email stays correct.

User: ok

[Area: Errors and edge cases · 9/12 areas settled]

What if an answer arrives without an email address?

Recommended: Still add the row, write "missing" in the email column, and list it in the Friday email.
Why: You keep the signup and see which ones need a follow-up.

User: ok

[Area: Errors and edge cases · 9/12 areas settled]

I would also plan for three more cases: the Google login expires, no answers arrive in a week, and the flow is switched off by accident. Shall I use these, each with an alert email to you?

Recommended: Yes, all three with an alert email.
Why: That brings us to 5 failure cases, each with a behaviour we can test.

User: ok
State: `answer errors --state clear --summary "Duplicate: skip by response id. No email: row with 'missing'. Login expired, no answers in a week, flow off: alert email."`

[Area: Acceptance tests · 10/12 areas settled]

I wrote one check per requirement and one per failure case from your answers. Shall I use them as they are?

Recommended: Yes, use them as written; you will see them all in one list before anything is built.
Why: You approve the final list anyway, so this saves a step.

User: ok

[Area: Definition of done · 11/12 areas settled]

What would you check before calling version 1 finished?

Recommended: All checks pass, and one real week of answers matches the Friday email count.
Why: It proves the flow on your own data, not only in tests.

User: I don't know
State: `answer done --state assumed --summary "Done: all checks pass and one real week matches the Friday count." --decision D-001 --test T-009`

Fine, I will take the recommendation as an assumption and give it a test.

Nothing is open any more. Here are all 9 checks. The one marked "assumption" tests something I assumed for you:

- T-001: if a new answer is submitted, it is in the sheet within 15 minutes.
- T-002: if it is Friday at 09:00, you get an email whose count matches the week's rows.
- T-003: if Typeform sends the same response id twice, the sheet has one row.
- T-004: if an answer has no email, the row says "missing" and the Friday email lists it.
- T-005: if Google Sheets is down, there are 3 retries and then an email with the answer.
- T-006: if the Google login expires, you get an alert email and no answer is lost.
- T-007: if no answers arrive in a week, the Friday email says 0 and nothing else breaks.
- T-008: if the flow is switched off, you get an alert email within one day.
- T-009 (assumption, D-001, done): if one real week of answers is compared with the Friday email, the counts match.

Do you approve these checks, or do you want to change any of them?

User: approved
State: `approve`

Done. Run compile next.
