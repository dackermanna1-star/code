// Dead Air 2 (The Crane) building blocks: a skyline ring, per-letter neon
// signage (flicker / dead letters / sparks), a roll-up (storage unit) door that
// also works as a safe-room door (chapter 3 starts behind it), and hotel /
// kitchen / office / construction props for this chapter.
import * as THREE from 'three';
import { Door } from '../world/dynamic.js';
import { F_SOLID, F_SHOOT, F_DEFAULT } from '../world/collision.js';
import { materials } from '../render/materials.js';
import { P, sign, ceilingLight } from './kit.js';
import { boxMesh } from './ch4_parts.js';
import { VisualBatch } from './da_parts.js';
import { makeRng } from '../core/math.js';

export const rng = makeRng(2402);
const NC = { collide: false };
export { VisualBatch };

// =====================================================================
// SKYLINE
// =====================================================================
// Visual-only city block with lit / burning windows, a parapet and roof junk.
export function cityBlock(B, x0, z0, x1, z1, h, o = {}) {
  const r = o.rng || rng;
  const mat = o.mat ?? r.pick(['concreteDark', 'brickDark', 'concrete', 'brick', 'brickTan']);
  const tint = o.tint ?? r.pick([0x6a6660, 0x5a5854, 0x7a7068, 0x4a4a50, 0x6a5a50, 0x585c62]);
  B.box(x0, o.y0 ?? -0.3, z0, x1, h, z1, mat, { tint, ao: 0.5 });
  const lit = o.lit ?? 0.06, fire = o.fire ?? 0;
  const fh = o.floorH ?? 3.4;
  const faces = o.faces ?? ['n', 's', 'e', 'w'];
  const win = (fx, fy, fz, axis, s) => {
    const q = r();
    if (q > lit + fire) return;
    const burning = q < fire;
    const m = burning ? 'emissiveWarm' : 'emissiveWindow';
    const t = burning ? r.pick([0xff5a18, 0xff7a28]) : r() < 0.72 ? r.pick([0xffc080, 0xffb060, 0xffd8a0]) : r.pick([0x9ab0ff, 0xa8c8ff]);
    if (axis === 'x') B.box(fx - 0.6, fy, fz + s * 0.02, fx + 0.6, fy + 1.5, fz + s * 0.06, m, { tint: t });
    else B.box(fx + s * 0.02, fy, fz - 0.6, fx + s * 0.06, fy + 1.5, fz + 0.6, m, { tint: t });
  };
  for (let y = (o.y0 ?? 0) + 4; y < h - 2; y += fh) {
    if (faces.includes('n')) for (let x = x0 + 1.6; x < x1 - 1; x += 3) win(x, y, z0, 'x', -1);
    if (faces.includes('s')) for (let x = x0 + 1.6; x < x1 - 1; x += 3) win(x, y, z1, 'x', 1);
    if (faces.includes('w')) for (let z = z0 + 1.6; z < z1 - 1; z += 3) win(x0, y, z, 'z', -1);
    if (faces.includes('e')) for (let z = z0 + 1.6; z < z1 - 1; z += 3) win(x1, y, z, 'z', 1);
  }
  B.box(x0, h, z0, x1, h + 0.9, z0 + 0.35, mat, { tint });
  B.box(x0, h, z1 - 0.35, x1, h + 0.9, z1, mat, { tint });
  if (r() < 0.55) { const cx = x0 + (x1 - x0) * (0.25 + r() * 0.5), cz = z0 + (z1 - z0) * (0.25 + r() * 0.5); B.box(cx - 2, h, cz - 1.5, cx + 2, h + 2.4, cz + 1.5, 'metalDark'); }
  if (h > 45) B.box((x0 + x1) / 2 - 0.25, h + 0.9, (z0 + z1) / 2 - 0.25, (x0 + x1) / 2 + 0.25, h + 1.4, (z0 + z1) / 2 + 0.25, 'emissiveRed');
  if (o.roofFire) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (let i = 0; i < 5; i++) B.box(cx - 3 + r() * 6, h, cz - 3 + r() * 6, cx - 2 + r() * 6, h + 0.6 + r() * 2.2, cz - 2 + r() * 6, 'emissiveWarm', { tint: r.pick([0xff6a20, 0xff4a10, 0xffa040]) });
  }
}

