"""Generate cross-validation cases using the Python reference solver."""

import json
import random
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import reference_solver as T

LIMIT = 3
cases = []


def record(name, givens, constraints):
    res = T.solve(givens, constraints, limit=LIMIT)
    cases.append({
        "name": name,
        "givens": givens,
        "clues": [
            {"r1": r1, "c1": c1, "r2": r2, "c2": c2, "type": t}
            for (r1, c1, r2, c2, t) in constraints
        ],
        "expected": {
            "consistent": res["consistent"],
            "rank": res["rank"],
            "freeDim": res["free_dim"],
            "pins": {str(k): v for k, v in res["pins"].items()},
            "solutions": res["solutions"],
        },
    })


# 1. no constraints at all: pure parity subsystem, should be rank 11
record("bare_parity", [[-1] * 6 for _ in range(6)], [])

# 2. sweep boards, clue counts, and given counts
rng = random.Random(1234)
for seed in range(60):
    board = T.random_board(seed=seed)
    for k in (0, 6, 10, 14, 18, 22, 26):
        constraints = T.clues_from(board, k=k, seed=seed * 31 + k)
        for ngiven in (0, 1, 3, 6):
            givens = [[-1] * 6 for _ in range(6)]
            spots = rng.sample(range(36), ngiven)
            for s in spots:
                givens[s // 6][s % 6] = board[s // 6][s % 6]
            record(f"s{seed}_k{k}_g{ngiven}", givens, constraints)

# 3. deliberately inconsistent: same pair marked both = and x
record("contradiction_pair", [[-1] * 6 for _ in range(6)],
       [(0, 0, 0, 1, '='), (0, 0, 0, 1, 'x')])

# 4. inconsistent via givens fighting a clue
g = [[-1] * 6 for _ in range(6)]
g[0][0] = 0
g[0][1] = 1
record("contradiction_given", g, [(0, 0, 0, 1, '=')])

# 5. inconsistent via a bad cycle in the clue graph (odd number of x round a square)
record("contradiction_cycle", [[-1] * 6 for _ in range(6)],
       [(0, 0, 0, 1, 'x'), (0, 1, 1, 1, '='), (1, 1, 1, 0, '='), (1, 0, 0, 0, '=')])

# 6. fully specified board as givens
board = T.random_board(seed=99)
record("full_board", [row[:] for row in board], [])

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cases.json")
with open(out, "w") as f:
    json.dump(cases, f)

print(f"wrote {len(cases)} cases")
consistent = sum(1 for c in cases if c["expected"]["consistent"])
print(f"  consistent: {consistent}, inconsistent: {len(cases) - consistent}")
