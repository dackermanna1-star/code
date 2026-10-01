// Verifies that core combo routes connect for both characters (training dummy).
const fs = require('fs'), path = require('path'), vm = require('vm');
globalThis.JJK = { HEADLESS: true };
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const f of [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((f) => !/src\/main\.js|menus\.js/.test(f))) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
const B = JJK.BTN;
const BT = { L: B.L, M: B.M, H: B.H, SP: B.SP, SU: B.SU };
function run(char, label, script, gap = 0) {
  const c1 = new JJK.Controller(null, -1), c2 = new JJK.Controller(null, -1);
  c1.virtual = { dir: 5, held: 0 }; c2.virtual = { dir: 5, held: 0 };
  const m = new JJK.Battle({ mode: 'training', p1: { char, ctrl: c1 }, p2: { char: char === 'gojo' ? 'sukuna' : 'gojo', ctrl: c2 } });
  const [a, b] = m.fighters;
  a.x = -100; b.x = a.x + 2 * JJK.PUSH_W + gap;
  for (let i = 0; i < 3; i++) m.tick();
  // script: list of [dir, btn] issued as soon as the previous move made contact (or at start)
  let si = 0, wait = 0, hits = 0, maxCombo = 0;
  for (let t = 0; t < 400; t++) {
    let held = 0, dir = 5;
    const step = script[si];
    if (step && wait <= 0) {
      const ready = si === 0 ? a.actionable : (a.st === 'move' && a.contact === 'hit' && a.hitstop <= 1) || (step[2] === 'air' && a.st === 'air' && a.sf > 4);
      if (ready) {
        dir = step[0];
        for (const k of step[1].split('+')) if (BT[k]) held |= BT[k];
        if (step[3]) { /* motion prefix */ }
        si++; wait = 2;
      }
    }
    if (step && step[3] && wait <= 0) dir = step[0];
    wait--;
    c1.virtual = { dir, held };
    m.tick();
    maxCombo = Math.max(maxCombo, b.combo.hits);
  }
  const ok = maxCombo >= script.length;
  console.log((ok ? 'PASS ' : 'FAIL ') + (char + ' ' + label).padEnd(30) + ' hits=' + maxCombo + '/' + script.length);
  return ok;
}
// motion specials are fed through the virtual pad over several frames by a helper
function seq(char, label, frames) {
  const c1 = new JJK.Controller(null, -1), c2 = new JJK.Controller(null, -1);
  c1.virtual = { dir: 5, held: 0 }; c2.virtual = { dir: 5, held: 0 };
  const m = new JJK.Battle({ mode: 'training', p1: { char, ctrl: c1 }, p2: { char: char === 'gojo' ? 'sukuna' : 'gojo', ctrl: c2 } });
  const [a, b] = m.fighters;
  a.x = -100; b.x = a.x + 2 * JJK.PUSH_W;
  for (let i = 0; i < 3; i++) m.tick();
  let maxCombo = 0, dmg = 0;
  let queue = [];
  let idx = 0, lastMove = null, lastHits = -1;
  for (let t = 0; t < 500; t++) {
    if (!queue.length && idx < frames.length) {
      const f = frames[idx];
      // advance only once the previously issued move has started and connected
      const fresh = a.move && a.move !== lastMove;
      const connected = a.st === 'move' && a.contact === 'hit' && a.hitstop <= 2 && (fresh || b.combo.hits > lastHits);
      const canGo = idx === 0 || (f.link ? a.actionable && b.isStunned() : connected) || (f.air && a.st === 'air' && a.sf > 3);
      if (canGo) { queue = f.steps.slice(); idx++; lastMove = a.move; lastHits = b.combo.hits; }
    }
    const s = queue.shift() || { d: a.st === 'air' ? 5 : 5, b: 0 };
    c1.virtual = { dir: s.d, held: s.b || 0 };
    m.tick();
    if (b.combo.hits > maxCombo) { maxCombo = b.combo.hits; dmg = b.combo.dmg; }
  }
  const need = frames.reduce((n, f) => n + (f.hits || 1), 0);
  const ok = maxCombo >= need;
  console.log((ok ? 'PASS ' : 'FAIL ') + (char + ' ' + label).padEnd(30) + ' hits=' + maxCombo + '/' + need + ' dmg=' + dmg);
  return ok;
}
const P = (d, b) => ({ steps: [{ d, b: BT[b] }] });
const M = (motion, b, hits) => ({ steps: motion.split('').map((d, i, arr) => ({ d: +d, b: i === arr.length - 1 ? BT[b] : 0 })), hits });
const J = { steps: [{ d: 9 }, { d: 9 }, { d: 9 }], hits: 0, air: false };
let fails = 0;
const T = (ok) => { if (!ok) fails++; };
T(seq('gojo', '5L>5M>5H', [P(5, 'L'), P(5, 'M'), P(5, 'H')]));
T(seq('gojo', '5L>5M>5H>214SP', [P(5, 'L'), P(5, 'M'), P(5, 'H'), M('214', 'SP')]));
T(seq('gojo', '2L>2M>2SP (Red Launcher)', [P(2, 'L'), P(2, 'M'), P(2, 'SP')]));
T(seq('gojo', '5M>5H>214SP (Red)', [P(5, 'M'), P(5, 'H'), M('214', 'SP')]));
T(seq('gojo', '5M>2H>jc j.M>j.H', [P(5, 'M'), P(2, 'H'), { steps: [{ d: 9 }, { d: 9 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5, b: BT.M }], hits: 1 }, { steps: [{ d: 5, b: BT.H }], hits: 1 }]));
T(seq('gojo', '5M>5H>214SU (Max Red)', [P(5, 'M'), P(5, 'H'), M('214', 'SU')]));
T(seq('gojo', '5M>5SP (Blue Pull), link 5M>5H', [P(5, 'M'), P(5, 'SP'), Object.assign(P(5, 'M'), { link: true }), P(5, 'H')]));
T(seq('sukuna', '5L>5M>5H', [P(5, 'L'), P(5, 'M'), P(5, 'H')]));
T(seq('sukuna', '5L>5M>5H>214SP (Cleave)', [P(5, 'L'), P(5, 'M'), P(5, 'H'), M('214', 'SP', 3)]));
T(seq('sukuna', '2L>2M>236SP', [P(2, 'L'), P(2, 'M'), M('236', 'SP')]));
T(seq('sukuna', '5M>5H>214SU (Enh. Cleave)', [P(5, 'M'), P(5, 'H'), M('214', 'SU', 5)]));
T(seq('sukuna', '5M>2H>jc j.M>j.H', [P(5, 'M'), P(2, 'H'), { steps: [{ d: 9 }, { d: 9 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5 }, { d: 5, b: BT.M }], hits: 1 }, { steps: [{ d: 5, b: BT.H }], hits: 1 }]));
console.log(fails ? fails + ' combo(s) failed' : 'all combos connect');
process.exitCode = fails ? 1 : 0;
void run;
