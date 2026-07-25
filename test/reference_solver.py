"""
Tango (LinkedIn) solver.

Encoding: sun = 0, moon = 1. Grid is 6x6, cells flattened row-major as x_0..x_35.

Two phases, matching the math:

  Phase 1 (linear, cheap, deterministic):
    Everything linear over GF(2) becomes one system A x = b:
      - row parity: each row XORs to 1   (exactly 3 ones => odd weight)
      - col parity: each col XORs to 1
      - "=" clue between i,j:  x_i XOR x_j = 0
      - "x" clue between i,j:  x_i XOR x_j = 1
      - a given cell:          x_i        = value
    Gaussian-eliminate to RREF. This detects contradictions (0 = 1) and
    surfaces every cell the linear span pins to a constant, including
    equations you were never explicitly handed.

  Phase 2 (nonlinear, search):
    The two rules the linear layer cannot see are exact cardinality
    (weight is exactly 3, not merely odd) and "no three in a row"
    (a disjunction, not a linear equation). Backtrack over the cells
    the linear phase left free, pruning with those two rules plus the
    clues, and seed the grid with the pinned values.

Rows are stored as Python ints used as bit-vectors: bits 0..35 are the
coefficients of x_0..x_35, bit 36 is the right-hand side. XORing two rows
is adding the two equations over GF(2).
"""

import random

N = 6
NV = N * N        # 36 variables
RHS = NV          # bit index of the right-hand side


def var(r, c):
    return r * N + c


# ---------------------------------------------------------------------------
# Phase 1: build the GF(2) system and reduce it.
# ---------------------------------------------------------------------------

def build_rows(givens, constraints):
    rows = []

    # row parity = 1
    for r in range(N):
        eq = 0
        for c in range(N):
            eq |= 1 << var(r, c)
        eq |= 1 << RHS
        rows.append(eq)

    # col parity = 1
    for c in range(N):
        eq = 0
        for r in range(N):
            eq |= 1 << var(r, c)
        eq |= 1 << RHS
        rows.append(eq)

    # clues
    for (r1, c1, r2, c2, t) in constraints:
        eq = (1 << var(r1, c1)) | (1 << var(r2, c2))
        if t == 'x':
            eq |= 1 << RHS
        rows.append(eq)

    # givens as x_i = value
    for r in range(N):
        for c in range(N):
            g = givens[r][c]
            if g in (0, 1):
                eq = 1 << var(r, c)
                if g == 1:
                    eq |= 1 << RHS
                rows.append(eq)

    return rows


def rref(rows):
    """Reduced row echelon form over GF(2). Returns dict {pivot_col: row},
    or None if the system is inconsistent."""
    pivots = {}  # col -> reduced row
    for eq in rows:
        cur = eq
        # reduce against existing pivots
        for col, prow in pivots.items():
            if (cur >> col) & 1:
                cur ^= prow
        var_bits = cur & ((1 << NV) - 1)
        if var_bits == 0:
            if (cur >> RHS) & 1:
                return None          # 0 = 1, contradiction
            continue                 # 0 = 0, redundant
        # leading (lowest) variable column
        lead = (var_bits & -var_bits).bit_length() - 1
        # keep it reduced: clear this column from all existing pivots
        for col in list(pivots):
            if (pivots[col] >> lead) & 1:
                pivots[col] ^= cur
        pivots[lead] = cur
    return pivots


def pinned_cells(pivots):
    """Cells forced to a constant: a pivot row whose only variable is its
    own pivot column."""
    pins = {}
    for col, eq in pivots.items():
        if (eq & ((1 << NV) - 1)) == (1 << col):
            pins[col] = (eq >> RHS) & 1
    return pins


# ---------------------------------------------------------------------------
# Phase 2: backtracking search over the remainder.
# ---------------------------------------------------------------------------

