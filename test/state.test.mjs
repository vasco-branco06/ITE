// F-1.3: ite.mjs init, log-question budget rule, log-stop-offer, budget off, --version.
// Covers T-002 (script part), T-022 (state part), T-036 (script part), T-041 (script part).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { validate } from '../scripts/lib/validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ITE = join(root, 'scripts', 'ite.mjs');
const S001 = JSON.parse(readFileSync(join(root, 'schemas', 'coverage.schema.json'), 'utf8'));
const AREAS = ['goal', 'users', 'scope', 'inputs', 'outputs', 'integrations', 'security', 'stack', 'llm', 'errors', 'acceptance', 'done'];
const IDEA = 'agent that reads logs and opens Jira tickets';

// A folder with a space in its name, like many Windows user paths.
const tempDir = () => mkdtempSync(join(tmpdir(), 'ite test '));
const run = (cwd, ...args) => spawnSync(process.execPath, [ITE, ...args], { cwd, encoding: 'utf8' });
const statePath = (dir) => join(dir, '.ite', 'coverage.json');
const readState = (dir) => JSON.parse(readFileSync(statePath(dir), 'utf8'));
const ask = (dir, n) => run(dir, 'log-question', 'goal', '--question', `Q${n}?`, '--recommended', `R${n}`);

test('--version prints the plugin version', () => {
  const r = run(tempDir(), '--version');
  assert.equal(r.status, 0);
  const { version } = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(r.stdout.trim(), version);
});

test('T-002 init creates a valid state file with 12 open areas in rule 01 order', () => {
  const dir = tempDir();
  const r = run(dir, 'init', IDEA, '--lang', 'pt');
  assert.equal(r.status, 0, r.stderr);
  const state = readState(dir);
  assert.deepEqual(validate(S001, state), []);
  assert.deepEqual(state.areas.map((a) => a.id), AREAS);
  assert.ok(state.areas.every((a) => a.state === 'open'));
  assert.equal(state.idea, IDEA);
  assert.equal(state.language, 'pt');
  assert.equal(state.schema_version, 1);
  assert.equal(state.question_budget, null);
  assert.equal(state.mode, 'scripted');
  assert.equal(state.approved_at, null);
  assert.deepEqual(state.history, []);
  assert.ok(!readFileSync(statePath(dir), 'utf8').includes('\r'), 'state is written with \\n');
});

test('init --quick sets question_budget to 5', () => {
  const dir = tempDir();
  assert.equal(run(dir, 'init', IDEA, '--quick').status, 0);
  assert.equal(readState(dir).question_budget, 5);
});

test('init refuses to overwrite an existing state (exit 3, points to resume)', () => {
  const dir = tempDir();
  run(dir, 'init', IDEA);
  const before = readFileSync(statePath(dir), 'utf8');
  const r = run(dir, 'init', 'another idea');
  assert.equal(r.status, 3);
  assert.match(r.stderr + r.stdout, /resume/i);
  assert.equal(readFileSync(statePath(dir), 'utf8'), before);
});

test('init with an invalid idea writes nothing (exit 4)', () => {
  const dir = tempDir();
  assert.equal(run(dir, 'init', 'x').status, 4);
  assert.ok(!existsSync(statePath(dir)));
});

test('T-036 log-question: calls 1-5 append, call 6 exits 5 and adds nothing', () => {
  const dir = tempDir();
  run(dir, 'init', IDEA, '--quick');
  for (let n = 1; n <= 5; n++) assert.equal(ask(dir, n).status, 0, `call ${n}`);
  const sixth = ask(dir, 6);
  assert.equal(sixth.status, 5);
  assert.match(sixth.stdout, /budget reached/);
  let state = readState(dir);
  assert.equal(state.history.length, 5);
  assert.ok(state.history.every((t) => t.kind === 'question'));

  assert.equal(run(dir, 'log-stop-offer', '--question', 'Shall I assume the rest?', '--recommended', 'Yes').status, 0);
  state = readState(dir);
  assert.equal(state.history.length, 6);
  assert.equal(state.history[5].kind, 'stop_offer');
  assert.equal(state.history[5].area, 'stop');
  assert.deepEqual(validate(S001, state), []);
});

test('T-036 budget off removes the budget and the 6th question is allowed', () => {
  const dir = tempDir();
  run(dir, 'init', IDEA, '--quick');
  for (let n = 1; n <= 5; n++) ask(dir, n);
  run(dir, 'log-stop-offer', '--question', 'Shall I assume the rest?', '--recommended', 'Yes');
  assert.equal(run(dir, 'budget', 'off').status, 0);
  assert.equal(readState(dir).question_budget, null);
  assert.equal(ask(dir, 6).status, 0);
  const questions = readState(dir).history.filter((t) => (t.kind ?? 'question') === 'question');
  assert.equal(questions.length, 6);
});

test('log-question without a budget never exits 5', () => {
  const dir = tempDir();
  run(dir, 'init', IDEA);
  for (let n = 1; n <= 7; n++) assert.equal(ask(dir, n).status, 0);
});

test('log-question rejects an unknown area (exit 4) and a missing state (exit 4)', () => {
  const dir = tempDir();
  assert.equal(ask(dir, 1).status, 4);
  run(dir, 'init', IDEA);
  assert.equal(run(dir, 'log-question', 'nonsense', '--question', 'Q?', '--recommended', 'R').status, 4);
});

test('T-041 a refused init --quick keeps the saved budget (5 or null)', () => {
  const quick = tempDir();
  run(quick, 'init', IDEA, '--quick');
  for (let n = 1; n <= 5; n++) ask(quick, n);
  assert.equal(run(quick, 'init', IDEA, '--quick').status, 3);
  assert.equal(run(quick, 'init', IDEA).status, 3);
  assert.equal(readState(quick).question_budget, 5);
  assert.equal(ask(quick, 6).status, 5);

  const full = tempDir();
  run(full, 'init', IDEA);
  assert.equal(run(full, 'init', IDEA, '--quick').status, 3);
  assert.equal(readState(full).question_budget, null);
});

test('T-022 a CRLF state file is read, and rewritten with \\n', () => {
  const dir = tempDir();
  run(dir, 'init', IDEA, '--quick');
  writeFileSync(statePath(dir), readFileSync(statePath(dir), 'utf8').replace(/\n/g, '\r\n'));
  assert.equal(ask(dir, 1).status, 0);
  const text = readFileSync(statePath(dir), 'utf8');
  assert.ok(!text.includes('\r'));
  assert.equal(JSON.parse(text).history.length, 1);
});
