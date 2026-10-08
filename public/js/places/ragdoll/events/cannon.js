// Event 2: THE HUMAN CANNONBALL. Eight cannons on a stone rampart over the
// long meadow. Climb in, aim (W/S raises and lowers the barrel, A/D turns it),
// hold Space for powder and let go to fire. In the air, hold W to fly like
// Superman (you glide further) and A/D to steer. Your distance is where you
// end up after all the bouncing and rolling. There are bonuses for flying
// through the golden hoops and for coming to rest on the bullseye. The
// trampolines throw you on; the hay bales and the pond stop you dead.
import * as THREE from 'three';
import { mat, colorMat, textTex, V, rnd, clamp, GRAV } from '../kit.js';
import { aimPhase, award } from './common.js';
import * as A from '../audio.js';

const XR = 252, YR = 12; // the front edge of the rampart and its top
const XC = 241, LANE = 12;
const AIM_SECS = 10, FLY_SECS = 13;
const M = 0.28; // metres per stud
const HOOPS = [[330, 30, -16, 9], [405, 40, 18, 9], [480, 30, -10, 9], [560, 22, 12, 8]];
const TRAMPS = [[350, 24, 7], [425, -30, 7], [515, 30, 7], [590, -26, 7]];
const BALES = [[372, -6], [380, -40], [455, 40], [470, -2], [545, -44], [620, 6], [390, 46], [600, 52]];
const POND = { x0: 486, x1: 540, z0: -88, z1: -48 };
const TARGET = { x: 660, z: 0, r: 22 };

