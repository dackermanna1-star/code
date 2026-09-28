// Dead Air 5 — SkyLine Air 212. An airliner full of infected comes in low and
// fast from the east, one engine burning, rolling as nobody flies it; it
// slams onto the grass beside the runway, breaks apart (nose, centre section,
// tail, an engine and a wing slide and tumble west past the apron, throwing
// sparks and burning fuel) and two seconds later the centre tanks go up in a
// huge fireball whose shockwave blows in the terminal glass. The wreck keeps
// burning (flame sprites, smoke columns, fire-lit lights) for the rest of the
// chapter and the C-130 takes off past it in the escape.
import * as THREE from 'three';
import { airlinerModel, Flyer, smokePlumes } from './da_parts.js';
import { MeshKit, trsM, panelTexture, decalTexture, decalMesh } from './da5_fx.js';
import { DF } from '../render/decals.js';

const V = new THREE.Vector3();
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const lerpAng = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

// Approach keyframes (seconds from start); impact at the last key.
export const CRASH_KEYS = [
  { x: 1150, y: 200, z: 150, t: 0 }, { x: 780, y: 135, z: 141, t: 3 }, { x: 450, y: 72, z: 132, t: 6 },
  { x: 245, y: 31, z: 123, t: 8 }, { x: 135, y: 10, z: 115, t: 9.2 }, { x: 64, y: 2.3, z: 107, t: 10 },
];
export const IMPACT_T = 10, FUEL_T = 12.1;
const HEAD = Math.atan2(71, 8); // yaw of the aircraft at impact (heading west, a little north)

function liveryDecals(model) {
  const tex = decalTexture(512, 96, (g, w, h) => {
    g.fillStyle = 'rgba(176,30,40,0.95)';
    g.font = 'italic bold 70px Georgia, serif'; g.textAlign = 'center';
    g.fillText('SkyLine Air', w / 2, 72);
  });
  for (const s of [-1, 1]) {
    const m = decalMesh(tex, 8, 1.5);
    m.position.set(s * 2.03, 1.05, -3.5);
    m.rotation.y = s * Math.PI / 2;
    model.add(m);
  }
  const fin = decalTexture(128, 128, (g) => { g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(30, 20); g.lineTo(90, 20); g.lineTo(70, 110); g.lineTo(10, 110); g.fill(); });
  for (const s of [-1, 1]) { const m = decalMesh(fin, 2.6, 2.6); m.position.set(s * 0.19, 4.4, 15.2); m.rotation.y = s * Math.PI / 2; model.add(m); }
}

