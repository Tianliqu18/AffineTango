/**
 * The nonlinear phase.
 *
 * Two of Tango's rules cannot be written as a^T x = b and so survive
 * elimination untouched:
 *
 *   exact cardinality  the parity equations only see weight mod 2, so weights
 *                      1, 3 and 5 are indistinguishable to them
 *   no three in a row  a disjunction, not an equation; it carves an arbitrary
 *                      subset out of the space rather than a subspace
 *
 * So phase 1 hands us a reduced affine subspace and this searches it. Cell
 * order and value order deliberately mirror the Python reference so the two
 * implementations enumerate solutions in the same sequence.
 */

import { N, UNKNOWN, varIndex, rowOf, colOf, cloneGrid, normaliseClue } from './encode.js';
import { PHASE } from './trace.js';

function buildClueLookup(clues) {
  const map = new Map();
  for (const raw of clues) {
    const { a, b, type } = normaliseClue(raw);
    map.set(a * 100 + b, type);
    map.set(b * 100 + a, type);
  }
  return map;
}

function countIn(values, target) {
  let n = 0;
  for (const v of values) if (v === target) n++;
  return n;
}

/**
 * Check the cell just written at (r, c) against the rules the linear phase
 * cannot see, plus the clues. Returns null if fine, otherwise a short reason.
 */
function violation(grid, r, c, clueMap) {
  const row = grid[r];
  if (countIn(row, 0) > 3 || countIn(row, 1) > 3) return 'row_count';

  const col = [];
  for (let i = 0; i < N; i++) col.push(grid[i][c]);
  if (countIn(col, 0) > 3 || countIn(col, 1) > 3) return 'col_count';

  for (let cc = Math.max(0, c - 2); cc <= Math.min(N - 3, c); cc++) {
    const a = grid[r][cc], b = grid[r][cc + 1], d = grid[r][cc + 2];
    if (a !== UNKNOWN && a === b && b === d) return 'triple_row';
  }
  for (let rr = Math.max(0, r - 2); rr <= Math.min(N - 3, r); rr++) {
    const a = grid[rr][c], b = grid[rr + 1][c], d = grid[rr + 2][c];
    if (a !== UNKNOWN && a === b && b === d) return 'triple_col';
  }

  const here = varIndex(r, c);
  const neighbours = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
  for (const [nr, nc] of neighbours) {
    if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
    if (grid[nr][nc] === UNKNOWN) continue;
    const type = clueMap.get(here * 100 + varIndex(nr, nc));
    if (type === undefined) continue;
    const same = grid[r][c] === grid[nr][nc];
    if (type === '=' && !same) return 'clue_eq';
    if (type === 'x' && same) return 'clue_x';
  }

  return null;
}

/**
 * Backtrack over the cells the linear phase left free.
 * `grid` should already be seeded with givens and pinned cells.
 */
export function search(grid, clues, { limit = 2, trace = null } = {}) {
  if (trace) trace.push('phase', { phase: PHASE.SEARCH });

  const clueMap = buildClueLookup(clues);
  const work = cloneGrid(grid);
  const solutions = [];

  const cells = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) cells.push([r, c]);

  function bt(i) {
    if (solutions.length >= limit) return;
    if (i === cells.length) {
      solutions.push(cloneGrid(work));
      if (trace) trace.push('solution', { board: cloneGrid(work) });
      return;
    }
    const [r, c] = cells[i];
    const cell = varIndex(r, c);

    if (work[r][c] !== UNKNOWN) {
      if (violation(work, r, c, clueMap) === null) bt(i + 1);
      return;
    }

    for (const v of [0, 1]) {
      work[r][c] = v;
      if (trace) trace.push('guess', { cell, value: v });
      const reason = violation(work, r, c, clueMap);
      if (reason === null) {
        bt(i + 1);
      } else if (trace) {
        trace.push('reject', { cell, value: v, reason });
      }
      // Once we have enough solutions, stop unwinding. The enumeration is
      // finished either way, and leaving the grid populated means the trace
      // ends on the solved board rather than tearing it back down.
      if (solutions.length >= limit) return;
      work[r][c] = UNKNOWN;
    }
    if (trace) trace.push('backtrack', { cell });
  }

  bt(0);
  return solutions;
}
