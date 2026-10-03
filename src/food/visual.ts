// FoodVisual: turns a FoodState into a renderable, cookable, biteable 3D object.
//
// An item is split into *segments*: a plain ingredient is one segment; an assembly (burger,
// pizza...) has one segment per part so every layer keeps its own cooking look. Segments share
// the item transform, bites and highlight uniforms; cooking, seasoning and clip planes are
// per segment.

import * as THREE from 'three';
import type { FoodState, CookState } from './types';
import { getSeasoning, hasDef, getDef } from './catalog';
import { bindFoodMaterial, createFoodUniforms, createSegmentUniforms, type FoodUniforms, MAX_BITES } from '../render/foodMaterial';
import { buildFoodObject } from './forms';
import { buildSeasoningDecals } from '../fx/Decals';

export { buildFoodObject };

/** Food is shown bigger than life so it reads well in the kitchen (toy scale). */
export const FOOD_SCALE = 1.5;

interface Segment {
  state: FoodState;
  node: THREE.Object3D;
  baseScale: THREE.Vector3;
  uniforms: FoodUniforms;
  materials: THREE.Material[];
  /** Assembly-level spread applies to this segment (pizza base / top of a stack). */
  takesAssemblySpread: boolean;
}

const tmpBox = new THREE.Box3();
const tmpMat = new THREE.Matrix4();

function indexStates(s: FoodState, map: Map<number, FoodState>) {
  map.set(s.seed, s);
  for (const p of s.parts ?? []) indexStates(p, map);
}

export class FoodVisual {
  readonly root = new THREE.Group();
  /** Unscaled content (model space). */
  content: THREE.Object3D = new THREE.Group();
  /** Item-wide uniforms (transform, bites, highlight). */
  readonly uniforms: FoodUniforms;
  private segments: Segment[] = [];
  state!: FoodState;
  /** Model-space bounding box of the content. */
  readonly bounds = new THREE.Box3();
  private biteCount = 0;
  private decals: THREE.Object3D | null = null;
  private decalMats: THREE.Material[] = [];

  constructor(state: FoodState) {
    this.uniforms = createFoodUniforms((state.seed % 997) * 0.37);
    this.root.scale.setScalar(FOOD_SCALE);
    this.root.userData.foodVisual = this;
    this.rebuild(state);
  }

  rebuild(state: FoodState) {
    this.state = state;
    this.root.remove(this.content);
    this.disposeContent();
    this.content = buildFoodObject(state);
    this.root.add(this.content);
    this.content.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    this.bindSegments();
    this.decals = null;
    this.refreshDecals();
    this.computeBounds();
    this.applyState();
    this.clearBites();
  }

  private bindSegments() {
    const live = new Map<number, FoodState>();
    indexStates(this.state, live);
    this.root.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const segs: Segment[] = [];
    const assembly = this.state.id === 'assembly' ? this.state : null;
    const spreadTarget = assembly?.parts?.length
      ? assembly.layout === 'stack'
        ? assembly.parts[assembly.parts.length - 1].seed
        : assembly.parts[0].seed
      : this.state.seed;
    const newSegment = (state: FoodState, node: THREE.Object3D, clip: THREE.Plane[]): Segment => {
      const u = segs.length === 0 && clip.length === 0 && state === this.state ? this.uniforms : createSegmentUniforms(this.uniforms, (state.seed % 997) * 0.37);
      const planes = [u.fdClipA, u.fdClipB, u.fdClipC];
      planes.forEach((p, i) => {
        const pl = clip[i];
        if (pl) p.value.set(pl.normal.x, pl.normal.y, pl.normal.z, pl.constant);
        else p.value.set(0, 1, 0, -1e5);
      });
      u.fdClipOn.value = clip.length ? 1 : 0;
      const seg: Segment = {
        state,
        node,
        baseScale: node.scale.clone(),
        uniforms: u,
        materials: [],
        takesAssemblySpread: !assembly || state.seed === spreadTarget || assembly.layout === 'pile',
      };
      segs.push(seg);
      return seg;
    };
    const visit = (node: THREE.Object3D, seg: Segment, clip: THREE.Plane[]) => {
      let cur = seg;
      let curClip = clip;
      const planes = node.userData.clipPlanes as THREE.Plane[] | undefined;
      if (planes?.length) {
        tmpMat.multiplyMatrices(rootInv, node.matrixWorld);
        curClip = [...clip, ...planes.map((p) => p.clone().applyMatrix4(tmpMat))].slice(-3);
      }
      const tagged = node.userData.segmentState as FoodState | undefined;
      if (tagged) cur = newSegment(live.get(tagged.seed) ?? tagged, node, curClip);
      else if (curClip !== clip) cur = newSegment(seg.state, node, curClip);
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        const swap = (m: THREE.Material) => {
          const b = bindFoodMaterial(m, cur.uniforms);
          cur.materials.push(b);
          return b;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
      }
      for (const c of node.children) visit(c, cur, curClip);
    };
    const first = newSegment(this.state, this.content, []);
    visit(this.content, first, []);
    this.segments = segs.filter((s) => s.materials.length > 0 || s === first);
  }

