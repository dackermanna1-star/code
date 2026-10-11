// Sniper bullet cam: when the local player kills someone with a headshot from a sniper
// rifle, the camera rides behind the bullet from the muzzle to the head, the world
// frozen around it; at the impact time comes back in slow motion (the blood, the wound
// and the ragdoll were held back until then) while the camera swings around the body,
// then it cuts back to the player. Letterboxed, HUD hidden. Any fire / jump / use key
// skips it. Toggle: cl_bulletcam (Options > Multiplayer).
//
//   game.bulletCam = new BulletCam(game)
//   bulletCam.trigger(attacker, victim)    from killPlayer (checks the conditions itself)
//   bulletCam.update(realDt)               every frame; .worldScale scales the world's dt
//   bulletCam.applyCamera()                instead of the normal camera while .active
import * as THREE from 'three';
import { TraceResult, MASK_SHOT } from '../engine/collision.js';

const SNIPERS = new Set(['awp', 'scout', 'g3sg1', 'sg550']);
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);
const IMPACT_TIME = 2.4; // real seconds of slow motion after the hit

export class BulletCam {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.worldScale = 1;
    this.tr = new TraceResult();
    this.bullet = null;
    this.bars = null;
  }

  enabled() {
    const v = this.game.settings?.get?.('cl_bulletcam');
    return v === undefined || v === null || Number(v) !== 0;
  }

  // ---------------------------------------------------------------- start / stop
  trigger(attacker, victim, weaponId, headshot) {
    const g = this.game;
    if (this.active || !this.enabled() || !headshot || !attacker || attacker !== g.local || attacker === victim) return false;
    if (!SNIPERS.has(weaponId) || !g.renderer?.camera) return false;
    const hit = victim.lastHit;
    if (!hit || !hit.point || !hit.dir || hit.time !== g.time) return false;
    const eye = g.camPos ? g.camPos.slice() : attacker.eyePos();
    const dir = hit.dir.slice();
    // the muzzle: a little ahead, right and below the eye
    const yaw = attacker.pm.angles[1] * DEG;
    const right = [Math.sin(yaw), -Math.cos(yaw), 0];
    const src = [eye[0] + dir[0] * 18 + right[0] * 3, eye[1] + dir[1] * 18 + right[1] * 3, eye[2] + dir[2] * 18 - 3];
    const end = hit.point.slice();
    const D = Math.hypot(end[0] - src[0], end[1] - src[1], end[2] - src[2]);
    if (D < 120) return false; // point blank: nothing to fly through
    const ax = [end[0] - src[0], end[1] - src[1], end[2] - src[2]].map((x) => x / D);
    this.active = {
      phase: 'flight', t: 0, src, end, dir: ax, D, victim, attacker,
      flight: clamp(1.0 + D / 1600, 1.2, 2.6),
      side: Math.random() < 0.5 ? -1 : 1,
      zoom: g.renderer.zoomFov || 0,
      look: end.slice(),
    };
    // hold back what the hit already did until the bullet gets there
    const bfx = g.effects.bloodFx;
    if (bfx) bfx.group.visible = false;
    this.setWound(victim, false);
    g.renderer.setZoom(70); // a slightly longer lens for the ride
    this.worldScale = 0;
    this.showBullet(true);
    this.letterbox(true);
    return true;
  }

  impact() {
    const c = this.active, g = this.game;
    if (!c || c.phase !== 'flight') return;
    c.phase = 'impact';
    c.t = 0;
    const bfx = g.effects.bloodFx;
    if (bfx) bfx.group.visible = true;
    this.setWound(c.victim, true);
    this.showBullet(false);
    g.renderer.setZoom(80);
    g.sound?.play?.('headshot', { pos: c.end, volume: 1 });
  }

  stop() {
    const c = this.active, g = this.game;
    if (!c) return;
    if (c.phase === 'flight') this.impact();
    this.active = null;
    this.worldScale = 1;
    this.showBullet(false);
    this.letterbox(false);
    const p = g.viewTarget;
    if (p && p.alive && p.fov < 90) g.renderer.setZoom(p.fov);
    else g.renderer.setZoom(0);
  }

  /** Skip key pressed. */
  skip() {
    if (this.active) this.stop();
  }

  setWound(victim, on) {
    const u = victim?.model?.material?.uniforms;
    if (u?.uWound && victim.model.woundLayer) u.uWound.value = on ? 1 : 0;
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const c = this.active;
    if (!c) return;
    c.t += dt;
    if (c.phase === 'flight') {
      this.worldScale = 0;
      if (c.t >= c.flight) this.impact();
    }
    if (c.phase === 'impact') {
      // deep slow motion, easing back towards real time
      const u = c.t / IMPACT_TIME;
      this.worldScale = u < 0.45 ? 0.1 : 0.1 + 0.4 * smooth(clamp((u - 0.45) / 0.55, 0, 1));
      if (c.t >= IMPACT_TIME) this.stop();
    }
  }

  /** Bullet position: fast out of the barrel, slowing right down for the last stretch. */
  bulletAt(c, u) {
    const rem = c.D * Math.pow(1 - u, 2.6);
    const s = c.D - rem;
    return [c.src[0] + c.dir[0] * s, c.src[1] + c.dir[1] * s, c.src[2] + c.dir[2] * s];
  }

  applyCamera() {
    const c = this.active, g = this.game;
    if (!c) return false;
    const d = c.dir;
    // a frame around the shot: side (horizontal, perpendicular) and up
    let sx = -d[1], sy = d[0];
    const sl = Math.hypot(sx, sy) || 1;
    sx /= sl; sy /= sl;
    let eye, look, roll;
    if (c.phase === 'flight') {
      const u = clamp(c.t / c.flight, 0, 1);
      const b = this.bulletAt(c, u);
      // behind and a little beside the bullet, swinging slowly around it
      const ang = (c.side * (20 + 60 * u)) * DEG;
      const back = 20 - 9 * u;
      const off = 4.5 + 2 * u;
      const ox = sx * Math.cos(ang) * off, oy = sy * Math.cos(ang) * off, oz = Math.sin(ang) * off * 0.8 + 2;
      eye = [b[0] - d[0] * back + ox, b[1] - d[1] * back + oy, b[2] - d[2] * back + oz];
      look = [b[0] + d[0] * 26, b[1] + d[1] * 26, b[2] + d[2] * 26];
      roll = c.side * (4 + 10 * u);
      this.placeBullet(b, d, c.t);
    } else {
      // swing around the head as the body goes down
      const u = clamp(c.t / IMPACT_TIME, 0, 1);
      const head = this.headPos(c.victim) || c.end;
      for (let k = 0; k < 3; k++) c.look[k] += (head[k] - c.look[k]) * Math.min(1, 0.12 + u * 0.2);
      const ang = (c.side * (25 + 75 * smooth(u))) * DEG;
      const dist = 26 + 62 * smooth(u);
      // start behind the shot line, orbit around the vertical through the head
      const bx = -d[0], by = -d[1];
      const bl = Math.hypot(bx, by) || 1;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const rx = (bx * ca - by * sa) / bl, ry = (bx * sa + by * ca) / bl;
      eye = [c.look[0] + rx * dist, c.look[1] + ry * dist, c.look[2] + 6 + 16 * smooth(u)];
      look = c.look;
      roll = c.side * 6 * (1 - u);
    }
    eye = this.clip(look, eye);
    const dx = look[0] - eye[0], dy = look[1] - eye[1], dz = look[2] - eye[2];
    const yaw = Math.atan2(dy, dx) / DEG;
    const pitch = -Math.atan2(dz, Math.hypot(dx, dy)) / DEG;
    g.renderer.setView(eye, pitch, yaw, roll);
    g.camPos = eye;
    return true;
  }

  headPos(victim) {
    const rd = victim?.model?.ragdoll;
    if (rd && !rd.removed && typeof rd.particle === 'function') return rd.particle(0);
    return null;
  }

  /** Keep the camera out of walls: pull it in along the line from the subject. */
  clip(from, to) {
    const tr = this.game.collision.trace(from, to, [-3, -3, -3], [3, 3, 3], MASK_SHOT, this.tr);
    if (tr.fraction >= 1 || tr.startsolid) return to;
    const f = Math.max(0, tr.fraction - 0.04);
    return [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, from[2] + (to[2] - from[2]) * f];
  }

  // ---------------------------------------------------------------- visuals
  buildBullet() {
    const g = new THREE.Group();
    g.name = 'bulletcam_bullet';
    const copper = new THREE.MeshBasicMaterial({ color: 0xb87a3e });
    const dark = new THREE.MeshBasicMaterial({ color: 0x6a4020 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.5, 14), copper);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.14, 14), dark);
    band.position.y = -0.2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.25, 14), copper);
    tip.position.y = 0.75 + 0.62;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.25, 14), dark);
    base.position.y = -0.87;
    // the air it pushes: a faint streak behind and a ring of shock just ahead of the tip
    const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.0, 26, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    trail.position.y = -13.9;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 6, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.2;
    const spin = new THREE.Group();
    spin.add(body, band, tip, base);
    g.add(spin, trail, ring);
    g.userData = { spin, ring };
    g.scale.setScalar(1.3);
    g.visible = false;
    return g;
  }

  showBullet(on) {
    const r = this.game.renderer;
    if (!r?.world) return;
    if (on && !this.bullet) this.bullet = this.buildBullet();
    if (!this.bullet) return;
    if (on && this.bullet.parent !== r.world) r.world.add(this.bullet);
    this.bullet.visible = on;
  }

  placeBullet(b, d, t) {
    const m = this.bullet;
    if (!m) return;
    m.position.set(b[0], b[1], b[2]);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(d[0], d[1], d[2]));
    m.userData.spin.rotation.y = t * 40;
    const s = 1 + 0.15 * Math.sin(t * 30);
    m.userData.ring.scale.set(s, s, s);
    m.updateMatrixWorld(true);
  }

  letterbox(on) {
    const host = this.game.renderer?.container;
    if (!host || typeof document === 'undefined') return;
    if (!this.bars) {
      const mk = (top) => {
        const e = document.createElement('div');
        e.style.cssText = `position:absolute;left:0;right:0;${top ? 'top' : 'bottom'}:0;height:0;background:#000;pointer-events:none;z-index:5;transition:height 0.35s ease`;
        host.appendChild(e);
        return e;
      };
      this.bars = [mk(true), mk(false)];
    }
    for (const b of this.bars) b.style.height = on ? '11%' : '0';
  }
}
