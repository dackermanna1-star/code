// Shared by the events: the aim-and-power start (hold Space, the meter swings
// up and down, let go at the top), loose props that can be knocked about and
// put back for the next run, and scoring helpers.
import * as THREE from 'three';
import * as CANNON from '../../../vendor/cannon-es.js';
import { GROUP } from '../../../engine/Part.js';
import { mat, rnd, clamp } from '../kit.js';
import * as A from '../audio.js';

/** The power meter: 0 -> 1 -> 0 over 1.5 s while Space is held. */
export const powerAt = (t) => 0.5 - 0.5 * Math.cos((t * Math.PI * 2) / 1.5);

/**
 * The aim phase, for every athlete still on the start (call each frame).
 * o.aim(a, dx, dy): the local player's A/D and W/S (scaled by dt).
 * o.launch(a, power): go.
 * o.botAim(a): set up a bot's aim, power and moment.
 */
export function aimPhase(E, ev, dt, o) {
  let waiting = 0;
  for (const a of ev.ath) {
    if (a.launched) continue;
    waiting++;
    if (a.p.isLocal) {
      const ax = (E.held('d') || E.held('arrowright') ? 1 : 0) - (E.held('a') || E.held('arrowleft') ? 1 : 0);
      const ay = (E.held('w') || E.held('arrowup') ? 1 : 0) - (E.held('s') || E.held('arrowdown') ? 1 : 0);
      if (ax || ay) o.aim(a, ax * dt, ay * dt);
      if (E.held(' ')) {
        if (a.charging == null) a.charging = 0;
        a.charging += dt;
        const p = powerAt(a.charging);
        if (Math.floor(a.charging * 12) !== Math.floor((a.charging - dt) * 12)) A.charge(p);
        a.power = p;
        E.ui.meter(p, o.label || 'POWER');
      } else if (a.charging != null) {
        go(E, ev, a, a.power, o);
        continue;
      } else E.ui.meter(0, o.label || 'POWER');
    } else if (a.bot) {
      if (!a.bot.ready) { a.bot.ready = true; o.botAim(a); }
      if (ev.t >= a.bot.at) { go(E, ev, a, a.bot.power, o); continue; }
    }
    if (ev.aimLeft <= 0) go(E, ev, a, a.power ?? rnd(0.45, 0.7), o);
  }
  return waiting;
}
function go(E, ev, a, power, o) {
  a.launched = true;
  a.launchT = ev.t;
  a.power = power;
  if (a.p.isLocal) {
    E.ui.meter(null);
    if (power > 0.92) { E.ui.toast('⚡ PERFECT POWER!', '#7cf07c', 1.6); A.sparkle(); }
  }
  o.launch(a, clamp(power, 0, 1));
}

/** A loose thing (urn, barrel, cone...): a mesh and a body, put back by reset(). */
export class Prop {
  constructor(world, mesh, shapes, pos, o = {}) {
    this.world = world;
    this.mesh = mesh;
    mesh.castShadow = true; mesh.receiveShadow = true;
    world.scene.add(mesh);
    this.body = new CANNON.Body({ mass: o.mass ?? 3, material: world.defaultPhysMaterial, linearDamping: 0.05, angularDamping: 0.1, allowSleep: true });
    for (const [s, off, q] of shapes) this.body.addShape(s, off, q);
    this.body.collisionFilterGroup = GROUP.DYNAMIC;
    this.body.collisionFilterMask = GROUP.WORLD | GROUP.DYNAMIC | GROUP.DEBRIS | GROUP.CHARACTER;
    this.body.sleepSpeedLimit = 0.6; this.body.sleepTimeLimit = 0.5;
    this.body.prop = this; this.body.tag = o.tag || 'prop';
    this.home = pos.clone(); this.homeQ = (o.quat || new THREE.Quaternion()).clone();
    world.physics.addBody(this.body);
    this.reset();
    this.onHit = o.onHit || null;
    if (this.onHit) this.body.addEventListener('collide', (e) => { if (e.body.rag) this.onHit(this, e); });
  }
  reset() {
    const b = this.body, p = this.home, q = this.homeQ;
    b.position.set(p.x, p.y, p.z); b.quaternion.set(q.x, q.y, q.z, q.w);
    b.previousPosition.copy(b.position); b.interpolatedPosition.copy(b.position);
    b.previousQuaternion.copy(b.quaternion); b.interpolatedQuaternion.copy(b.quaternion);
    b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
    b.sleep();
    // (a sleeping body isn't integrated, so its bounding box would stay where it last lay)
    b.aabbNeedsUpdate = true; b.updateAABB();
    this.sync(true);
  }
  sync(force = false) {
    const b = this.body, p = force ? b.position : b.interpolatedPosition, q = force ? b.quaternion : b.interpolatedQuaternion;
    this.mesh.position.set(p.x, p.y, p.z); this.mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }
  /** How far it has tipped from upright (0..1, 1 = lying down). */
  tilt() { const u = new CANNON.Vec3(0, 1, 0); this.body.quaternion.vmult(u, u); return 1 - clamp(u.y, 0, 1); }
  moved() { const p = this.body.position; return Math.hypot(p.x - this.home.x, p.z - this.home.z); }
}

