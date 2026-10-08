// Event 3: THE WIPEOUT RUN. A race across the lake, on your own two feet.
// The course:
//  - the Big Red Balls (slippery)
//  - the Sweeper (a spinning bar - jump it)
//  - the Punch Wall (boxing gloves on pistons)
//  - the Hammers (swinging over a narrow bridge)
//  - up the ramp to the finish arch.
// Anything that hits you knocks you flat (you're a rag doll until you've
// stopped, then you get up). Fall in the lake and you go back to the last
// checkpoint. Fastest time wins.
import * as THREE from 'three';
import * as CANNON from '../../../vendor/cannon-es.js';
import { GROUP } from '../../../engine/Part.js';
import { mat, colorMat, textTex, waterMaterial, V, rnd, clamp } from '../kit.js';
import { LAKE } from '../map.js';
import * as A from '../audio.js';

const Y = 4; // the top of the course
const X_START = -236, X_FINISH = -500;
const BALL_R = 4.5, BALL_Y = 2.2, BALLS = [-262, -276].flatMap((x) => [-15, -5, 5, 15].map((z) => [x, z]));
const DISC = { x: -327, r: 22 }, BAR_W = 0.9; // the sweeper: angular speed in update
const PUNCH = [[-375, -1], [-384, 1], [-393, -1], [-402, 1], [-409, -1]];
const HAMMERS = [-439, -452, -465];
const CHECKPOINTS = [X_START + 4, -295, -357, -421];
const RACE_SECS = 80, AFTER_FIRST = 25;
const COURSE = X_START - X_FINISH;

function kinematic(world, shapes, pos) {
  const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: world.defaultPhysMaterial });
  for (const [s, off, q] of shapes) b.addShape(s, off, q);
  b.position.set(pos.x, pos.y, pos.z);
  b.collisionFilterGroup = GROUP.DYNAMIC;
  b.collisionFilterMask = GROUP.CHARACTER | GROUP.DEBRIS | GROUP.DYNAMIC;
  b.allowSleep = false;
  world.physics.addBody(b);
  return b;
}
const meshOf = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; return o; };

