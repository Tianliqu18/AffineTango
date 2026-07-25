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
import { startOverlay } from './overlay.js';
import * as adapter from '../adapters/8tango.js';

async function run() {
  if (!adapter.matches(location.hostname)) return;

  const boardEl = document.querySelector('.game-board');
  let stopOverlay = null;
  let signature = null;

  // Re-solves only when the puzzle itself changed (different givens/clues),
  // not on every cell fill. Without this, starting a new puzzle via the
  // in-app "+" button (no page reload) leaves the overlay showing the
  // *previous* puzzle's solution mapped onto the new puzzle's cells --
  // wrong values, apparently-violated `=`/`x` clues, cells that should be
  // marked but aren't.
  async function resolveIfChanged() {
    const board = await adapter.readBoard();
    const sig = JSON.stringify({ clues: board.clues, givens: Array.from(board.givens) });
    if (sig === signature) return;
    signature = sig;

    stopOverlay?.();
    stopOverlay = null;

    const grid = vectorToGrid(board.givens);
    const solved = solve(grid, board.clues, { limit: 2 });

    if (!solved.consistent || solved.solutions.length !== 1) {
      console.warn('[affine-tango] not uniquely solvable from current read:',
                   { consistent: solved.consistent, solutions: solved.solutions.length });
      return;
    }

    const [solution] = solved.solutions;

    // Re-derived on every board mutation, so a cell's mark drops out the
    // moment the player fills it in rather than the whole overlay vanishing.
    function getMarks() {
      const marks = [];
      for (let y = 0; y < 6; y++) {
        for (let x = 0; x < 6; x++) {
          if (grid[y][x] !== UNKNOWN) continue;
          const cellEl = boardEl.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
          if (!cellEl) continue;
          if (cellEl.classList.contains('sun') || cellEl.classList.contains('moon')) continue;
          marks.push({ cellEl, value: solution[y][x] });
        }
      }
      return marks;
    }

    stopOverlay = startOverlay(boardEl, getMarks);
    console.log(`[affine-tango] solved (rank ${solved.rank}, freeDim ${solved.freeDim}), watching board`);
  }

  await resolveIfChanged();

  new MutationObserver(() => resolveIfChanged())
    .observe(boardEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}

run();
