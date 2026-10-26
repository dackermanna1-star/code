// Toys, fidgets, instruments, blind boxes & trading cards, RC vehicles.
import * as THREE from 'three';
import { G } from '../../game.js';
import { worldPos, itemYaw } from './home.js';
import { consumeUse, usesLeft } from './util.js';
import { pick, rand, clamp } from '../../core/utils.js';
import { tween, Ease } from '../../core/tween.js';
import { NOTE } from '../../core/audio.js';
import { ITEMS, RARITY } from '../registry.js';

function fun(n, key = 'toy') { G.needs.add({ fun: n }); G.events.emit('act', 'play', { kind: key }); }

// ---------------------------------------------------------------- fidget spinner
const spinner = {
  init(inst) { inst.runtime.speed = 0; },
  held(inst) { return [{ key: 'LMB', label: inst.runtime.speed > 5 ? 'Flick faster!' : 'Flick it', run: () => spinner.flick(inst) }]; },
  world(inst) { return [{ key: 'F', label: 'Spin it', run: () => spinner.flick(inst) }]; },
  flick(inst) {
    inst.runtime.speed = Math.min(70, (inst.runtime.speed || 0) + 24);
    G.audio.play('click', { pitch: 1.6 });
    if (!inst.runtime.snd) inst.runtime.snd = G.audio.loop('spinner', { volume: 0.5, pos: G.hand.held === inst ? null : worldPos(inst) });
    if (G.hand.held === inst) G.hand.play('flick');
    fun(1.5, 'spinner');
    if (inst.runtime.speed >= 68) { G.events.emit('act', 'maxSpin'); G.particles.sparkle(G.hand.held === inst ? G.hand.tipWorld() : worldPos(inst, [0, 0.05, 0]), 6); }
  },
  update(inst, dt) {
    const r = inst.model.getObjectByName('rotor');
    inst.runtime.speed *= Math.exp(-dt * 0.22);
    if (inst.runtime.speed < 0.3) inst.runtime.speed = 0;
    if (r) r.rotation.y += inst.runtime.speed * dt;
    if (inst.runtime.snd) {
      inst.runtime.snd.setParam('rate', clamp(inst.runtime.speed / 60, 0, 1.2));
      if (inst.runtime.speed === 0) { inst.runtime.snd.stop(); inst.runtime.snd = null; }
    }
  },
  onUnhold(inst) { inst.runtime.snd?.stop(); inst.runtime.snd = null; },
  dispose(inst) { inst.runtime.snd?.stop(); },
};

// ---------------------------------------------------------------- bubble wand
const bubbles = {
  subtitle: (inst) => `${usesLeft(inst)} blows of solution left`,
  held(inst) { return [{ key: 'LMB', label: 'Blow bubbles', run: () => bubbles.blow(inst) }]; },
  async blow(inst) {
    if (G.hand.busy) return;
    G.hand.busy = true;
    G.audio.play('whoosh', { pitch: 1.6, volume: 0.4 });
    const fwd = G.hand.forwardWorld();
    const n = inst.def.use.count || 14;
    const color = inst.def.use.tint;
    let i = 0;
    const iv = setInterval(() => {
      const tip = G.hand.tipWorld(new THREE.Vector3(0, (inst.def._bounds?.size.y || 0.25) * 0.9, 0));
      const v = fwd.clone().multiplyScalar(rand(0.4, 1.0)).add(new THREE.Vector3(rand(-0.25, 0.25), rand(0.05, 0.3), rand(-0.25, 0.25)));
      G.particles.bubble(tip, v, { size: rand(0.03, inst.def.use.big ? 0.16 : 0.08), life: rand(2.5, 6), onDie: (q) => { G.audio.play('bubblepop', { pos: new THREE.Vector3(q.x, q.y, q.z), volume: 0.5 }); G.particles.mist(new THREE.Vector3(q.x, q.y, q.z), new THREE.Vector3(0, -1, 0), 3, color || '#e8f6ff', { speed: 0.3, alpha: 0.25, sizeEnd: 0.04, life: 0.3 }); } });
      if (++i >= n) clearInterval(iv);
    }, 60);
    await G.hand.play('wave', { duration: 0.9 });
    G.hand.busy = false;
    fun(3, 'bubbles');
    consumeUse(inst);
  },
};

