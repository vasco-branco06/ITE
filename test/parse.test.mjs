// unit parse (F-4.1) and T-022 parser part: IDs, definitions, references and links (rule 03, specs/coherence-checker.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseMarkdown, parseFolder } from '../scripts/lib/parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', 'parse');
const ITE_ROOT = join(here, '..', '..');
const parsed = parseFolder(FIX);
const def = (id) => parsed.definitions.filter((d) => d.id === id);

test('collects files, skipping the excluded folders', () => {
  assert.deepEqual(parsed.files, [
    '.ite/coverage.json', 'DECISIONS.md', 'PLAN.md', 'SPEC.md', 'prompts/P-001-classify-log.md',
    'schemas/S-001-ticket.schema.json', 'tests/acceptance.md', 'tests/cases.json',
  ]);
  assert.equal(def('R-777').length, 0);
});

test('definitions: headings and bold list items, with file and line', () => {
  assert.deepEqual(def('R-001').map((d) => [d.file, d.line]), [['SPEC.md', 5]]);
  assert.deepEqual(def('D-002').map((d) => [d.file, d.line]), [['DECISIONS.md', 12]]);
  assert.deepEqual(def('P-001').map((d) => d.file), ['prompts/P-001-classify-log.md']);
  assert.deepEqual(def('T-001').map((d) => d.file), ['tests/acceptance.md']);
  assert.equal(def('F-3').length, 1);
  assert.equal(def('F-3.1').length, 1, 'a table row is a reference, not a definition (rule 03.2)');
});

test('code fences and inline code never count', () => {
  for (const id of ['R-099', 'T-099', 'R-098']) {
    assert.equal(def(id).length, 0, id);
    assert.ok(!parsed.references.some((r) => r.id === id), id);
  }
});

test('labelled links: arrow, Tripwire, Affects, Done when, Refs, Used by, Tested by, Proves', () => {
  assert.deepEqual(def('R-001')[0].arrow, ['T-001', 'T-002']);
  assert.deepEqual(def('R-002')[0].refs, ['T-003', 'D-001'], 'continuation lines belong to the item');
  assert.deepEqual(def('D-001')[0].labels.affects.ids, ['R-001', 'F-3.1']);
  assert.deepEqual(def('D-002')[0].labels.tripwire.ids, ['T-002']);
  assert.deepEqual(def('F-3.1')[0].labels['done when'].ids, ['T-001', 'T-003']);
  assert.deepEqual(def('F-3')[0].labels.refs.ids, ['R-001', 'R-002']);
  assert.deepEqual(def('P-001')[0].labels['used by'].ids, ['R-001']);
  assert.deepEqual(def('P-001')[0].labels['tested by'].ids, ['T-001']);
  assert.deepEqual(def('T-002')[0].labels.proves.ids, ['D-002']);
});

test('assumptions and withdrawn status', () => {
  assert.equal(def('D-001')[0].assumption, false);
  assert.equal(def('D-002')[0].assumption, true, 'under ## Assumptions');
  assert.equal(def('D-003')[0].status, 'withdrawn');
  assert.equal(def('D-002')[0].status, 'active');
  assert.equal(parseMarkdown('### D-009 X\n\n**Assumption:** y\n', 'x.md').definitions[0].assumption, true, '**Assumption:** in the body');
});

test('references and malformed IDs', () => {
  const at = (id) => parsed.references.filter((r) => r.id === id).map((r) => `${r.file}:${r.line}`);
  assert.ok(at('D-001').includes('SPEC.md:7'));
  assert.ok(at('F-3.1').includes('PLAN.md:5'));
  assert.deepEqual(parsed.badIds.map((b) => `${b.file}:${b.line}:${b.token}`), ['SPEC.md:17:R-01']);
});

test('links: relative targets, backslashes normalised, anchors dropped', () => {
  const links = parsed.links.filter((l) => l.file === 'SPEC.md').map((l) => `${l.line}:${l.target}`);
  assert.deepEqual(links, ['5:schemas/S-001-ticket.schema.json', '17:./PLAN.md', '17:DECISIONS.md']);
});

test('JSON: cases.json ids with lines, schema $id, coverage', () => {
  assert.deepEqual(parsed.cases.map((c) => [c.id, c.line, c.proves, c.kind]), [
    ['T-001', 4, ['R-001'], 'e2e'], ['T-002', 5, ['D-002'], 'assumption'], ['T-003', 6, ['R-002'], 'integration'],
  ]);
  assert.deepEqual(parsed.schemas.map((s) => [s.file, s.id, s.line]), [['schemas/S-001-ticket.schema.json', 'S-001', 3]]);
  assert.deepEqual(parsed.coverage, { schema_version: 1 });
  assert.deepEqual(parsed.jsonErrors, []);
});

test('invalid JSON is reported, never thrown', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ite parse '));
  cpSync(FIX, dir, { recursive: true });
  writeFileSync(join(dir, 'tests', 'cases.json'), '{ nope');
  const p = parseFolder(dir);
  assert.equal(p.cases, null);
  assert.deepEqual(p.jsonErrors.map((e) => e.file), ['tests/cases.json']);
});

test('T-022 CRLF files and backslash links give the same result as LF', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ite parse crlf '));
  cpSync(FIX, dir, { recursive: true });
  for (const f of parsed.files) {
    const p = join(dir, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/\n/g, '\r\n'));
  }
  assert.deepEqual(parseFolder(dir), parsed);
});

test('ITE parses its own spec folder: one definition per ID, assumptions found', { skip: !existsSync(join(ITE_ROOT, 'SPEC.md')) && 'ITE spec folder not present' }, () => {
  const p = parseFolder(ITE_ROOT);
  assert.ok(!p.files.some((f) => /^(plugin|validation|founder|replica|app)\//.test(f)));
  const seen = new Map();
  for (const d of p.definitions) seen.set(d.id, [...(seen.get(d.id) ?? []), `${d.file}:${d.line}`]);
  const dupes = [...seen].filter(([, where]) => where.length > 1);
  assert.deepEqual(dupes, []);
  const d014 = p.definitions.find((d) => d.id === 'D-014');
  assert.equal(d014.assumption, true);
  assert.deepEqual(d014.labels.tripwire.ids, ['T-025']);
  assert.ok(p.definitions.find((d) => d.id === 'R-001').arrow.includes('T-001'));
});
