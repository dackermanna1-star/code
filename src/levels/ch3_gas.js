// Chapter 3: shootable fuel targets (gas pumps, fuel tanker). They register
// with the PropManager so the normal bullet path (traceProps sphere test),
// explosion chains (explosionImpulse) and fire (molotov / gas can) can set
// them off. Detonation runs a scripted sequence of combat.explode() and
// combat.startFire() calls plus visual swaps (intact -> wreck groups).
import * as THREE from 'three';
import { buildGroup, pumpVisual, tankerTank, canopyColumn } from './ch3_props.js';
import { sign } from './kit.js';
import { DF } from '../render/decals.js';

const _v = new THREE.Vector3();

// A spherical shootable fuel target. o: {hp, fuse, onBoom(by, t), onArm(t)}
export function fuelTarget(L, x, y, z, r, o = {}) {
  const g = L.game;
  const t = {
    pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), r, mass: 1e6, surf: 'metal', explosive: 'fuel',
    hp: o.hp ?? 40, dead: false, fuse: -1, lastBy: null, sleep: true, fireT: Math.random(),
    impulse() {}, wake() {},
    onShot(px, py, pz, dir, shooter) {
      if (this.dead) return;
      this.lastBy = shooter || this.lastBy;
      this.hp -= o.perHit ?? 10;
      g.fx.sparks(px, py, pz, -dir.x, -dir.y, -dir.z, 6);
      if (this.hp <= 0) this.arm(o.fuse ?? 1.4);
    },
    arm(f) {
      if (this.fuse >= 0 || this.dead) return;
      this.fuse = f;
      this.hiss = g.audio.loop('oxygenHiss', { pos: this.pos, vol: 1 });
      o.onArm?.(this);
    },
    detonate(by) {
      if (this.dead) return;
      this.dead = true;
      this.hiss?.stop(0.1);
      o.onBoom?.(by ?? this.lastBy, this);
    },
    update(dt) {
      if (this.dead) return;
      if (this.fuse >= 0) {
        this.fuse -= dt;
        // burning fuel spraying out of the ruptured pump / valve
        const k = o.sprayR ?? 0.3;
        if (Math.random() < 0.8) g.fx.fire(this.pos.x + (Math.random() - 0.5) * k, this.pos.y - 0.2 + Math.random() * 0.4, this.pos.z + (Math.random() - 0.5) * k, 0.7);
        if (Math.random() < 0.3) g.fx.sparks(this.pos.x, this.pos.y, this.pos.z, 0, 1, 0, 3);
        if (this.fuse <= 0) this.detonate(this.lastBy);
        return;
      }
      // fire nearby (molotov / gas can / burning barrel explosion) cooks it off
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.5;
        for (const f of g.combat.fires) {
          if (Math.hypot(f.x - this.pos.x, f.z - this.pos.z) < f.r + this.r + 0.3 && Math.abs(f.y - this.pos.y) < 3) { this.arm(2.2); break; }
        }
      }
    },
  };
  g.props.add(t);
  return t;
}

// Long-lived burning debris / flames with a light, used after the explosions.
function burner(L, x, y, z, size, life, withLight = true) {
  const g = L.game;
  const light = withLight ? L.light(x, y + 1, z, 0xff7a30, 14 * size, 9 + 5 * size, { flicker: 0.5, priority: 1 }) : { on: false, intensity: 0 };
  const snd = withLight ? g.audio.loop('fireLoop', { pos: new THREE.Vector3(x, y, z), vol: Math.min(1, 0.5 + size * 0.3) }) : null;
  const b = {
    t: 0,
    update(dt) {
      if (this.done) return;
      this.t += dt;
      const k = Math.max(0, 1 - this.t / life);
      if (k <= 0) { this.done = true; light.on = false; snd?.stop(2); return; }
      light.intensity = 14 * size * (0.5 + 0.5 * Math.min(1, k * 2));
      const cp = g.camPos;
      if ((cp.x - x) ** 2 + (cp.z - z) ** 2 > 4900) return;
      const n = Math.ceil(size * 2 * dt * 60 * 0.5 * (0.3 + k));
      for (let i = 0; i < n; i++) g.fx.fire(x + (Math.random() - 0.5) * size, y, z + (Math.random() - 0.5) * size, size * (0.6 + Math.random() * 0.6));
      if (Math.random() < 0.1 * size) g.fx.smokeColumn(x, y + size * 1.2, z, size * 0.7, [0.07, 0.065, 0.06]);
    },
  };
  L.dynamics.push(b);
  return b;
}

