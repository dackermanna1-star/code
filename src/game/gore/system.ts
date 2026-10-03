/**
 * GoreSystem (`game.gore`): blood, wounds and dismemberment.
 *
 *  entityHurt  -> typed wound on the rig (bruise / slash / puncture / burn, max 8 per entity, fed
 *                 to the entity material uniforms), blood spray directed along the hit, blood
 *                 splats on nearby block surfaces (decals), bleeding wounds keep dripping.
 *  entityDeath -> bigger burst, blood pool growing under the corpse; the RagdollSystem asks
 *                 `planDismember` before it builds the ragdoll and calls `detach` afterwards:
 *                 sharp killing blows / explosions take limbs or the head off, which become
 *                 their own Rapier bodies (mesh clones) with red stump caps and a blood spurt.
 *  bloodSplat  -> (particle droplet landed) small decal.
 *
 * Everything degrades gracefully: no Rapier -> no detached parts (blood/wounds still work);
 * no renderer/GL -> no decals; `settings.blood === false` -> only burns are drawn.
 */
import * as THREE from 'three';
import type { Game } from '../game';
import type { GameSystem } from '../systems';
import type { World } from '../../world/world';
import type { Entity, DamageSource } from '../../entity/entity';
import type { Rig } from '../../entity/models/rig';
import { createEntityMaterial, setEntityLight } from '../../render/entityMaterial';
import { PT } from '../../render/particles/defs';
import type { ParticleSystem } from '../../render/particles/system';
import { GROUP, type PhysBody, type PhysicsWorld } from '../../physics/rapierWorld';
import { boneMasses, classifyBone, subtreeNames, type Ragdoll, type RagdollBone } from '../../physics/ragdoll';
import { raycastBlocks } from '../interaction';
import { BloodDecals, DecalKind } from './decals';
import { bloodFor, type BloodProfile } from './blood';
import { WoundSet, classifyDamage, decideDismember, severityOf, type WoundType } from './wounds';

const rnd = Math.random;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
/** Face index (Dir order DOWN UP NORTH SOUTH WEST EAST) -> normal. */
const FACE_N: [number, number, number][] = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];

interface LastHurt {
  amount: number;
  overkill: number;
  src: DamageSource;
  bone: string | null;
}

interface Spurt {
  obj: THREE.Object3D;
  dir: THREE.Vector3;
  t: number;
  ttl: number;
  rate: number;
  speed: number;
  acc: number;
  color: [number, number, number];
}

interface Part {
  group: THREE.Group;
  body: PhysBody;
  /** body centre in the group's local (rest) space */
  center: THREE.Vector3;
  baseScale: THREE.Vector3;
  age: number;
  life: number;
  mats: THREE.RawShaderMaterial[];
  lightT: number;
}

interface PendingPool {
  entity: Entity;
  t: number;
  size: number;
  color: [number, number, number];
}

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tmpM2 = new THREE.Matrix4();
const CAP_GEO = new THREE.BoxGeometry(1, 1, 1);

export class GoreSystem implements GameSystem {
  readonly name = 'gore';
  decals: BloodDecals | null = null;
  /** Scene of detached parts (G-buffer + shadow pass). */
  readonly scene = new THREE.Scene();
  readonly wounds = new WeakMap<Entity, WoundSet>();
  readonly parts: Part[] = [];
  /** Caps (detached parts, wound sets, spurts) */
  maxParts = 24;
  private game!: Game;
  private readonly last = new WeakMap<Entity, LastHurt>();
  private readonly bleeders = new Set<Entity>();
  private readonly spurts: Spurt[] = [];
  private readonly pools: PendingPool[] = [];
  private splatBudget = 0;
  private syncT = 0;

