// GoldSrc-style temp entities: decals, sprites, brass, explosions, smoke puffs, blood
// (the batched blood particles / splats / puddles live in blood.js).
// Everything lives under the renderer's `world` group in GoldSrc coordinates.

import * as THREE from 'three';
import { TraceResult, MASK_SHOT } from '../engine/collision.js';
import { BloodFX } from './blood.js';
import { WoundSystem } from './wounds.js';
import { QuadStore, Soak } from './statics.js';

const MAX_SPRITES = 220;
const WHITE = [1, 1, 1];
const SCORCH_DIRS = [[0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1]];
const MAX_SHELLS = 40;
const GRAVITY = 800;

export class Effects {
  constructor(game) {
    this.game = game;
    this.world = game.renderer.world;
    this.texLib = game.texLib;
    this.group = new THREE.Group();
    this.group.name = 'effects';
    this.world.add(this.group);
    this.marks = new Map(); // decal texture -> QuadStore: bullet holes, scorch / burn marks (permanent)
    this.sprites = [];
    this.spriteTex = new Map();
    this.shells = [];
    this.tr = new TraceResult();
    this.time = 0;
    this.smokes = [];
    // batched blood (particles, splats, droplet stains, puddles); see blood.js
    try {
      this.bloodFx = new BloodFX(this);
    } catch (e) {
      console.error('blood effects unavailable', e);
      this.bloodFx = null;
    }
    // entry / exit wounds painted onto the player models; see wounds.js
    this.wounds = typeof document !== 'undefined' ? new WoundSystem(game) : null;
  }

  tex(name) {
    let t = this.spriteTex.get(name);
    if (t) return t;
    const c = this.texLib.canvas(name);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    this.spriteTex.set(name, t);
    return t;
  }

