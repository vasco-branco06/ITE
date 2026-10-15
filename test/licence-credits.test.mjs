// T-028: licence and credits are present (R-023, rule 08 section 8.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(join(root, name), 'utf8').replace(/\r\n/g, '\n');

// Rule 08 section 8.2, in table order.
const REQUIRED = [
  'mattpocock/skills',
  'github/spec-kit',
  'Fission-AI/OpenSpec',
  'bmad-code-org/BMAD-METHOD',
  'eyaltoledano/claude-task-master',
  'anthropics/skills',
  'Claude Code best practices',
  'promptfoo/promptfoo',
  'colinhacks/zod',
  'pydantic/pydantic',
  'winfunc/opcode',
  'tauri-apps/tauri',
  'xtermjs/xterm.js',
  'codemirror/dev',
  'shadcn-ui/ui',
  'Tnze/tauri-plugin-pty',
];

test('T-028 LICENSE is MIT with the maintainer name', () => {
  const licence = read('LICENSE');
  assert.match(licence, /^MIT License$/m);
  assert.match(licence, /Copyright \(c\) 2026 Vasco Caldeira Branco/);
});

test('T-028 CREDITS.md lists every rule 08 project with its licence', () => {
  const rows = read('CREDITS.md').split('\n').filter((l) => l.startsWith('|'));
  for (const project of REQUIRED) {
    const row = rows.find((r) => r.includes(project));
    assert.ok(row, `CREDITS.md has no row for ${project}`);
    const licence = row.split('|')[2]?.trim();
    assert.ok(licence, `CREDITS.md row for ${project} has no licence`);
  }
});
