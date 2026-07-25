/**
 * Build the standalone harness page.
 *
 * The harness has to be a single self-contained file (no server, no module
 * resolution), but src/core stays the only source of truth. So we read the
 * modules, strip their import/export syntax, concatenate in dependency order,
 * and inject the result into the template.
 *
 *   node tools/build-harness.js  ->  harness.html
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// dependency order: encode and trace are leaves, solve is the root
const ORDER = ['encode.js', 'trace.js', 'gf2.js', 'search.js', 'solve.js'];

function strip(src) {
  return src
    // whole-line imports
    .replace(/^\s*import\s+[^;]*?from\s+'[^']*';\s*$/gm, '')
    // re-export and bare export blocks, with or without a source
    .replace(/^\s*export\s*\{[^}]*\}\s*(?:from\s+'[^']*')?;\s*$/gm, '')
    // export declarations become plain declarations
    .replace(/^\s*export\s+(function|const|class|let|var)\b/gm, '$1')
    .trim();
}

const solver = ORDER
  .map((f) => {
    const src = readFileSync(join(root, 'src', 'core', f), 'utf8');
    return `/* ---- src/core/${f} ---- */\n${strip(src)}`;
  })
  .join('\n\n');

const puzzles = readFileSync(join(here, 'puzzles.json'), 'utf8');
const template = readFileSync(join(here, 'harness-template.html'), 'utf8');

const out = template
  .replace('/*__SOLVER__*/', solver)
  .replace('/*__PUZZLES__*/', puzzles);

const dest = join(root, 'harness.html');
writeFileSync(dest, out);

console.log(`harness.html written (${(out.length / 1024).toFixed(1)} kb)`);
console.log(`  solver: ${ORDER.length} modules, ${(solver.length / 1024).toFixed(1)} kb`);
console.log(`  puzzles: ${JSON.parse(puzzles).length}`);

// Smoke test: the inlined solver must still parse and produce a trace.
const check = new Function(`${solver}\nreturn solve(arguments[0], arguments[1], {limit:1, trace:true});`);
const p = JSON.parse(puzzles)[0];
const res = check(p.givens, p.clues);
console.log(`  smoke test: rank ${res.rank}, freeDim ${res.freeDim}, ` +
            `${Object.keys(res.pins).length} pinned, ${res.trace.events.length} events, ` +
            `${res.solutions.length} solution`);
if (res.trace.events.length === 0) { console.error('  FAIL: empty trace'); process.exit(1); }
