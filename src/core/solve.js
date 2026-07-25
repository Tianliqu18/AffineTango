/**
 * Two-phase Tango solver.
 *
 *   phase 1  build [A | b] over F2, reduce to RREF, detect inconsistency,
 *            read off every cell the row space pins to a constant
 *   phase 2  seed those cells and backtrack over what is left, pruning with
 *            exact cardinality and no-three-in-a-row
 *
 * Phase 1 never proves uniqueness on its own, since uniqueness depends
 * entirely on the two rules it cannot express. It shrinks the search space; it
 * does not replace the search. (If elimination alone finished the job we would
 * have a polynomial-time algorithm for an NP-complete problem.)
 */

import { N, NV, UNKNOWN, rowOf, colOf, parseGrid, cloneGrid } from './encode.js';
import { Trace } from './trace.js';
import { buildRows, reduce } from './gf2.js';
import { search } from './search.js';

export function solve(gridInput, clues = [], { limit = 2, trace: wantTrace = false } = {}) {
  const trace = wantTrace ? new Trace(true) : null;
  const grid = parseGrid(gridInput);

  const rows = buildRows(grid, clues, trace);
  const linear = reduce(rows, trace);

  if (!linear.consistent) {
    return {
      consistent: false,
      rank: linear.rank,
      freeDim: linear.freeDim,
      pins: {},
      solutions: [],
      trace,
    };
  }

  const seeded = cloneGrid(grid);
  for (const [cellStr, value] of Object.entries(linear.pins)) {
    const cell = Number(cellStr);
    seeded[rowOf(cell)][colOf(cell)] = value;
  }

  const solutions = search(seeded, clues, { limit, trace });

  if (trace) {
    trace.push('done', {
      consistent: true,
      rank: linear.rank,
      freeDim: linear.freeDim,
      solutionCount: solutions.length,
    });
  }

  return {
    consistent: true,
    rank: linear.rank,
    freeDim: linear.freeDim,
    pins: linear.pins,
    seeded,
    solutions,
    trace,
  };
}

export { N, NV, UNKNOWN };
export { formatGrid, parseGrid, emptyGrid } from './encode.js';
