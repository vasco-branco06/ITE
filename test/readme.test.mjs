// F-6.7 step 2: the install README uses only the commands verified in F-0.2 (specs/commands.md) and names the four commands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(join(root, 'README.md'), 'utf8');

test('install commands are the verified ones, for GitHub and a local folder', () => {
  for (const cmd of ['claude plugin marketplace add vasco-branco06/ite', 'claude plugin install ite@ite', 'claude plugin list']) {
    assert.ok(readme.includes(cmd), cmd);
  }
});

test('every command file is documented as /ite:<name>, with --quick for start', () => {
  const names = readdirSync(join(root, 'commands')).map((f) => f.replace(/\.md$/, ''));
  assert.deepEqual(names.sort(), ['build', 'compile', 'start', 'status']);
  for (const n of names) assert.ok(readme.includes(`/ite:${n}`), n);
  assert.match(readme, /\/ite:start --quick/);
});

test('no placeholder text and no em dashes', () => {
  assert.doesNotMatch(readme, /will be documented|not implemented|TODO|TBD/i);
  assert.doesNotMatch(readme, /—/);
});
