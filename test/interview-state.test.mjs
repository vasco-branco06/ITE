// F-2.2: answer, next, assume-rest, approve. Covers T-006 (state part) and T-008 (state part).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { validate } from '../scripts/lib/validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ITE = join(root, 'scripts', 'ite.mjs');
const S001 = JSON.parse(readFileSync(join(root, 'schemas', 'coverage.schema.json'), 'utf8'));

const tempDir = () => mkdtempSync(join(tmpdir(), 'ite test '));
const run = (cwd, ...args) => spawnSync(process.execPath, [ITE, ...args], { cwd, encoding: 'utf8' });
const readState = (dir) => JSON.parse(readFileSync(join(dir, '.ite', 'coverage.json'), 'utf8'));
const area = (dir, id) => readState(dir).areas.find((a) => a.id === id);
const fresh = () => { const d = tempDir(); run(d, 'init', 'agent that reads logs and opens Jira tickets', '--lang', 'pt'); return d; };
const clear = (dir, id) => run(dir, 'answer', id, '--state', 'clear', '--summary', `${id} settled`);

test('answer sets state and summary, and next follows the rule 01 asking order', () => {
  const dir = fresh();
  assert.equal(run(dir, 'next').stdout.trim(), 'goal');
  assert.equal(clear(dir, 'goal').status, 0);
  assert.deepEqual(area(dir, 'goal'), { id: 'goal', state: 'clear', summary: 'goal settled', decision_ids: [], test_ids: [], reason: null });
  for (const id of ['users', 'scope', 'inputs', 'outputs', 'integrations']) clear(dir, id);
  assert.equal(run(dir, 'next').stdout.trim(), 'stack', 'stack comes before security when asking');
  for (const id of ['stack', 'llm']) clear(dir, id);
  assert.equal(run(dir, 'next').stdout.trim(), 'security');
});

test('next prints none when nothing is open', () => {
  const dir = fresh();
  run(dir, 'assume-rest');
  assert.equal(run(dir, 'next').stdout.trim(), 'none');
});

test('answer fills the pending question turn and adds no new turn', () => {
  const dir = fresh();
  run(dir, 'log-question', 'users', '--question', 'Quem usa?', '--recommended', 'A equipa de suporte');
  assert.equal(run(dir, 'answer', 'users', '--state', 'clear', '--summary', 'Support team, 3 people', '--answer', 'ok', '--accepted').status, 0);
  const { history } = readState(dir);
  assert.equal(history.length, 1);
  assert.equal(history[0].answer, 'ok');
  assert.equal(history[0].accepted_recommendation, true);
});

test('answer for an inferred area leaves history unchanged', () => {
  const dir = fresh();
  clear(dir, 'goal');
  assert.deepEqual(readState(dir).history, []);
});

test('answer with --answer but no pending question is refused (exit 4)', () => {
  const dir = fresh();
  assert.equal(run(dir, 'answer', 'users', '--state', 'clear', '--summary', 'x', '--answer', 'ok').status, 4);
});

test('answer validates its input and writes nothing on error (exit 4)', () => {
  const dir = fresh();
  const before = readFileSync(join(dir, '.ite', 'coverage.json'), 'utf8');
  assert.equal(run(dir, 'answer', 'nonsense', '--state', 'clear', '--summary', 'x').status, 4);
  assert.equal(run(dir, 'answer', 'goal', '--state', 'maybe', '--summary', 'x').status, 4);
  assert.equal(run(dir, 'answer', 'llm', '--state', 'not_applicable').status, 4, 'not_applicable needs --reason');
  assert.equal(run(dir, 'answer', 'goal', '--state', 'clear').status, 4, 'clear needs --summary');
  assert.equal(run(dir, 'answer', 'goal', '--state', 'assumed', '--summary', 'x', '--decision', 'D-1').status, 4, 'bad D- id');
  assert.equal(readFileSync(join(dir, '.ite', 'coverage.json'), 'utf8'), before);
});

test('not_applicable stores the reason; --decision and --test may repeat', () => {
  const dir = fresh();
  run(dir, 'answer', 'llm', '--state', 'not_applicable', '--reason', 'Rows are copied, no judgement needed');
  assert.equal(area(dir, 'llm').reason, 'Rows are copied, no judgement needed');
  run(dir, 'answer', 'errors', '--state', 'assumed', '--summary', 'Jira down: retry 3 times', '--decision', 'D-001', '--test', 'T-001', '--test', 'T-002');
  assert.deepEqual(area(dir, 'errors').test_ids, ['T-001', 'T-002']);
  assert.deepEqual(area(dir, 'errors').decision_ids, ['D-001']);
});

