/**
 * Placeholder adapter, implementing the contract from CLAUDE.md so the
 * content script has something to import before any site has been inspected.
 * `readBoard` reports an empty board with no clues; `writeCell` just logs.
 * Replace with `linkedin.js` / `8tango.js` once we've seen the live DOM, and
 * dispatch between them by `matches(hostname)`.
 */

import { NV, UNKNOWN } from '../core/encode.js';

export function matches(_hostname) {
  return true;
}

export async function readBoard() {
  return {
    givens: new Int8Array(NV).fill(UNKNOWN),
    clues: [],
    writeCell(index, value) {
      console.warn(`[affine-tango] stub adapter: writeCell(${index}, ${value}) is a no-op`);
    },
  };
}