function makeCannon(world, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const wood = colorMat(0x7a4a26, 0.85), iron = colorMat(0x26282c, 0.45, 0.6), brass = mat('bronze');
  const add = (geo, m, px, py, pz, rx = 0, ry = 0, rz = 0, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  // the carriage and its wheels
  add(new THREE.BoxGeometry(6.5, 1.8, 3.6), wood, -0.6, 1.4, 0);
  add(new THREE.BoxGeometry(2.2, 2.6, 4.4), wood, 0.8, 2.6, 0);
  for (const s of [-1, 1]) {
    const w = add(new THREE.CylinderGeometry(2, 2, 0.7, 18), wood, 0.6, 2, s * 2.5, Math.PI / 2);
    add(new THREE.TorusGeometry(2, 0.15, 6, 18), iron, 0, 0.36 * s, 0, Math.PI / 2, 0, 0, w);
    add(new THREE.CylinderGeometry(1.2, 1.2, 0.4, 14), wood, -3.2, 1, s * 2.1, Math.PI / 2);
  }
  // the barrel: a tapered iron tube with rings, pivoting on its trunnions
  const pivot = new THREE.Group(); pivot.position.set(0.8, 3.6, 0); g.add(pivot);
  const prof = [[0.01, -3.4], [1.0, -3.4], [1.45, -3.0], [1.5, -2.2], [1.35, 0], [1.15, 4.8], [1.35, 5.0], [1.35, 5.6], [0.85, 5.6], [0.85, 0]].map(([r, h]) => new THREE.Vector2(r, h));
  const tube = add(new THREE.LatheGeometry(prof, 24), iron, 0, 0, 0, 0, 0, -Math.PI / 2, pivot);
  void tube;
  for (const h of [-2.2, 0.9, 3.4]) add(new THREE.TorusGeometry(1.4 - h * 0.03, 0.13, 6, 24), brass, h, 0, 0, 0, Math.PI / 2, 0, pivot);
  add(new THREE.SphereGeometry(0.7, 12, 8), iron, -3.8, 0, 0, 0, 0, 0, pivot);
  add(new THREE.CylinderGeometry(0.35, 0.35, 3.6, 10), iron, 0, 0, 0, Math.PI / 2, 0, 0, pivot);
  world.scene.add(g);
  const c = {
    g, pivot, el: 0.7, yaw: 0,
    set(el, yaw) { c.el = el; c.yaw = yaw; g.rotation.y = yaw; pivot.rotation.z = el; },
    /** The muzzle (world) and the direction the barrel points. */
    muzzle() { g.updateMatrixWorld(true); const p = new THREE.Vector3(5.8, 0, 0); pivot.localToWorld(p); const d = new THREE.Vector3(Math.cos(c.el), Math.sin(c.el), 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw); return { p, d }; },
    recoil: 0,
  };
  return c;
}

function buildVenue(K, E) {
  const world = E.world;
  // the rampart: a stone platform with battlements, steps up from the path
  K.span(XR - 30, 0, -60, XR, YR, 60, 'stone');
  K.span(XR - 30, YR, -60, XR, YR + 0.2, 60, 'paving', { col: false });
  for (let z = -58; z <= 58; z += 6) K.box(XR - 29, YR + 1.6, z, 2, 3.2, 3, 'stone'); // the back wall
  for (const s of [-1, 1]) K.span(XR - 30, YR, s * 60 - 1, XR, YR + 3.2, s * 60 + 1, 'stone');
  for (let i = 0; i < 9; i++) { const z = -48 + i * LANE; K.box(XR - 0.8, YR + 1, z, 1.6, 2, 3.2, 'stone'); } // merlons between the guns
  for (let i = 0; i < 12; i++) K.span(XR - 30 - (i + 1) * 2.4, 0, -10, XR - 30 - i * 2.4, YR - i, 10, 'stone'); // steps at the back
  // the field: distance lines and boards
  for (let d = 50; d <= 450; d += 50) {
    const x = XR + d;
    K.box(x, 0.06, 0, 1, 0.12, 190, 'white', { col: false });
    const t = textTex([`${Math.round(d * M)} m`], { w: 256, h: 128, bg: '#1a3a7a', fg: '#ffffff', border: '#ffd24a', bw: 8 });
    for (const sz of [-1, 1]) {
      K.box(x, 3, sz * 98, 0.6, 6, 0.6, 'steel', { col: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
      m.position.set(x, 7, sz * 98); m.rotation.y = sz > 0 ? Math.PI : 0; K.group.add(m);
      const m2 = m.clone(); m2.rotation.y += Math.PI; m2.position.z += sz * 0.05; K.group.add(m2);
    }
  }
  for (const sz of [-1, 1]) K.box(XR + 225, 0.06, sz * 95, 450, 0.12, 0.8, 'white', { col: false });
  // the bullseye at the far end
  const ringCols = [0xd8332a, 0xffffff, 0xd8332a, 0xffffff, 0xf7c51e];
  ringCols.forEach((c, i) => { const r = TARGET.r * (1 - i / 5); K.geo(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), colorMat(c, 0.7), TARGET.x, 0.08 + i * 0.01, TARGET.z); });
  // golden hoops
  const hoopGeo = new THREE.TorusGeometry(1, 0.07, 10, 40);
  for (const [x, y, z, r] of HOOPS) {
    K.geo(hoopGeo, colorMat(0xffd24a, 0.25, 0.85, { emissive: 0x7a5200, emissiveIntensity: 0.5 }), x, y, z, Math.PI / 2, { scale: [r, r, r] });
    K.box(x, y / 2 - r / 2, z, 0.6, y - r, 0.6, 'steel', { col: false });
  }
  // trampolines
  for (const [x, z, r] of TRAMPS) {
    K.cyl(x, 1.1, z, r, 2.2, colorMat(0x1f6fd1, 0.5), { col: false, seg: 28 });
    K.cyl(x, 2.25, z, r - 0.7, 0.1, mat('trampoline'), { col: false, seg: 28, noShadow: true });
    K.col(x, 1.1, z, r * 1.6, 2.2, r * 1.6, 0, { tag: 'tramp' });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; K.box(x + Math.cos(a) * (r - 0.4), 0.5, z + Math.sin(a) * (r - 0.4), 0.6, 1, 0.6, 'darkSteel', { col: false }); }
  }
  // hay bales (they stop you)
  for (const [x, z] of BALES) {
    for (const [dx, dy, dz] of [[0, 1.5, 0], [0, 1.5, 3.2], [0, 4.5, 1.6]]) K.box(x + dx, dy, z + dz, 6, 3, 3.2, 'hay', { tag: 'soft', data: { dust: '#e6cf7a' } });
  }
  // the pond
  K.span(POND.x0 - 1, 0, POND.z0 - 1, POND.x1 + 1, 0.7, POND.z1 + 1, 'stone', { col: false });
  K.box((POND.x0 + POND.x1) / 2, 0.75, (POND.z0 + POND.z1) / 2, POND.x1 - POND.x0, 0.1, POND.z1 - POND.z0, colorMat(0x3a8fc0, 0.08, 0.1, { transparent: true, opacity: 0.88 }), { col: false, noShadow: true });
  // the grandstand along the north side
  for (let row = 0; row < 8; row++) {
    const z = -104 - row * 3.2, y = 1 + row * 1.6;
    K.span(XR + 40, 0, z - 1.6, XR + 340, y, z + 1.6, 'concrete', { col: false });
    for (let x = XR + 42; x < XR + 338; x += 2.4) if (Math.random() < 0.72) E.park.crowd.seat(x, y, z, 0);
  }
  E.park.flags.add(XR + 2, YR, -62, 10, 0.3); E.park.flags.add(XR + 2, YR, 62, 10, 0.3);
  // the cannons
  const cannons = [];
  for (let i = 0; i < 8; i++) { const c = makeCannon(world, XC, YR, -42 + i * LANE); c.set(0.7, 0); cannons.push(c); }
  return { cannons, water: [{ x0: POND.x0, x1: POND.x1, z0: POND.z0, z1: POND.z1, y: 0.75, bottom: -2 }] };
}

/** Where a shot lands (no air): for the bots' choices and the aiming arc. */
function arc(p, v, t) { return V(p.x + v.x * t, p.y + v.y * t - 0.5 * GRAV * t * t, p.z + v.z * t); }
const speedOf = (pw) => 70 + 95 * pw;

export default {
  id: 'cannon', name: 'Human Cannonball', icon: '💥', color: '#ff7a3a',
  where: 'The Cannon Range',
  desc: 'Get fired out of a cannon. The furthest you end up wins: fly through the hoops and stop on the bullseye for bonuses.',
  keys: [['W S', 'raise / lower the barrel'], ['A D', 'turn'], ['Space', 'hold for powder, let go to fire'], ['W', 'in the air: fly like Superman · A D steer']],
  time: AIM_SECS + FLY_SECS + 2, higher: true, camDist: 30,
  fmt: (a) => `${(a.score * M).toFixed(1)} m`,
  live: (a) => (a.launched ? `${(a.score * M).toFixed(1)} m` : '–'),

  build(K, E) {
    const v = buildVenue(K, E);
    const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(new Array(30).fill(0).map(() => V())), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 1.2, gapSize: 1.2, transparent: true, opacity: 0.8 }));
    trail.visible = false; E.world.scene.add(trail);
    v.trail = trail;
    v.markers = [];
    v.update = (dt) => { for (const c of v.cannons) { c.recoil = Math.max(0, c.recoil - dt * 3); c.pivot.position.x = 0.8 - c.recoil * 1.6; } };
    return v;
  },

  shots: () => [
    { from: V(XR + 380, 50, 80), to: V(XR + 120, 34, 60), look: V(XR + 200, 0, 0), look2: V(XR, 12, 0), secs: 2.8 },
    { from: V(XR - 40, 30, -60), to: V(XR - 30, 22, 40), look: V(XC, 14, 0), secs: 2.8 },
  ],

  enter(E, ev) {
    const v = ev.venue;
    for (const m of v.markers) E.world.scene.remove(m);
    v.markers = [];
    ev.ath.forEach((a, k) => {
      a.ci = k % 8;
      a.cannon = v.cannons[a.ci];
      a.el = 0.7; a.yaw = 0;
      a.cannon.set(a.el, a.yaw);
      a.hoops = new Set();
      E.stand(a.p, V(XC - 7, YR + 0.2, a.cannon.g.position.z + (k >= 8 ? 3 : 0)), -Math.PI / 2, true);
    });
  },
  spectate: () => ({ position: V(rnd(XR - 26, XR - 6), YR + 0.3, rnd(-56, -50)), yaw: -Math.PI / 2 }),

  start(E, ev) {
    ev.aimLeft = AIM_SECS;
    ev.status = 'Aim with W/S and A/D · hold SPACE, let go to FIRE';
    const me = ev.ath.find((a) => a.p.isLocal);
    if (me) {
      const c = me.cannon;
      // behind the gun, a little above and to the side, looking along the barrel
      E.shot(() => { const m = c.muzzle(), f = V(Math.cos(c.yaw), 0, -Math.sin(c.yaw)), s = V(Math.sin(c.yaw), 0, Math.cos(c.yaw)); return m.p.clone().addScaledVector(f, -20).addScaledVector(s, 5).add(V(0, 7, 0)); },
        () => { const m = c.muzzle(), f = V(Math.cos(c.yaw), 0, -Math.sin(c.yaw)); return m.p.clone().addScaledVector(f, 80).add(V(0, 6 + Math.sin(c.el) * 30, 0)); }, 5);
      E.ui.hint('<b>W</b><b>S</b> elevation · <b>A</b><b>D</b> aim · hold <b>SPACE</b> for powder, let go to FIRE');
      E.ui.myScore('–', '', 'DISTANCE');
      ev.venue.trail.visible = true;
    }
    A.whistle();
  },

  update(E, ev, dt) {
    const v = ev.venue;
    ev.aimLeft -= dt;
    const waiting = aimPhase(E, ev, dt, {
      label: 'POWDER',
      aim: (a, dx, dy) => { a.el = clamp(a.el + dy * 0.7, 0.26, 1.15); a.yaw = clamp(a.yaw - dx * 0.6, -0.42, 0.42); a.cannon.set(a.el, a.yaw); },
      botAim: (a) => {
        const s = a.bot.skill;
        a.el = rnd(0.6, 0.85); a.yaw = rnd(-0.12, 0.12);
        a.bot.power = clamp(rnd(0.55, 0.85) + s * 0.25 - Math.random() * 0.15, 0.3, 1);
        a.bot.at = rnd(2, AIM_SECS - 1);
        a.bot.superman = Math.random() < 0.3 + s * 0.6;
      },
      launch: (a, pw) => {
        const c = a.cannon, m = c.muzzle(), ch = a.p.character;
        // into the barrel, head first
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), m.d);
        ch.root.position.copy(m.p).addScaledVector(m.d, -1.5);
        ch.root.quaternion.copy(q);
        ch.motor.rs = 2.4; ch.motor.ls = -2.4; ch.motor.rh = 0; ch.motor.lh = 0;
        const rag = E.ragdoll(a);
        const sp = speedOf(pw);
        rag.setVelocity(m.d.x * sp, m.d.y * sp, m.d.z * sp);
        rag.spinTorso(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1));
        rag.pose('superman', 0.3);
        E.world.delay(0.5, () => rag.alive && !a.superman && rag.pose(null));
        a.start = m.p.clone(); a.start.y = 0;
        c.recoil = 1;
        A.boom(m.p);
        E.fx.smoke(m.p, m.d, 1.2);
        E.park.crowd.excite(0.8);
        if (a.p.isLocal) {
          E.shake(2); E.ui.flash(0.4, '#fff3c0');
          v.trail.visible = false;
          E.ui.hint('hold <b>W</b> to fly like Superman · <b>A</b><b>D</b> steer');
          E.shot(() => (a.rag?.alive ? a.rag.position : m.p).clone().add(V(-24, 9, 10)), () => (a.rag?.alive ? a.rag.position : m.p).clone().add(V(8, -1, 0)), 9, { lookLerp: 30 });
        }
      },
    });
    // the aiming arc for the local athlete
    const me = ev.ath.find((a) => a.p.isLocal);
    if (me && !me.launched) {
      const m = me.cannon.muzzle(), sp = speedOf(me.power ?? 0.75), pts = [];
      for (let i = 0; i < 30; i++) pts.push(arc(m.p, m.d.clone().multiplyScalar(sp), i * 0.045));
      v.trail.geometry.setFromPoints(pts); v.trail.computeLineDistances();
    }
    if (waiting) ev.timer = Math.max(0, ev.aimLeft);
    else { ev.flyT = (ev.flyT ?? FLY_SECS) - dt; ev.timer = ev.flyT; }
    ev.status = me && !me.launched ? 'Aim with W/S and A/D · hold SPACE, let go to FIRE' : me && !me.done ? 'Flying! Hold W to fly like Superman' : 'Watch them fly!';
    let busy = 0;
    for (const a of ev.ath) {
      if (!a.launched) { busy++; continue; }
      if (a.done) continue;
      const rag = a.rag;
      if (!rag?.alive) { a.done = true; continue; }
      const p = rag.position;
      const air = p.y > 3 && rag.speed() > 20;
      // flying like Superman: hold W (glides: a little lift while fast), A/D to steer
      const wantS = a.p.isLocal ? E.held('w') : a.bot?.superman && ev.t - a.launchT > 0.3;
      if (air && wantS) {
        if (!a.superman) { a.superman = true; rag.pose('superman', 0.25); }
        for (const b of rag.bodies) b.velocity.y += GRAV * 0.16 * dt * E.timeScale;
      } else if (a.superman && (!wantS || !air)) { a.superman = false; rag.pose(null); }
      if (air && a.p.isLocal) {
        const st = (E.held('d') ? 1 : 0) - (E.held('a') ? 1 : 0);
        if (st) for (const b of rag.bodies) b.velocity.z += st * 14 * dt;
      }
      // through a hoop?
      for (let h = 0; h < HOOPS.length; h++) {
        const [hx, hy, hz, r] = HOOPS[h];
        if (a.hoops.has(h) || Math.abs(p.x - hx) > 2.5) continue;
        if (Math.hypot(p.y - hy, p.z - hz) < r - 0.5) {
          a.hoops.add(h);
          A.ding(); E.fx.sparks(p, 24, 22, [1, 0.85, 0.3]);
          E.ui.pop('HOOP! +7 m', p.clone().add(V(0, 3, 0)), '#ffd24a', a.p.isLocal ? 28 : 18);
          E.park.crowd.excite(0.7);
        }
      }
      a.dist = Math.hypot(p.x - a.start.x, p.z - a.start.z);
      a.score = a.dist + a.hoops.size * 25 + (a.bull ? 50 : 0);
      if (a.p.isLocal) E.ui.myScore(`${(a.score * M).toFixed(1)}`, 'm', 'DISTANCE');
      // at rest: measure, mark the spot
      const rested = (rag.still > 1 || rag.asleep) && ev.t - a.launchT > 1.5;
      if (rested || ev.t - a.launchT > FLY_SECS - 0.5 || p.y < -20) {
        a.done = true; rag.flail(false);
        if (Math.hypot(p.x - TARGET.x, p.z - TARGET.z) < TARGET.r) { a.bull = true; a.score += 50; E.ui.pop('BULLSEYE! +14 m', p.clone().add(V(0, 4, 0)), '#ff6a5a', 30); A.cheer(1.2); }
        marker(E, v, a, p);
        if (a.p.isLocal) { E.ui.hint(''); E.ui.toast(`${(a.score * M).toFixed(1)} metres!`, '#ff9a5a', 3); A.ding(); }
        continue;
      }
      busy++;
    }
    return !busy && ev.t > 2;
  },

  impact(E, ev, a, h) {
    if (!a.launched || a.done) return;
    // trampolines throw you on
    if (h.other?.tag === 'tramp' && h.v > 8 && (ev.t - (a.trampT || -9)) > 0.4) {
      a.trampT = ev.t;
      const vel = a.rag.velocity();
      const up = Math.max(45, Math.abs(vel.y) * 0.85 + 20);
      for (const b of a.rag.bodies) { b.velocity.y = up; b.velocity.x = vel.x * 1.05 + 6; b.velocity.z = vel.z; }
      A.boing(h.point); E.ui.pop('BOING!', h.point.clone().add(V(0, 3, 0)), '#7cd8ff', a.p.isLocal ? 26 : 16);
      E.park.crowd.excite(0.6);
    }
    if (h.other?.tag === 'soft' && h.v > 15) { for (const b of a.rag.bodies) b.velocity.scale(0.25, b.velocity); E.fx.dust(h.point, 1, '#e6cf7a'); if (a.p.isLocal) E.ui.pop('HAY!', h.point, '#ffe08a', 22); }
    if (h.v > 50 && a.p.isLocal && !a.landed) { a.landed = true; E.slowmo(0.35, 0.5); A.ooh(0.9); }
  },
  resultCam: (E, ev, w) => { const p = () => (w.rag?.alive ? w.rag.position : w.p.character.rootPosition); return [() => p().clone().add(V(-18 + Math.sin(E.phaseT * 0.2) * 6, 16, 20)), () => p().clone()]; },
  splash(E, ev, a, i) { if (i === 0 && a.launched && !a.done && a.p.isLocal) E.ui.pop('SPLASH!', a.rag.position.clone().add(V(0, 3, 0)), '#7cd8ff', 26); },
  finish(E, ev) { ev.venue.trail.visible = false; },
  leave(E, ev) { for (const m of ev.venue.markers) E.world.scene.remove(m); ev.venue.markers = []; ev.venue.trail.visible = false; for (const c of ev.venue.cannons) c.set(0.7, 0); },
};

/** A little flag where an athlete came to rest, with their name and distance. */
function marker(E, v, a, p) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
  pole.position.y = 3.5; g.add(pole);
  const t = textTex([a.p.name, `${(a.score * M).toFixed(1)} m`], { w: 256, h: 112, bg: a.p.isLocal ? '#ffd24a' : '#ffffff', fg: '#111', size: 44 });
  const f = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide }));
  f.position.set(2.3, 6, 0); g.add(f);
  g.position.set(p.x, 0, p.z);
  E.world.scene.add(g);
  v.markers.push(g);
}
