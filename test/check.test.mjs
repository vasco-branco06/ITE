// F-4.2: coherence checks (rule 04) and the S-004 report. Covers T-007, T-015, T-016, T-021, T-029.
// Each error code gets its own fixture folder: a temp copy of fixtures/check/valid broken in exactly one way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { validate } from '../scripts/lib/validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ITE = join(root, 'scripts', 'ite.mjs');
const VALID = join(root, 'test', 'fixtures', 'check', 'valid');
const ITE_ROOT = join(root, '..');
const S004 = JSON.parse(readFileSync(join(root, 'schemas', 'check-report.schema.json'), 'utf8'));

const run = (cwd, ...args) => spawnSync(process.execPath, [ITE, ...args], { cwd, encoding: 'utf8' });
function fixture(mutate = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ite check '));
  cpSync(VALID, dir, { recursive: true });
  mutate(dir);
  return dir;
}
const edit = (dir, file, fn) => writeFileSync(join(dir, file), fn(readFileSync(join(dir, file), 'utf8')));
const editJson = (dir, file, fn) => edit(dir, file, (t) => `${JSON.stringify(fn(JSON.parse(t)), null, 2)}\n`);
function check(dir) {
  const r = run(dir, 'check', '.', '--json');
  return { status: r.status, report: r.stdout ? JSON.parse(r.stdout) : null, stderr: r.stderr };
}
const codes = (report) => report.findings.map((f) => f.code);

test('the valid fixture checks clean: exit 0, a valid S-004 report, written to .ite/check-report.json', () => {
  const dir = fixture();
  const { status, report } = check(dir);
  assert.deepEqual(report.findings, []);
  assert.equal(status, 0);
  assert.deepEqual(validate(S004, report), []);
  assert.deepEqual(report.counts, { R: 3, D: 2, S: 1, P: 1, T: 5, F: 14 });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '.ite', 'check-report.json'), 'utf8')), report);
});

test('human output names each finding with file, line, code and fix; exit 1 on errors', () => {
  const dir = fixture((d) => edit(d, 'SPEC.md', (t) => t.replace('## 6. Data', 'See [gone](gone.md).\n\n## 6. Data')));
  const r = run(dir, 'check', '.');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /1 error, 0 warnings/);
  assert.match(r.stdout, /SPEC\.md:\d+ +E-BROKEN-LINK/);
  assert.match(r.stdout, /fix: /);
});

test('a folder that does not exist is a checker failure (exit 2)', () => {
  assert.equal(run(tmpdir(), 'check', join(tmpdir(), 'ite-no-such-folder')).status, 2);
});

test('T-007 an assumption with no Tripwire line is E-ASSUMPTION-UNTESTED (exit 1)', () => {
  const dir = fixture((d) => edit(d, 'DECISIONS.md', (t) => t.replace('- **Tripwire:** T-005\n', '')));
  const { status, report } = check(dir);
  assert.ok(report.findings.some((f) => f.code === 'E-ASSUMPTION-UNTESTED' && f.id === 'D-005'));
  assert.equal(status, 1);
});

test('T-015 a link to a missing schema is E-BROKEN-LINK with file SPEC.md and the line (exit 1)', () => {
  const dir = fixture((d) => edit(d, 'SPEC.md', (t) => t.replace('Ticket sent to Jira. Used by R-002.', 'Ticket sent to Jira. Used by R-002. Old shape: [S-009](schemas/S-009-missing.schema.json).')));
  const line = readFileSync(join(dir, 'SPEC.md'), 'utf8').split('\n').findIndex((l) => l.includes('S-009-missing')) + 1;
  const { status, report } = check(dir);
  assert.ok(report.findings.some((f) => f.code === 'E-BROKEN-LINK' && f.file === 'SPEC.md' && f.line === line));
  assert.equal(status, 1);
});

test('T-016 a requirement with no arrow to a T- is E-REQ-UNTESTED (exit 1)', () => {
  const dir = fixture((d) => edit(d, 'SPEC.md', (t) => t.replace('to errors.log. → T-003', 'to errors.log.')));
  const { status, report } = check(dir);
  assert.ok(report.findings.some((f) => f.code === 'E-REQ-UNTESTED' && f.id === 'R-003'));
  assert.equal(status, 1);
});