  // ------------------------------------------------------------------------------- setup
  init(game: Game) {
    this.game = game;
    game.gore = this;
    const low = game.settings.quality === 'low';
    try {
      const r: any = game.renderer;
      if (r?.lightUniforms && r?.shadowUniforms) {
        const lu = r.lightUniforms, su = r.shadowUniforms;
        this.decals = new BloodDecals({
          ...su,
          u_cameraPos: lu.u_cameraPos, u_lightDir: lu.u_lightDir, u_lightColor: lu.u_lightColor, u_sh: lu.u_sh,
          u_skyLightScale: lu.u_skyLightScale, u_dimAmbient: lu.u_dimAmbient, u_minAmbient: lu.u_minAmbient,
        }, low ? 100 : 200);
        (game.renderExtras.forward ??= []).push(this.decalScene);
        this.decalScene.add(this.decals.mesh);
      }
    } catch (e) {
      console.warn('blood decals unavailable', e);
      this.decals = null;
    }
    const ex = game.renderExtras;
    (ex.gbuffer ??= []).push(this.scene);
    (ex.shadow ??= []).push(this.scene);
    const safe = (fn: (e: any) => void) => (e: any) => {
      try { fn(e); } catch (err) { console.warn('gore event failed', err); }
    };
    game.events.on('entityHurt', safe(({ entity, source, amount }) => this.onHurt(entity, source, amount)));
    game.events.on('entityDeath', safe(({ entity, source }) => this.onDeath(entity, source)));
    game.events.on('bloodSplat', safe(({ x, y, z, color }) => this.onDroplet(x, y, z, color)));
    game.events.on('entityRemoved', ({ entity }: any) => this.bleeders.delete(entity));
  }

  private readonly decalScene = new THREE.Scene();

  private get blood(): boolean {
    return this.game.settings.blood !== false;
  }
  private get psys(): ParticleSystem | null {
    return (this.game.particles?.sys as ParticleSystem | undefined) ?? null;
  }

  onWorldChange(_game: Game, _world: World) {
    this.decals?.clear();
    this.pools.length = 0;
    this.bleeders.clear();
    this.spurts.length = 0;
    for (const p of [...this.parts]) this.removePart(p);
  }

  // ------------------------------------------------------------------------------- hurt
  private onHurt(entity: Entity, src: DamageSource, amount: number) {
    if (!src || amount <= 0) return;
    const living = entity as any;
    const rig: Rig | undefined = living.rig;
    const profile = bloodFor(entity);
    const cls = classifyDamage(src);
    const point = src.point ? src.point.clone() : new THREE.Vector3(entity.pos.x, entity.pos.y + entity.height * 0.6, entity.pos.z);
    const maxHealth = living.maxHealth ?? 20;
    const sev = cls ? severityOf(cls, amount, maxHealth) : 0;
    let boneName: string | null = null;
    // ---- typed wound on the rig
    if (cls && rig && (this.blood || cls === 'burn')) {
      const types: WoundType[] = src.explosion ? ['blunt', 'burn'] : [cls];
      for (const t of types) boneName = this.addWound(entity, rig, t, src, point, t === 'burn' && src.explosion ? Math.min(1, sev * 0.8) : sev) ?? boneName;
    }
    this.last.set(entity, { amount, overkill: Math.max(0, -(living.health ?? 0)), src, bone: boneName });
    if (!cls || cls === 'burn' || !this.blood || !profile.color) return;
    // ---- blood spray + splats
    const dir = src.dir && src.dir.lengthSq() > 1e-6 ? src.dir.clone().normalize() : null;
    const heavy = amount >= 5;
    let n = 0, speed = 3, spread = 0.9;
    switch (cls) {
      case 'cut': n = 6 + amount * 3; speed = 4.5; spread = 0.7; break;
      case 'pierce': n = 3 + amount * 1.6; speed = 5; spread = 0.25; break;
      default: n = src.type === 'fall' || sev < 0.5 ? 0 : 3 + amount * 1.5; speed = 2.5; spread = 1.1;
    }
    if (src.explosion) n = 10 + amount * 2;
    n = Math.min(40, n);
    if (n > 0) {
      this.spray(point, dir, n, speed, spread, profile.color, 0.8 + Math.min(0.7, amount * 0.08));
      if (cls === 'cut' && dir && heavy) this.spray(point, dir.clone().multiplyScalar(-1), 4, 2.5, 0.8, profile.color, 0.8);
      if (cls === 'pierce' && dir) this.spray(point, dir.clone().multiplyScalar(-1), 2, 1.5, 0.5, profile.color, 0.7);
      this.splatter(point, dir, Math.min(7, 1 + Math.floor(n / 6)), 2 + Math.min(2.5, amount * 0.25), 0.18 + Math.min(0.4, amount * 0.05), profile.color);
    }
  }

