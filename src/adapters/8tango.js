/**
 * Adapter for 8tango.com's Free Play mode.
 *
 * The site keeps its whole game state on `window.game`, a plain reactive
 * object the React tree renders from. That's a far more reliable read than
 * parsing the DOM (which the "not highlightable" clue markers turned out to
 * be `position: absolute` siblings of the cells, placed by pixel offset, not
 * by row/col) -- except content scripts run in an isolated JS world and
 * can't see page globals like `window.game` at all, only the shared DOM. So
 * reads go through 8tango-bridge.js (runs in the MAIN world per manifest.json)
 * over a CustomEvent; see that file for the wire format.
 *
 * Writes don't need the bridge: a cell's `.click()` mutates `window.game`
 * synchronously even though the resulting DOM re-render lags a tick, and the
 * site's handler doesn't check `event.isTrusted`, so a plain `.click()` from
 * the content script drives it exactly like a real click. The cell's current
 * value for computing the click count comes from its DOM class instead of
 * `window.game`, since the DOM is what's actually shared across worlds.
 *
 * board.spaces[y][x]     0 blank, 1 sun, 2 moon
 * game.prefilled[y][x]   true for the puzzle's original givens
 * board.modifiers        [{ kind, a: {x,y}, b: {x,y} }]
 *                         kind 1 '=' (same), kind 2 'x' (opposite)
 *
 * Only BOARD_SIZE 6 is handled; other sizes are Journey-mode levels the
 * solver (hardcoded to 6x6) doesn't support.
 */

import { NV, SUN, MOON, UNKNOWN, varIndex, rowOf, colOf } from '../core/encode.js';

const CLUE_SAME = 1;

export function matches(hostname) {
  return hostname === '8tango.com' || hostname === 'www.8tango.com';
}

function boardReady(snapshot) {
  return snapshot?.spaces?.length === 6
    && snapshot.boardSize === 6
    && Array.isArray(snapshot.modifiers)
    && Array.isArray(snapshot.prefilled) && snapshot.prefilled.length === 6;
}

function requestBoardSnapshot() {
  return new Promise((resolve) => {
    window.addEventListener(
      'affine-tango:board',
      (event) => resolve(event.detail),
      { once: true }
    );
    window.dispatchEvent(new Event('affine-tango:request-board'));
  });
}

async function waitForBoard() {
  for (;;) {
    const snapshot = await requestBoardSnapshot();
    if (boardReady(snapshot)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function cellElement(x, y) {
  return document.querySelector(`.game-board .cell[data-x="${x}"][data-y="${y}"]`);
}

// The current value lives on the DOM class rather than window.game, since
// only the DOM crosses the isolated/main world boundary.
function cellSpaceValue(cell) {
  if (cell.classList.contains('sun')) return 1;
  if (cell.classList.contains('moon')) return 2;
  return 0;
}

export async function readBoard() {
  const { spaces, modifiers, prefilled } = await waitForBoard();

  const givens = new Int8Array(NV).fill(UNKNOWN);
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      if (!prefilled[y][x]) continue;
      givens[varIndex(y, x)] = spaces[y][x] === 1 ? SUN : MOON;
    }
  }

  const clues = modifiers.map(({ kind, a, b }) => ({
    a: varIndex(a.y, a.x),
    b: varIndex(b.y, b.x),
    type: kind === CLUE_SAME ? '=' : 'x',
  }));

  return {
    givens,
    clues,
    writeCell(index, value) {
      const y = rowOf(index);
      const x = colOf(index);
      const cell = cellElement(x, y);
      if (!cell) return;
      const current = cellSpaceValue(cell);
      const target = value === SUN ? 1 : 2;
      const clicks = (target - current + 3) % 3;
      for (let i = 0; i < clicks; i++) cell.click();
    },
  };
}