// Ring of skyline blocks around a keep-out rectangle [x0,z0,x1,z1]. Blocks in
// the `lowAz` bearing (radians, atan2(dx,dz) from `center`) stay low so the
// airport landmark is visible over them.
export function skyline(L, o) {
  const r = makeRng(o.seed ?? 77);
  const near = new VisualBatch(L), far = new VisualBatch(L);
  const [kx0, kz0, kx1, kz1] = o.keep;
  const [cx, cz] = o.center;
  const step = o.step ?? 38;
  for (let x = o.minX ?? -260; x < (o.maxX ?? 380); x += step) {
    for (let z = o.minZ ?? -260; z < (o.maxZ ?? 420); z += step) {
      const bx0 = x + 5, bz0 = z + 5, bx1 = x + step - 5 + r() * 2, bz1 = z + step - 5 + r() * 2;
      if (bx1 > kx0 && bx0 < kx1 && bz1 > kz0 && bz0 < kz1) continue;
      const mx = (bx0 + bx1) / 2, mz = (bz0 + bz1) / 2;
      const d = Math.hypot(mx - cx, mz - cz);
      if (d > (o.maxD ?? 330)) continue;
      let az = Math.atan2(mx - cx, mz - cz) - (o.lowAz ?? 99);
      az = Math.atan2(Math.sin(az), Math.cos(az));
      const low = Math.abs(az) < 0.28 && d > 90;
      const tall = r() < 0.2;
      let h = d < 120 ? 14 + r() * (tall ? 60 : 32) : 22 + r() * (tall ? 100 : 46);
      if (low) h = Math.min(h, 10 + r() * 8);
      const faces = [];
      if (mz > kz1) faces.push('n'); if (mz < kz0) faces.push('s'); if (mx > kx1) faces.push('w'); if (mx < kx0) faces.push('e');
      cityBlock(d < 130 ? near : far, bx0, bz0, bx1, bz1, h, { rng: r, faces, lit: d < 150 ? 0.075 : 0.05, fire: r() < 0.14 ? 0.05 : 0, roofFire: r() < 0.08 });
    }
  }
  return { near: near.build(L), far: far.build(L) };
}

// =====================================================================
// NEON LETTERS — one quad per letter (flicker / dead letters) + glow light
// =====================================================================
function neonTexture(ch, color, dead) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 160;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 128px "Arial Black", Impact, sans-serif';
  g.lineJoin = 'round';
  if (dead) {
    g.strokeStyle = '#4a3a3a'; g.lineWidth = 6; g.strokeText(ch, 64, 86);
  } else {
    g.shadowColor = color; g.shadowBlur = 22;
    g.strokeStyle = color; g.lineWidth = 9; g.strokeText(ch, 64, 86);
    g.shadowBlur = 8; g.strokeStyle = color; g.lineWidth = 6; g.strokeText(ch, 64, 86);
    g.shadowBlur = 0; g.strokeStyle = '#fff4ee'; g.lineWidth = 2.2; g.strokeText(ch, 64, 86);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// text laid out along the direction ry (0 => along +X, reading from +Z side).
export function neonLetters(L, game, text, x, y, z, ry, o = {}) {
  const lw = o.letterW ?? 1.05, lh = o.letterH ?? 1.6;
  const color = o.color ?? '#ff3a5a';
  const dead = new Set(o.dead || []);
  const flick = new Set(o.flicker || []);
  const letters = [];
  const dx = Math.cos(ry), dz = -Math.sin(ry);
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (ch === ' ') continue;
    const isDead = dead.has(i);
    const tex = neonTexture(ch, color, isDead);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: isDead ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh * 1.25), mat);
    const off = (i - (n - 1) / 2) * lw;
    m.position.set(x + dx * off, y, z + dz * off);
    m.rotation.y = ry;
    m.renderOrder = 2;
    L.addObject(m);
    letters.push({ m, mat, dead: isDead, flick: flick.has(i), k: 1, t: rng() * 10 });
  }
  const glowLights = (o.lights ?? [[x, y, z]]).map(([lx, ly, lz]) => L.light(lx, ly, lz, o.lightColor ?? 0xff3050, o.lightIntensity ?? 9, o.lightRange ?? 11, {}));
  const api = {
    letters, on: true, sparkT: 2,
    update(dt) {
      let lit = 0;
      for (const l of letters) {
        if (l.dead) continue;
        l.t += dt;
        let k = this.on ? 1 : 0;
        if (this.on && l.flick) {
          const s = Math.sin(l.t * 23) + Math.sin(l.t * 7.3) + Math.sin(l.t * 1.7);
          k = s > 1.2 ? 0.08 : s > 0.9 ? 0.5 : 1;
        }
        l.mat.opacity = k;
        lit += k;
      }
      const f = letters.length ? lit / letters.length : 0;
      for (const gl of glowLights) gl.intensity = (o.lightIntensity ?? 9) * f;
      if (o.sparks && this.on) {
        this.sparkT -= dt;
        if (this.sparkT <= 0) {
          this.sparkT = 2 + Math.random() * 5;
          const l = letters.find((q) => q.flick) || letters[0];
          if (l && game.camPos.distanceTo(l.m.position) < 45) {
            game.fx.sparks(l.m.position.x, l.m.position.y - lh * 0.3, l.m.position.z, 0, -1, 0, 10);
            game.audio.play('impactMetal', { pos: l.m.position, vol: 0.25 });
          }
        }
      }
    },
  };
  L.dynamics.push(api);
  return api;
}