test('T-006 assume-rest turns 5 open areas into assumed, then each gets a D- and a T-', () => {
  const dir = fresh();
  for (const id of ['goal', 'users', 'scope', 'inputs', 'outputs', 'integrations', 'stack']) clear(dir, id);
  const r = run(dir, 'assume-rest');
  assert.equal(r.status, 0);
  const assumed = ['security', 'llm', 'errors', 'acceptance', 'done'];
  assert.deepEqual(r.stdout.trim().split('\n').sort(), [...assumed].sort());
  let state = readState(dir);
  assert.ok(assumed.every((id) => state.areas.find((a) => a.id === id).state === 'assumed'));
  assert.equal(state.stop_reason, 'user_stopped');
  assumed.forEach((id, i) => {
    const n = String(i + 1).padStart(3, '0');
    assert.equal(run(dir, 'answer', id, '--state', 'assumed', '--summary', `${id} assumed`, '--decision', `D-${n}`, '--test', `T-${n}`).status, 0);
  });
  state = readState(dir);
  for (const id of assumed) {
    const a = state.areas.find((x) => x.id === id);
    assert.ok(a.decision_ids.length >= 1 && a.test_ids.length >= 1, id);
  }
  assert.deepEqual(validate(S001, state), []);
});

test('T-008 resume: with 6 clear areas and 9 questions, next is the first open area in rule 01 order', () => {
  const dir = fresh();
  for (let n = 1; n <= 9; n++) run(dir, 'log-question', 'goal', '--question', `Q${n}`, '--recommended', `R${n}`);
  for (const id of ['goal', 'users', 'scope', 'inputs', 'outputs', 'integrations']) clear(dir, id);
  assert.equal(run(dir, 'next').stdout.trim(), 'stack');
  assert.equal(readState(dir).history.length, 9);
});

test('settling the last open area sets stop_reason to complete', () => {
  const dir = fresh();
  for (const id of ['goal', 'users', 'scope', 'inputs', 'outputs', 'integrations', 'security', 'stack', 'llm', 'errors', 'acceptance']) clear(dir, id);
  assert.equal(readState(dir).stop_reason, null);
  clear(dir, 'done');
  assert.equal(readState(dir).stop_reason, 'complete');
});

test('approve refuses while an area is open (exit 4), then sets approved_at', () => {
  const dir = fresh();
  assert.equal(run(dir, 'approve').status, 4);
  assert.equal(readState(dir).approved_at, null);
  run(dir, 'assume-rest');
  assert.equal(run(dir, 'approve').status, 0);
  assert.ok(!Number.isNaN(Date.parse(readState(dir).approved_at)));
});

test('the stop offer answer is stored: assume-rest --answer --accepted (yes) and budget off --answer (no)', () => {
  const yes = fresh();
  run(yes, 'log-stop-offer', '--question', 'Assumo o resto?', '--recommended', 'Sim');
  assert.equal(run(yes, 'assume-rest', '--answer', 'ok', '--accepted').status, 0);
  const y = readState(yes).history.at(-1);
  assert.deepEqual([y.kind, y.answer, y.accepted_recommendation], ['stop_offer', 'ok', true]);

  const no = fresh();
  run(no, 'log-stop-offer', '--question', 'Assumo o resto?', '--recommended', 'Sim');
  assert.equal(run(no, 'budget', 'off', '--answer', 'não').status, 0);
  const n = readState(no).history.at(-1);
  assert.deepEqual([n.kind, n.answer, n.accepted_recommendation], ['stop_offer', 'não', false]);
  assert.equal(readState(no).question_budget, null);
});

test('--answer with no pending stop offer is refused (exit 4) and writes nothing', () => {
  const dir = fresh();
  const before = readFileSync(join(dir, '.ite', 'coverage.json'), 'utf8');
  assert.equal(run(dir, 'assume-rest', '--answer', 'ok').status, 4);
  assert.equal(run(dir, 'budget', 'off', '--answer', 'não').status, 4);
  assert.equal(readFileSync(join(dir, '.ite', 'coverage.json'), 'utf8'), before);
});
