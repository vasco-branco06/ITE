// commands/start.md: Node check first (F-1.4, D-014, T-025 static part) and the start wiring (F-2.3).
// The interview behaviour itself (T-002, T-004, T-006, T-008, T-023, T-036) is checked by recorded runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const start = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'commands', 'start.md'), 'utf8').replace(/\r\n/g, '\n');
const body = start.split('\n---\n').slice(1).join('\n---\n');
const ITE = 'node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs"';

// Exact handoff messages from specs/first-run.md and specs/commands.md.
const NODE_WARNING = 'Node.js 18 or later was not found, so ITE continues in manual mode: Claude runs the checks itself and every report carries the banner MANUAL MODE - not machine-verified. To get machine-verified checks, install Node.js from nodejs.org and run start again.';
const QUICK_NOTICE = 'Quick mode is chosen only when an interview starts. Your saved setting is kept.';
const STOP_OFFER = 'Shall I assume the rest? Each assumption gets a test you will approve.';

test('T-025 start runs node --version before anything else', () => {
  const nodeCheck = body.indexOf('node --version');
  assert.ok(nodeCheck >= 0, 'start.md must run node --version');
  assert.ok(nodeCheck < body.indexOf(`${ITE} init`), 'the Node check comes before init');
});

test('T-025 start treats a missing or old Node (below 18) as manual mode', () => {
  assert.match(body, /below 18/i);
  assert.ok(body.includes(NODE_WARNING), 'start.md must carry the exact first-run warning');
  assert.match(body, /https:\/\/nodejs\.org/);
  assert.match(body, /"mode": "manual"/);
  assert.match(body, /MANUAL MODE - not machine-verified/);
  assert.match(body, /say nothing about Node/i);
});

test('start is wired: no stub left, arguments read, the skill loaded', () => {
  assert.ok(!body.includes('not implemented yet'));
  assert.ok(body.includes('$ARGUMENTS'));
  assert.ok(body.includes('ite-interview'), 'start uses the ite-interview skill');
});

test('start resumes from an existing state, and never re-inits it', () => {
  assert.ok(body.includes('.ite/coverage.json'));
  assert.match(body, /3 to 5 lines/);
  assert.ok(body.includes(`${ITE} next`));
  assert.ok(body.includes(QUICK_NOTICE), 'resume with --quick prints the exact notice');
});

test('start creates a new state with language and --quick passed to init', () => {
  assert.ok(body.includes(`${ITE} init`));
  assert.ok(body.includes('--lang'));
  assert.ok(body.includes('--quick'));
  assert.match(body, /one sentence/i, 'no idea and no state: ask for the idea');
});

test('T-005 static: areas the idea only touches keep what it says as an open summary', () => {
  assert.ok(body.includes(`${ITE} answer <area> --state open --summary`), 'partial facts from the idea are recorded, the area stays open');
});

test('every question is logged first; exit 5 leads to the stop offer', () => {
  assert.ok(body.includes(`${ITE} log-question`));
  assert.ok(body.includes(`${ITE} log-stop-offer`));
  assert.ok(body.includes(`${ITE} budget off`));
  assert.ok(body.includes(STOP_OFFER));
  assert.ok(body.includes(`${ITE} answer`));
});

test('early stop and approval run through the script', () => {
  assert.ok(body.includes(`${ITE} assume-rest`));
  assert.match(body, /chega/);
  assert.ok(body.includes(`${ITE} approve`));
  assert.match(body, /\/ite:compile/);
});

test('the stop offer reply is recorded, and the turn header count is read from the state', () => {
  assert.ok(body.includes(`${ITE} assume-rest --answer`), 'yes path stores the reply');
  assert.ok(body.includes(`${ITE} budget off --answer`), 'no path stores the reply');
  assert.match(body, /areas whose state is not open/i, 'header count comes from coverage.json, never estimated');
});
