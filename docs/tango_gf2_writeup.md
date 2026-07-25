# Tango as Linear Algebra over F₂

A writeup of the parity structure hiding inside LinkedIn's Tango puzzle, why
Gaussian elimination solves most of it for free, and exactly where the linear
method stops.

---

## 1. The encoding

A Tango board is a 6×6 grid where each cell holds a sun or a moon. Encode

- sun = 0
- moon = 1

so a board is a vector **x** ∈ F₂³⁶, one coordinate per cell, flattened
row-major. Here F₂ is the two-element field: addition is XOR, and 1 + 1 = 0.

Working mod 2 is the whole engine. "Track only whether a count is even or odd"
and "work in F₂" are the same sentence.

The rules of the puzzle are:

- **R1 (balance)** each row and each column contains exactly three suns and three moons
- **R2 (no triples)** no three identical symbols consecutively in a row or column
- **R3 (clues)** an `=` between two adjacent cells means they match, an `×` means they differ

Some cells are revealed at the start.

---

## 2. Which rules are linear

An equation over F₂ has the form **a**ᵀ**x** = b, where **a** ∈ F₂³⁶ selects
which cells participate and b ∈ F₂ is the required parity. Three of our four
ingredients fit this shape.

**Clues.** An `=` between cells i and j says the two agree, so they sum to an
even total:

> (**e**ᵢ + **e**ⱼ)ᵀ**x** = 0

An `×` says they differ:

> (**e**ᵢ + **e**ⱼ)ᵀ**x** = 1

**Balance, partially.** Three moons per row is an odd count, so the six cells of
any row XOR to 1:

> **1**_rowᵀ**x** = 1

and likewise for every column. This is the step most human solvers never take.
"Exactly three" feels like a counting rule, but its parity shadow is linear, and
that shadow is free information.

**Givens.** A revealed cell is **e**ᵢᵀ**x** = value.

Stack every such equation as a row and you have a single system

> **A x** = **b**

over F₂.

---

## 3. What the matrix A is

A is the incidence matrix of rules against cells. Columns are the 36 cells.
Rows are constraints. The entry A[i][j] is 1 exactly when cell j appears in
constraint i.

A does not encode the board. The board is **x**. A encodes the *structure of the
rules*, and as a map A : F₂³⁶ → F₂ᵐ it sends a candidate board to the vector of
all its constraint parities. It has four natural blocks:

| Block | Rows | Shape of each row |
|---|---|---|
| Row balance | 6 | indicator of one grid row (six 1s) |
| Column balance | 6 | indicator of one grid column (six 1s) |
| Clues | one per clue | exactly two 1s, on the adjacent pair |
| Givens | one per revealed cell | a single standard basis vector |

The clue block is precisely the incidence matrix of the clue graph, with edges
as rows and cells as columns.

*Notational note:* lowercase **a** is one constraint as a column vector, so a
single equation is **a**ᵀ**x** = b and the transpose turns the column into a row
so it can eat **x**. Stacking those rows *is* A, which is why **Ax** = **b**
carries no transpose.

---

## 4. The solution set is an affine subspace

Row-reduce the augmented matrix [A | b].

- If any row reduces to [0 ⋯ 0 | 1], the system asserts 0 = 1 and the puzzle is
  inconsistent. Solution set empty.
- Otherwise the solution set is a coset of the kernel:

> **x**₀ + ker(A)

By rank-nullity its dimension is

> free\_dim = 36 − rank(A)

Three numbers are easy to confuse, so to be explicit:

- **36** is the number of *variables*, the dimension of the ambient space, the
  degrees of freedom you would have with no rules at all. It is never a rank.
- **rank(A)** counts *independent constraints*. Each one removes at most one
  degree of freedom.
- **36 − rank(A)** is the dimension of the *solution set*.

Every clue you add is one more equation, pushing rank up and free dimension
down. A well-posed puzzle drives the combined system to a single point.

### Pinned cells

Cell i is forced to a constant by the linear layer if and only if **e**ᵢ lies in
the row space of A, that is, some F₂-combination of your equations reduces to
**e**ᵢᵀ**x** = c. In reduced row echelon form this appears as a pivot row whose
only variable is its own pivot column, and c is read off the right-hand side.

Equivalently: a pinned cell is a coordinate that is constant across the entire
affine solution space.

---

## 5. Two structural results

### 5.1 The parity subsystem has rank 11

Keep only the twelve balance equations and drop the clues.

Add all twelve together. On the left, every cell lies in exactly one row and one
column, so each coefficient appears twice and cancels. On the right, twelve 1s
XOR to 0. The total is the empty statement 0 = 0.

That is a single dependency among the twelve equation vectors, so

> rank = 11, free\_dim = 36 − 11 = 25

### 5.2 Those 25 free bits are a 5×5 block with a written border

```
 f  f  f  f  f | R      f = free (your 25 choices)
 f  f  f  f  f | R      R = forced by its ROW parity
 f  f  f  f  f | R      C = forced by its COLUMN parity
 f  f  f  f  f | R      X = corner, forced by both
 f  f  f  f  f | R
 ---------------
 C  C  C  C  C | X
```

Choose the top-left 5×5 freely. Each **R** is then determined because its row
has five known cells and must XOR to 1. Each **C** is determined the same way
down its column.

