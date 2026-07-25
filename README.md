# affine-tango

Solving LinkedIn's Tango puzzle with linear algebra over F₂, plus a Chrome extension
that animates the whole thing so you can watch cells get determined by constraints
that never touched them.

~~What's here so far: the solver core in JS (`src/core/`), a Python reference
implementation used only for cross-validation (`test/reference_solver.py`), and a
standalone harness page that animates the whole elimination. The extension itself is
next.~~

The repo is now ready to be loaded as an unpacked chrome extension:
## load as unpacked extension
1. go to chrome://extensions
2. toggle Developer mode (top right)
3. Load unpacked → select the extension/ folder

```
python3 test/gen_cases.py && node test/crossvalidate.js   # 1685 cases vs the reference
node tools/build-harness.js                               # regenerate harness.html
open harness.html                                         # watch it run
```

The harness is self-contained on purpose (no server, no bundler), so the build step
inlines `src/core/*.js` into it. `src/core/` stays the only source of truth.

## the idea

I was bummed out my senior spring semester since I could not fit Dylan Thurston's game elective class into my schedule.
In the same semester, I was introduced to Linkedin games, which I got instantly hooked on. 
This gave me inspiration for finding a formal mathematical connection between tango, linear algebra, and affine geometry (shoutout mark).

Encode sun = 0 and moon = 1. Now a board is just a vector in F₂³⁶ (36 cells, each a
bit) and F₂ is the field where 1 + 1 = 0, so addition is XOR. 
Three of Tango's rules turn out to be linear in this encoding:

A `=` clue between two cells says they match, so they sum to 0. A `×` says they
differ, so they sum to 1. Each clue is one equation.

Three moons per row is an *odd* count, so all six cells in any row XOR to 1. Same for
every column. That's 12 more equations for free, and I think this is the part most
people miss when they play, because "exactly three" feels like a counting rule rather
than a parity one. A revealed cell is just `x_i = value`.

Stack all of that into one system `Ax = b` over F₂. A is the incidence matrix of rules
against cells: columns are the 36 cells, rows are constraints, and `A[i][j] = 1` when
cell j shows up in constraint i. It doesn't encode the board (the board is x), it
encodes the *shape of the rules*. Four blocks: six row-parity rows, six column-parity
rows, one two-1s row per clue (which is literally the incidence matrix of the clue
graph), one basis vector per given.

Row reduce `[A | b]`. If you ever get a row saying `0 = 1`, the puzzle is inconsistent
and you're done. Otherwise the solutions form a coset `x₀ + ker(A)`, of dimension
`36 - rank(A)`.

Worth being careful with those three numbers because I confused myself at first. 36 is
how many *variables* there are, not a rank. rank(A) counts *independent constraints*,
each of which kills one degree of freedom. What's left over, 36 minus the rank, is the
dimension of the solution set. Adding clues pushes rank up and that number down, and a
well-posed puzzle drives it to zero (a single point).

A cell is pinned to a constant exactly when its basis vector `e_i` lies in the row
space of A, i.e. some combination of your equations collapses to `x_i = c`. In RREF
that's just a pivot row whose only variable is its own pivot column, so you read them
straight off.

## two things I liked

**The parity subsystem alone has rank 11, not 12.** Add all twelve balance equations
together: every cell sits in exactly one row and one column so its coefficient appears
twice and cancels, and twelve 1s on the right XOR to 0. The whole sum is `0 = 0`, which
is a dependency, so you lose one. 36 - 11 = 25 degrees of freedom.

And those 25 are geometric. Pick the top-left 5×5 however you want and the rest writes
itself:

```
 f  f  f  f  f | R      f = free, your 25 choices
 f  f  f  f  f | R      R = forced by its row parity
 f  f  f  f  f | R      C = forced by its column parity
 f  f  f  f  f | R      X = corner, forced twice
 f  f  f  f  f | R
 ---------------
 C  C  C  C  C | X
```

Each R is forced because its row already has five knowns and has to come out odd. Each
C likewise down its column. The corner gets computed two ways, along row 6 and down
column 6, and both come out to the total parity of your free 5×5 block, so they agree
automatically. That automatic agreement is the rank-11 dependency showing up in the
flesh. If the rank had been a full 12 the corner would be facing two genuinely
independent demands and could contradict itself. Before a single clue is given, 
the game boils down to deciding that free 5x5.

