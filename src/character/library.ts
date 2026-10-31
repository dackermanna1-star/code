import * as THREE from 'three';
import { BodySpec, buildSkeletonDef, createBones, SkeletonDef } from '../anim/skeleton';
import { buildBodyGeometry } from './bodyMesh';
import { Outfit } from './outfit';
import { buildTextureArray, paintCharacterCanvas } from './texture';
import { createCharacterMaterial, CharacterMaterialUniforms, MAX_WOUNDS, Wound, writeWounds } from './material';
import { Pose, applyPoseToBones } from '../anim/pose';

export interface Variant {
  id: number;
  name: string;
  spec: Partial<BodySpec>;
  outfit: Outfit;
  def: SkeletonDef;
  geometry: THREE.BufferGeometry;
  layer: number;
}

export class CharacterLibrary {
  variants: Variant[] = [];
  byName = new Map<string, Variant>();
  atlas!: THREE.DataArrayTexture;
  private canvases: HTMLCanvasElement[] = [];

  add(name: string, spec: Partial<BodySpec>, outfit: Outfit): Variant {
    const def = buildSkeletonDef(spec);
    const geometry = buildBodyGeometry({ def, outfit });
    const v: Variant = { id: this.variants.length, name, spec, outfit, def, geometry, layer: this.canvases.length };
    this.canvases.push(paintCharacterCanvas(outfit));
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
    this.bones = createBones(this.def);
    this.mesh = new THREE.SkinnedMesh(variant.geometry, material);
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

  /** Add a wound in bind-pose space, merging with nearby ones to stay within the limit. */
  addWound(w: Wound) {
    // merge with an existing nearby wound of the same type
    for (const o of this.wounds) {
      if (o.type === w.type && o.pos.distanceTo(w.pos) < Math.max(o.radius, w.radius) * 0.6) {
        o.intensity = Math.min(1, Math.max(o.intensity, w.intensity) + 0.15);
        o.radius = Math.min(o.radius * 1.12 + 0.004, Math.max(o.radius, w.radius) * 1.6);
        o.drip = Math.max(o.drip, w.drip);
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

  syncWounds() {
    if (this.woundsDirty) {
      writeWounds(this.uniforms, this.wounds);
      this.woundsDirty = false;
    }
  }

  dispose() {
    this.material.dispose();
    this.skeleton.dispose();
    this.group.removeFromParent();
  }
}
