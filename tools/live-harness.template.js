/* ==== solver core, inlined from src/core by tools/build-live-harness.js ==== */
/*__SOLVER__*/

/* ==== animator (identical to tools/harness-template.html's, minus puzzle selection) ==== */
const BLOCK_COLOR = {
  row_parity:'var(--blk-row)', col_parity:'var(--blk-col)',
  clue:'var(--blk-clue)', given:'var(--blk-given)',
};
const BLOCK_LABEL = {
  row_parity:'row parity', col_parity:'col parity', clue:'clue', given:'given',
};
const CELLNAME = (i) => `r${Math.floor(i/6)+1}c${(i%6)+1}`;
const VALNAME = (v) => (v === 1 ? 'moon' : 'sun');
const REJECT_TEXT = {
  row_count:'too many of one symbol in that row',
  col_count:'too many of one symbol in that column',
  triple_row:'three in a row horizontally',
  triple_col:'three in a row vertically',
  clue_eq:'breaks an = clue',
  clue_x:'breaks an × clue',
};

let current = null;
let cursor = 0;
let playing = false;
let timer = null;
let lastClass = [];

function mountBoard(puzzle) {
  const board = document.getElementById('board');
  board.innerHTML = '';
  const cells = [];
  for (let i = 0; i < 36; i++) {
    const d = document.createElement('div');
    d.className = 'cell';
    d.setAttribute('role','img');
    board.appendChild(d);
    cells.push(d);
  }
  const marks = [];
  const step = 46 + 16;
  // clues arrive as {a,b,type} flat-index pairs from the live extension
  // (rather than {r1,c1,r2,c2,type} the way tools/puzzles.json writes them);
  // normaliseClue + rowOf/colOf (inlined from src/core/encode.js above)
  // handle either shape, same as solve() already does internally.
  for (const raw of puzzle.clues) {
    const cl = normaliseClue(raw);
    const r1 = rowOf(cl.a), c1 = colOf(cl.a), r2 = rowOf(cl.b), c2 = colOf(cl.b);
    const m = document.createElement('div');
    m.className = 'mark';
    m.textContent = cl.type === 'x' ? '×' : '=';
    const horizontal = r1 === r2;
    const left = horizontal ? (Math.min(c1,c2) * step + 46 + 8 - 8) : (c1 * step + 23 - 8);
    const top  = horizontal ? (r1 * step + 23 - 8) : (Math.min(r1,r2) * step + 46 + 8 - 8);
    m.style.left = left + 'px';
    m.style.top = top + 'px';
    board.appendChild(m);
    marks.push(m);
  }
  return cells;
}

function mountMatrix(maxRows) {
  const host = document.getElementById('matrix');
  host.innerHTML = '';
  const rowEls = [], bitEls = [];
  for (let r = 0; r < maxRows; r++) {
    const row = document.createElement('div');
    row.className = 'mrow hidden';
    const tab = document.createElement('i');
    tab.className = 'tab';
    row.appendChild(tab);
    const rid = document.createElement('span');
    rid.className = 'rid';
    rid.textContent = r;
    row.appendChild(rid);
    const bits = [];
    for (let c = 0; c < 37; c++) {
      const b = document.createElement('i');
      b.className = 'bit';
      row.appendChild(b);
      bits.push(b);
    }
    host.appendChild(row);
    rowEls.push({ row, tab });
    bitEls.push(bits);
  }
  const legend = Object.entries(BLOCK_LABEL)
    .map(([k,v]) => `<i class="swatch" style="background:${BLOCK_COLOR[k]};margin-right:4px"></i>${v}`)
    .join('&nbsp;&nbsp;');
  document.getElementById('blockLegend').innerHTML = legend;
  return { rowEls, bitEls };
}