// ---------------------------------------------------------------- balls
const ball = {
  held() { return [{ key: 'LMB', label: 'Toss it', run: () => G.interaction.throwHeld(0.55) }]; },
  world(inst) { return [{ key: 'F', label: 'Kick', run: () => ball.kick(inst) }]; },
  kick(inst) {
    const p = inst.object.position.clone();
    const dir = p.clone().sub(G.player.pos).setY(0).normalize();
    G.physics.launch(inst, p.add(new THREE.Vector3(0, 0.02, 0)), dir.multiplyScalar(rand(3.5, 5.5)).add(new THREE.Vector3(0, rand(1.2, 2.5), 0)));
    G.audio.play('thud', { pos: p, impact: 0.8, pitch: 1.3 });
    fun(2, 'ball');
  },
};

// ---------------------------------------------------------------- yo-yo
const yoyo = {
  held(inst) { return [{ key: 'LMB', label: 'Throw down', run: () => yoyo.go(inst) }]; },
  async go(inst) {
    if (G.hand.busy) return;
    G.hand.busy = true;
    const y = inst.model.getObjectByName('yoyo'), s = inst.model.getObjectByName('string');
    G.audio.play('whoosh', { pitch: 1.8, volume: 0.3 });
    await new Promise((res) => tween({ duration: 1.2, ease: (t) => t, update: (t) => {
      const k = Math.sin(t * Math.PI);
      if (y) { y.position.y = -k * 2.2; y.rotation.z += 0.6; }
      if (s) { s.scale.y = 0.01 + k * 2.2 / 0.1; s.position.y = -k * 1.1; }
    }, done: res }));
    G.audio.play('click', { pitch: 2 });
    G.hand.busy = false;
    fun(2, 'yoyo');
  },
};

// ---------------------------------------------------------------- squeezables
const squeak = {
  held(inst) { return [{ key: 'LMB', label: inst.def.use.verb || 'Squeeze', run: () => squeak.go(inst) }]; },
  world(inst) { return [{ key: 'F', label: inst.def.use.verb || 'Squeeze', run: () => squeak.go(inst) }]; },
  go(inst) {
    const m = inst.model;
    G.audio.play(inst.def.use.sound || 'squeak', { pitch: rand(0.85, 1.2), pos: G.hand.held === inst ? null : worldPos(inst) });
    tween({ duration: 0.35, ease: Ease.outElastic, update: (t) => { const k = 1 - Math.sin(Math.min(1, t * 2) * Math.PI) * 0.25; m.scale.set(1 + (1 - k) * 0.6, k, 1 + (1 - k) * 0.6); }, done: () => m.scale.set(1, 1, 1) });
    if (G.hand.held === inst) G.hand.play('squeeze');
    G.needs.add({ fun: inst.def.use.fun ?? 1.5, comfort: inst.def.use.comfort ?? 1 });
    G.events.emit('act', 'play', { kind: 'squeeze' });
  },
};

// ---------------------------------------------------------------- puzzle cube
const cube = {
  subtitle: (inst) => (inst.st.solved ? 'Solved! ✨' : `${inst.st.twists || 0} twists`),
  held(inst) { return [{ key: 'LMB', label: inst.st.solved ? 'Scramble' : 'Twist', run: () => cube.twist(inst) }]; },
  twist(inst) {
    const layer = inst.model.getObjectByName('layer');
    if (inst.st.solved) { inst.st.solved = false; inst.st.twists = 0; }
    inst.st.twists = (inst.st.twists || 0) + 1;
    G.audio.play('click', { pitch: rand(0.8, 1.1) });
    G.audio.play('type', { delay: 0.05 });
    if (layer) { const from = layer.rotation.y; tween({ duration: 0.18, ease: Ease.outCubic, update: (t, e) => { layer.rotation.y = from + e * Math.PI / 2; } }); }
    G.needs.add({ fun: 0.6 });
    if (inst.st.twists > 18 && Math.random() < 0.08) {
      inst.st.solved = true;
      G.audio.play('reveal');
      G.particles.confetti(G.hand.tipWorld(), 30);
      G.ui.toast(`You solved the ${inst.def.name}! 🧠`, { icon: '🏆', kind: 'good' });
      fun(15, 'cubeSolved');
      G.events.emit('act', 'solveCube');
    }
  },
};

