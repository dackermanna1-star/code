// Deaths and the corpse lifecycle (DESIGN §4.1–4.2): the logic decides how a
// zombie died and where its body lies; this turns that into an aimed ragdoll,
// gore and blood, and keeps every body readable afterwards:
//
//   downed (will rise)  live ragdoll → settles → baked, eyes still glowing
//   twitching           un-baked, physical jolts (limbs jerk, the chest arches)
//   rising              the SAME rig leaves the ragdoll and plays 'rise' as the new crawler
//   permanent           eyes out, baked (charred bodies keep their charred tint)
//   shoved / burning    un-baked, pushed / burned, baked again
//   gone                ash pile / slides into the sea / torn apart
//
// Budget: only so many ragdolls are simulated at once (by quality) and only a
// few new ones start per frame. When the budget is full the oldest ragdolls
// that already LIE STILL ON THE DECK are retired (frozen and baked); a body in
// the air is never frozen. Deaths beyond the budget get a canned fall instead
// (the rig collapses into the lying pose on its way to the corpse's spot), and
// torn-off limbs beyond it become flying gore. While a body is live (ragdoll,
// fall, twitch, fire) it stays skinned (~5 draw calls, not ~20 per-bone meshes).
import * as THREE from 'three';
import type { ZombieKind } from '../../config/ids';
import { TICK } from '../../config/world';
import type { GameEvents, V3 } from '../../core/events';
import type { Zombie } from '../../core/Zombie';
import type { BakeHandle } from '../Corpses';
import type { BoneSpec } from '../models/types';
import { charredTint, createHarpoonBolt, createZombieRig, HARPOON_BOLT_LENGTH, MATERIALS, type ZombieRigExt } from '../models/index';
import type { CorpseView } from '../../core/api';
import { Ragdoll, type RagdollOptions } from '../Ragdoll';
import { REFLECT_LAYER } from '../Stage';
import { clamp, rand, type Ctx } from './ctx';
import { ember, flame, shockDust, smoke, F } from './fx';
import { attachNail, dropPiece, type Horde, type ZRec } from './Horde';
import { setSkinCastShadow, setSkinLook, skinify, unskin, type SkinState } from './skin';
import type { Quality } from './ctx';

type Mode = 'live' | 'baked' | 'gone';

export interface Body {
  /** Logic corpse id (null: torn-apart remains the logic does not track). */
  id: number | null;
  zombieId: number;
  kind: ZombieKind;
  rig: ZombieRigExt;
  rag: Ragdoll | null;
  mode: Mode;
  bake: BakeHandle | null;
  /** Blood soaked into the baked body (carried over a re-bake). */
  soaked: number;
  charred: number;
  burning: boolean;
  /** Seconds of twitching left (0 = none) and time to the next jolt. */
  twitch: number;
  jolt: number;
  permanent: boolean;
  /** Blood pool painted (first settle). */
  pooled: boolean;
  /** Seconds since falling into the sea (removed after a while). */
  sinkT: number;
  sinking: boolean;
  /** Pinned on the harpoon cable. */
  kebab: boolean;
  /** Neck fountain (head off / head shot) seconds left. */
  fountain: number;
  /** Nails stuck in the body. */
  nails: number;
  /** Fire flicker seed. */
  seed: number;
  massK: number;
  /** Head position while baked (eye / undead glow), cached at bake time. */
  headAt: THREE.Vector3 | null;
  /** Ticks from death to rising (for the growing tell), 0 = unknown. */
  riseSpan: number;
  /** Skinned stand-ins while live (null while baked, or for bloater pops). */
  skin: SkinState | null;
  /** Never re-skin (bloater pop: parts of bones are hidden). */
  noSkin: boolean;
  /** Canned motion instead of a ragdoll (budget full): collapse / slide / drop. */
  fall: Fall | null;
  /** Canned twitch (no ragdoll): bones jerk around their pose. */
  jitter: Jitter | null;
  /** Bones hidden (collapsed) for good: head destroyed, limbs torn off. */
  hidden: THREE.Object3D[];
  /** Waiting (a frame or two) for its ragdoll: the blast staggers new ragdolls. */
  pending: RagdollOptions | null;
  /** Frames spent waiting in the queue. */
  waited: number;
}

/** A canned fall or slide of the whole rig (no physics). */
interface Fall {
  t: number;
  dur: number;
  /** 'collapse': the rig blends into the lying pose; 'move': rigid slide of the rig as it lies. */
  kind: 'collapse' | 'move';
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  hop: number;
  yaw0: number;
  yaw1: number;
}

/** Canned twitch: rest rotations of the jerking bones, current kick and its decay. */
interface Jitter {
  bones: THREE.Object3D[];
  base: THREE.Quaternion[];
  kick: THREE.Vector3[];
}

interface Kebab {
  t: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  reel: number;
  bodies: Body[];
  anchors: Array<{ anchor: import('cannon-es').Body; x0: number }>;
  bolt: THREE.Group;
  /** Zombie (alive) the bolt stuck in, if it did not go through. */
  stuckIn: ZRec | null;
  released: boolean;
  /** Bolt tip x when it stops. */
  tipX: number;
  playerId: number;
}

/** Ragdoll mass factor per kind → impulse scaling. */
const MASS: Record<ZombieKind, number> = { shambler: 70, jogger: 60, bloater: 140, medic: 70, patient: 70, riot: 110, bigdave: 420 };
/** How hard each weapon throws a body (on top of the blow's force). */
const WEAPON_K: Record<string, number> = { revolver: 1, nailgun: 0.7, shotgun: 1.8, flare: 0.9, harpoon: 0, outboard: 1.25 };
/** Horizontal speed per metre to the corpse's resting point (calibrated against the deck friction). */
const AIM_K = 2.3;
/** In the lying pose the pelvis sits this far ahead (+x) of the rig root. */
const PELVIS_X = 0.08;
/** Ragdolls simulated at once, by quality (older SETTLED ones are retired; airborne ones never). */
const RAGDOLL_CAP: Record<Quality, number> = { low: 10, medium: 14, high: 18 };
/** New ragdolls started per frame (a blast killing dozens staggers them over a few frames). */
const NEW_PER_FRAME: Record<Quality, number> = { low: 4, medium: 5, high: 6 };
/** Single-body flying limbs (cheap: no joints) allowed at once, by quality. */
const PIECE_CAP: Record<Quality, number> = { low: 40, medium: 70, high: 100 };
/** Limbs (with everything below them) torn off a body over the ragdoll budget. */
const FLING = ['head', 'upperArmL', 'upperArmR', 'thighL', 'thighR'];
/** Limbs that jerk in a twitch. */
const TWITCH_LIMBS = ['foreArmL', 'foreArmR', 'shinL', 'shinR', 'upperArmL', 'upperArmR', 'thighL', 'thighR'];

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
/** Bake tint of a body that will never rise (darker, drab). */
const DEAD_TINT = new THREE.Color(0.6, 0.53, 0.5);
/** The undead tell: sickly green glow, pale green eyes. */
const UNDEAD_GLOW = new THREE.Color(0.22, 0.62, 0.06);
const UNDEAD_EYE = new THREE.Color(0.75, 1.0, 0.3);
const UNDEAD_MIST = 0x7aa832;
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _anim = { state: 'down', stateTime: 1, time: 0, distance: 0, speed: 0, dt: 0, params: {} as Record<string, number | boolean> };

let ashGeo: THREE.BufferGeometry | null = null;
function ashGeometry(): THREE.BufferGeometry {
  if (ashGeo) return ashGeo;
  const g = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 0.8 + 0.35 * Math.sin(x * 7.1 + z * 5.3) * Math.cos(z * 6.7 - x * 3.1);
    pos.setXYZ(i, x * 0.85, y * 0.12 * n, z * 0.5);
    const c = 0.035 + 0.05 * Math.max(0, y) * n + 0.02 * Math.sin(x * 23 + z * 17);
    col[i * 3] = c * 1.05;
    col[i * 3 + 1] = c;
    col[i * 3 + 2] = c * 0.95;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  ashGeo = g;
  return g;
}