function buildVenue(K, E) {
  const world = E.world, L = LAKE;
  // the lake: a sandy bed, banks, the water
  K.span(L.x0, L.bottom - 2, L.z0, L.x1, L.bottom, L.z1, 'sand');
  for (const [x0, z0, x1, z1] of [[L.x0 - 4, L.z0 - 4, L.x1 + 4, L.z0], [L.x0 - 4, L.z1, L.x1 + 4, L.z1 + 4], [L.x0 - 4, L.z0, L.x0, L.z1], [L.x1, L.z0, L.x1 + 4, L.z1]]) K.span(x0, L.bottom - 2, z0, x1, 0, z1, 'stone');
  const water = new THREE.Mesh(new THREE.PlaneGeometry(L.x1 - L.x0, L.z1 - L.z0).rotateX(-Math.PI / 2), waterMaterial(0x2a7fa8, { repeat: [30, 13], opacity: 0.86, flow: 0.6 }));
  water.position.set((L.x0 + L.x1) / 2, L.y, (L.z0 + L.z1) / 2); water.renderOrder = 1;
  K.group.add(water);
  const plat = (x0, x1, z0, z1, top = Y, m = 'blue') => {
    K.span(x0, top - 1.5, z0, x1, top, z1, m === 'blue' ? colorMat(0x2a6fd6, 0.55) : mat(m));
    K.span(x0 + 0.01, top - 0.01, z0 + 0.01, x1 - 0.01, top + 0.02, z1 - 0.01, colorMat(0xf2f2ee, 0.6), { col: false }); // a white top
    for (const x of [x0 + 2, x1 - 2]) for (const z of [z0 + 2, z1 - 2]) K.box(x, (L.bottom + top - 1.5) / 2, z, 1.4, top - 1.5 - L.bottom, 1.4, 'darkSteel', { col: false });
  };
  // the start (half on the shore)
  plat(-252, -214, -24, 24);
  K.box(X_START, Y + 0.05, 0, 1, 0.1, 48, colorMat(0xffffff, 0.5), { col: false });
  // the big red balls on their poles
  const ballM = colorMat(0xe0262a, 0.25, 0.05);
  for (const [x, z] of BALLS) {
    K.geo(new THREE.SphereGeometry(BALL_R, 28, 18), ballM, x, BALL_Y, z);
    K._body(new CANNON.Sphere(BALL_R), x, BALL_Y, z, null, { tag: 'ball' });
    K.box(x, (L.bottom + BALL_Y) / 2, z, 1.2, BALL_Y - L.bottom, 1.2, 'darkSteel', { col: false });
  }
  // checkpoint platforms with flags, the sweeper disc
  plat(-307, -287, -24, 24); plat(-364, -348, -24, 24); plat(-428, -413, -24, 24); // (the first two run into the sweeper's disc)
  for (const x of CHECKPOINTS.slice(1)) for (const s of [-1, 1]) { K.box(x, Y + 4, s * 23, 0.4, 8, 0.4, 'steel', { col: false }); E.park.flags.add(x, Y, s * 23, 8, 0.3); }
  K.geo(new THREE.CylinderGeometry(DISC.r, DISC.r, 2, 48), colorMat(0x2a6fd6, 0.5), DISC.x, Y - 1, 0);
  K.geo(new THREE.CylinderGeometry(DISC.r - 0.4, DISC.r - 0.4, 0.06, 48), colorMat(0xf6d21e, 0.6), DISC.x, Y + 0.02, 0);
  K._body(new CANNON.Cylinder(DISC.r, DISC.r, 2, 24), DISC.x, Y - 1, 0, null, {});
  K.box(DISC.x, (L.bottom + Y) / 2, 0, 4, Y - L.bottom, 4, 'darkSteel', { col: false });
  // the bridges: the punch run (wide) and the hammer bridge (narrow)
  K.span(-413, Y - 1.5, -14, -364, Y, 14, colorMat(0xf2f2ee, 0.6));
  // a housing for each glove at the side of the bridge (the gaps between them drop you in the lake)
  for (const [x, s] of PUNCH) {
    K.span(x - 4, Y - 1.5, s > 0 ? 14 : -20, x + 4, Y + 8, s > 0 ? 20 : -14, colorMat(0xf6d21e, 0.6));
    K.span(x - 4.2, Y + 8, s > 0 ? 13.8 : -20.2, x + 4.2, Y + 8.6, s > 0 ? 20.2 : -13.8, colorMat(0xd8232a, 0.5), { col: false });
  }
  K.span(-479, Y - 1.5, -8, -428, Y, 8, colorMat(0xf2f2ee, 0.6));
  for (const s of [-1, 1]) for (const x of [-434, -446, -458, -470]) K.box(x, Y + 13, s * 12, 1.2, 26, 1.2, 'steel', { col: false });
  K.box(-452, Y + 26, -12, 40, 1.4, 1.4, 'steel', { col: false }); K.box(-452, Y + 26, 12, 40, 1.4, 1.4, 'steel', { col: false });
  for (const x of HAMMERS) K.box(x, Y + 26, 0, 1.4, 1.4, 25, 'steel', { col: false });
  // the ramp and the finish
  K.wedge(-487, Y + (10 - Y) / 2, 0, 16, 10 - Y, 16, colorMat(0xf2f2ee, 0.6), { rot: -Math.PI / 2 });
  K.span(-495, 0, -8, -479, Y, 8, colorMat(0x2a6fd6, 0.55), { col: false });
  plat(-530, -495, -24, 24, 10);
  // the finish arch: a big inflatable
  const archM = colorMat(0xff7a1a, 0.55);
  const arch = new THREE.TorusGeometry(16, 2.2, 14, 36, Math.PI);
  K.geo(arch, archM, X_FINISH, 10, 0, Math.PI / 2);
  const fin = textTex(['FINISH'], { w: 512, h: 128, bg: '#ffffff', fg: '#d8232a', size: 96 });
  const fm = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshStandardMaterial({ map: fin, side: THREE.DoubleSide }));
  fm.position.set(X_FINISH, 25, 0); fm.rotation.y = Math.PI / 2; K.group.add(fm);
  K.box(X_FINISH, 10.05, 0, 1, 0.1, 44, colorMat(0x111111, 0.5), { col: false });
  // spectators on the north bank
  for (let row = 0; row < 7; row++) {
    const z = L.z0 - 12 - row * 3.2, y = 1 + row * 1.6;
    K.span(-540, 0, z - 1.6, -230, y, z + 1.6, 'concrete', { col: false });
    for (let x = -538; x < -232; x += 2.4) if (Math.random() < 0.7) E.park.crowd.seat(x, y, z, 0);
  }

  // --- the moving parts -----------------------------------------------------------------------------------------------
  const red = colorMat(0xd8232a, 0.45), yellow = colorMat(0xf6d21e, 0.5), white = colorMat(0xf6f6f2, 0.5);
  // the sweeper bar (both ways across the disc)
  const bar = kinematic(world, [[new CANNON.Box(new CANNON.Vec3(DISC.r - 0.5, 0.8, BAR_W)), new CANNON.Vec3(0, 0, 0)]], V(DISC.x, Y + 1.3, 0));
  const barG = new THREE.Group();
  barG.add(meshOf(new THREE.BoxGeometry((DISC.r - 0.5) * 2, 1.6, BAR_W * 2), red));
  for (let i = -5; i <= 5; i++) { const s = meshOf(new THREE.BoxGeometry(0.6, 1.65, BAR_W * 2 + 0.05), yellow); s.position.x = i * 4; barG.add(s); }
  const hub = meshOf(new THREE.CylinderGeometry(2.2, 2.2, 3.4, 20), yellow); barG.add(hub);
  world.scene.add(barG);
  // the punchers: a glove on a piston from the side walls
  const gloves = PUNCH.map(([x, s], i) => {
    const home = V(x, Y + 3.2, s * 15.5);
    const b = kinematic(world, [[new CANNON.Sphere(2.6), new CANNON.Vec3(0, 0, 0)]], home);
    const g = new THREE.Group();
    const glove = meshOf(new THREE.SphereGeometry(2.6, 18, 12), red); glove.scale.set(1, 0.95, 1.15); g.add(glove);
    const cuff = meshOf(new THREE.CylinderGeometry(1.6, 1.6, 1.6, 14), white); cuff.rotation.x = Math.PI / 2; cuff.position.z = s * 2.6; g.add(cuff);
    const rod = meshOf(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), mat('steel')); rod.rotation.x = Math.PI / 2; g.add(rod);
    world.scene.add(g);
    return { b, g, home, s, rod, phase: i * 0.83, ext: 0 };
  });
  // the hammers: a big drum on an arm, swinging across the narrow bridge
  const hammers = HAMMERS.map((x, i) => {
    const pivot = V(x, Y + 26, 0);
    const b = kinematic(world, [[new CANNON.Cylinder(2.6, 2.6, 7, 14), new CANNON.Vec3(0, -20, 0), new CANNON.Quaternion().setFromEuler(Math.PI / 2, 0, 0)]], pivot);
    const g = new THREE.Group(); g.position.copy(pivot);
    const arm = meshOf(new THREE.CylinderGeometry(0.45, 0.45, 20, 8), mat('steel')); arm.position.y = -10; g.add(arm);
    const drum = meshOf(new THREE.CylinderGeometry(2.6, 2.6, 7, 20), red); drum.rotation.x = Math.PI / 2; drum.position.y = -20; g.add(drum);
    for (const dz of [-2.4, 2.4]) { const band = meshOf(new THREE.CylinderGeometry(2.66, 2.66, 0.9, 20), white); band.rotation.x = Math.PI / 2; band.position.set(0, -20, dz); g.add(band); }
    world.scene.add(g);
    return { b, g, pivot, phase: i * 1.1, amp: 1.05, w: 2.3 };
  });
  const v = { bar, barG, gloves, hammers, ang: 0, water: [{ x0: L.x0, x1: L.x1, z0: L.z0, z1: L.z1, y: L.y, bottom: L.bottom }] };
  v.update = (dt, t) => animate(v, dt, t);
  return v;
}