// ---------------------------------------------------------------- snow globe
const snowglobe = {
  init(inst) {
    const u = inst.def.use;
    const N = 70; const pos = new Float32Array(N * 3);
    const r = u.r || 0.06;
    for (let i = 0; i < N; i++) { pos[i * 3] = rand(-r, r) * 0.7; pos[i * 3 + 1] = rand(-r, -r * 0.6); pos[i * 3 + 2] = rand(-r, r) * 0.7; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: u.flake || '#ffffff', size: 0.006, sizeAttenuation: true, transparent: true, opacity: 0.95 }));
    p.position.set(...(u.center || [0, 0.1, 0]));
    inst.model.add(p);
    inst.runtime.snow = { p, vel: new Float32Array(N * 3), r };
  },
  held(inst) { return [{ key: 'LMB', label: 'Shake it', run: () => snowglobe.shake(inst) }]; },
  world(inst) { return [{ key: 'F', label: 'Shake it', run: () => { G.items.pickUp(inst); snowglobe.shake(inst); } }]; },
  async shake(inst) {
    if (G.hand.busy) return;
    G.hand.busy = true;
    G.audio.play('chime'); G.audio.play('chime', { delay: 0.3, pitch: 1.5 });
    const s = inst.runtime.snow;
    for (let i = 0; i < s.vel.length; i++) s.vel[i] = rand(-0.6, 0.6) + (i % 3 === 1 ? 0.6 : 0);
    await G.hand.play('shake');
    G.hand.busy = false;
    G.needs.add({ comfort: 4, fun: 2 });
    G.events.emit('act', 'play', { kind: 'snowglobe' });
  },
  update(inst, dt) {
    const s = inst.runtime.snow; if (!s) return;
    const pos = s.p.geometry.attributes.position; const r = s.r;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      s.vel[i * 3] *= 0.97; s.vel[i * 3 + 2] *= 0.97; s.vel[i * 3 + 1] = s.vel[i * 3 + 1] * 0.97 - 0.02 * dt * 10;
      x += s.vel[i * 3] * dt * 0.3; y += s.vel[i * 3 + 1] * dt * 0.3; z += s.vel[i * 3 + 2] * dt * 0.3;
      const l = Math.hypot(x, y, z);
      if (l > r * 0.9) { x *= r * 0.9 / l; y *= r * 0.9 / l; z *= r * 0.9 / l; }
      if (y < -r * 0.75) { y = -r * 0.75; s.vel[i * 3 + 1] = 0; }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  },
};

// ---------------------------------------------------------------- paper plane / frisbee (gliders)
const glider = {
  held() { return [{ key: 'LMB', label: 'Launch it', run: () => G.interaction.throwHeld(0.8) }]; },
};

// ---------------------------------------------------------------- magic 8 ball
const ANSWERS = ['It is certain.', 'Without a doubt.', 'Ask again later.', 'Reply hazy, try again.', 'Don\'t count on it.', 'Outlook good.', 'Very doubtful.', 'Signs point to yes.', 'Better order takeout first.', 'Definitely — after a nap.'];
const eightball = {
  held(inst) { return [{ key: 'LMB', label: 'Ask a question & shake', run: async () => { if (G.hand.busy) return; G.hand.busy = true; await G.hand.play('shake'); G.hand.busy = false; G.audio.play('glug'); G.ui.toast(`🎱 "${pick(ANSWERS)}"`, { duration: 3.5 }); fun(2, 'eightball'); } }]; },
};