// ------------------------------------------------------------------ gas station
// c: {x0,z0,x1,z1 (canopy), h (underside), islands:[x...], pumpZ:[z...]}
export function buildGasStation(L, game, c) {
  const g = game;
  const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
  const state = { gone: false, pumps: [], lights: [] };
  // islands, columns, pumps
  for (const ix of c.islands) {
    L.box(ix - 0.7, 0, c.pumpZ[0] - 2.2, ix + 0.7, 0.2, c.pumpZ[c.pumpZ.length - 1] + 2.2, 'concrete', { tint: 0xb8b4a8 });
    L.box(ix - 0.72, 0.2, c.pumpZ[0] - 2.22, ix + 0.72, 0.23, c.pumpZ[c.pumpZ.length - 1] + 2.22, 'paintedYellow', { collide: false, tint: 0xd8b020 });
    for (const sz of [c.pumpZ[0] - 1.6, c.pumpZ[c.pumpZ.length - 1] + 1.6]) canopyColumn(L, ix, 0.2, sz, c.h - 0.2);
    for (const pz of c.pumpZ) {
      const intact = buildGroup(L, (T) => pumpVisual(T, ix, 0.2, pz, Math.PI / 2));
      const wreck = buildGroup(L, (T) => pumpVisual(T, ix, 0.2, pz, Math.PI / 2, true));
      wreck.visible = false;
      L.addObject(intact); L.addObject(wreck);
      L.box(ix - 0.27, 0.2, pz - 0.42, ix + 0.27, 2.1, pz + 0.42, 'metal', { visible: false });
      const pm = { x: ix, z: pz, intact, wreck };
      pm.target = fuelTarget(L, ix, 1.2, pz, 0.55, { hp: 30, fuse: 1.3, onBoom: (by) => pumpBoom(pm, by) });
      state.pumps.push(pm);
      // bollards
      for (const sz of [-1, 1]) L.box(ix - 0.08, 0.2, pz + sz * 1.05 - 0.08, ix + 0.08, 1.1, pz + sz * 1.05 + 0.08, 'paintedYellow', { tint: 0xd8b020 });
    }
  }
  // canopy: intact and charred versions (swapped when the station blows)
  const canopyGeo = (T, burnt) => {
    const white = burnt ? 'rust' : 'paintedWhite', red = burnt ? 'rust' : 'paintedRed';
    const wt = burnt ? 0x2a2622 : 0xd8d8d4, rt = burnt ? 0x3a2a20 : 0xb81810;
    if (burnt) {
      // roof panels with blown-out holes
      const hx0 = cx - 4, hx1 = cx + 3, hz0 = cz - 3, hz1 = cz + 2;
      T.box(c.x0, c.h, c.z0, c.x1, c.h + 0.5, hz0, white, { tint: wt });
      T.box(c.x0, c.h, hz1, c.x1, c.h + 0.5, c.z1, white, { tint: wt });
      T.box(c.x0, c.h, hz0, hx0, c.h + 0.5, hz1, white, { tint: wt });
      T.box(hx1, c.h, hz0, c.x1, c.h + 0.5, hz1, white, { tint: wt });
      for (let i = 0; i < 6; i++) T.box(hx0 + i * 1.2, c.h - 0.4 - (i % 2) * 0.3, hz0 + 0.3, hx0 + i * 1.2 + 0.08, c.h + 0.1, hz1 - 0.3, 'metalDark', { tint: 0x222222 });
    } else T.box(c.x0, c.h, c.z0, c.x1, c.h + 0.5, c.z1, white, { tint: wt });
    T.box(c.x0 - 0.05, c.h - 0.1, c.z0 - 0.05, c.x1 + 0.05, c.h + 0.6, c.z0 + 0.05, red, { tint: rt });
    T.box(c.x0 - 0.05, c.h - 0.1, c.z1 - 0.05, c.x1 + 0.05, c.h + 0.6, c.z1 + 0.05, red, { tint: rt });
    T.box(c.x0 - 0.05, c.h - 0.1, c.z0 + 0.05, c.x0 + 0.05, c.h + 0.6, c.z1 - 0.05, red, { tint: rt });
    T.box(c.x1 - 0.05, c.h - 0.1, c.z0 + 0.05, c.x1 + 0.05, c.h + 0.6, c.z1 - 0.05, red, { tint: rt });
    T.box(c.x0 - 0.06, c.h + 0.6, c.z0 - 0.06, c.x1 + 0.06, c.h + 0.72, c.z1 + 0.06, white, { tint: burnt ? 0x2a2622 : 0xeeeeea });
    for (let x = c.x0 + 3; x < c.x1 - 1; x += 5) for (const z of [c.z0 + 3.5, c.z1 - 3.5]) T.box(x - 0.5, c.h - 0.03, z - 0.5, x + 0.5, c.h, z + 0.5, burnt ? 'blackMatte' : 'emissiveCool');
    if (!burnt) {
      sign(T, 'BRIDGEWAY', cx, c.h + 0.3, c.z0 - 0.08, 0, 5, 0.6, { fg: '#ffffff', glow: 1.2, light: false });
      sign(T, 'BRIDGEWAY', c.x1 + 0.08, c.h + 0.3, cz, -Math.PI / 2, 5, 0.6, { fg: '#ffffff', glow: 1.2, light: false });
    }
  };
  const canopy = buildGroup(L, (T) => canopyGeo(T, false));
  const canopyBurnt = buildGroup(L, (T) => canopyGeo(T, true));
  canopyBurnt.visible = false;
  L.addObject(canopy); L.addObject(canopyBurnt);
  L.box(c.x0, c.h, c.z0, c.x1, c.h + 0.6, c.z1, 'metal', { visible: false });
  for (const [x, z] of [[c.x0 + 5, cz], [c.x1 - 5, cz]]) state.lights.push(L.light(x, c.h - 0.4, z, 0xdcecff, 20, 16, { flicker: 0.15 }));
  // fuel spill stains
  for (let i = 0; i < 5; i++) L.decal(c.x0 + 3 + Math.random() * (c.x1 - c.x0 - 6), 0.012, c.z0 + 3 + Math.random() * (c.z1 - c.z0 - 6), 0, 1, 0, 1.2 + Math.random() * 1.5, DF.POOL, { alpha: 0.35 });

  function pumpBoom(pm, by) {
    pm.intact.visible = false;
    pm.wreck.visible = true;
    g.combat.explode(pm.x, 1.0, pm.z, 7, 1300, by, { scale: 1.7, survivorDamage: 35 });
    g.audio.play('propaneExplode', { pos: _v.set(pm.x, 1, pm.z), vol: 1 });
    g.combat.startFire(pm.x + (Math.random() - 0.5), 0.2, pm.z + (Math.random() - 0.5), 3.4, 55, by);
    burner(L, pm.x, 0.3, pm.z, 1.3, 80, false);
    if (!state.gone) {
      state.gone = true;
      c.onBoom?.();
      // the rest of the station goes up in a chain
      let i = 0;
      for (const other of state.pumps) if (other !== pm) L.after(0.35 + 0.3 * i++, () => other.target.detonate(by));
      L.after(1.5, () => {
        g.combat.explode(cx, 3.2, cz, 11, 900, by, { scale: 3.2, survivorDamage: 40 });
        g.audio.play('explosion', { pos: _v.set(cx, 3, cz), vol: 1.5 });
        g.shake(0.8);
        for (const l of state.lights) l.on = false;
        for (let k = 0; k < 3; k++) g.combat.startFire(c.x0 + 2 + Math.random() * (c.x1 - c.x0 - 4), 0, c.z0 + 2 + Math.random() * (c.z1 - c.z0 - 4), 3.2, 45, by);
        canopy.visible = false; canopyBurnt.visible = true;
        burner(L, c.x0 + 4, c.h + 0.6, cz - 2, 1.6, 90);
        burner(L, c.x1 - 6, c.h + 0.6, cz + 3, 1.4, 90);
      });
    }
  }
  return state;
}

