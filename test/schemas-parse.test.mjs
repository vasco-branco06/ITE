// unit schemas-parse (F-1.1): the plugin's copies of S-001..S-004 parse as JSON and keep their $id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'schemas');

const SCHEMAS = {
  'coverage.schema.json': 'S-001',
  'test-cases.schema.json': 'S-002',
  'decision.schema.json': 'S-003',
  'check-report.schema.json': 'S-004',
};

for (const [file, id] of Object.entries(SCHEMAS)) {
  test(`schemas-parse ${file} parses and has $id ${id}`, () => {
    const schema = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    assert.equal(schema.$id, id);
  });
}
