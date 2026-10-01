// Deterministic per-tick input tests: feeds exact frame sequences into the
// controller and checks which move starts. Usage: node tools/motion-test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
globalThis.JJK = { HEADLESS: true };
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const f of [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((f) => !/src\/main\.js|menus\.js/.test(f))) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
}
const B = JJK.BTN;
const BT = { L: B.L, M: B.M, H: B.H, SP: B.SP, SU: B.SU, UN: B.UN };
// frame spec: "2" (dir held), "6+SP" (dir + button), repeated by "*n"
function frames(spec) {
  const out = [];
  for (const tok of spec.split(' ')) {
    let [body, rep] = tok.split('*');
    const [d, ...btns] = body.split('+');
    let held = 0;
    for (const b of btns) held |= BT[b];
    for (let i = 0; i < (+rep || 1); i++) out.push({ dir: +d, held });
  }
  return out;
}
let pass = 0, fail = 0;
function test(char, label, spec, expect, setup, anyPos) {
  const c1 = new JJK.Controller(null, -1), c2 = new JJK.Controller(null, -1);
  c1.virtual = { dir: 5, held: 0 }; c2.virtual = { dir: 5, held: 0 };
  const m = new JJK.Battle({ mode: 'training', p1: { char, ctrl: c1 }, p2: { char: char === 'gojo' ? 'sukuna' : 'gojo', ctrl: c2 } });
  const f = m.fighters[0];
  if (setup) setup(m, f);
  const log = [];
  const o = f.startMove.bind(f);
  f.startMove = (id, op) => { log.push(id); return o(id, op); };
  for (const fr of frames(spec + ' 5*30')) { c1.virtual = fr; m.tick(); }
  const ok = log.includes(expect) && (log[0] === expect || expect === log.find((x) => x === expect));
  const first = log[0];
  const good = anyPos ? log[log.length - 1] === expect || (log.includes(expect) && log.indexOf(expect) === log.length - 1) || log.slice(-2).includes(expect) : first === expect;
  if (good) pass++; else fail++;
  console.log((good ? 'PASS ' : 'FAIL ') + (char + ' ' + label).padEnd(34) + ' -> ' + JSON.stringify(log.slice(0, 4)) + (ok && !good ? ' (not first)' : ''));
}
// numpad dirs are absolute; P1 faces right so absolute == relative
test('gojo', '5L', '5 5+L', '5L');
test('gojo', '2H', '2 2+H', '2H');
test('gojo', '6H', '6 6+H', '6H');
test('gojo', '236SP', '2*2 3*2 6 6+SP', 'blue');
test('gojo', '236SP no diagonal', '2*2 6*2 6+SP', 'blue');
test('gojo', '214SP', '2*2 1*2 4 4+SP', 'red');
test('gojo', '22SP', '2*2 5*2 2*2 2+SP', 'teleport');
test('gojo', '623SU', '6*2 2*2 3 3+SU', 'purple');
test('gojo', 'walk then 236SP', '6*10 2*2 3*2 6+SP', 'blue');
test('gojo', '214SU maxRed', '2*2 1 4 4+SU', 'maxRed');
test('gojo', '236SU blueCrush', '2*2 3 6 6+SU', 'blueCrush');
test('gojo', '2SU exRedBurst', '2*3 2+SU', 'exRedBurst');
test('gojo', '4SP blueCounter', '4*3 4+SP', 'blueCounter');
test('gojo', '6SP blueRush', '6*3 6+SP', 'blueRush');
test('gojo', '5SP bluePull', '5 5+SP', 'bluePull');
test('gojo', 'SP+SU domain', '5 5+SP+SU', 'domain');
test('gojo', 'L+M throw', '5 5+L+M', 'throw');
test('gojo', 'M+H parry', '5 5+M+H', 'parry');
test('gojo', '66 dash', '6*2 5*2 6*3', 'dashF');
test('gojo', '44 backdash', '4*2 5*2 4*3', 'dashB');
test('gojo', 'jump j.H', '9*6 5*4 5+H', 'jH');
test('gojo', 'j.236SP air blue', '9*6 5*3 2*2 3 6 6+SP', 'jBlue');
test('sukuna', '236SP', '2*2 3*2 6 6+SP', 'dismantle');
test('sukuna', '214SP', '2*2 1*2 4 4+SP', 'cleave');
test('sukuna', '63214SP', '6*2 3 2*2 1 4 4+SP', 'grabCleave');
test('sukuna', '63214SU', '6*2 3 2*2 1 4 4+SU', 'exGrab');
test('sukuna', '22SP fuga', '2*2 5*2 2*2 2+SP', 'fuga');
test('sukuna', '623SU WCS', '6*2 2*2 3 3+SU', 'wcs');
test('sukuna', '214SU enhanced', '2*2 1 4 4+SU', 'enhancedCleave');
test('sukuna', '2SP cross', '2*3 2+SP', 'cross');
test('sukuna', '6SP lunge', '6*3 6+SP', 'lunge');
test('sukuna', 'SP+SU domain', '5 5+SP+SU', 'domain');
test('sukuna', '6H heel drop', '6 6+H', '6H');
test('sukuna', '2L', '2 2+L', '2L');
// upgrade window: early/late presses resolve to the stronger command
test('gojo', 'SP then SU next frame', '5 5+SP 5+SP+SU', 'domain', null, true);
test('gojo', '23+SP then 6 (lenient)', '2*2 3 3+SP 6 6', 'blue', null, true);
test('gojo', 'L then M (throw)', '5 5+L 5+L+M', 'throw', null, true);
test('sukuna', '23+SP then 6 (lenient)', '2*2 3 3+SP 6 6', 'dismantle', null, true);
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;

// Black Flash timing test: 5M hit, then H pressed on the exact frame hit-stop ends
{
  const c1 = new JJK.Controller(null, -1), c2 = new JJK.Controller(null, -1);
  c1.virtual = { dir: 5, held: 0 }; c2.virtual = { dir: 5, held: 0 };
  const m = new JJK.Battle({ mode: 'training', p1: { char: 'gojo', ctrl: c1 }, p2: { char: 'sukuna', ctrl: c2 } });
  const [a, b] = m.fighters;
  b.x = a.x + 70;
  let bf = false, pressed = false;
  const oc = JJK.Combat.blackFlash;
  JJK.Combat.blackFlash = (...args) => { bf = true; return oc(...args); };
  for (let i = 0; i < 80; i++) {
    let held = 0;
    if (i === 1) held = B.M;
    if (!pressed && a.contact === 'hit' && a.hitstop === 1) { held = B.H; pressed = true; }
    c1.virtual = { dir: 5, held };
    m.tick();
  }
  console.log((bf ? 'PASS' : 'FAIL') + ' black flash just-frame', 'dmg taken', b.combo.dmg || '(combo ended)', 'hp', b.hp);
  // mistimed: H pressed 4 frames late -> no black flash
  const m2 = new JJK.Battle({ mode: 'training', p1: { char: 'gojo', ctrl: c1 }, p2: { char: 'sukuna', ctrl: c2 } });
  const [a2, b2] = m2.fighters; b2.x = a2.x + 70; bf = false; let late = -1;
  for (let i = 0; i < 80; i++) {
    let held = 0;
    if (i === 1) held = B.M;
    if (late < 0 && a2.contact === 'hit' && a2.hitstop === 0) late = i + 4;
    if (i === late) held = B.H;
    c1.virtual = { dir: 5, held };
    m2.tick();
  }
  console.log((!bf ? 'PASS' : 'FAIL') + ' no black flash when mistimed');
}