def solve(givens, constraints, limit=2):
    pivots = rref(build_rows(givens, constraints))
    if pivots is None:
        return {"consistent": False, "pins": {}, "free_dim": None,
                "rank": None, "solutions": []}

    pins = pinned_cells(pivots)
    rank = len(pivots)
    free_dim = NV - rank

    grid = [[givens[r][c] if givens[r][c] in (0, 1) else -1
             for c in range(N)] for r in range(N)]
    for col, val in pins.items():
        grid[col // N][col % N] = val

    clue = {}
    for (r1, c1, r2, c2, t) in constraints:
        clue[((r1, c1), (r2, c2))] = t
        clue[((r2, c2), (r1, c1))] = t

    cells = [(r, c) for r in range(N) for c in range(N)]
    solutions = []

    def ok(r, c):
        row = grid[r]
        if row.count(0) > 3 or row.count(1) > 3:
            return False
        col = [grid[i][c] for i in range(N)]
        if col.count(0) > 3 or col.count(1) > 3:
            return False
        for cc in range(max(0, c - 2), min(N - 3, c) + 1):
            a, b, d = grid[r][cc], grid[r][cc + 1], grid[r][cc + 2]
            if a != -1 and a == b == d:
                return False
        for rr in range(max(0, r - 2), min(N - 3, r) + 1):
            a, b, d = grid[rr][c], grid[rr + 1][c], grid[rr + 2][c]
            if a != -1 and a == b == d:
                return False
        for (nr, nc) in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
            if 0 <= nr < N and 0 <= nc < N and grid[nr][nc] != -1:
                t = clue.get(((r, c), (nr, nc)))
                if t is not None:
                    same = grid[r][c] == grid[nr][nc]
                    if (t == '=' and not same) or (t == 'x' and same):
                        return False
        return True

    def bt(i):
        if len(solutions) >= limit:
            return
        if i == len(cells):
            solutions.append([row[:] for row in grid])
            return
        r, c = cells[i]
        if grid[r][c] != -1:
            if ok(r, c):
                bt(i + 1)
            return
        for v in (0, 1):
            grid[r][c] = v
            if ok(r, c):
                bt(i + 1)
            grid[r][c] = -1

    bt(0)
    return {"consistent": True, "pins": pins, "free_dim": free_dim,
            "rank": rank, "solutions": solutions}


# ---------------------------------------------------------------------------
# Pretty printing and a self-test generator.
# ---------------------------------------------------------------------------

SYM = {0: "S", 1: "M", -1: "."}


def show(grid):
    return "\n".join(" ".join(SYM[v] for v in row) for row in grid)


def random_board(seed):
    """Generate one fully valid board by randomized backtracking."""
    rng = random.Random(seed)
    grid = [[-1] * N for _ in range(N)]

    def ok(r, c):
        row = grid[r]
        if row.count(0) > 3 or row.count(1) > 3:
            return False
        col = [grid[i][c] for i in range(N)]
        if col.count(0) > 3 or col.count(1) > 3:
            return False
        for cc in range(max(0, c - 2), min(N - 3, c) + 1):
            a, b, d = grid[r][cc], grid[r][cc + 1], grid[r][cc + 2]
            if a != -1 and a == b == d:
                return False
        for rr in range(max(0, r - 2), min(N - 3, r) + 1):
            a, b, d = grid[rr][c], grid[rr + 1][c], grid[rr + 2][c]
            if a != -1 and a == b == d:
                return False
        return True

    cells = [(r, c) for r in range(N) for c in range(N)]

    def bt(i):
        if i == len(cells):
            return True
        r, c = cells[i]
        vals = [0, 1]
        rng.shuffle(vals)
        for v in vals:
            grid[r][c] = v
            if ok(r, c) and bt(i + 1):
                return True
            grid[r][c] = -1
        return False

    bt(0)
    return grid


def clues_from(board, k, seed):
    """Sample k adjacent-pair clues consistent with a solved board."""
    rng = random.Random(seed)
    pairs = []
    for r in range(N):
        for c in range(N):
            if c + 1 < N:
                pairs.append((r, c, r, c + 1))
            if r + 1 < N:
                pairs.append((r, c, r + 1, c))
    rng.shuffle(pairs)
    out = []
    for (r1, c1, r2, c2) in pairs[:k]:
        t = '=' if board[r1][c1] == board[r2][c2] else 'x'
        out.append((r1, c1, r2, c2, t))
    return out


if __name__ == "__main__":
    board = random_board(seed=7)
    print("Generated a valid board:")
    print(show(board))

    constraints = clues_from(board, k=10, seed=3)
    givens = [[-1] * N for _ in range(N)]
    # reveal a couple of cells too
    givens[0][0] = board[0][0]
    givens[5][5] = board[5][5]

    res = solve(givens, constraints, limit=5)
    print("\nLinear phase:")
    print(f"  consistent: {res['consistent']}")
    print(f"  rank: {res['rank']}   free dimension: {res['free_dim']}")
    print(f"  cells pinned by linear layer: {len(res['pins'])} / 36")
    print(f"\nSearch phase found {len(res['solutions'])} solution(s) "
          f"(capped at 5).")
    found = any(s == board for s in res["solutions"])
    print(f"Original board recovered among solutions: {found}")
    if res["solutions"]:
        print("\nFirst solution:")
        print(show(res["solutions"][0]))