/** Drive the obstacles from the clock (velocities too, so the bodies they hit are thrown properly). */
const SWEEP_W = 1.15;
function animate(v, dt, t) {
  // the sweeper
  v.ang = t * SWEEP_W;
  const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), v.ang);
  v.bar.quaternion.set(q.x, q.y, q.z, q.w); v.bar.angularVelocity.set(0, SWEEP_W, 0);
  v.barG.position.set(v.bar.position.x, v.bar.position.y, v.bar.position.z); v.barG.quaternion.copy(q);
  // the punchers: out fast, hold, back slowly (every 2.6 s)
  for (const g of v.gloves) {
    const c = ((t + g.phase) % 2.6) / 2.6;
    const ext = c < 0.08 ? c / 0.08 : c < 0.2 ? 1 : c < 0.5 ? 1 - (c - 0.2) / 0.3 : 0;
    const z = g.home.z - g.s * ext * 13;
    const vz = (z - g.b.position.z) / Math.max(dt, 1e-3);
    g.b.position.set(g.home.x, g.home.y, z); g.b.velocity.set(0, 0, vz);
    g.g.position.set(g.home.x, g.home.y, z);
    // the piston reaches from the glove back into its housing
    const len = 1.5 + ext * 13;
    g.rod.scale.y = len; g.rod.position.z = g.s * (2.4 + len / 2);
    g.ext = ext; g.vz = vz;
    // a warning shudder before the punch
    if (c > 0.9) g.g.position.x += Math.sin(t * 80) * 0.15;
  }
  // the hammers: a pendulum swing
  for (const h of v.hammers) {
    const th = Math.sin(t * h.w + h.phase) * h.amp, om = Math.cos(t * h.w + h.phase) * h.amp * h.w;
    const qq = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), th);
    h.b.quaternion.set(qq.x, qq.y, qq.z, qq.w); h.b.angularVelocity.set(om, 0, 0);
    h.g.quaternion.copy(qq);
    h.th = th; h.om = om;
  }
}