function stateAt(events, k, puzzle) {
  const rows = [];
  const board = new Int8Array(36).fill(-1);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) board[r*6+c] = puzzle.givens[r][c];
  const givenSet = new Set();
  for (let i = 0; i < 36; i++) if (board[i] !== -1) givenSet.add(i);

  const pins = {};
  let rank = null, freeDim = null, phase = 'assemble', pivot = null;
  let contradiction = null, solved = false, guessCount = 0;
  let tr = {};

  for (let i = 0; i <= k && i < events.length; i++) {
    const e = events[i];
    tr = {};
    switch (e.type) {
      case 'phase': phase = e.phase; break;
      case 'row_added': {
        const v = new Uint8Array(37);
        for (let j = 0; j < 36; j++) v[j] = e.bits[j];
        v[36] = e.rhs;
        rows.push({ v, block: e.block, meta: e.meta, id: e.row });
        tr.added = rows.length - 1;
        break;
      }
      case 'row_swap': {
        const t = rows[e.a]; rows[e.a] = rows[e.b]; rows[e.b] = t;
        tr.swap = e;
        break;
      }
      case 'pivot_chosen': pivot = { row: e.row, col: e.col }; break;
      case 'row_xor': {
        const t = rows[e.target].v, s = rows[e.source].v;
        for (let j = 0; j < 37; j++) t[j] ^= s[j];
        tr.xor = e;
        break;
      }
      case 'cell_pinned':
        pins[e.cell] = e.value;
        board[e.cell] = e.value;
        tr.pin = e;
        break;
      case 'rank_update': rank = e.rank; freeDim = e.freeDim; break;
      case 'contradiction': contradiction = e; tr.conflict = e; break;
      case 'guess':
        board[e.cell] = e.value; guessCount++; tr.guess = e; break;
      case 'reject':
        board[e.cell] = -1; tr.reject = e; break;
      case 'backtrack':
        board[e.cell] = -1; tr.back = e; break;
      case 'solution': {
        for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) board[r*6+c] = e.board[r][c];
        solved = true; tr.solved = true; break;
      }
      default: break;
    }
  }
  return { rows, board, givenSet, pins, rank, freeDim, phase, pivot,
           contradiction, solved, guessCount, tr, event: events[Math.min(k, events.length-1)] };
}

function narrate(st) {
  const e = st.event;
  if (!e) return ['idle','', ''];
  switch (e.type) {
    case 'phase':
      return ['phase','',
        e.phase === 'assemble' ? 'Assembling [A | b] from the rules.'
        : e.phase === 'eliminate' ? 'Reducing to row echelon form over F₂.'
        : 'Linear phase exhausted. Searching what is left.'];
    case 'row_added': {
      const m = e.meta || {};
      let what = BLOCK_LABEL[e.block];
      if (e.block === 'row_parity') what = `row ${m.line+1} XORs to 1 (three moons is odd)`;
      if (e.block === 'col_parity') what = `column ${m.line+1} XORs to 1`;
      if (e.block === 'clue') what = `clue ${CELLNAME(m.a)} ${m.type === 'x' ? '×' : '='} ${CELLNAME(m.b)}`;
      if (e.block === 'given') what = `given ${CELLNAME(m.cell)}`;
      return ['load','', `Row ${e.row}: ${what}`];
    }
    case 'row_swap': return ['swap','', `Swap rows ${e.a} and ${e.b} to bring a pivot up.`];
    case 'pivot_chosen': return ['pivot','pivot', `Pivot at row ${e.row}, column ${e.col} (${CELLNAME(e.col)}).`];
    case 'row_xor': return ['xor','pivot', `Row ${e.target} ^= row ${e.source}`];
    case 'cell_pinned':
      return ['pinned','pin',
        `${CELLNAME(e.cell)} is forced to ${VALNAME(e.value)}, by ${e.derivedFrom.length} equation${e.derivedFrom.length===1?'':'s'} combined (highlighted).`];
    case 'rank_update':
      return ['result','pin', `rank ${e.rank}, so ${e.freeDim} degrees of freedom remain. ${e.pinnedCount} cells pinned without any search.`];
    case 'contradiction':
      return ['conflict','bad', `Row ${e.row} reduces to 0 = 1. Rows ${e.derivedFrom.join(', ')} cannot all hold. Puzzle is inconsistent.`];
    case 'guess': return ['try','search', `Try ${VALNAME(e.value)} at ${CELLNAME(e.cell)}.`];
    case 'reject': return ['reject','search', `Rejected: ${REJECT_TEXT[e.reason] || e.reason}.`];
    case 'backtrack': return ['back','search', `Both values fail at ${CELLNAME(e.cell)}. Back up.`];
    case 'solution': return ['solved','pin', 'Solved.'];
    case 'done':
      return ['done', e.consistent ? 'pin' : 'bad',
        e.consistent ? `Finished. rank ${e.rank}, free dim ${e.freeDim}, ${e.solutionCount} solution(s).`
                     : 'Finished. No solution exists.'];
    default: return ['','',''];
  }
}

