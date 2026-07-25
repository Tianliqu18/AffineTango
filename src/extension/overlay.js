/**
 * Read-only overlay: draws the solved value over cells the player hasn't
 * filled in yet, without touching the game's own state. One layer element
 * appended to the board, so it can be torn down by removing a single node.
 */

import { SUN } from '../core/encode.js';

const OVERLAY_ID = 'affine-tango-overlay';

export function clearOverlay(boardEl) {
  boardEl.querySelector(`#${OVERLAY_ID}`)?.remove();
}

/** `marks` is [{ cellEl, value }], value is SUN or MOON from encode.js. */
export function renderOverlay(boardEl, marks) {
  clearOverlay(boardEl);

  const layer = document.createElement('div');
  layer.id = OVERLAY_ID;
  layer.style.position = 'absolute';
  layer.style.inset = '0';
  layer.style.pointerEvents = 'none';
  layer.style.zIndex = '10';

  const boardRect = boardEl.getBoundingClientRect();
  for (const { cellEl, value } of marks) {
    const r = cellEl.getBoundingClientRect();
    const size = Math.round(r.width * 0.28);

    const dot = document.createElement('div');
    dot.style.position = 'absolute';
    dot.style.left = `${r.left - boardRect.left + r.width / 2 - size / 2}px`;
    dot.style.top = `${r.top - boardRect.top + r.height / 2 - size / 2}px`;
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.borderRadius = '50%';
    dot.style.border = '2px solid white';
    dot.style.background = value === SUN ? '#f5a524' : '#3b82f6';
    dot.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.25)';
    layer.appendChild(dot);
  }

  if (getComputedStyle(boardEl).position === 'static') boardEl.style.position = 'relative';
  boardEl.appendChild(layer);
}
