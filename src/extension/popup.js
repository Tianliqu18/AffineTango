/**
 * Popup script. Runs as a normal extension page (not a content script), so
 * it has full chrome.* access -- unlike content.js, no isolated-world issues
 * reading state, but for the same reason it can't see window.game either;
 * everything here goes through chrome.storage (status) or chrome.tabs
 * messaging (telling the content script to act).
 */

const statusEl = document.getElementById('status');
const watchBtn = document.getElementById('watchBtn');
const autoBtn = document.getElementById('autoBtn');
const autoStatusEl = document.getElementById('autoStatus');

function renderStatus(html) {
  statusEl.innerHTML = html;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isSupportedHost(url) {
  if (!url) return false;
  const { hostname } = new URL(url);
  return hostname === '8tango.com' || hostname === 'www.8tango.com'
    || hostname === 'www.linkedin.com' || hostname === 'linkedin.com';
}

async function init() {
  const tab = await activeTab();
  console.log('[affine-tango popup] tab:', tab);

  if (!tab || !isSupportedHost(tab.url)) {
    renderStatus(`<div class="msg">Open a puzzle on 8tango.com (Free Play) to use this.<br><small>debug: tab.url = ${tab?.url ?? 'undefined'}</small></div>`);
    return;
  }

  const { affineTangoPuzzle } = await chrome.storage.local.get('affineTangoPuzzle');

  if (!affineTangoPuzzle) {
    renderStatus('<div class="msg">On 8tango.com, but no puzzle solved yet. Reload the tab.</div>');
    return;
  }

  renderStatus(`
    <div class="row"><span class="k">Rank</span><span>${affineTangoPuzzle.rank}</span></div>
    <div class="row"><span class="k">Free dim</span><span>${affineTangoPuzzle.freeDim}</span></div>
    <div class="row"><span class="k">Cells to fill</span><span>${affineTangoPuzzle.blankCount}</span></div>
  `);

  watchBtn.disabled = false;
  autoBtn.disabled = affineTangoPuzzle.blankCount === 0;
  if (affineTangoPuzzle.blankCount === 0) autoStatusEl.textContent = 'already complete';

  watchBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dist/live-harness.html') });
  });

  autoBtn.addEventListener('click', () => {
    autoBtn.disabled = true;
    autoStatusEl.textContent = 'filling in…';
    chrome.tabs.sendMessage(tab.id, { type: 'AUTO_SOLVE' }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        autoStatusEl.textContent = 'failed — reload the tab and try again';
        autoBtn.disabled = false;
        return;
      }
      autoStatusEl.textContent = `filled ${response.filled} cells`;
    });
  });
}

init();