function render() {
  const st = stateAt(current.events, cursor, current.puzzle);
  const { rowEls, bitEls } = current.matrix;

  for (let i = 0; i < 36; i++) {
    const el = current.cells[i];
    const v = st.board[i];
    let cls = 'cell';
    if (v === 0) cls += ' sun';
    else if (v === 1) cls += ' moon';
    if (st.givenSet.has(i)) cls += ' given';
    else if (st.pins[i] !== undefined) cls += ' pinned';
    else if (v !== -1) cls += ' guessed';
    if (st.tr.pin && st.tr.pin.cell === i) cls += ' flash';
    if (st.tr.reject && st.tr.reject.cell === i) cls += ' rejected';
    if (el.className !== cls) el.className = cls;
    el.textContent = v === -1 ? '' : (v === 1 ? 'M' : 'S');
    el.setAttribute('aria-label', `${CELLNAME(i)} ${v === -1 ? 'empty' : VALNAME(v)}`);
  }

  const cited = new Set(st.tr.pin ? st.tr.pin.derivedFrom : (st.tr.conflict ? st.tr.conflict.derivedFrom : []));
  for (let r = 0; r < rowEls.length; r++) {
    const { row, tab } = rowEls[r];
    if (r >= st.rows.length) {
      if (!row.classList.contains('hidden')) row.className = 'mrow hidden';
      continue;
    }
    const data = st.rows[r];
    let rcls = 'mrow';
    if (st.pivot && st.pivot.row === r) rcls += ' pivrow';
    if (st.tr.xor && st.tr.xor.target === r) rcls += ' xtarget';
    if (st.tr.xor && st.tr.xor.source === r) rcls += ' xsource';
    if (cited.has(data.id)) rcls += ' cited';
    if (st.tr.conflict && st.tr.conflict.row === r) rcls += ' conflict';
    if (row.className !== rcls) row.className = rcls;
    const col = BLOCK_COLOR[data.block];
    if (tab.style.background !== col) tab.style.background = col;

    const bits = bitEls[r];
    for (let c = 0; c < 37; c++) {
      let bcls = 'bit';
      if (data.v[c]) bcls += ' on';
      if (c === 36) bcls += ' gutter rhs';
      if (st.pivot && st.pivot.col === c) bcls += ' pivcol';
      if (st.pivot && st.pivot.col === c && st.pivot.row === r) bcls += ' piv';
      const key = r * 37 + c;
      if (lastClass[key] !== bcls) { bits[c].className = bcls; lastClass[key] = bcls; }
    }
  }

  document.getElementById('sRank').textContent = st.rank === null ? '—' : st.rank;
  document.getElementById('sFree').textContent = st.freeDim === null ? '—' : st.freeDim;
  document.getElementById('sPin').innerHTML = Object.keys(st.pins).length + '<small> / 36</small>';
  document.getElementById('sGuess').textContent = st.guessCount;

  const [tag, mood, text] = narrate(st);
  const n = document.getElementById('narrate');
  n.className = 'narrate' + (mood ? ' ' + mood : '');
  n.querySelector('.tag').textContent = tag || '·';
  document.getElementById('narrateText').textContent = text;

  document.getElementById('scrub').value = cursor;
  document.getElementById('evPos').textContent = `event ${cursor + 1} / ${current.events.length}`;
}