  // ------------------------------------------------------------- decals
  /**
   * A decal on the world: bullet hole, scorch mark... Permanent: all of one texture are
   * quads in static meshes per map area (statics.js); a spot that already has two of the
   * same size takes no more. tint: [r, g, b, a] (multiplies the texture).
   */
  decal(name, pos, normal, size, tint = null, rot = Math.random() * Math.PI * 2, fit = false) {
    let q = this.marks.get(name);
    if (!q) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.tex(name), transparent: true, depthWrite: false, vertexColors: true,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      q = new QuadStore(this.group, mat, { colName: 'color', soak: new Soak(0.6, 2, 2), order: -4, name: name });
      this.marks.set(name, q);
    }
    const l = Math.hypot(normal[0], normal[1], normal[2]) || 1;
    const n = [normal[0] / l, normal[1] / l, normal[2] / l];
    const a = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let t1 = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
    const tl = Math.hypot(t1[0], t1[1], t1[2]) || 1;
    t1 = [t1[0] / tl, t1[1] / tl, t1[2] / tl];
    const t2 = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]];
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const U = [t1[0] * cs + t2[0] * sn, t1[1] * cs + t2[1] * sn, t1[2] * cs + t2[2] * sn];
    const V = [n[1] * U[2] - n[2] * U[1], n[2] * U[0] - n[0] * U[2], n[0] * U[1] - n[1] * U[0]];
    // big marks shrink until they don't hang over an edge
    if (fit && this.bloodFx) for (let k = 0; k < 4 && !this.bloodFx.fits(pos, n, U, V, size * 0.36); k++) size *= 0.72;
    const c = [pos[0] + n[0] * 0.15, pos[1] + n[1] * 0.15, pos[2] + n[2] * 0.15];
    return q.add(c, U, V, size / 2, size / 2, [0, 0, 1, 1], tint || WHITE, tint ? tint[3] ?? 1 : 1, n, size);
  }

  /** A scorch mark on the surface nearest to an explosion (none if it went off in the open). */
  scorch(pos, size) {
    let best = null;
    for (const d of SCORCH_DIRS) {
      const end = [pos[0] + d[0] * 80, pos[1] + d[1] * 80, pos[2] + d[2] * 80];
      this.game.collision.trace(pos, end, [0, 0, 0], [0, 0, 0], MASK_SHOT, this.tr);
      if (this.tr.startsolid || this.tr.fraction >= 1) continue;
      if (!best || this.tr.fraction < best.f) best = { f: this.tr.fraction, p: this.tr.endpos.slice(), n: this.tr.normal.slice() };
    }
    if (best) this.decal('decal_scorch', best.p, best.n, size * (1 - best.f * 0.4), null, undefined, true);
  }

  clearDecals() {
    for (const q of this.marks.values()) q.clear();
  }

  // ------------------------------------------------------------- sprites
  // opts: { tex, pos, vel, size, grow, life, color, additive, alpha, gravity, frames:[cols,rows,count], fps, drag }
  sprite(opts) {
    let s;
    if (this.sprites.length >= MAX_SPRITES) {
      s = this.sprites.shift();
      s.obj.material.dispose();
      this.group.remove(s.obj);
    }
    const map = this.tex(opts.tex);
    const mat = new THREE.SpriteMaterial({
      map: opts.frames ? map.clone() : map,
      transparent: true, depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      color: new THREE.Color(...(opts.color || [1, 1, 1])),
      opacity: opts.alpha ?? 1,
      rotation: opts.rotation ?? Math.random() * Math.PI * 2,
    });
    if (opts.frames) {
      mat.map.repeat.set(1 / opts.frames[0], 1 / opts.frames[1]);
      mat.map.needsUpdate = true;
    }
    const obj = new THREE.Sprite(mat);
    obj.position.set(opts.pos[0], opts.pos[1], opts.pos[2]);
    obj.scale.set(opts.size, opts.size, 1);
    this.group.add(obj);
    s = {
      obj, age: 0, life: opts.life ?? 0.5,
      vel: opts.vel ? opts.vel.slice() : [0, 0, 0],
      size: opts.size, grow: opts.grow ?? 0, alpha: opts.alpha ?? 1,
      gravity: opts.gravity ?? 0, drag: opts.drag ?? 0, frames: opts.frames, fps: opts.fps || 15,
      fade: opts.fade ?? true, fadeIn: opts.fadeIn ?? 0,
    };
    this.sprites.push(s);
    return s;
  }

  // ------------------------------------------------------------- impacts
  impact(pos, normal, surface, dir) {
    const n = normal;
    const r = () => (Math.random() - 0.5);
    const g = this.game;
    if (surface === 'sand' || surface === 'dirt') {
      for (let i = 0; i < 2; i++) {
        this.sprite({ tex: 'spr_dust', pos: [pos[0] + n[0] * 2, pos[1] + n[1] * 2, pos[2] + n[2] * 2], vel: [n[0] * 40 + r() * 30, n[1] * 40 + r() * 30, n[2] * 40 + 20 + r() * 20], size: 10 + Math.random() * 6, grow: 22, life: 0.7, color: [0.85, 0.72, 0.55], alpha: 0.75, drag: 2 });
      }
    } else {
      // concrete / stone: dust puff + sparks
      this.sprite({ tex: 'spr_smoke', pos: [pos[0] + n[0] * 2, pos[1] + n[1] * 2, pos[2] + n[2] * 2], vel: [n[0] * 30, n[1] * 30, n[2] * 30 + 15], size: 8, grow: 20, life: 0.6, color: [0.8, 0.74, 0.62], alpha: 0.55, drag: 2 });
      if (surface !== 'wood' && Math.random() < 0.7) {
        for (let i = 0; i < 3; i++) {
          this.sprite({ tex: 'spr_spark', pos: pos.slice(), vel: [n[0] * 150 + r() * 160, n[1] * 150 + r() * 160, n[2] * 150 + r() * 160 + 60], size: 2.5, life: 0.25 + Math.random() * 0.15, additive: true, gravity: 0.6, color: [1, 0.85, 0.5] });
        }
      }
    }
    this.decal('decal_bullet', pos, normal, surface === 'wood' ? 5 : 4.5);
    // ricochet / impact sound
    const sname = surface === 'wood' ? 'impact_wood' : surface === 'metal' ? 'impact_metal' : (surface === 'sand' || surface === 'dirt') ? 'impact_sand' : 'ric';
    if (Math.random() < (sname === 'ric' ? 0.5 : 0.8)) g.sound?.play(sname, { pos, volume: 0.7 });
  }

  // ------------------------------------------------------------- blood
  /** violence_hblood (default on) */
  bloodEnabled() {
    const v = this.game.settings?.get?.('violence_hblood');
    return v === undefined || v === null || Number(v) !== 0;
  }

  /**
   * A bleeding wound: droplet burst + mist (more, and a fine jet, for headshots),
   * exit splatter on the surface 96..128 units behind the victim, drips below.
   * opts: { head, victim, blast }
   */
  blood(pos, dir, damage, opts = {}) {
    if (!this.bloodEnabled()) return;
    if (this.bloodFx) { this.bloodFx.hit(pos, dir, damage, opts); return; }
    const r = () => (Math.random() - 0.5);
    const n = Math.min(4, 1 + Math.floor(damage / 25));
    for (let i = 0; i < n; i++) {
      this.sprite({ tex: 'spr_smoke', pos: pos.slice(), vel: [dir[0] * 40 + r() * 50, dir[1] * 40 + r() * 50, dir[2] * 40 + r() * 50 + 20], size: 5 + Math.random() * 4, grow: 10, life: 0.4, color: [0.55, 0.02, 0.02], alpha: 0.9, gravity: 0.3, drag: 2 });
    }
    const end = [pos[0] + dir[0] * 128, pos[1] + dir[1] * 128, pos[2] + dir[2] * 128 - 30];
    this.game.collision.trace(pos, end, [0, 0, 0], [0, 0, 0], MASK_SHOT, this.tr);
    if (this.tr.fraction < 1) this.decal('decal_blood' + (1 + Math.floor(Math.random() * 3)), this.tr.endpos, this.tr.normal, 18 + Math.random() * 18);
  }

  /**
   * Blood pool under a corpse, spawned after ~0.5 s and spreading over 4-6 s.
   * src: a Player (follows its ragdoll / death pose), a getter () => [x,y,z] polled
   * for ~2 s while the body settles, or a fixed [x,y,z]. opts: { delay, follow, grow,
   * radius, normal, head } (an array is taken as the surface normal).
   */
  bloodPuddle(src, opts) {
    return this.bloodFx?.puddle(src, opts) ?? null;
  }

  /** Unit vector from a to b (for wounds without a bullet direction, e.g. knife). */
  dirFrom(a, b) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    return [d[0] / l, d[1] / l, d[2] / l];
  }

  /** Remove all blood (round restart, violence_hblood 0). */
  clearBlood() {
    this.bloodFx?.clear();
    this.wounds?.clearAll();
  }

  /** A bullet / knife wound on a player model (entry hole, exit wound when it went through). */
  wound(victim, point, dir, opts = {}) {
    if (!this.bloodEnabled() || !this.wounds) return;
    try { this.wounds.add(victim, point, dir, opts); } catch (e) { console.error('wound failed', e); this.wounds = null; }
  }

  muzzleFlash(pos, size = 14) {
    const k = 1 + Math.floor(Math.random() * 3);
    this.sprite({ tex: 'spr_muzzle' + k, pos, size, life: 0.05, additive: true, fade: false });
  }

  explosion(pos, scale = 1) {
    this.sprite({ tex: 'spr_explosion', pos: [pos[0], pos[1], pos[2] + 40 * scale], size: 220 * scale, life: 0.9, additive: true, frames: [4, 4, 16], fps: 18, fade: false });
    for (let i = 0; i < 6; i++) {
      const r = () => (Math.random() - 0.5);
      this.sprite({ tex: 'spr_smoke', pos: [pos[0] + r() * 60, pos[1] + r() * 60, pos[2] + 30 + Math.random() * 40], vel: [r() * 40, r() * 40, 30 + Math.random() * 30], size: 80 * scale, grow: 60, life: 2.5, color: [0.35, 0.33, 0.3], alpha: 0.7, fadeIn: 0.3 });
    }
    this.scorch([pos[0], pos[1], pos[2] + 2], 120 * scale);
  }

  // smoke grenade: long-lived cloud
  smokeCloud(pos) {
    const cloud = { pos: pos.slice(), age: 0, life: 25, emitted: 0 };
    this.smokes.push(cloud);
  }

  // ------------------------------------------------------------- brass
  shell(origin, vel, type = 'rifle') {
    let s;
    if (this.shells.length >= MAX_SHELLS) {
      s = this.shells.shift();
      this.group.remove(s.mesh);
    }
    const geo = type === 'shotgun' ? (this._sgGeo || (this._sgGeo = new THREE.CylinderGeometry(0.9, 0.9, 3.2, 6))) : (this._shGeo || (this._shGeo = new THREE.CylinderGeometry(0.45, 0.45, type === 'pistol' ? 1.2 : 2.2, 5)));
    const mat = type === 'shotgun' ? (this._sgMat || (this._sgMat = new THREE.MeshBasicMaterial({ color: 0x8a2020 }))) : (this._shMat || (this._shMat = new THREE.MeshBasicMaterial({ color: 0xb8913a })));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(origin[0], origin[1], origin[2]);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    this.group.add(mesh);
    s = { mesh, pos: origin.slice(), vel: vel.slice(), spin: [Math.random() * 20, Math.random() * 20], age: 0, bounces: 0, rest: false, type };
    this.shells.push(s);
  }

  // ------------------------------------------------------------- update
  update(dt, camPos) {
    this.time += dt;
    this.bloodFx?.update(dt);
    this.wounds?.update(dt);
    // sprites
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i];
      s.age += dt;
      if (s.age >= s.life) {
        this.group.remove(s.obj);
        s.obj.material.dispose();
        this.sprites.splice(i, 1);
        continue;
      }
      const t = s.age / s.life;
      if (s.drag) { const k = Math.max(0, 1 - s.drag * dt); s.vel[0] *= k; s.vel[1] *= k; s.vel[2] *= k; }
      s.vel[2] -= GRAVITY * s.gravity * dt;
      s.obj.position.x += s.vel[0] * dt;
      s.obj.position.y += s.vel[1] * dt;
      s.obj.position.z += s.vel[2] * dt;
      const size = s.size + s.grow * s.age;
      s.obj.scale.set(size, size, 1);
      let a = s.alpha;
      if (s.fade) a *= 1 - t;
      if (s.fadeIn) a *= Math.min(1, s.age / s.fadeIn);
      s.obj.material.opacity = a;
      if (s.frames) {
        const [cols, rows, count] = s.frames;
        const f = Math.min(count - 1, Math.floor(s.age * s.fps));
        const cx = f % cols, cy = Math.floor(f / cols);
        s.obj.material.map.offset.set(cx / cols, 1 - (cy + 1) / rows);
      }
    }
    // shells
    for (const s of this.shells) {
      s.age += dt;
      if (s.rest) continue;
      s.vel[2] -= GRAVITY * dt;
      const np = [s.pos[0] + s.vel[0] * dt, s.pos[1] + s.vel[1] * dt, s.pos[2] + s.vel[2] * dt];
      this.game.collision.trace(s.pos, np, [0, 0, 0], [0, 0, 0], MASK_SHOT, this.tr);
      if (this.tr.fraction < 1) {
        s.pos = this.tr.endpos.slice();
        const n = this.tr.normal;
        const d = s.vel[0] * n[0] + s.vel[1] * n[1] + s.vel[2] * n[2];
        s.vel = [(s.vel[0] - 1.6 * d * n[0]) * 0.5, (s.vel[1] - 1.6 * d * n[1]) * 0.5, (s.vel[2] - 1.6 * d * n[2]) * 0.4];
        s.bounces++;
        if (s.bounces === 1) this.game.sound?.play(s.type === 'shotgun' ? 'shotgun_shell' : 'shell', { pos: s.pos, volume: 0.35 });
        if (s.bounces > 2 || Math.hypot(...s.vel) < 30) { s.rest = true; s.mesh.rotation.set(Math.PI / 2, 0, Math.random() * 6); }
      } else s.pos = np;
      s.mesh.position.set(s.pos[0], s.pos[1], s.pos[2] + (s.rest ? 0.5 : 0));
      if (!s.rest) { s.mesh.rotation.x += s.spin[0] * dt; s.mesh.rotation.y += s.spin[1] * dt; }
    }
    // zombie survival: brass that has come to rest stays (baked into static meshes)
    const gore = this.game.zombies?.enabled && this.game.gore?.enabled ? this.game.gore : null;
    if (gore) {
      for (let i = this.shells.length - 1; i >= 0; i--) {
        const s = this.shells[i];
        if (!s.rest) continue;
        gore.bakeShell(s.mesh);
        this.group.remove(s.mesh);
        this.shells.splice(i, 1);
      }
    }
    for (const q of this.marks.values()) q.update();
    // smoke clouds (emit big grey puffs over time)
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const c = this.smokes[i];
      c.age += dt;
      if (c.age > c.life) { this.smokes.splice(i, 1); continue; }
      const want = Math.min(40, Math.floor(c.age * 12));
      while (c.emitted < want && c.age < c.life - 15) {
        c.emitted++;
        const r = () => (Math.random() - 0.5);
        const rad = 40 + Math.random() * 110;
        const ang = Math.random() * Math.PI * 2;
        this.sprite({ tex: 'spr_smoke', pos: [c.pos[0] + Math.cos(ang) * rad, c.pos[1] + Math.sin(ang) * rad, c.pos[2] + 20 + Math.random() * 90], vel: [r() * 6, r() * 6, 2], size: 120 + Math.random() * 60, grow: 4, life: 18 + Math.random() * 4, color: [0.62, 0.62, 0.6], alpha: 0.85, fadeIn: 1.0 });
      }
    }
  }

  clearAll() {
    this.clearDecals();
    this.clearBlood();
    for (const s of this.sprites) { this.group.remove(s.obj); s.obj.material.dispose(); }
    this.sprites.length = 0;
    for (const s of this.shells) this.group.remove(s.mesh);
    this.shells.length = 0;
    this.smokes.length = 0;
  }
}
