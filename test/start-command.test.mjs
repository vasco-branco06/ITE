// F-1.4: commands/start.md checks for Node 18+ first and falls back to manual mode (D-014, T-025 static part).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const start = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'commands', 'start.md'), 'utf8').replace(/\r\n/g, '\n');
const body = start.split('\n---\n').slice(1).join('\n---\n');

// The exact handoff message from specs/first-run.md ("Node missing").
const WARNING = 'Node.js 18 or later was not found, so ITE continues in manual mode: Claude runs the checks itself and every report carries the banner MANUAL MODE - not machine-verified. To get machine-verified checks, install Node.js from nodejs.org and run start again.';

test('T-025 start runs node --version before anything else', () => {
  const nodeCheck = body.indexOf('node --version');
  assert.ok(nodeCheck >= 0, 'start.md must run node --version');
  assert.ok(nodeCheck < body.indexOf('not implemented yet'), 'the Node check comes first');
});

test('T-025 start treats a missing or old Node (below 18) as manual mode', () => {
  assert.match(body, /below 18|older than 18|less than 18/i);
  assert.ok(body.includes(WARNING), 'start.md must carry the exact first-run warning');
  assert.match(body, /https:\/\/nodejs\.org/);
  assert.match(body, /"mode": "manual"/);
  assert.match(body, /MANUAL MODE - not machine-verified/);
});

test('start says nothing about Node when the check passes', () => {
  assert.match(body, /say nothing about Node/i);
});
