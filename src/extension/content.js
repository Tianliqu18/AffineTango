/**
 * Content script entry point. Bundled by esbuild since Chrome content scripts
 * don't support bare `import` (see CLAUDE.md); everything below is bundled
 * into a single IIFE at dist/content.js.
 *
 * Read-only for now: solves the board and draws the answer over blank cells
 * without writing anything back. Autofill (M4) reuses the same adapter's
 * `writeCell`, gated behind a toggle that doesn't exist yet.
 */

import { solve } from '../core/solve.js';
import { UNKNOWN, vectorToGrid } from '../core/encode.js';
import { renderOverlay } from './overlay.js';
import * as adapter from '../adapters/8tango.js';

async function main() {
  if (!adapter.matches(location.hostname)) return;

  const board = await adapter.readBoard();
  const grid = vectorToGrid(board.givens);
  const solved = solve(grid, board.clues, { limit: 2 });

  if (!solved.consistent || solved.solutions.length !== 1) {
    console.warn('[affine-tango] not uniquely solvable from current read:',
                 { consistent: solved.consistent, solutions: solved.solutions.length });
    return;
  }

  const boardEl = document.querySelector('.game-board');
  const [solution] = solved.solutions;
  const marks = [];
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      if (grid[y][x] !== UNKNOWN) continue;
      const cellEl = boardEl.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
      if (cellEl) marks.push({ cellEl, value: solution[y][x] });
    }
  }
  renderOverlay(boardEl, marks);

  console.log(`[affine-tango] solved, ${marks.length} cells overlaid`);
}

main();
