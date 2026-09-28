// Dead Air 4 — the crescendo. The army sealed the passage from the check-in
// hall to baggage claim with a barricade (jersey barriers, sandbags, a
// toppled baggage cart, check-in desks, chain-link and razor wire). The
// METRO INTL airport shuttle that crashed through the curtain wall still has
// its keys in the ignition: hotwire it (hold E), wedge the gas pedal, and it
// lurches across the hall, smashes through the barricade in a shower of debris
// and buries its nose in a column in baggage claim — horn stuck on, building
// alarm ringing, hordes pouring in from baggage handling, the claim hall, the
// check-in hall and down the grand stair.
import * as THREE from 'three';
import { P, sign, usable, graffiti, stencil } from './kit.js';
import { Door } from '../world/dynamic.js';
import { F_DEFAULT } from '../world/collision.js';
import { DF } from '../render/decals.js';
import { buildGroup, jersey, razorWire } from './ch3_props.js';
import { VAN, BARR, YU } from './da4_layout.js';
import { rng, rot } from './da4_parts.js';

const END = { x: 113.6, z: 16.0 };
const PATH = [[VAN.x, VAN.z], [77.0, 30.5], [80.6, 25.0], [87.2, 20.4], [94.6, 18.4], [100.2, 18.0], [106.4, 17.4], [END.x, END.z]];

// ------------------------------------------------------------- visuals
function vanGroup(L) {
  return buildGroup(L, (T) => {
    P.van(T, 0, 0, 0, 0, 0xe8e8e4);
    const p = P.prop(T, 0, 0, 0, 0);
    // livery stripes, roof light bar, crumpled nose, cracked windshield, bull bar
    for (const s of [-1, 1]) {
      p.box(s * 1.0, 0.95, 0.4, 0.012, 0.16, 4.2, 'paintedBlue', 0x1a3a8a);
      p.box(s * 1.0, 0.78, 0.4, 0.012, 0.06, 4.2, 'paintedRed', 0xb01e28);
    }
    p.box(0, 2.14, 0.6, 1.3, 0.12, 0.28, 'plastic', 0x1a1a1a);
    p.box(0, 0.64, -2.6, 1.9, 0.28, 0.12, 'metalDark', 0x2a2a2a);
    p.box(0.55, 0.95, -2.35, 0.8, 0.5, 0.3, 'metalDark', 0x3a3a3a, [0.2, 0.3, 0.2]);
    p.box(0, 1.52, -1.76, 1.6, 0.8, 0.02, 'blackMatte', 0x0a0a0a, [-0.55, 0, 0]);
    p.box(-0.6, 0.02, 0, 0.4, 0.02, 1.4, 'blackMatte', 0x050505);
    sign(T, 'METRO INTL  ·  AIRPORT SHUTTLE', 1.015, 1.35, 0.6, Math.PI / 2, 3.0, 0.3, { bg: '#e8e8e4', fg: '#1a3a8a', clean: true });
    sign(T, 'METRO INTL  ·  AIRPORT SHUTTLE', -1.015, 1.35, 0.6, -Math.PI / 2, 3.0, 0.3, { bg: '#e8e8e4', fg: '#1a3a8a', clean: true });
    sign(T, 'SHUTTLE 07', 0, 1.9, 2.53, 0, 0.9, 0.2, { bg: '#1a3a8a', fg: '#ffffff', clean: true });
  });
}
function barricadeParts(L) {
  // each piece is built around its own origin (so it can fly) with its world pose
  const parts = [];
  const add = (x, y, z, ry, fn, mass = 1) => {
    const g = buildGroup(L, (T) => fn(T));
    g.position.set(x, y, z);
    g.rotation.y = ry;
    L.addObject(g);
    parts.push({ g, x, y, z, mass, vel: new THREE.Vector3(), spin: new THREE.Vector3(), flying: false, rest: y });
    return g;
  };
  const X = BARR.x - 1.2;
  add(X + 0.4, 0, 16.0, Math.PI / 2, (T) => jersey(T, 0, 0, 0, 0, 3.2, 0xb8b4a8), 3);
  add(X + 0.4, 0, 20.1, Math.PI / 2 + 0.06, (T) => jersey(T, 0, 0, 0, 0, 3.2, 0xa8a498), 3);
  add(X - 0.7, 0, 15.6, Math.PI / 2, (T) => P.sandbags(T, 0, 0, 0, 0, 3, 3), 2);
  add(X - 0.7, 0, 19.9, Math.PI / 2 + 0.1, (T) => P.sandbags(T, 0, 0, 0, 0, 3.4, 3), 2);
  add(X - 0.5, 0, 18.1, Math.PI / 2 + 0.25, (T) => P.baggageCart(T, 0, 0, 0, 0, { color: 0x2a4a8a }), 2);
  add(X - 1.0, 0, 17.6, Math.PI / 2 - 0.2, (T) => P.checkInDesk(T, 0, 0, 0, 0, 2), 1.5);
  add(X + 0.9, 0, 18.0, 0, (T) => {
    P.fenceChain(T, 0, -3.9, 0, 3.9, 0, 2.6);
    razorWire(T, 0, 2.5, 0, Math.PI / 2, 7.6);
    sign(T, 'MILITARY CHECKPOINT\nNO ENTRY — USE OF FORCE AUTHORIZED', -0.06, 1.5, 0, -Math.PI / 2, 2.6, 0.7, { bg: '#e8e2d0', fg: '#8a1a14' });
  }, 1);
  add(X - 1.6, 0, 21.4, 0.9, (T) => P.luggageCart(T, 0, 0, 0, 0, true), 0.6);
  add(X - 1.8, 0, 14.8, -0.7, (T) => P.luggageCart(T, 0, 0, 0, 0, true), 0.6);
  add(X - 0.4, 1.35, 16.4, 0.3, (T) => { P.suitcase(T, 0, 0, 0, 0, 0x6a1a14, false); P.suitcase(T, 0.2, 0.26, 0.1, 0.4, 0x2a3a5a, false); }, 0.3);
  return parts;
}