export class Bodies {
  /** Bodies the logic tracks, by corpse id. */
  readonly byId = new Map<number, Body>();
  /** Every body with something to do (falling, twitching, burning, sinking). */
  private active: Body[] = [];
  /** Harpooned bodies waiting for this tick's 'harpoon' event. */
  private pendingKebab = new Map<number, Body>();
  private kebabs: Kebab[] = [];
  /** Last zombie a harpoon hit (the bolt may stick in it). */
  private harpoonHit: { zombieId: number; tick: number } | null = null;
  /** Last explosion this tick (blast origin for gibs). */
  lastExplosion: { x: number; y: number; z: number; kind: string; tick: number } | null = null;
  /** Last splash of each body falling into the sea (one ripple per body, not per limb). */
  private splashes = new WeakMap<Body, { t: number; x: number; z: number; mass: number }>();
  /** Count of every body ever made (stats). */
  made = 0;
  /** Highest logic corpse id seen (bodies laid without a death event are picked up). */
  private seenCorpse = 0;
  /** Ragdoll budget (quality). */
  private cap = RAGDOLL_CAP.high;
  private newPerFrame = NEW_PER_FRAME.high;
  private pieceCap = PIECE_CAP.high;
  /** New ragdolls started since the last update. */
  private madeThisFrame = 0;
  /** Bodies whose ragdoll starts in a later frame (see admit). */
  private queue: Body[] = [];
  /** Canned falls / slides started instead of ragdolls (stats). */
  canned = 0;

  constructor(
    private ctx: Ctx,
    private horde: Horde,
  ) {}

  setQuality(q: Quality): void {
    this.cap = RAGDOLL_CAP[q];
    this.newPerFrame = NEW_PER_FRAME[q];
    this.pieceCap = PIECE_CAP[q];
  }