  /** Create/merge a wound; returns the name of the bone it landed on. */
  private addWound(entity: Entity, rig: Rig, type: WoundType, src: DamageSource, point: THREE.Vector3, severity: number): string | null {
    const local = new THREE.Vector3();
    const mesh = rig.locate(point, local);
    if (!mesh) return null;
    const dir = new THREE.Vector3(0, 1, 0);
    if (type === 'cut') {
      // swing direction: across the hit direction with a random diagonal tilt
      const h = src.dir && src.dir.lengthSq() > 1e-6 ? src.dir.clone().normalize() : new THREE.Vector3(0, 0, -1);
      const side = new THREE.Vector3().crossVectors(UP, h);
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      side.normalize();
      const a = (rnd() - 0.5) * 1.8;
      const up2 = new THREE.Vector3().crossVectors(h, side).normalize();
      const sw = side.multiplyScalar(Math.cos(a)).addScaledVector(up2, Math.sin(a));
      mesh.updateWorldMatrix(true, false);
      dir.copy(sw).transformDirection(tmpM.copy(mesh.matrixWorld).invert());
    }
    let set = this.wounds.get(entity);
    if (!set) this.wounds.set(entity, (set = new WoundSet()));
    set.add({ type, pos: local, dir, severity, anchor: mesh });
    this.bleeders.add(entity);
    this.syncWounds(entity);
    return mesh.name.split(':')[0];
  }

  private syncWounds(entity: Entity) {
    const rig: Rig | undefined = (entity as any).rig;
    const set = this.wounds.get(entity);
    if (!rig || !set) return;
    const arr = this.uniformScratch;
    const n = set.writeUniforms(arr.pos, arr.dir);
    rig.setWounds(arr.pos, arr.dir, n);
  }
  private readonly uniformScratch = {
    pos: Array.from({ length: 8 }, () => new THREE.Vector4()),
    dir: Array.from({ length: 8 }, () => new THREE.Vector4()),
  };

  // ------------------------------------------------------------------------------- blood particles / decals
  /** Blood droplets flying along `dir` (null = up). */
  spray(pt: THREE.Vector3, dir: THREE.Vector3 | null, count: number, speed: number, spread: number, color: [number, number, number], size = 1) {
    const sys = this.psys;
    if (!sys) return;
    const n = Math.max(1, Math.round(count * sys.density));
    for (let k = 0; k < n; k++) {
      const rx = rnd() * 2 - 1, ry = rnd() * 2 - 1, rz = rnd() * 2 - 1;
      const sp = speed * (0.5 + rnd() * 0.8);
      const vx = (dir ? dir.x * sp : 0) + rx * spread * speed * 0.5;
      const vy = (dir ? dir.y * sp : sp * 0.6) + ry * spread * speed * 0.4 + 1.2;
      const vz = (dir ? dir.z * sp : 0) + rz * spread * speed * 0.5;
      const i = sys.spawn(PT.blood, pt.x + rx * 0.05, pt.y + ry * 0.05, pt.z + rz * 0.05, vx, vy, vz);
      if (i < 0) break;
      const v = 0.8 + rnd() * 0.4;
      sys.tint(i, color[0] * v, color[1], color[2]);
      sys.lp.size[i] *= size * (0.7 + rnd() * 0.6);
    }
  }

