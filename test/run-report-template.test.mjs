// F-7.3 step 2: the run-report issue form asks the five fields F-7.4 counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const form = readFileSync(join(root, '.github', 'ISSUE_TEMPLATE', 'run-report.yml'), 'utf8').replace(/\r\n/g, '\n');

test('is a GitHub issue form with a run-report label', () => {
  assert.match(form, /^name: /m);
  assert.match(form, /^description: /m);
  assert.match(form, /^labels: \[run-report\]/m);
  assert.match(form, /^body:/m);
});

test('asks idea type, mode, questions, finished and would use again', () => {
  for (const id of ['idea-type', 'mode', 'questions', 'finished', 'use-again']) {
    assert.match(form, new RegExp(`^ +id: ${id}$`, 'm'), id);
  }
});

test('finished and would use again are y/n and required', () => {
  for (const id of ['finished', 'use-again']) {
    const block = form.split(/\n  - type: /).find((b) => b.includes(`id: ${id}\n`));
    assert.ok(block, id);
    assert.match(block, /options:\n\s+- "y"\n\s+- "n"/, id);
    assert.match(block, /required: true/, id);
  }
});

test('no em dashes', () => {
  assert.doesNotMatch(form, /—/);
});
