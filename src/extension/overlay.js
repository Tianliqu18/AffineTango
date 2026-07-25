/**
 * Read-only overlay: draws the solved value over cells the player hasn't
 * filled in yet, without touching the game's own state.
 *
 * The layer is appended to document.body, not the board, and positioned with
 * `fixed` (viewport-relative, same coordinate space getBoundingClientRect
 * already uses). It can't live inside the board: React owns that subtree and
 * reconciles away any DOM node it didn't render whenever the board
 * re-renders, which wiped the whole overlay on every single cell click.
 */

import { SUN } from '../core/encode.js';

const OVERLAY_ID = 'affine-tango-overlay';

function ensureLayer() {
  let layer = document.getElementById(OVERLAY_ID);
  if (layer) return layer;
  layer = document.createElement('div');
  layer.id = OVERLAY_ID;
  layer.style.position = 'fixed';
  layer.style.inset = '0';
  layer.style.pointerEvents = 'none';
  layer.style.zIndex = '2147483647';
  document.body.appendChild(layer);
  return layer;
}

export function clearOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

/** `marks` is [{ cellEl, value }], value is SUN or MOON from encode.js. */
function render(marks) {
  const layer = ensureLayer();
  layer.replaceChildren();

  for (const { cellEl, value } of marks) {
    const r = cellEl.getBoundingClientRect();
    const size = Math.round(r.width * 0.28);

    const dot = document.createElement('div');
    dot.style.position = 'fixed';
    dot.style.left = `${r.left + r.width / 2 - size / 2}px`;
    dot.style.top = `${r.top + r.height / 2 - size / 2}px`;
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.borderRadius = '50%';
    dot.style.border = '2px solid white';
    dot.style.background = value === SUN ? '#f5a524' : '#3b82f6';
    dot.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.25)';
    layer.appendChild(dot);
  }
}

/**
 * Keeps the overlay in sync with the live board: `getMarks` is called again
 * every time a cell's class changes (the player filling one in, or the game
 * re-rendering for any other reason) or the viewport moves, so a mark drops
 * out the moment its cell stops being blank rather than all of them
 * vanishing together. Returns a teardown function.
 */
export function startOverlay(boardEl, getMarks) {
  const refresh = () => render(getMarks());
  refresh();

  const observer = new MutationObserver(refresh);
  observer.observe(boardEl, { attributes: true, attributeFilter: ['class'], subtree: true });
  window.addEventListener('resize', refresh);
  window.addEventListener('scroll', refresh, true);

  return () => {
    observer.disconnect();
    window.removeEventListener('resize', refresh);
    window.removeEventListener('scroll', refresh, true);
    clearOverlay();
  };
}
