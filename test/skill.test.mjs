// F-2.1: structure of skills/ite-interview (specs/ite-interview-skill.md). The behaviour itself
// (T-003, T-005) is checked by recorded interview runs in validation/interview-runs.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const skill = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'ite-interview');
const read = (f) => readFileSync(join(skill, f), 'utf8').replace(/\r\n/g, '\n');
const AREAS = ['goal', 'users', 'scope', 'inputs', 'outputs', 'integrations', 'security', 'stack', 'llm', 'errors', 'acceptance', 'done'];

// Split a markdown file into { areaId: sectionText } using "## <id>" headings.
const sections = (text) => Object.fromEntries(
  text.split(/^## /m).slice(1).map((s) => [s.split(/[\s\n]/)[0], s]),
);

test('SKILL.md frontmatter: name, not user-invocable, a triggering description', () => {
  const md = read('SKILL.md');
  const front = md.split('\n---\n')[0];
  assert.match(front, /^---\nname: ite-interview$/m);
  assert.match(front, /^user-invocable: false$/m);
  assert.match(front, /^description: .*start.*/m);
  assert.match(front, /spec this idea/);
});

test('SKILL.md body carries every P-001 rule and stays under 150 lines', () => {
  const md = read('SKILL.md');
  assert.ok(md.split('\n').length < 150, 'SKILL.md must stay under about 150 lines');
  const p001 = readFileSync(join(skill, '..', '..', 'test', 'fixtures', 'P-001-rules.txt'), 'utf8').replace(/\r\n/g, '\n');
  for (const rule of p001.trim().split('\n')) assert.ok(md.includes(rule), `missing P-001 rule: ${rule}`);
  for (const ref of ['references/areas.md', 'references/question-bank.md', 'references/recommendation-style.md', 'references/examples.md']) {
    assert.ok(md.includes(ref), `SKILL.md should point to ${ref}`);
  }
});

test('areas.md: the 12 areas in rule 01 order, each with "Clear when" and 2 inference hints', () => {
  const s = sections(read('references/areas.md'));
  assert.deepEqual(Object.keys(s), AREAS);
  for (const id of AREAS) {
    assert.match(s[id], /Clear when:/, id);
    assert.equal((s[id].match(/^- Hint:/gm) ?? []).length, 2, `${id} needs 2 inference hints`);
  }
});

test('question-bank.md: 3 to 6 questions per area, each with a Recommended default', () => {
  const s = sections(read('references/question-bank.md'));
  assert.deepEqual(Object.keys(s), AREAS);
  for (const id of AREAS) {
    const questions = s[id].match(/^\d+\. /gm) ?? [];
    assert.ok(questions.length >= 3 && questions.length <= 6, `${id} has ${questions.length} questions`);
    assert.equal((s[id].match(/Recommended: /g) ?? []).length, questions.length, `${id}: one Recommended per question`);
  }
});

test('recommendation-style.md is P-003', () => {
  const md = read('references/recommendation-style.md');
  for (const heading of ['## Role', '## Task', '## Inputs', '## Output contract', '## Rules', '## Examples', '## Failure behaviour']) {
    assert.ok(md.includes(heading), heading);
  }
  assert.ok(md.includes('Default to the simplest option that works for one person on a laptop'));
});

test('examples.md: two worked interviews (agent, automation), 10 to 15 turns, early stop, assumption to test', () => {
  const md = read('references/examples.md');
  const interviews = md.split(/^## Example \d/m).slice(1);
  assert.equal(interviews.length, 2);
  assert.match(interviews[0], /agent/i);
  assert.match(interviews[1], /automation|n8n/i);
  for (const text of interviews) {
    const turns = (text.match(/^\[Area: /gm) ?? []).length;
    assert.ok(turns >= 10 && turns <= 15, `example has ${turns} turns`);
    assert.equal((text.match(/^Recommended: /gm) ?? []).length, turns, 'every turn has a Recommended line');
    assert.equal((text.match(/^Why: /gm) ?? []).length, turns, 'every turn has a Why line');
    assert.match(text, /Inferred/i, 'shows the inference paragraph');
    assert.match(text, /D-\d{3}.*T-\d{3}/, 'shows an assumption with its test');
  }
  assert.match(md, /"enough"|"chega"/i, 'one example stops early');
});

test('D-020: examples and question bank never join two asks with "and" in one question', () => {
  for (const f of ['references/examples.md', 'references/question-bank.md']) {
    const question = (l) => l.split(/(?<=[.!]) /).find((s) => s.includes('?')) ?? '';
    const compound = read(f).split('\n').filter((l) => /, and [^?]*\?/.test(question(l)) && !/^(Recommended|Why|State):/.test(l.trim()));
    assert.deepEqual(compound, [], f);
  }
});