  /**
   * Tear a limb (and everything below it) off a body as a one-body flying
   * piece (cheap: no joints; it bakes where it lands). False when the piece
   * budget is full or the limb is already gone.
   */
  private fling(b: Body, name: string, vel: THREE.Vector3): boolean {
    const ctx = this.ctx;
    const bone = b.rig.bones.get(name);
    const spec = b.rig.spec[name];
    if (!bone || !spec || !bone.visible || this.horde.pieces.length >= this.pieceCap) return false;
    b.rig.root.updateMatrixWorld(true);
    const limb = new THREE.Group();
    limb.name = `limb_${name}`;
    bone.matrixWorld.decompose(limb.position, limb.quaternion, limb.scale);
    const inv = _m.copy(bone.matrixWorld).invert();
    const add = (mesh: THREE.Mesh, parent: THREE.Object3D) => {
      const c = mesh.clone(false);
      mesh.updateMatrix();
      _m2.multiplyMatrices(parent.matrixWorld, mesh.matrix).premultiply(inv).decompose(c.position, c.quaternion, c.scale);
      c.frustumCulled = false;
      limb.add(c);
    };
    if (b.skin) {
      // The per-bone meshes are out of the hierarchy while skinned.
      const sk = b.skin;
      for (let i = 0; i < sk.hidden.length; i++) if (isUnder(sk.parents[i], bone)) add(sk.hidden[i], sk.parents[i]);
    }
    bone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || !m.parent) return;
      for (let p: THREE.Object3D | null = m; p && p !== bone.parent; p = p.parent) if (!p.visible) return;
      add(m, m.parent);
    });
    if (!limb.children.length) return false;
    // One collider for the whole limb (upper + lower + hand / foot), so it lies
    // down instead of balancing on a short stub.
    let reach = 0;
    bone.traverse((o) => {
      if (o === bone || !b.rig.spec[o.name]) return;
      _v.setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv);
      reach = Math.max(reach, _v.length() + 0.12);
    });
    const pspec: BoneSpec = reach > 0 && spec.shape === 'capsule' ? { ...spec, size: [spec.size[0], reach / 2], offset: [0, -reach / 2, 0] } : spec;
    ctx.root.add(limb);
    const piece = dropPiece(ctx, limb, pspec, vel, 12);
    this.horde.pieces.push(piece);
    hideBone(bone, b.hidden);
    return true;
  }

  /** Over the ragdoll budget: the limbs fly as pieces (or gore once those run out). */
  private flingLimbs(b: Body, from: THREE.Vector3, speed: number): void {
    const ctx = this.ctx;
    for (const name of FLING) {
      const bone = b.rig.bones.get(name);
      if (!bone || !bone.visible) continue;
      bone.getWorldPosition(_v);
      const dx = _v.x - from.x;
      const dz = _v.z - from.z;
      const l = Math.hypot(dx, dz) || 1;
      const sp = speed * rand(0.7, 1.3);
      // As high as a ragdoll's torn-off limbs go (blast + tear-off speed).
      const vel = _v2.set((dx / l) * sp + rand(-1.5, 1.5), speed * rand(0.6, 1.2) + 2 + rand(0, 4.5), (dz / l) * sp * 0.8 + rand(-1.2, 1.2));
      bone.getWorldPosition(_v);
      if (!this.fling(b, name, vel)) {
        ctx.gore.burst(_v, 4, { dirX: dx / l, speed: sp, up: 5, size: 0.1 });
        hideBone(bone, b.hidden);
      }
    }
  }

  /** Shadow casting of the live (skinned) bodies (quality switch). */
  setShadows(on: boolean): void {
    for (const b of this.active) if (b.skin) setSkinCastShadow(b.skin, on);
  }

  clear(): void {
    for (const b of this.active) {
      b.rag?.dispose();
      b.rig.root.removeFromParent();
      this.dropSkin(b);
    }
    for (const b of this.byId.values()) {
      b.rag?.dispose();
      b.rig.root.removeFromParent();
      this.dropSkin(b);
    }
    for (const k of this.kebabs) {
      k.bolt.removeFromParent();
    }
    this.byId.clear();
    this.active.length = 0;
    this.pendingKebab.clear();
    this.kebabs.length = 0;
    this.harpoonHit = null;
    this.lastExplosion = null;
    this.seenCorpse = 0;
    this.madeThisFrame = 0;
    this.queue.length = 0;
  }

  /**
   * Bodies the logic laid on the deck without a death this view saw (attaching
   * to a world in progress, debug bodies): pose a rig lying there.
   */
  syncCorpses(list: readonly CorpseView[]): void {
    const n = list.length;
    if (!n || list[n - 1].id <= this.seenCorpse) return;
    let i = n - 1;
    while (i > 0 && list[i - 1].id > this.seenCorpse) i--;
    for (; i < n; i++) {
      const c = list[i];
      if (!c.removed && !this.byId.has(c.id)) this.layBody(c);
    }
    this.seenCorpse = list[n - 1].id;
  }

  private layBody(c: CorpseView): void {
    const ctx = this.ctx;
    const rig = createZombieRig(c.kind, c.look);
    rig.root.position.set(c.x - PELVIS_X, 0, c.z);
    rig.root.rotation.y = rand(-0.4, 0.4);
    // Straight into the lying pose (blend 0: no cross-fade from the build pose).
    rig.animate({ state: 'down', stateTime: 1, time: 0, distance: 0, speed: 0, dt: 0, params: { blend: 0 } });
    ctx.root.add(rig.root);
    rig.root.updateMatrixWorld(true);
    const body: Body = {
      id: c.id,
      zombieId: c.zombieId,
      kind: c.kind,
      rig,
      rag: null,
      mode: 'live',
      bake: null,
      soaked: 0.3,
      charred: 0,
      burning: false,
      twitch: 0,
      jolt: 0,
      permanent: c.risesAt === null,
      pooled: false,
      sinkT: 0,
      sinking: false,
      kebab: false,
      fountain: 0,
      nails: 0,
      seed: Math.random() * 100,
      massK: MASS[c.kind] / 70,
      headAt: null,
      riseSpan: c.risesAt !== null && ctx.world ? Math.max(1, c.risesAt - ctx.world.tick) : 0,
      skin: null,
      noSkin: false,
      fall: null,
      jitter: null,
      hidden: [],
      pending: null,
      waited: 0,
    };
    if (c.deathKind === 'headshot' || c.deathKind === 'stomp') {
      const head = rig.bones.get(rig.head);
      if (head) hideBone(head, body.hidden);
    }
    if (body.permanent) this.eyes(body, false);
    // Already lying where the logic put it: no physics, settle (blood pool) and bake.
    this.byId.set(c.id, body);
    this.made++;
    if (c.burning > 0) this.onIgnite(c.id);
    if (c.twitching) this.onTwitch(c.id);
    if (body.mode === 'live' && !body.burning && body.twitch <= 0) this.onSettled(body);
    else this.activate(body);
  }

  get ragdolls(): number {
    let n = 0;
    for (const b of this.active) if (b.rag && !b.rag.frozen) n++;
    return n;
  }

  /**
   * May a new ragdoll start? Retires settled ragdolls to make room. 'now';
   * 'later' when this frame already started its share (it starts in a frame
   * or two: see the queue); 'no' when the budget is full of bodies still in
   * the air (the caller falls back to a canned motion). `force`: always
   * (harpoon kebabs, drowning).
   */
  private admitAs(force = false, canRetire = true): 'now' | 'later' | 'no' {
    if (force) {
      this.madeThisFrame++;
      return 'now';
    }
    let n = this.ragdolls + this.queue.length;
    if (n >= this.cap && canRetire) {
      this.retire(n - this.cap + 1);
      n = this.ragdolls + this.queue.length;
    }
    if (n >= this.cap) return 'no';
    // First come, first served: bodies already waiting start first.
    if (this.madeThisFrame >= this.newPerFrame || this.queue.length) return 'later';
    this.madeThisFrame++;
    return 'now';
  }

  /** admitAs without the queue: a ragdoll now, or none. `canRetire` false inside the update loop. */
  private admit(force = false, canRetire = true): boolean {
    if (!force && this.madeThisFrame >= this.newPerFrame) return false;
    return this.admitAs(force, canRetire) === 'now';
  }

  /**
   * Freeze (and bake) up to `k` of the oldest ragdolls that lie on the deck
   * and have (nearly) stopped. Never one in the air, pinned, twitching or sinking.
   */
  private retire(k: number): void {
    if (k <= 0) return;
    const cands: Body[] = [];
    for (const b of this.active) {
      const r = b.rag;
      if (!r || r.frozen || r.pinned || b.twitch > 0 || b.sinking || b.kebab) continue;
      if (r.age < 0.4) continue;
      if (r.settled(r.age > 2.5 ? 3 : 1.5)) cands.push(b);
    }
    cands.sort((a, b) => b.rag!.age - a.rag!.age);
    for (let i = 0; i < cands.length && i < k; i++) cands[i].rag!.freeze();
  }

  // ================================================================== skins

  /** Keep the body skinned while it is live (the rig must be in the scene). */
  private ensureSkin(b: Body): void {
    if (b.skin || b.noSkin || b.mode !== 'live') return;
    b.skin = skinify(b.rig, { cull: false });
    if (b.skin && b.charred > 0) b.rig.setCharred(b.charred, true);
  }

  /** Eyes lit (bodies that will rise, risen crawlers) or put out (dead for good), skinned or not. */
  private eyes(b: Body, on: boolean): void {
    b.rig.setEyeGlow(on);
    if (b.skin) setSkinLook(b.skin, { eyes: on });
  }

  /** Back to per-bone meshes (baking, pops). */
  private dropSkin(b: Body): void {
    if (!b.skin) return;
    unskin(b.skin);
    b.skin = null;
  }

  get liveCount(): number {
    let n = 0;
    for (const b of this.byId.values()) if (b.mode === 'live') n++;
    return n;
  }

  // ================================================================== deaths

  onDeath(e: GameEvents['zombieDeath']): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const rec = this.horde.take(e.zombieId, true);
    if (!rec || !w) return;
    const z = rec.z;
    const rig = rec.rig;
    rig.root.scale.setScalar(1);
    rig.root.position.set(z.x, z.y, z.z);
    rig.root.rotation.y = rec.yaw;
    rig.root.updateMatrixWorld(true);
    const corpse = e.corpseId !== null ? w.corpseById(e.corpseId) : undefined;
    const kind = e.deathKind;
    const mass = MASS[z.kind];
    const wk = e.weapon ? WEAPON_K[e.weapon] ?? 1 : 1;
    const force = e.force;
    const dv = clamp(0.5 + (force / (mass * 0.55)) * Math.max(0.6, wk), 0.6, 6.5);
    const pt = new THREE.Vector3(e.point.x, e.point.y, e.point.z);
    const pelvis = rig.bones.get('pelvis');
    const pelvisPos = pelvis ? pelvis.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(z.x, 0.9, z.z);
    const target = corpse ? { x: corpse.x + PELVIS_X * (z.facing < 0 ? -1 : 1), z: corpse.z } : null;

    const body: Body = {
      id: corpse ? corpse.id : null,
      zombieId: z.id,
      kind: z.kind,
      rig,
      rag: null,
      mode: 'live',
      bake: null,
      soaked: 0,
      charred: rec.charred,
      burning: false,
      twitch: 0,
      jolt: 0,
      permanent: !corpse || corpse.risesAt === null,
      pooled: false,
      sinkT: 0,
      sinking: false,
      kebab: false,
      fountain: 0,
      nails: rec.nails,
      seed: Math.random() * 100,
      massK: mass / 70,
      headAt: null,
      riseSpan: corpse && corpse.risesAt !== null ? Math.max(1, corpse.risesAt - w.tick) : 0,
      skin: rec.skin,
      noSkin: false,
      fall: null,
      jitter: null,
      hidden: [],
      pending: null,
      waited: 0,
    };
    rec.skin = null;
    // Bones travel far from the root as a ragdoll: no culling on the fixed bounds.
    if (body.skin) for (const m of body.skin.meshes) m.frustumCulled = false;
    this.made++;

    // The carried prop drops.
    if (rig.prop && rig.propSpec && rig.prop.visible) {
      const piece = dropPiece(ctx, rig.prop, rig.propSpec, new THREE.Vector3(rec.speed * 0.6 + rand(-1, 1), rand(1, 2.5), rand(-0.8, 0.8)), 7);
      this.horde.pieces.push(piece);
    }

    // Aim: horizontal velocity that carries the pelvis to the logic resting point.
    const opts: RagdollOptions = {};
    const vel = new THREE.Vector3();
    if (target) {
      vel.set((target.x - pelvisPos.x) * AIM_K, 0, (target.z - pelvisPos.z) * AIM_K);
      opts.guide = target;
    } else {
      vel.set(e.dirX * dv * 0.5, 0, e.dirZ * dv * 0.3);
    }
    vel.y = dv * (e.weapon === 'shotgun' ? 0.32 : 0.2);
    const dir = new THREE.Vector3(e.dirX, 0.3, e.dirZ).normalize();
    // The blow jolts the part it hit (the body twists and folds over it);
    // the rest of the body is biased the other way so the whole still lands
    // where the logic put it.
    const jolt = dv * 1.05;
    if (target) {
      vel.x -= dir.x * jolt * 0.55;
      vel.z -= dir.z * jolt * 0.55;
    }
    opts.velocity = vel;
    opts.impulse = { point: pt, dir, speed: jolt };
    const gibBones = new Set(Object.entries(rig.spec).filter(([, s]) => s.gib).map(([k]) => k));
    const blood = ctx.blood;
    const head = rig.bones.get(rig.head);

    switch (kind) {
      case 'headshot': {
        opts.impulse = { point: pt, dir: new THREE.Vector3(e.dirX, 0.4, e.dirZ).normalize(), speed: dv * 1.1, bone: rig.head };
        // The head is destroyed: gone in a red mist.
        const hp = head ? head.getWorldPosition(new THREE.Vector3()) : pt.clone();
        if (head) hideBone(head, body.hidden);
        this.headBurst(hp, e.dirX, e.dirZ, 1);
        body.fountain = 1.1;
        break;
      }
      case 'headoff': {
        opts.detach = new Set([rig.head]);
        opts.detachSpeed = 4;
        opts.impulse = { point: pt, dir: new THREE.Vector3(e.dirX, 0.9, e.dirZ).normalize(), speed: 4.2, bone: rig.head };
        const hp = head ? head.getWorldPosition(new THREE.Vector3()) : pt.clone();
        this.headBurst(hp, e.dirX, e.dirZ, 0.6);
        body.fountain = 1.6;
        break;
      }
      case 'gib': {
        const ex = this.lastExplosion && this.lastExplosion.tick === w.tick ? this.lastExplosion : null;
        if (ex && ex.kind === 'crates') {
          // Crushed under the falling crates.
          rig.root.visible = false;
          this.gore(pelvisPos, z.kind, 1.3, -1);
          blood.pool(z.x, z.z, 0.9 * Math.sqrt(body.massK));
          body.mode = 'gone';
          rig.root.removeFromParent();
          this.dropSkin(body);
          return;
        }
        opts.detach = gibBones;
        opts.detachSpeed = 3.5 + Math.min(2.5, force / 200);
        const bp = ex ? new THREE.Vector3(ex.x, Math.min(ex.y, 0.3), ex.z) : new THREE.Vector3(z.x - e.dirX, 0.2, z.z - e.dirZ);
        opts.blast = { point: bp, speed: Math.min(5.5, 3 + force / 200) };
        opts.guide = undefined;
        opts.impulse = undefined;
        opts.velocity = new THREE.Vector3(0, 1, 0);
        this.gore(pelvisPos, z.kind, 1, e.dirX);
        break;
      }
      case 'pop': {
        this.pop(rec, pelvisPos);
        // Only the legs are left: they stand for a moment, then topple (per-bone meshes: parts of bones go).
        this.dropSkin(body);
        body.noSkin = true;
        const chest = rig.bones.get('chest');
        if (chest) chest.visible = false;
        const pel = rig.bones.get('pelvis');
        if (pel) for (const c of pel.children) if ((c as THREE.Mesh).isMesh) c.visible = false;
        const belly = rig.bones.get('belly');
        if (belly) belly.visible = false;
        if (rig.apron) rig.apron.visible = false;
        opts.guide = undefined;
        opts.impulse = { point: pelvisPos.clone().add(new THREE.Vector3(0.3, 0.3, 0)), dir: new THREE.Vector3(rand(-1, 1), 0.2, rand(-1, 1)).normalize(), speed: 1.2 };
        opts.velocity = new THREE.Vector3(0, 0.5, 0);
        body.permanent = true;
        break;
      }
      case 'harpoon': {
        opts.impulse = undefined;
        opts.velocity = new THREE.Vector3(0, 0, 0);
        body.kebab = true;
        this.pendingKebab.set(z.id, body);
        break;
      }
      case 'burn': {
        opts.impulse = { point: pt, dir: new THREE.Vector3(rand(-0.4, 0.4), -0.2, rand(-0.4, 0.4)).normalize(), speed: 1 };
        vel.y = 0.2;
        body.charred = Math.max(body.charred, 0.85);
        rig.setCharred(body.charred);
        break;
      }
      case 'stomp': {
        opts.impulse = { point: pt, dir: new THREE.Vector3(0, -1, 0), speed: 3, bone: rig.head };
        const hp = head ? head.getWorldPosition(new THREE.Vector3()) : pt.clone();
        if (head) hideBone(head, body.hidden);
        this.headBurst(hp, 0, 0, 0.7, true);
        blood.pool(hp.x, hp.z, 0.45);
        break;
      }
      case 'drown': {
        opts.guide = undefined;
        const sz = Math.sign(z.z) || 1;
        opts.velocity = new THREE.Vector3(e.dirX * 1.5, 1.5, sz * 2.5);
        opts.impulse = undefined;
        break;
      }
      case 'down':
      default:
        break;
    }

    // Blood from the killing blow.
    if (kind !== 'pop' && kind !== 'gib' && kind !== 'burn') {
      const n = Math.min(150, 40 + force / 4) * (kind === 'headshot' ? 1.3 : 1);
      blood.spray(pt, n, { dirX: e.dirX, dirZ: e.dirZ, speed: [1.5, 10], up: [-0.5, 3.5], spread: 0.8, jitter: 1.6, size: [0.025, 0.09] });
      ctx.effects.bloodPuff(pt, e.dirX, 1.2);
    }

    if (corpse) {
      this.byId.set(corpse.id, body);
      this.seenCorpse = Math.max(this.seenCorpse, corpse.id);
    }
    this.active.push(body);
    // Bodies that will never rise have their eyes put out.
    if (body.permanent) this.eyes(body, false);

    const adm = this.admitAs(kind === 'harpoon' || kind === 'drown');
    if (adm === 'later') {
      // Its ragdoll starts in a frame or two (a blast staggers them).
      body.pending = opts;
      this.queue.push(body);
      return;
    }
    if (adm === 'no') {
      // Over the ragdoll budget: a canned fall (and gore for the torn-off limbs).
      this.canned++;
      if (kind === 'gib') {
        const bp = opts.blast?.point ?? pelvisPos;
        this.flingLimbs(body, bp, opts.blast?.speed ?? 4);
        const dx = pelvisPos.x - bp.x;
        const dz = pelvisPos.z - bp.z;
        const l = Math.hypot(dx, dz) || 1;
        const d = rand(1.2, 3.2);
        let tx = clamp(pelvisPos.x + (dx / l) * d, -28, 21);
        let tz = clamp(pelvisPos.z + (dz / l) * d, -5.4, 5.4);
        if (!ctx.env.isOnDeck(tx, tz)) {
          tx = pelvisPos.x;
          tz = clamp(pelvisPos.z, -5.4, 5.4);
        }
        this.startFall(body, tx, tz, 'collapse', rand(1.2, 2.4), rand(0.8, 1.05), rec.yaw + rand(-1.2, 1.2));
      } else {
        const tx = target ? target.x : pelvisPos.x + e.dirX * dv * 0.3;
        const tz = target ? target.z : pelvisPos.z;
        const hop = kind === 'pop' ? 0.05 : clamp(dv * 0.07, 0.04, 0.35);
        this.startFall(body, tx, tz, 'collapse', hop, rand(0.5, 0.65), rec.yaw + rand(-0.35, 0.35));
      }
      return;
    }

    this.startRagdoll(body, opts);
  }

  /** The death ragdoll (aimed, with its splash callback). */
  private startRagdoll(body: Body, opts: RagdollOptions): void {
    const ctx = this.ctx;
    const rag = new Ragdoll(ctx.physics, body.rig, opts);
    body.rag = rag;
    rag.onSink = (part) => {
      const p = part.body.position;
      // One splash per body (its parts hit the water within moments of each other), sized by the mass.
      const last = this.splashes.get(body);
      if (last && ctx.time - last.t < 0.4 && Math.hypot(p.x - last.x, p.z - last.z) < 1.2) {
        last.mass += part.spec.mass;
      } else {
        this.splashes.set(body, { t: ctx.time, x: p.x, z: p.z, mass: part.spec.mass });
        ctx.effects.splash({ x: p.x, y: -2.5, z: p.z }, Math.min(1.4, 0.35 + (MASS[body.kind] / 70) * 0.5));
      }
      body.sinking = true;
    };
    rag.onFrozen = () => this.onSettled(body);
  }

  /**
   * Canned motion (no physics). 'collapse': from the rig's current pose (a
   * zombie that just died) into the lying pose, on the way to (px, pz) where
   * the pelvis comes to rest; 'move': the body slides / is thrown rigidly as
   * it lies so its pelvis ends at (px, pz). `py` < 0: into the sea.
   */
  private startFall(b: Body, px: number, pz: number, kind: Fall['kind'], hop: number, dur: number, yaw = b.rig.root.rotation.y, py = 0): void {
    const root = b.rig.root;
    let x1: number;
    let z1: number;
    if (kind === 'collapse') {
      // Root such that the lying pelvis lands at (px, pz).
      x1 = px - PELVIS_X * Math.cos(yaw);
      z1 = pz + PELVIS_X * Math.sin(yaw);
      _anim.state = 'down';
      _anim.time = this.ctx.time;
      _anim.dt = 0;
      _anim.params = { blend: dur * 0.8, twitch: false, facing: 1 };
      b.rig.animate(_anim);
      for (const h of b.hidden) h.scale.setScalar(1e-3);
    } else {
      const pel = b.rig.bones.get('pelvis');
      const pp = pel ? pel.getWorldPosition(_v) : _v.set(root.position.x, 0, root.position.z);
      x1 = root.position.x + (px - pp.x);
      z1 = root.position.z + (pz - pp.z);
      yaw = root.rotation.y;
    }
    b.fall = { t: 0, dur, kind, x0: root.position.x, y0: root.position.y, z0: root.position.z, x1, y1: py, z1, hop, yaw0: root.rotation.y, yaw1: yaw };
    b.jitter = null;
    b.pending = null;
    this.activate(b);
  }

  /** Advance a canned fall; true when it has landed. */
  private stepFall(b: Body, f: Fall, dt: number): boolean {
    f.t += dt;
    const u = Math.min(1, f.t / f.dur);
    const e = 1 - (1 - u) * (1 - u);
    const root = b.rig.root;
    root.position.set(f.x0 + (f.x1 - f.x0) * e, f.y0 + (f.y1 - f.y0) * (f.y1 < 0 ? u * u : e) + f.hop * 4 * u * (1 - u), f.z0 + (f.z1 - f.z0) * e);
    root.rotation.y = f.yaw0 + (f.yaw1 - f.yaw0) * e;
    if (f.kind === 'collapse') {
      _anim.state = 'down';
      _anim.time = this.ctx.time;
      _anim.dt = dt;
      _anim.params = { twitch: false, facing: 1 };
      b.rig.animate(_anim);
      for (const h of b.hidden) h.scale.setScalar(1e-3);
    }
    // Sliding bodies smear blood.
    if (f.kind === 'move' && f.y1 >= 0 && Math.random() < 0.4) this.ctx.blood.splat('smear', root.position.x, root.position.z, 0.16, { angle: Math.atan2(f.z1 - f.z0, f.x1 - f.x0), stretch: 2 });
    return u >= 1;
  }

  /** Head destroyed: red mist, chunks, a spray. */
  private headBurst(p: THREE.Vector3, dirX: number, dirZ: number, k: number, down = false): void {
    const ctx = this.ctx;
    ctx.blood.spray(p, 70 * k, { dirX: dirX || -1, dirZ, speed: down ? [1, 5] : [2, 9], up: down ? [0, 2.5] : [0.5, 4], spread: down ? Math.PI : 1.1, size: [0.02, 0.07], jitter: 2 });
    for (let i = 0; i < 3; i++) ctx.effects.bloodPuff({ x: p.x, y: p.y + rand(-0.05, 0.1), z: p.z }, dirX || -1, 2 * k);
    ctx.effects.emit(false, p.x, p.y, p.z, { vel: [(dirX || -1) * 0.8, 0.3, 0], drag: 2, size: [0.25, 0.9 * k + 0.3], life: 0.55, color: 0x9a0a0a, color1: 0x4a0202, alpha: [0.7, 0], frame: F.Mist });
    ctx.gore.burst(p, 9 * k, { dirX: dirX || -1, dirZ, speed: 4, up: 3.5, size: 0.045, tint: 0xd8c8b0 });
  }

  /** Torn apart: chunks, blood everywhere. */
  private gore(p: THREE.Vector3, kind: ZombieKind, k: number, dirX: number): void {
    const ctx = this.ctx;
    const big = kind === 'bigdave' ? 2.4 : kind === 'bloater' ? 1.5 : 1;
    ctx.blood.spray(p, 170 * k * big, { dirX, speed: [1, 12], up: [0.5, 6.5], spread: Math.PI, size: [0.025, 0.1], jitter: 3 });
    ctx.blood.pool(p.x, p.z, 0.6 * big);
    for (let i = 0; i < 4; i++) ctx.effects.bloodPuff({ x: p.x, y: p.y + Math.random() * 0.4, z: p.z }, dirX, 2.6);
    ctx.gore.burst(p, 22 * k * big, { dirX: dirX * 0.3, speed: 6 * Math.sqrt(big), up: 6, size: 0.07 * Math.sqrt(big) });
  }

  /** Bloater / Big Dave bursting. */
  private pop(rec: ZRec, p: THREE.Vector3): void {
    const ctx = this.ctx;
    const dave = rec.z.kind === 'bigdave';
    const k = dave ? 2.6 : 1.4;
    const c = p.clone();
    c.y += dave ? 1.2 : 0.5;
    ctx.blood.spray(c, 260 * k, { dirX: -1, speed: [1, 11 * Math.sqrt(k)], up: [1.5, 8 * Math.sqrt(k)], spread: Math.PI, size: [0.03, 0.11], jitter: 4 });
    ctx.blood.pool(p.x, p.z, 1.1 * k);
    ctx.gore.burst(c, 34 * k, { speed: 6.5 * Math.sqrt(k), up: 7, size: 0.075 * Math.sqrt(k), tint: 0x6a7a4a });
    for (let i = 0; i < 6 * k; i++) ctx.effects.bloodPuff({ x: c.x + rand(-0.4, 0.4), y: c.y + rand(-0.3, 0.5), z: c.z + rand(-0.4, 0.4) }, rand(-1, 1), 3);
    // A burst of green gas and a wet shock ring.
    for (let i = 0; i < 14 * k; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(1.5, 4) * Math.sqrt(k);
      ctx.effects.emit(false, c.x, c.y, c.z, { vel: [Math.cos(a) * s, rand(0.5, 2.5), Math.sin(a) * s * 0.7], drag: 2.2, size: [0.4 * k, 1.3 * k], life: rand(1, 1.8), color: 0x7a8c34, color1: 0x46561c, alpha: [0.26, 0], frame: F.Smoke, vr: rand(-1, 1) });
    }
    shockDust(ctx.effects, p.x, p.z, 1.2 * k, Math.round(10 * k), 0x6a7436, 0.32);
    ctx.shake.add(dave ? 0.45 : 0.12);
    if (dave) ctx.shake.punch(0, -1.2, 0);
  }

  // ================================================================== harpoon

  onHarpoonHit(zombieId: number): void {
    const w = this.ctx.world;
    if (w) this.harpoonHit = { zombieId, tick: w.tick };
  }

  onHarpoon(e: GameEvents['harpoon'], muzzle: THREE.Vector3 | null): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const from = muzzle ?? new THREE.Vector3(e.from.x, e.from.y, e.from.z);
    const to = new THREE.Vector3(e.to.x, e.from.y, e.from.z);
    const bolt = createHarpoonBolt();
    bolt.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.layers.enable(REFLECT_LAYER);
      }
    });
    bolt.scale.setScalar(1.25);
    bolt.position.copy(from);
    ctx.root.add(bolt);
    const k: Kebab = { t: 0, from, to, reel: e.reel, bodies: [], anchors: [], bolt, stuckIn: null, released: false, tipX: to.x, playerId: e.playerId };
    for (const id of e.skewered) {
      const b = this.pendingKebab.get(id);
      if (!b || !b.rag) continue;
      this.pendingKebab.delete(id);
      // Pin the torso where the bolt went through (on the body's own depth plane).
      const chest = b.rig.bones.get('chest');
      const cp = chest ? chest.getWorldPosition(_v) : _v.set(to.x, 1, to.z);
      const pin = new THREE.Vector3(cp.x, clamp(e.from.y, 0.7, 1.4), cp.z);
      const anchor = b.rag.pin('chest', pin);
      if (anchor) k.anchors.push({ anchor, x0: anchor.position.x });
      k.bodies.push(b);
      // A spurt where it went in and out.
      ctx.blood.spray(pin, 45, { dirX: -1, speed: [2, 8], up: [0, 3], spread: 0.5, size: [0.02, 0.07] });
      ctx.effects.bloodPuff(pin, -1, 1.5);
    }
    this.pendingKebab.clear();
    const hh = this.harpoonHit;
    if (w && hh && hh.tick === w.tick && !e.skewered.includes(hh.zombieId)) {
      const r = this.horde.get(hh.zombieId);
      if (r && !r.z.dead) k.stuckIn = r;
    }
    if (k.bodies.length) {
      const last = k.bodies[k.bodies.length - 1];
      const ch = last.rig.bones.get('chest');
      k.tipX = (ch ? ch.getWorldPosition(_v).x : to.x) - 0.6;
    }
    this.kebabs.push(k);
    if (k.bodies.length >= 2) ctx.shake.punch(0.9, 0, 0);
  }

  private updateKebabs(dt: number, muzzleOf: (playerId: number) => THREE.Vector3 | null): void {
    const ctx = this.ctx;
    let w = 0;
    for (const k of this.kebabs) {
      k.t += dt;
      const t = k.t;
      const FLY = 0.09;
      const REEL0 = 0.1;
      const REEL1 = 0.42;
      const RELEASE = 0.55;
      const tip = _v2;
      if (t < FLY) {
        const u = t / FLY;
        tip.lerpVectors(k.from, k.to, u);
        if (k.bodies.length || k.stuckIn) tip.x = Math.max(tip.x, k.tipX);
      } else {
        tip.set(k.tipX, k.from.y, k.from.z);
        if (!k.bodies.length && !k.stuckIn) tip.copy(k.to);
      }
      // Reel: the anchors (and the bolt) are dragged toward the hunter.
      const u = clamp((t - REEL0) / (REEL1 - REEL0), 0, 1);
      const e = u * u * (3 - 2 * u);
      if (!k.released) {
        for (const a of k.anchors) a.anchor.position.x = a.x0 + k.reel * e;
        if (k.bodies.length) tip.x += k.reel * e;
      }
      if (!k.released && t >= RELEASE) {
        k.released = true;
        for (const b of k.bodies) {
          b.rag?.unpinAll();
          b.kebab = false;
          b.rag?.kick(0, -0.5, 0);
        }
        // The bolt stays in the last body / the tough one it stuck in.
        const host = k.bodies.length ? k.bodies[k.bodies.length - 1].rig : k.stuckIn?.rig;
        if (host) {
          k.bolt.position.copy(tip);
          k.bolt.updateMatrixWorld(true);
          let best: THREE.Object3D | null = null;
          let bd = Infinity;
          for (const name of ['chest', 'pelvis', 'head']) {
            const bone = host.bones.get(name);
            if (!bone) continue;
            const d = bone.getWorldPosition(_v).distanceToSquared(tip);
            if (d < bd) {
              bd = d;
              best = bone;
            }
          }
          if (best) best.attach(k.bolt);
        } else {
          k.bolt.removeFromParent();
        }
      }
      if (!k.released) {
        // The bolt flies tail-first behind its tip; the cable runs back to the gun.
        k.bolt.position.set(tip.x + HARPOON_BOLT_LENGTH * 1.25, tip.y, tip.z);
        k.bolt.rotation.set(0, 0, 0);
      }
      // Cable: taut while reeling, then it whips back and fades.
      const m = muzzleOf(k.playerId) ?? k.from;
      const fade = k.released ? clamp(1 - (t - RELEASE) / 0.25, 0, 1) : 1;
      if (fade > 0) {
        const end = k.released ? _v.lerpVectors(tip, m, clamp((t - RELEASE) / 0.25, 0, 1)) : _v.set(tip.x + HARPOON_BOLT_LENGTH * 1.25, tip.y, tip.z);
        ctx.effects.beamFrame(m, end, 0.022, 0x2a2a2a, 0.95 * fade, true);
        ctx.effects.beamFrame(m, end, 0.05, 0xd8d2c0, 0.25 * fade);
      }
      if (t < 1.2) this.kebabs[w++] = k;
    }
    this.kebabs.length = w;
  }

  // ================================================================== lifecycle events

  onTwitch(id: number): void {
    const b = this.byId.get(id);
    if (!b || b.permanent || b.mode === 'gone') return;
    this.ensureLive(b);
    b.twitch = 2.2;
    b.jolt = 0;
    // Real jolts need the ragdoll; over budget the bones jerk in place (see update).
    if (!b.rag && !b.fall && this.admit()) this.makeRagdoll(b);
    this.activate(b);
  }

  /** A ragdoll for a body lying as it is (canned bodies that need physics after all). */
  private makeRagdoll(b: Body, opts: RagdollOptions = {}): Ragdoll {
    const rag = new Ragdoll(this.ctx.physics, b.rig, opts);
    rag.onFrozen = () => this.onSettled(b);
    b.rag = rag;
    b.fall = null;
    b.jitter = null;
    b.pending = null;
    return rag;
  }

  /** The SAME rig gets up as the new crawler. Returns true when handed over. */
  onRise(id: number, zombieId: number): boolean {
    const w = this.ctx.world;
    const b = this.byId.get(id);
    const zb = w?.zombieById(zombieId);
    if (!b || !zb || b.mode === 'gone') return false;
    this.ensureLive(b);
    b.rag?.dispose();
    b.rag = null;
    b.twitch = 0;
    b.fall = null;
    this.endJitter(b);
    const rig = b.rig;
    const pelvis = rig.bones.get('pelvis');
    rig.root.updateMatrixWorld(true);
    const pw = pelvis ? pelvis.matrixWorld.clone() : null;
    rig.root.position.set(zb.x, zb.y, zb.z);
    rig.root.rotation.set(0, zb.facing < 0 ? Math.PI : 0, 0);
    rig.root.updateMatrixWorld(true);
    if (pelvis && pw && pelvis.parent) {
      // Keep the lying pose where it is: re-express the pelvis under the moved root.
      pelvis.parent.updateMatrixWorld(true);
      _m.copy(pelvis.parent.matrixWorld).invert().multiply(pw);
      _m.decompose(pelvis.position, pelvis.quaternion, _s);
    }
    this.eyes(b, true);
    b.mode = 'gone';
    this.byId.delete(id);
    this.removeActive(b);
    const skin = b.skin;
    b.skin = null;
    const rec = this.horde.spawn(zb as Zombie, rig, 0.45, skin);
    rec.nails = b.nails;
    // A gasp of blood as it lifts its head.
    this.ctx.blood.spray({ x: zb.x + 0.6, y: 0.3, z: zb.z }, 18, { dirX: 1, speed: [0.5, 2.5], up: [0.5, 2], spread: 1.2 });
    return true;
  }

  onPermanent(id: number, reason: GameEvents['corpsePermanent']['reason']): void {
    const b = this.byId.get(id);
    if (!b || b.mode === 'gone') return;
    b.permanent = true;
    b.twitch = 0;
    if (reason === 'stomp') {
      // Tidy: the head is stamped flat.
      this.ensureLive(b);
      const head = b.rig.bones.get(b.rig.head);
      if (head && head.visible) {
        const hp = head.getWorldPosition(new THREE.Vector3());
        hideBone(head, b.hidden);
        this.headBurst(hp, 0, 0, 0.8, true);
        this.ctx.blood.pool(hp.x, hp.z, 0.5);
      }
    }
    this.eyes(b, false);
    if (b.mode === 'baked') this.rebake(b);
    else this.activate(b);
  }

  onShoved(id: number, x: number, z: number): void {
    const b = this.byId.get(id);
    if (!b || b.mode === 'gone') return;
    this.ensureLive(b);
    if (b.fall) {
      // Still falling: it lands at the new spot.
      if (b.fall.kind === 'collapse') {
        b.fall.x1 = x - PELVIS_X * Math.cos(b.fall.yaw1);
        b.fall.z1 = z + PELVIS_X * Math.sin(b.fall.yaw1);
      } else this.startFall(b, x + PELVIS_X, z, 'move', rand(0.3, 0.6), 0.5);
      return;
    }
    if (!b.rag && this.admit()) this.makeRagdoll(b);
    if (!b.rag || (b.rag.frozen && !this.admit())) {
      // Over budget: thrown as it lies.
      this.endJitter(b);
      b.rag?.dispose();
      b.rag = null;
      this.startFall(b, x + PELVIS_X, z, 'move', rand(0.35, 0.7), rand(0.45, 0.6));
      return;
    }
    const pel = b.rag.part('pelvis')?.body.position;
    const dx = pel ? x - pel.x : 0;
    const dz = pel ? z - pel.z : 0;
    b.rag.wake();
    b.rag.guide = { x: x + PELVIS_X, z };
    const l = Math.hypot(dx, dz) || 1;
    b.rag.kick((dx / l) * Math.min(5, 1.5 + l * 2.2), rand(2.5, 4.5), (dz / l) * Math.min(5, 1.5 + l * 2.2), undefined, 6);
    this.activate(b);
  }

  onIgnite(id: number): void {
    const b = this.byId.get(id);
    if (!b || b.mode === 'gone') return;
    this.ensureLive(b);
    b.burning = true;
    b.permanent = true;
    this.eyes(b, false);
    this.activate(b);
  }

  onExtinguish(id: number): void {
    const b = this.byId.get(id);
    if (!b) return;
    b.burning = false;
    this.maybeBake(b);
  }

  onGone(id: number, reason: GameEvents['corpseGone']['reason']): void {
    const ctx = this.ctx;
    const b = this.byId.get(id);
    if (!b || b.mode === 'gone') return;
    const w = ctx.world;
    const c = w?.corpseById(id);
    this.byId.delete(id);
    this.ensureLive(b);
    const pel = b.rig.bones.get('pelvis');
    const p = pel ? pel.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(c?.x ?? 0, 0.2, c?.z ?? 0);
    switch (reason) {
      case 'ash': {
        this.ashPile(p.x, p.z, b.massK);
        this.kill(b);
        break;
      }
      case 'sea': {
        b.id = null;
        const sz = Math.sign(c?.z ?? p.z) || 1;
        if (!b.rag && !b.fall) this.makeRagdoll(b);
        if (b.rag) {
          b.rag.wake();
          b.rag.guide = null;
          b.rag.kick(rand(-0.5, 0.5), 2.2, sz * 3.2, undefined, 5);
        } else {
          // Mid canned fall: over the edge and down.
          this.startFall(b, p.x, sz * 7.5, 'move', 0.6, 0.9, undefined, -3.2);
        }
        this.activate(b);
        break;
      }
      case 'gib':
      default: {
        const ex = this.lastExplosion && w && this.lastExplosion.tick === w.tick ? this.lastExplosion : null;
        if (ex && ex.kind === 'crates') {
          this.gore(p, b.kind, 0.8, 1);
          this.kill(b);
          break;
        }
        // Torn apart where it lies.
        b.rag?.dispose();
        b.rag = null;
        b.fall = null;
        this.endJitter(b);
        b.rig.root.updateMatrixWorld(true);
        const gibBones = new Set(Object.entries(b.rig.spec).filter(([, s]) => s.gib).map(([k]) => k));
        const bp = ex ? new THREE.Vector3(ex.x, 0, ex.z) : p.clone().setY(0);
        b.id = null;
        b.permanent = true;
        b.burning = false;
        this.eyes(b, false);
        this.gore(p, b.kind, 0.8, Math.sign(p.x - bp.x) || 1);
        if (this.admit()) {
          this.makeRagdoll(b, { detach: gibBones, detachSpeed: 4, blast: { point: bp, speed: 4.5 }, velocity: new THREE.Vector3(0, 1, 0) });
        } else {
          // Over budget: the limbs fly as pieces, the rest stays where it lies.
          this.canned++;
          this.flingLimbs(b, bp, 4.5);
          this.startFall(b, p.x + rand(-0.4, 0.4), p.z + rand(-0.3, 0.3), 'move', rand(0.3, 0.6), 0.45);
        }
        this.activate(b);
        break;
      }
    }
  }

  /** A nail hit a body on the deck. */
  onNail(id: number, point: V3): void {
    const b = this.byId.get(id);
    if (!b || b.mode === 'gone' || b.nails >= 16) return;
    b.nails++;
    const wasBaked = b.mode === 'baked';
    this.ensureLive(b);
    attachNail(b.rig, point);
    this.ctx.blood.spray(point, 6, { dirX: -1, speed: [0.5, 2], up: [0.5, 1.5], spread: 1 });
    if (wasBaked) this.maybeBake(b);
  }

  // ================================================================== internals

  private activate(b: Body): void {
    if (!this.active.includes(b)) this.active.push(b);
  }

  private removeActive(b: Body): void {
    const i = this.active.indexOf(b);
    if (i >= 0) this.active.splice(i, 1);
  }

  /** Make sure the body's rig is in the scene (un-bake it). */
  private ensureLive(b: Body): void {
    if (b.mode !== 'baked' || !b.bake) return;
    b.soaked = Math.max(b.soaked, this.ctx.corpses.unbake(b.bake));
    b.bake = null;
    b.mode = 'live';
    this.ctx.root.add(b.rig.root);
    if (b.charred > 0) b.rig.setCharred(b.charred);
    this.ensureSkin(b);
  }

  private bake(b: Body): void {
    if (b.mode !== 'live') return;
    // Dead for good: the body goes dark and drab (it recedes into the deck);
    // a body that will rise keeps its colours (and its glowing eyes).
    const tint = b.charred > 0 ? charredTint(b.charred) : b.permanent ? DEAD_TINT : undefined;
    this.endJitter(b);
    this.dropSkin(b);
    const head = b.rig.bones.get(b.rig.head);
    b.headAt = head && head.visible ? head.getWorldPosition(b.headAt ?? new THREE.Vector3()) : null;
    if (b.charred > 0) b.rig.setCharred(0);
    b.bake = this.ctx.corpses.bake(b.rig.root, tint);
    this.ctx.corpses.setBlood(b.bake, b.soaked);
    b.mode = 'baked';
    this.removeActive(b);
    if (b.id === null) {
      // Remains the logic doesn't track: nothing will ever move them again.
      b.mode = 'gone';
    }
  }

  private rebake(b: Body): void {
    this.ensureLive(b);
    this.maybeBake(b);
  }

  private maybeBake(b: Body): void {
    if (b.mode !== 'live') return;
    if (b.burning || b.twitch > 0 || b.kebab || b.sinking || b.fall) return;
    if (b.rag && (!b.rag.frozen || b.rag.pinned)) return;
    if (b.rag && !b.rag.grounded()) {
      // Never bake a body hanging in the air: let it drop to the planks first.
      b.rag.wake();
      this.activate(b);
      return;
    }
    this.bake(b);
  }

  private onSettled(b: Body): void {
    const ctx = this.ctx;
    if (!b.pooled && !b.sinking) {
      b.pooled = true;
      const pel = b.rig.bones.get('pelvis');
      const c = b.rag ? b.rag.centre(_v) : pel ? pel.getWorldPosition(_v) : _v.copy(b.rig.root.position);
      if (c.y > -1 && ctx.env.isOnDeck(c.x, c.z)) {
        const r = Math.min(1.6, 0.4 + 0.25 * b.massK);
        ctx.blood.pool(c.x, c.z, r);
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = r * (0.6 + Math.random() * 1.1);
          ctx.blood.splat('drop', c.x + Math.cos(a) * d, c.z + Math.sin(a) * d * 0.8, 0.03 + Math.random() * 0.05);
        }
      }
    }
    this.maybeBake(b);
  }

  /** Remove the body for good. */
  private kill(b: Body): void {
    if (b.mode === 'baked' && b.bake) this.ctx.corpses.unbake(b.bake);
    b.bake = null;
    b.rag?.dispose();
    b.rag = null;
    b.fall = null;
    b.jitter = null;
    b.pending = null;
    this.dropSkin(b);
    b.rig.root.removeFromParent();
    b.mode = 'gone';
    this.removeActive(b);
    if (b.id !== null) this.byId.delete(b.id);
  }

  private ashPile(x: number, z: number, k: number): void {
    const ctx = this.ctx;
    const m = new THREE.Mesh(ashGeometry(), MATERIALS.cloth);
    m.userData.matClass = 'cloth';
    const s = 0.5 * Math.sqrt(k);
    m.position.set(x, 0.0, z);
    m.scale.set(s * rand(0.9, 1.2), s, s * rand(0.9, 1.2));
    m.rotation.y = Math.random() * Math.PI;
    ctx.root.add(m);
    ctx.corpses.bake(m);
    ctx.blood.splat('soot', x, z, 0.9 * Math.sqrt(k));
    ctx.blood.splat('scorch', x, z, 0.55 * Math.sqrt(k));
    for (let i = 0; i < 5; i++) smoke(ctx.effects, x + rand(-0.4, 0.4), 0.2, z + rand(-0.3, 0.3), 0.8, 0x4a4542, 0.5);
    for (let i = 0; i < 8; i++) ember(ctx.effects, x + rand(-0.4, 0.4), 0.1, z + rand(-0.3, 0.3), 0.6);
    ctx.effects.snowPuff({ x, y: 0, z }, 4, 0.35, 1.2);
  }

  // ================================================================== frame

  update(dt: number, muzzleOf: (playerId: number) => THREE.Vector3 | null): void {
    const ctx = this.ctx;
    if (this.pendingKebab.size) {
      // No harpoon event arrived (should not happen): let them fall.
      this.pendingKebab.clear();
    }
    this.updateKebabs(dt, muzzleOf);
    // Ragdolls held back by last frame's share start now (the oldest first;
    // one kept waiting too long falls the canned way instead).
    for (let i = 0; i < this.queue.length; i++) {
      const b = this.queue[i];
      const opts = b.pending;
      if (!opts || b.rag || b.fall || b.mode !== 'live') {
        b.pending = null;
        this.queue.splice(i--, 1);
        continue;
      }
      if (this.madeThisFrame < this.newPerFrame) {
        this.madeThisFrame++;
        b.pending = null;
        this.queue.splice(i--, 1);
        this.startRagdoll(b, opts);
      } else if (++b.waited > 4) {
        b.pending = null;
        this.queue.splice(i--, 1);
        this.canned++;
        const pel = b.rig.bones.get('pelvis');
        const pp = pel ? pel.getWorldPosition(_v) : _v.copy(b.rig.root.position);
        this.startFall(b, opts.guide?.x ?? pp.x, opts.guide?.z ?? pp.z, 'collapse', 0.15, 0.55);
      }
    }
    // Over budget (woken bodies): retire the oldest that already lie still.
    const n = this.ragdolls;
    if (n > this.cap) this.retire(n - this.cap);
    this.undeadTells(dt);
    const list = this.active;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (b.mode === 'gone') {
        list.splice(i, 1);
        continue;
      }
      if (b.pending) continue;
      const rag = b.rag;
      if (rag && !rag.frozen) {
        rag.sync(dt);
        // Sliding bodies smear blood.
        if (!rag.frozen && rag.speed > 1.4 && Math.random() < 0.5) {
          const c = rag.centre(_v);
          if (c.y < 1 && c.y > -0.3 && ctx.env.isOnDeck(c.x, c.z)) ctx.blood.splat('smear', c.x, c.z, 0.16, { angle: Math.atan2(rag.parts[0].body.velocity.z, rag.parts[0].body.velocity.x), stretch: 2 });
        }
      }
      // Canned falls (over the ragdoll budget).
      const f = b.fall;
      if (f && dt > 0 && this.stepFall(b, f, dt)) {
        b.fall = null;
        if (f.y1 < 0) {
          // Into the sea.
          const r = b.rig.root.position;
          ctx.effects.splash({ x: r.x, y: -2.5, z: r.z }, Math.min(1.4, 0.35 + b.massK * 0.5));
          this.kill(b);
          continue;
        }
        this.onSettled(b);
      }
      // Blob shadow (low quality) under a body that is still moving.
      if (ctx.blobs.enabled && b.mode === 'live' && !b.sinking) {
        const pel = rag && !rag.frozen ? rag.centre(_v2) : b.fall ? b.rig.root.position : null;
        if (pel && pel.y > -0.5) ctx.blobs.push(pel.x, pel.z, 0.55 * b.massK ** 0.33, 0.35 * b.massK ** 0.33, clamp(1 - pel.y * 0.5, 0.2, 1));
      }
      // Twitching: the dead jerk before they rise.
      if (b.twitch > 0) {
        b.twitch -= dt;
        b.jolt -= dt;
        if (b.jolt <= 0 && dt > 0) {
          const prog = 1 - b.twitch / 2.2;
          b.jolt = rand(0.1, 0.3) * (1 - 0.35 * prog);
          const physical = rag && !rag.pinned && (!rag.frozen || this.admit(false, false));
          if (physical && rag) {
            rag.wake(true);
            const s = 2.2 + 2 * prog;
            for (let j = 0; j < 2; j++) {
              const limb = TWITCH_LIMBS[(Math.random() * TWITCH_LIMBS.length) | 0];
              rag.kick(rand(-1, 1) * s * 0.5, rand(1.4, 2.6) * s, rand(-1, 1) * s * 0.45, limb, 12);
            }
            // The back arches, the head snaps.
            if (Math.random() < 0.45 + 0.3 * prog) rag.kick(0, rand(1.8, 3.2), 0, 'chest', 4);
            if (Math.random() < 0.4) rag.kick(rand(-1, 1), rand(1.5, 3), rand(-1, 1), b.rig.head, 14);
          } else if (!b.fall) this.jolt(b, 0.5 + 0.6 * prog);
          if (Math.random() < 0.3) {
            const ch = b.rig.bones.get('chest');
            if (ch) ctx.blood.spray(ch.getWorldPosition(_v), 6, { dirX: 0, speed: [0.3, 1.4], up: [1, 2.8], spread: Math.PI });
          }
        }
        if (b.jitter && dt > 0) this.stepJitter(b, dt);
        if (b.twitch <= 0) {
          b.twitch = 0;
          this.endJitter(b);
          this.maybeBake(b);
        }
      }
      // Burning bodies.
      if (b.burning) this.burnFx(b, dt);
      // Neck fountains.
      if (b.fountain > 0) {
        b.fountain -= dt;
        const neck = b.rig.bones.get('chest');
        if (neck && Math.random() < 0.8) {
          const head = b.rig.bones.get(b.rig.head);
          const p = (head ?? neck).getWorldPosition(_v);
          ctx.blood.spray({ x: p.x, y: p.y, z: p.z }, 2.5 * Math.min(1, b.fountain), { dirX: 0.3, speed: [0.3, 1.8], up: [1.5, 4.5], spread: Math.PI, size: [0.02, 0.05] });
        }
      }
      // Sinking into the sea.
      if (b.sinking) {
        b.sinkT += dt;
        if (b.sinkT > 2.8) {
          this.kill(b);
          continue;
        }
      }
      if (b.mode === 'live' && rag && rag.frozen) this.maybeBake(b);
      else if (b.mode === 'live' && !rag && !b.burning && !b.fall) this.bakeOrphanless(b);
    }
    this.madeThisFrame = 0;
  }

  // ================================================================== canned twitch

  /** One canned jolt: the limbs, chest and head jerk around their lying pose. */
  private jolt(b: Body, k: number): void {
    let j = b.jitter;
    if (!j) {
      j = { bones: [], base: [], kick: [] };
      for (const name of [...TWITCH_LIMBS, 'chest', b.rig.head]) {
        const bone = b.rig.bones.get(name);
        if (!bone) continue;
        j.bones.push(bone);
        j.base.push(bone.quaternion.clone());
        j.kick.push(new THREE.Vector3());
      }
      b.jitter = j;
    }
    for (let i = 0; i < j.bones.length; i++) {
      if (Math.random() < 0.45) j.kick[i].set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.55 * k);
    }
  }

  private stepJitter(b: Body, dt: number): void {
    const j = b.jitter!;
    const decay = Math.exp(-dt * 7);
    for (let i = 0; i < j.bones.length; i++) {
      const kk = j.kick[i];
      kk.multiplyScalar(decay);
      j.bones[i].quaternion.copy(j.base[i]).multiply(_q.setFromEuler(_e.set(kk.x, kk.y, kk.z)));
    }
  }

  /** Put the jerking bones back where they were. */
  private endJitter(b: Body): void {
    const j = b.jitter;
    if (!j) return;
    for (let i = 0; i < j.bones.length; i++) j.bones[i].quaternion.copy(j.base[i]);
    b.jitter = null;
  }

  /**
   * The tell of a body that will get up again: pale green eyes and a sickly
   * green glow that swells (and breathes faster) as the rise approaches, with
   * a wisp of green mist now and then. Bodies dead for good show nothing.
   */
  private undeadTells(dt: number): void {
    const ctx = this.ctx;
    const w = ctx.world;
    if (!w) return;
    const halos = ctx.halos;
    const t = ctx.time;
    for (const c of w.corpses) {
      if (c.risesAt === null || c.removed) continue;
      const b = this.byId.get(c.id);
      if (!b || b.permanent || b.mode === 'gone' || b.sinking) continue;
      let hp: THREE.Vector3 | null;
      if (b.mode === 'baked') hp = b.headAt;
      else {
        const head = b.rig.bones.get(b.rig.head);
        hp = head && head.visible ? head.getWorldPosition(_v2) : null;
      }
      const remain = (c.risesAt - w.tick) * TICK;
      const span = b.riseSpan > 0 ? b.riseSpan * TICK : 12;
      // 0.2 just after death → 1 when it starts twitching (2 s before it gets up).
      const k = clamp(1 - (remain - 2) / Math.max(1, span - 2), 0.2, 1);
      const pulse = c.twitching ? 0.7 + 0.3 * Math.sin(t * 18 + b.seed) : 0.72 + 0.28 * Math.sin(t * (1.6 + 4 * k) + b.seed);
      const cx = c.x;
      const cz = c.z;
      // Glow over the body.
      halos.push(cx, 0.25, cz, UNDEAD_GLOW, (0.6 + 0.9 * k) * pulse, 1.1 + 0.6 * k, 0.9);
      if (hp) halos.push(hp.x, hp.y + 0.04, hp.z, UNDEAD_EYE, 1.4 + 0.8 * k, 0.22, 0.7);
      // Mist rising off it, more as the rise comes.
      if (Math.random() < dt * (0.6 + 4 * k) * ctx.effects.density) {
        ctx.effects.emit(true, cx + rand(-0.4, 0.5), 0.15, cz + rand(-0.25, 0.25), {
          vel: [rand(-0.1, 0.1), rand(0.25, 0.55), 0],
          drag: 0.6,
          size: [0.25, 0.7],
          life: rand(1.2, 2),
          color: UNDEAD_MIST,
          alpha: [0.05 + 0.09 * k, 0],
          frame: F.Mist,
          vr: rand(-0.5, 0.5),
        });
      }
    }
  }

  private bakeOrphanless(b: Body): void {
    if (b.twitch > 0) return;
    this.bake(b);
  }

  private burnFx(b: Body, dt: number): void {
    const ctx = this.ctx;
    const fx = ctx.effects;
    b.charred = Math.min(1, b.charred + dt / 4.5);
    b.rig.setCharred(b.charred);
    const rate = 48 * fx.density * Math.sqrt(b.massK);
    let n = rate * dt;
    const names = ['chest', 'pelvis', 'head', 'thighL', 'thighR', 'upperArmL', 'upperArmR'];
    while (n > 0) {
      if (n < 1 && Math.random() > n) break;
      n -= 1;
      const bone = b.rig.bones.get(names[(Math.random() * names.length) | 0]);
      if (!bone) continue;
      bone.getWorldPosition(_v);
      flame(fx, _v.x + rand(-0.15, 0.15), Math.max(0.05, _v.y), _v.z + rand(-0.12, 0.12), rand(1.1, 1.8) * Math.sqrt(b.massK), Math.random() < 0.25);
    }
    if (Math.random() < dt * 4) {
      const ch = b.rig.bones.get('chest');
      if (ch) {
        ch.getWorldPosition(_v);
        smoke(fx, _v.x, _v.y + 0.3, _v.z, 1.1);
      }
    }
    if (Math.random() < dt * 5) {
      const ch = b.rig.bones.get('pelvis');
      if (ch) {
        ch.getWorldPosition(_v);
        ember(fx, _v.x, _v.y + 0.2, _v.z);
      }
    }
    const pel = b.rig.bones.get('pelvis');
    if (pel) {
      pel.getWorldPosition(_v);
      const fl = 0.75 + 0.2 * Math.sin(ctx.time * 19 + b.seed) + 0.12 * Math.sin(ctx.time * 37.7 + b.seed * 2);
      ctx.lights.add(_v.x, 0.8, _v.z + 0.3, 0xff7020, 9 * fl, 6.5, 0.9);
    }
  }
}

/**
 * Hide a bone and everything under it (head destroyed, limb torn off as gore):
 * collapsed for the skinned stand-in, invisible for the per-bone meshes and
 * the corpse bake.
 */
function hideBone(bone: THREE.Object3D, list: THREE.Object3D[]): void {
  bone.visible = false;
  bone.scale.setScalar(1e-3);
  if (!list.includes(bone)) list.push(bone);
}

function isUnder(o: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === ancestor) return true;
  return false;
}
