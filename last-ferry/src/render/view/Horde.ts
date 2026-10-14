// The living horde: one zombie rig per logic zombie, posed every frame from
// the logic (interpolated position, state, gait distance, burning, plates…),
// the paramedics' stretchers, fire on burning bodies, crawl trails, hit
// flinches, nails sticking in them and the spawn pop-in of crawlers.
import * as THREE from 'three';
import { PLATE_HELMET, type ZombieKind } from '../../config/ids';
import { TICK } from '../../config/world';
import type { GameEvents } from '../../core/events';
import type { Zombie } from '../../core/Zombie';
import { createNail, createStretcher, createZombieRig, risenMaterial, STRETCHER_MODEL, type ZombieRigExt } from '../models/index';
import type { MatClass } from '../models/kit';
import type { AnimInput, BoneSpec, CreatureRig } from '../models/types';
import { Ragdoll } from '../Ragdoll';
import { REFLECT_LAYER } from '../Stage';
import { clamp, rand, type Ctx } from './ctx';
import { skinify, unskin, type SkinState } from './skin';

/** Merge live zombies into skinned meshes (fewer draw calls). */
let SKIN = true;
import { ember, flame, smoke } from './fx';

export interface ZRec {
  z: Zombie;
  rig: ZombieRigExt;
  /** Previous tick snapshot (interpolation). */
  px: number;
  py: number;
  pz: number;
  pd: number;
  /** Interpolated this frame. */
  x: number;
  y: number;
  zz: number;
  yaw: number;
  speed: number;
  charred: number;
  /** Spawn pop-in 0..1 (1 = done). */
  pop: number;
  /** Hit flinch 0..1 and its direction (+1 pushed toward -x). */
  flinch: number;
  flinchHead: boolean;
  trailT: number;
  /** Blend (s) for the next animate call (rise after a corpse). */
  blend: number;
  apronDropped: boolean;
  nails: number;
  /** Last plates mask applied. */
  plates: number;
  /** Groan: mouth open for a moment (s left). */
  groan: number;
  /** Skinned stand-ins for the per-bone meshes while alive (draw calls). */
  skin: SkinState | null;
  /** Animation params (reused every frame). */
  params: Record<string, number | boolean>;
}

interface StretcherRec {
  id: number;
  obj: THREE.Group;
  dropped: boolean;
  /** Fall animation time since the drop. */
  t: number;
  x: number;
  z: number;
  /** Which end hits first (+1 front end). */
  tilt: number;
  baked: boolean;
}

/** Bones that burn (flames spawn at their world positions). */
const FIRE_BONES = ['chest', 'head', 'pelvis', 'upperArmL', 'upperArmR', 'foreArmL', 'foreArmR', 'thighL', 'thighR'];
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _anim: AnimInput = { state: 'walk', stateTime: 0, time: 0, distance: 0, speed: 0, dt: 0, params: {} };
const NAIL_Q = new THREE.Quaternion();
const UNDEAD_GLOW = new THREE.Color(0.22, 0.62, 0.06);
const UNDEAD_EYE = new THREE.Color(0.75, 1.0, 0.3);
const NIGHT_EYE = new THREE.Color(0.95, 0.85, 0.5);

/** Detach a piece (prop, plate, apron) at its world transform as a one-body ragdoll. */
export function dropPiece(ctx: Ctx, obj: THREE.Object3D, spec: BoneSpec, vel: THREE.Vector3, spin = 6, clone = false): { rag: Ragdoll; holder: THREE.Group } {
  obj.updateMatrixWorld(true);
  const holder = new THREE.Group();
  obj.matrixWorld.decompose(holder.position, holder.quaternion, holder.scale);
  ctx.root.add(holder);
  const piece = clone ? obj.clone(true) : obj;
  if (!clone) piece.removeFromParent();
  piece.visible = true;
  piece.position.set(0, 0, 0);
  piece.quaternion.identity();
  piece.scale.set(1, 1, 1);
  holder.add(piece);
  const fake: CreatureRig = { root: holder, bones: new Map([['piece', holder]]), spec: { piece: spec }, head: 'piece', animate: () => {} };
  // The holder carries the world scale; the fake rig's root is the holder itself.
  const rag = new Ragdoll(ctx.physics, fake, { velocity: vel, groundOnly: true });
  const b = rag.parts[0]?.body;
  if (b) b.angularVelocity.set(rand(-spin, spin), rand(-spin, spin), rand(-spin, spin));
  return { rag, holder };
}