// One broken folder per remaining code: [code, mutation, expected id or file].
const history = (n) => Array.from({ length: n }, (_, i) => ({ n: i + 1, kind: 'question', area: 'goal', question: 'Q', recommended: 'R', answer: 'ok', accepted_recommendation: true, at: '2026-10-15T10:00:00.000Z' }));
const CASES = [
  ['E-FILE-MISSING', (d) => rmSync(join(d, 'CLAUDE.md')), { file: 'CLAUDE.md' }],
  ['E-FILE-MISSING', (d) => rmSync(join(d, 'prompts'), { recursive: true }), { file: 'prompts/' }],
  ['E-NA-NO-REASON', (d) => writeFileSync(join(d, 'prompts', 'NOT_APPLICABLE.md'), '# Not applicable\n\nArea: llm\nDecided in: D-001\n'), { file: 'prompts/NOT_APPLICABLE.md' }],
  ['E-NA-NO-REASON', (d) => writeFileSync(join(d, 'prompts', 'NOT_APPLICABLE.md'), '# Not applicable\n\nArea: llm\nReason: no model.\nDecided in: D-009\n'), { file: 'prompts/NOT_APPLICABLE.md' }],
  ['E-ID-DUPLICATE', (d) => edit(d, 'DECISIONS.md', (t) => `${t}\n### D-001 Again\n\n- **Affects:** R-001\n`), { id: 'D-001' }],
  ['E-ID-DUPLICATE', (d) => editJson(d, 'tests/cases.json', (j) => ({ ...j, cases: [...j.cases, j.cases[0]] })), { id: 'T-001' }],
  ['E-ID-UNDEFINED', (d) => edit(d, 'SPEC.md', (t) => t.replace('Python 3.12, pytest.', 'Python 3.12, pytest (see D-042).')), { id: 'D-042' }],
  ['E-ID-FORMAT', (d) => edit(d, 'SPEC.md', (t) => t.replace('Python 3.12, pytest.', 'Python 3.12, pytest (R-01).')), { id: 'R-01' }],
  ['E-ID-FORMAT', (d) => editJson(d, 'schemas/S-001-ticket.schema.json', (s) => ({ ...s, $id: 'S-002' })), { file: 'schemas/S-001-ticket.schema.json' }],
  ['E-LINK-OUTSIDE', (d) => edit(d, 'SPEC.md', (t) => t.replace('Python 3.12, pytest.', 'Python [3.12](../python.md).')), { file: 'SPEC.md' }],
  ['E-LINK-OUTSIDE', (d) => edit(d, 'SPEC.md', (t) => t.replace('Python 3.12, pytest.', 'Python [3.12](file:///C:/python.md).')), { file: 'SPEC.md' }],
  ['E-LINK-OUTSIDE', (d) => edit(d, 'SPEC.md', (t) => t.replace('Python 3.12, pytest.', 'Python [3.12](C:/python.md).')), { file: 'SPEC.md' }],
  ['E-ASSUMPTION-UNTESTED', (d) => editJson(d, '.ite/coverage.json', (c) => ({ ...c, areas: c.areas.map((a) => (a.id === 'errors' ? { ...a, state: 'assumed' } : a)) })), { id: 'errors' }],
  ['E-TEST-ORPHAN', (d) => {
    edit(d, 'tests/acceptance.md', (t) => t.replace('Proves: R-003 · Kind: unit', 'Proves: D-001 · Kind: unit'));
    editJson(d, 'tests/cases.json', (j) => ({ ...j, cases: j.cases.map((c) => (c.id === 'T-003' ? { ...c, proves: ['D-001'] } : c)) }));
  }, { id: 'T-003' }],
  ['E-TEST-MISMATCH', (d) => edit(d, 'tests/acceptance.md', (t) => `${t}\n### T-006 Extra\nProves: R-001 · Kind: unit\n`), { id: 'T-006' }],
  ['E-CASES-INVALID', (d) => editJson(d, 'tests/cases.json', (j) => ({ ...j, cases: j.cases.map((c, i) => (i ? c : { ...c, kind: 'smoke' })) })), { file: 'tests/cases.json' }],
  ['E-CASES-INVALID', (d) => writeFileSync(join(d, 'tests', 'cases.json'), '{ nope'), { file: 'tests/cases.json' }],
  ['E-SCHEMA-INVALID', (d) => writeFileSync(join(d, 'schemas', 'S-002-event.schema.json'), JSON.stringify({ $id: 'S-002', title: 'Event', description: 'x', oneOf: [{ type: 'string' }] })), { file: 'schemas/S-002-event.schema.json' }],
  ['E-SCHEMA-UNUSED', (d) => edit(d, 'SPEC.md', (t) => t.replace(', shaped as [S-001](schemas/S-001-ticket.schema.json)', '')), { id: 'S-001' }],
  ['E-GENERATED-STALE', (d) => rmSync(join(d, 'schemas', 'S-001-ticket.py')), { file: 'schemas/S-001-ticket.py' }],
  ['E-GENERATED-STALE', (d) => editJson(d, 'schemas/S-001-ticket.schema.json', (s) => ({ ...s, properties: { ...s.properties, label: { type: 'string' } } })), { file: 'schemas/S-001-ticket.zod.ts' }],
  ['E-PROMPT-UNTESTED', (d) => edit(d, 'prompts/P-001-classify-log.md', (t) => t.replace(' · Tested by: T-004', '')), { id: 'P-001' }],
  ['E-TASK-UNTESTED', (d) => edit(d, 'PLAN.md', (t) => t.replace('Done when: reviewed by the user', 'Done when: soon')), { id: 'F-7.1' }],
  ['E-COVERAGE-OPEN', (d) => editJson(d, '.ite/coverage.json', (c) => ({ ...c, areas: c.areas.map((a) => (a.id === 'done' ? { ...a, state: 'open' } : a)) })), { id: 'done' }],
  ['E-COVERAGE-INVALID', (d) => editJson(d, '.ite/coverage.json', (c) => ({ ...c, schema_version: 2 })), { file: '.ite/coverage.json' }],
  ['E-WITHDRAWN-REF', (d) => {
    edit(d, 'DECISIONS.md', (t) => t.replace('## Assumptions', '### D-006 Old queue\n\nStatus: withdrawn (replaced by D-001, 2026-10-15)\n\n## Assumptions'));
    edit(d, 'SPEC.md', (t) => t.replace('to errors.log. → T-003', 'to errors.log, as in D-006. → T-003'));
  }, { id: 'D-006' }],
  ['W-MANUAL-SCHEMA', (d) => edit(d, 'schemas/S-001-ticket.zod.ts', (t) => `// MANUAL: written by hand, outside the D-015 subset\n${t}`), { file: 'schemas/S-001-ticket.zod.ts' }],
  ['W-MANUAL-MODE', (d) => editJson(d, '.ite/coverage.json', (c) => ({ ...c, mode: 'manual' })), { file: '.ite/coverage.json' }],
  ['W-NON-ENGLISH', (d) => edit(d, 'SPEC.md', (t) => `${t}\nNão há ligação à Jira: é necessário repetir três vezes e avisar a equipa técnica através de notificação; também não convém criar pedidos duplicados nem usar informação errada.\n`), { file: 'SPEC.md' }],
  ['W-LONG-INTERVIEW', (d) => editJson(d, '.ite/coverage.json', (c) => ({ ...c, history: history(26) })), { file: '.ite/coverage.json' }],
  ['W-ERRORS-THIN', (d) => edit(d, 'SPEC.md', (t) => t.replace('| Token missing | Stop at start with a clear message | T-002 |\n', '').replace('| Duplicate error | One ticket only | T-001 |\n', '')), { file: 'SPEC.md' }],
];

