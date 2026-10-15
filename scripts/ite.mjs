#!/usr/bin/env node
// ITE command-line entry point. Subcommands and exit codes: specs/commands.md in the ITE spec.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREA_IDS, newState, readState, writeState, stateExists, questionCount } from './lib/state.mjs';

const EXIT = { ok: 0, exists: 3, invalid: 4, budget: 5 };
const folder = process.cwd();

// Splits argv into positionals and --flags (a flag takes the next value unless it is boolean).
function parse(argv, booleans = []) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) pos.push(a);
    else if (booleans.includes(a.slice(2))) flags[a.slice(2)] = true;
    else flags[a.slice(2)] = argv[++i];
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