export class Horde {
  readonly recs = new Map<number, ZRec>();
  private stretchers = new Map<number, StretcherRec>();
  /** Loose pieces (dropped plates, aprons, props) settling before they are baked. */
  readonly pieces: Array<{ rag: Ragdoll; holder: THREE.Group }> = [];

  constructor(private ctx: Ctx) {}

  // ------------------------------------------------------------------ lifecycle

  /** A new zombie appeared (or a risen corpse whose rig was handed over). */
  spawn(z: Zombie, rig?: ZombieRigExt, blend = 0): ZRec {
    const existing = this.recs.get(z.id);
    if (existing) return existing;
    const r = rig ?? createZombieRig(z.kind, z.look);
    if (!rig) {
      r.root.position.set(z.x, z.y, z.z);
      if (z.medal) r.setMedal?.(true);
    }
    if (!r.root.parent) this.ctx.root.add(r.root);
    const rec: ZRec = {
      z,
      rig: r,
      px: z.x,
      py: z.y,
      pz: z.z,
      pd: z.distance,
      x: z.x,
      y: z.y,
      zz: z.z,
      yaw: z.facing < 0 ? Math.PI : 0,
      speed: 0,
      charred: 0,
      pop: 1,
      flinch: 0,
      flinchHead: false,
      trailT: 0,
      blend,
      apronDropped: false,
      nails: 0,
      plates: -1,
      groan: 0,
      skin: SKIN ? skinify(r) : null,
      params: { facing: 1, burning: false, enraged: false, charred: 0, front: true, blend: false },
    };
    // Crawlers spilling out of a bloater appear in view: pop them in.
    if (!rig && z.risen && this.onScreen(z.x, z.z)) rec.pop = 0;
    // The risen are tinted (greyed green, faintly self-lit) while they crawl.
    if (z.risen && rec.skin) for (const m of rec.skin.meshes) m.material = risenMaterial(m.userData.matClass as MatClass);
    this.recs.set(z.id, rec);
    if (z.stretcher && z.kind === 'medic') this.ensureStretcher(z.stretcher.id, z.x, z.z);
    return rec;
  }

  /** Remove a zombie's record (it died: the rig is handed to the bodies). */
  take(id: number): ZRec | undefined {
    const r = this.recs.get(id);
    if (r) {
      this.recs.delete(id);
      if (r.skin) {
        unskin(r.skin);
        r.skin = null;
      }
    }
    return r;
  }

  get(id: number): ZRec | undefined {
    return this.recs.get(id);
  }

  private onScreen(x: number, z: number): boolean {
    return x > -26 + Math.max(0, z) * 0.6 && x < 26;
  }

  beforeStep(): void {
    for (const r of this.recs.values()) {
      r.px = r.z.x;
      r.py = r.z.y;
      r.pz = r.z.z;
      r.pd = r.z.distance;
    }
  }

  clear(): void {
    for (const r of this.recs.values()) {
      r.rig.root.removeFromParent();
      if (r.skin) unskin(r.skin);
    }
    this.recs.clear();
    for (const s of this.stretchers.values()) s.obj.removeFromParent();
    this.stretchers.clear();
    for (const p of this.pieces) {
      p.rag.dispose();
      p.holder.removeFromParent();
    }
    this.pieces.length = 0;
  }

  // ------------------------------------------------------------------ events

