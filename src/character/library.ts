import * as THREE from 'three';
import { BodySpec, buildSkeletonDef, createBones, SkeletonDef } from '../anim/skeleton';
import { buildBodyGeometry } from './bodyMesh';
import { Outfit } from './outfit';
import { buildTextureArray, paintCharacter, PaintedLayer } from './texture';
import { createCharacterMaterial, CharacterMaterialUniforms, MAX_WOUNDS, Wound, WOUND_MATURE, writeWounds } from './material';
import { buildRealGeometry, realAtlasLayers, realModelReady, realTextures } from './realBody';
import { Pose, applyPoseToBones } from '../anim/pose';
import { B } from '../anim/skeleton';

export interface Variant {
  id: number;
  name: string;
  spec: Partial<BodySpec>;
  outfit: Outfit;
  def: SkeletonDef;
  geometry: THREE.BufferGeometry;
  layer: number;
  /** The head has a layer of its own (layer + 1) at twice the detail. */
  hiFace: boolean;
  /** Long hair or a skirt: drive the shader's secondary motion. */
  sway: boolean;
  /** A realistic model (realBody.ts) instead of the procedural body: its own textures and materials. */
  real: string | null;
}

export interface VariantOptions {
  hiFace?: boolean;
  /** Use this realistic model when its textures loaded (the procedural body otherwise). */
  real?: string;
}

export class CharacterLibrary {
  variants: Variant[] = [];
  byName = new Map<string, Variant>();
  atlas!: THREE.DataArrayTexture;
  /** Surface finish of skin and cloth (rain-soaked on the rooftop: glossier, catching the neon). */
  surface = { roughness: 0.82, env: 1 };
  private canvases: PaintedLayer[] = [];

  add(name: string, spec: Partial<BodySpec>, outfit: Outfit, opts: VariantOptions = {}): Variant {
    const def = buildSkeletonDef(spec);
    const real = opts.real && realModelReady(opts.real) ? opts.real : null;
    // (a real model's head has the layer after its body's in the atlas, as a hi-res face does)
    const hiFace = real ? true : !!opts.hiFace;
    const geometry = real ? buildRealGeometry(real, def) : buildBodyGeometry({ def, outfit, hiFace });
    const sway = !!real || outfit.hairStyle === 'longwave' || outfit.bottom === 'skirt';
    const v: Variant = { id: this.variants.length, name, spec, outfit, def, geometry, layer: this.canvases.length, hiFace, sway, real };
    this.canvases.push(...(real ? realAtlasLayers(real) : paintCharacter(outfit, def.spec, hiFace)));
    this.variants.push(v);
    this.byName.set(name, v);
    return v;
  }

  build() {
    this.atlas = buildTextureArray(this.canvases);
    this.canvases = [];
  }

  get(name: string) {
    const v = this.byName.get(name);
    if (!v) throw new Error('unknown variant ' + name);
    return v;
  }
}

/** A renderable skinned character instance. */
export class CharacterModel {
  group = new THREE.Group();
  mesh: THREE.SkinnedMesh;
  bones: THREE.Bone[];
  skeleton: THREE.Skeleton;
  material: THREE.MeshStandardMaterial;
  /** All of the model's materials (a realistic model has several: body, head, hair). */
  materials: THREE.MeshStandardMaterial[];
  uniforms: CharacterMaterialUniforms;
  wounds: Wound[] = [];
  def: SkeletonDef;
  private woundsDirty = false;

  constructor(public lib: CharacterLibrary, public variant: Variant) {
    this.def = variant.def;
    const { material, uniforms } = createCharacterMaterial(lib.atlas, false);
    uniforms.uLayer.value = variant.layer;
    this.material = material;
    this.uniforms = uniforms;
    this.materials = [material];
    if (variant.real) {
      // body, head and hair cards, sharing one set of uniforms (wounds, rim, fade, sway)
      const t = realTextures(variant.real);
      material.dispose();
      this.materials = [
        createCharacterMaterial(lib.atlas, false, { map: t.body, normalMap: t.bodyN, finish: t.bodyF }, uniforms).material,
        createCharacterMaterial(lib.atlas, false, { map: t.head, normalMap: t.headN, finish: t.headF }, uniforms).material,
        createCharacterMaterial(lib.atlas, false, { map: t.hair, finishConst: [0.86, 0], cards: true }, uniforms).material,
      ];
      this.material = this.materials[0];
    }
    for (const m of this.materials) {
      m.roughness = lib.surface.roughness;
      m.envMapIntensity = lib.surface.env;
    }
    this.bones = createBones(this.def);
    this.mesh = new THREE.SkinnedMesh(variant.geometry, variant.real ? this.materials : material);
    this.mesh.add(this.bones[0]);
    this.mesh.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.mesh.bind(this.skeleton);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
  }

  applyPose(pose: Pose) {
    applyPoseToBones(pose, this.bones);
  }