// ---------------------------------------------------------------- instruments
const SCALES = { guitar: [0, 3, 5, 7, 10], ukulele: [0, 2, 4, 7, 9], keys: [0, 2, 4, 5, 7, 9, 11], kalimba: [0, 2, 4, 7, 9], harmonica: [0, 2, 4, 5, 7], drums: [0], violin: [0, 2, 3, 5, 7, 8, 10], bass: [0, 3, 5, 7, 10] };
const TIMBRE = { guitar: 'triangle', ukulele: 'triangle', keys: 'sine', kalimba: 'sine', harmonica: 'square', violin: 'sawtooth', bass: 'triangle' };
const instrument = {
  subtitle: (inst) => `Skill ${Math.floor((inst.st.skill || 0))}/10`,
  held(inst) { return [{ key: 'LMB', label: 'Play', run: () => instrument.play(inst) }, { key: 'R', label: 'Practice session', run: () => instrument.practice(inst) }]; },
  world(inst) { return [{ key: 'E', label: 'Play', run: () => instrument.play(inst) }, { key: 'R', label: 'Practice session', run: () => instrument.practice(inst) }]; },
  play(inst, quiet = false) {
    const a = G.audio; if (!a.ready) return;
    const kind = inst.def.use.kind || 'keys';
    const pos = G.hand.held === inst ? null : worldPos(inst, [0, 0.3, 0]);
    const { gain } = a._out({ pos, volume: 0.8 });
    const t = a.ctx.currentTime;
    const sc = SCALES[kind] || SCALES.keys;
    const root = { guitar: 52, ukulele: 60, keys: 60, kalimba: 72, harmonica: 67, violin: 64, bass: 40 }[kind] || 60;
    const skill = inst.st.skill || 0;
    if (kind === 'drums') {
      for (let i = 0; i < 4; i++) a._noiseBurst(gain, t + i * 0.15, { type: i % 2 ? 'highpass' : 'lowpass', freq: i % 2 ? 2000 : 300, dur: 0.12, peak: 0.6 });
    } else if (kind === 'guitar' || kind === 'ukulele') {
      const deg = Math.floor(Math.random() * sc.length);
      for (let i = 0; i < 4; i++) a._tone(gain, t + i * 0.025, { type: TIMBRE[kind], freq: NOTE(root + sc[(deg + i * 2) % sc.length] + (i > 2 ? 12 : 0)), dur: 1.2, peak: 0.12, attack: 0.003 });
    } else {
      const n = 3 + Math.floor(skill / 3);
      let deg = Math.floor(Math.random() * sc.length);
      for (let i = 0; i < n; i++) {
        deg += Math.random() < 0.5 ? 1 : -1;
        const note = root + sc[((deg % sc.length) + sc.length) % sc.length] + 12 * Math.floor(deg / sc.length);
        a._tone(gain, t + i * 0.18, { type: TIMBRE[kind] || 'sine', freq: NOTE(note), dur: kind === 'violin' ? 0.4 : 0.6, peak: kind === 'harmonica' ? 0.05 : 0.14, attack: kind === 'violin' ? 0.05 : 0.004 });
      }
    }
    if (G.hand.held === inst && !quiet) G.hand.play(kind === 'harmonica' ? 'bite' : 'squeeze');
    if (!quiet) { G.needs.add({ fun: 1.5 }); inst.st.skill = Math.min(10, (inst.st.skill || 0) + 0.05); G.events.emit('act', 'instrument', { kind }); }
  },
  async practice(inst) {
    const iv = setInterval(() => instrument.play(inst, true), 800);
    const ok = await G.ui.progress(`Practicing ${inst.def.name}`, 8, { icon: '🎶' });
    clearInterval(iv);
    if (!ok) return;
    const before = Math.floor(inst.st.skill || 0);
    inst.st.skill = Math.min(10, (inst.st.skill || 0) + 0.6);
    G.needs.add({ fun: 10, energy: -3 });
    G.events.emit('act', 'practice', { item: inst.def.id });
    if (Math.floor(inst.st.skill) > before) G.ui.toast(`${inst.def.name} skill up! Level ${Math.floor(inst.st.skill)} 🎵`, { icon: '⭐', kind: 'good' });
  },
};