/** Is something at p (feet) being hit, and how hard (returns a velocity to throw it with, or null)? */
function hitBy(v, p, airborne) {
  // the sweeper: on the disc, near the bar, and not jumping over it
  const dx = p.x - DISC.x, dz = p.z, r = Math.hypot(dx, dz);
  if (r < DISC.r && p.y < Y + 2.4 && r > 2) {
    const a = Math.atan2(-dz, dx); // (the bar's angle convention: rotation about +y)
    let d = Math.abs(((a - v.ang) % Math.PI + Math.PI * 1.5) % Math.PI - Math.PI / 2);
    if (d * r < BAR_W + 1.2) {
      // thrown the way the bar is going (w x r), and outwards
      const sp = SWEEP_W * r * 1.6 + 16;
      return V((dz / r) * sp + (dx / r) * 10, 24, (-dx / r) * sp + (dz / r) * 10);
    }
  }
  // gloves
  for (const g of v.gloves) {
    if (g.ext < 0.05) continue;
    const gp = g.b.position;
    if (Math.abs(p.x - gp.x) < 3.4 && Math.abs(p.z - gp.z) < 3.6 && p.y < gp.y + 2 && p.y > gp.y - 6.5) return V(rnd(-4, 4), 18, -g.s * 52);
  }
  // hammers
  for (const h of v.hammers) {
    const hz = h.pivot.z - Math.sin(h.th) * 20, hy = h.pivot.y - Math.cos(h.th) * 20;
    if (Math.abs(p.x - h.pivot.x) < 4 && Math.abs(p.z - hz) < 3.4 && p.y < hy + 3 && p.y + 5 > hy - 3) return V(rnd(-3, 3), 20, -Math.sign(h.om || 1) * (Math.abs(h.om) * 20 * 0.9 + 18));
  }
  void airborne;
  return null;
}