  private sec = { init: false, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, ox: 0, oy: 0, oz: 0, ovx: 0, ovy: 0, ovz: 0, yaw: 0, spin: 0, flare: 0 };
  /**
   * Secondary motion for long hair and a skirt: the hair is a damped spring dragged by the hips'
   * acceleration (it trails a dash, swings back on a stop, lifts in a jump); the hem flares with
   * the body's spin. Call after the pose and the group transform are set.
   */
  secondary(dt: number) {
    if (!this.variant.sway || dt <= 0) return;
    const S = this.sec;
    const g = this.group;
    const hp = this.bones[B.hips].position;
    const yaw = g.rotation.y;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    // the hips in the world
    const wx = g.position.x + hp.x * c + hp.z * sn, wy = g.position.y + hp.y, wz = g.position.z - hp.x * sn + hp.z * c;
    // the hips' facing (the body's yaw, spins included)
    const hq = this.bones[B.hips].quaternion;
    const fz = 1 - 2 * (hq.x * hq.x + hq.y * hq.y), fx = 2 * (hq.x * hq.z + hq.w * hq.y);
    const hy = yaw + Math.atan2(fx, fz);
    dt = Math.min(dt, 0.05);
    if (!S.init) {
      Object.assign(S, { init: true, px: wx, py: wy, pz: wz, vx: 0, vy: 0, vz: 0, yaw: hy });
      return;
    }
    const vx = (wx - S.px) / dt, vy = (wy - S.py) / dt, vz = (wz - S.pz) / dt;
    const ax = Math.max(-40, Math.min(40, (vx - S.vx) / dt)), ay = Math.max(-40, Math.min(40, (vy - S.vy) / dt)), az = Math.max(-40, Math.min(40, (vz - S.vz) / dt));
    S.px = wx; S.py = wy; S.pz = wz; S.vx = vx; S.vy = vy; S.vz = vz;
    let dy = hy - S.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    S.yaw = hy;
    S.spin = S.spin + (Math.abs(dy / dt) - S.spin) * Math.min(1, dt * 10);
    // spring: the offset is pushed opposite the acceleration (the hair lags), pulled home, damped
    const K = 70, D = 9, G = 0.0026;
    S.ovx += (-K * S.ox - D * S.ovx - ax * G * K) * dt;
    S.ovy += (-K * S.oy - D * S.ovy - ay * G * K * 0.6) * dt;
    S.ovz += (-K * S.oz - D * S.ovz - az * G * K) * dt;
    S.ox += S.ovx * dt; S.oy += S.ovy * dt; S.oz += S.ovz * dt;
    const L = Math.hypot(S.ox, S.oy, S.oz);
    if (L > 0.11) {
      const f = 0.11 / L;
      S.ox *= f; S.oy *= f; S.oz *= f;
    }
    // to mesh space (the hair never swings up into the head)
    const u = this.uniforms;
    u.uSway.value.set(S.ox * c - S.oz * sn, Math.min(0.02, S.oy), S.ox * sn + S.oz * c);
    const target = Math.min(1, Math.max(0, (S.spin - 2.5) / 7));
    S.flare += (target - S.flare) * Math.min(1, dt * (target > S.flare ? 9 : 4));
    u.uFlare.value = S.flare;
    u.uHipC.value.copy(hp);
  }

  /** Add a wound in bind-pose space, merging with nearby ones to stay within the limit. */
  addWound(w: Wound) {
    // merge with an existing nearby wound of the same type
    for (const o of this.wounds) {
      if (o.type === w.type && o.pos.distanceTo(w.pos) < Math.max(o.radius, w.radius) * 0.6) {
        o.intensity = Math.min(1, Math.max(o.intensity, w.intensity) + 0.15);
        o.radius = Math.min(o.radius * 1.12 + 0.004, Math.max(o.radius, w.radius) * 1.6);
        o.drip = Math.max(o.drip, w.drip);
        // fresh blood over an old wound; a bruise struck again keeps deepening
        if (w.born !== undefined) o.born = o.type === 1 ? Math.min(o.born ?? w.born, w.born) : w.born;
        this.woundsDirty = true;
        return;
      }
    }
    if (this.wounds.length < MAX_WOUNDS) this.wounds.push(w);
    else {
      // replace the weakest splatter/bruise, else enlarge the nearest
      let idx = -1;
      let best = Infinity;
      for (let i = 0; i < this.wounds.length; i++) {
        const o = this.wounds[i];
        const score = o.intensity * o.radius * (o.type === 0 ? 2 : 1);
        if (score < best) {
          best = score;
          idx = i;
        }
      }
      if (idx >= 0 && best < w.intensity * w.radius * (w.type === 0 ? 2 : 1)) this.wounds[idx] = w;
      else {
        let ni = 0;
        let nd = Infinity;
        for (let i = 0; i < this.wounds.length; i++) {
          const d = this.wounds[i].pos.distanceTo(w.pos);
          if (d < nd) {
            nd = d;
            ni = i;
          }
        }
        const o = this.wounds[ni];
        o.radius = Math.min(0.2, o.radius + 0.01);
        o.intensity = Math.min(1, o.intensity + 0.1);
      }
    }
    this.woundsDirty = true;
  }

  private woundSyncT = 0;
  /** Push wounds to the shader; while some are still maturing, refresh a few times a second. */
  syncWounds(now = 0) {
    if (!this.woundsDirty && now < this.woundSyncT) return;
    writeWounds(this.uniforms, this.wounds, now);
    this.woundsDirty = false;
    let maturing = false;
    for (const w of this.wounds) if (w.born !== undefined && now - w.born < WOUND_MATURE[w.type]) maturing = true;
    this.woundSyncT = maturing ? now + 0.25 : Infinity;
  }

  dispose() {
    for (const m of this.materials) m.dispose();
    this.skeleton.dispose();
    this.group.removeFromParent();
  }
}
