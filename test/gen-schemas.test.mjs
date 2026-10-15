// F-3.2: JSON Schema -> Zod and Pydantic v2 (specs/schema-generation.md). Covers T-011 and T-012.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { toZod, toPydantic } from '../scripts/lib/gen-schemas.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ITE = join(root, 'scripts', 'ite.mjs');
const FIX = join(root, 'test', 'fixtures', 'gen');
const VERSION = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version;

const run = (cwd, ...args) => spawnSync(process.execPath, [ITE, ...args], { cwd, encoding: 'utf8' });
function project(...fixtures) {
  const dir = mkdtempSync(join(tmpdir(), 'ite gen '));
  mkdirSync(join(dir, 'schemas'));
  for (const f of fixtures) copyFileSync(join(FIX, f), join(dir, 'schemas', f));
  return dir;
}
const gen = (schema) => ({ zod: toZod(schema, 'S-009-x.schema.json', '0.0.0'), py: toPydantic(schema, 'S-009-x.schema.json', '0.0.0') });
const obj = (properties, required = Object.keys(properties)) => ({ $id: 'S-009', title: 'Thing', type: 'object', required, properties });

test('T-011 gen-schemas writes .zod.ts and .py with the GENERATED header', () => {
  const dir = project('S-002-ticket.schema.json');
  const r = run(dir, 'gen-schemas', '.');
  assert.equal(r.status, 0, r.stderr);
  const zod = readFileSync(join(dir, 'schemas', 'S-002-ticket.zod.ts'), 'utf8');
  const py = readFileSync(join(dir, 'schemas', 'S-002-ticket.py'), 'utf8');
  const header = `GENERATED FROM S-002-ticket.schema.json BY ITE ${VERSION} - DO NOT EDIT. Re-run compile.`;
  assert.equal(zod.split('\n')[0], `// ${header}`);
  assert.equal(py.split('\n')[0], `# ${header}`);
});

test('T-011 both files hold all 6 properties and exactly the 4 required ones are required', () => {
  const dir = project('S-002-ticket.schema.json');
  run(dir, 'gen-schemas', '.');
  const zod = readFileSync(join(dir, 'schemas', 'S-002-ticket.zod.ts'), 'utf8');
  const py = readFileSync(join(dir, 'schemas', 'S-002-ticket.py'), 'utf8');
  const props = ['summary', 'priority', 'reporter', 'source', 'labels', 'due'];
  const optional = ['labels', 'due'];

  const top = zod.slice(zod.indexOf('export const TicketSchema'));
  for (const p of props) {
    const line = top.split('\n').find((l) => l.startsWith(`  ${p}: `));
    assert.ok(line, `zod: ${p} missing`);
    assert.equal(line.trimEnd().endsWith('.optional(),'), optional.includes(p), `zod: ${p} optional flag`);
  }
  const cls = py.slice(py.indexOf('class Ticket(BaseModel):'));
  for (const p of props) {
    const line = cls.split('\n').find((l) => l.startsWith(`    ${p}: `));
    assert.ok(line, `py: ${p} missing`);
    assert.equal(/= None$|default=None/.test(line), optional.includes(p), `py: ${p} optional flag`);
  }
  assert.ok(py.indexOf('class TicketSource(BaseModel):') < py.indexOf('class Ticket(BaseModel):'), 'nested class first');
});

test('T-011 running gen-schemas twice gives byte-identical files', () => {
  const dir = project('S-002-ticket.schema.json');
  run(dir, 'gen-schemas', '.');
  const first = ['zod.ts', 'py'].map((e) => readFileSync(join(dir, 'schemas', `S-002-ticket.${e}`)));
  run(dir, 'gen-schemas', '.');
  const second = ['zod.ts', 'py'].map((e) => readFileSync(join(dir, 'schemas', `S-002-ticket.${e}`)));
  assert.deepEqual(second, first);
  assert.ok(!first[0].includes('\r') && !first[1].includes('\r'));
});

test('T-012 an unsupported keyword exits 2, names it and the file, and writes nothing', () => {
  const dir = project('S-002-ticket.schema.json', 'S-003-oneof.schema.json');
  const r = run(dir, 'gen-schemas', '.');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /oneOf/);
  assert.match(r.stderr, /S-003-oneof\.schema\.json/);
  assert.deepEqual(readdirSync(join(dir, 'schemas')).sort(), ['S-002-ticket.schema.json', 'S-003-oneof.schema.json']);
});

