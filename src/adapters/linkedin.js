/**
 * Adapter for linkedin.com/games/tango.
 *
 * Unlike 8tango.com, no window.<something>-style state global was found on
 * this page -- the board lives entirely in the DOM, keyed by data attributes
 * LinkedIn's own accessibility markup exposes. That also means no isolated/
 * main-world bridge is needed here (see src/adapters/8tango-bridge.js for
 * why 8tango needs one): content scripts share the DOM freely, just not
 * page-defined JS globals.
 *
 * Cells:  [data-cell-idx="N"], N = row*6+col (row-major). Confirmed by
 *         reading each cell's aria-describedby target, whose text is
 *         literally "Row R, Column C".
 *         Value: the aria-label ("Sun"/"Moon") of the cell's child <svg>;
 *         no matching svg means blank.
 * Givens: aria-disabled="true" on the cell div. Verified against a
 *         completed puzzle: feeding just the aria-disabled=true cells'
 *         values plus the clues below into solve() reproduced the actual
 *         completed board exactly as the unique solution.
 * Clues:  <svg data-testid="edge-cross"|"edge-equal">, nested inside one of
 *         the two cells it relates rather than positioned independently.
 *         Same geometry trick as 8tango's modifiers: nearest two cell
 *         centers to the marker's own bounding-rect center.
 *
 * writeCell is UNVERIFIED. Today's puzzle was already complete when this was
 * written (LinkedIn only drops one puzzle per day), so there was no blank
 * cell left to click. Cells have role="button" and tabindex="-1"; .click()
 * cycling blank -> sun -> moon -> blank is a guess based on how 8tango's
 * cells behave, not confirmed here. Check against tomorrow's fresh puzzle
 * before relying on this for autofill.
 */

import { NV, SUN, MOON, UNKNOWN } from '../core/encode.js';

export function matches(hostname) {
  return hostname === 'www.linkedin.com' || hostname === 'linkedin.com';
}

function cellElement(index) {
  return document.querySelector(`[data-cell-idx="${index}"]`);
}

function cellValue(cell) {
  const svg = cell.querySelector('svg[aria-label="Sun"], svg[aria-label="Moon"]');
  if (!svg) return UNKNOWN;
  return svg.getAttribute('aria-label') === 'Sun' ? SUN : MOON;
}

function boardReady() {
  return document.querySelectorAll('[data-cell-idx]').length === 36;
}

function waitForBoard() {
  if (boardReady()) return Promise.resolve();
  return new Promise((resolve) => {
    const id = setInterval(() => {
      if (boardReady()) {
        clearInterval(id);
        resolve();
      }
    }, 50);
  });
}

export async function readBoard() {
  await waitForBoard();
  const cells = [...document.querySelectorAll('[data-cell-idx]')];

  const givens = new Int8Array(NV).fill(UNKNOWN);
  for (const cell of cells) {
    if (cell.getAttribute('aria-disabled') !== 'true') continue;
    const idx = Number(cell.getAttribute('data-cell-idx'));
    givens[idx] = cellValue(cell);
  }

  const cellRects = cells.map((c) => {
    const r = c.getBoundingClientRect();
    return { idx: Number(c.getAttribute('data-cell-idx')), cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });
  const edgeEls = [...document.querySelectorAll('[data-testid="edge-cross"], [data-testid="edge-equal"]')];
  const clues = edgeEls.map((el) => {
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2, ey = r.top + r.height / 2;
    const [a, b] = cellRects
      .map((c) => ({ idx: c.idx, d: Math.hypot(c.cx - ex, c.cy - ey) }))
      .sort((p, q) => p.d - q.d)
      .slice(0, 2)
      .map((x) => x.idx);
    return { a, b, type: el.getAttribute('data-testid') === 'edge-equal' ? '=' : 'x' };
  });

  return {
    givens,
    clues,
    boardEl: cells[0]?.parentElement ?? document.body,
    cellElement,
    isFilled(index) {
      const cell = cellElement(index);
      return !!cell && cellValue(cell) !== UNKNOWN;
    },
    writeCell(index, value) {
      const cell = cellElement(index);
      if (!cell) return;
      const current = cellValue(cell);
      const order = [UNKNOWN, SUN, MOON];
      const clicks = (order.indexOf(value) - order.indexOf(current) + 3) % 3;
      for (let i = 0; i < clicks; i++) cell.click();
    },
  };
}
