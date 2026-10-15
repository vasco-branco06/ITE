#!/usr/bin/env node
// ITE command-line entry point. Subcommands and exit codes: specs/commands.md in the ITE spec.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREA_IDS, ASKING_ORDER, AREA_STATES, newState, readState, writeState, stateExists, questionCount } from './lib/state.mjs';

const EXIT = { ok: 0, exists: 3, invalid: 4, budget: 5 };
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

const commands = {
  '--version'() {
    const manifest = join(dirname(fileURLToPath(import.meta.url)), '..', '.claude-plugin', 'plugin.json');
    process.stdout.write(`${JSON.parse(readFileSync(manifest, 'utf8')).version}\n`);
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