for (const [code, mutate, where] of CASES) {
  test(`${code} fires for ${where.id ?? where.file}`, () => {
    const { status, report } = check(fixture(mutate));
    const hit = report.findings.find((f) => f.code === code && (where.id ? f.id === where.id : f.file === where.file));
    assert.ok(hit, `${code} not reported; got ${codes(report).join(', ') || 'nothing'}`);
    assert.equal(hit.severity, code.startsWith('E-') ? 'error' : 'warning');
    assert.ok(hit.message && hit.fix);
    assert.equal(status, code.startsWith('E-') ? 1 : 0);
    assert.deepEqual(validate(S004, report), []);
  });
}

test('every rule 04 code has a fixture', () => {
  const rule = readFileSync(join(root, 'test', 'fixtures', 'rule-04-codes.txt'), 'utf8').trim().split('\n');
  const covered = new Set([...CASES.map(([c]) => c), 'E-ASSUMPTION-UNTESTED', 'E-BROKEN-LINK', 'E-REQ-UNTESTED']);
  assert.deepEqual(rule.filter((c) => !covered.has(c)), []);
});

test('findings are sorted by file, then line, and all checks run', () => {
  const dir = fixture((d) => {
    edit(d, 'SPEC.md', (t) => t.replace('to errors.log. → T-003', 'to errors.log.').replace('Python 3.12, pytest.', 'See [gone](gone.md).'));
    rmSync(join(d, 'CLAUDE.md'));
  });
  const { report } = check(dir);
  const keys = report.findings.map((f) => [f.file, f.line ?? 0]);
  const sorted = [...keys].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  assert.deepEqual(keys, sorted);
  for (const c of ['E-FILE-MISSING', 'E-REQ-UNTESTED', 'E-BROKEN-LINK']) assert.ok(codes(report).includes(c), c);
});

test('T-021 plugin scripts make no network calls and read no credentials', () => {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  for (const file of walk(join(root, 'scripts'))) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /['"](node:)?(http|https|net|dgram|tls|http2)['"]/, `${basename(file)} imports a network module`);
    assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|WebSocket/, `${basename(file)} uses fetch`);
    assert.doesNotMatch(src, /\.credentials|\.claude[\\/]|['"`]\.env\b|ANTHROPIC_API_KEY|api[_-]?key/i, `${basename(file)} touches credentials`);
  }
});

const ROOT_SKIP = new Set(['.git', 'node_modules']);
test('T-029 ITE passes its own check after gen-schemas', { skip: !existsSync(join(ITE_ROOT, 'SPEC.md')) && 'ITE spec folder not present' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'ite self '));
  cpSync(ITE_ROOT, dir, { recursive: true, filter: (src) => !ROOT_SKIP.has(basename(src)) || src === ITE_ROOT });
  assert.equal(run(dir, 'gen-schemas', '.').status, 0);
  const { report } = check(dir);
  const errors = report.findings.filter((f) => f.severity === 'error').map((f) => `${f.file}:${f.line ?? ''} ${f.code} ${f.id ?? ''} ${f.message}`);
  assert.deepEqual(errors, []);
});