// --- the bots: a route with jumps and waits ------------------------------------------------------------------------------------
function route(a) {
  const z = a.z, col = [-15, -5, 5, 15].reduce((b, c) => (Math.abs(c - z) < Math.abs(b - z) ? c : b), 15);
  const zb = clamp(z, -10, 10), zh = clamp(z * 0.3, -4, 4);
  return [
    { x: -250.5, z: col }, { jump: true, x: -262, z: col, y: BALL_Y + BALL_R }, { x: -263, z: col, onBall: true }, { jump: true, x: -276, z: col, y: BALL_Y + BALL_R }, { x: -277, z: col, onBall: true },
    { jump: true, x: -291, z: clamp(z, -18, 18), y: Y }, { x: -299, z: clamp(z, -18, 18), cp: 1 },
    { x: -304, z: zb * 0.6, sweep: true }, { x: -350, z: zb * 0.6, sweep: true }, { x: -360, z: zb, cp: 2 },
    { x: -366, z: zb, punch: true }, { x: -412, z: zb, punch: true }, { x: -424, z: zh, cp: 3 },
    { x: -430, z: zh, hammer: 0 }, { x: -446, z: zh, hammer: 1 }, { x: -459, z: zh, hammer: 2 }, { x: -480, z: zh },
    { x: -505, z: zh }, { x: -515, z: zh },
  ];
}
/** Seconds of flight for a jump to land dy higher (the higher landing). */
function flight(J, g, dy) { const d = J * J - 2 * g * dy; return d < 0 ? 0.6 : (J + Math.sqrt(d)) / g; }