  /** One drop of blood falling from `pt` (wound drips). */
  drip(pt: THREE.Vector3, vel: THREE.Vector3, color: [number, number, number]) {
    const sys = this.psys;
    if (!sys) return;
    const i = sys.spawn(PT.blood, pt.x, pt.y, pt.z, vel.x * 0.4 + (rnd() - 0.5) * 0.3, Math.min(0, vel.y * 0.3), vel.z * 0.4 + (rnd() - 0.5) * 0.3);
    if (i < 0) return;
    sys.tint(i, color[0] * (0.8 + rnd() * 0.4), color[1], color[2]);
    sys.lp.size[i] *= 0.8 + rnd() * 0.5;
  }

  /** Shoot rays from `from` (spread around `dir`) and leave splats where they hit blocks. */
  splatter(from: THREE.Vector3, dir: THREE.Vector3 | null, rays: number, maxDist: number, size: number, color: [number, number, number]) {
    if (!this.decals) return;
    const d = new THREE.Vector3();
    for (let k = 0; k < rays; k++) {
      if (dir) d.copy(dir).multiplyScalar(0.8).add(tmpV2.set(rnd() - 0.5, rnd() - 0.4, rnd() - 0.5).multiplyScalar(1.4));
      else d.set(rnd() - 0.5, rnd() - 0.6, rnd() - 0.5);
      // droplets fall: bias toward the ground
      d.y -= 0.35;
      if (d.lengthSq() < 1e-6) continue;
      d.normalize();
      const hit = raycastBlocks(this.game, from, d, maxDist);
      if (!hit || hit.face < 0) continue;
      const fall = 1 - hit.dist / (maxDist + 0.01);
      this.addSplat(hit.px, hit.py, hit.pz, FACE_N[hit.face], size * (0.45 + 0.7 * rnd()) * (0.5 + fall), color, hit.dist > 0.8 && FACE_N[hit.face][1] === 0 ? DecalKind.Streak : DecalKind.Splat);
    }
  }

  private addSplat(x: number, y: number, z: number, n: readonly number[], size: number, color: [number, number, number], kind: DecalKind = DecalKind.Splat, grow = 0, rot?: number) {
    const dec = this.decals;
    if (!dec || size < 0.04) return;
    const w = this.game.world;
    const L = w.getLight(Math.floor(x + n[0] * 0.5), Math.floor(y + n[1] * 0.5), Math.floor(z + n[2] * 0.5));
    // streaks run down walls
    const r = rot ?? (kind === DecalKind.Streak ? (Math.abs(n[1]) < 0.5 ? Math.PI / 2 : rnd() * 6.28) : rnd() * 6.28);
    dec.add({ x, y, z, nx: n[0], ny: n[1], nz: n[2], size, color, kind, rot: r, grow, light: L });
  }

  /** A blood droplet particle landed: small splat on the surface below. */
  private onDroplet(x: number, y: number, z: number, color: number[]) {
    if (!this.decals || !this.blood || this.splatBudget <= 0) return;
    this.splatBudget--;
    tmpV.set(x, y + 0.25, z);
    const hit = raycastBlocks(this.game, tmpV, DOWN, 0.6);
    if (!hit || hit.face !== 1) return;
    this.addSplat(hit.px, hit.py, hit.pz, FACE_N[1], 0.1 + rnd() * 0.22, [color[0], color[1], color[2]]);
  }

  // ------------------------------------------------------------------------------- death
  private onDeath(entity: Entity, src: DamageSource) {
    if (!this.blood) return;
    const profile = bloodFor(entity);
    if (!profile.color) return;
    const cls = src ? classifyDamage(src) : null;
    if (cls === 'burn' || (src?.type === 'drown')) return;
    const c = new THREE.Vector3(entity.pos.x, entity.pos.y + entity.height * 0.55, entity.pos.z);
    const dir = src?.dir && src.dir.lengthSq() > 1e-6 ? src.dir.clone().normalize() : null;
    this.spray(c, dir, 14 + entity.height * 8, 3.5, 0.9, profile.color, 1.1);
    this.splatter(c, dir, 6, 3, 0.45, profile.color);
    const size = Math.min(1.25, Math.max(0.45, entity.width * 1.1 + entity.height * 0.15));
    if (cls && cls !== 'blunt' || (this.last.get(entity)?.amount ?? 0) >= 4 || src?.explosion) {
      this.pools.push({ entity, t: 2.4, size, color: profile.color });
    }
  }