function stop() {
  playing = false;
  clearInterval(timer);
  document.getElementById('playBtn').textContent = 'Play';
}
function play() {
  if (cursor >= current.events.length - 1) cursor = 0;
  playing = true;
  document.getElementById('playBtn').textContent = 'Pause';
  clearInterval(timer);
  timer = setInterval(() => {
    if (cursor >= current.events.length - 1) { stop(); render(); return; }
    cursor++;
    render();
  }, Number(document.getElementById('speed').value));
}

function loadPuzzle(puzzle) {
  stop();
  const res = solve(puzzle.givens, puzzle.clues, { limit: 1, trace: true });
  const events = res.trace.events;
  const maxRows = events.filter(e => e.type === 'row_added').length;

  current = {
    puzzle,
    events,
    cells: mountBoard(puzzle),
    matrix: mountMatrix(maxRows),
  };
  lastClass = [];
  cursor = 0;

  const scrub = document.getElementById('scrub');
  scrub.max = events.length - 1;
  scrub.value = 0;

  const bounds = [];
  events.forEach((e, i) => { if (e.type === 'phase') bounds.push([i, e.phase]); });
  const total = events.length;
  const colors = { assemble:'var(--blk-clue)', eliminate:'var(--pivot)', search:'var(--guess)' };
  let stopsCss = [];
  for (let i = 0; i < bounds.length; i++) {
    const start = (bounds[i][0] / total) * 100;
    const end = (i + 1 < bounds.length ? bounds[i+1][0] / total : 1) * 100;
    stopsCss.push(`${colors[bounds[i][1]]} ${start}% ${end}%`);
  }
  document.getElementById('phasebar').style.background =
    stopsCss.length ? `linear-gradient(90deg,${stopsCss.join(',')})` : 'var(--card)';

  render();
}

document.getElementById('playBtn').addEventListener('click', () => playing ? stop() : play());
document.getElementById('stepFwd').addEventListener('click', () => {
  stop(); if (cursor < current.events.length - 1) { cursor++; render(); }
});
document.getElementById('stepBack').addEventListener('click', () => {
  stop(); if (cursor > 0) { cursor--; render(); }
});
document.getElementById('reset').addEventListener('click', () => { stop(); cursor = 0; render(); });
document.getElementById('toSearch').addEventListener('click', () => {
  stop();
  const i = current.events.findIndex(e => e.type === 'phase' && e.phase === 'search');
  cursor = i === -1 ? current.events.length - 1 : i;
  render();
});
document.getElementById('scrub').addEventListener('input', (ev) => {
  stop(); cursor = Number(ev.target.value); render();
});
document.getElementById('speed').addEventListener('change', () => { if (playing) play(); });
document.addEventListener('keydown', (ev) => {
  if (ev.key === ' ') { ev.preventDefault(); playing ? stop() : play(); }
  if (ev.key === 'ArrowRight') { stop(); if (cursor < current.events.length-1) { cursor++; render(); } }
  if (ev.key === 'ArrowLeft') { stop(); if (cursor > 0) { cursor--; render(); } }
});

/* ==== live data source: chrome.storage.local, written by content.js ==== */
function showPuzzle(stored) {
  if (!stored) {
    document.getElementById('emptyState').style.display = '';
    document.getElementById('app').style.display = 'none';
    return;
  }
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('app').style.display = '';
  document.getElementById('subtitle').textContent =
    `Watching the puzzle open on 8tango.com fall out of a linear system over F₂ (rank ${stored.rank}, free dim ${stored.freeDim}). The card on the right is the augmented matrix [A | b].`;
  loadPuzzle({ givens: stored.givens, clues: stored.clues });
}

chrome.storage.local.get('affineTangoPuzzle', ({ affineTangoPuzzle }) => showPuzzle(affineTangoPuzzle));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.affineTangoPuzzle) showPuzzle(changes.affineTangoPuzzle.newValue);
});