export default {
  id: 'wipeout', name: 'Wipeout Run', icon: '🥊', color: '#7cf07c',
  where: 'The Lake',
  desc: 'A race across the lake, on foot. Big balls, a sweeper, punching walls and swinging hammers. Fall in and it is back to the last checkpoint.',
  keys: [['W A S D', 'run'], ['Space', 'jump'], ['right-drag', 'look']],
  time: RACE_SECS + 4, higher: false, camDist: 18,
  fmt: (a) => (a.finishT != null ? `${a.finishT.toFixed(1)} s` : `DNF (${Math.round(a.prog * 100)}%)`),
  live: (a) => (a.finishT != null ? `${a.finishT.toFixed(1)} s` : `${Math.round(a.prog * 100)}%`),

  build(K, E) { return buildVenue(K, E); },

  shots: () => [
    { from: V(-200, 34, -60), to: V(-260, 26, -70), look: V(-300, 4, 0), secs: 2.8 },
    { from: V(-390, 30, 60), to: V(-450, 24, 50), look: V(-430, 6, 0), look2: V(-500, 10, 0), secs: 2.8 },
  ],

  enter(E, ev) {
    ev.ath.forEach((a, k) => {
      a.z = -15.75 + (k % 8) * 4.5; a.cp = 0; a.prog = 0; a.finishT = null; a.score = 1e9; a.ri = 0;
      E.stand(a.p, V(X_START + 3 + (k >= 8 ? 4 : 0), Y, a.z), Math.PI / 2, true);
    });
  },
  spectate: () => ({ position: V(rnd(-232, -218), Y, rnd(-20, -18)), yaw: Math.PI / 2 }),

  start(E, ev) {
    ev.go = 3.2; ev.raceT = 0;
    ev.status = 'Get ready...';
    const me = ev.ath.find((a) => a.p.isLocal);
    if (me) {
      E.followChar(me.p.character);
      const cam = E.game.camera; cam.yaw = Math.PI / 2; cam.elevation = 0.3; cam.distance = 18;
      E.ui.hint('<b>W</b><b>A</b><b>S</b><b>D</b> run · <b>SPACE</b> jump · right-drag to look');
      E.ui.myScore('0.0', 's', 'TIME');
    }
    for (let i = 0; i < 3; i++) E.world.delay(0.2 + i, () => { E.ui.count(String(3 - i)); A.beep(false); });
    E.world.delay(3.2, () => { E.ui.count('GO!', '#7cf07c'); A.pistol(); E.park.crowd.excite(1); A.cheer(0.8); });
  },

  update(E, ev, dt) {
    const v = ev.venue;
    if (ev.go > 0) {
      ev.go -= dt; ev.timer = Math.max(0, ev.go);
      if (ev.go <= 0) for (const a of ev.ath) { const ch = a.p.character; if (ch?.frozen) ch.freeze(false); }
      return false;
    }
    ev.raceT += dt;
    const first = ev.ath.find((a) => a.finishT != null);
    const limit = first ? Math.min(RACE_SECS, first.finishT + AFTER_FIRST) : RACE_SECS;
    ev.timer = limit - ev.raceT;
    const me = ev.ath.find((a) => a.p.isLocal);
    ev.status = me?.finishT != null ? `Finished in ${me.finishT.toFixed(1)} s!` : first ? `${first.p.name} has finished! Hurry!` : 'Run! Jump the sweeper, dodge the gloves and hammers';
    if (me && me.finishT == null) E.ui.myScore(ev.raceT.toFixed(1), 's', 'TIME');
    let racing = 0;
    for (const a of ev.ath) {
      const ch = a.p.character;
      if (!ch) continue;
      const rag = ch.rag;
      if (a.finishT != null) { a.liveSort = a.finishT; if (!rag && a.p.isBot) { ch.input.move.set(p0(ch).x > X_FINISH - 20 ? -0.4 : 0, 0, 0); ch.input.jump = false; } continue; }
      racing++;
      a.liveSort = 1000 - a.prog * 100;
      if (rag) {
        // knocked flat: up again once still (or back to the checkpoint if in the lake)
        const p = rag.position;
        const wet = p.y < LAKE.y + 1.5;
        a.downT = (a.downT || 0) + dt;
        if (wet && a.downT > 1.8) { respawn(E, a); continue; }
        if (!wet && (rag.still > 0.35 || a.downT > 3) && a.downT > 1.1 && !a.gettingUp) {
          const ground = E.world.raycast(V(p.x, p.y + 1, p.z), V(p.x, p.y - 6, p.z), { mask: GROUP.WORLD | GROUP.DYNAMIC });
          if (ground && ground.point.y > Y - 1) E.getUp(a, ground.point, Math.PI / 2, () => { a.downT = 0; a.immuneT = E.ev ? E.ev.t + 1.3 : 0; });
          else if (a.downT > 3) respawn(E, a);
        }
        continue;
      }
      if (a.gettingUp) continue;
      const p = ch.rootPosition;
      const feet = V(p.x, p.y - 3, p.z);
      // progress and checkpoints
      a.prog = clamp((X_START - p.x) / COURSE, a.prog, 1);
      for (let i = CHECKPOINTS.length - 1; i > a.cp; i--) if (p.x < CHECKPOINTS[i] + 3 && feet.y > Y - 1 && ch.grounded) { a.cp = i; if (a.p.isLocal) { E.ui.toast(`✔ Checkpoint ${i}`, '#7cf07c', 1.5); A.ding(); } break; }
      // finished?
      if (p.x < X_FINISH && feet.y > 8) {
        a.finishT = ev.raceT; a.score = a.finishT; a.prog = 1; a.done = true;
        const place = ev.ath.filter((b) => b.finishT != null).length;
        E.ui.pop(place === 1 ? 'WINNER!' : `${place}${['st', 'nd', 'rd'][place - 1] || 'th'}!`, p.clone().add(V(0, 4, 0)), '#7cf07c', a.p.isLocal ? 30 : 18, 2);
        A.cheer(place === 1 ? 1.3 : 0.7);
        if (place === 1) E.fx.confetti(V(X_FINISH, 22, 0), 140, 12, 10);
        if (a.p.isLocal) { E.ui.toast(`🏁 Finished in ${a.finishT.toFixed(1)} s!`, '#7cf07c', 3.5); E.ui.hint(''); }
        continue;
      }
      // in the lake?
      if (feet.y < LAKE.y + 0.5) { knock(E, a, V(ch.body.velocity.x * 0.5, 4, ch.body.velocity.z * 0.5), 'SPLASH!'); continue; }
      // hit by something?
      const hv = hitBy(v, feet, !ch.grounded);
      if (hv && !(a.immuneT > ev.t)) { knock(E, a, hv, hitWord()); continue; }
      // standing on a big ball: it rolls out from under you
      for (const [bx, bz] of BALLS) {
        const dx = p.x - bx, dz = p.z - bz, r = Math.hypot(dx, dz);
        if (r < BALL_R && feet.y > BALL_Y + BALL_R * 0.4 && feet.y < BALL_Y + BALL_R + 0.6 && ch.grounded && r > 0.3) { ch.body.position.x += (dx / r) * dt * (2 + r * 1.6); ch.body.position.z += (dz / r) * dt * (2 + r * 1.6); }
      }
      if (a.bot) botDrive(E, ev, a, v, dt);
    }
    return racing === 0 || ev.raceT >= limit;
  },

  finish(E, ev) {
    for (const a of ev.ath) if (a.finishT == null) a.score = 1000 + (1 - a.prog) * 100;
  },
  resultCam: () => [() => V(-470, 24, -34), () => V(X_FINISH - 12, 10, 0)],
  leave(E, ev) { for (const a of ev.ath) { const ch = a.p.character; if (ch) { ch.input.move.set(0, 0, 0); ch.input.jump = false; } } },
};

