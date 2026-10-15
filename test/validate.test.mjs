// unit validate (F-1.2): JSON Schema validation for exactly the D-015 subset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../scripts/lib/validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ok = (schema, data) => assert.deepEqual(validate(schema, data), []);
const bad = (schema, data, path) => {
  const errors = validate(schema, data);
  assert.ok(errors.length > 0, `expected an error for ${JSON.stringify(data)}`);
  if (path !== undefined) assert.equal(errors[0].path, path);
  for (const e of errors) assert.equal(typeof e.message, 'string');
};

test('type: each basic type', () => {
  ok({ type: 'string' }, 'a');
  bad({ type: 'string' }, 1, '');
  ok({ type: 'number' }, 1.5);
  bad({ type: 'number' }, '1');
  ok({ type: 'integer' }, 3);
  bad({ type: 'integer' }, 3.5);
  ok({ type: 'boolean' }, false);
  bad({ type: 'boolean' }, 0);
  ok({ type: 'null' }, null);
  bad({ type: 'null' }, 0);
  ok({ type: 'array' }, []);
  bad({ type: 'array' }, {});
  ok({ type: 'object' }, {});
  bad({ type: 'object' }, []);
  bad({ type: 'object' }, null);
});

test('type: nullable pair [X, "null"]', () => {
  ok({ type: ['string', 'null'] }, null);
  ok({ type: ['string', 'null'] }, 'a');
  bad({ type: ['string', 'null'] }, 1);
});

test('properties, required, additionalProperties: false', () => {
  const s = {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: { id: { type: 'string' }, n: { type: 'integer' } },
  };
  ok(s, { id: 'x' });
  ok(s, { id: 'x', n: 2 });
  bad(s, {}, '/id');
  bad(s, { id: 'x', n: 'two' }, '/n');
  bad(s, { id: 'x', extra: 1 }, '/extra');
});

test('items, minItems, maxItems', () => {
  const s = { type: 'array', minItems: 1, maxItems: 2, items: { type: 'integer' } };
  ok(s, [1]);
  ok(s, [1, 2]);
  bad(s, [], '');
  bad(s, [1, 2, 3], '');
  bad(s, [1, 'b'], '/1');
});

test('enum, including null', () => {
  const s = { type: ['string', 'null'], enum: ['complete', 'user_stopped', null] };
  ok(s, 'complete');
  ok(s, null);
  bad(s, 'other');
});

test('minLength, maxLength, pattern', () => {
  const s = { type: 'string', minLength: 2, maxLength: 3, pattern: '^T-' };
  ok(s, 'T-1');
  bad(s, 'T');
  bad(s, 'T-12');
  bad(s, 'X-1');
});

test('minimum, maximum', () => {
  const s = { type: 'integer', minimum: 1, maximum: 25 };
  ok(s, 1);
  ok(s, 25);
  bad(s, 0);
  bad(s, 26);
});

test('format: date, date-time, email, uri', () => {
  ok({ type: 'string', format: 'date' }, '2026-10-15');
  bad({ type: 'string', format: 'date' }, '2026-13-40');
  ok({ type: 'string', format: 'date-time' }, '2026-10-15T12:00:00Z');
  bad({ type: 'string', format: 'date-time' }, '15/10/2026');
  ok({ type: 'string', format: 'email' }, 'a@b.pt');
  bad({ type: 'string', format: 'email' }, 'not-an-email');
  ok({ type: 'string', format: 'uri' }, 'https://example.com/x');
  bad({ type: 'string', format: 'uri' }, 'no scheme');
});

test('$ref to local $defs', () => {
  const s = {
    type: 'object',
    properties: { a: { $ref: '#/$defs/A' } },
    $defs: { A: { type: 'string' } },
  };
  ok(s, { a: 'x' });
  bad(s, { a: 1 }, '/a');
});

test('annotations are accepted and ignored', () => {
  ok({ $schema: 'x', $id: 'S-009', title: 'T', description: 'd', type: 'string', default: 'v' }, 'a');
});

test('unsupported keyword in a schema gives E-SCHEMA-UNSUPPORTED', () => {
  for (const schema of [
    { oneOf: [{ type: 'string' }] },
    { type: 'object', properties: { a: { anyOf: [] } } },
    { type: 'array', items: { allOf: [] } },
    { $ref: 'https://example.com/remote.json' },
    { type: 'string', format: 'ipv4' },
    { type: 'object', additionalProperties: true },
  ]) {
    const errors = validate(schema, 'anything');
    assert.ok(errors.length > 0, JSON.stringify(schema));
    assert.match(errors[0].message, /^E-SCHEMA-UNSUPPORTED/);
  }
});

test('never throws on invalid data', () => {
  const s = { type: 'object', properties: { a: { type: 'array', items: { type: 'string' } } } };
  for (const data of [undefined, null, 42, 'x', [], { a: null }, { a: [1, {}] }]) {
    assert.doesNotThrow(() => validate(s, data));
  }
});

test('ITE\'s own .ite/coverage.json validates against S-001', () => {
  const schema = JSON.parse(readFileSync(join(here, '..', 'schemas', 'coverage.schema.json'), 'utf8'));
  const state = JSON.parse(readFileSync(join(here, 'fixtures', 'coverage-ite.json'), 'utf8'));
  ok(schema, state);
  bad(schema, { ...state, areas: state.areas.slice(1) }, '/areas');
});