  // ------------------------------------------------------------------------------- dismemberment
  /** Bones (with subtrees) a killing blow should detach. Called by the RagdollSystem before the ragdoll is built. */
  planDismember(entity: Entity, src: DamageSource | null): string[] {
    const g = this.game;
    if (!src || !g.physics || !g.settings.ragdolls || !this.blood) return [];
    const rig: Rig | undefined = (entity as any).rig;
    if (!rig) return [];
    const profile = bloodFor(entity);
    if (!profile.color && !profile.dust) return [];
    const last = this.last.get(entity);
    const defs = rig.ragdoll as RagdollBone[];
    const names = decideDismember({
      type: classifyDamage(src),
      explosion: !!src.explosion,
      amount: last?.amount ?? 0,
      maxHealth: (entity as any).maxHealth ?? 20,
      overkill: last?.overkill ?? 0,
      crit: src.crit,
      weapon: src.weapon,
      hitBone: last?.bone ?? null,
      bones: defs.map((d) => ({ name: d.name, parent: d.parent, part: classifyBone(d.name) })),
    });
    // keep at least the torso (root) and never detach a bone that has no mesh
    return names.filter((n) => rig.has(n) && rig.bones.get(n)!.parent);
  }

  /** Detach the planned bones as physical parts. The ragdoll was built without them. */
  detach(entity: Entity, names: string[], src: DamageSource | null, _rd: Ragdoll) {
    const g = this.game;
    const pw = g.physics as PhysicsWorld | null;
    const rig: Rig | undefined = (entity as any).rig;
    if (!pw || !rig) return;
    const profile = bloodFor(entity);
    const explosion = !!src?.explosion;
    rig.root.updateMatrixWorld(true);
    const masses = boneMasses(rig.ragdoll as RagdollBone[], (entity as any).mass ?? 60);
    const color = profile.color ?? [0.5, 0.45, 0.36];
    const last = this.last.get(entity);
    const amount = last?.amount ?? 6;
    for (const name of names) {
      const part = this.makePart(pw, entity, rig, name, masses, color, profile);
      if (!part) continue;
      // launch: along the blow (sharp) or away from the blast
      const v = tmpV.set(entity.vel.x, entity.vel.y, entity.vel.z);
      const out = new THREE.Vector3();
      if (explosion && src?.point) out.copy(part.group.position).sub(src.point).setY(0.6).normalize();
      else if (src?.dir) out.copy(src.dir).normalize();
      else out.set(rnd() - 0.5, 0.3, rnd() - 0.5).normalize();
      const k = explosion ? 5 + rnd() * 6 : 2 + Math.min(4, amount * 0.3) * (0.7 + rnd() * 0.6);
      v.addScaledVector(out, k);
      v.y += explosion ? 3 + rnd() * 4 : 1.5 + rnd() * 1.5;
      part.body.rb.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
      part.body.rb.setAngvel({ x: (rnd() - 0.5) * 12, y: (rnd() - 0.5) * 12, z: (rnd() - 0.5) * 12 }, true);
      const wp = part.group.position;
      if (profile.color) {
        this.spray(wp, out, 18, 4, 0.8, profile.color, 1.2);
        this.splatter(wp, out, explosion ? 5 : 4, 3.2, 0.5, profile.color);
      }
    }
    if (explosion && profile.color) {
      const c = new THREE.Vector3(entity.pos.x, entity.pos.y + entity.height * 0.5, entity.pos.z);
      this.spray(c, null, 40, 6, 1.4, profile.color, 1.2);
      this.splatter(c, null, 10, 4, 0.6, profile.color);
    }
    // keep the cap on the cap list from growing without bound
    while (this.parts.length > this.maxParts) this.removePart(this.parts[0]);
  }

