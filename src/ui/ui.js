// STUB — replaced by the UI agent. Full API: docs/TECH.md §6.1 (dialogue), §15 (screens).
// Resolves everything immediately and logs, so engine/scripts are testable headless.
const log = (...a) => console.log('[ui]', ...a);
export const ui = {
  init() {}, update() {}, render() {},
  isBusy() { return false; },
  async say(who, expr, text) { log(`${who}(${expr}): ${text}`); },
  async think(expr, text) { log(`(tess thinks, ${expr}): ${text}`); },
  async narrate(text) { log(`* ${text}`); },
  async choice(options) { log('choice', options); return 0; },
  async doc(id) { log('doc', id); },
  toast(text) { log('toast', text); },
  objective(text) { log('objective', text); },
  async card(title, sub) { log('card', title, sub || ''); },
  async cg(id) { log('cg', id); },
  async open(name, args) { log('open', name, args); return null; },
  prompt() {},
  async title() { log('title'); },
  async gameOver(reason) { log('gameover', reason); return 'retry'; },
};
export default ui;
