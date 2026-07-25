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
 * Writes: unlike 8tango, LinkedIn's board ignores untrusted clicks outright.
 * Confirmed live against a fresh blank puzzle: neither cell.click() nor a
 * full synthetic pointerdown/mousedown/pointerup/mouseup/click sequence
 * (correct target, correct coordinates) changed a cell's state at all. A
 * genuine OS-level click did, immediately, going blank -> Sun.
 *
 * Left click places Sun, right click places Moon -- both directly, from
 * blank, no left-click cycling through Sun first. (User-reported and taken
 * on trust; a scripted right-click didn't register in the sandboxed test
 * environment used to verify the rest of this, but that's more likely a gap
 * in that particular test tool's right-click implementation than evidence
 * against it -- chrome.debugger's Input.dispatchMouseEvent with button:
 * 'right' is the standard way automation tools trigger a real contextmenu
 * event, and is what writeCellsTrusted below actually uses in the shipped
 * extension.)
 *
 * Since a content script can't produce a trusted click, writeCellsTrusted
 * below hands the (index, value) pairs to the background service worker,
 * which drives chrome.debugger's Input.dispatchMouseEvent instead -- see
 * src/extension/background.js.
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
    // fills is [{ index, value }]; every index passed in is assumed blank
    // (content.js only ever calls this for cells still reading UNKNOWN).
    // Left click places Sun directly; right click places Moon directly --
    // one click per cell either way, no left-click cycling needed.
    writeCellsTrusted(fills) {
      const points = fills.flatMap(({ index, value }) => {
        const cell = cellElement(index);
        if (!cell) return [];
        const r = cell.getBoundingClientRect();
        const button = value === SUN ? 'left' : 'right';
        return [{ x: r.left + r.width / 2, y: r.top + r.height / 2, button }];
      });
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'DEBUGGER_CLICK_BATCH', points }, (response) => {
          if (chrome.runtime.lastError || !response?.ok) {
            reject(new Error(response?.reason ?? chrome.runtime.lastError?.message ?? 'debugger click batch failed'));
          } else {
            resolve(fills.length);
          }
        });
      });
    },
  };
}