// ------------------------------------------------------------- event
export function buildVanEvent(L, game, S) {
  const ev = { phase: 'idle', t: 0, s: 0, v: 0, broken: false, hit: new Set(), said: {} };
  const say = (k, lines) => { if (ev.said[k]) return; ev.said[k] = true; game.voice.script(lines); };
  // the hidden infected blocker in the opening doubles as the survivors' wall
  const blk = new Door(L, BARR.x, 0, (BARR.z0 + BARR.z1) / 2, 'z', { width: BARR.z1 - BARR.z0, height: BARR.h, safe: true, locked: true });
  blk.mesh.visible = false;
  blk.usable.enabled = false;
  blk.use = () => {};
  ev.blocker = blk;
  const parts = barricadeParts(L);
  const hold = L.col.addDynamic([BARR.x - 2.4, 0, BARR.z0], [BARR.x, 2.4, BARR.z1], { flags: F_DEFAULT });
  // floor dressing at the barricade
  stencil(L, 'CLOSED', BARR.x - 3.2, 0.02, 18, 0, 2.0, 0.6, '#e8e0c8');
  graffiti(L, 'MOVE THE\nVAN?', BARR.x - 0.22, 5.2, 12.2, -Math.PI / 2, 1.4, 0.7, '#e8e0c8');
  for (let i = 0; i < 8; i++) L.decal(BARR.x - 2 - rng() * 4, 0.012, 14 + rng() * 8, 0, 1, 0, 0.14, DF.HOLE_CONCRETE);

  // the van + its colliders (start pose static box, end pose re-enabled on arrival)
  const van = vanGroup(L);
  van.position.set(VAN.x, 0, VAN.z);
  L.addObject(van);
  van.userData.noCull = true;
  const colStart = L.box(VAN.x - 1.05, 0, VAN.z - 2.55, VAN.x + 1.05, 2.1, VAN.z + 2.55, 'metal', { visible: false });
  const colEnd = L.box(END.x - 2.55, 0, END.z - 1.05, END.x + 2.55, 2.1, END.z + 1.05, 'metal', { visible: false });
  ev.colEnd = colEnd;
  // lights: headlights (follow the van), amber hazards, dome light, alarm beacons in claim
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.08, 0.07), toneMapped: false });
  const hazMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.15, 0.02), toneMapped: false });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.02), headMat); h.position.set(s * 0.72, 0.8, -2.55); van.add(h);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), hazMat); a.position.set(s * 0.95, 1.1, -2.52); van.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.02), hazMat); b.position.set(s * 0.9, 1.1, 2.54); van.add(b);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.24), hazMat); bar.position.set(s * 0.35, 2.22, 0.6); van.add(bar);
  }
  const head = L.light(VAN.x, 1.2, VAN.z - 5, 0xfff0d8, 0, 20, { on: false, priority: 2, dynamic: true });
  const haz = L.light(VAN.x, 2.6, VAN.z, 0xffa020, 2.5, 8, { priority: 1, dynamic: true });
  const dome = L.light(VAN.x - 0.3, 1.8, VAN.z - 0.8, 0xffe0b0, 2, 4, { flicker: 0.3 });
  const beacons = [L.light(118, 5.8, 8, 0xff2010, 0, 16, { on: false, priority: 1 }), L.light(118, 5.8, 32, 0xff2010, 0, 16, { on: false, priority: 1 }), L.light(90, 12, 22, 0xff2010, 0, 22, { on: false, priority: 1 })];
  // usable at the driver's door (open, dome light on)
  const [ux, uz] = rot(VAN.x, VAN.z, 0, -1.25, -0.9);
  const use = usable(L, ux, 1.15, uz, 'Hotwire the shuttle van', (s) => ev.start(s), { hold: 4, holdLabel: 'Hotwiring the van...', radius: 2.0 });
  ev.usable = use;
  // path by arc length
  const curve = new THREE.CatmullRomCurve3(PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const total = curve.getLength();
  // arc length at which the nose reaches the barricade
  let sBarr = total * 0.62;
  for (let i = 0; i <= 400; i++) { const p = curve.getPointAt(i / 400); if (p.x > BARR.x - 3.0) { sBarr = total * i / 400; break; } }
  ev.total = total; ev.sBarr = sBarr;
  const tmp = new THREE.Vector3(), tan = new THREE.Vector3(), vpos = new THREE.Vector3();
  let snd = {};
  const nav = () => game.level.nav;
  const nodesAt = (pts) => pts.map(([x, y, z]) => nav().nearestNode(x, y, z, 2.5)).filter((n) => n >= 0);
  let sets = null;
  const waveNodes = (i) => {
    if (!sets) sets = {
      claim: nodesAt([[131, 0, 36], [132, 0, 6], [121, 0, 41]]),
      bag: nodesAt([[120, 0, -14], [138, 0, -31], [108, 0, -30]]),
      west: nodesAt([[34, 0, 20], [36, 0, 4], [50, 0, 38]]),
      upper: nodesAt([[40, YU, 3], [15.5, YU, 20], [24, YU, 3]]),
    };
    const order = [['claim', 'west'], ['bag', 'upper'], ['claim', 'bag', 'west'], ['upper', 'claim']];
    const s = order[i % order.length].flatMap((k) => sets[k]);
    return s.length ? s : undefined;
  };

  ev.start = (s) => {
    if (ev.phase !== 'idle') return;
    ev.phase = 'crank'; ev.t = 0;
    use.enabled = false;
    const who = s?.char?.id || 'louis';
    ev.who = who;
    game.session.objective('Stand clear of the van!');
    game.audio.play('buttonPress', { pos: van.position, vol: 1 });
    game.audio.play('metalImpact', { pos: van.position, vol: 0.35, rate: 0.6 });
    snd.engine = game.audio.loop('generator', { pos: van.position, vol: 0.6, rate: 0.55 });
    headMat.color.setRGB(3.2, 3.0, 2.6);
    head.on = true; head.intensity = 26;
    dome.on = false;
    say('start', [
      { who, text: who === 'louis' ? 'Come on, come on... YES! She\'s alive!' : 'Got it! Engine\'s running!', d: 0.3 },
      { who: who === 'francis' ? 'bill' : 'francis', text: 'Somebody put something heavy on that gas pedal.', d: 2.1 },
      { who, text: 'Suitcase on the pedal — STAND CLEAR!', d: 3.4 },
    ]);
    console.log('[da4] van started');
  };
  const breakBarricade = () => {
    if (ev.broken) return;
    ev.broken = true;
    blk.breakDoor(null);
    hold.enabled = false;
    const p = new THREE.Vector3(BARR.x - 0.5, 1.2, 18);
    game.audio.play('explosion', { pos: p, vol: 0.9, rate: 0.8 });
    game.audio.play('metalImpact', { pos: p, vol: 1.6 });
    game.audio.play('woodBreak', { pos: p, vol: 1.4 });
    L.after(0.12, () => game.audio.play('metalImpact', { pos: p, vol: 1.3, rate: 0.8 }));
    L.after(0.25, () => game.audio.play('glassBreak', { pos: p, vol: 1 }));
    const d = game.camPos ? game.camPos.distanceTo(p) : 20;
    game.shake?.(Math.max(0.2, 1.1 - d / 40));
    for (let i = 0; i < 10; i++) game.fx.dust(p.x - 1 + rng() * 2, 0.4 + rng() * 2.2, 14.5 + rng() * 7, 1, 0.3, (rng() - 0.5), [0.6, 0.58, 0.54], 8, 1.1);
    for (let i = 0; i < 5; i++) game.fx.sparks(p.x, 0.6 + rng(), 15 + rng() * 6, 1, 0.5, rng() - 0.5, 24);
    game.fx.chips?.(p.x, 1, 18, 1, 0.6, 0, [0.5, 0.45, 0.4], 30);
    // debris flies with the van
    const dir = tan.clone();
    for (const q of parts) {
      q.flying = true;
      const k = (0.55 + rng() * 0.55) * Math.max(4, ev.v) / q.mass ** 0.35;
      q.vel.set(dir.x * k, 3 + rng() * 4 / q.mass, dir.z * k + (rng() - 0.5) * 2.2);
      q.spin.set((rng() - 0.5) * 6 / q.mass, (rng() - 0.5) * 5, (rng() - 0.5) * 6 / q.mass);
    }
    ev.v *= 0.62;
    game.session.objective('Get through to baggage claim!');
    say('crash', [
      { who: 'zoey', text: 'STRIKE!', d: 0.4 },
      { who: 'bill', text: 'Barricade\'s down. Move before the whole damn airport shows up!', d: 1.6 },
    ]);
  };
  const arrive = () => {
    ev.phase = 'crashed'; ev.t = 0;
    const p = new THREE.Vector3(END.x + 2.4, 1.2, END.z);
    game.audio.play('metalImpact', { pos: p, vol: 1.7, rate: 0.7 });
    game.audio.play('explosion', { pos: p, vol: 0.4, rate: 1.4 });
    game.shake?.(0.35);
    for (let i = 0; i < 6; i++) game.fx.dust(p.x, 0.5 + rng() * 1.6, p.z + (rng() - 0.5) * 2, -1, 0.3, rng() - 0.5, [0.55, 0.53, 0.5], 6, 0.8);
    game.fx.sparks(p.x, 1.0, p.z, -1, 0.4, 0, 30);
    L.col.flags[colEnd] = F_DEFAULT;
    snd.engine?.set({ vol: 0.35, rate: 0.5 });
    L.after(1.6, () => { snd.engine?.stop(1.2); snd.engine = null; });
    snd.horn = game.audio.loop('carAlarm', { pos: van.position.clone(), vol: 1.3 });
    L.after(0.8, () => { snd.alarm = game.audio.loop('alarm', { pos: new THREE.Vector3(118, 4, 20), vol: 1.1 }); for (const b of beacons) b.on = true; });
    // steam from the crushed radiator
    ev.steam = true;
    L.after(1.2, () => {
      game.director.blockWanderers = true;
      game.director.panic('van', {
        waves: 3, size: [12, 18], interval: 15, nodes: waveNodes(0), where: 'any', minD: 12, maxD: 75, force: true,
        onWave: (i) => {
          const ps = game.director.panicState;
          if (!ps || ps.name !== 'van') return;
          ps.nodes = waveNodes(i);
          if (i === 1) say('wave1', [{ who: 'francis', text: 'They\'re comin\' down the stairs behind us!', d: 0.3 }]);
          if (i === 2) say('wave2', [{ who: 'louis', text: 'More from the baggage room! Watch that staff door!', d: 0.3 }]);
        },
        onEnd: () => {
          ev.phase = 'done';
          for (const b of beacons) b.on = false;
          snd.alarm?.stop(3); snd.alarm = null;
          snd.horn?.stop(2); snd.horn = null;
          L.after(12, () => { game.director.blockWanderers = false; });
          say('end', [{ who: 'francis', text: 'I hate vans.', d: 1.0 }, { who: 'zoey', text: 'Horn finally died. Let\'s find that staff door.', d: 3.0 }]);
          game.session.objective('Go through baggage handling to security');
        },
      });
    });
    say('arrive', [
      { who: 'louis', text: 'The horn\'s stuck! THE HORN IS STUCK!', d: 1.0 },
      { who: 'bill', text: 'Every dead thing in this terminal heard that. Here they come!', d: 3.0 },
    ]);
    game.audio.music?.stinger?.('hordeIncoming');
  };

  const pose = () => {
    const u = Math.min(1, ev.s / total);
    curve.getPointAt(u, vpos);
    curve.getTangentAt(Math.min(0.999, u + 0.001), tan);
    const yaw = Math.atan2(-tan.x, -tan.z);
    van.position.set(vpos.x, 0, vpos.z);
    // pitch under acceleration, roll in turns, shudder after impacts
    const acc = ev.acc ?? 0;
    const turn = ev.turn ?? 0;
    van.rotation.set(Math.max(-0.05, Math.min(0.06, acc * 0.008)) + (ev.shudder ?? 0) * Math.sin(game.time * 40) * 0.02, yaw, turn, 'YXZ');
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    head.x = vpos.x + fx * 6; head.y = 1.0; head.z = vpos.z + fz * 6;
    haz.x = vpos.x; haz.z = vpos.z;
    return { yaw, fx, fz };
  };

  const hitThings = (fx, fz) => {
    const cx = van.position.x + fx * 0.3, cz = van.position.z + fz * 0.3;
    const rx = -fz, rz = fx;
    for (const sv of game.survivors) {
      if (sv.dead || sv.incapped || ev.hit.has(sv)) continue;
      const dx = sv.pos.x - cx, dz = sv.pos.z - cz;
      const lz = dx * fx + dz * fz, lx = dx * rx + dz * rz;
      if (Math.abs(lz) < 2.9 && Math.abs(lx) < 1.3 && sv.pos.y < 1.5) {
        ev.hit.add(sv);
        const side = lx >= 0 ? 1 : -1;
        sv.knock = { x: (rx * side * 7 + fx * ev.v * 0.5), y: 4, z: (rz * side * 7 + fz * ev.v * 0.5) };
        sv.takeDamage?.(game.cheats?.god && sv.isHuman ? 0 : 14, null, 'hittable');
        if (sv.isHuman) game.shake?.(0.8);
        game.audio.play('shoveHit', { pos: sv.pos, vol: 1 });
        L.after(1.2, () => ev.hit.delete(sv));
      }
    }
    game.infected.forEachNear(cx, cz, 3.2, (e) => {
      if (e.dead) return;
      const dx = e.pos.x - cx, dz = e.pos.z - cz;
      const lz = dx * fx + dz * fz, lx = dx * rx + dz * rz;
      if (Math.abs(lz) > 2.9 || Math.abs(lx) > 1.4) return;
      const dmg = e.special ? (e.kind === 'tank' ? 250 : 400) : 999;
      e.takeHit({ damage: dmg, part: 0, zone: 'torso', x: e.pos.x, y: e.pos.y + 1, z: e.pos.z, dir: new THREE.Vector3(fx, 0.3, fz), kind: 'explosion', knockback: 12 });
    });
  };

  ev.update = (dt) => {
    const t = game.time;
    if (ev.phase === 'idle') {
      // hazard lights blink weakly on the dying battery
      const k = (t % 1.3) < 0.5 ? 1 : 0.1;
      hazMat.color.setRGB(2.2 * k, 1.1 * k, 0.15 * k);
      haz.intensity = 3 * k;
      if (Math.random() < dt * 0.6) game.fx.dust(VAN.x + (Math.random() - 0.5) * 0.6, 1.3, VAN.z - 2.4, 0, 1, -0.2, [0.7, 0.7, 0.72], 1, 0.25);
      // bots-only team: once they've waited at the barricade, one of them works the van
      const p = game.player;
      if ((!p || p.dead) && game.survivors.some((s) => !s.dead && Math.hypot(s.pos.x - BARR.x, s.pos.z - 18) < 14)) {
        ev.botWait = (ev.botWait || 0) + dt;
        if (ev.botWait > 8) ev.start(game.survivors.find((s) => !s.dead));
      }
      return;
    }
    ev.t += dt;
    const blink = (t % 0.8) < 0.4 ? 1 : 0;
    hazMat.color.setRGB(3 * blink, 1.6 * blink, 0.2 * blink);
    haz.intensity = 6 * blink;
    if (ev.phase === 'crank') {
      // revving in place, rocking on the springs
      const k = Math.min(1, ev.t / 3.2);
      snd.engine?.set({ pos: van.position, rate: 0.55 + k * 0.85 + Math.sin(ev.t * 9) * 0.08, vol: 0.6 + k * 0.5 });
      van.rotation.z = Math.sin(ev.t * 23) * 0.012 * (1 - k * 0.5);
      if (Math.random() < dt * 8) game.fx.dust(VAN.x + 0.6, 0.35, VAN.z + 2.7, 0.2, 0.3, 1, [0.25, 0.25, 0.26], 2, 0.4);
      if (ev.t > 3.4) {
        ev.phase = 'drive'; ev.t = 0;
        L.col.disableBox(colStart);
        game.audio.play('metalGate', { pos: van.position, vol: 0.6, rate: 1.6 });
        for (let i = 0; i < 4; i++) game.fx.dust(VAN.x + (i - 1.5) * 0.5, 0.2, VAN.z + 2.2, 0, 0.2, 1, [0.35, 0.34, 0.33], 5, 0.7);
      }
      return;
    }
    if (ev.phase === 'drive') {
      const rem = total - ev.s;
      const brake = ev.s > sBarr + 1 && ev.v * ev.v / (2 * Math.max(0.3, rem)) > 5.5;
      const prevV = ev.v;
      if (brake) ev.v = Math.max(0.6, ev.v - (ev.v * ev.v / (2 * Math.max(0.3, rem))) * dt);
      else ev.v = Math.min(12.5, ev.v + 6.5 * dt);
      ev.acc = (ev.v - prevV) / Math.max(dt, 1e-4);
      const prevYaw = van.rotation.y;
      ev.s = Math.min(total, ev.s + ev.v * dt);
      ev.shudder = Math.max(0, (ev.shudder ?? 0) - dt);
      const { yaw, fx, fz } = pose();
      let dy = yaw - prevYaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      ev.turn = (ev.turn ?? 0) * 0.9 + (-dy / Math.max(dt, 1e-4)) * ev.v * 0.0025;
      snd.engine?.set({ pos: van.position, rate: 0.9 + ev.v / 9, vol: 1.1 });
      if (!ev.broken && ev.s >= sBarr) { ev.shudder = 0.6; breakBarricade(); }
      hitThings(fx, fz);
      // tyre smoke / scuffs
      if (Math.random() < dt * 6) game.fx.dust(van.position.x - fx * 2.2, 0.15, van.position.z - fz * 2.2, -fx, 0.2, -fz, [0.3, 0.3, 0.3], 2, 0.5);
      if (Math.random() < dt * 5 && ev.v > 5) L.decal(van.position.x - fx * 1.5 + fz * 0.85, 0.013, van.position.z - fz * 1.5 - fx * 0.85, 0, 1, 0, 0.5, DF.SMEAR, { alpha: 0.35 });
      if (ev.s >= total - 0.01) { ev.v = 0; arrive(); }
    }
    if (ev.phase === 'crashed' || ev.phase === 'done') {
      if (ev.steam && Math.random() < dt * 4) game.fx.dust(van.position.x + 2.3, 1.2, van.position.z + (Math.random() - 0.5) * 0.8, 0.2, 1, 0, [0.8, 0.8, 0.82], 2, 0.5);
      if (snd.horn) snd.horn.set({ pos: van.position });
      if (ev.phase === 'crashed') {
        const k = Math.max(0, Math.sin(t * 6));
        for (const b of beacons) b.intensity = 16 * k * k;
      }
    }
    // flying debris
    for (const q of parts) {
      if (!q.flying) continue;
      q.vel.y -= 16 * dt;
      q.g.position.addScaledVector(q.vel, dt);
      q.g.rotation.x += q.spin.x * dt; q.g.rotation.y += q.spin.y * dt; q.g.rotation.z += q.spin.z * dt;
      // stay inside the passage until clear of the wall
      if (q.g.position.x < BARR.x + 0.6 && q.g.position.x > BARR.x - 0.6) q.g.position.z = Math.max(BARR.z0 + 0.8, Math.min(BARR.z1 - 0.8, q.g.position.z));
      if (q.g.position.y < 0 && q.vel.y < 0) {
        q.g.position.y = 0;
        q.vel.multiplyScalar(0.4); q.vel.y = Math.abs(q.vel.y) * 0.3;
        q.spin.multiplyScalar(0.5);
        if (q.mass > 1.5 && q.vel.length() > 1.5) game.audio.play('metalImpact', { pos: q.g.position, vol: 0.5 });
        if (q.vel.length() < 0.8) {
          q.flying = false;
          // settle flat on the floor
          q.g.rotation.x = Math.round(q.g.rotation.x / (Math.PI / 2)) * (Math.PI / 2);
          q.g.rotation.z = Math.round(q.g.rotation.z / (Math.PI / 2)) * (Math.PI / 2);
        }
      }
    }
  };
  pose(); van.rotation.set(0, van.rotation.y, 0);
  L.dynamics.push({ update: (dt) => ev.update(dt) });
  ev.van = van;
  ev.parts = parts;
  ev.scriptStart = () => {
    // the end-pose collider only exists once the van is there
    L.col.flags[colEnd] = 0;
  };
  // discovery beats
  L.trigger(84, -0.5, 8, 99.8, 3, 28, () => {
    if (ev.phase !== 'idle') return;
    game.session.objective('Find a way through the barricade');
    say('see', [
      { who: 'bill', text: 'Army sealed off baggage claim. Security too — there\'s no way through by hand.', d: 0.4 },
      { who: 'louis', text: 'That shuttle van by the windows — the keys are still in it!', d: 3.4 },
      { who: 'zoey', text: 'You want to drive through a barricade. In an airport shuttle.', d: 6.4 },
      { who: 'louis', text: 'I want the van to drive through it. We stay way back.', d: 9.0 },
    ]);
    L.after(9.5, () => { if (ev.phase === 'idle') game.session.objective('Hotwire the van to smash the barricade'); });
  });
  L.trigger(70, -0.5, 30, 84, 3, 43, () => {
    if (ev.phase !== 'idle') return;
    game.session.objective('Hotwire the van to smash the barricade');
    say('near', [{ who: 'francis', text: 'Once this thing starts, it\'s gonna be loud. Everybody ready?', d: 0.3 }]);
  });
  return ev;
}
