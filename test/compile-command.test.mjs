// F-3.3: commands/compile.md (P-002) and the compiled-folder checks T-010, T-013, T-014, T-020, T-004 (files part).
// The compiled folder is test/fixtures/check/valid (log-to-Jira, Portuguese interview). Set ITE_COMPILED_FOLDER
// to a folder written by a real /ite:compile run to run the same checks on it.
// T-009, T-037 and the interview half of T-004 need a recorded compile run in Claude Code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { validate } from '../scripts/lib/validate.mjs';
import { parseFolder } from '../scripts/lib/parse.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ITE = join(root, 'scripts', 'ite.mjs');
const COMPILED = process.env.ITE_COMPILED_FOLDER ?? join(root, 'test', 'fixtures', 'check', 'valid');
const S002 = JSON.parse(readFileSync(join(root, 'schemas', 'test-cases.schema.json'), 'utf8'));
const compile = readFileSync(join(root, 'commands', 'compile.md'), 'utf8').replace(/\r\n/g, '\n');
const body = compile.split('\n---\n').slice(1).join('\n---\n');
const CMD = 'node "${CLAUDE_PLUGIN_ROOT}/scripts/ite.mjs"';

const read = (dir, f) => readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n');
const edit = (dir, f, fn) => writeFileSync(join(dir, f), fn(read(dir, f)));
function copy(src) {
  const dir = mkdtempSync(join(tmpdir(), 'ite compiled '));
  cpSync(src, dir, { recursive: true });
  return dir;
}
function check(dir) {
  const r = spawnSync(process.execPath, [ITE, 'check', '.', '--json'], { cwd: dir, encoding: 'utf8' });
  return { status: r.status, report: JSON.parse(r.stdout) };
}
// Cells of the table under "## <heading>", header and separator rows dropped.
function table(text, heading) {
  const section = text.split(`\n## ${heading}\n`)[1]?.split('\n## ')[0] ?? '';
  return section.split('\n').filter((l) => l.startsWith('|')).slice(2).map((l) => l.slice(1, -1).split('|').map((c) => c.trim()));
}
const pathOf = (cell) => (/\]\(([^)]+)\)/.exec(cell)?.[1] ?? cell.replace(/`/g, ''));

// --- commands/compile.md (static part of T-009, T-010, T-037; P-002) ---

test('compile is wired: no stub left, follows P-002 with the plugin templates', () => {
  assert.ok(!body.includes('not implemented yet'));
  assert.ok(body.includes('${CLAUDE_PLUGIN_ROOT}/templates/'));
  assert.ok(body.includes('<!-- ite: fill'), 'names the placeholder syntax');
  assert.match(body, /no placeholder/i);
});

test('compile refuses while an area is open or approved_at is null, and points to start', () => {
  assert.ok(body.includes('.ite/coverage.json'));
  assert.ok(body.includes('approved_at'));
  assert.match(body, /`open`/);
  assert.ok(body.includes('/ite:start'));
  assert.ok(body.indexOf('approved_at') < body.indexOf('DECISIONS.md'), 'the precondition comes before writing');
});

test('files are written in the P-002 order with INDEX.md last', () => {
  const order = ['DECISIONS.md', 'SPEC.md', 'schemas/', 'prompts/', 'tests/', 'PLAN.md', 'CLAUDE.md'];
  const from = body.indexOf('Write in this order');
  assert.ok(from >= 0, 'compile.md states the write order');
  const at = order.map((f) => body.indexOf(f, from));
  assert.ok(at.every((i) => i >= 0), `missing one of ${order.join(', ')}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'order DECISIONS, SPEC, schemas, prompts, tests, PLAN, CLAUDE');
  assert.match(body, /INDEX\.md[^\n]*last/i);
});

test('IDs, links and file names follow rules 02 and 03', () => {
  assert.match(body, /next free/i);
  assert.match(body, /relative/i);
  assert.match(body, /lowercase ASCII/i);
  assert.match(body, /40 characters/);
});

test('T-010 not-applicable areas get NOT_APPLICABLE.md with Area, Reason, Decided in, and promptfoo tests: []', () => {
  assert.ok(body.includes('NOT_APPLICABLE.md'));
  for (const field of ['Area:', 'Reason:', 'Decided in:']) assert.ok(body.includes(field), field);
  assert.ok(body.includes('tests: []'));
  assert.match(body, /schemas\/[^\n]*never/i, 'schemas/ is never not applicable');
});

