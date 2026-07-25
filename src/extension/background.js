/**
 * Background service worker. Exists solely to dispatch OS-trusted clicks via
 * chrome.debugger: LinkedIn's Tango board ignores content-script clicks
 * entirely (confirmed live -- neither .click() nor a full synthetic
 * pointerdown/mousedown/pointerup/mouseup/click sequence at the right
 * coordinates changes a cell's state), unlike 8tango.com, which doesn't
 * check event.isTrusted at all. chrome.debugger's Input.dispatchMouseEvent
 * is the only extension-accessible way to produce a click Chrome marks
 * trusted, but it's only callable from an extension page/background, not a
 * content script -- hence this file.
 *
 * Attaching shows Chrome's persistent "<ext> started debugging this
 * browser" banner on the tab; we attach right before a fill batch and
 * detach immediately after, rather than holding it for the tab's lifetime.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'DEBUGGER_CLICK_BATCH') return false;
  const tabId = sender.tab?.id;
  if (!tabId) {
    sendResponse({ ok: false, reason: 'no tab id on sender' });
    return false;
  }

  clickBatch(tabId, message.points)
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, reason: String(err?.message ?? err) }));

  return true; // keep the message channel open for the async sendResponse
});

async function clickBatch(tabId, points) {
  await chrome.debugger.attach({ tabId }, '1.3');
  try {
    for (const { x, y, button = 'left' } of points) {
      await dispatch(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
      await sleep(30);
      await dispatch(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 });
      await sleep(30);
      await dispatch(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 });
      await sleep(40);
    }
  } finally {
    await chrome.debugger.detach({ tabId });
  }
}

function dispatch(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