test('gen-schemas on a folder without schemas/ exits 4', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ite gen '));
  assert.equal(run(dir, 'gen-schemas', '.').status, 4);
  assert.ok(!existsSync(join(dir, 'schemas')));
});

test('mapping: string formats and constraints', () => {
  const { zod, py } = gen(obj({
    a: { type: 'string', format: 'email' }, b: { type: 'string', format: 'uri' },
    c: { type: 'string', format: 'date' }, d: { type: 'string', format: 'date-time' },
    e: { type: 'string', minLength: 1, maxLength: 9, pattern: '^x$' },
    f: { type: 'string', pattern: '^\\d+$' },
  }));
  assert.ok(zod.includes('f: z.string().regex(new RegExp("^\\\\d+$"))'), 'backslash kept in Zod');
  assert.ok(py.includes('f: Annotated[str, Field(pattern="^\\\\d+$")]'), 'backslash kept in Python');
  for (const s of ['a: z.string().email()', 'b: z.string().url()', 'c: z.string().date()', 'd: z.string().datetime()', 'e: z.string().min(1).max(9).regex(new RegExp("^x$"))'])
    assert.ok(zod.includes(s), s);
  for (const s of ['a: EmailStr', 'b: AnyUrl', 'c: dt.date', 'd: dt.datetime', 'e: Annotated[str, Field(min_length=1, max_length=9, pattern="^x$")]'])
    assert.ok(py.includes(s), s);
});

test('mapping: numbers, booleans, null, any, nullable and enum', () => {
  const { zod, py } = gen(obj({
    i: { type: 'integer', minimum: 0, maximum: 10 }, n: { type: 'number' }, b: { type: 'boolean' },
    z: { type: 'null' }, any: { description: 'Anything' }, s: { type: ['string', 'null'] },
    e: { type: 'string', enum: ['a', 'b'] }, k: { enum: [1, 2] },
  }));
  for (const s of ['i: z.number().int().min(0).max(10)', 'n: z.number()', 'b: z.boolean()', 'z: z.null()', 'any: z.unknown().describe("Anything")', 's: z.string().nullable()', 'e: z.enum(["a", "b"])', 'k: z.union([z.literal(1), z.literal(2)])'])
    assert.ok(zod.includes(s), s);
  for (const s of ['i: Annotated[int, Field(ge=0, le=10)]', 'n: float', 'b: bool', 'z: None', 'any: Any = Field(description="Anything")', 's: Optional[str]', 'e: Literal["a", "b"]', 'k: Literal[1, 2]'])
    assert.ok(py.includes(s), s);
});

test('mapping: arrays, optional, default, strict objects and $ref order', () => {
  const schema = {
    $id: 'S-009', title: 'Order', type: 'object', additionalProperties: false, required: ['items'],
    properties: {
      items: { type: 'array', items: { $ref: '#/$defs/Line' }, minItems: 1, maxItems: 3 },
      note: { type: 'string' },
      currency: { type: 'string', default: 'EUR' },
    },
    $defs: {
      Line: { type: 'object', required: ['sku'], properties: { sku: { type: 'string' }, unit: { $ref: '#/$defs/Unit' } } },
      Unit: { type: 'string', enum: ['kg', 'pcs'] },
    },
  };
  const { zod, py } = gen(schema);
  for (const s of ['items: z.array(LineSchema).min(1).max(3)', 'note: z.string().optional()', 'currency: z.string().default("EUR")', '}).strict();'])
    assert.ok(zod.includes(s), s);
  assert.ok(zod.indexOf('const UnitSchema') < zod.indexOf('const LineSchema'), 'zod: dependency declared first');
  for (const s of ['items: Annotated[list[Line], Field(min_length=1, max_length=3)]', 'note: Optional[str] = None', 'currency: str = "EUR"', 'model_config = ConfigDict(extra="forbid")'])
    assert.ok(py.includes(s), s);
  assert.ok(py.indexOf('Unit = ') < py.indexOf('class Line(BaseModel)'), 'py: dependency declared first');
});