// Burnt wreck pieces, built around their own origin (nose -Z like the model).
function wreckPieces() {
  const burnt = new THREE.MeshStandardMaterial({ map: panelTexture({ base: [120, 116, 110], seed: 212, char: true, grime: 90 }), vertexColors: true, roughness: 0.92, metalness: 0.2, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8, metalness: 0.3, side: THREE.DoubleSide });
  const ember = new THREE.MeshBasicMaterial({ vertexColors: true });
  const R = 2.0;
  const WHITE = 0xd8d4cc, CHAR = 0x3a3634, SOOT = 0x1c1a19, RED = 0x8a1a1c;
  const tube = (K, z0, z1, tint = WHITE) => {
    K.cylZ(0, 0, (z0 + z1) / 2, R, R, z1 - z0, burnt, tint, 22, true);
    // interior (dark cabin) + floor
    K.cylZ(0, 0, (z0 + z1) / 2, R - 0.08, R - 0.08, z1 - z0, dark, 0x141210, 16, true);
    K.box(0, -0.7, (z0 + z1) / 2, 3.2, 0.08, z1 - z0 - 0.2, dark, 0x2a2622);
    // window band
    for (const s of [-1, 1]) K.box(s * 1.99, 0.55, (z0 + z1) / 2, 0.03, 0.22, z1 - z0 - 0.6, dark, 0x0a0a0a);
  };
  const jagged = (K, z, dir, seed) => {
    let r = seed;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, l = 0.3 + rnd() * 1.4;
      K.box(Math.cos(a) * R, Math.sin(a) * R, z + dir * l / 2, 0.55, 0.07, l, burnt, rnd() < 0.5 ? CHAR : WHITE, [0, 0, a + Math.PI / 2]);
    }
    for (let i = 0; i < 7; i++) { const a = rnd() * 6.28; K.box(Math.cos(a) * (R - 0.3), Math.sin(a) * (R - 0.3), z + dir * 0.2, 0.06, 0.06, 0.8, dark, 0x2a2a2a, [rnd(), rnd(), 0]); }
    K.add(new THREE.TorusGeometry(R - 0.04, 0.12, 4, 22), ember, trsM(0, 0, z, 0, 0, 0), new THREE.Color(1.8, 0.55, 0.12));
  };
  const soot = (K, z0, z1, seed) => {
    let r = seed; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 8; i++) { const a = 0.4 + rnd() * 2.3, z = z0 + rnd() * (z1 - z0); K.box(Math.cos(a) * (R + 0.02), Math.sin(a) * (R + 0.02), z, 1.2 + rnd(), 0.04, 1.6 + rnd() * 2.5, burnt, SOOT, [0, 0, a + Math.PI / 2]); }
  };
  const P = {};
  // P1: forward fuselage with cockpit
  let K = new MeshKit();
  tube(K, -6.5, 6.5);
  K.add(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), burnt, trsM(0, 0, -6.5, -Math.PI / 2, 0, 0, R, 4.0, R), WHITE);
  K.box(0, 0.85, -8.6, 1.7, 0.35, 0.75, dark, 0x080808, [0.4, 0, 0]);
  for (const s of [-1, 1]) K.box(s * 2.0, -0.35, -0.6, 0.04, 0.3, 12.5, burnt, RED);
  jagged(K, 6.5, 1, 11);
  soot(K, -5, 6.5, 12);
  K.box(1.99, 0.2, -4.2, 0.05, 1.9, 0.9, dark, 0x050505); // open door
  P.p1 = K.build();
  // P2: centre section with the left wing stub and engine
  K = new MeshKit();
  tube(K, -5, 5, CHAR);
  jagged(K, -5, -1, 21); jagged(K, 5, 1, 22);
  soot(K, -5, 5, 23);
  K.prism([[-2, -0.9, -1.2], [-2, -0.5, -1.0], [-2, -0.5, 3.4], [-2, -0.9, 3.4]], [[-10, -1.1, 2.0], [-10, -0.8, 2.1], [-10, -0.8, 4.4], [-10, -1.1, 4.4]], burnt, CHAR);
  K.cylZ(-5.8, -2.0, 0.6, 1.05, 0.9, 4.2, dark, 0x2a2826, 16);
  K.cylZ(-5.8, -2.0, -1.52, 0.8, 0.8, 0.06, ember, new THREE.Color(1.6, 0.45, 0.08), 14);
  // torn right wing root
  K.prism([[2, -0.9, -1.2], [2, -0.5, -1.0], [2, -0.5, 3.4], [2, -0.9, 3.4]], [[3.8, -1.0, -0.2], [3.8, -0.6, 0], [3.8, -0.6, 3.6], [3.8, -1.0, 3.6]], burnt, SOOT);
  P.p2 = K.build();
  // P3: tail section with fin and stabilisers
  K = new MeshKit();
  tube(K, -4, 3, WHITE);
  K.cylZ(0, 0.4, 6, 0.5, R, 6, burnt, WHITE, 20, true);
  jagged(K, -4, -1, 31);
  soot(K, -4, 6, 32);
  K.prism([[-0.18, 1.6, 2.5], [-0.18, 1.6, 8.6], [0.18, 1.6, 8.6], [0.18, 1.6, 2.5]], [[-0.1, 7.6, 7.0], [-0.1, 7.6, 9.6], [0.1, 7.6, 9.6], [0.1, 7.6, 7.0]], burnt, RED);
  for (const s of [-1, 1]) K.prism([[0, 0.9, 5.2], [0, 1.1, 5.4], [0, 1.1, 8.2], [0, 0.9, 8.2]], [[s * 6, 1.3, 7.4], [s * 6, 1.4, 7.5], [s * 6, 1.4, 8.8], [s * 6, 1.3, 8.8]], burnt, WHITE);
  P.p3 = K.build();
  // P4: detached engine
  K = new MeshKit();
  K.cylZ(0, 0, 0, 1.05, 0.9, 4.2, dark, 0x3a3836, 16);
  K.cylZ(0, 0, -2.1, 0.78, 0.78, 0.06, dark, 0x0a0a0a, 14);
  K.cylZ(0, 0, 2.2, 0.5, 0.7, 0.8, dark, 0x2a2826, 12);
  K.box(0, 1.2, 0, 0.35, 0.6, 2.2, burnt, CHAR);
  P.p4 = K.build();
  // P5: right wing, upside down
  K = new MeshKit();
  K.prism([[0, -0.2, -2.2], [0, 0.2, -2.0], [0, 0.2, 2.2], [0, -0.2, 2.2]], [[13, -0.1, 1.8], [13, 0.1, 1.9], [13, 0.1, 3.4], [13, -0.1, 3.4]], burnt, WHITE);
  K.box(6, -0.25, 0.5, 11, 0.05, 1.6, burnt, SOOT);
  P.p5 = K.build();
  return P;
}