**The linear layer invents clues you were never given.** Say a row is `a b c d e f`,
with the row parity `a⊕b⊕c⊕d⊕e⊕f = 1`, plus clues `a = b` and `c × d`. Substituting
`a⊕b = 0` and `c⊕d = 1` leaves `e⊕f = 0`, so e = f. Nobody gave you a clue about e and
f. The linear span of your equations is full of statements like that and Gaussian
elimination reveals all of them at once.

(Side note on the clue graph: label edges 0 for `=` and 1 for `×`, and each connected
component collapses to one free bit, since fixing any cell determines the rest along
paths. A forest is always consistent. The only way to fail is a cycle whose labels sum
to 1, which says a cell differs from itself.)

## where the linearity stops

Two rules can't be written as `aᵀx = b` and so can't be eliminated.

### Exact cardinality: 
The parity equations only see mod 2, so weights 1, 3, and 5
all look identical to them. "Exactly three" is strictly stronger than "odd."

### No three in a row: 
That's a disjunction, not an equation. It carves an arbitrary subset
out of the space rather than a properly contained subspace.

So phase 1 hands you a reduced affine subspace and phase 2 has to search it. This had to
be the case since the generalized puzzle is NP-complete (De Biasi 2012),
so if Gaussian elimination alone finished the job we'd have a polynomial time algorithm for an
NP-complete problem

The actual algorithm is therefore: 
1. build `[A | b]'
2. RREF it, impossible puzzle if `0 = 1`
4. read off the pinned cells, then backtrack over whatever's left using the two rules the linear
layer is blind to.

You can watch phase 1 do real work as clues accumulate. Holding one given fixed, at 10
clues you get rank 22 and 1 pinned cell, at 16 clues rank 28 and 13 pinned, at 22 clues
rank 32 and 20 pinned. More clues, higher rank, smaller coset, more cells falling out
for free. Phase 1 never proves uniqueness on its own though, since uniqueness lives
entirely in the two nonlinear rules.

One implementation gotcha for the JS port: rows are 37 bits (36 coefficients plus the
RHS) and JavaScript's bitwise operators coerce to 32-bit signed ints, so a naive `^`
silently truncates and you get a solver that's confidently wrong. Use BigInt, two
32-bit words, or a byte array per row. In Python the arbitrary-precision ints just work,
which is why the reference implementation packs each row into a single int.

## related works and existing literature (none of this is new)

Background research for this project showed that these rules are well established, they just live in three
literatures that mostly don't cite each other.

Tango is basically a Takuzu / Binairo variant, with pair clues added and runs of two
allowed. That family is well studied and the binary puzzle is NP-complete (De Biasi,
2012).

Lights Out is the canonical puzzle-as-F₂-linear-algebra example and uses this exact
vocabulary: system over GF(2), solvability from rank, invariants from the kernel. The
classic "light chasing" trick turns out to be Gaussian elimination in disguise, and the
graph generalizations characterize solvability by invertibility of the neighborhood
matrix and connect the whole picture to linear codes.

The closest match to the two-phase architecture here is CNF-XOR solving. CDCL SAT
solvers do badly on XOR constraints encoded as clauses, which motivated solvers with
native XOR support via Gaussian elimination (CryptoMiniSat) and the DPLL(XOR) framework.
Later work there reasons about equivalence classes from binary XORs, which is exactly
the clue-graph component collapse above. Cautionary note: CryptoMiniSat pulled XOR
handling during search in 3.3 because it was too expensive, so interleaving the phases
is harder than it looks.

What I couldn't find was anyone doing the F₂ parity analysis for this specific puzzle.
Published Takuzu solvers use SAT/ASP encodings or rule-based propagation. So the
rank-11 result and the 5×5 border picture probably aren't written down anywhere for
Tango, but that makes this a competent application of a known template to a case nobody
bothered with.

Anyways, have fun with it.

## todo

- [x] port solver to JS with trace events (`row_xor`, `cell_pinned`, `guess`, `backtrack`, ...)
- [x] local harness page + animation, decoupled from the extension
- [ ] board adapters for linkedin.com/games/tango and 8tango.com
- [ ] read-only overlay, autofill behind a toggle
- [ ] extract an explicit basis for ker(A) and enumerate free directions instead of backtracking over cells
- [ ] try interleaving the phases (fold no-triples back in as implications) and see if the CryptoMiniSat cost lesson reproduces at this scale
- [ ] generalize the 5×5 border construction to n×n