// =====================================================================
// ROLL-UP DOOR — a Door (nav/infected/bot/safe-room compatible) whose
// slatted curtain rolls up into a drum instead of swinging.
// Works as an end or start safe-room door (L.endDoor = new RollupDoor(...)).
// =====================================================================
export class RollupDoor extends Door {
  constructor(L, x, y, z, axis, o = {}) {
    super(L, x, y, z, axis, { width: o.width ?? 2.6, height: o.height ?? 2.5, safe: o.safe, locked: o.locked, open: o.open, material: 'metal' });
    this.mesh.visible = false;
    this.roll = true;
    const w = this.w, h = this.h;
    const tint = o.tint ?? 0xd06a1a;
    // curtain in local space (built at origin, centred on the doorway)
    const list = [];
    const t = 0.05;
    if (axis === 'x') {
      list.push([-w / 2, 0, -t, w / 2, h, t, 'paintedRed', tint, 0.9]);
      for (let yy = 0.12; yy < h; yy += 0.16) list.push([-w / 2, yy, -t - 0.012, w / 2, yy + 0.03, t + 0.012, 'paintedRed', 0x7a3a10, 1]);
      list.push([-w / 2, 0, -t - 0.02, w / 2, 0.08, t + 0.02, 'metalDark', 0x333333, 1]);
      list.push([-0.12, 0.25, -t - 0.05, 0.12, 0.33, t + 0.05, 'chrome', 0x888888, 1]);
    } else {
      list.push([-t, 0, -w / 2, t, h, w / 2, 'paintedRed', tint, 0.9]);
      for (let yy = 0.12; yy < h; yy += 0.16) list.push([-t - 0.012, yy, -w / 2, t + 0.012, yy + 0.03, w / 2, 'paintedRed', 0x7a3a10, 1]);
      list.push([-t - 0.02, 0, -w / 2, t + 0.02, 0.08, w / 2, 'metalDark', 0x333333, 1]);
      list.push([-t - 0.05, 0.25, -0.12, t + 0.05, 0.33, 0.12, 'chrome', 0x888888, 1]);
    }
    this.curtain = boxMesh(list);
    this.curtain.position.set(x, y, z);
    L.addObject(this.curtain);
    if (o.label) {
      const lb = sign(L, o.label, x, y + 1.55, z, axis === 'x' ? 0 : Math.PI / 2, Math.min(1.8, w * 0.7), 0.5, o.labelStyle || { bg: '#8a1a14', fg: '#fff' });
      L.root.remove(lb); this.curtain.add(lb); lb.position.set(0, 1.55, 0);
      if (axis === 'x') lb.position.z = 0; else lb.position.x = 0;
    }
    // steel guide channels + drum housing (hide the base Door's wooden frame)
    const fx = axis === 'x';
    for (const s of [-1, 1]) {
      if (fx) L.box(x + s * (w / 2 + 0.06) - 0.07, y, z - 0.16, x + s * (w / 2 + 0.06) + 0.07, y + h + 0.12, z + 0.16, 'metalDark', NC);
      else L.box(x - 0.16, y, z + s * (w / 2 + 0.06) - 0.07, x + 0.16, y + h + 0.12, z + s * (w / 2 + 0.06) + 0.07, 'metalDark', NC);
    }
    if (fx) L.box(x - w / 2 - 0.14, y + h + 0.02, z - 0.3, x + w / 2 + 0.14, y + h + 0.5, z + 0.3, 'metal', { collide: false, tint: 0x8a8e8a });
    else L.box(x - 0.3, y + h + 0.02, z - w / 2 - 0.14, x + 0.3, y + h + 0.5, z + w / 2 + 0.14, 'metal', { collide: false, tint: 0x8a8e8a });
    this.usable.pos.y = y + 1.0;
    this.applyRoll();
  }
  get k() { return Math.min(1, this.angle / (Math.PI / 2 * 0.95)); }
  blocksInfected() { return !this.broken && this.k < 0.5; }
  use(s) {
    if (!this.canUse(s)) { if (this.locked) this.game.audio.play('doorBang', { pos: this.usable.pos, vol: 0.4 }); return; }
    this.useCd = 0.8;
    this.open = !this.open;
    this.targetAngle = this.open ? Math.PI / 2 * 0.95 : 0;
    this.dirSign = 1;
    this.game.audio.play('metalGate', { pos: this.usable.pos, vol: 0.7 });
    if (this.open) this.onOpen?.(s, this); else this.onClose?.(s, this);
  }
  damage(amount) {
    if (this.broken || this.open) return;
    this.game.audio.play('metalImpact', { pos: this.usable.pos, vol: 0.6 });
    this.shakeT = 0.15;
    if (this.safe) return;
    this.hp -= amount;
    if (this.hp <= 0) { this.broken = true; this.collider.enabled = false; this.usable.enabled = false; this.game.audio.play('metalGate', { pos: this.usable.pos, vol: 1 }); this.curtain.visible = false; }
  }
  updateCollider() {
    const d = this.collider;
    if (!d) return;
    if (this.broken) { d.enabled = false; return; }
    const k = this.angle / (Math.PI / 2 * 0.95);
    const y0 = this.cy + Math.min(1, k) * this.h;
    if (this.axis === 'x') { d.min[0] = this.cx - this.w / 2; d.max[0] = this.cx + this.w / 2; d.min[2] = this.cz - 0.08; d.max[2] = this.cz + 0.08; }
    else { d.min[0] = this.cx - 0.08; d.max[0] = this.cx + 0.08; d.min[2] = this.cz - this.w / 2; d.max[2] = this.cz + this.w / 2; }
    d.min[1] = y0; d.max[1] = this.cy + this.h;
    d.enabled = k < 0.78;
  }
  applyRoll() {
    if (!this.curtain) return;
    const k = this.k;
    const shake = this.shakeT > 0 ? Math.sin(this.shakeT * 90) * 0.02 : 0;
    this.curtain.position.y = this.cy + k * this.h * 0.96;
    this.curtain.scale.y = Math.max(0.04, 1 - k * 0.96);
    if (this.axis === 'x') this.curtain.position.z = this.cz + shake; else this.curtain.position.x = this.cx + shake;
  }
  update(dt) {
    this.useCd = Math.max(0, this.useCd - dt);
    if (this.shakeT > 0) this.shakeT -= dt;
    const prev = this.angle;
    const sp = 1.6 * dt;
    this.angle = this.angle < this.targetAngle ? Math.min(this.targetAngle, this.angle + sp) : Math.max(this.targetAngle, this.angle - sp);
    if (Math.abs(prev - this.angle) > 1e-5) this.updateCollider();
    this.applyRoll();
  }
}

