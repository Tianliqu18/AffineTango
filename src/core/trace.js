/**
 * Trace events.
 *
 * The solver never touches the DOM. It emits a flat, ordered list of events
 * describing what it did, and the animator replays that list. This keeps the
 * math unit-testable, lets the animation run backwards, and means scraping
 * bugs and math bugs can never be confused for each other.
 *
 * Event types
 * -----------
 * phase          {phase}                        marks a stage boundary
 * row_added      {block, row, bits, rhs}        one equation entered the system
 * pivot_chosen   {row, col}
 * row_swap       {a, b}
 * row_xor        {target, source}               target ^= source  (over F2)
 * cell_pinned    {cell, value, derivedFrom}     derivedFrom = original row ids
 * rank_update    {rank, freeDim, pinnedCount}
 * contradiction  {row, derivedFrom}             system asserts 0 = 1
 * guess          {cell, value}                  phase 2 tries a value
 * reject         {cell, value, reason}          pruned by a nonlinear rule
 * backtrack      {cell}
 * solution       {board}
 * done           {consistent, rank, freeDim, solutionCount}
 */

export const BLOCK = {
  ROW_PARITY: 'row_parity',
  COL_PARITY: 'col_parity',
  CLUE: 'clue',
  GIVEN: 'given',
};

export const PHASE = {
  ASSEMBLE: 'assemble',
  ELIMINATE: 'eliminate',
  SEARCH: 'search',
};

export class Trace {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.events = [];
  }

  push(type, payload) {
    if (this.enabled) this.events.push({ type, ...payload });
  }

  get length() {
    return this.events.length;
  }

  /** Counts by event type, handy in tests and for the scrubber's tick marks. */
  histogram() {
    const h = {};
    for (const e of this.events) h[e.type] = (h[e.type] || 0) + 1;
    return h;
  }
}