// ---------------------------------------------------------------- newton's cradle / desk toys
const cradle = {
  world(inst) { return [{ key: 'E', label: 'Set it swinging', run: () => { inst.runtime.t = 0; inst.runtime.on = true; fun(2, 'cradle'); } }]; },
  update(inst, dt) {
    if (!inst.runtime.on) return;
    inst.runtime.t += dt;
    const t = inst.runtime.t;
    const amp = Math.max(0, 0.7 - t * 0.06);
    if (amp <= 0) { inst.runtime.on = false; return; }
    const ph = Math.sin(t * 6);
    const l = inst.model.getObjectByName('pivotL'), r = inst.model.getObjectByName('pivotR');
    if (l) l.rotation.z = ph < 0 ? ph * amp : 0;
    if (r) r.rotation.z = ph > 0 ? ph * amp : 0;
    const last = inst.runtime.lastSign || 0;
    const sgn = Math.sign(ph);
    if (sgn !== last) { G.audio.play('clink', { pos: worldPos(inst), volume: amp, pitch: 1.4 }); inst.runtime.lastSign = sgn; }
  },
};

const dice = {
  held(inst) { return [{ key: 'LMB', label: 'Roll', run: async () => { await G.hand.play('toss'); const n = Math.floor(Math.random() * (inst.def.use.sides || 6)) + 1; G.audio.play('clink', { pitch: 0.7 }); G.ui.toast(`🎲 You rolled a ${n}${n === (inst.def.use.sides || 6) ? '! Lucky!' : ''}`); fun(1, 'dice'); } }]; },
};
const SUITS = ['♠', '♥', '♦', '♣']; const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const cards = {
  held() {
    return [
      { key: 'LMB', label: 'Shuffle', run: async () => { G.hand.play('shake'); for (let i = 0; i < 8; i++) G.audio.play('paper', { delay: i * 0.05, volume: 0.4 }); fun(1, 'cards'); } },
      { key: 'R', label: 'Draw a card', run: () => { G.audio.play('paper'); G.ui.toast(`🃏 ${pick(RANKS)}${pick(SUITS)}`); fun(1, 'cards'); } },
      { key: 'T', label: 'Play solitaire', run: () => G.games.launch('solitaire_lite', {}) },
    ];
  },
};
const slinky = {
  held(inst) { return [{ key: 'LMB', label: 'Bounce it', run: () => { G.audio.play('spring'); tween({ duration: 1.4, ease: (t) => t, update: (t) => { inst.model.scale.y = 1 + Math.sin(t * 25) * 0.6 * (1 - t); } }); fun(1.5, 'slinky'); } }]; },
};
const kendama = {
  held(inst) { return [{ key: 'LMB', label: 'Try a trick', run: async () => { if (G.hand.busy) return; G.hand.busy = true; await G.hand.play('toss'); G.hand.busy = false; const skill = (inst.st.skill || 0); if (Math.random() < 0.35 + skill * 0.05) { G.audio.play('clink'); G.particles.sparkle(G.hand.tipWorld(), 8); G.ui.toast('Nailed it! 🎯'); fun(4, 'kendama'); inst.st.skill = Math.min(10, skill + 0.3); } else { G.audio.play('thud', { soft: true }); G.ui.toast('So close…'); fun(1, 'kendama'); } } }]; },
};
const top = {
  world(inst) { return [{ key: 'E', label: 'Spin the top', run: () => { inst.runtime.spin = 40; G.audio.play('whoosh', { pitch: 2 }); fun(2, 'top'); } }]; },
  update(inst, dt) {
    if (!(inst.runtime.spin > 0)) { inst.model.rotation.z = 0; return; }
    inst.runtime.spin -= dt * 4;
    inst.model.rotation.y += inst.runtime.spin * dt;
    inst.model.rotation.z = Math.max(0, 1 - inst.runtime.spin / 20) * 0.25 * Math.sin(performance.now() * 0.01);
    if (inst.runtime.spin <= 0) { G.audio.play('clink', { pos: worldPos(inst), pitch: 0.7 }); inst.model.rotation.z = 0.35; }
  },
};
const clicker = {
  held(inst) { return [{ key: 'LMB', label: inst.def.use.verb || 'Click', run: () => { G.audio.play(inst.def.use.sound || 'click', { pitch: rand(0.8, 1.6) }); G.hand.play('squeeze'); G.needs.add({ fun: 0.6, comfort: 0.6 }); G.events.emit('act', 'play', { kind: 'fidget' }); } }]; },
};
const kaleidoscope = {
  held() { return [{ key: 'LMB', label: 'Look through', run: () => { G.ui.kaleidoscope(5); G.audio.play('sparkle'); fun(4, 'kaleidoscope'); } }]; },
};

