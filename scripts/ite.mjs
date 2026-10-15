#!/usr/bin/env node
// ITE command-line entry point. Subcommands and exit codes: specs/commands.md in the ITE spec.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toZod, toPydantic, GenError } from './lib/gen-schemas.mjs';
import { unsupportedKeywords } from './lib/validate.mjs';
import { report, formatReport } from './lib/check.mjs';
import { gate as runGate, formatGate } from './lib/gate.mjs';
import { AREA_IDS, ASKING_ORDER, AREA_STATES, newState, readState, writeState, stateExists, questionCount } from './lib/state.mjs';

const EXIT = { ok: 0, unsupported: 2, exists: 3, invalid: 4, budget: 5 };
const folder = process.cwd();

// Splits argv into positionals and --flags. A flag takes the next value unless it is boolean;
// a repeatable flag collects its values in an array.
function parse(argv, booleans = [], repeatable = []) {
  const pos = [];
  const flags = Object.fromEntries(repeatable.map((name) => [name, []]));
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const name = a.slice(2);
    if (!a.startsWith('--')) pos.push(a);
    else if (booleans.includes(name)) flags[name] = true;
    else if (repeatable.includes(name)) flags[name].push(argv[++i]);
    else flags[name] = argv[++i];
  }
  return { pos, flags };
}