The corner X is computed two ways. Along row 6, X = 1 ⊕ (the five C's). Down
column 6, X = 1 ⊕ (the five R's). Both evaluate to the total parity of the free
5×5 block, so they agree automatically.

That automatic agreement *is* the dependency from 5.1 made concrete. Had the
rank been a full 12, the corner would face two genuinely independent demands and
could contradict itself.

So "all rows odd, all columns odd" is exactly "a free 5×5 block plus a border
that writes itself." This is the baseline before a single clue is read.

### 5.3 The clue graph and cycle consistency

Give each clue an edge between its two cells, labeled 0 for `=` and 1 for `×`.
Along any path, the XOR of the labels gives the relative value of the endpoints,
so each connected component collapses to a single free bit: fix one cell and the
rest of the component follows.

A forest is always consistent. The only way to fail is a cycle whose labels sum
to 1, which asserts that a cell differs from itself.

---

## 6. Why the linear layer manufactures new clues

This is the payoff, and it is worth seeing concretely.

Take a row `a b c d e f` with the balance equation

> a ⊕ b ⊕ c ⊕ d ⊕ e ⊕ f = 1

plus clues `a = b` (so a ⊕ b = 0) and `c × d` (so c ⊕ d = 1). Substitute:

> 0 ⊕ 1 ⊕ e ⊕ f = 1  ⟹  e ⊕ f = 0  ⟹  **e = f**

You just derived a clue on a pair that had none. The linear span of your
equations contains many statements that look like clues you were never given,
and Gaussian elimination is the machine that surfaces all of them at once.

---

## 7. Where linear algebra stops

Two rules cannot live in A.

**Exact cardinality.** The parity equation sees weight mod 2 only. It cannot
distinguish weight 1, 3, or 5. "Exactly three moons" is strictly stronger than
"an odd number of moons," and the gap is invisible to the linear layer.

**No three in a row.** This is a disjunction (not all three equal), not an
equation of the form **a**ᵀ**x** = b. It carves an arbitrary subset out of the
space, not a subspace.

Neither condition defines a subspace, so neither can be eliminated. They select
an unstructured subset of the coset **x**₀ + ker(A), and finding points of that
subset is combinatorial search.

There is a satisfying reason this had to be true. The generalized puzzle is
NP-complete (see §9). If Gaussian elimination alone finished the job, we would
have a polynomial-time algorithm for an NP-complete problem.

---

## 8. The algorithm

**Phase 1, linear, cheap, deterministic.**

1. Assemble [A | b] from row parities, column parities, clues, and givens
2. Reduce to RREF over F₂
3. If a `0 = 1` row appears, report the puzzle inconsistent and stop
4. Read off every pinned cell
5. Report rank and free dimension

**Phase 2, nonlinear, search.**

6. Seed the grid with the pinned values
7. Backtrack over the remaining free coordinates, pruning with exact
   cardinality, no-triples, and the clues

Empirical behavior on generated 6×6 boards, holding one given fixed and varying
the clue count:

| clues | rank | free\_dim | cells pinned by phase 1 |
|---|---|---|---|
| 10 | 22 | 14 | 1 |
| 16 | 28 | 8 | 13 |
| 22 | 32 | 4 | 20 |

Rank climbs, the coset shrinks, and cells fall out for free before any search
happens.

Phase 1 never proves uniqueness on its own, because uniqueness depends on the
two rules it cannot see. It shrinks the search space dramatically; it does not
replace the search.

### Implementation note

Rows of [A | b] are naturally stored as bit-vectors of 37 bits (36 coefficients
plus the right-hand side), since over F₂ adding two equations is exactly XOR.
In Python, arbitrary-precision ints work directly. In JavaScript, beware:
bitwise operators coerce to 32-bit signed integers, so a 37-bit row silently
truncates. Use BigInt, two 32-bit words, or a byte array per row.

---

## 9. Relation to existing work

None of the machinery here is new. The ingredients come from three literatures
that mostly do not cite each other.

**The puzzle family.** Tango is a variant of Takuzu / Binairo: two symbols,
balanced rows and columns, bounded runs. Tango adds the `=` and `×` pair clues
and permits runs of two. The binary puzzle was shown NP-complete by De Biasi
(2012).

**Puzzles as F₂ linear algebra.** Lights Out is the canonical example and uses
exactly this vocabulary: a system over GF(2), solvability determined by rank,
invariants derived from the kernel, and the classic "light chasing" technique
shown to be Gaussian elimination in disguise. The graph-theoretic
generalizations characterize solvability via invertibility of the neighborhood
matrix, and explicitly connect the picture to linear codes.

**Hybrid linear-plus-search solving.** The closest analogue to the two-phase
architecture above is CNF-XOR solving. CDCL SAT solvers handle XOR constraints
poorly when those are encoded as clauses, which motivated solvers with native
XOR support driven by Gaussian elimination, most prominently CryptoMiniSat, and
the DPLL(XOR) framework that formalizes the integration. Later work in that line
reasons about equivalence classes induced by binary XORs, which is precisely the
clue-graph component collapse of §5.3.

A cautionary data point from that literature: CryptoMiniSat removed XOR handling
during search in version 3.3 on cost grounds. Interleaving the phases, rather
than running them in sequence, is harder than it looks.

**The gap.** Published Takuzu solvers generally use SAT or ASP encodings, or
rule-based propagation with backtracking, rather than the F₂ parity analysis.
The specific treatment here, including the rank-11 result and the 5×5 free-block
picture, does not appear to be written up for this puzzle. That makes it a
competent application of a known template to a case nobody bothered with, not a
research contribution.

---

## 10. Open threads

- Fold the no-triples rule back into the linear system as implications so the
  two phases interleave rather than run in sequence, and measure whether the
  CryptoMiniSat cost lesson reproduces at this scale
- Extract an explicit basis for ker(A) from the RREF to enumerate free
  directions directly rather than backtracking over cells
- Characterize which clue placements maximize rank gain, that is, puzzle
  generation from the linear-algebraic side
- Generalize the §5.2 border construction to n×n and to unequal symbol counts
