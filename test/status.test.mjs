// F-4.3: status prints coverage per state plus the checker summary (T-017, R-015).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { newState, writeState } from '../scripts/lib/state.mjs';

const ITE = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'ite.mjs');
const run = (...args) => spawnSync(process.execPath, [ITE, ...args], { cwd: tmpdir(), encoding: 'utf8' });

// 8 clear, 2 assumed (both tested), 1 not applicable, 1 open ("errors").
function folder({ report } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ite status '));
  const state = newState('A todo app');
  for (const a of state.areas) {
    if (a.id === 'errors') continue;
    if (a.id === 'llm') Object.assign(a, { state: 'not_applicable', reason: 'No model calls' });
    else if (['security', 'stack'].includes(a.id)) Object.assign(a, { state: 'assumed', summary: 'Assumed', test_ids: ['T-001'] });
    else Object.assign(a, { state: 'clear', summary: 'Clear' });
  }
  assert.deepEqual(writeState(dir, state), []);
  if (report) writeFileSync(join(dir, '.ite', 'check-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return dir;
}

const WARNING_REPORT = {
  schema_version: 1, ite_version: '0.1.0', folder: '.', checked_at: '2026-10-15T00:00:00.000Z', errors: 0, warnings: 1,
  findings: [{ code: 'W-ERRORS-THIN', severity: 'warning', file: 'SPEC.md', line: 1, message: 'Fewer than 5 failure cases', fix: 'Add failure cases' }],
  counts: { R: 1, D: 1, S: 0, P: 0, T: 1, F: 1 },
};

test('T-017 status shows coverage per state, the open area, the checker summary and the next step', () => {
  const dir = folder({ report: WARNING_REPORT });
  const r = run('status', dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, [
    `ITE status - ${basename(dir)}`,
    'Areas: 12 · clear 8 · assumed 2 (2 tested) · not applicable 1 · open 1',
    'Open: errors',
    'Assumptions without test: none',
    'Checker: 0 errors · 1 warning (W-ERRORS-THIN)',
    'Next step: run start to finish the "errors" area',
    '',
  ].join('\n'));
});

test('status works before compile: coverage only, checker not run yet', () => {
  const r = run('status', folder());
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Areas: 12 · clear 8 /m);
  assert.match(r.stdout, /^Checker: not run yet \(compile runs it\)$/m);
});

test('status names untested assumptions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ite status '));
  const state = newState('A todo app');
  state.areas[0] = { ...state.areas[0], state: 'assumed', summary: 'Assumed' };
  assert.deepEqual(writeState(dir, state), []);
  assert.match(run('status', dir).stdout, /^Assumptions without test: goal$/m);
});

test('status without coverage state exits 4 and points to start', () => {
  const r = run('status', mkdtempSync(join(tmpdir(), 'ite status ')));
  assert.equal(r.status, 4);
  assert.match(r.stderr, /Run start first/);
});