// ---------------------------------------------------------------- blind boxes & trading cards
export const SERIES = {}; // seriesId -> { name, items: [itemIds] }  (filled by catalogue)
export const CARD_SETS = {}; // setId -> { name, cards: [{id,name,rarity,art}] }

function rollRarity(boost = 0) {
  const entries = Object.entries(RARITY);
  const total = entries.reduce((a, [, r]) => a + r.weight, 0);
  let x = Math.random() * total * (1 - boost);
  for (const [k, r] of entries) { x -= r.weight; if (x <= 0) return k; }
  return 'common';
}

const blindbox = {
  held(inst) { return [{ key: 'LMB', label: 'Open the box!', run: () => blindbox.open(inst) }]; },
  world(inst) { return [{ key: 'F', label: 'Open the box!', run: () => { G.items.pickUp(inst); blindbox.open(inst); } }]; },
  async open(inst) {
    if (G.hand.busy) return;
    const s = SERIES[inst.def.use.series];
    if (!s) { G.ui.toast('This box is empty?!'); return; }
    G.hand.busy = true;
    G.audio.play('tape');
    await G.hand.play('shake');
    const rar = rollRarity();
    let pool = s.items.filter((id) => ITEMS[id]?.rarity === rar);
    if (!pool.length) pool = s.items;
    const id = pick(pool);
    G.hand.busy = false;
    G.audio.play('boxopen');
    const tip = G.hand.tipWorld();
    G.particles.confetti(tip, 25);
    G.items.destroy(inst);
    const fig = G.items.spawn(id, { loc: 'storage' });
    G.hand.take(fig);
    G.audio.play(['epic', 'legendary'].includes(fig.def.rarity) ? 'legendary' : 'reveal');
    G.ui.reveal({ title: fig.def.name, subtitle: `${s.name} · ${RARITY[fig.def.rarity].label}`, rarity: fig.def.rarity, item: fig.def });
    G.events.emit('act', 'blindbox', { item: id, rarity: fig.def.rarity, series: inst.def.use.series });
    G.state.stats.boxesOpened++;
  },
};

const cardpack = {
  held(inst) { return [{ key: 'LMB', label: 'Rip it open!', run: () => cardpack.open(inst) }]; },
  world(inst) { return [{ key: 'F', label: 'Rip it open!', run: () => { G.items.pickUp(inst); cardpack.open(inst); } }]; },
  async open(inst) {
    if (G.hand.busy) return;
    const set = CARD_SETS[inst.def.use.set];
    if (!set) return;
    G.hand.busy = true;
    G.audio.play('tape');
    await G.hand.play('thrust');
    G.hand.busy = false;
    const pulls = [];
    const n = inst.def.use.count || 5;
    for (let i = 0; i < n; i++) {
      const rar = i === n - 1 ? rollRarity(0.6) : rollRarity();
      let pool = set.cards.filter((c) => c.rarity === rar);
      if (!pool.length) pool = set.cards;
      pulls.push(pick(pool));
    }
    const col = (G.state.collection.cards ||= {});
    pulls.forEach((c) => { col[c.id] = (col[c.id] || 0) + 1; });
    G.items.destroy(inst);
    G.ui.cardReveal(set, pulls);
    G.events.emit('act', 'cardpack', { set: inst.def.use.set, pulls: pulls.map((p) => p.rarity) });
    fun(8, 'cards');
  },
};

