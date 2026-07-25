"""Pick demo puzzles with verified-unique solutions, spanning clue densities."""
import json, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'test'))
import reference_solver as T

def make(seed, k, ngiven, rng):
    board = T.random_board(seed=seed)
    cons = T.clues_from(board, k=k, seed=seed * 17 + k)
    givens = [[-1]*6 for _ in range(6)]
    for s in rng.sample(range(36), ngiven):
        givens[s//6][s%6] = board[s//6][s%6]
    res = T.solve(givens, cons, limit=2)
    if not res['consistent'] or len(res['solutions']) != 1:
        return None
    return {
        'givens': givens,
        'clues': [{'r1':a,'c1':b,'r2':c,'c2':d,'type':t} for (a,b,c,d,t) in cons],
        'rank': res['rank'], 'freeDim': res['free_dim'], 'pinned': len(res['pins']),
    }

rng = random.Random(20260724)
picked = []
targets = [
    ('Sparse clues, heavy search', 8, 6),
    ('Balanced', 14, 4),
    ('Clue-rich, mostly linear', 20, 2),
    ('Almost pure linear collapse', 26, 2),
]
for label, k, g in targets:
    for seed in range(400):
        p = make(seed, k, g, rng)
        if p:
            p['name'] = label
            picked.append(p)
            break

picked.append({
    'name': 'Inconsistent: = and x on one pair',
    'givens': [[-1]*6 for _ in range(6)],
    'clues': [{'r1':0,'c1':0,'r2':0,'c2':1,'type':'='},
              {'r1':0,'c1':0,'r2':0,'c2':1,'type':'x'}],
    'rank': None, 'freeDim': None, 'pinned': 0,
})

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'puzzles.json')
json.dump(picked, open(out,'w'))
for p in picked:
    print(f"{p['name']:36s} clues={len(p['clues']):2d} rank={p['rank']} pinned={p['pinned']}")
