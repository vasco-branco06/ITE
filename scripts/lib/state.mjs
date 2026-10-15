// Coverage state (.ite/coverage.json, S-001): create, read, validate and write.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './validate.mjs';

// Rule 01 section 1.2, in table order (also the S-001 enum order).
export const AREA_IDS = ['goal', 'users', 'scope', 'inputs', 'outputs', 'integrations', 'security', 'stack', 'llm', 'errors', 'acceptance', 'done'];
export const QUICK_BUDGET = 5;

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas', 'coverage.schema.json');
const SCHEMA = JSON.parse(readFileSync(schemaPath, 'utf8'));

export const statePath = (folder) => join(folder, '.ite', 'coverage.json');

export function newState(idea, { lang = 'en', quick = false } = {}) {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    idea,
    language: lang,
    created_at: now,
    updated_at: now,
    approved_at: null,
    mode: 'scripted',
    question_budget: quick ? QUICK_BUDGET : null,
    areas: AREA_IDS.map((id) => ({ id, state: 'open', summary: null, decision_ids: [], test_ids: [], reason: null })),
    history: [],
    stop_reason: null,
  };
}

export function readState(folder) {
  return JSON.parse(readFileSync(statePath(folder), 'utf8').replace(/\r\n/g, '\n'));
}

// Validates against S-001 first; on any error nothing is written and the errors are returned.
export function writeState(folder, state) {
  const errors = validate(SCHEMA, state);
  if (errors.length) return errors;
  const file = statePath(folder);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, file);
  return [];
}

export const stateExists = (folder) => existsSync(statePath(folder));

// Turns whose kind is "question" or missing count against the budget.
export const questionCount = (state) => state.history.filter((t) => (t.kind ?? 'question') === 'question').length;