function fail(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function loadState() {
  if (!stateExists(folder)) fail(EXIT.invalid, 'No .ite/coverage.json in this folder. Run start first.');
  try {
    return readState(folder);
  } catch (e) {
    return fail(EXIT.invalid, `.ite/coverage.json could not be read: ${e.message}`);
  }
}

function save(state) {
  state.updated_at = new Date().toISOString();
  const errors = writeState(folder, state);
  if (errors.length) fail(EXIT.invalid, `State not saved, it does not match S-001:\n${errors.map((e) => `  ${e.path || '/'}: ${e.message}`).join('\n')}`);
}

function appendTurn(state, turn) {
  state.history.push({ n: state.history.length + 1, ...turn, answer: null, accepted_recommendation: false, at: new Date().toISOString() });
}

const version = () => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.claude-plugin', 'plugin.json'), 'utf8')).version;

const commands = {
  '--version'() {
    process.stdout.write(`${version()}\n`);
  },

  // Exit 0 clean, 1 errors, 2 the checker itself failed (bad folder). Writes .ite/check-report.json when .ite/ exists.
  check(argv) {
    const { pos, flags } = parse(argv, ['json']);
    const folder = resolve(pos[0] ?? '.');
    if (!existsSync(folder) || !statSync(folder).isDirectory()) fail(EXIT.unsupported, `${folder} is not a folder.`);
    const r = report(folder, version());
    if (existsSync(join(folder, '.ite'))) writeFileSync(join(folder, '.ite', 'check-report.json'), `${JSON.stringify(r, null, 2)}\n`);
    process.stdout.write(flags.json ? `${JSON.stringify(r, null, 2)}\n` : formatReport(r));
    process.exit(r.errors ? 1 : EXIT.ok);
  },

  // Coverage from .ite/coverage.json plus the summary of .ite/check-report.json once compile has written it.
  status(argv) {
    const dir = resolve(argv[0] ?? '.');
    if (!stateExists(dir)) fail(EXIT.invalid, `No .ite/coverage.json in ${dir}. Run start first.`);
    const state = readState(dir);
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const by = (s) => state.areas.filter((a) => a.state === s);
    const open = ASKING_ORDER.filter((id) => state.areas.find((a) => a.id === id).state === 'open');
    const untested = by('assumed').filter((a) => !a.test_ids.length).map((a) => a.id);
    const reportFile = join(dir, '.ite', 'check-report.json');
    const r = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : null;
    const codes = r && [...new Set(r.findings.map((f) => f.code))];
    const next = open.length ? `run start to finish the "${open[0]}" area`
      : !state.approved_at ? 'run start to approve the interview'
      : !r ? 'run compile'
      : r.errors ? 'fix the checker errors, then run check'
      : 'run build';
    process.stdout.write(`${[
      `ITE status - ${basename(dir)}`,
      `Areas: ${state.areas.length} · clear ${by('clear').length} · assumed ${by('assumed').length} (${by('assumed').length - untested.length} tested) · not applicable ${by('not_applicable').length} · open ${open.length}`,
      `Open: ${open.join(', ') || 'none'}`,
      `Assumptions without test: ${untested.join(', ') || 'none'}`,
      r ? `Checker: ${plural(r.errors, 'error')} · ${plural(r.warnings, 'warning')}${codes.length ? ` (${codes.join(', ')})` : ''}` : 'Checker: not run yet (compile runs it)',
      `Next step: ${next}`,
    ].join('\n')}\n`);
  },

  // Rule 06: exit 0 pass (prints the two fresh-session commands), 1 blocked (numbered blockers), 2 bad folder.
  gate(argv) {
    const folder = resolve(argv[0] ?? '.');
    if (!existsSync(folder) || !statSync(folder).isDirectory()) fail(EXIT.unsupported, `${folder} is not a folder.`);
    const blockers = runGate(folder, version());
    process.stdout.write(formatGate(folder, blockers));
    process.exit(blockers.length ? 1 : EXIT.ok);
  },

  // Every schema is checked and generated in memory first; nothing is written unless all succeed (T-012).
  'gen-schemas'(argv) {
    const dir = join(argv[0] ?? '.', 'schemas');
    if (!existsSync(dir)) fail(EXIT.invalid, `No schemas/ folder in ${argv[0] ?? '.'}.`);
    const problems = [];
    const outputs = [];
    for (const file of readdirSync(dir).filter((f) => /^S-\d{3}.*\.schema\.json$/.test(f)).sort()) {
      let schema;
      try {
        schema = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      } catch (e) {
        fail(EXIT.invalid, `${file}: not valid JSON: ${e.message}`);
      }
      const unsupported = unsupportedKeywords(schema);
      if (unsupported.length) {
        problems.push(...unsupported.map((e) => `${file} ${e.path || '/'}: ${e.message}`));
        continue;
      }
      try {
        const base = file.replace(/\.schema\.json$/, '');
        outputs.push([`${base}.zod.ts`, toZod(schema, file, version())], [`${base}.py`, toPydantic(schema, file, version())]);
      } catch (e) {
        if (!(e instanceof GenError)) throw e;
        problems.push(`${file}: E-SCHEMA-UNSUPPORTED: ${e.message}`);
      }
    }
    if (problems.length) fail(EXIT.unsupported, `Nothing generated. Outside the D-015 subset:\n${problems.map((p) => `  ${p}`).join('\n')}`);
    for (const [name, text] of outputs) writeFileSync(join(dir, name), text);
    process.stdout.write(`${outputs.length} files written\n`);
  },

  init(argv) {
    const { pos, flags } = parse(argv, ['quick']);
    if (stateExists(folder)) fail(EXIT.exists, '.ite/coverage.json already exists. Run start to resume the interview.');
    const errors = writeState(folder, newState(pos[0], { lang: flags.lang, quick: flags.quick }));
    if (errors.length) fail(EXIT.invalid, `Not created: ${errors.map((e) => `${e.path || '/'}: ${e.message}`).join('; ')}`);
  },

  'log-question'(argv) {
    const { pos, flags } = parse(argv);
    const state = loadState();
    if (!AREA_IDS.includes(pos[0])) fail(EXIT.invalid, `Unknown area "${pos[0]}". Areas: ${AREA_IDS.join(', ')}.`);
    if (state.question_budget !== null && questionCount(state) >= state.question_budget) {
      process.stdout.write('budget reached\n');
      process.exit(EXIT.budget);
    }
    appendTurn(state, { kind: 'question', area: pos[0], question: flags.question, recommended: flags.recommended });
    save(state);
  },

  'log-stop-offer'(argv) {
    const { flags } = parse(argv);
    const state = loadState();
    appendTurn(state, { kind: 'stop_offer', area: 'stop', question: flags.question, recommended: flags.recommended });
    save(state);
  },

  next() {
    const state = loadState();
    const open = ASKING_ORDER.find((id) => state.areas.find((a) => a.id === id).state === 'open');
    process.stdout.write(`${open ?? 'none'}\n`);
  },

  answer(argv) {
    const { pos, flags } = parse(argv, ['accepted'], ['decision', 'test']);
    const state = loadState();
    const area = state.areas.find((a) => a.id === pos[0]);
    if (!area) fail(EXIT.invalid, `Unknown area "${pos[0]}". Areas: ${AREA_IDS.join(', ')}.`);
    if (!AREA_STATES.includes(flags.state)) fail(EXIT.invalid, `--state must be one of ${AREA_STATES.join(', ')}.`);
    if (flags.state === 'not_applicable' && !flags.reason) fail(EXIT.invalid, 'not_applicable needs --reason "<one line>".');
    if (['clear', 'assumed'].includes(flags.state) && !flags.summary) fail(EXIT.invalid, `${flags.state} needs --summary "<text>".`);

    area.state = flags.state;
    if (flags.summary !== undefined) area.summary = flags.summary;
    area.reason = flags.state === 'not_applicable' ? flags.reason : null;
    for (const d of flags.decision) if (!area.decision_ids.includes(d)) area.decision_ids.push(d);
    for (const t of flags.test) if (!area.test_ids.includes(t)) area.test_ids.push(t);

    if (flags.answer !== undefined) {
      const turn = state.history.findLast((t) => (t.kind ?? 'question') === 'question' && t.area === area.id && t.answer === null);
      if (!turn) fail(EXIT.invalid, `No unanswered question for "${area.id}" to attach --answer to.`);
      turn.answer = flags.answer;
      turn.accepted_recommendation = Boolean(flags.accepted);
    }
    if (state.stop_reason === null && state.areas.every((a) => a.state !== 'open')) state.stop_reason = 'complete';
    save(state);
  },

  'assume-rest'() {
    const state = loadState();
    const assumed = state.areas.filter((a) => a.state === 'open');
    for (const a of assumed) a.state = 'assumed';
    state.stop_reason = 'user_stopped';
    save(state);
    process.stdout.write(assumed.length ? `${assumed.map((a) => a.id).join('\n')}\n` : 'none\n');
  },

  approve() {
    const state = loadState();
    const open = state.areas.filter((a) => a.state === 'open').map((a) => a.id);
    if (open.length) fail(EXIT.invalid, `Cannot approve: still open: ${open.join(', ')}.`);
    state.approved_at = new Date().toISOString();
    save(state);
  },

  budget(argv) {
    if (argv[0] !== 'off') fail(EXIT.invalid, 'Usage: budget off');
    const state = loadState();
    state.question_budget = null;
    save(state);
  },
};

const [name, ...rest] = process.argv.slice(2);
if (!commands[name]) fail(EXIT.invalid, `Unknown subcommand "${name ?? ''}". Known: ${Object.keys(commands).join(', ')}.`);
commands[name](rest);
