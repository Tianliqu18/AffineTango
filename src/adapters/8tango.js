/**
 * Adapter for 8tango.com's Free Play mode.
 *
 * The site keeps its whole game state on `window.game`, a plain reactive
 * object the React tree renders from. That's a far more reliable read than
 * parsing the DOM (which the "not highlightable" clue markers turned out to
 * be `position: absolute` siblings of the cells, placed by pixel offset, not
 * by row/col), and it's also how we write: a cell's `.click()` mutates
 * `window.game` synchronously even though the resulting DOM re-render lags a
 * tick, and the site's handler doesn't check `event.isTrusted`, so a plain
 * `.click()` from the content script drives it exactly like a real click.
 *
 * window.game.board.spaces[y][x]  0 blank, 1 sun, 2 moon
 * window.game.prefilled[y][x]     true for the puzzle's original givens
 *                                 (top-level on `game`, not nested in `board`)
 * window.game.board.modifiers     [{ kind, a: {x,y}, b: {x,y} }]
 *                                 kind 1 '=' (same), kind 2 'x' (opposite)
 *
 * Only BOARD_SIZE 6 is handled; other sizes are Journey-mode levels the
 * solver (hardcoded to 6x6) doesn't support.
 */

import { NV, SUN, MOON, UNKNOWN, varIndex, rowOf, colOf } from '../core/encode.js';

const SPACE_SUN = 1;
const SPACE_MOON = 2;

const CLUE_SAME = 1;

export function matches(hostname) {
  return hostname === '8tango.com' || hostname === 'www.8tango.com';
}

function boardReady() {
  return window.game?.board?.spaces?.length === 6 && window.game.BOARD_SIZE === 6;
}

function waitForBoard() {
  if (boardReady()) return Promise.resolve();
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (boardReady()) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function cellElement(x, y) {
  return document.querySelector(`.game-board .cell[data-x="${x}"][data-y="${y}"]`);
}

export async function readBoard() {
  await waitForBoard();
  const { spaces, modifiers } = window.game.board;
  const { prefilled } = window.game;

  const givens = new Int8Array(NV).fill(UNKNOWN);
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      if (!prefilled[y][x]) continue;
      givens[varIndex(y, x)] = spaces[y][x] === SPACE_SUN ? SUN : MOON;
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
      const current = window.game.board.spaces[y][x];
      const target = value === SUN ? SPACE_SUN : SPACE_MOON;
      const clicks = (target - current + 3) % 3;
      for (let i = 0; i < clicks; i++) cell.click();
    },
  };
}