// ------------------------------------------------------------------ fuel tanker
// Tank along X centred at (x, z); cab at the +X end (already built by caller).
export function buildTanker(L, game, x, z, onBoom) {
  const g = game;
  const intact = buildGroup(L, (T) => {
    tankerTank(T, x, 0, z, Math.PI / 2);
    sign(T, 'FLAMMABLE', x + 1.5, 1.95, z - 1.13, 0, 2.2, 0.45, { bg: '#c81a10', fg: '#ffffff', border: '#ffffff' });
    sign(T, 'FLAMMABLE', x - 1.5, 1.95, z + 1.13, Math.PI, 2.2, 0.45, { bg: '#c81a10', fg: '#ffffff', border: '#ffffff' });
    sign(T, '1203', x - 4.53, 1.9, z, -Math.PI / 2, 0.6, 0.6, { bg: '#e0501a', fg: '#101010', border: '#101010' });
  });
  const wreck = buildGroup(L, (T) => tankerTank(T, x, 0, z, Math.PI / 2, true));
  wreck.visible = false;
  L.addObject(intact); L.addObject(wreck);
  L.box(x - 4.5, 0.8, z - 1.1, x + 4.5, 3.0, z + 1.1, 'metal', { visible: false });
  const st = { gone: false };
  const boom = (by) => {
    if (st.gone) return;
    st.gone = true;
    for (const t of targets) { t.dead = true; t.hiss?.stop(0.1); }
    intact.visible = false; wreck.visible = true;
    g.combat.explode(x, 2.0, z, 13, 2400, by, { scale: 3.6, survivorDamage: 45 });
    g.audio.play('explosion', { pos: _v.set(x, 2, z), vol: 1.6 });
    g.audio.play('propaneExplode', { pos: _v.set(x + 3, 2, z), vol: 1.2 });
    g.shake(1);
    L.after(0.25, () => g.combat.explode(x - 3.5, 2.0, z, 7, 900, by, { scale: 2.2, survivorDamage: 25 }));
    L.after(0.45, () => g.combat.explode(x + 3.5, 2.0, z, 7, 900, by, { scale: 2.2, survivorDamage: 25 }));
    L.after(0.2, () => g.fx.explosion(x, 6, z, 2.8));
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2;
      g.combat.startFire(x + Math.cos(a) * 4.5, 0, z + Math.sin(a) * 3.2, 3.4, 50, by);
    }
    burner(L, x - 2, 2.6, z, 2.0, 100);
    burner(L, x + 2.5, 1.2, z + 0.5, 1.4, 100);
    onBoom?.();
  };
  const targets = [];
  for (const dx of [-3.4, -1.15, 1.15, 3.4]) targets.push(fuelTarget(L, x + dx, 1.9, z, 1.2, { hp: 50, fuse: 1.8, sprayR: 1.0, onBoom: boom }));
  return st;
}
