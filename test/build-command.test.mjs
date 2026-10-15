// commands/build.md (F-5.2, rule 06): static part of T-019. The gate's own behaviour is in gate.test.mjs;
// "nothing is built in the current session" in a live run is checked by a recorded /ite:build run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const build = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'commands', 'build.md'), 'utf8').replace(/\r\n/g, '\n');
const body = build.split('\n---\n').slice(1).join('\n---\n');
const GATE = 'node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs" gate';

test('build is wired: no stub left, it has a description', () => {
  assert.ok(!body.includes('not implemented yet'));
  assert.match(build, /^---\ndescription: .+\n/);
});

test('T-019 build runs the gate script, never its own judgement', () => {
  assert.ok(body.includes(GATE), 'build.md must run the gate subcommand');
});

test('T-018 blocked: numbered blockers with their fixing command, and nothing else', () => {
  assert.match(body, /exits? 1/);
  assert.match(body, /numbered/i);
  assert.match(body, /fix/i);
  assert.match(body, /nothing else/i);
});

test('T-019 pass: both commands copied exactly from the gate output, with the absolute path', () => {
  assert.match(body, /exits? 0/);
  assert.match(body, /PowerShell/);
  assert.match(body, /bash/);
  assert.match(body, /absolute/i);
  assert.match(body, /exactly/i);
});

test('T-019 explains the new session in the user\'s language and never builds here', () => {
  assert.ok(body.includes('.ite/coverage.json'), 'the user language comes from coverage.json');
  assert.match(body, /new session/i);
  assert.match(body, /never start building/i);
});
