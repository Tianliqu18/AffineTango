/**
 * Content script entry point. Bundled by esbuild since Chrome content scripts
 * don't support bare `import` (see CLAUDE.md); everything below is bundled
 * into a single IIFE at dist/content.js.
 *
 * Draws the answer over blank cells without writing anything back, and
 * publishes the current puzzle to chrome.storage.local for the popup and
 * the live-harness tab. Autofill only happens on explicit request (the
 * popup's "Auto-solve" button, via the AUTO_SOLVE message below) -- never
 * automatically, on the same principle CLAUDE.md already flags for
 * LinkedIn (silently changing what a player actually solved themselves).
 *
 * Site-specific DOM knowledge stays inside each adapter; this file only
 * uses the common surface every adapter exposes (readBoard/matches, plus
 * boardEl/cellElement/isFilled/writeCell on the object readBoard resolves
 * to), so adding a new site never means touching this file.
 */

import { solve } from '../core/solve.js';
import { UNKNOWN, vectorToGrid } from '../core/encode.js';
import { startOverlay } from './overlay.js';
import * as eightTango from '../adapters/8tango.js';
import * as linkedin from '../adapters/linkedin.js';

const ADAPTERS = [eightTango, linkedin];

async function run() {
  const adapter = ADAPTERS.find((a) => a.matches(location.hostname));
  if (!adapter) return;

  let stopOverlay = null;
  let signature = null;
  let latest = null; // { board, grid, solution } for the most recent solve

  // Re-solves only when the puzzle itself changed (different givens/clues),
  // not on every cell fill. Without this, starting a new puzzle without a
  // page reload (e.g. 8tango's in-app "+" button) leaves the overlay
  // showing the *previous* puzzle's solution mapped onto the new puzzle's
  // cells -- wrong values, apparently-violated `=`/`x` clues, cells that
  // should be marked but aren't.
  async function resolveIfChanged() {
    const board = await adapter.readBoard();
    const sig = JSON.stringify({ clues: board.clues, givens: Array.from(board.givens) });
    if (sig === signature) return;
    signature = sig;

    stopOverlay?.();
    stopOverlay = null;
    latest = null;

    const grid = vectorToGrid(board.givens);
    const solved = solve(grid, board.clues, { limit: 2 });

    if (!solved.consistent || solved.solutions.length !== 1) {
      console.warn('[affine-tango] not uniquely solvable from current read:',
                   { consistent: solved.consistent, solutions: solved.solutions.length });
      chrome.storage.local.remove('affineTangoPuzzle');
      return;
    }

    const [solution] = solved.solutions;
    latest = { board, grid, solution };

    // Re-derived on every board mutation, so a cell's mark drops out the
    // moment the player fills it in rather than the whole overlay vanishing.
    function getMarks() {
      const marks = [];
      for (let y = 0; y < 6; y++) {
        for (let x = 0; x < 6; x++) {
          const index = y * 6 + x;
          if (grid[y][x] !== UNKNOWN) continue;
          if (board.isFilled(index)) continue;
          const cellEl = board.cellElement(index);
          if (cellEl) marks.push({ cellEl, value: solution[y][x] });
        }
      }
      return marks;
    }

    stopOverlay = startOverlay(board.boardEl, getMarks);

    chrome.storage.local.set({
      affineTangoPuzzle: {
        givens: grid,
        clues: board.clues,
        rank: solved.rank,
        freeDim: solved.freeDim,
        blankCount: getMarks().length,
      },
    });

    console.log(`[affine-tango] solved (rank ${solved.rank}, freeDim ${solved.freeDim}), watching board`);
  }

  await resolveIfChanged();

  new MutationObserver(() => resolveIfChanged())
    .observe(latest ? latest.board.boardEl : document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'AUTO_SOLVE') return false;
    if (!latest) { sendResponse({ ok: false, reason: 'not solved' }); return false; }

    (async () => {
      const { board, grid, solution } = latest;

      // LinkedIn's board ignores untrusted content-script clicks, so its
      // adapter exposes a batched, debugger-driven write path instead of
      // the plain per-cell writeCell 8tango uses.
      if (board.writeCellsTrusted) {
        const cells = [];
        for (let y = 0; y < 6; y++) {
          for (let x = 0; x < 6; x++) {
            if (grid[y][x] !== UNKNOWN) continue;
            cells.push({ index: y * 6 + x, value: solution[y][x] });
          }
        }
        try {
          const filled = await board.writeCellsTrusted(cells);
          sendResponse({ ok: true, filled });
        } catch (err) {
          sendResponse({ ok: false, reason: String(err?.message ?? err) });
        }
        return;
      }

      let filled = 0;
      for (let y = 0; y < 6; y++) {
        for (let x = 0; x < 6; x++) {
          if (grid[y][x] !== UNKNOWN) continue;
          board.writeCell(y * 6 + x, solution[y][x]);
          filled++;
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
      }
      sendResponse({ ok: true, filled });
    })();

    return true; // keep the message channel open for the async sendResponse
  });
}

run();