export function buildCrash(L, game, S) {
  const flames = S.flames;
  const sky = S.sky;
  // ------------------------------------------------------------ the airliner
  const model = airlinerModel({ livery: 0xb01e28, color: 0xe6e2da });
  liveryDecals(model);
  let cabin = null;
  model.traverse((m) => { if (m.isMesh && m.material.isMeshBasicMaterial) cabin = m.material; });
  const flyer = new Flyer(L, game, model, { sky, light: { color: 0xfff0d8, intensity: 70, range: 90 }, audio: { vol: 3.6, ref: 70, whine: 250, whineVol: 0.06, hiss: 0.5 }, shake: 160 });
  // ------------------------------------------------------------ wreck pieces
  const P = wreckPieces();
  const pieces = [
    { g: P.p1, off: [0, 0, -12], rest: [-24, 2.0, 99], ryaw: HEAD + 0.55, rroll: 0.28, dur: 2.7, sparks: 1 },
    { g: P.p2, off: [0, 0, 0], rest: [4, 2.05, 101.5], ryaw: HEAD - 0.4, rroll: -0.32, dur: 2.3, sparks: 1 },
    { g: P.p3, off: [0, 0, 11], rest: [38, 1.8, 103.5], ryaw: HEAD + 2.5, rroll: 0.42, dur: 1.9, sparks: 1 },
    { g: P.p4, off: [5.8, -2, -0.6], rest: [15, 1.0, 97], ryaw: HEAD + 1.9, rroll: 1.4, dur: 2.2, tumble: 4, sparks: 0.6 },
    { g: P.p5, off: [3, -0.9, 1.8], rest: [27, 0.25, 108.5], ryaw: HEAD + 0.95, rroll: Math.PI, dur: 1.6, tumble: 1.2, sparks: 0.4 },
  ];
  for (const pc of pieces) {
    pc.g.visible = false;
    pc.g.rotation.order = 'YXZ';
    pc.g.userData.noCull = true;
    L.addObject(pc.g);
  }
  // ------------------------------------------------------------ persistent fires (off until the crash)
  const F = [];
  const fl = (x, y, z, w, h, k = 1, delay = 0) => F.push({ f: flames.add(x, y, z, w, h, { intensity: 0, on: false, flicker: 0.2 }), k, delay });
  // around the pieces (world rest positions)
  fl(-24, 1.5, 99, 5, 8, 1.1); fl(-19, 0.5, 98, 4, 5, 0.9); fl(-29, 2.6, 99.5, 3.5, 6, 0.8);
  fl(4, 2.2, 101.5, 8, 13, 1.3, 2); fl(-2, 0.3, 100.5, 7, 7, 1.1, 2); fl(9, 0.3, 102.5, 7, 9, 1.2, 2); fl(0, 0.2, 104, 9, 5, 0.9, 2); fl(6, 3.5, 100.2, 4, 7, 1.0, 2);
  fl(38, 1.2, 103.5, 5, 7, 0.9, 1); fl(42, 0.2, 104.8, 4, 4, 0.8, 1);
  fl(15, 0.6, 97, 3, 4, 0.9); fl(27, 0.2, 108.5, 6, 3.5, 0.8, 1); fl(31, 0.2, 106.5, 5, 3, 0.7, 1);
  // burning fuel trail along the slide path
  for (let i = 0; i < 7; i++) { const x = 58 - i * 11, z = 106 - i * 1.1; fl(x, 0.05, z + (i % 2 ? 1.5 : -1.5), 6 + (i % 3), 2.2 + (i % 2) * 1.5, 0.75, i < 2 ? 0 : 1.5); }
  const lights = [
    L.light(-22, 5, 98, 0xff7030, 38, 36, { on: false, flicker: 0.5, priority: 1 }),
    L.light(5, 7, 100, 0xff8038, 55, 48, { on: false, flicker: 0.45, priority: 1.5 }),
    L.light(36, 4, 103, 0xff6a28, 30, 32, { on: false, flicker: 0.5, priority: 1 }),
  ];
  const plumes = [
    { x: 4, y: 8, z: 101, h: 170, r: 13, alpha: 0, speed: 0.022 }, { x: -24, y: 6, z: 99, h: 130, r: 9, alpha: 0, speed: 0.02 },
    { x: 38, y: 5, z: 103, h: 110, r: 8, alpha: 0, speed: 0.024 },
  ];
  smokePlumes(L, game, plumes, { per: 10, wind: [1, -0.4], lo: 0x8a4a26, hi: 0x151314 });

  const st = { started: false, t: 0, impacted: false, fuel: false, done: false };
  const api = {
    st, flyer, model, pieces, fuelPos: new THREE.Vector3(4, 2, 101.5), impactPos: new THREE.Vector3(64, 1.5, 107),
    start() {
      if (st.started) return;
      st.started = true;
      st.t = 0;
      flyer.o.onUpdate = (t) => approach(t);
      flyer.fly(CRASH_KEYS, { onEnd: impact });
    },
    update(dt) {
      if (!st.started || st.done) return;
      st.t += dt;
      if (st.impacted) slide(dt);
      if (!st.fuel && st.t >= FUEL_T) fuelBlast();
      for (const e of F) if (st.impacted && !e.lit && st.t >= IMPACT_T + e.delay) { e.lit = true; if (e.f) { e.f.target = e.k; e.f.rate = 0.9; } }
      if (st.t > FUEL_T + 12) st.done = true;
    },
  };
  L.dynamics.push(api);

  let trailT = 0;
  function approach(t) {
    const o = model;
    // nobody is flying it: rolling, yawing, one engine on fire
    const k = Math.min(1, t / 2.5);
    o.rotation.z += (Math.sin(t * 1.9) * 0.3 + Math.sin(t * 4.7) * 0.07) * k;
    o.rotation.y += Math.sin(t * 1.3) * 0.05 * k;
    o.rotation.x += Math.sin(t * 2.9) * 0.03 * k;
    o.updateMatrixWorld(true);
    if (cabin) { const f = Math.random() < 0.08 ? 0.15 : 1; cabin.color.setRGB(1.6 * f, 1.35 * f, 0.9 * f); }
    trailT -= 1 / 60;
    const eng = V.set(-5.8, -2.0, 0.4).applyMatrix4(o.matrixWorld);
    const vel = flyer.vel;
    flames.puff(eng.x, eng.y, eng.z, { vx: vel.x * 0.05, vy: 1, vz: vel.z * 0.05, s0: 1.4, s1: 4.5, life: 0.5 + Math.random() * 0.3, heat: 1.2, intensity: 1.5, drag: 3, rise: 1 });
    if (trailT <= 0) {
      trailT = 1 / 30;
      game.fx.smokeColumn(eng.x, eng.y, eng.z, 1.6, [0.07, 0.065, 0.06]);
    }
  }
  function impact() {
    st.impacted = true;
    st.slideT = 0;
    const p = flyer.pos, v = flyer.vel;
    api.impactPos.copy(p);
    const m = model.matrixWorld;
    for (const pc of pieces) {
      V.set(pc.off[0], pc.off[1], pc.off[2]).applyMatrix4(m);
      pc.start = [V.x, Math.max(pc.rest[1], V.y), V.z];
      pc.syaw = model.rotation.y;
      pc.sroll = model.rotation.z;
      pc.spitch = model.rotation.x;
      pc.g.visible = true;
      pc.g.position.set(...pc.start);
      pc.g.rotation.set(pc.spitch, pc.syaw, pc.sroll);
      pc.t = 0;
    }
    boom(p.x, 1.5, p.z, 3.4, 2.2);
    flames.fireball(p.x, 2, p.z, 9, 18, { life: 1.6 });
    game.audio.play('explosion', { vol: 0.9 });
    game.audio.play('tankPunch', { pos: p, vol: 3 });
    for (const l of lights) l.on = true;
    lights[1].intensity = 0;
    scrape = game.audio.loop('metalGate', { pos: p.clone(), vol: 2.5 });
    void v;
  }
  let scrape = null;
  function slide(dt) {
    st.slideT += dt;
    let moving = false;
    for (const pc of pieces) {
      pc.t += dt;
      const k = Math.min(1, pc.t / pc.dur);
      if (k < 1) moving = true;
      const e = ease(k);
      const x = pc.start[0] + (pc.rest[0] - pc.start[0]) * e, z = pc.start[2] + (pc.rest[2] - pc.start[2]) * e;
      let y = pc.start[1] + (pc.rest[1] - pc.start[1]) * e;
      if (pc.tumble) y += Math.abs(Math.sin(k * Math.PI * pc.tumble)) * (1 - k) * 4.5;
      const g = pc.g;
      g.position.set(x, y, z);
      g.rotation.y = lerpAng(pc.syaw, pc.ryaw, e);
      g.rotation.z = pc.sroll + (pc.rroll - pc.sroll) * e + (pc.tumble ? (1 - e) * pc.tumble * 3 : 0);
      g.rotation.x = pc.spitch * (1 - e) + (pc.tumble ? Math.sin(k * 9) * (1 - k) * 0.8 : 0);
      if (k < 0.95 && Math.random() < 0.6 * pc.sparks) {
        game.fx.sparks(x + (Math.random() - 0.5) * 3, 0.15, z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 0.4, 0.8, (Math.random() - 0.5) * 0.4, 10, [1, 0.7, 0.35], 11);
        if (Math.random() < 0.35) flames.puff(x, y + 1, z, { vx: 0, vy: 2, vz: 0, s0: 2, s1: 6, life: 0.7, heat: 1, intensity: 1.2, drag: 2, rise: 2 });
        if (Math.random() < 0.1) L.decal(x, 0.02, z, 0, 1, 0, 3 + Math.random() * 3, DF.SCORCH);
      }
      if (k >= 1 && !pc.settled) { pc.settled = true; game.audio.play('metalImpact', { pos: g.position, vol: 2.5 }); game.fx.dust(x, 0.5, z, 0, 1, 0, [0.35, 0.32, 0.3], 14, 2.5); }
    }
    if (scrape) scrape.set({ pos: pieces[1].g.position });
    if (!moving && scrape) { scrape.stop(1.5); scrape = null; }
    if (st.slideT < 1.8 && Math.random() < 0.12) {
      const pc = pieces[Math.floor(Math.random() * 3)];
      boom(pc.g.position.x, 1.5, pc.g.position.z, 1.6, 0.8);
    }
  }
  function fuelBlast() {
    st.fuel = true;
    const p = api.fuelPos;
    boom(p.x, 2, p.z, 5, 4);
    flames.fireball(p.x, 3, p.z, 16, 34, { life: 2.8, intensity: 1.8 });
    flames.fireball(p.x - 9, 1.5, p.z - 1, 9, 14, { life: 2.2 });
    flames.fireball(p.x + 10, 1.5, p.z + 1, 9, 14, { life: 2.2 });
    for (let i = 0; i < 4; i++) setTimeout(() => { try { game.fx.explosion(p.x + (Math.random() - 0.5) * 22, 1, p.z + (Math.random() - 0.5) * 8, 3); } catch (e) { /* level gone */ } }, 120 + i * 180);
    for (let i = 0; i < 12; i++) game.fx.smokeColumn(p.x + (Math.random() - 0.5) * 14, 6 + Math.random() * 8, p.z + (Math.random() - 0.5) * 6, 4, [0.09, 0.08, 0.075]);
    game.audio.play('explosion', { vol: 1.2 });
    game.audio.play('propaneExplode', { pos: p, vol: 3 });
    lights[1].intensity = 55;
    for (const pl of plumes) pl.alpha = 0.9;
    S.onFuelBlast?.(p);
    // fire glow on everything from the south
    const moon = game.moon;
    if (moon) {
      const i0 = moon.intensity, i1 = i0 + 0.22;
      let k = 0;
      L.dynamics.push({ update(dt) { if (k >= 1) return; k = Math.min(1, k + dt * 0.4); moon.intensity = i0 + (i1 - i0) * k; } });
    }
    game.audio.loop('fireLoop', { pos: new THREE.Vector3(4, 2, 101), vol: 2.2 });
  }
  function boom(x, y, z, scale, shakeK) {
    game.fx.explosion(x, y, z, scale);
    game.fx.shockwave(x, y + 0.2, z, 6 * scale);
    game.lights.flash(x, y + 6, z, 0xffa050, 120 * scale, 30 * scale + 40, 0.9);
    game.audio.play('explosion', { pos: new THREE.Vector3(x, y, z), vol: 2.5 });
    const d = game.camPos.distanceTo(V.set(x, y, z));
    game.shake(Math.min(1.2, shakeK * 60 / (60 + d)));
    L.decal(x, 0.03, z, 0, 1, 0, 6 * scale, DF.SCORCH);
    S.onShock?.(x, y, z, scale);
  }
  return api;
}