// ---------------------------------------------------------------- RC car / drone
const rc = {
  world(inst) { return [{ key: 'E', label: `Drive the ${inst.def.use.drone ? 'drone' : 'car'}`, run: () => rc.start(inst) }]; },
  start(inst) {
    G.rc = inst;
    inst.runtime.v = 0; inst.runtime.h = itemYaw(inst); inst.runtime.alt = inst.object.position.y;
    G.player.occupy({ pos: G.player.pos.clone(), yaw: G.player.yaw, pitch: -0.4, eye: 1.6, label: 'Remote control', exitPos: G.player.pos.clone() });
    inst.runtime.snd = G.audio.loop('rcmotor', { pos: worldPos(inst), volume: 0.6 });
    G.ui.hint(`WASD to drive${inst.def.use.drone ? ', Space/C up/down' : ''} · E to stop`, 5);
    inst.runtime.startT = performance.now();
  },
  stop(inst) {
    G.rc = null;
    inst.runtime.snd?.stop(); inst.runtime.snd = null;
    G.player.release();
    if (inst.def.use.drone) { inst.object.position.y = Math.max(0, G.apartment ? 0 : 0); }
    G.items.toWorld(inst, inst.object.position.clone(), inst.object.quaternion.clone());
    const secs = (performance.now() - inst.runtime.startT) / 1000;
    G.needs.add({ fun: Math.min(20, secs * 0.4) });
    G.events.emit('act', 'play', { kind: 'rc', seconds: secs });
  },
  update(inst, dt) {
    if (G.rc !== inst) return;
    const i = G.input;
    if (i.wasPressed('KeyE') || i.wasPressed('Escape')) { i.consume('KeyE'); rc.stop(inst); return; }
    const o = inst.object; const r = inst.runtime;
    const fwd = (i.isDown('KeyW') ? 1 : 0) - (i.isDown('KeyS') ? 1 : 0);
    const turn = (i.isDown('KeyA') ? 1 : 0) - (i.isDown('KeyD') ? 1 : 0);
    const maxV = inst.def.use.speed || 3.2;
    r.v = THREE.MathUtils.damp(r.v, fwd * maxV, 3, dt);
    r.h += turn * dt * 2.6 * (inst.def.use.drone ? 1 : clamp(Math.abs(r.v) / 1.5, 0, 1) * Math.sign(r.v || 1));
    const nx = o.position.x + Math.sin(r.h) * r.v * dt, nz = o.position.z + Math.cos(r.h) * r.v * dt;
    const rad = 0.15;
    const hitC = [...G.apartment.colliders, ...G.items.colliders].find((c) => c.enabled && c.item !== inst && nx + rad > c.minX && nx - rad < c.maxX && nz + rad > c.minZ && nz - rad < c.maxZ && (c.yMax ?? 3) > o.position.y + 0.05 && c.tag !== 'threshold');
    if (hitC || Math.abs(nx) > 6.8 || nz < -4.8 || nz > 4.85) { if (Math.abs(r.v) > 1) G.audio.play('thud', { pos: o.position, impact: 0.5, pitch: 1.6 }); r.v *= -0.4; }
    else { o.position.x = nx; o.position.z = nz; }
    if (inst.def.use.drone) {
      const up = (i.isDown('Space') ? 1 : 0) - (i.isDown('KeyC') ? 1 : 0);
      r.alt = clamp(r.alt + up * dt * 1.2, 0, 2.6);
      o.position.y = THREE.MathUtils.damp(o.position.y, r.alt + (r.alt > 0.05 ? Math.sin(performance.now() * 0.004) * 0.02 : 0), 6, dt);
      inst.model.traverse((p) => { if (p.userData.prop) p.rotation.y += dt * 60; });
    }
    o.rotation.set(inst.def.use.drone ? -r.v * 0.08 : 0, r.h, 0);
    inst.model.traverse((w) => { if (w.userData.wheel) w.rotation.x += r.v * dt / 0.04; });
    r.snd?.setPos(o.position); r.snd?.setParam('rate', Math.abs(r.v) / maxV + (inst.def.use.drone ? 0.5 : 0));
  },
  dispose(inst) { inst.runtime.snd?.stop(); if (G.rc === inst) G.rc = null; },
};

export const toys = { spinner, bubbles, ball, yoyo, squeak, squish: squeak, cube, snowglobe, glider, eightball, instrument, cradle, dice, cards, slinky, kendama, top, clicker, kaleidoscope, blindbox, cardpack, rc };
