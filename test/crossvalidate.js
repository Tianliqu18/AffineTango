/** Compare the JS solver against the Python reference on generated cases. */

import { readFileSync } from 'node:fs';
import { solve } from '../src/core/solve.js';

const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));

const LIMIT = 3;
let pass = 0;
const failures = [];

function sameGrids(a, b) {
  if (a.length !== b.length) return false;
  return a.every((row, i) => row.length === b[i].length && row.every((v, j) => v === b[i][j]));
}

function samePins(a, b) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => k === kb[i] && Number(a[k]) === Number(b[k]));
}

for (const tc of cases) {
  const got = solve(tc.givens, tc.clues, { limit: LIMIT });
  const want = tc.expected;
  const problems = [];

  if (got.consistent !== want.consistent) {
    problems.push(`consistent ${got.consistent} != ${want.consistent}`);
  }

  if (want.consistent && got.consistent) {
    if (got.rank !== want.rank) problems.push(`rank ${got.rank} != ${want.rank}`);
    if (got.freeDim !== want.freeDim) problems.push(`freeDim ${got.freeDim} != ${want.freeDim}`);
    if (!samePins(got.pins, want.pins)) {
      problems.push(`pins ${JSON.stringify(got.pins)} != ${JSON.stringify(want.pins)}`);
    }
    if (got.solutions.length !== want.solutions.length) {
      problems.push(`solutionCount ${got.solutions.length} != ${want.solutions.length}`);
    } else {
      for (let i = 0; i < got.solutions.length; i++) {
        if (!sameGrids(got.solutions[i], want.solutions[i])) {
          problems.push(`solution ${i} differs`);
          break;
        }
      }
    }
  }

  if (problems.length === 0) pass++;
  else failures.push({ name: tc.name, problems });
}

console.log(`cross-validation: ${pass}/${cases.length} passed`);
if (failures.length) {
  console.log(`\nfirst ${Math.min(10, failures.length)} failures:`);
  for (const f of failures.slice(0, 10)) console.log(`  ${f.name}: ${f.problems.join('; ')}`);
  process.exit(1);
}

// Structural checks the Python does not assert directly.
const bare = solve(Array.from({ length: 6 }, () => new Array(6).fill(-1)), []);
console.log(`\nbare parity subsystem: rank ${bare.rank}, freeDim ${bare.freeDim} (expect 11 / 25)`);
if (bare.rank !== 11 || bare.freeDim !== 25) {
  console.log('  FAIL: rank-11 result does not hold');
  process.exit(1);
}

// Trace sanity: events are emitted, and a pinned cell cites real equations.
const board = cases.find((c) => c.name === 's0_k22_g6');
const traced = solve(board.givens, board.clues, { limit: 1, trace: true });
const hist = traced.trace.histogram();
console.log('\ntrace histogram for s0_k22_g6:');
for (const [k, v] of Object.entries(hist)) console.log(`  ${k}: ${v}`);

const pinEvents = traced.trace.events.filter((e) => e.type === 'cell_pinned');
const bad = pinEvents.filter((e) => !Array.isArray(e.derivedFrom) || e.derivedFrom.length === 0);
if (bad.length) {
  console.log('  FAIL: pinned cells missing provenance');
  process.exit(1);
}
console.log(`  every pinned cell cites at least one source equation: ok`);
console.log('\nall checks passed');
