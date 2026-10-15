// The build gate: rule 06 section 6.1 (conditions) and 6.2 (the fresh-session commands).
import { report } from './check.mjs';
import { stateExists, readState } from './state.mjs';

const START = '/ite:start';
const COMPILE = '/ite:compile';
const BUILD_PROMPT = 'claude "Read CLAUDE.md, then follow PLAN.md from the first task that is not done."';
// The gate reports these coverage problems itself, with a clearer fix, so the checker's copy is skipped.
const COVERED = new Set(['E-COVERAGE-OPEN', 'E-ASSUMPTION-UNTESTED']);

// Returns the blockers ({ message, command }) for an absolute folder path; an empty list means pass.
export function gate(folder, version) {
  if (!stateExists(folder)) return [{ message: 'No .ite/coverage.json: the interview has not started here.', command: START }];
  let cov;
  try {
    cov = readState(folder);
  } catch (e) {
    return [{ message: `.ite/coverage.json could not be read: ${e.message}`, command: START }];
  }

  const blockers = [];
  for (const a of Array.isArray(cov.areas) ? cov.areas : []) {
    if (a.state === 'open') blockers.push({ message: `Area ${a.id} is still open.`, command: START });
    if (a.state === 'assumed' && !(a.decision_ids ?? []).length) blockers.push({ message: `Area ${a.id} is assumed but names no D- assumption.`, command: START });
    if (a.state === 'assumed' && !(a.test_ids ?? []).length) blockers.push({ message: `Area ${a.id} is assumed but has no linked T- test.`, command: START });
    if (a.state === 'not_applicable' && !a.reason?.trim()) blockers.push({ message: `Area ${a.id} is not_applicable but has no reason.`, command: START });
  }
  if (!cov.approved_at) blockers.push({ message: 'The tests are not approved yet.', command: START });

  for (const f of report(folder, version).findings) {
    if (f.severity !== 'error' || COVERED.has(f.code)) continue;
    blockers.push({ message: `${f.file}${f.line ? `:${f.line}` : ''} ${f.code}: ${f.message} ${f.fix}`, command: COMPILE });
  }
  return blockers;
}

export function formatGate(folder, blockers) {
  if (blockers.length) {
    const lines = blockers.map((b, i) => `${i + 1}. ${b.message} Fix: ${b.command}`);
    return `Build blocked, ${blockers.length} to fix:\n${lines.join('\n')}\n`;
  }
  return [
    'Build gate passed. Build in a new session:',
    '',
    '# PowerShell',
    `cd "${folder}"; ${BUILD_PROMPT}`,
    '',
    '# bash / Git Bash',
    `cd "${folder}" && ${BUILD_PROMPT}`,
    '',
  ].join('\n');
}
