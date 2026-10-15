// unit templates-complete (F-3.1): one template per output file in specs/output-templates.md,
// with the exact headings the checker parses and `<!-- ite: fill ... -->` placeholders for compile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, unsupportedKeywords } from '../scripts/lib/validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'templates');
const read = (p) => readFileSync(join(dir, p), 'utf8');
const headings = (text) => text.split('\n').filter((l) => /^#{1,3} /.test(l));

// Output files from rule 02 section 2.1 that compile writes from a template (generated code and .ite/ are not templates).
const FILES = [
  'INDEX.md', 'SPEC.md', 'DECISIONS.md', 'PLAN.md', 'CLAUDE.md', 'NOT_APPLICABLE.md',
  'prompts/P-xxx-slug.md', 'schemas/S-xxx-slug.schema.json',
  'tests/acceptance.md', 'tests/cases.json', 'tests/promptfooconfig.yaml',
];

// Exact headings from specs/output-templates.md, in order. A trailing space marks a prefix match.
const HEADINGS = {
  'INDEX.md': ['# INDEX - ', '## Files', '## ID map', '## Coverage', '## How to build'],
  'SPEC.md': ['# SPEC - ', '## 1. Problem', '## 2. Goal and success measure', '## 3. Users', '## 4. Scope',
    '### In scope', '### Out of scope', '### Later', '## 5. Requirements', '## 6. Data', '## 7. Integrations',
    '## 8. Permissions and security', '## 9. Stack', '## 10. LLM use', '## 11. Errors and edge cases', '## 12. Definition of done'],
  'DECISIONS.md': ['# DECISIONS - ', '## Decisions', '### D-', '## Assumptions', '### D-'],
  'PLAN.md': ['# PLAN - ', '## F-1 ', '### F-1.1 ', '## F-2 ', '## F-3 ', '## F-4 ', '## F-5 ', '## F-6 ', '## F-7 '],
  'CLAUDE.md': ['# CLAUDE.md - ', '## Read order', '## One task at a time', '## Tests first', '## Done means green',
    '## Assumption tripwire', '## Generated files', '## Never change the spec to pass a test', '## Secrets',
    '## User language', '## Commands'],
  'NOT_APPLICABLE.md': ['# Not applicable'],
  'prompts/P-xxx-slug.md': ['# P-', '## Role', '## Task', '## Inputs', '## Output contract', '## Rules', '## Examples', '## Failure behaviour'],
  'tests/acceptance.md': ['# Acceptance tests - ', '### T-'],
};

const matches = (line, want) => (want.endsWith(' ') || want.endsWith('-') ? line.startsWith(want) : line === want || line.startsWith(`${want} `));

test('every output file has a template, and nothing else is in templates/', () => {
  for (const f of FILES) assert.ok(existsSync(join(dir, f)), `missing template ${f}`);
  const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [relative(dir, join(d, n)).replace(/\\/g, '/')]));
  assert.deepEqual(walk(dir).sort(), [...FILES].sort());
});

test('Markdown templates carry the exact headings in order', () => {
  for (const [file, want] of Object.entries(HEADINGS)) {
    const got = headings(read(file));
    let i = 0;
    for (const line of got) if (i < want.length && matches(line, want[i])) i++;
    assert.equal(i, want.length, `${file}: heading "${want[i]}" missing or out of order`);
  }
});

test('Markdown templates use <!-- ite: fill ... --> placeholders', () => {
  for (const f of FILES.filter((x) => x.endsWith('.md'))) assert.match(read(f), /<!-- ite: fill [^>]+ -->/, f);
});

test('NOT_APPLICABLE.md has the three rule 02 fields', () => {
  const t = read('NOT_APPLICABLE.md');
  for (const field of ['Area: ', 'Reason: ', 'Decided in: D-']) assert.ok(t.includes(field), field);
});

test('the PLAN template fixes the generated phase order', () => {
  const t = read('PLAN.md');
  const phases = ['setup and test harness', 'data contracts', 'core behaviour', 'integrations', 'error handling', 'end-to-end and acceptance', 'packaging and README'];
  phases.forEach((name, i) => assert.match(t, new RegExp(`^## F-${i + 1} .*${name}`, 'im'), name));
  assert.match(t, /^Done when: T-/m);
});

test('the CLAUDE template holds the rule 06.3 items', () => {
  const t = read('CLAUDE.md');
  for (const s of ['INDEX', 'todo', 'in-progress', 'blocked', 'tests/cases.json', '.zod.ts', '.env', '.gitignore', '.ite/coverage.json', 'two options', 'Read CLAUDE.md, then follow PLAN.md'])
    assert.ok(t.includes(s), s);
});

test('the schema template is draft 2020-12 with $id, title, description and only D-015 keywords', () => {
  const s = JSON.parse(read('schemas/S-xxx-slug.schema.json'));
  assert.equal(s.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.match(s.$id, /^S-/);
  assert.ok(s.title && s.description);
  assert.deepEqual(unsupportedKeywords(s), []);
});

test('the cases.json template validates against S-002', () => {
  const s002 = JSON.parse(readFileSync(join(root, 'schemas', 'test-cases.schema.json'), 'utf8'));
  assert.deepEqual(validate(s002, JSON.parse(read('tests/cases.json'))), []);
});

test('the promptfoo template links tests by T- id and shows the not-applicable form', () => {
  const t = read('tests/promptfooconfig.yaml');
  assert.match(t, /description: "T-/);
  for (const s of ['Area: llm', 'Reason: ', 'Decided in: D-', 'tests: []']) assert.ok(t.includes(s), s);
});

test('templates are English ASCII (plus the format marks → and ·) with LF endings and no em dashes', () => {
  for (const f of FILES) {
    const t = read(f);
    assert.ok(!t.includes('\r'), `${f} has CR`);
    assert.ok(/^[\x09\x0a\x20-\x7e→·]*$/u.test(t), `${f} has other non-ASCII characters`);
  }
});