  onHit(e: GameEvents['hit']): void {
    const r = this.recs.get(e.zombieId);
    if (!r || e.part === 'stretcher') return;
    const k = clamp(e.damage / 40, 0.25, 1);
    r.flinch = Math.min(1, r.flinch + (e.part === 'plate' ? 0.35 : k));
    r.flinchHead = e.part === 'head';
  }

  /** A nail stuck in a live zombie: attach a nail model to the nearest bone. */
  onNail(zombieId: number, point: { x: number; y: number; z: number }): void {
    const r = this.recs.get(zombieId);
    if (!r) return;
    if (r.nails >= 14) return;
    r.nails++;
    attachNail(r.rig, point);
  }

  /** Debug: skinned stand-ins on/off for every live zombie. */
  setSkinned(on: boolean): void {
    SKIN = on;
    for (const r of this.recs.values()) {
      if (!on && r.skin) {
        unskin(r.skin);
        r.skin = null;
      } else if (on && !r.skin) r.skin = skinify(r.rig);
    }
  }

  onGroan(zombieId: number): void {
    const r = this.recs.get(zombieId);
    if (r) r.groan = 0.9;
  }

  onPlateOff(e: GameEvents['plateOff']): void {
    const r = this.recs.get(e.zombieId);
    if (!r || !r.rig.plates || !r.rig.plateSpec) return;
    const obj = r.rig.plates[e.plate];
    const spec = r.rig.plateSpec[e.plate];
    if (!obj || !spec) return;
    r.rig.root.updateMatrixWorld(true);
    // Fly off along the shot, spinning; the rig hides its own copy (setPlates).
    const v = new THREE.Vector3(e.dirX * rand(3, 5), rand(2.5, 4.5), e.dirZ * 2 + rand(-1, 1));
    if (e.plate === PLATE_HELMET) v.y += 2;
    const piece = dropPiece(this.ctx, obj, spec, v, 9, true);
    this.pieces.push(piece);
    r.plates = -1;
  }