  private computeBounds() {
    this.root.updateMatrixWorld(true);
    tmpBox.makeEmpty();
    this.content.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.noBounds) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        tmpBox.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
      }
    });
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    this.bounds.copy(tmpBox).applyMatrix4(inv);
    if (this.bounds.isEmpty()) this.bounds.set(new THREE.Vector3(-0.03, 0, -0.03), new THREE.Vector3(0.03, 0.06, 0.03));
  }

  /** World-space size helpers (include FOOD_SCALE and the root's scale). */
  get height(): number {
    return (this.bounds.max.y - this.bounds.min.y) * this.root.scale.y;
  }
  get radius(): number {
    const sx = this.bounds.max.x - this.bounds.min.x, sz = this.bounds.max.z - this.bounds.min.z;
    return Math.max(sx, sz) * 0.5 * this.root.scale.x;
  }

  /** Push the current state's cooking & seasoning into the uniforms (cheap; call when it changes). */
  applyState() {
    const assemblySeason = this.state.id === 'assembly' ? this.state.season : null;
    for (const seg of this.segments) {
      this.applyCookTo(seg, seg.state.cook);
      this.applySeasonTo(seg, seg.state.season, assemblySeason && seg.takesAssemblySpread ? assemblySeason : null);
      this.applyTintTo(seg);
    }
  }

  /** Backwards-compatible alias. */
  applyCook(_c?: CookState) {
    this.applyState();
  }

  private applyCookTo(seg: Segment, c: CookState) {
    const u = seg.uniforms;
    u.fdCook.value = 1 - Math.exp(-(c.fry * 0.85 + c.bake * 0.75 + c.toast * 1.0 + c.micro * 0.12));
    u.fdGrill.value = Math.min(1.2, c.grill * 1.1);
    u.fdFry.value = 1 - Math.exp(-c.deepfry * 1.6);
    u.fdBoil.value = Math.min(1, c.boil);
    u.fdBurn.value = c.burn;
    u.fdEmber.value = c.burn > 0.25 ? Math.max(0, (c.temp - 0.55) / 0.45) : 0;
    u.fdFrost.value = c.freeze;
    u.fdWet.value = Math.min(0.5, c.boil * 0.3);
    // melting: squash & spread (only melty things)
    const melty = seg.state.id !== 'assembly' && hasDef(seg.state.id) && getDef(seg.state.id).tags.includes('melty');
    const melt = melty ? c.melt : 0;
    seg.node.scale.set(seg.baseScale.x * (1 + melt * 0.3), seg.baseScale.y * (1 - melt * 0.55), seg.baseScale.z * (1 + melt * 0.3));
  }

  private applySeasonTo(seg: Segment, own: Record<string, number>, extra: Record<string, number> | null) {
    let spread = 0;
    let spreadColor: string | null = null;
    let coat = 0;
    let coatColor: string | null = null;
    const scan = (s: Record<string, number>) => {
      for (const [id, amt] of Object.entries(s)) {
        if (!(amt > 0)) continue;
        let def;
        try {
          def = getSeasoning(id);
        } catch {
          continue;
        }
        if (def.kind === 'spread' && amt > spread) {
          spread = amt;
          spreadColor = def.color;
        } else if (def.kind === 'pour' && amt > coat) {
          coat = amt;
          coatColor = def.color;
        }
      }
    };
    scan(own);
    if (extra) scan(extra);
    const u = seg.uniforms;
    u.fdSpread.value = Math.min(1, spread * 0.9);
    if (spreadColor) u.fdSpreadColor.value.set(spreadColor);
    u.fdCoat.value = Math.min(0.45, coat * 0.25);
    if (coatColor) u.fdCoatColor.value.set(coatColor);
    u.fdWet.value = Math.min(0.6, u.fdWet.value + coat * 0.3);
  }

  private applyTintTo(seg: Segment) {
    // Products paint their own tint; only fall back to the shader tint for generic forms of products.
    seg.uniforms.fdTint.value = 0;
  }

  setHighlight(v: number) {
    this.uniforms.fdHighlight.value = v;
  }

  /** Add a bite at a model-space point. Returns false when all bite slots were already used. */
  addBite(center: THREE.Vector3, radius: number): boolean {
    const slot = this.biteCount % MAX_BITES;
    const b = this.uniforms.fdBites.value[slot];
    const fresh = this.biteCount < MAX_BITES;
    b.set(center.x, center.y, center.z, fresh ? radius : radius * 1.15);
    this.biteCount++;
    return fresh;
  }

  clearBites() {
    for (const b of this.uniforms.fdBites.value) b.set(0, 0, 0, 0);
    this.biteCount = 0;
  }

  /** Call every frame after the root's world matrix is up to date. */
  update() {
    this.uniforms.fdItemInv.value.copy(this.root.matrixWorld).invert();
  }

  /** (Re)build the sauce / sprinkle decals from the current seasoning amounts. */
  refreshDecals() {
    if (this.decals) {
      this.decals.removeFromParent();
      for (const m of this.decalMats) m.dispose();
      this.decalMats = [];
      this.decals = null;
    }
    this.root.updateMatrixWorld(true);
    let d: THREE.Object3D | null = null;
    try {
      d = buildSeasoningDecals(this.state, this.content);
    } catch (e) {
      console.warn('decals failed', e);
    }
    if (!d) return;
    this.content.add(d);
    d.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const swap = (mat: THREE.Material) => {
        const b = bindFoodMaterial(mat, this.uniforms);
        this.decalMats.push(b);
        return b;
      };
      m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    });
    this.decals = d;
  }

  /** All meshes (for raycasting). */
  meshes(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    this.content.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
    });
    return out;
  }

  private disposeContent() {
    for (const s of this.segments) for (const m of s.materials) m.dispose();
    this.segments = [];
    for (const m of this.decalMats) m.dispose();
    this.decalMats = [];
  }

  dispose() {
    this.disposeContent();
    this.root.removeFromParent();
  }
}
