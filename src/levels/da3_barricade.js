// Dead Air 3 — the CRESCENDO: the site's rear gate onto Grid Road is plugged by
// an army barricade (a jack-knifed box truck, a flipped sedan, pallets, sheet
// steel, sandbags, razor wire) rigged with red gas canisters. Shoot a canister
// (or throw fire near one) -> the canisters chain -> a huge blast throws the
// junk across the road, leaves burning wreckage and wakes every infected for
// blocks around. A hidden locked blocker keeps infected from pathing through
// the gap until it blows; a movement collider holds survivors.
import * as THREE from 'three';
import { P, sign, graffiti, stencil } from './kit.js';
import { Door } from '../world/dynamic.js';
import { DF } from '../render/decals.js';
import { buildGroup } from './ch3_props.js';
import { razorWire } from './ch3_props.js';
import { rng, NC, blood, safetySign, GasCanister, flyingDebris, F_SOLID, F_SHOOT } from './da3_parts.js';
import { BAR } from './da3_layout.js';

// blocking part of the gap (the rest is permanent wreckage)
const GZ0 = -4.6, GZ1 = 0.6, GX0 = 146.6, GX1 = 151.4;

export function buildBarricade(L, game) {
  const bx = BAR.x;
  // ---- permanent wreckage at the edges of the gap (stays after the blast)
  // the removal truck, parked tight along the hoarding: its tail plugs the north of the gap
  P.truck(L, 149.75, 0, -9.8, 0, 0xd8d4c8);
  sign(L, 'NEWBURG\nMOVING & STORAGE', 148.47, 2.2, -6.6, -Math.PI / 2, 2.6, 0.9, { bg: '#e8e4d8', fg: '#1a4a8a', paper: false });
  L.clip(147.94, 0, -8.0, 148.5, 3.4, GZ0, F_SOLID | F_SHOOT);
  // jersey barrier + sandbags on the south edge
  P.concreteBarrier(L, 148.7, 0, 2.1, Math.PI / 2, 3.0, 0xc8c4b8);
  L.clip(147.94, 0, GZ1, 148.5, 1.2, 2.0, F_SOLID | F_SHOOT);
  P.sandbags(L, 149.7, 0, 3.2, Math.PI / 2, 1.8, 3);
  graffiti(L, 'RIGGED', 148.36, 0.62, 1.6, -Math.PI / 2, 1.2, 0.36, '#e8e8d8', { style: 'stencil' });
  // ---- the blocking pile (visual group, hidden when it blows)
  const pile = buildGroup(L, (T) => {
    // flipped sedan on its roof, nose north
    P.car(T, 149.8, 1.55, -2.0, Math.PI + 0.06, { burnt: false, color: 0x2a3a5a, damaged: true });
    const p = P.prop(T, 147.3, 0, -2.0, 0);
    p.box(0.4, 0.75, 0, 1.4, 1.5, 4.9, 'metalDark', 0x3a3a3a); // wreck body under the sheets
    // pallets stacked in front
    for (let i = 0; i < 4; i++) p.box(-0.1 + (i % 2) * 0.1, 0.07 + 0.14 * i, -2.1 + (i % 2) * 0.2, 1.1, 0.12, 1.2, 'wood', 0xbbaa88, [0, 0.2 * i, 0]);
    // sheet steel propped against the pile
    for (let i = 0; i < 4; i++) p.box(0.1 * (i % 2), 1.2, -1.9 + i * 1.3, 0.05, 2.4, 1.4, 'rust', [0x7a5a44, 0x6a6a64, 0x8a6a4a, 0x5a5a58][i], [0, 0, -0.22 + (i % 2) * 0.12]);
    for (let i = 0; i < 20; i++) p.box(-0.04, 1.2, -2.5 + i * 0.26, 0.03, 2.3, 0.05, 'metalDark', 0x5a5a58, [0, 0, -0.18]);
    // sandbags along the top + a tangle of chain link
    for (let i = 0; i < 6; i++) p.rbox(1.4, 2.72 + (i % 2) * 0.1, -2.8 + i * 0.6, 0.5, 0.22, 0.62, 0.08, 'fabric', 0x8a7a5a, [0, 0.2 * (i % 3), 0]);
    p.box(1.0, 2.2, -1.6, 0.02, 1.6, 4.4, 'chainLink', 0x8a8a86, [0.1, 0, 0.3]);
    // tyres + oil drums
    for (const [tx, tz] of [[0.5, 1.9], [0.4, -2.5]]) p.torus(tx, 0.35, tz, 0.32, 0.12, 'rubber', 0x151515, [0.3, 0, 0], 8, 14);
    for (const [tx, tz] of [[0.9, -2.2], [0.9, 2.2]]) p.cyl(tx, 0.45, tz, 0.3, 0.9, 'paintedRed', 0x3a4a3a, null, 12);
    // wooden stand for the high canister + the warning plywood
    p.box(-0.2, 0.62, -0.6, 0.6, 1.24, 0.6, 'wood', 0x9a7a50).box(-0.2, 1.23, -0.6, 0.7, 0.04, 0.7, 'wood', 0xb09070);
    p.box(-0.4, 1.5, 1.7, 0.04, 1.2, 1.4, 'wood', 0xb89a70, [0, 0, -0.08]);
    razorWire(T, 146.2, 0, -2.0, Math.PI / 2, 4.8);
  });
  L.addObject(pile);
  const plyTxt = graffiti(L, 'DANGER\nGAS - DO\nNOT SHOOT', 146.84, 1.55, -0.3, -Math.PI / 2, 1.2, 0.8, '#b8201a', { style: 'marker' });
  // army work light on the pile: the rigged canisters sit in a hard pool of light
  const wl = P.prop(L, 145.2, 0, -7.2, 0.7);
  wl.box(0, 1.4, 0, 0.08, 2.8, 0.08, 'metalDark', 0x2a2a2a).box(0, 0.05, 0, 0.9, 0.1, 0.9, 'metalDark', 0x2a2a2a);
  wl.rbox(0, 2.9, 0.1, 0.5, 0.36, 0.22, 0.03, 'paintedYellow', 0xd8a820).glow(0, 2.9, 0.22, 0.42, 0.28, 0.01, 0xfff4e0);
  wl.col(0, 1.4, 0, 0.3, 2.8, 0.3, 'metal');
  const wlight = L.light(145.8, 2.6, -5.8, 0xfff0d8, 26, 12, { flicker: 0.05, priority: 1 });
  P.lightCone(L, 145.4, 2.9, -6.8, [0.35, -0.55, 0.75], 6, 1.6, 0xfff0d8, wlight, 0.8);
  L.light(146.2, 1.2, -1.8, 0xff3020, 5, 5, { flicker: 0.1 }); // red glow off the tanks
  // blocking collider (survivors / bullets / props) + nav blocker for infected
  const hold = L.col.addDynamic([GX0, 0, GZ0], [GX1, 3.6, GZ1], { flags: F_SOLID | F_SHOOT, surf: 'metal' });
  const blocker = new Door(L, bx, 0, (GZ0 + GZ1) / 2, 'z', { width: GZ1 - GZ0, height: 3.2, safe: true, locked: true });
  blocker.mesh.visible = false;
  blocker.usable.enabled = false;
  blocker.collider.enabled = false;
  let blown = false;
  blocker.blocksInfected = () => !blown;
  blocker.use = () => {};

  // ---- the canisters, strapped to the front of the pile (facing the site)
  const cans = [];
  const spots = [[146.3, 0, -4.1, 0.3], [146.3, 0, -1.4, -0.2], [146.4, 0, 0.2, 0.1], [147.1, 1.25, -2.6, 0.5], [146.5, 0, -2.8, 0.9]];
  const ev = { blown: false, t: 0, fires: [], started: false };
  for (const [x, y, z, r] of spots) {
    const c = new GasCanister(L, x, y, z, r - Math.PI / 2, { onDetonate: (can, who) => ev.chain(can, who), survivorDamage: 16 });
    cans.push(c);
  }
  const tag = sign(L, 'ACETYLENE\nFLAMMABLE GAS', 146.9, 2.05, -3.4, -Math.PI / 2, 0.6, 0.32, { bg: '#c01810', fg: '#fff' });

  // ---- post-blast: scattered, burning wreckage (hidden until then)
  const after = buildGroup(L, (T) => {
    // the sedan, thrown and burnt, resting against the truck
    P.car(T, 153.6, 0, -11.6, 1.1, { burnt: true });
    const q = P.prop(T, 150.2, 0, -1.8, 0);
    for (let i = 0; i < 14; i++) q.box((rng() - 0.5) * 7, 0.04 + rng() * 0.1, (rng() - 0.5) * 8, 0.3 + rng() * 1.2, 0.04, 0.1 + rng() * 0.3, 'wood', 0x2a2018, [0, rng() * 3, rng() * 0.2]);
    for (let i = 0; i < 6; i++) q.box((rng() - 0.5) * 9 + 2, 0.08 + rng() * 0.3, (rng() - 0.5) * 12, 1.2 + rng(), 0.03, 0.8 + rng(), 'rust', 0x3a3028, [rng() * 0.6, rng() * 3, rng() * 0.6]);
    for (let i = 0; i < 8; i++) q.rbox((rng() - 0.5) * 10 + 3, 0.1, (rng() - 0.5) * 10, 0.5, 0.18, 0.6, 0.06, 'fabric', 0x4a4032, [0, rng() * 3, 0]);
  });
  after.visible = false;
  L.addObject(after);
  const debris = flyingDebris(L, game, 149, 1.4, -2, [
    { v: [9, 9, -5], spin: [4, 1, 3], build: (T) => P.prop(T, 0, 0, 0, 0).box(0, 0, 0, 0.05, 1.8, 2.2, 'rust', 0x5a4a3a) },
    { v: [12, 7, 3], spin: [2, 5, 1], build: (T) => P.prop(T, 0, 0, 0, 0).torus(0, 0, 0, 0.32, 0.12, 'rubber', 0x151515, [0, 0, 0], 8, 14) },
    { v: [7, 11, 8], spin: [5, 2, 2], build: (T) => P.prop(T, 0, 0, 0, 0).box(0, 0, 0, 1.2, 0.14, 1.0, 'wood', 0x5a4a38) },
    { v: [14, 6, -9], spin: [3, 3, 4], build: (T) => P.prop(T, 0, 0, 0, 0).cyl(0, 0, 0, 0.3, 0.9, 'paintedRed', 0x3a4a3a, null, 12) },
    { v: [10, 12, 1], spin: [1, 4, 5], build: (T) => P.prop(T, 0, 0, 0, 0).box(0, 0, 0, 0.9, 0.06, 1.3, 'carPaint', 0x2a3a5a) },
    { v: [6, 8, -12], spin: [6, 1, 2], build: (T) => P.prop(T, 0, 0, 0, 0).box(0, 0, 0, 0.05, 1.4, 1.8, 'metalDark', 0x5a5a58) },
  ]);
  const firePts = [[150.4, 0.1, -1.4, 1.1], [153.6, 0.6, -11.6, 1.0], [148.2, 0.1, 0.4, 0.6], [155.8, 0.1, -3.6, 0.7]];
  const fireLights = firePts.map(([x, y, z, s]) => L.light(x, y + 0.9, z, 0xff7a30, 12 * s + 4, 10 * s + 4, { on: false, flicker: 0.85 }));
  const center = new THREE.Vector3(149, 1.2, -2);
  const d = game.director;
  const say = (lines) => game.voice.script(lines);

  ev.chain = (can, who) => {
    if (ev.blown) return;
    ev.blown = true;
    // the other canisters cook off in a ripple
    let k = 0;
    for (const c of cans) if (!c.dead && c !== can) { const dl = 0.18 + 0.16 * k++; L.after(dl, () => c.detonate(who)); }
    L.after(0.35 + 0.16 * cans.length, () => ev.bigBlast(who));
  };
  ev.bigBlast = (who) => {
    blown = true;
    hold.enabled = false;
    pile.visible = false;
    after.visible = true;
    if (plyTxt) plyTxt.visible = false;
    if (tag?.isObject3D) tag.visible = false;
    game.fx.explosion(center.x, center.y, center.z, 3.2);
    game.fx.explosion(151.5, 1.0, -4.5, 2.0);
    game.fx.shockwave?.(center.x, 0.3, center.z, 14);
    game.lights.flash(center.x, 3, center.z, 0xffa050, 120, 60, 0.6);
    game.audio.play('explosion', { pos: center, vol: 1.6 });
    game.audio.play('propaneExplode', { pos: center, vol: 1.4 });
    game.combat.explode(center.x, 1.0, center.z, 7, 1200, who || null, { survivorDamage: 12, scale: 1.8 });
    game.shake?.(1.0);
    debris.launch();
    for (const [x, , z, s] of firePts) L.decal(x, 0.02, z, 0, 1, 0, 2.6 * s + 1.5, DF.SCORCH);
    firePts.forEach(([x, y, z, s], i) => {
      fireLights[i].on = true;
      ev.fires.push({ x, y, z, s, t: 60 + i * 20 });
      L.hazard(x - s * 0.55, y - 0.3, z - s * 0.55, x + s * 0.55, y + 1.4, z + s * 0.55, 'fire', 10);
    });
    ev.fireLoop = game.audio.loop('fireLoop', { pos: center, vol: 0.8 });
    game.session.objective('Get out through Substation 12!');
    game.audio.music?.stinger?.('hordeIncoming');
    const s0 = game.survivors.find((s) => !s.dead);
    say([
      { who: 'francis', text: 'WHOA! Yeah! I love that!', d: 1.4 },
      { who: 'bill', text: 'Every dead thing in the city heard that. Move!', d: 3.4 },
      { who: 'zoey', text: 'Through the substation — across the road!', d: 6.2 },
    ]);
    L.after(4, () => {
      d.blockWanderers = true;
      const nav = game.level.nav;
      const pick = (pts) => pts.map(([x, y, z]) => nav.nearestNode(x, y, z, 3)).filter((n) => n >= 0);
      const sets = [
        pick([[155, 0, -28], [155, 0, 26], [170, 0, -3]]),
        pick([[130, 0, -26], [140, 0, 22], [158, 0, -30]]),
        pick([[158, 0, 30], [178, 0, 8], [155, 0, -30], [128, 0, 24]]),
      ];
      d.panic('barricade', {
        waves: 3, size: [16, 22], interval: 17, nodes: sets[0].length ? sets[0] : undefined, force: true, minD: 14, maxD: 60,
        onWave: (i) => { const p = d.panicState; if (p && p.name === 'barricade' && sets[i]?.length) p.nodes = sets[i]; },
        onEnd: () => { L.after(15, () => { d.blockWanderers = false; }); },
      });
    });
  };
  ev.update = (dt) => {
    // bots-only team (no living human player): a bot shoots a canister
    if (!ev.blown && !game.net?.client) {
      const p = game.player;
      const near = game.survivors.find((s) => !s.dead && Math.hypot(s.pos.x - 140, s.pos.z + 2) < 9);
      if (near && (!p || p.dead)) {
        ev.botT = (ev.botT || 0) + dt;
        if (ev.botT > 3) { const c = cans.find((q) => !q.dead); c?.hit(c.x, c.y + 0.8, c.z, new THREE.Vector3(1, 0, 0), near); }
      }
      // first sight of the barricade
      if (!ev.seen && game.survivors.some((s) => !s.dead && s.pos.x > 128 && Math.abs(s.pos.z + 2) < 12)) {
        ev.seen = true;
        game.session.objective('Blow the barricade: shoot the gas canisters');
        say([
          { who: 'louis', text: 'Gate\'s blocked. Somebody piled half a car lot in there.', d: 0.4 },
          { who: 'bill', text: 'Those red tanks are rigged. Get back and shoot one.', d: 3.2 },
          { who: 'francis', text: 'Finally, a plan I like.', d: 6.0 },
          { who: 'zoey', text: 'Stock up first. That\'s gonna be loud.', d: 8.0 },
        ]);
      }
      return;
    }
    ev.t += dt;
    const cp = game.camPos;
    for (const f of ev.fires) {
      f.t -= dt;
      if (f.t <= 0) continue;
      if (cp && (cp.x - f.x) ** 2 + (cp.z - f.z) ** 2 > 3600) continue;
      const n = Math.ceil(f.s * 1.5 * dt * 30);
      for (let i = 0; i < n; i++) game.fx.fire(f.x + (Math.random() - 0.5) * f.s, f.y, f.z + (Math.random() - 0.5) * f.s, f.s * (0.7 + Math.random() * 0.6));
      if (Math.random() < 0.08 * f.s) game.fx.smokeColumn(f.x, f.y + f.s, f.z, f.s * 0.6, [0.08, 0.075, 0.07]);
    }
    fireLights.forEach((l, i) => { if (ev.fires[i] && ev.fires[i].t <= 0 && l.on) { l.on = false; } });
    if (ev.fireLoop && ev.fires.every((f) => f.t <= 0)) { ev.fireLoop.stop(3); ev.fireLoop = null; }
  };
  L.dynamics.push(ev);
  ev.cans = cans;
  ev.blocker = blocker;
  ev.hold = hold;
  ev.isBlown = () => blown;
  // keep specials/mobs from spawning inside the pile
  ev.noSpawn = [[GX0, -1, GZ0, GX1, 4, GZ1]];
  return ev;
}