test('files are English; user quotes only in DECISIONS.md blockquotes; gaps become tested assumptions', () => {
  assert.match(body, /English/);
  assert.match(body, /`> ` blockquotes in DECISIONS\.md/);
  assert.match(body, /Never invent requirements/);
});

test('hand-editable files are not overwritten without asking (rule 02 2.5)', () => {
  assert.match(body, /diff summary/i);
  assert.match(body, /ask/i);
});

test('compile runs gen-schemas, then check --json, with at most 3 fix rounds', () => {
  const gen = body.indexOf(`${CMD} gen-schemas`);
  const chk = body.indexOf(`${CMD} check . --json`);
  assert.ok(gen >= 0 && chk > gen, 'gen-schemas runs before check');
  assert.match(body, /3 rounds/);
  assert.ok(body.includes('Compile stopped with N errors.'), 'exact stop message from specs/first-run.md');
});

test('T-037 static: the outcome screen follows R-025', () => {
  assert.match(body, /at most 22 lines in total, blank lines included/i);
  assert.match(body, /user's language/);
  assert.match(body, /one line per assumed area/i);
  assert.ok(body.includes('You do not need to read the files: Claude Code reads them.'));
  assert.ok(body.includes('/ite:build'));
  assert.match(body, /counts/i);
  assert.match(body, /no extra file/i);
});

// --- the compiled folder ---

test('the compiled folder checks clean', () => {
  const { status, report } = check(copy(COMPILED));
  assert.deepEqual(report.findings.filter((f) => f.severity === 'error'), []);
  assert.equal(status, 0);
});

test('T-013 three test layers exist and match', () => {
  for (const f of ['tests/acceptance.md', 'tests/cases.json', 'tests/promptfooconfig.yaml']) assert.ok(existsSync(join(COMPILED, f)), f);
  const cases = JSON.parse(read(COMPILED, 'tests/cases.json'));
  assert.deepEqual(validate(S002, cases), []);
  const acc = parseFolder(COMPILED).definitions.filter((d) => d.file === 'tests/acceptance.md' && d.id.startsWith('T-')).map((d) => d.id);
  assert.deepEqual([...acc].sort(), cases.cases.map((c) => c.id).sort());
});

test('T-014 INDEX.md lists every file and every defined ID with its defining file', () => {
  const p = parseFolder(COMPILED);
  const index = read(COMPILED, 'INDEX.md');
  const listed = new Set(table(index, 'Files').map((r) => pathOf(r[0])));
  // INDEX.md does not list itself; .ite/check-report.json is written by the check that follows INDEX.
  const missing = p.files.filter((f) => f !== 'INDEX.md' && f !== '.ite/check-report.json' && !listed.has(f));
  assert.deepEqual(missing, []);

  const map = new Map(table(index, 'ID map').map((r) => [r[0], pathOf(r[2])]));
  const defs = [
    ...p.definitions.map((d) => [d.id, d.file]),
    ...p.schemas.map((s) => [s.id, s.file]),
  ];
  for (const [id, file] of defs) assert.equal(map.get(id), file, `${id} should be mapped to ${file}`);
});

test('T-020 CLAUDE.md has every build-rule heading', () => {
  const heads = read(COMPILED, 'CLAUDE.md').split('\n').filter((l) => l.startsWith('## '));
  for (const h of ['Read order', 'One task at a time', 'Tests first', 'Done means green', 'Assumption tripwire', 'Generated files',
    'Never change the spec to pass a test', 'Secrets', 'User language', 'Commands']) assert.ok(heads.includes(`## ${h}`), h);
});

test('T-004 files part: a folder compiled from a Portuguese interview has no W-NON-ENGLISH', () => {
  const { report } = check(copy(COMPILED));
  assert.deepEqual(report.findings.filter((f) => f.code === 'W-NON-ENGLISH'), []);
});

// T-010 on the log-to-Jira folder recompiled with llm not applicable (what compile writes for that state).
function withoutLlm() {
  const dir = copy(join(root, 'test', 'fixtures', 'check', 'valid'));
  const reason = 'Log lines are matched by level, so no language model is involved.';
  const note = `Area: llm\nReason: ${reason}\nDecided in: D-002`;
  rmSync(join(dir, 'prompts'), { recursive: true });
  cpSync(join(root, 'templates', 'NOT_APPLICABLE.md'), join(dir, 'prompts', 'NOT_APPLICABLE.md'));
  edit(dir, 'prompts/NOT_APPLICABLE.md', () => `# Not applicable\n\n${note}\n`);
  writeFileSync(join(dir, 'tests', 'promptfooconfig.yaml'), `# Not applicable\n${note.replace(/^/gm, '# ')}\ntests: []\n`);
  edit(dir, 'DECISIONS.md', (t) => t.replace('## Assumptions', `### D-002 No language model\n\n- **Decision:** classify log lines by level, without a model.\n- **Why:** ${reason}\n- **Affects:** R-001\n\n## Assumptions`));
  edit(dir, 'SPEC.md', (t) => t.replace(' with [P-001](prompts/P-001-classify-log.md). → T-001, T-004', ' by its level field. → T-001')
    .replace(/## 10\. LLM use\n\n[^\n]*\n/, '## 10. LLM use\n\nNot applicable: no language model is involved (D-002).\n'));
  edit(dir, 'PLAN.md', (t) => t.replace('Done when: T-001, T-004', 'Done when: T-001'));
  edit(dir, 'tests/acceptance.md', (t) => t.replace(/### T-004[^\n]*\nProves: R-001 · Kind: prompt\n\n/, ''));
  const cases = JSON.parse(read(dir, 'tests/cases.json'));
  writeFileSync(join(dir, 'tests', 'cases.json'), `${JSON.stringify({ ...cases, cases: cases.cases.filter((c) => c.id !== 'T-004') }, null, 2)}\n`);
  const cov = JSON.parse(read(dir, '.ite/coverage.json'));
  cov.areas = cov.areas.map((a) => (a.id === 'llm' ? { ...a, state: 'not_applicable', summary: null, reason, decision_ids: ['D-002'] } : a));
  writeFileSync(join(dir, '.ite', 'coverage.json'), `${JSON.stringify(cov, null, 2)}\n`);
  edit(dir, 'INDEX.md', (t) => t.split('\n').filter((l) => !/P-001|T-004/.test(l) || l.startsWith('| R-001')).join('\n')
    .replace('| [DECISIONS.md](DECISIONS.md) | Decisions and assumptions | D-001, D-005 |', '| [DECISIONS.md](DECISIONS.md) | Decisions and assumptions | D-001, D-002, D-005 |\n| [prompts/NOT_APPLICABLE.md](prompts/NOT_APPLICABLE.md) | Why there are no prompts | none |')
    .replace('| D-005 ', '| D-002 | No language model | [DECISIONS.md](DECISIONS.md) | R-001 |\n| D-005 ')
    .replace(/\| R-001 \| ([^|]*)\| \[SPEC\.md\]\(SPEC\.md\) \| [^\n]*/, '| R-001 | $1| [SPEC.md](SPEC.md) | T-001 |')
    .replace(/\| llm \| clear \| [^\n]*/, `| llm | not_applicable | ${reason} |`));
  return dir;
}

test('T-010 an llm not-applicable folder: only NOT_APPLICABLE.md in prompts/, promptfoo tests: [], no E-NA-NO-REASON', () => {
  const dir = withoutLlm();
  assert.deepEqual(readdirSync(join(dir, 'prompts')), ['NOT_APPLICABLE.md']);
  const na = read(dir, 'prompts/NOT_APPLICABLE.md');
  for (const re of [/^Area: llm$/m, /^Reason: \S/m, /^Decided in: D-\d{3}$/m]) assert.match(na, re);
  const yaml = read(dir, 'tests/promptfooconfig.yaml');
  assert.match(yaml, /^tests: \[\]$/m);
  for (const line of na.split('\n').filter((l) => /^(Area|Reason|Decided in):/.test(l))) assert.ok(yaml.includes(`# ${line}`), `promptfoo note repeats "${line}"`);
  const { status, report } = check(dir);
  assert.deepEqual(report.findings.filter((f) => f.severity === 'error'), []);
  assert.equal(status, 0);
});
