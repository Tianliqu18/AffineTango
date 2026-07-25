/**
 * Board encoding.
 *
 * sun = 0, moon = 1, unknown = -1.
 * Cells are flattened row-major, so cell (r, c) is index r * N + c.
 */

export const N = 6;
export const NV = N * N;   // 36 variables
export const RHS = NV;     // index of the right-hand side inside a row vector
export const WIDTH = NV + 1;

export const SUN = 0;
export const MOON = 1;
export const UNKNOWN = -1;

export const varIndex = (r, c) => r * N + c;
export const rowOf = (i) => Math.floor(i / N);
export const colOf = (i) => i % N;

/** Empty 6x6 grid of UNKNOWN. */
export function emptyGrid() {
  return Array.from({ length: N }, () => new Array(N).fill(UNKNOWN));
}

/** Deep copy a grid. */
export function cloneGrid(g) {
  return g.map((row) => row.slice());
}

/**
 * Accepts a 6x6 array of {0,1,-1}, or a 6-string array using S/M/. characters.
 * Returns a normalised numeric grid.
 */
export function parseGrid(input) {
  if (typeof input[0] === 'string') {
    return input.map((line) =>
      Array.from(line.trim()).map((ch) => {
        if (ch === 'S' || ch === 's' || ch === '0') return SUN;
        if (ch === 'M' || ch === 'm' || ch === '1') return MOON;
        return UNKNOWN;
      })
    );
  }
  return input.map((row) => row.slice());
}

const SYM = { [SUN]: 'S', [MOON]: 'M', [UNKNOWN]: '.' };

export function formatGrid(grid) {
  return grid.map((row) => row.map((v) => SYM[v]).join(' ')).join('\n');
}

/** Grid to flat vector of {0,1,-1}. */
export function gridToVector(grid) {
  const v = new Int8Array(NV);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) v[varIndex(r, c)] = grid[r][c];
  return v;
}

/** Flat vector back to grid. */
export function vectorToGrid(v) {
  const g = emptyGrid();
  for (let i = 0; i < NV; i++) g[rowOf(i)][colOf(i)] = v[i];
  return g;
}

/**
 * A clue relates two orthogonally adjacent cells.
 *   type '=' : the cells match
 *   type 'x' : the cells differ
 * Accepts either {a, b, type} with flat indices or {r1, c1, r2, c2, type}.
 */
export function normaliseClue(clue) {
  if (clue.a !== undefined) return { a: clue.a, b: clue.b, type: clue.type };
  return {
    a: varIndex(clue.r1, clue.c1),
    b: varIndex(clue.r2, clue.c2),
    type: clue.type,
  };
}