  onStretcherDrop(e: GameEvents['stretcherDrop']): void {
    const id = e.stretcherId;
    let s = id !== undefined ? this.stretchers.get(id) : undefined;
    if (!s) {
      // Find the closest carried stretcher.
      let best: StretcherRec | undefined;
      let bd = Infinity;
      for (const c of this.stretchers.values()) {
        if (c.dropped) continue;
        const d = Math.hypot(c.x - e.x, c.z - e.z);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      s = best;
    }
    if (!s || s.dropped) return;
    s.dropped = true;
    s.t = 0;
    // The end of the medic who went down hits first.
    const m = this.recs.get(e.zombieId);
    s.tilt = m?.z.stretcher?.role === 'front' ? 1 : -1;
  }

  private ensureStretcher(id: number, x: number, z: number): StretcherRec {
    let s = this.stretchers.get(id);
    if (s) return s;
    const obj = createStretcher();
    obj.position.set(x, STRETCHER_MODEL.carryY, z);
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.layers.enable(REFLECT_LAYER);
      }
    });
    this.ctx.root.add(obj);
    s = { id, obj, dropped: false, t: 0, x, z, tilt: 1, baked: false };
    this.stretchers.set(id, s);
    return s;
  }

  // ------------------------------------------------------------------ frame

  update(dt: number): void {
    const ctx = this.ctx;
    const a = ctx.alpha;
    for (const [id, r] of this.recs) {
      const z = r.z;
      if (z.removed && !z.dead) {
        // Escaped (or cleared): drop it.
        r.rig.root.removeFromParent();
        if (r.skin) unskin(r.skin);
        this.recs.delete(id);
        continue;
      }
      const x = r.px + (z.x - r.px) * a;
      const y = r.py + (z.y - r.py) * a;
      const zz = r.pz + (z.z - r.pz) * a;
      const dist = r.pd + (z.distance - r.pd) * a;
      const sp = Math.hypot(z.x - r.px, z.z - r.pz) / TICK;
      r.speed += (sp - r.speed) * Math.min(1, dt * 12);
      r.x = x;
      r.y = y;
      r.zz = zz;
      const root = r.rig.root;
      root.position.set(x, y, zz);
      // Face the direction of travel (small yaw toward lane changes).
      let target = z.facing < 0 ? Math.PI : 0;
      if (sp > 0.3 && z.state !== 'carry' && z.state !== 'carried') {
        const dz = z.z - r.pz;
        const dx = Math.abs(z.x - r.px) + 1e-4;
        target += clamp(Math.atan2(-dz, dx), -0.55, 0.55) * (z.facing < 0 ? -1 : 1);
      }
      let d = target - r.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      r.yaw += d * Math.min(1, dt * (z.kind === 'bigdave' ? 3 : 8));
      root.rotation.y = r.yaw;

      // Charring while burning.
      if (z.burning > 0) r.charred = Math.min(0.8, r.charred + dt / 5);
      // Riot armour.
      if (r.rig.setPlates && r.plates !== z.plates) {
        r.rig.setPlates(z.plates);
        r.plates = z.plates;
      }

      // Animate.
      // Fixed-shape params (no per-frame allocation or key deletion).
      const p = r.params;
      p.facing = z.facing;
      p.burning = z.burning > 0;
      p.enraged = !!z.enraged;
      p.charred = r.charred;
      p.front = z.stretcher ? z.stretcher.role === 'front' : true;
      // blend: a number only on the frame it should apply (the rig reads typeof).
      p.blend = r.blend > 0 ? r.blend : false;
      r.blend = 0;
      _anim.state = z.state;
      _anim.stateTime = (z.stateTicks + a) * TICK;
      _anim.time = ctx.time;
      _anim.distance = dist;
      _anim.speed = r.speed;
      _anim.dt = dt;
      _anim.params = p;
      r.rig.animate(_anim);

      // Hit flinch on top of the pose.
      if (r.flinch > 0.01) {
        const k = r.flinch * r.flinch;
        const chest = r.rig.bones.get('chest');
        const head = r.rig.bones.get(r.rig.head);
        if (chest && z.state !== 'crawl' && z.state !== 'rise' && z.state !== 'carried') chest.rotation.z += 0.32 * k;
        if (head) {
          head.rotation.z += (r.flinchHead ? 0.6 : 0.2) * k;
          head.rotation.y += 0.15 * k * Math.sin(ctx.time * 40);
        }
        r.flinch = Math.max(0, r.flinch - dt * 6);
      }
      // Groaning: the jaw drops.
      if (r.groan > 0) {
        r.groan = Math.max(0, r.groan - dt);
        const jaw = r.rig.bones.get('jaw');
        if (jaw) jaw.rotation.z -= 0.55 * Math.sin((1 - r.groan / 0.9) * Math.PI) * (0.8 + 0.2 * Math.sin(ctx.time * 30));
      }
      // Spawn pop-in (crawlers out of a bloater).
      if (r.pop < 1) {
        r.pop = Math.min(1, r.pop + dt / 0.35);
        const t = r.pop;
        const back = 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
        root.scale.setScalar(Math.max(0.05, 0.25 + 0.75 * back));
      }

      // Big Dave flings his apron: leave it on the deck.
      if (z.kind === 'bigdave' && z.state === 'enrage' && !r.apronDropped && _anim.stateTime > 0.8 && r.rig.apron && r.rig.apronSpec) {
        r.apronDropped = true;
        r.rig.root.updateMatrixWorld(true);
        const piece = dropPiece(ctx, r.rig.apron, r.rig.apronSpec, new THREE.Vector3(1.4, 0.5, 0.4), 4, true);
        this.pieces.push(piece);
      }

      // Eyes in the dark and the undead tell of risen crawlers.
      this.tells(r, x, zz);
      // Fire on the body.
      if (z.burning > 0) this.burnFx(r, dt);
      // Crawl trail.
      if (z.risen && (z.state === 'crawl' || z.state === 'rise')) {
        r.trailT -= dt;
        if (r.trailT <= 0 && ctx.blood) {
          r.trailT = rand(0.06, 0.22);
          ctx.blood.splat('smear', x - rand(0.25, 0.6), zz + rand(-0.12, 0.12), rand(0.08, 0.15), { angle: 0, stretch: rand(1.6, 2.6), alpha: 0.7 });
        }
      }
    }
    this.updateStretchers(dt);
    // Settling pieces.
    let w = 0;
    for (const pc of this.pieces) {
      pc.rag.sync(dt);
      if (pc.rag.frozen) {
        ctx.corpses.bake(pc.holder);
        continue;
      }
      this.pieces[w++] = pc;
    }
    this.pieces.length = w;
  }

  /**
   * Risen crawlers carry the same sickly green glow and pale green eyes as the
   * bodies that are about to rise (they read even flat on the planks or inside
   * gas); every other zombie only gets faint eye glints as the night falls,
   * so the horde coming in from the dark left edge can be picked out.
   */
  private tells(r: ZRec, x: number, zz: number): void {
    const ctx = this.ctx;
    const z = r.z;
    const risen = z.risen && !z.dead;
    const dark = ctx.darkness;
    if (!risen && dark < 0.05) return;
    const head = r.rig.bones.get(r.rig.head);
    const hp = head && head.visible ? head.getWorldPosition(_v) : null;
    if (risen) {
      const pulse = 0.85 + 0.15 * Math.sin(ctx.time * 5 + z.id);
      ctx.halos.push(x + 0.2, 0.3, zz, UNDEAD_GLOW, 1.15 * pulse, 1.5, 0.9);
      if (hp) ctx.halos.push(hp.x, hp.y + 0.03, hp.z, UNDEAD_EYE, 2.0, 0.22, 0.7);
    } else if (hp && z.state !== 'carried') {
      ctx.halos.push(hp.x + 0.08 * z.facing, hp.y + 0.03, hp.z, NIGHT_EYE, 1.3 * dark, 0.16, 0.6);
    }
  }

  private burnFx(r: ZRec, dt: number): void {
    const ctx = this.ctx;
    const fx = ctx.effects;
    const rate = (r.z.kind === 'bigdave' ? 90 : 46) * fx.density;
    let n = rate * dt;
    const big = r.z.kind === 'bigdave' ? 1.8 : r.z.kind === 'bloater' ? 1.3 : 1;
    while (n > 0) {
      if (n < 1 && Math.random() > n) break;
      n -= 1;
      const name = FIRE_BONES[(Math.random() * FIRE_BONES.length) | 0];
      const b = r.rig.bones.get(name);
      if (!b) continue;
      b.getWorldPosition(_v);
      flame(fx, _v.x + rand(-0.1, 0.1), _v.y + rand(-0.05, 0.12), _v.z + rand(-0.1, 0.1), big * rand(1.0, 1.6), Math.random() < 0.3);
    }
    if (Math.random() < dt * 5) {
      const b = r.rig.bones.get('head');
      if (b) {
        b.getWorldPosition(_v);
        smoke(fx, _v.x, _v.y + 0.2, _v.z, big);
      }
    }
    if (Math.random() < dt * 6) ember(fx, r.x, r.y + 1.2 * big, r.zz);
    const chest = r.rig.bones.get('chest');
    if (chest) {
      chest.getWorldPosition(_v2);
      const fl = 0.75 + 0.25 * Math.sin(ctx.time * 23 + r.z.id) + 0.15 * Math.sin(ctx.time * 41.3);
      ctx.lights.add(_v2.x, _v2.y + 0.4, _v2.z + 0.3, 0xff7a24, 7 * fl * big, 6 * big, 1);
    }
  }

  private updateStretchers(dt: number): void {
    const ctx = this.ctx;
    for (const s of this.stretchers.values()) {
      if (s.baked) continue;
      if (!s.dropped) {
        // Between the two medics (interpolated), at their hands.
        let fx = 0;
        let fz = 0;
        let n = 0;
        let bob = 0;
        let alive = false;
        for (const r of this.recs.values()) {
          const st = r.z.stretcher;
          if (!st || st.id !== s.id || st.role === 'patient') continue;
          fx += r.x;
          fz += r.zz;
          bob += Math.sin((r.z.distance / 0.72) * Math.PI * 2);
          n++;
          alive = true;
        }
        if (alive && n === 2) {
          s.x = fx / 2;
          s.z = fz / 2;
          s.obj.position.set(s.x, STRETCHER_MODEL.carryY + 0.012 * (bob / 2), s.z);
          s.obj.rotation.set(0, 0, 0.02 * Math.sin(ctx.time * 3.1 + s.id));
        } else if (!alive) {
          // Team gone without a drop event (cleared): drop it anyway.
          s.dropped = true;
          s.t = 0;
        }
        continue;
      }
      // Falling to the deck: one end first, a little bounce.
      s.t += dt;
      const t = s.t;
      const fall = Math.min(1, t / 0.28);
      const y = STRETCHER_MODEL.carryY * (1 - fall * fall);
      const bounce = t > 0.28 ? Math.max(0, Math.sin((t - 0.28) * 18) * 0.04 * Math.exp(-(t - 0.28) * 8)) : 0;
      const tiltA = s.tilt * 0.35 * Math.sin(Math.min(1, t / 0.32) * Math.PI) * (t < 0.32 ? 1 : 0);
      s.obj.position.set(s.x, y + bounce, s.z);
      s.obj.rotation.set(0, 0, tiltA);
      if (t > 0.28 && t - dt <= 0.28) {
        ctx.effects.snowPuff({ x: s.x, y: 0, z: s.z }, 5, 0.3, 1.4);
        ctx.shake.add(0.04);
      }
      if (t > 1.2) {
        s.obj.position.y = 0;
        s.obj.rotation.set(0, 0, 0);
        ctx.corpses.bake(s.obj);
        s.baked = true;
      }
    }
  }

  get count(): number {
    return this.recs.size;
  }

  /** Kinds currently alive (debug). */
  kinds(): Partial<Record<ZombieKind, number>> {
    const out: Partial<Record<ZombieKind, number>> = {};
    for (const r of this.recs.values()) out[r.z.kind] = (out[r.z.kind] ?? 0) + 1;
    return out;
  }
}

