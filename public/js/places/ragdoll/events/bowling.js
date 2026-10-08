// Event 5: RAGDOLL BOWLING. You are the ball. Eight polished maple lanes
// with giant pins at the end. Pick your line (A/D), hold Space for power and
// you're flung down the ramp head first. The lanes are slippery, the pins are
// heavy, and a strike is worth a lot.
import * as THREE from 'three';
import * as CANNON from '../../../vendor/cannon-es.js';
import { mat, colorMat, textTex, V, rnd, clamp } from '../kit.js';
import { aimPhase, Prop, award } from './common.js';
import { ragMaterial } from '../rag.js';
import * as A from '../audio.js';

const X0 = 146, XS = 160, XL = 178, XH = 282, XP = 298, XB = 314; // start platform, ramp top, lane start, head pin, pit, back wall
const Z0 = 170, LANE = 12, Y_START = 10, Y_LANE = 2;
const AIM_SECS = 10, ROLL_SECS = 12;
const ROWS = [[0], [-1.45, 1.45], [-2.9, 0, 2.9], [-4.35, -1.45, 1.45, 4.35]];

let laneMat = null;
function pinGeometry() {
  const prof = [[0.01, 0], [0.7, 0], [0.95, 0.4], [1.12, 1.4], [1.1, 2.3], [0.78, 3.3], [0.5, 4.0], [0.52, 4.5], [0.66, 5.1], [0.6, 5.7], [0.3, 6.05], [0.01, 6.1]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(prof, 20);
  g.translate(0, -2.2, 0);
  // white with two red neck stripes
  const c = document.createElement('canvas'); c.width = 8; c.height = 128;
  const x = c.getContext('2d'); x.fillStyle = '#f7f5f0'; x.fillRect(0, 0, 8, 128); x.fillStyle = '#d8232a'; x.fillRect(0, 22, 8, 7); x.fillRect(0, 34, 8, 7);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { g, m: new THREE.MeshStandardMaterial({ map: t, roughness: 0.25 }) };
}

function buildVenue(K, E) {
  const world = E.world;
  laneMat = new CANNON.Material('lane');
  // the ragdolls slide on the lanes; pins grip a little
  // (cannon caps friction per step, not per second: at 120 Hz a 'real' 0.03 is about 0.00025 here)
  world.physics.addContactMaterial(new CANNON.ContactMaterial(ragMaterial(world), laneMat, { friction: 0.00025, restitution: 0.05, contactEquationStiffness: 1e8, contactEquationRelaxation: 3 }));
  world.physics.addContactMaterial(new CANNON.ContactMaterial(world.defaultPhysMaterial, laneMat, { friction: 0.3, restitution: 0.2 }));
  const ZW = Z0 + LANE * 8;
  // the start platform and the ramp down to the lanes
  K.span(X0 - 6, 0, Z0 - 2, XS, Y_START, ZW + 2, 'concrete');
  K.span(X0 - 6, Y_START, Z0 - 2, XS, Y_START + 0.15, ZW + 2, 'lane', { col: false });
  K.wedge((XS + XL) / 2, Y_LANE + (Y_START - Y_LANE) / 2, (Z0 + ZW) / 2, ZW - Z0, Y_START - Y_LANE, XL - XS, 'lane', { rot: -Math.PI / 2, material: laneMat });
  K.span(XS, 0, Z0 - 2, XL, Y_LANE, ZW + 2, 'concrete', { col: false });
  // the lanes: polished maple, with gutters and dividers
  K.span(XL, 0, Z0 - 2, XP, Y_LANE, ZW + 2, 'lane', { material: laneMat });
  for (let i = 0; i <= 8; i++) {
    const z = Z0 + i * LANE;
    K.box((XS + XP) / 2, Y_LANE + 1.6, z, XP - XS, 3.2, 0.7, colorMat(0x2a2f3a, 0.4, 0.3), { col: false });
    K.col((XS + XP) / 2, Y_LANE + 4, z, XP - XS, 8, 0.7);
    for (const s of [-1, 1]) if ((i > 0 || s > 0) && (i < 8 || s < 0)) K.box((XL + XP) / 2, Y_LANE + 0.02, z + s * 0.9, XP - XL, 0.04, 1.1, colorMat(0x1a1c22, 0.3), { col: false });
  }
  // arrows and dots on the lanes
  for (let i = 0; i < 8; i++) {
    const zc = Z0 + i * LANE + LANE / 2;
    for (const dz of [-2.4, -1.2, 0, 1.2, 2.4]) K.geo(new THREE.ConeGeometry(0.35, 1.2, 3).rotateZ(-Math.PI / 2).rotateX(Math.PI / 2), colorMat(0xd8232a, 0.4), XL + 30 - Math.abs(dz) * 2, Y_LANE + 0.03, zc + dz, null, { noShadow: true });
  }
  // the pit and the back wall
  K.span(XP, 0, Z0 - 2, XB, 0.2, ZW + 2, 'rubber');
  K.span(XB, -3, Z0 - 2, XB + 2, 14, ZW + 2, colorMat(0x15161a, 0.9));
  for (const s of [Z0 - 3, ZW + 3]) K.span(XS, 0, s - 1, XB + 2, 14, s + 1, 'concrete');
  // the canopy: steel frame, neon sign and a scoreboard over each lane
  for (const x of [XS + 4, XS + 50, XS + 100, XP + 4]) for (const z of [Z0 - 4, ZW + 4]) K.box(x, 12, z, 1.2, 24, 1.2, 'steel', { col: false });
  for (const x of [XS + 4, XS + 50, XS + 100, XP + 4]) K.box(x, 24, (Z0 + ZW) / 2, 1.4, 1.4, ZW - Z0 + 10, 'steel', { col: false });
  K.box((XS + XP) / 2 + 2, 24.9, (Z0 + ZW) / 2, XP - XS + 4, 0.4, ZW - Z0 + 10, colorMat(0x1a2a5a, 0.6, 0, { side: THREE.DoubleSide }), { col: false });
  const sign = textTex(['STRIKE ARENA'], { w: 1024, h: 160, bg: '#0b0f24', fg: '#ff4fb0', border: '#4fc8ff', bw: 10, size: 104 });
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(56, 8.75), new THREE.MeshStandardMaterial({ map: sign, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: 0.9 }));
  sm.position.set(XB + 0.9, 18, (Z0 + ZW) / 2); sm.rotation.y = -Math.PI / 2; K.group.add(sm);
  // the pins
  const pg = pinGeometry();
  const pins = [];
  for (let i = 0; i < 8; i++) {
    const zc = Z0 + i * LANE + LANE / 2;
    const lane = [];
    ROWS.forEach((row, r) => row.forEach((dz) => {
      const shapes = [
        [new CANNON.Box(new CANNON.Vec3(0.75, 0.25, 0.75)), new CANNON.Vec3(0, -1.95, 0)],
        [new CANNON.Sphere(1.08), new CANNON.Vec3(0, -0.4, 0)],
        [new CANNON.Sphere(0.6), new CANNON.Vec3(0, 2.6, 0)],
      ];
      const prop = new Prop(world, new THREE.Mesh(pg.g, pg.m), shapes, V(XH + r * 3.0, Y_LANE + 2.2 + 0.02, zc + dz), { mass: 1.4, tag: 'pin' });
      prop.body.allowSleep = true;
      lane.push(prop);
    }));
    pins.push(lane);
  }
  // spectators on a balcony along the north side
  for (let row = 0; row < 5; row++) {
    const z = Z0 - 8 - row * 3, y = 6 + row * 1.5;
    K.span(XL, 0, z - 1.5, XP, y, z + 1.5, 'concrete', { col: false });
    for (let x = XL + 2; x < XP - 2; x += 2.4) if (Math.random() < 0.75) E.park.crowd.seat(x, y, z, 0);
  }
  return { pins, update() { for (const lane of pins) for (const p of lane) p.sync(); } };
}