/** An amphora: a lathe-turned urn with handles. */
export function amphora(world, pos, o = {}) {
  const s = o.scale || 1;
  const prof = [[0.01, 0], [0.9, 0], [1.0, 0.2], [1.55, 1.4], [1.6, 2.1], [1.2, 3.0], [0.6, 3.5], [0.55, 4.0], [0.85, 4.2], [0.8, 4.35], [0.01, 4.35]].map(([x, y]) => new THREE.Vector2(x * s, y * s));
  const g = new THREE.LatheGeometry(prof, 18);
  g.translate(0, -2.0 * s, 0);
  const m = o.mat || (Math.random() < 0.5 ? terracotta() : mat('marble'));
  const mesh = new THREE.Mesh(g, m);
  // handles
  const hg = new THREE.TorusGeometry(0.55 * s, 0.12 * s, 6, 12, Math.PI);
  for (const sx of [-1, 1]) { const h = new THREE.Mesh(hg, m); h.position.set(sx * 0.95 * s, 1.55 * s, 0); h.rotation.set(0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2); mesh.add(h); }
  const shapes = [
    [new CANNON.Box(new CANNON.Vec3(0.8 * s, 0.9 * s, 0.8 * s)), new CANNON.Vec3(0, -1.1 * s, 0)],
    [new CANNON.Sphere(1.45 * s), new CANNON.Vec3(0, -0.15 * s, 0)],
    [new CANNON.Sphere(0.7 * s), new CANNON.Vec3(0, 1.6 * s, 0)],
  ];
  return new Prop(world, mesh, shapes, pos.clone().add(new THREE.Vector3(0, 2.0 * s + 0.02, 0)), { mass: (o.mass ?? 3) * s * s, ...o });
}
let _terra = null;
function terracotta() {
  if (_terra) return _terra;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#b8582e'; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#1c1612'; x.fillRect(0, 40, 256, 34);
  x.fillStyle = '#b8582e';
  for (let i = 0; i < 8; i++) { x.beginPath(); x.ellipse(16 + i * 32, 57, 9, 13, 0, 0, Math.PI * 2); x.fill(); } // figures, roughly
  x.fillStyle = '#1c1612'; x.fillRect(0, 86, 256, 6); x.fillRect(0, 24, 256, 5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  _terra = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 });
  return _terra;
}

/** Score popups and the running score for the local athlete. */
export function award(E, a, pts, label, pos, o = {}) {
  a.score += pts;
  if (a.p.isLocal) {
    E.ui.myScore(a.score, o.unit || '');
    if (label) E.ui.log(`+${Math.round(pts)} ${label}`, o.cls || (pts > 250 ? 'big' : ''));
    if (pos && (pts > 60 || o.pop)) E.ui.pop(`+${Math.round(pts)}`, pos, o.color || (pts > 250 ? '#ffcf4a' : '#ffffff'), pts > 250 ? 26 : 19);
  } else if (pos && pts > 300) E.ui.pop(`+${Math.round(pts)}`, pos, '#c9d6ff', 15);
}

/** Words for a hit, by part and speed. */
export function hitName(h) {
  const v = h.v, part = h.part;
  if (h.other?.prop) return v > 40 ? 'SMASH!' : 'BONK';
  if (h.other?.rag) return 'COLLISION!';
  if (part === 1) return v > 45 ? 'HEADBUTT!' : v > 25 ? 'HEAD SMACK' : 'NOGGIN';
  if (part === 0) return v > 45 ? 'BELLY FLOP!' : v > 25 ? 'BODY SLAM' : 'THUD';
  return v > 45 ? 'LIMB WHIP!' : v > 25 ? 'ELBOW' : 'TAP';
}
