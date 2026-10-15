# Question bank

Starter questions per area, each with a default recommendation for the primary user: a non-engineer building alone on a laptop (ITE spec, D-003). Adapt the wording to the idea and the user's language; never ask a question an earlier answer already settles. Recommendations follow `recommendation-style.md`.

## goal

1. What should be different in the world when this works? Recommended: one measurable outcome, for example "every error in the logs gets a ticket within 5 minutes".
2. How will you know it is working, without opening any code? Recommended: one number you can check by hand, for example "the sheet has one row per invoice received this week".
3. Who is this for, you or other people? Recommended: just you for v1; others can come later.

## users

1. Who will use this day to day? Recommended: just you, a few times a week.
2. How comfortable are they with technical tools? Recommended: they use Claude Code and spreadsheets, but do not write code by hand.
3. How often will it run or be used? Recommended: once a day, started by hand.

## scope

1. What should version 1 not do, even if it sounds useful? Recommended: three concrete exclusions drawn from the idea, for example "no dashboard, no editing old tickets, no other log sources".
2. Is there anything you said that should wait for a later version? Recommended: anything with "later" or "maybe" goes to the Later list.
3. What is the smallest version you would still use? Recommended: the idea as stated, for one input source and one output.

## inputs

1. Where does the data come from? Recommended: the simplest local source, such as a folder of files or a CSV.
2. How big is the largest batch you expect? Recommended: up to 500 rows or 10 MB per run.
3. How often does new data arrive? Recommended: once a day.
4. What does one real example look like? Recommended: paste one line or one file name, with private data removed.

## outputs

1. What exactly comes out? Recommended: one row per item in a Google Sheet, or one file in an `outbox/` folder.
2. What does the reader do with the output? Recommended: you, to decide what to do next.
3. What should happen if the same item comes in twice? Recommended: skip it and note the duplicate in a log file.

## integrations

1. Which outside tools does this need to talk to? Recommended: only the ones named in the idea, one at a time.
2. If <service> is down for an hour, what should happen? Recommended: queue the work and retry 3 times, then alert.
3. How should it log in to <service>? Recommended: an API key kept in a `.env` file.

## security

1. What is the worst thing this could do by mistake? Recommended: read-only access wherever possible.
2. Should it ever change or delete anything? Recommended: no; it only creates new items.
3. Which secrets does it need? Recommended: one API key per service, stored in `.env`, never pasted into chat.

## stack

1. Do you have a preferred language or tool? Recommended: Python for data and agents, TypeScript for web, n8n for simple automations.
2. Where should it run? Recommended: on your laptop, started by hand.
3. Does it need to run when your laptop is off? Recommended: no, not in v1.

## llm

1. Which steps need judgement that rules cannot handle? Recommended: none, unless the idea mentions classifying, summarising or writing.
2. What exactly should the model return for each item? Recommended: a small fixed shape, for example `{"severity": "high", "title": "..."}`.
3. Which model should it use? Recommended: the cheapest Claude model that passes the tests; change only if a test fails.

## errors

1. Name the most annoying way this could fail. Recommended: the input file is in the wrong format; it is rejected and logged, nothing else happens.
2. What should happen when a service refuses the login? Recommended: stop, tell you which key failed, change nothing.
3. What should happen with an empty input? Recommended: do nothing and log "no new items".
4. What if it is run twice in a row by accident? Recommended: the second run finds no new items and changes nothing.
5. What if one item in the batch is broken? Recommended: skip that item, log it, process the rest.

## acceptance

1. These are the checks I wrote from your answers; is anything missing? Recommended: accept them as listed.
2. Which single run would convince you it works? Recommended: one end-to-end run on a real but small example.
3. Is there a case from your real work that must be in the checks? Recommended: none extra for v1.

## done

1. What would you check before calling v1 finished? Recommended: every check passes and one real run gives the output you expected.
2. Does it need a short guide for anyone else? Recommended: a README with how to run it, nothing more.
3. Is there a deadline or a date this must work by? Recommended: no fixed date for v1.