function standing(p) { return p.tilt() < 0.35 && p.moved() < 2.6 && p.body.position.y > 0; }

export default {
  id: 'bowling', name: 'Ragdoll Bowling', icon: '🎳', color: '#ff4fb0',
  where: 'The Strike Arena',
  desc: 'You are the ball. Slide down the lane and knock down as many pins as you can. A strike is worth a lot.',
  keys: [['A D', 'pick your line'], ['Space', 'hold for power, let go to bowl'], ['A D', 'on the lane: lean']],
  time: AIM_SECS + ROLL_SECS + 2, higher: true, camDist: 22,
  fmt: (a) => `${a.down ?? 0} pins${a.down === 10 ? ' · STRIKE' : ''}`,
  live: (a) => (a.launched ? `${a.down ?? 0} pins` : '–'),

  build(K, E) { return buildVenue(K, E); },

  shots: () => [
    { from: V(XH - 10, 40, Z0 + 48), to: V(XH - 30, 28, Z0 + 48), look: V(XB, 4, Z0 + 48), look2: V(XH, 3, Z0 + 48), secs: 2.8 },
    { from: V(X0 - 34, 30, Z0 + 48), to: V(X0 - 14, 22, Z0 + 48), look: V(XH, 2, Z0 + 48), secs: 2.8 },
  ],

  enter(E, ev) {
    ev.venue.pins.forEach((lane) => lane.forEach((p) => p.reset()));
    ev.ath.forEach((a, k) => {
      a.li = k % 8; a.zc = Z0 + a.li * LANE + LANE / 2; a.off = 0; a.ang = 0;
      a.down = 0;
      E.stand(a.p, V(X0 + 2 - (k >= 8 ? 4 : 0), Y_START + 0.15, a.zc), -Math.PI / 2, true);
    });
  },
  spectate: () => ({ position: V(rnd(X0 - 4, X0), Y_START + 0.2, Z0 - 1), yaw: -Math.PI / 2 }),

  start(E, ev) {
    ev.aimLeft = AIM_SECS;
    const me = ev.ath.find((a) => a.p.isLocal);
    if (me) {
      E.shot(() => V(X0 - 15, Y_START + 13, me.zc + me.off * 0.6), () => V(XH, Y_LANE + 1, me.zc + me.off + me.ang * 120), 6);
      E.ui.hint('<b>A</b><b>D</b> pick your line · hold <b>SPACE</b> for power, let go to bowl');
      E.ui.myScore(0, 'pins', 'PINS DOWN');
    }
    A.whistle();
  },

  update(E, ev, dt) {
    ev.aimLeft -= dt;
    const me = ev.ath.find((a) => a.p.isLocal);
    const waiting = aimPhase(E, ev, dt, {
      aim: (a, dx) => {
        a.off = clamp(a.off + dx * 4, -3, 3);
        a.ang = clamp(-a.off * 0.012, -0.04, 0.04);
        const ch = a.p.character; ch.body.position.z = a.zc + a.off; ch.body.interpolatedPosition.z = ch.body.position.z;
        ch.facing = ch.lockFacing = -Math.PI / 2 - a.ang * 4;
      },
      botAim: (a) => { const s = a.bot.skill; a.off = rnd(-1.5, 1.5) * (1.2 - s); a.ang = rnd(-0.02, 0.02) * (1.2 - s); a.bot.power = clamp(rnd(0.5, 0.8) + s * 0.25, 0.3, 1); a.bot.at = rnd(1.5, AIM_SECS - 1); const ch = a.p.character; ch.body.position.z = a.zc + a.off; ch.facing = ch.lockFacing = -Math.PI / 2 - a.ang * 4; },
      launch: (a, pw) => {
        const ch = a.p.character;
        // lie down flat, head first down the lane (arms out in front like Superman)
        // (the figure's up becomes +x, its front faces the floor)
        ch.root.position.set(X0 + 6, Y_START + 1.1, a.zc + a.off);
        ch.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 0, 1), V(1, 0, 0), V(0, 1, 0)));
        ch.motor.rs = 2.5; ch.motor.ls = -2.5; ch.motor.rh = 0; ch.motor.lh = 0;
        const rag = E.ragdoll(a);
        const sp = 40 + 48 * pw;
        rag.setVelocity(Math.cos(a.ang) * sp, -2, Math.sin(a.ang) * sp);
        rag.pose('superman', 0.3);
        a.leanable = true;
        A.swoosh(rag.position);
        if (a.p.isLocal) {
          E.ui.hint('<b>A</b><b>D</b> lean');
          E.shot(() => (a.rag?.alive ? a.rag.position : V(XH, 3, a.zc)).clone().add(V(-18, 8, 0)), () => (a.rag?.alive ? a.rag.position : V(XH, 3, a.zc)).clone().add(V(16, -1, 0)), 8, { lookLerp: 20 });
        }
      },
    });
    if (waiting) ev.timer = Math.max(0, ev.aimLeft);
    else { ev.rollT = (ev.rollT ?? ROLL_SECS) - dt; ev.timer = ev.rollT; }
    ev.status = me && !me.launched ? 'Pick your line, hold SPACE and let go to bowl!' : 'Strike!';
    let busy = 0;
    for (const a of ev.ath) {
      if (!a.launched) { busy++; continue; }
      const lane = ev.venue.pins[a.li];
      a.down = lane.filter((p) => !standing(p)).length;
      a.score = a.down * 100 + (a.down === 10 ? 500 : 0) + (a.style || 0);
      if (a.p.isLocal) E.ui.myScore(a.down, 'pins', 'PINS DOWN');
      if (a.done) continue;
      const rag = a.rag;
      if (!rag?.alive) { a.done = true; continue; }
      // lean: a little sideways push while sliding
      if (a.p.isLocal && rag.position.x < XH + 4) { const st = (E.held('d') ? 1 : 0) - (E.held('a') ? 1 : 0); if (st) for (const b of rag.bodies) b.velocity.z += st * 9 * dt; }
      if (!a.struck && rag.position.x > XH - 2) a.struck = ev.t;
      const settled = a.struck && ev.t - a.struck > 2.2 && lane.every((p) => p.body.sleepState !== CANNON.Body.AWAKE || p.body.velocity.length() < 0.8);
      if ((rag.still > 1 && (settled || rag.position.x < XH - 8)) || ev.t - a.launchT > ROLL_SECS - 0.5 || (a.struck && ev.t - a.struck > 5)) {
        a.done = true;
        a.down = lane.filter((p) => !standing(p)).length;
        a.score = a.down * 100 + (a.down === 10 ? 500 : 0) + (a.style || 0);
        if (a.down === 10) { E.ui.pop('STRIKE!', V(XH + 4, 10, a.zc), '#ff4fb0', a.p.isLocal ? 46 : 26, 2); A.cheer(1.2); E.fx.confetti(V(XH + 4, 8, a.zc), 60, 6, 16); }
        if (a.p.isLocal) { E.ui.hint(''); E.ui.toast(a.down === 10 ? '🎳 STRIKE!!!' : `${a.down} pins down`, '#ff4fb0', 3); if (a.down < 10) A.ding(); }
        continue;
      }
      busy++;
    }
    return !busy && ev.t > 2;
  },

  impact(E, ev, a, h) {
    if (!a.launched || a.done) return;
    if (h.other?.prop?.body?.tag === 'pin' || h.other?.tag === 'pin') {
      a.style = (a.style || 0) + Math.max(0, h.v - 10) * 0.1;
      if (!a.pinSound || ev.t - a.pinSound > 0.5) { a.pinSound = ev.t; A.pins(h.point, Math.min(10, 3 + h.v / 8)); E.park.crowd.excite(0.7); }
    }
  },
  resultCam: (E, ev, w) => [() => V(XH - 36 + Math.sin(E.phaseT * 0.2) * 4, 24, w.zc - 24), () => V(XH + 4, 2, w.zc)],
  leave(E, ev) { ev.venue.pins.forEach((lane) => lane.forEach((p) => p.reset())); },
};
void award;
