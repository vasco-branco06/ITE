// Coherence checker: every rule 04 check, in the fixed order, all of them run (specs/coherence-checker.md).
// check(folder, version) -> { findings, counts }; report() wraps it as S-004.
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFolder } from './parse.mjs';
import { validate, unsupportedKeywords } from './validate.mjs';
import { toZod, toPydantic } from './gen-schemas.mjs';
import { questionCount } from './state.mjs';

const schemaDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas');
const S001 = JSON.parse(readFileSync(join(schemaDir, 'coverage.schema.json'), 'utf8'));
const S002 = JSON.parse(readFileSync(join(schemaDir, 'test-cases.schema.json'), 'utf8'));

// Rule 02 section 2.1 paths (check-report.json is written by check itself, so it is not required).
const REQUIRED = ['INDEX.md', 'SPEC.md', 'DECISIONS.md', 'PLAN.md', 'CLAUDE.md', 'prompts/', 'schemas/',
  'tests/acceptance.md', 'tests/cases.json', 'tests/promptfooconfig.yaml', '.ite/coverage.json'];
const FAMILIES = ['R', 'D', 'S', 'P', 'T', 'F'];
const hasT = (ids) => ids.some((x) => x.startsWith('T-'));

export function check(folder, version) {
  const findings = [];
  const add = (code, file, message, fix, extra = {}) =>
    findings.push({ code, severity: code.startsWith('E-') ? 'error' : 'warning', file, ...extra, message, fix });
  const read = (f) => readFileSync(join(folder, f), 'utf8').replace(/\r\n/g, '\n');
  const exists = (f) => existsSync(join(folder, f));
  const p = parseFolder(folder);
  const md = p.definitions;
  const cases = p.cases ?? [];

  // Registry: markdown definitions, cases.json ids, schema $ids.
  const schemaId = (s) => s.id ?? (/^schemas\/(S-\d{3})/.exec(s.file) ?? [])[1];
  const defined = new Set([...md.map((d) => d.id), ...cases.map((c) => c.id), ...p.schemas.map(schemaId).filter(Boolean)]);
  const byId = (id) => md.filter((d) => d.id === id);
  const assumption = (id) => byId(id).some((d) => d.assumption) || cases.some((c) => c.kind === 'assumption' && c.proves.includes(id));
  const withdrawn = new Set(md.filter((d) => d.status === 'withdrawn').map((d) => d.id));
  const active = md.filter((d) => d.status === 'active');

  // 1. Files
  for (const f of REQUIRED) {
    const ok = f.endsWith('/') ? exists(f) && statSync(join(folder, f)).isDirectory() && readdirSync(join(folder, f)).length > 0 : exists(f);
    if (!ok) add('E-FILE-MISSING', f, `${f} is missing; every compiled folder has it (rule 02).`, 'Re-run compile, or create it with NOT_APPLICABLE.md if the area does not apply.');
  }
  for (const f of p.files.filter((x) => posix.basename(x) === 'NOT_APPLICABLE.md')) {
    const t = read(f);
    const decided = /^Decided in:\s*(D-\d{3})/m.exec(t);
    if (!/^Reason:\s*\S/m.test(t)) add('E-NA-NO-REASON', f, `${f} has no Reason: line.`, 'Add "Reason: <one sentence>" from the coverage area.');
    else if (!decided || !defined.has(decided[1])) add('E-NA-NO-REASON', f, `${f} has no Decided in: line pointing to a defined D-.`, 'Add "Decided in: D-xxx" naming the decision in DECISIONS.md.');
  }

  // 2. IDs
  const seen = new Map();
  for (const d of md) seen.set(d.id, [...(seen.get(d.id) ?? []), d]);
  for (const [id, defs] of seen) {
    for (const d of defs.slice(1)) add('E-ID-DUPLICATE', d.file, `${id} is defined again here; first definition is ${defs[0].file}:${defs[0].line}.`, 'Give the new item the next free number; never renumber the old one.', { line: d.line, id });
  }
  const caseSeen = new Set();
  for (const c of cases) {
    if (caseSeen.has(c.id)) add('E-ID-DUPLICATE', 'tests/cases.json', `${c.id} appears twice in cases.json.`, 'Give the second case the next free T- number.', { line: c.line ?? undefined, id: c.id });
    caseSeen.add(c.id);
  }
  const schemaSeen = new Map();
  for (const s of p.schemas) {
    const id = schemaId(s);
    if (id && schemaSeen.has(id)) add('E-ID-DUPLICATE', s.file, `${id} is also the $id of ${schemaSeen.get(id)}.`, 'Give this schema the next free S- number.', { id });
    schemaSeen.set(id, s.file);
  }
  const undefinedSeen = new Set();
  const refs = [...p.references, ...cases.flatMap((c) => c.proves.map((id) => ({ id, file: 'tests/cases.json', line: c.line })))];
  for (const r of refs) {
    const key = `${r.file}:${r.line}:${r.id}`;
    if (defined.has(r.id) || undefinedSeen.has(key)) continue;
    undefinedSeen.add(key);
    add('E-ID-UNDEFINED', r.file, `${r.id} is referenced but defined nowhere.`, 'Define it in the right file (rule 03.1) or remove the reference.', { line: r.line ?? undefined, id: r.id });
  }
  for (const b of p.badIds) add('E-ID-FORMAT', b.file, `${b.token} does not match the ID format in rule 03.1 (three digits).`, 'Write the ID with three digits, e.g. R-001.', { line: b.line, id: b.token });
  for (const s of p.schemas) {
    const fileId = (/^schemas\/(S-\d{3})-[a-z0-9-]+\.schema\.json$/.exec(s.file) ?? [])[1];
    if (!/^S-\d{3}$/.test(s.id ?? '') || s.id !== fileId) add('E-ID-FORMAT', s.file, `Schema $id "${s.id}" must be S-xxx and match the file name (rule 02.3).`, 'Name the file S-xxx-<kebab-slug>.schema.json and set the same $id.', { line: s.line ?? undefined });
  }

  // 3. Links
  for (const l of p.links) {
    if (/^(https?|mailto):/i.test(l.target)) continue;
    const resolved = posix.normalize(posix.join(posix.dirname(l.file), l.target));
    if (/^[a-z][a-z0-9+.-]*:/i.test(l.target) || l.target.startsWith('/') || resolved === '..' || resolved.startsWith('../')) {
      add('E-LINK-OUTSIDE', l.file, `Link to ${l.target} is absolute or leaves the project folder.`, 'Use a relative link to a file inside the folder (rule 03.4).', { line: l.line });
    } else if (!exists(resolved)) {
      add('E-BROKEN-LINK', l.file, `Link to ${l.target} points to a file that does not exist.`, 'Fix the path or create the file.', { line: l.line });
    }
  }

  // 4. Coverage
  const cov = p.coverage;
  if (p.jsonErrors.some((e) => e.file === '.ite/coverage.json')) add('E-COVERAGE-INVALID', '.ite/coverage.json', 'coverage.json is not valid JSON.', 'Restore it from start, or fix the JSON syntax.');
  if (cov) {
    const errs = validate(S001, cov);
    if (errs.length) add('E-COVERAGE-INVALID', '.ite/coverage.json', `coverage.json fails S-001 at ${errs[0].path || '/'}: ${errs[0].message}${errs.length > 1 ? ` (and ${errs.length - 1} more)` : ''}.`, 'Let ITE write this file through start; do not edit it by hand.');
    for (const a of Array.isArray(cov.areas) ? cov.areas : []) {
      if (a.state === 'open') add('E-COVERAGE-OPEN', '.ite/coverage.json', `Area ${a.id} is still open.`, 'Run start to finish the interview.', { id: a.id });
      if (a.state === 'assumed' && !(a.test_ids ?? []).length) add('E-ASSUMPTION-UNTESTED', '.ite/coverage.json', `Area ${a.id} is assumed but has no linked test.`, 'Record its assumption test with answer --test T-xxx.', { id: a.id });
    }
    if (cov.mode === 'manual') add('W-MANUAL-MODE', '.ite/coverage.json', 'This folder was compiled without Node, so checks were not machine-verified.', 'Install Node.js 18+ and run check again.');
    if (Array.isArray(cov.history) && questionCount(cov) > 25) add('W-LONG-INTERVIEW', '.ite/coverage.json', `The interview asked ${questionCount(cov)} questions, more than 25.`, 'Look for questions the idea already answered.');
  }

  // 5. Tests
  for (const d of active.filter((x) => x.id.startsWith('R-'))) {
    if (!hasT([...d.arrow, ...d.refs])) add('E-REQ-UNTESTED', d.file, `${d.id} names no test.`, 'End the requirement with "→ T-xxx" and add that test.', { line: d.line, id: d.id });
  }
  for (const d of active.filter((x) => x.id.startsWith('D-') && assumption(x.id))) {
    if (!hasT(d.labels.tripwire?.ids ?? [])) add('E-ASSUMPTION-UNTESTED', d.file, `Assumption ${d.id} has no Tripwire test.`, 'Add "Tripwire: T-xxx" with an "if this, test that" test (rule 05.3).', { line: d.line, id: d.id });
  }
  const accT = md.filter((d) => d.file === 'tests/acceptance.md' && d.id.startsWith('T-'));
  const caseIds = new Set(cases.map((c) => c.id));
  for (const d of accT) if (p.cases && !caseIds.has(d.id)) add('E-TEST-MISMATCH', d.file, `${d.id} is in acceptance.md but not in cases.json.`, 'Add the same test to cases.json.', { line: d.line, id: d.id });
  const accIds = new Set(accT.map((d) => d.id));
  for (const c of cases) if (!accIds.has(c.id)) add('E-TEST-MISMATCH', 'tests/cases.json', `${c.id} is in cases.json but not in acceptance.md.`, 'Add the same test to acceptance.md.', { line: c.line ?? undefined, id: c.id });
  for (const id of new Set([...accIds, ...caseIds])) {
    if (withdrawn.has(id)) continue;
    const proves = [...accT.filter((d) => d.id === id).flatMap((d) => d.labels.proves?.ids ?? []), ...cases.filter((c) => c.id === id).flatMap((c) => c.proves)];
    if (!proves.some((x) => x.startsWith('R-') || (x.startsWith('D-') && assumption(x)))) {
      const at = accT.find((d) => d.id === id);
      add('E-TEST-ORPHAN', at ? at.file : 'tests/cases.json', `${id} proves no requirement and no assumption.`, 'List the R- or assumption D- it proves.', { line: at?.line ?? cases.find((c) => c.id === id)?.line ?? undefined, id });
    }
  }
  if (p.jsonErrors.some((e) => e.file === 'tests/cases.json')) add('E-CASES-INVALID', 'tests/cases.json', 'cases.json is not valid JSON.', 'Fix the JSON syntax.');
  else if (exists('tests/cases.json')) {
    const errs = validate(S002, JSON.parse(read('tests/cases.json')));
    if (errs.length) add('E-CASES-INVALID', 'tests/cases.json', `cases.json fails S-002 at ${errs[0].path || '/'}: ${errs[0].message}${errs.length > 1 ? ` (and ${errs.length - 1} more)` : ''}.`, 'Fix the case so it matches S-002.');
  }

  // 6. Schemas
  for (const e of p.jsonErrors.filter((x) => x.file.startsWith('schemas/'))) add('E-SCHEMA-INVALID', e.file, `${e.file} is not valid JSON.`, 'Fix the JSON syntax.');
  for (const s of p.schemas) {
    const base = s.file.replace(/\.schema\.json$/, '');
    const name = posix.basename(s.file);
    const gen = [[`${base}.zod.ts`, toZod], [`${base}.py`, toPydantic]];
    const manual = gen.filter(([f]) => exists(f) && read(f).split('\n', 1)[0].includes('MANUAL'));
    for (const [f] of manual) add('W-MANUAL-SCHEMA', f, `${f} is marked MANUAL and is not generated from its schema.`, 'Keep it in step with the .schema.json by hand.');
    if (unsupportedKeywords(s.schema).length) {
      if (!manual.length) add('E-SCHEMA-INVALID', s.file, `${name} uses keywords outside D-015 and has no MANUAL generated file.`, 'Use only D-015 keywords, or write the code by hand and mark it MANUAL.', { line: s.line ?? undefined });
      continue;
    }
    if (schemaId(s) && !active.some((d) => d.id.startsWith('R-') && d.refs.includes(schemaId(s)))) {
      add('E-SCHEMA-UNUSED', s.file, `${schemaId(s)} is used by no requirement.`, 'Link it from the R- that uses it, or withdraw it.', { line: s.line ?? undefined, id: schemaId(s) });
    }
    for (const [f, fn] of gen) {
      if (manual.some(([m]) => m === f)) continue;
      const body = (t) => t.split('\n').slice(1).join('\n');
      const ok = exists(f) && new RegExp(`^(//|#) GENERATED FROM ${name.replace(/\./g, '\\.')} BY ITE `).test(read(f))
        && body(read(f)) === body(fn(s.schema, name, version));
      if (!ok) add('E-GENERATED-STALE', f, `${f} is missing, lacks the GENERATED header, or no longer matches ${name}.`, 'Run gen-schemas (compile does it).');
    }
  }

  // 7. Prompts
  for (const d of active.filter((x) => x.id.startsWith('P-'))) {
    if (!hasT(d.refs)) add('E-PROMPT-UNTESTED', d.file, `${d.id} has no test.`, 'Add "Tested by: T-xxx" and a prompt test.', { line: d.line, id: d.id });
  }

  // 8. Tasks (inline code is blanked by the parser, so `unit <name>` reads as "unit")
  for (const d of active.filter((x) => x.file === 'PLAN.md' && /^F-\d+\.\d/.test(x.id))) {
    const done = d.labels['done when'];
    if (!done || !(hasT(done.ids) || /\bunit\b/.test(done.text) || /reviewed by the user/i.test(done.text))) {
      add('E-TASK-UNTESTED', d.file, `${d.id} has no Done when line naming a test.`, 'Add "Done when: T-xxx".', { line: d.line, id: d.id });
    }
  }

  // Withdrawn references from active items
  for (const d of active) {
    for (const id of new Set([...d.arrow, ...d.refs])) {
      if (withdrawn.has(id)) add('E-WITHDRAWN-REF', d.file, `Active ${d.id} references withdrawn ${id}.`, 'Remove the reference or point to the replacement.', { line: d.line, id });
    }
  }
  for (const c of cases) for (const id of c.proves) if (withdrawn.has(id) && !withdrawn.has(c.id)) add('E-WITHDRAWN-REF', 'tests/cases.json', `${c.id} proves withdrawn ${id}.`, 'Withdraw the test too, or point it to the replacement.', { line: c.line ?? undefined, id });

  // Warnings on content
  const spec = exists('SPEC.md') ? read('SPEC.md') : '';
  const errSection = /^## 11\. Errors[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(spec);
  if (errSection) {
    const rows = errSection[1].split('\n').filter((l) => /^\|/.test(l) && !/^\|[\s|:-]+\|$/.test(l)).length - 1;
    // ponytail: counts SPEC section 11 table rows as the failure cases; the errors summary itself is free text.
    if (rows < 5) add('W-ERRORS-THIN', 'SPEC.md', `Only ${Math.max(rows, 0)} failure cases are listed; aim for at least 5.`, 'Ask about more failure cases: bad input, outages, limits, duplicates, missing config.');
  }
  for (const f of p.files.filter((x) => x.endsWith('.md'))) {
    const text = read(f).split('\n').filter((l) => !(f === 'DECISIONS.md' && l.startsWith('>'))).join('\n');
    const letters = text.match(/\p{L}/gu) ?? [];
    const foreign = letters.filter((ch) => ch > '\x7f').length;
    // ponytail: share of non-ASCII letters; English files have almost none. Misses languages written in ASCII.
    if (foreign >= 10 && foreign / letters.length >= 0.005) add('W-NON-ENGLISH', f, `${f} has many non-English letters (${foreign}).`, 'Write generated files in English; quote the user only in DECISIONS.md blockquotes.');
  }

  findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : (a.line ?? 0) - (b.line ?? 0)));
  const counts = Object.fromEntries(FAMILIES.map((f) => [f, [...defined].filter((id) => id.startsWith(`${f}-`)).length]));
  return { findings, counts };
}

export function report(folder, version) {
  const { findings, counts } = check(folder, version);
  const errors = findings.filter((f) => f.severity === 'error').length;
  return {
    schema_version: 1, ite_version: version, folder, checked_at: new Date().toISOString(),
    errors, warnings: findings.length - errors, findings, counts,
  };
}

export function formatReport(r) {
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const lines = [`${plural(r.errors, 'error')}, ${plural(r.warnings, 'warning')} in ${r.folder}`];
  for (const f of r.findings) lines.push(`${f.file}${f.line ? `:${f.line}` : ''}  ${f.code}  ${f.message}`, `    fix: ${f.fix}`);
  return `${lines.join('\n')}\n`;
}
