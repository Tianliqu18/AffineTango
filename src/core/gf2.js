/**
 * The linear phase.
 *
 * Every rule that can be written as a^T x = b over F2 goes into one system
 * A x = b, which we reduce to RREF. Two things come out: whether the puzzle is
 * consistent at all, and which cells the row space pins to a constant.
 *
 * Row representation: a Uint8Array of length 37. Indices 0..35 are the
 * coefficients on cells 0..35, index 36 is the right-hand side. Over F2,
 * adding two equations is XOR, so elimination is elementwise XOR.
 *
 * Why bytes rather than a packed integer: JavaScript's bitwise operators
 * coerce to 32-bit signed ints, so a 37-bit row silently truncates and you get
 * a solver that is confidently wrong. BigInt would be correct but awkward to
 * render bit by bit, and at this size the byte array costs nothing while
 * mapping one-to-one onto the matrix visualisation.
 *
 * Each row also carries a provenance vector over the original equation ids, so
 * when a cell gets pinned we can say exactly which constraints combined to
 * force it. That is what the animation draws a trail back to.
 */

import { N, NV, RHS, WIDTH, varIndex, normaliseClue, UNKNOWN } from './encode.js';
import { BLOCK, PHASE } from './trace.js';

function makeRow(block, meta) {
  return { v: new Uint8Array(WIDTH), prov: null, block, meta };
}

function xorInto(target, source) {
  for (let j = 0; j < WIDTH; j++) target.v[j] ^= source.v[j];
  const n = target.prov.length;
  for (let j = 0; j < n; j++) target.prov[j] ^= source.prov[j];
}

function coefPopcount(row) {
  let n = 0;
  for (let j = 0; j < NV; j++) n += row.v[j];
  return n;
}

function provList(row) {
  const out = [];
  for (let j = 0; j < row.prov.length; j++) if (row.prov[j]) out.push(j);
  return out;
}

/**
 * Assemble [A | b].
 *
 * Blocks, in order:
 *   6 row-parity rows      indicator of a grid row, rhs 1 (three moons is odd)
 *   6 column-parity rows   same, transposed
 *   one row per clue       exactly two 1s; rhs 0 for '=', 1 for 'x'
 *   one row per given      a single basis vector
 */
export function buildRows(grid, clues, trace) {
  const rows = [];

  for (let r = 0; r < N; r++) {
    const row = makeRow(BLOCK.ROW_PARITY, { line: r });
    for (let c = 0; c < N; c++) row.v[varIndex(r, c)] = 1;
    row.v[RHS] = 1;
    rows.push(row);
  }

  for (let c = 0; c < N; c++) {
    const row = makeRow(BLOCK.COL_PARITY, { line: c });
    for (let r = 0; r < N; r++) row.v[varIndex(r, c)] = 1;
    row.v[RHS] = 1;
    rows.push(row);
  }

  for (const raw of clues) {
    const { a, b, type } = normaliseClue(raw);
    const row = makeRow(BLOCK.CLUE, { a, b, type });
    row.v[a] ^= 1;
    row.v[b] ^= 1;
    row.v[RHS] = type === 'x' ? 1 : 0;
    rows.push(row);
  }

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const g = grid[r][c];
      if (g === UNKNOWN) continue;
      const i = varIndex(r, c);
      const row = makeRow(BLOCK.GIVEN, { cell: i });
      row.v[i] = 1;
      row.v[RHS] = g === 1 ? 1 : 0;
      rows.push(row);
    }
  }

  const m = rows.length;
  rows.forEach((row, i) => {
    row.id = i;
    row.prov = new Uint8Array(m);
    row.prov[i] = 1;
  });

  if (trace) {
    trace.push('phase', { phase: PHASE.ASSEMBLE });
    rows.forEach((row, i) =>
      trace.push('row_added', {
        block: row.block,
        row: i,
        meta: row.meta,
        bits: Array.from(row.v.subarray(0, NV)),
        rhs: row.v[RHS],
      })
    );
  }

  return rows;
}

/**
 * Gauss-Jordan to reduced row echelon form over F2.
 *
 * Returns { consistent, rank, freeDim, pins, pivotCols, rows }.
 * pins maps cell index to its forced value.
 */
export function reduce(rows, trace) {
  if (trace) trace.push('phase', { phase: PHASE.ELIMINATE });

  const m = rows.length;
  let r = 0;
  const pivotCols = [];

  for (let col = 0; col < NV && r < m; col++) {
    let p = -1;
    for (let i = r; i < m; i++) {
      if (rows[i].v[col]) { p = i; break; }
    }
    if (p === -1) continue;

    if (p !== r) {
      [rows[p], rows[r]] = [rows[r], rows[p]];
      if (trace) trace.push('row_swap', { a: r, b: p });
    }
    if (trace) trace.push('pivot_chosen', { row: r, col });

    for (let i = 0; i < m; i++) {
      if (i !== r && rows[i].v[col]) {
        xorInto(rows[i], rows[r]);
        if (trace) trace.push('row_xor', { target: i, source: r });
      }
    }

    pivotCols.push(col);
    r++;
  }

  const rank = r;

  // Any surviving row with zero coefficients but rhs 1 asserts 0 = 1.
  for (let i = rank; i < m; i++) {
    if (rows[i].v[RHS] === 1) {
      if (trace) {
        trace.push('contradiction', { row: i, derivedFrom: provList(rows[i]) });
        trace.push('done', { consistent: false, rank, freeDim: NV - rank, solutionCount: 0 });
      }
      return { consistent: false, rank, freeDim: NV - rank, pins: {}, pivotCols, rows };
    }
  }

  // A pivot row whose only variable is its own pivot column pins that cell.
  const pins = {};
  for (let i = 0; i < rank; i++) {
    if (coefPopcount(rows[i]) === 1) {
      const cell = pivotCols[i];
      const value = rows[i].v[RHS];
      pins[cell] = value;
      if (trace) {
        trace.push('cell_pinned', { cell, value, derivedFrom: provList(rows[i]) });
      }
    }
  }

  const freeDim = NV - rank;
  if (trace) {
    trace.push('rank_update', { rank, freeDim, pinnedCount: Object.keys(pins).length });
  }

  return { consistent: true, rank, freeDim, pins, pivotCols, rows };
}
