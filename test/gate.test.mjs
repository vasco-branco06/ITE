// F-5.1: the build gate (rule 06 section 6.1). Covers T-018, and the gate side of T-019.
// Each case is a temp copy of fixtures/check/valid (which passes) broken in exactly one way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ITE = join(root, 'scripts', 'ite.mjs');
const VALID = join(root, 'test', 'fixtures', 'check', 'valid');
const COVERAGE = join('.ite', 'coverage.json');
const BUILD_PROMPT = 'claude "Read CLAUDE.md, then follow PLAN.md from the first task that is not done."';

const run = (cwd, ...args) => spawnSync(process.execPath, [ITE, ...args], { cwd, encoding: 'utf8' });
function fixture(mutate = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ite gate '));
  cpSync(VALID, dir, { recursive: true });
  mutate(dir);
  return dir;
}
function editCoverage(dir, fn) {
  const file = join(dir, COVERAGE);
  const cov = JSON.parse(readFileSync(file, 'utf8'));
  fn(cov);
  writeFileSync(file, `${JSON.stringify(cov, null, 2)}\n`);
}
const area = (cov, id) => cov.areas.find((a) => a.id === id);
const blockers = (stdout) => stdout.split('\n').filter((l) => /^\d+\. /.test(l));

function assertBlocked(r, pattern, command) {
  assert.equal(r.status, 1, r.stderr);
  const list = blockers(r.stdout);
  assert.ok(list.length >= 1, `numbered blockers expected:\n${r.stdout}`);
  const line = list.find((l) => pattern.test(l));
  assert.ok(line, `no blocker matches ${pattern}:\n${r.stdout}`);
  assert.ok(line.includes(command), `blocker must name the fixing command ${command}: ${line}`);
  assert.ok(!r.stdout.includes(BUILD_PROMPT), 'no build command may be printed when blocked');
}

test('T-018 one open area: gate exits 1, lists the blocker with its fixing command, prints no build command', () => {
  const dir = fixture((d) => editCoverage(d, (c) => Object.assign(area(c, 'security'), { state: 'open', summary: null })));
  assertBlocked(run(dir, 'gate', '.'), /security/, '/ite:start');
});

test('an open area is listed once, not again as a checker error', () => {
  const dir = fixture((d) => editCoverage(d, (c) => Object.assign(area(c, 'security'), { state: 'open', summary: null })));
  assert.equal(blockers(run(dir, 'gate', '.').stdout).filter((l) => /security/.test(l)).length, 1);
});

test('an assumed area without a D- assumption is a blocker', () => {
  const dir = fixture((d) => editCoverage(d, (c) => Object.assign(area(c, 'llm'), { state: 'assumed', decision_ids: [], test_ids: ['T-005'] })));
  assertBlocked(run(dir, 'gate', '.'), /llm.*D-/, '/ite:start');
});

test('an assumed area without a linked T- is a blocker', () => {
  const dir = fixture((d) => editCoverage(d, (c) => Object.assign(area(c, 'llm'), { state: 'assumed', decision_ids: ['D-005'], test_ids: [] })));
  assertBlocked(run(dir, 'gate', '.'), /llm.*T-/, '/ite:start');
});

test('a not_applicable area without a reason is a blocker', () => {
  const dir = fixture((d) => editCoverage(d, (c) => Object.assign(area(c, 'integrations'), { state: 'not_applicable', reason: null })));
  assertBlocked(run(dir, 'gate', '.'), /integrations.*reason/, '/ite:start');
});

test('tests not approved (approved_at null) is a blocker', () => {
  const dir = fixture((d) => editCoverage(d, (c) => { c.approved_at = null; }));
  assertBlocked(run(dir, 'gate', '.'), /approved/, '/ite:start');
});

test('a checker error is a blocker that points to compile', () => {
  const dir = fixture((d) => writeFileSync(join(d, 'SPEC.md'), `${readFileSync(join(d, 'SPEC.md'), 'utf8')}\nSee [gone](gone.md).\n`));
  assertBlocked(run(dir, 'gate', '.'), /E-BROKEN-LINK/, '/ite:compile');
});

test('a folder with no coverage.json is blocked and points to start', () => {
  const dir = fixture((d) => rmSync(join(d, COVERAGE)));
  assertBlocked(run(dir, 'gate', '.'), /coverage/, '/ite:start');
});

test('a folder that does not exist is a gate failure (exit 2)', () => {
  assert.equal(run(tmpdir(), 'gate', join(tmpdir(), 'ite-no-such-folder')).status, 2);
});

test('T-019 a complete, approved folder with 0 checker errors passes: exit 0 and both commands with the absolute path', () => {
  const dir = fixture();
  const r = run(dir, 'gate', '.');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(blockers(r.stdout), []);
  assert.ok(r.stdout.includes(`cd "${dir}"; ${BUILD_PROMPT}`), `PowerShell command missing:\n${r.stdout}`);
  assert.ok(r.stdout.includes(`cd "${dir}" && ${BUILD_PROMPT}`), `bash command missing:\n${r.stdout}`);
});

test('the gate writes nothing to the folder', () => {
  const dir = fixture();
  run(dir, 'gate', '.');
  assert.throws(() => readFileSync(join(dir, '.ite', 'check-report.json')));
});
