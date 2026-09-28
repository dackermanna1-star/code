// Chapter 3: hydraulic scissor lift crescendo. The lift is a MovingPlatform
// (deck + rails ride along, animated scissor arms below). Pressing the button
// on the deck starts a very loud climb to the warehouse roof and a
// multi-direction panic event (street / dock / alley / rooftop waves, optional
// Tank). A call box at the base can bring the lift back down for stragglers.
import * as THREE from 'three';
import { MovingPlatform } from '../world/dynamic.js';
import { F_SOLID } from '../world/collision.js';
import { usable, sign } from './kit.js';
import { buildGroup, vmesh } from './ch3_props.js';

// o: {x0,z0,x1,z1, deckTop, rise, duration, waveSets:[[x,y,z]...][], sizes:[[a,b]...], interval, callBox:[x,y,z]}
export function buildLift(L, game, o) {
  const g = game;
  const { x0, z0, x1, z1 } = o;
  const deckTop = o.deckTop, deckT = 0.14, baseTop = 0.22;
  const railH = 1.1;
  const gateA = x0 + 1.25, gateB = x0 + 2.45; // gap in the north rail (entry side)
  // ---- static base (wheels, chassis)
  L.box(x0 + 0.2, 0, z0 + 0.3, x1 - 0.2, baseTop, z1 - 0.3, 'paintedYellow', { tint: 0xc8961a });
  for (const sx of [x0 + 0.45, x1 - 0.45]) for (const sz of [z0 + 0.5, z1 - 0.5]) L.box(sx - 0.18, 0, sz - 0.12, sx + 0.18, 0.3, sz + 0.12, 'rubber', { collide: false, tint: 0x151515 });
  L.box(x0 + 0.2, baseTop, z0 + 0.3, x0 + 0.26, baseTop + 0.04, z1 - 0.3, 'paintedYellow', { collide: false, tint: 0x101010 });
  // ---- moving deck
  const grp = buildGroup(L, (T) => {
    T.box(x0, deckTop - deckT, z0, x1, deckTop, z1, 'diamond', { tint: 0xa8aca8 });
    T.box(x0 + 0.05, deckTop - deckT - 0.16, z0 + 0.15, x1 - 0.05, deckTop - deckT, z1 - 0.15, 'paintedYellow', { tint: 0xc8961a });
    // hazard striping on the deck edges
    for (let x = x0 + 0.1; x < x1 - 0.2; x += 0.5) T.box(x, deckTop - deckT - 0.1, z0 + 0.13, x + 0.25, deckTop - deckT - 0.02, z0 + 0.15, 'paintedRed', { tint: 0x111111 });
    const post = (x, z) => T.box(x - 0.03, deckTop, z - 0.03, x + 0.03, deckTop + railH, z + 0.03, 'paintedYellow', { tint: 0xd8a020 });
    for (const z of [z0 + 0.04, (z0 + z1) / 2, z1 - 0.04]) { post(x0 + 0.04, z); post(x1 - 0.04, z); }
    for (const x of [x0 + 0.04, gateA, gateB, x1 - 0.04]) post(x, z0 + 0.04);
    for (const hy of [railH, railH * 0.5]) {
      T.box(x0, deckTop + hy - 0.03, z0, x0 + 0.08, deckTop + hy + 0.03, z1, 'paintedYellow', { tint: 0xd8a020 });
      T.box(x1 - 0.08, deckTop + hy - 0.03, z0, x1, deckTop + hy + 0.03, z1, 'paintedYellow', { tint: 0xd8a020 });
      T.box(x0, deckTop + hy - 0.03, z0, gateA, deckTop + hy + 0.03, z0 + 0.08, 'paintedYellow', { tint: 0xd8a020 });
      T.box(gateB, deckTop + hy - 0.03, z0, x1, deckTop + hy + 0.03, z0 + 0.08, 'paintedYellow', { tint: 0xd8a020 });
    }
    // toe boards
    T.box(x0, deckTop, z0, x0 + 0.02, deckTop + 0.12, z1, 'paintedYellow', { tint: 0x8a6a10 });
    T.box(x1 - 0.02, deckTop, z0, x1, deckTop + 0.12, z1, 'paintedYellow', { tint: 0x8a6a10 });
    // control box on the NE post
    T.box(x1 - 0.5, deckTop + 0.75, z0 + 0.1, x1 - 0.1, deckTop + 1.25, z0 + 0.35, 'paintedYellow', { tint: 0xd8a020 });
    T.box(x1 - 0.42, deckTop + 1.05, z0 + 0.08, x1 - 0.3, deckTop + 1.15, z0 + 0.1, 'emissiveRed');
    T.box(x1 - 0.26, deckTop + 1.05, z0 + 0.08, x1 - 0.16, deckTop + 1.15, z0 + 0.1, 'emissiveGreen');
    // amber beacon
    T.box(x1 - 0.12, deckTop + railH, z0 + 0.02, x1 - 0.02, deckTop + railH + 0.14, z0 + 0.12, 'emissiveWarm');
    sign(T, 'MAX LOAD 1200 KG', x0 + 1.85, deckTop + 0.8, z0 - 0.01, 0, 1.0, 0.18, { bg: '#d8a020', fg: '#101010' });
  });
  // entry gate (a chain + bar that closes when the lift starts)
  const gate = buildGroup(L, (T) => {
    T.box(gateA, deckTop + railH - 0.03, z0, gateB, deckTop + railH + 0.03, z0 + 0.08, 'paintedRed', { tint: 0xc02010 });
    T.box(gateA, deckTop + railH * 0.5 - 0.03, z0, gateB, deckTop + railH * 0.5 + 0.03, z0 + 0.08, 'paintedRed', { tint: 0xc02010 });
  });
  gate.visible = false;
  grp.add(gate);
  // scissor arms (animated each frame from the deck height)
  const arms = new THREE.Group();
  const armMeshes = [];
  const levels = 5;
  for (let i = 0; i < levels; i++) for (const sz of [z0 + 0.45, z1 - 0.45]) for (const s of [1, -1]) {
    const m = vmesh(new THREE.BoxGeometry(1, 0.1, 0.07), 'paintedYellow', 0xc8961a);
    arms.add(m);
    armMeshes.push({ m, i, sz, s });
  }
  const pins = [];
  for (let i = 0; i <= levels; i++) for (const sz of [z0 + 0.45, z1 - 0.45]) {
    const m = vmesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 8).rotateX(Math.PI / 2), 'metalDark');
    arms.add(m); pins.push({ m, i, sz });
  }
  L.addObject(arms);
  const armW = x1 - x0 - 0.9;
  const layoutArms = (dy) => {
    const bottom = baseTop + 0.05, top = deckTop - deckT - 0.16 + dy;
    const h = (top - bottom) / levels;
    const len = Math.hypot(armW, h);
    const ang = Math.atan2(h, armW);
    const cx = (x0 + x1) / 2;
    for (const a of armMeshes) {
      a.m.position.set(cx, bottom + (a.i + 0.5) * h, a.sz + a.s * 0.05);
      a.m.rotation.set(0, 0, a.s * ang);
      a.m.scale.set(len, 1, 1);
    }
    for (const p of pins) p.m.position.set(cx, bottom + p.i * h, p.sz);
  };
  layoutArms(0);

  // ---- beacon light + control
  const beacon = L.light(x1 - 0.1, deckTop + railH + 0.3, z0, 0xffa020, 0, 7, { priority: 2 });
  const state = { phase: 'idle', t: 0, beaconOn: false };
  const plat = new MovingPlatform(L, grp, [x0, deckTop - deckT, z0], [x1, deckTop, z1], {
    to: [0, o.rise, 0], duration: o.duration, sound: 'liftMotor',
    onUpdate: (k, dt) => {
      const dy = plat.offset.y;
      layoutArms(dy);
      ctrl.pos.set(x1 - 0.3, deckTop + 1.1 + dy, z0 + 0.25);
      beacon.y = deckTop + railH + 0.3 + dy;
      o.onProgress?.(k, dy);
    },
    onArrive: () => arrived(),
  });
  // rails: shootable lower part + invisible player-only extension so nobody can
  // jump (or step) over them while the lift is moving
  const clipH = 1.8;
  const railBoxes = [[[x0, z0], [x0 + 0.08, z1]], [[x1 - 0.08, z0], [x1, z1]], [[x0, z0], [gateA, z0 + 0.08]], [[gateB, z0], [x1, z0 + 0.08]]];
  for (const [[ax, az], [bx, bz]] of railBoxes) {
    plat.attachCollider([ax, deckTop, az], [bx, deckTop + railH, bz]);
    plat.attachCollider([ax, deckTop + railH, az], [bx, deckTop + clipH, bz], { flags: F_SOLID });
  }
  const gateCols = [plat.attachCollider([gateA, deckTop, z0], [gateB, deckTop + railH, z0 + 0.08]), plat.attachCollider([gateA, deckTop + railH, z0], [gateB, deckTop + clipH, z0 + 0.08], { flags: F_SOLID })];
  for (const c of gateCols) c.enabled = false;
  const setGate = (closed) => { for (const c of gateCols) c.enabled = closed; gate.visible = closed; };

  const onDeck = (p) => p.x > x0 - 0.05 && p.x < x1 + 0.05 && p.z > z0 - 0.05 && p.z < z1 + 0.05 && Math.abs(p.y - plat.col.max[1]) < 0.7;
  const living = () => g.survivors.filter((s) => !s.dead);

  // bots following the leader may stand next to the deck: walk them on board
  const boardBots = () => {
    const slots = [[x0 + 0.7, z0 + 1.2], [x0 + 2.9, z0 + 1.2], [x0 + 0.7, z1 - 0.7], [x0 + 2.9, z1 - 0.7]];
    let k = 0;
    for (const s of living()) {
      if (!s.isBot || s.incapped || s.pinned || onDeck(s.pos)) continue;
      if (Math.hypot(s.pos.x - (x0 + x1) / 2, s.pos.z - (z0 + z1) / 2) > 22) continue;
      const [sx, sz] = slots[k++ % 4];
      s.teleport(sx, plat.col.max[1] + 0.05, sz, s.yaw);
    }
  };

  const ctrl = usable(L, x1 - 0.3, deckTop + 1.1, z0 + 0.25, 'Start the lift', (s) => {
    if (!onDeck(s.pos)) { ctrl.enabled = true; g.audio.play('radioBeep', { pos: ctrl.pos, vol: 0.8 }); return; }
    if (state.phase === 'idle') startCrescendo(s);
    else if (state.phase === 'bottom') { state.phase = 'rising'; setGate(true); boardBots(); plat.moveTo([0, o.rise, 0], o.duration * 0.5); }
  }, { radius: 1.7, sound: 'buttonPress' });

  const call = usable(L, o.callBox[0], o.callBox[1], o.callBox[2], 'Call the lift', () => {
    if (state.phase !== 'top') { call.enabled = true; return; }
    state.phase = 'lowering';
    setGate(false);
    plat.moveTo([0, 0, 0], 18);
  }, { radius: 1.6, enabled: false, sound: 'buttonPress' });

  function startCrescendo(s) {
    state.phase = 'warmup';
    setGate(true);
    g.session?.objective('Survive until the lift reaches the roof');
    g.audio.play('metalGate', { pos: ctrl.pos, vol: 1 });
    const horn = g.audio.loop('alarm', { pos: ctrl.pos, vol: 1 });
    L.after(4.5, () => horn?.stop(1));
    state.beaconOn = true;
    g.voice.script([{ who: 'louis', text: 'Okay, it\'s moving! It\'s moving!', d: 1.2 }, { who: 'bill', text: 'Here they come! Keep them off the lift!', d: 4.5 }]);
    L.after(2.2, boardBots);
    L.after(3.0, () => {
      boardBots();
      state.phase = 'rising';
      plat.start(o.duration);
      o.onStart?.();
      runPanic();
    });
  }

  function nodesFor(points) {
    const nav = g.level.nav;
    const out = [];
    for (const [x, y, z] of points) { const n = nav.nearestNode(x, y, z, 3); if (n >= 0) out.push(n); }
    return out.length ? out : undefined;
  }
  function runPanic() {
    const d = g.director;
    const sets = o.waveSets.map(nodesFor);
    const tank = o.tankChance && !d.tankSpawned && !d.tankAlive && Math.random() < o.tankChance;
    if (tank) d.tankSpawned = true;
    d.panic('lift', {
      waves: sets.length, size: o.sizes[0], interval: o.interval, nodes: sets[0], stingEvery: true,
      tanks: tank ? [o.tankWave ?? 3] : [],
      force: true,
      onWave: (i) => {
        const p = d.panicState;
        if (!p) return;
        if (i < sets.length) { p.nodes = sets[i]; p.size = o.sizes[Math.min(i, o.sizes.length - 1)]; }
      },
      onEnd: () => o.onPanicEnd?.(),
    });
  }

  function arrived() {
    if (state.phase === 'rising' || state.phase === 'warmup') {
      const first = !state.arrivedOnce;
      state.arrivedOnce = true;
      state.phase = 'top';
      state.beaconOn = false;
      beacon.intensity = 0;
      g.audio.play('metalGate', { pos: ctrl.pos, vol: 1 });
      call.enabled = true;
      if (first) o.onArrive?.();
    } else if (state.phase === 'lowering') {
      state.phase = 'bottom';
      ctrl.enabled = true;
      ctrl.prompt = 'Raise the lift';
      g.audio.play('metalGate', { pos: ctrl.pos, vol: 0.8 });
    }
  }

  L.dynamics.push({
    update(dt) {
      state.t += dt;
      if (state.beaconOn) beacon.intensity = 4 + 4 * Math.max(0, Math.sin(state.t * 9));
      if (!plat.moving && (state.phase === 'top' || state.phase === 'bottom')) layoutArms(plat.offset.y);
    },
  });
  return { plat, state, ctrl, call, onDeck };
}