const p0 = (ch) => ch.rootPosition;
function hitWord() { return ['WIPEOUT!', 'BONK!', 'POW!', 'WHAM!', 'SMACK!'][Math.floor(Math.random() * 5)]; }

function knock(E, a, vel, word) {
  const ch = a.p.character;
  if (!ch || ch.rag) return;
  const rag = E.ragdoll(a);
  rag.setVelocity(vel.x, vel.y, vel.z);
  rag.spinTorso(rnd(-6, 6), rnd(-4, 4), rnd(-6, 6));
  a.downT = 0;
  const p = rag.position.clone().add(V(0, 3, 0));
  if (word !== 'SPLASH!') { A.punch(p); E.fx.star(p, 1.2); A.ooh(0.7); E.park.crowd.excite(0.8); }
  E.ui.pop(word, p, word === 'SPLASH!' ? '#7cd8ff' : '#ffcf4a', a.p.isLocal ? 28 : 17);
  if (a.p.isLocal) { E.shake(1); E.followRag(rag, { dist: 20 }); }
  if (a.bot) a.bot.wait = 0;
}

function respawn(E, a) {
  const x = CHECKPOINTS[a.cp];
  const z = clamp(a.z, a.cp === 3 ? -6 : -18, a.cp === 3 ? 6 : 18);
  E.stand(a.p, V(x - (a.cp ? 0 : 0), Y, z), Math.PI / 2, false);
  a.downT = 0; a.immuneT = E.ev.t + 1.2;
  if (a.bot) { a.ri = [0, 6, 9, 12][a.cp]; a.bot.wait = 0; }
  if (a.p.isLocal) { E.followChar(a.p.character); const cam = E.game.camera; cam.yaw = Math.PI / 2; E.ui.toast('Back to the checkpoint!', '#7cd8ff', 1.5); }
}