// =====================================================================
// CHAPTER PROPS (hotel / kitchen / office / storage)
// =====================================================================
export function hotelBed(L, x, y, z, ry, o = {}) {
  const p = P.prop(L, x, y, z, ry);
  const w = o.w ?? 1.5;
  p.box(0, 0.2, 0, w, 0.36, 2.0, 'woodDark', 0x5a3a26);
  p.box(0, 0.47, 0.02, w - 0.06, 0.2, 1.92, 'fabric', o.sheet ?? 0xe8e4dc);
  p.box(0, 0.6, 0.35, w - 0.02, 0.07, 1.25, 'fabric', o.cover ?? 0x7a2a2a, [0.02 * (rng() - 0.5), 0.05 * (rng() - 0.5), 0]);
  for (const sx of [-w / 4, w / 4]) p.box(sx, 0.62, -0.78, w / 2 - 0.12, 0.14, 0.4, 'fabric', 0xf0ece4);
  p.box(0, 0.75, -1.02, w + 0.1, 1.1, 0.08, 'woodDark', 0x4a2e1e);
  p.col(0, 0.35, 0, w, 0.7, 2.0, 'fabric');
  if (o.blood) L.decal(x, y + 0.72, z, 0, 1, 0, 0.9, 1);
  return p;
}
export function nightstand(L, x, y, z, ry, lampOn = false) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.3, 0, 0.5, 0.6, 0.42, 'woodDark', 0x5a3a26).box(0, 0.36, -0.215, 0.4, 0.12, 0.01, 'woodDark', 0x3a2418);
  p.cyl(0, 0.72, 0, 0.07, 0.24, 'plastic', 0xc8b89a).cyl(0, 0.92, 0, 0.16, 0.2, 'fabric', 0xe8dcc0);
  p.col(0, 0.3, 0, 0.5, 0.6, 0.42, 'wood', F_SOLID | F_SHOOT);
  if (lampOn) { const lp = new THREE.Vector3(0, 0.95, 0).applyMatrix4(p.base); return L.light(lp.x, lp.y, lp.z, 0xffc880, 3.5, 4.5, { flicker: 0.2 }); }
  return null;
}
export function luggage(L, x, y, z, ry, color = 0x2a2a3a) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.36, 0, 0.45, 0.7, 0.25, 'fabric', color).box(0, 0.8, 0, 0.3, 0.06, 0.04, 'metalDark');
  for (const sx of [-0.18, 0.18]) p.cyl(sx, 0.03, 0.08, 0.03, 0.03, 'rubber', null, [0, 0, Math.PI / 2]);
  p.col(0, 0.36, 0, 0.45, 0.72, 0.25, 'fabric', F_SOLID | F_SHOOT);
  return p;
}
export function housekeepingCart(L, x, y, z, ry) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.55, 0, 1.4, 0.04, 0.55, 'plastic', 0x3a3a3a).box(0, 0.12, 0, 1.4, 0.04, 0.55, 'plastic', 0x3a3a3a).box(0, 1.0, 0, 1.4, 0.04, 0.55, 'plastic', 0x3a3a3a);
  for (const sx of [-0.68, 0.68]) for (const sz of [-0.25, 0.25]) p.box(sx, 0.55, sz, 0.03, 1.1, 0.03, 'metalDark');
  for (let i = 0; i < 4; i++) p.box(-0.45 + i * 0.3, 0.68, 0, 0.26, 0.22, 0.45, 'fabric', 0xf0f0e8);
  for (let i = 0; i < 5; i++) p.box(-0.5 + i * 0.25, 0.26, 0.05, 0.2, 0.26, 0.35, 'plastic', [0xe8e8e0, 0x6a9ac8, 0xd8c070, 0xe8e8e0, 0x9ac87a][i]);
  p.box(0.95, 0.7, 0, 0.5, 1.2, 0.5, 'fabric', 0x4a5a6a).box(-0.95, 0.5, 0, 0.45, 0.7, 0.5, 'plastic', 0x2a2a2a);
  for (const sx of [-0.6, 0.6]) for (const sz of [-0.22, 0.22]) p.cyl(sx, 0.05, sz, 0.05, 0.04, 'rubber', null, [0, 0, Math.PI / 2]);
  p.col(0, 0.6, 0, 2.3, 1.2, 0.56, 'plastic', F_SOLID | F_SHOOT);
  return p;
}
export function iceMachine(L, x, y, z, ry) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.5, 0, 0.8, 1.0, 0.7, 'metalClean', 0xb8bcbc).box(0, 1.35, 0, 0.78, 0.7, 0.68, 'metalClean', 0xa8acac);
  p.box(0, 0.62, -0.36, 0.5, 0.4, 0.02, 'metalDark').box(0, 1.55, -0.35, 0.4, 0.12, 0.01, 'emissiveCool', 0x446688);
  p.col(0, 0.85, 0, 0.8, 1.7, 0.7, 'metal');
  sign(L, 'ICE', ...rotXZ(x, z, ry, 0, -0.36), y + 1.95, ry, 0.5, 0.2, { bg: '#1a3a6a', fg: '#e8f0ff' });
  return p;
}
export function rotXZ(x, z, ry, lx, lz) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [x + c * lx + s * lz, z - s * lx + c * lz];
}
export function roomServiceCart(L, x, y, z, ry) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.76, 0, 0.9, 0.03, 0.6, 'fabric', 0xf0ece0).box(0, 0.5, 0, 0.92, 0.5, 0.62, 'fabric', 0xe8e4d8);
  p.cyl(-0.2, 0.82, 0, 0.14, 0.1, 'chrome', null, null, 10).sph(-0.2, 0.87, 0, 0.13, 'chrome', null, [1, 0.6, 1]);
  p.cyl(0.25, 0.8, 0.1, 0.1, 0.02, 'plastic', 0xf8f8f8, null, 10).cyl(0.25, 0.88, -0.15, 0.03, 0.2, 'glass', 0x3a5a3a, null, 6);
  p.col(0, 0.4, 0, 0.92, 0.8, 0.62, 'fabric', F_SOLID | F_SHOOT);
  return p;
}
// Commercial kitchen: gas range block with oven doors + burners
export function range(L, x, y, z, ry, w = 1.8) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.45, 0, w, 0.9, 0.85, 'metalClean', 0xb0b4b0);
  for (let i = 0; i < Math.round(w / 0.9); i++) {
    const ox = -w / 2 + 0.45 + i * 0.9;
    p.box(ox, 0.45, -0.43, 0.78, 0.55, 0.02, 'metalClean', 0x8a8e8e).box(ox, 0.78, -0.45, 0.6, 0.04, 0.04, 'chrome');
    for (const bx of [-0.2, 0.2]) for (const bz of [-0.2, 0.2]) p.cyl(ox + bx, 0.92, bz, 0.12, 0.03, 'blackMatte', null, null, 8);
  }
  p.box(0, 1.05, 0.4, w, 0.3, 0.06, 'metalClean', 0xa0a4a0);
  p.col(0, 0.46, 0, w, 0.92, 0.85, 'metal');
  return p;
}
export function potRack(L, x, y, z, len = 2.4) {
  const p = P.prop(L, x, y, z, 0);
  p.box(0, 0, 0, len, 0.04, 0.5, 'metalClean').box(-len / 2, 0.35, 0, 0.03, 0.7, 0.03, 'metalClean').box(len / 2, 0.35, 0, 0.03, 0.7, 0.03, 'metalClean');
  for (let i = 0; i < 6; i++) {
    const px = -len / 2 + 0.25 + i * (len - 0.5) / 5;
    p.cyl(px, -0.18, (i % 2 ? 0.12 : -0.12), 0.01, 0.3, 'metalDark', null, null, 4);
    if (i % 2) p.cyl(px, -0.42, 0.12, 0.16, 0.18, 'chrome', 0x9a9a9a, null, 10);
    else p.cyl(px, -0.45, -0.12, 0.13, 0.06, 'metalDark', 0x3a3a3a, [Math.PI / 2, 0, 0], 10);
  }
  return p;
}
export function canShelf(L, x, y, z, ry, w = 1.8, fill = 0.8) {
  const p = P.prop(L, x, y, z, ry);
  for (const sx of [-w / 2, w / 2]) for (const sz of [-0.22, 0.22]) p.box(sx, 1.0, sz, 0.04, 2.0, 0.04, 'metalClean');
  for (let i = 0; i < 5; i++) {
    const sy = 0.15 + i * 0.45;
    p.box(0, sy, 0, w, 0.03, 0.46, 'metalClean', 0xa8acac);
    for (let k = 0; k < Math.floor(w / 0.2); k++) {
      if (rng() > fill) continue;
      const kind = rng();
      const cx = -w / 2 + 0.12 + k * 0.2;
      if (kind < 0.5) p.cyl(cx, sy + 0.1, (rng() - 0.5) * 0.2, 0.06, 0.17, 'metalClean', rng.pick([0xc8a040, 0xb83a2a, 0x3a6a3a, 0xd8d8c8]), null, 8);
      else if (kind < 0.8) p.box(cx, sy + 0.14, 0, 0.18, 0.26, 0.3, 'paper', rng.pick([0x9a7a50, 0xc8b890, 0x8a6a3a]));
      else p.box(cx, sy + 0.2, 0, 0.18, 0.38, 0.36, 'fabric', 0xd8d0b8);
    }
  }
  p.col(0, 1.0, 0, w, 2.0, 0.5, 'metal', F_SOLID | F_SHOOT);
  return p;
}
export function dishMachine(L, x, y, z, ry) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.45, 0, 0.8, 0.9, 0.75, 'metalClean', 0xb8bcbc).box(0, 1.35, 0, 0.8, 0.9, 0.75, 'metalClean', 0xc8cccc);
  p.box(0, 1.9, 0, 0.3, 0.2, 0.3, 'metalDark').box(0.2, 1.2, -0.39, 0.12, 0.08, 0.02, 'emissiveRed');
  p.col(0, 0.9, 0, 0.8, 1.8, 0.75, 'metal');
  return p;
}
// Walk-through steel door leaf (static, decorative)
export function kitchenSink(L, x, y, z, ry, w = 1.6) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.88, 0, w, 0.06, 0.7, 'metalClean', 0xc0c4c0);
  for (let i = 0; i < 2; i++) p.box(-w / 4 + i * w / 2, 0.75, 0, w / 2 - 0.12, 0.25, 0.5, 'metalClean', 0x8a8e8e);
  for (const sx of [-w / 2 + 0.05, w / 2 - 0.05]) for (const sz of [-0.3, 0.3]) p.box(sx, 0.43, sz, 0.05, 0.86, 0.05, 'metalClean');
  p.cyl(0, 1.2, 0.3, 0.02, 0.6, 'chrome', null, null, 6).box(0, 1.5, 0.15, 0.04, 0.04, 0.3, 'chrome');
  p.col(0, 0.46, 0, w, 0.92, 0.7, 'metal');
  return p;
}
// Office: photocopier, server rack, whiteboard, water cooler, conference table
export function copier(L, x, y, z, ry) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.45, 0, 1.1, 0.9, 0.7, 'plastic', 0xd8d6d0).box(0, 1.05, 0.05, 1.0, 0.3, 0.6, 'plastic', 0xc8c6c0);
  p.box(0.3, 1.22, -0.2, 0.35, 0.04, 0.2, 'emissiveGreen', 0x335533).box(-0.6, 0.95, 0, 0.1, 0.02, 0.4, 'paper', 0xf0f0e8);
  for (let i = 0; i < 3; i++) p.box(0, 0.25 + i * 0.22, -0.355, 0.9, 0.02, 0.01, 'plastic', 0x8a8a88);
  p.col(0, 0.6, 0, 1.1, 1.2, 0.7, 'plastic');
  return p;
}
export function serverRack(L, x, y, z, ry, game) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 1.0, 0, 0.65, 2.0, 1.0, 'blackMatte', 0x1a1c1e).box(0, 1.0, -0.505, 0.6, 1.9, 0.01, 'metalDark', 0x2a2c2e);
  for (let i = 0; i < 14; i++) {
    p.box(0, 0.18 + i * 0.13, -0.515, 0.54, 0.09, 0.01, 'metalDark', 0x3a3c40);
    if (rng() < 0.6) p.box(-0.2 + rng() * 0.35, 0.18 + i * 0.13, -0.522, 0.02, 0.02, 0.005, rng() < 0.7 ? 'emissiveGreen' : 'emissiveRed');
  }
  p.col(0, 1.0, 0, 0.65, 2.0, 1.0, 'metal');
  return p;
}
export function whiteboard(L, x, y, z, ry, text, o = {}) {
  const [sx, sz] = rotXZ(x, z, ry, 0, 0);
  L.box(...(Math.abs(Math.sin(ry)) > 0.5 ? [sx - 0.03, y + 0.9, sz - 1.2, sx + 0.03, y + 2.1, sz + 1.2] : [sx - 1.2, y + 0.9, sz - 0.03, sx + 1.2, y + 2.1, sz + 0.03]), 'paintedWhite', { collide: false, tint: 0xe8e8e4 });
  const nx = Math.sin(ry), nz = Math.cos(ry);
  sign(L, text, sx + nx * 0.04, y + 1.5, sz + nz * 0.04, ry, 2.3, 1.1, { fg: o.fg ?? '#1a2a8a', font: '"Comic Sans MS", "Segoe Print", cursive', weight: 'normal', w: 512, h: 256 });
}
export function waterCooler(L, x, y, z) {
  const p = P.prop(L, x, y, z, 0);
  p.box(0, 0.5, 0, 0.35, 1.0, 0.35, 'plastic', 0xe8e8e0).cyl(0, 1.25, 0, 0.14, 0.45, 'glass', 0x8ab0d8, null, 10);
  p.col(0, 0.7, 0, 0.36, 1.4, 0.36, 'plastic', F_SOLID | F_SHOOT);
  return p;
}
export function confTable(L, x, y, z, ry, len = 4.4, chairs = true) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0.74, 0, len, 0.06, 1.3, 'woodDark', 0x4a3020).box(-len / 3, 0.36, 0, 0.3, 0.72, 0.6, 'metalDark').box(len / 3, 0.36, 0, 0.3, 0.72, 0.6, 'metalDark');
  p.col(0, 0.38, 0, len, 0.76, 1.3, 'wood', F_SOLID | F_SHOOT);
  if (chairs) for (let i = 0; i < Math.floor(len / 1.1); i++) for (const s of [-1, 1]) {
    if (rng() < 0.25) continue;
    const [cx, cz] = rotXZ(x, z, ry, -len / 2 + 0.6 + i * 1.1, s * 1.0);
    P.officeChair(L, cx, y, cz, ry + (s > 0 ? 0 : Math.PI) + (rng() - 0.5) * 0.6);
  }
  return p;
}
export function cardboard(L, x, y, z, ry, n = 3, tint = 0x9a7a50) {
  const p = P.prop(L, x, y, z, ry);
  let h = 0;
  for (let i = 0; i < n; i++) {
    const s = 0.45 + rng() * 0.2;
    p.box((rng() - 0.5) * 0.12, h + s * 0.35, (rng() - 0.5) * 0.12, s, s * 0.7, s * 0.85, 'paper', tint, [0, (rng() - 0.5) * 0.4, 0]);
    h += s * 0.7;
  }
  p.col(0, h / 2, 0, 0.6, h, 0.55, 'wood', F_SOLID | F_SHOOT);
  return p;
}
// Rooftop kitchen exhaust fan (mushroom cap) + duct
export function exhaustFan(L, x, y, z, r = 0.7) {
  const p = P.prop(L, x, y, z, 0);
  p.box(0, 0.25, 0, r * 2 + 0.3, 0.5, r * 2 + 0.3, 'metal', 0x9a9e9e).cyl(0, 0.75, 0, r * 0.7, 0.5, 'metalClean', 0xa8acac, null, 12);
  p.cyl(0, 1.05, 0, r * 1.25, 0.1, 'metalClean', 0xb0b4b4, null, 16).cyl(0, 1.2, 0, r * 0.9, 0.22, 'metalClean', 0xa0a4a4, null, 16);
  p.col(0, 0.6, 0, r * 2 + 0.3, 1.2, r * 2 + 0.3, 'metal');
  return p;
}
// Portable toilet
export function portaJon(L, x, y, z, ry, tint = 0x2a5a9a) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 1.15, 0, 1.15, 2.3, 1.15, 'plastic', tint).box(0, 2.35, 0, 1.2, 0.12, 1.2, 'plastic', 0xd8d8d0);
  p.box(0, 1.1, -0.585, 0.8, 1.9, 0.02, 'plastic', tint).box(0.3, 1.1, -0.6, 0.12, 0.06, 0.03, 'plasticGloss', 0xc02020);
  p.col(0, 1.15, 0, 1.15, 2.3, 1.15, 'plastic');
  return p;
}
// Construction formwork panel stack / rebar mesh stack
export function formStack(L, x, y, z, ry, n = 8) {
  const p = P.prop(L, x, y, z, ry);
  for (let i = 0; i < n; i++) p.box((rng() - 0.5) * 0.08, 0.06 + i * 0.07, (rng() - 0.5) * 0.08, 2.4, 0.05, 1.2, 'wood', i % 3 ? 0xb8a068 : 0xd8b050);
  p.col(0, n * 0.035 + 0.05, 0, 2.45, n * 0.07 + 0.1, 1.25, 'wood');
  return p;
}
export function concreteHopper(L, x, y, z) {
  const p = P.prop(L, x, y, z, 0.3);
  p.geo(new THREE.CylinderGeometry(0.75, 0.25, 1.3, 12), 'metalDark', 0, 1.25, 0, [0, 0, 0], [1, 1, 1], 0x5a5a58);
  for (const sx of [-0.55, 0.55]) p.box(sx, 0.6, 0, 0.08, 1.2, 0.08, 'metalDark');
  p.box(0, 2.0, 0, 1.6, 0.08, 0.08, 'paintedYellow', 0xc8a020);
  p.col(0, 1.0, 0, 1.4, 2.0, 1.4, 'metal');
  return p;
}
