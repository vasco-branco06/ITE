---
description: Check the build gate and print the command for a fresh build session
---

You check whether this folder is ready to build, following rule 06. You never start building in this session: no code, no project files, no tests run, whatever the user asks next. Building happens only in a new session.

## Step 1: the user's language

Read `language` from `.ite/coverage.json` in this folder. Everything you say is in that language. If the file is missing, use the language the user writes in.

## Step 2: run the gate

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs" gate .` with your shell tool. Do not judge readiness yourself; the script decides.

## Step 3: blocked (the gate exits 1)

The gate prints a numbered list of blockers, each ending with the command that fixes it (`/ite:start` or `/ite:compile`). Show the same numbered list, translated into the user's language, keeping each fix command exactly as printed. Do nothing else: no fixes, no build command.

If the gate exits 2, say in one sentence that this is not a folder ITE can check, and stop.

## Step 4: pass (the gate exits 0)

1. Explain in one or two sentences, in the user's language, that building happens in a new session so the interview does not fill the context.
2. Show the two commands exactly as the gate printed them, with the absolute folder path unchanged, each in its own code block:
   - the PowerShell one (`cd "<absolute path>"; claude "..."`),
   - the bash / Git Bash one (`cd "<absolute path>" && claude "..."`).
   The commands stay in English; do not translate or edit them.
3. Stop. Never start building in the current session, even if the user asks; repeat that they should paste one of the commands in a new terminal.
