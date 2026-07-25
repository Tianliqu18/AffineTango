# CLAUDE.md

Context for working on this repo.

## What this is

A Chrome extension (in progress) that reads a Tango puzzle off the page, solves it in
two phases, and animates the solve so you can watch cells get determined by constraints
that never touched them directly.

The math is documented in `README.md` (short version) and `docs/tango_gf2_writeup.md`
(full version). Read the README before changing anything in `src/core/`. Short version:
sun = 0, moon = 1, so a board is a vector in F₂³⁶. Clues, row balance parity, column
balance parity, and givens all become linear equations `Ax = b` over F₂. Gaussian
elimination pins a large fraction of cells for free and detects inconsistency. The two
rules that are not linear (exactly three of each symbol, and no three in a row) survive
elimination and need combinatorial search.

## Layout

```
src/core/          the solver. no DOM access, ever.
  encode.js        board <-> F2 vector, constants, clue normalisation
  trace.js         event schema + recorder
  gf2.js           builds [A|b], Gauss-Jordan to RREF, provenance tracking
  search.js        phase 2 backtracking over the affine remainder
  solve.js         orchestrator
test/
  reference_solver.py   Python implementation, used ONLY as an oracle
  gen_cases.py          emits cases.json from the reference
  crossvalidate.js      compares JS against the reference
tools/
  gen_puzzles.py        picks demo puzzles with verified-unique solutions
  harness-template.html the animation UI
  build-harness.js      inlines src/core into the template
harness.html       generated, do not edit by hand
docs/              the math writeup
```

## Commands

```
python3 test/gen_cases.py && node test/crossvalidate.js
node tools/build-harness.js
```

## Invariants that must not break

1. **`src/core/` never touches the DOM.** The solver emits a flat list of trace events
   and the animator replays them. This is what keeps scraping bugs and math bugs
   distinguishable, and it is what makes the animation scrubbable in both directions.

2. **Cross-validation must stay at 1685/1685.** Any change to the solver gets checked
   against the Python reference before anything else. If the two disagree, the JS is
   wrong until proven otherwise.

3. **Rank 11 on the bare parity subsystem.** Solving an empty board with no clues must
   return rank 11 and free dimension 25. This is a proven property of the problem, not
   an empirical observation, so a change in that number means a bug.

4. **Provenance must stay honest.** Every `cell_pinned` event carries `derivedFrom`, the
   ids of the original equations that combine to force it. XORing those original rows
   together must reproduce exactly `e_cell` with the right RHS. The animation draws this
   as a proof, so it must actually be one.

5. **`harness.html` is generated.** Edit `tools/harness-template.html` and rebuild.

## Technical gotchas already hit

- **JavaScript bitwise operators coerce to 32-bit signed integers.** Rows are 37 bits
  (36 coefficients plus the RHS), so packing them into a Number and using `^` silently
  truncates and produces a confidently wrong solver. Rows are `Uint8Array(37)` for this
  reason, and also because each byte maps one-to-one onto a rendered matrix cell.

- **Chrome content scripts do not support bare `import`.** `src/core/` is ES modules,
  which works in Node and in the harness via `<script type="module">`, but the extension
  will need esbuild or a similar bundle step. Do not solve this by duplicating the
  solver into the content script.

- **Phase 2 stops unwinding once the solution limit is hit**, so the trace ends with the
  board in its solved state rather than tearing it back down. Do not "fix" this.

## Trace event schema

This is the contract between the solver and any consumer (the harness, and later the
extension overlay). Adding events is fine; changing existing shapes is not, without
updating the animator.

```
phase          {phase}                     assemble | eliminate | search
row_added      {block, row, meta, bits, rhs}
pivot_chosen   {row, col}
row_swap       {a, b}
row_xor        {target, source}            target ^= source over F2
cell_pinned    {cell, value, derivedFrom}
rank_update    {rank, freeDim, pinnedCount}
contradiction  {row, derivedFrom}          system asserts 0 = 1
guess          {cell, value}
reject         {cell, value, reason}
backtrack      {cell}
solution       {board}
done           {consistent, rank, freeDim, solutionCount}
```

`block` is one of `row_parity`, `col_parity`, `clue`, `given`.

## Adapter contract (not yet implemented)

Every site-specific assumption lives behind one interface so that when a site reshuffles
its DOM, exactly one file changes:

```js
// src/adapters/<site>.js
export async function readBoard() {
  return {
    givens: Int8Array(36),                     // 0 sun, 1 moon, -1 unknown
    clues: [{ a, b, type }],                   // flat cell indices, type '=' or 'x'
    writeCell(index, value) { /* ... */ },
  };
}
export function matches(hostname) { /* ... */ }
```

Known hazards, both unverified until someone inspects the live DOM:

- Clue markers sit on the *edges* between cells, not inside them. They may be SVG,
  background images, CSS pseudo-elements, or encoded only in `aria-label` text.
  Pseudo-elements are the bad case, needing `getComputedStyle(el, '::after')`.
- The board may render asynchronously. Use a `MutationObserver` that waits for a stable
  grid rather than reading on `DOMContentLoaded`.

Save DOM snapshots into `test/fixtures/` as you go, so adapter regressions can be caught
without waiting for tomorrow's puzzle.

## Remaining work

- [ ] M3: `manifest.json`, content script, bundle step, adapters for
      `linkedin.com/games/tango` and `8tango.com`
- [ ] M3: read-only overlay on the live board
- [ ] M4: autofill behind a toggle, off by default (LinkedIn tracks streaks, so
      autofilling silently changes what those stats mean)
- [ ] M5: per-step explanations, provenance trail polish

## Style

- No em dashes in any prose, comments, docs, or commit messages in this repo.
- Comments explain why, not what. The existing `src/core/` comments are the reference
  for tone: they explain the F₂ reasoning and the traps, not the syntax.
