/**
 * Runs in the page's MAIN world (see manifest.json's second content_scripts
 * entry) rather than the extension's isolated world. Isolated-world content
 * scripts share the DOM with the page but not page-defined JS globals, so
 * window.game -- set by 8tango's own script -- is invisible to 8tango.js.
 * This bridges the two worlds over a DOM CustomEvent, which both worlds do
 * share.
 */

window.addEventListener('affine-tango:request-board', () => {
  const detail = window.game
    ? {
        boardSize: window.game.BOARD_SIZE,
        spaces: window.game.board?.spaces,
        modifiers: window.game.board?.modifiers,
        prefilled: window.game.prefilled,
      }
    : null;
  window.dispatchEvent(new CustomEvent('affine-tango:board', { detail }));
});