/** A bot runs its route: walks to each point, jumps where it must, and waits for the obstacles. */
function botDrive(E, ev, a, v, dt) {
  const ch = a.p.character, b = a.bot, R = a.route || (a.route = route(a));
  const p = ch.rootPosition, feet = p.y - 3;
  let step = R[a.ri];
  if (!step) { ch.input.move.set(-1, 0, 0); return; }
  const sk = b.skill;
  ch.input.jump = false;
  // waiting for a gap?
  if (b.wait > 0) { b.wait -= dt; ch.input.move.set(0, 0, 0); return; }
  const dx = step.x - p.x, dz = step.z - p.z, d = Math.hypot(dx, dz);
  let mv = d > 0.01 ? V(dx / d, 0, dz / d) : V(-1, 0, 0);
  let speed = 1;
  if (step.jump) {
    // jump from where we are, timed so as to land on the target
    if (ch.grounded && !b.jumping) {
      const t = flight(ch.jumpPower, E.world.physics.gravity.length(), step.y - feet);
      speed = clamp(d / (t * ch.walkSpeed) * rnd(0.92, 1.08 + (1 - sk) * 0.15), 0.3, 1);
      ch.input.jump = true; b.jumping = true; b.jv = mv.clone().multiplyScalar(speed);
    }
    if (b.jumping) {
      mv = b.jv; speed = 1;
      if (ch.grounded && ch.world.time - (ch.jumpedAt || 0) > 0.2) { b.jumping = false; a.ri++; }
    }
  } else {
    if (d < 1.6 || (dx > 0 && Math.abs(dz) < 3)) { a.ri++; step = R[a.ri]; }
    // the sweeper: jump the bar as it comes round
    if (step?.sweep || (a.ri > 6 && a.ri < 9)) {
      const ddx = p.x - DISC.x, ddz = p.z, r = Math.hypot(ddx, ddz);
      if (r < DISC.r + 1 && ch.grounded) {
        const ang = Math.atan2(-ddz, ddx);
        // time until the bar reaches us (it turns at SWEEP_W, both ends)
        let gap = ((ang - v.ang) % Math.PI + Math.PI) % Math.PI;
        const tt = gap / SWEEP_W;
        if (tt < 0.22 + (1 - sk) * rnd(-0.15, 0.15) && tt > 0.05) ch.input.jump = true;
      }
    }
    // the punch run: hang back if the glove just ahead is about to fire
    if (step?.punch) {
      for (const g of v.gloves) {
        const ahead = p.x - g.home.x;
        if (ahead > 1 && ahead < 7 && Math.random() < sk * 0.9) {
          const c = ((E.world.time + g.phase) % 2.6) / 2.6;
          if (c > 0.85 || c < 0.25) { speed = 0; }
        }
      }
    }
    // the hammers: wait for the next one to swing away
    if (step?.hammer != null) {
      const h = v.hammers[step.hammer];
      const near = Math.abs(p.x - h.pivot.x) < 9;
      if (near && Math.random() < 0.6 + sk * 0.4) {
        const hz = -Math.sin(h.th) * 20;
        if (Math.abs(hz) < 9 && Math.abs(p.x - h.pivot.x) > 3.5) speed = 0;
      }
    }
    // a stumble now and then
    if (Math.random() < dt * (1 - sk) * 0.3) b.wait = rnd(0.2, 0.7);
  }
  ch.input.move.copy(mv.multiplyScalar(speed));
}