  private makePart(pw: PhysicsWorld, entity: Entity, rig: Rig, name: string, masses: Map<string, number>, color: [number, number, number], profile: BloodProfile): Part | null {
    const rb = rig.bones.get(name);
    if (!rb) return null;
    const sub = subtreeNames(rig.ragdoll, name);
    // frame of the detached part = the bone body's frame at death
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), scl = new THREE.Vector3();
    rb.obj.matrixWorld.decompose(pos, q, scl);
    const group = new THREE.Group();
    group.position.copy(pos);
    group.quaternion.copy(q);
    group.scale.copy(scl);
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    // bounds of the whole subtree in the part frame (rest units)
    const box = new THREE.Box3();
    for (const n of sub) {
      const b = rig.bones.get(n)!;
      for (let i = 0; i < 8; i++) {
        tmpV.set(i & 1 ? b.size[0] / 2 : -b.size[0] / 2, i & 2 ? b.size[1] / 2 : -b.size[1] / 2, i & 4 ? b.size[2] / 2 : -b.size[2] / 2);
        tmpV.applyMatrix4(b.obj.matrixWorld).applyMatrix4(inv);
        box.expandByPoint(tmpV);
      }
    }
    if (box.isEmpty()) return null;
    // mesh clones with their own (cheap) material instances
    const matMap = new Map<THREE.RawShaderMaterial, THREE.RawShaderMaterial>();
    for (const mesh of rig.meshes) {
      if (!sub.has(mesh.name.split(':')[0])) continue;
      const src = mesh.material as THREE.RawShaderMaterial;
      let m = matMap.get(src);
      if (!m) {
        m = src.clone();
        for (const k in src.uniforms) if ((src.uniforms[k].value as any)?.isTexture) m.uniforms[k].value = src.uniforms[k].value;
        m.uniforms.u_viewInvRot = src.uniforms.u_viewInvRot;
        m.uniforms.u_hurt.value = 0;
        matMap.set(src, m);
      }
      const clone = new THREE.Mesh(mesh.geometry, m);
      tmpM.copy(inv).multiply(mesh.matrixWorld).decompose(clone.position, clone.quaternion, clone.scale);
      clone.userData = { ...mesh.userData };
      clone.castShadow = mesh.castShadow;
      group.add(clone);
    }
    if (!group.children.length) return null;
    // ---- stump caps (part end + body stump) and spurts
    const capMat = createEntityMaterial({ roughness: 0.3, sss: 0.6, bloodType: profile.shaderType });
    const flesh: [number, number, number] = profile.color ? [Math.min(1, color[0] * 1.9 + 0.05), color[1] * 2 + 0.005, color[2] * 2 + 0.005] : [0.62, 0.58, 0.48];
    if (profile.shaderType === 2) { flesh[0] = color[0] * 1.2; flesh[1] = color[1] * 1.3; flesh[2] = color[2] * 1.2; }
    capMat.uniforms.u_color.value.setRGB(flesh[0], flesh[1], flesh[2]);
    capMat.uniforms.u_light.value.copy(rig.slots.main.uniforms.u_light.value);
    if (!profile.color) capMat.uniforms.u_roughness.value = 0.85;
    const off = new THREE.Vector3(rb.pivot[0] - rb.center[0], rb.pivot[1] - rb.center[1], rb.pivot[2] - rb.center[2]);
    let ax = 1, best = -1;
    for (let i = 0; i < 3; i++) {
      const rel = Math.abs(off.getComponent(i)) / Math.max(1e-3, rb.size[i]);
      if (rel > best) { best = rel; ax = i; }
    }
    const sign = off.getComponent(ax) >= 0 ? 1 : -1;
    const thick = 0.03;
    const dims = new THREE.Vector3(rb.size[0] * 0.96, rb.size[1] * 0.96, rb.size[2] * 0.96);
    dims.setComponent(ax, thick);
    const axisV = new THREE.Vector3().setComponent(ax, sign);
    const capLocal = axisV.clone().multiplyScalar(rb.size[ax] / 2);
    const partCap = new THREE.Mesh(CAP_GEO, capMat);
    partCap.position.copy(capLocal);
    partCap.scale.copy(dims);
    group.add(partCap);
    const parentBone = rb.parent;
    if (parentBone) {
      const stump = new THREE.Mesh(CAP_GEO, capMat);
      // same world pose as the cap on the part, hung on the parent bone so ragdoll pose drives it
      tmpM.compose(capLocal, new THREE.Quaternion(), dims).premultiply(group.matrixWorld);
      tmpM2.copy(parentBone.obj.matrixWorld).invert().multiply(tmpM);
      tmpM2.decompose(stump.position, stump.quaternion, stump.scale);
      parentBone.obj.add(stump);
      stump.updateMatrixWorld(true);
      stump.userData.stump = true;
      rb.joint.visible = false;
      if (profile.color) this.spurts.push({ obj: stump, dir: axisV.clone().multiplyScalar(-1), t: 0, ttl: 3 + rnd() * 1.5, rate: 55, speed: 3.2, acc: 0, color: profile.color });
    } else rb.joint.visible = false;
    if (profile.color) this.spurts.push({ obj: partCap, dir: axisV.clone(), t: 0, ttl: 1.6, rate: 25, speed: 1.8, acc: 0, color: profile.color });
    // ---- physics body around the subtree bounds
    const center = box.getCenter(new THREE.Vector3());
    const half: [number, number, number] = [
      Math.max(0.04, (box.max.x - box.min.x) * scl.x * 0.45), Math.max(0.04, (box.max.y - box.min.y) * scl.y * 0.45), Math.max(0.04, (box.max.z - box.min.z) * scl.z * 0.45),
    ];
    let mass = 0;
    for (const n of sub) mass += masses.get(n) ?? 1;
    const wc = center.clone().multiply(scl).applyQuaternion(q).add(pos);
    const body = pw.addBody({
      kind: 'debris', position: wc, rotation: q, shape: { type: 'box', half }, mass: Math.max(0.5, mass),
      friction: 0.9, restitution: 0.08, group: GROUP.DEBRIS, filter: GROUP.TERRAIN,
      linearDamping: 0.15, angularDamping: 1.1, solverIterations: 2, impacts: true,
    });
    body.userData.sound = 'wool';
    const part: Part = { group, body, center, baseScale: scl.clone(), age: 0, life: 35 + rnd() * 20, mats: [...matMap.values(), capMat], lightT: 0 };
    this.scene.add(group);
    this.parts.push(part);
    this.placePart(part, 1);
    return part;
  }

  private placePart(p: Part, alpha: number) {
    p.body.interpolate(alpha, tmpV, tmpQ);
    const k = p.life - p.age < 2 ? Math.max(0.001, (p.life - p.age) / 2) : 1;
    p.group.scale.copy(p.baseScale).multiplyScalar(k);
    // body centre -> group origin
    tmpV2.copy(p.center).multiply(p.group.scale).applyQuaternion(tmpQ);
    p.group.position.copy(tmpV).sub(tmpV2);
    p.group.quaternion.copy(tmpQ);
  }

  private removePart(p: Part) {
    const i = this.parts.indexOf(p);
    if (i >= 0) this.parts.splice(i, 1);
    const pw = this.game.physics as PhysicsWorld | null;
    if (pw && !p.body.removed) pw.removeBody(p.body);
    p.group.removeFromParent();
    for (const m of p.mats) m.dispose();
  }

  // ------------------------------------------------------------------------------- per-tick / per-frame
  tick(game: Game) {
    this.splatBudget = 10;
    if (!this.bleeders.size) return;
    const dt = 0.05;
    for (const e of this.bleeders) {
      const set = this.wounds.get(e);
      if (!set || e.removed) { this.bleeders.delete(e); continue; }
      set.tick(dt);
      let oldest = 0;
      const profile = set.bleeding ? bloodFor(e) : null;
      for (const w of set.list) {
        oldest = Math.max(oldest, w.age);
        if (w.bleed <= 0 || !profile?.color || !w.anchor || !this.blood) continue;
        if (rnd() > (2.2 + 6 * w.severity) * dt * (0.4 + 0.6 * Math.min(1, w.bleed))) continue;
        tmpV.set(w.x, w.y, w.z);
        w.anchor.localToWorld(tmpV);
        tmpV2.set(e.vel.x, e.vel.y, e.vel.z);
        this.drip(tmpV, tmpV2, profile.color);
      }
      if (oldest > 70 && !set.bleeding) this.bleeders.delete(e);
    }
    void game;
  }

  update(game: Game, dt: number, alpha: number) {
    if (game.paused) dt = 0;
    this.decals?.update(dt);
    // growing bruises / drying wounds
    this.syncT += dt;
    if (this.syncT > 0.5) {
      this.syncT = 0;
      for (const e of this.bleeders) this.syncWounds(e);
    }
    // pools under corpses
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const p = this.pools[i];
      p.t -= dt;
      if (p.t > 0) continue;
      this.pools.splice(i, 1);
      this.spawnPool(p);
    }
    // blood spurting from stumps
    for (let i = this.spurts.length - 1; i >= 0; i--) {
      const s = this.spurts[i];
      s.t += dt;
      if (s.t >= s.ttl) { this.spurts.splice(i, 1); continue; }
      const sys = this.psys;
      if (!sys || !this.blood) continue;
      const f = 1 - s.t / s.ttl;
      const pulse = 0.55 + 0.45 * Math.max(0, Math.sin(s.t * 9));
      s.acc += s.rate * f * dt * sys.density;
      if (s.acc < 1) continue;
      s.obj.getWorldPosition(tmpV);
      s.obj.getWorldQuaternion(tmpQ);
      tmpV2.copy(s.dir).applyQuaternion(tmpQ);
      while (s.acc >= 1) {
        s.acc -= 1;
        const sp = s.speed * (0.6 + rnd() * 0.7) * (0.4 + f * 0.6) * (0.5 + pulse);
        const j = sys.spawn(PT.blood, tmpV.x, tmpV.y, tmpV.z, tmpV2.x * sp + (rnd() - 0.5) * 0.9, tmpV2.y * sp + (rnd() - 0.5) * 0.9 + 0.8, tmpV2.z * sp + (rnd() - 0.5) * 0.9);
        if (j < 0) break;
        sys.tint(j, s.color[0] * (0.8 + rnd() * 0.4), s.color[1], s.color[2]);
      }
    }
    // detached parts follow their bodies
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life || p.body.removed) { this.removePart(p); continue; }
      this.placePart(p, alpha);
      p.lightT += dt;
      if (p.lightT > 0.5) {
        p.lightT = 0;
        const bp = p.body.pos;
        const L = game.world.getLight(Math.floor(bp.x), Math.floor(bp.y + 0.3), Math.floor(bp.z));
        for (const m of p.mats) setEntityLight(m, L);
      }
    }
  }

  private spawnPool(p: PendingPool) {
    if (!this.decals || !this.blood) return;
    const e = p.entity;
    const rd = (this.game as any).ragdolls?.active ? [...(this.game as any).ragdolls.active].find((r: Ragdoll) => r.entity === e) as Ragdoll | undefined : undefined;
    const c = rd && !rd.removed ? rd.root.body.pos : e.pos;
    tmpV.set(c.x, c.y + 0.4, c.z);
    const hit = raycastBlocks(this.game, tmpV, DOWN, 2.5);
    if (!hit || hit.face !== 1) return;
    this.addSplat(hit.px, hit.py, hit.pz, FACE_N[1], p.size * 2, p.color, DecalKind.Pool, 9);
  }

  dispose() {
    this.decals?.dispose();
    for (const p of [...this.parts]) this.removePart(p);
  }
}