/**
 * Attach a nail (point toward -x, the way it flew) to the bone nearest the
 * world point, keeping its world transform. Nails stay in bodies for good.
 */
export function attachNail(rig: CreatureRig, point: { x: number; y: number; z: number }): void {
  rig.root.updateMatrixWorld(true);
  let best: THREE.Object3D | null = null;
  let bd = Infinity;
  for (const name of Object.keys(rig.spec)) {
    const b = rig.bones.get(name);
    if (!b) continue;
    const s = rig.spec[name];
    // Distance to the collider centre (bone origin + offset).
    _v.set(s.offset[0], s.offset[1], s.offset[2]);
    b.localToWorld(_v);
    const d = _v.distanceToSquared(_v2.set(point.x, point.y, point.z));
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  if (!best) return;
  const nail = createNail();
  nail.scale.setScalar(2.2);
  // Sunk into the body a little: the head sticks out toward the gun (+x).
  nail.position.set(point.x + 0.06, point.y, point.z + rand(-0.05, 0.05));
  NAIL_Q.setFromEuler(new THREE.Euler(rand(-0.3, 0.3), rand(-0.35, 0.35), rand(-0.25, 0.25)));
  nail.quaternion.copy(NAIL_Q);
  nail.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = false;
      o.layers.enable(REFLECT_LAYER);
    }
  });
  rig.root.parent?.add(nail);
  if (!rig.root.parent) rig.root.add(nail);
  best.attach(nail);
}
