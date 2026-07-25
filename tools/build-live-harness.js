/**
 * Build the extension's live derivation page: dist/live-harness.html plus
 * dist/live-harness.js. Two files, not one self-contained HTML file like
 * build-harness.js produces, because extension pages get Manifest V3's
 * default CSP (script-src 'self'), which blocks inline <script> content --
 * only externally loaded scripts are allowed.
 *
 *   node tools/build-live-harness.js  ->  dist/live-harness.html + .js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const ORDER = ['encode.js', 'trace.js', 'gf2.js', 'search.js', 'solve.js'];

function strip(src) {
  return src
    .replace(/^\s*import\s+[^;]*?from\s+'[^']*';\s*$/gm, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*(?:from\s+'[^']*')?;\s*$/gm, '')
    .replace(/^\s*export\s+(function|const|class|let|var)\b/gm, '$1')
    .trim();
}

const solver = ORDER
  .map((f) => {
    const src = readFileSync(join(root, 'src', 'core', f), 'utf8');
    return `/* ---- src/core/${f} ---- */\n${strip(src)}`;
  })
  .join('\n\n');

const jsTemplate = readFileSync(join(here, 'live-harness.template.js'), 'utf8');
const js = jsTemplate.replace('/*__SOLVER__*/', solver);

const html = readFileSync(join(here, 'live-harness-template.html'), 'utf8');

const distDir = join(root, 'dist');
mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, 'live-harness.html'), html);
writeFileSync(join(distDir, 'live-harness.js'), js);

console.log(`live-harness.html written (${(html.length / 1024).toFixed(1)} kb)`);
console.log(`live-harness.js written (${(js.length / 1024).toFixed(1)} kb)`);
