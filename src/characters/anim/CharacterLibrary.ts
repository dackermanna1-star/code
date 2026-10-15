// Character asset library: loads the character models (+ LOD1) and animation clips listed in
// public/assets/characters/manifest.json and public/assets/anims/manifest.json (tolerant parser), with a
// fallback to public/assets/characters/fallback/Soldier.glb. Shared by all character instances.
import * as THREE from 'three';
import { Assets, type GLTF } from '../../core/Assets';
import type { GameContext } from '../../core/GameContext';
import { Rig, detectFacing } from './Rig';
import { analyseLocomotion, makeClipInfo, stripRootMotion, type ClipInfo, type ClipMeta } from './Clips';

export interface ModelTemplate {
  id: string;
  scene: THREE.Object3D;
  lod1: THREE.Object3D | null;
  /** +1 if the model faces +Z, -1 if it faces -Z (rotated at instantiation). */
  facing: number;
  scale: number;
  /** Sex/body hint from the manifest ('male' | 'female' | …) if known. */
  tags: string[];
}

export interface ModelInstance {
  /** Container added under the character's visual root (applies facing/scale). */
  container: THREE.Group;
  model: THREE.Object3D;
  lod1: THREE.Object3D | null;
  rig: Rig;
  meshes: THREE.SkinnedMesh[];
  lod1Meshes: THREE.SkinnedMesh[];
  template: ModelTemplate;
}

interface ManifestModel {
  id: string;
  file: string;
  lod1?: string;
  tags: string[];
}

const CHAR_MANIFEST = 'assets/characters/manifest.json';
const ANIM_MANIFEST = 'assets/anims/manifest.json';
const FALLBACK = 'assets/characters/fallback/Soldier.glb';

/** Resolve a manifest file reference relative to its manifest folder. */
function resolveRel(base: string, file: string): string {
  if (/^(https?:|data:|blob:)/.test(file) || file.startsWith('assets/')) return file;
  if (file.startsWith('/assets/')) return file.slice(1);
  return base.replace(/[^/]*$/, '') + file.replace(/^\.\//, '');
}

/** Walk any JSON and collect objects with a "file"/"glb"/"path" ending in .glb. */
function collectGlbEntries(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) for (const n of node) collectGlbEntries(n, out);
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    const f = (o.file ?? o.glb ?? o.path ?? o.url) as unknown;
    if (typeof f === 'string' && /\.glb$/i.test(f)) out.push(o);
    for (const v of Object.values(o)) if (v && typeof v === 'object') collectGlbEntries(v, out);
  }
  return out;
}

/** Collect clip metadata objects (name + speed/loop/mode/duration) anywhere in a JSON. */
function collectClipMeta(node: unknown, out: Map<string, ClipMeta>, keyName?: string): void {
  if (Array.isArray(node)) for (const n of node) collectClipMeta(n, out);
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    const name = (typeof o.name === 'string' ? o.name : typeof o.clip === 'string' ? o.clip : keyName) as string | undefined;
    if (name && ('speed_mps' in o || 'loop' in o || 'mode' in o || 'move_dir' in o)) out.set(name, o as ClipMeta);
    for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') collectClipMeta(v, out, k);
  }
}

export class CharacterLibrary {
  status: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  source: 'manifest' | 'fallback' | 'none' = 'none';
  readonly models: ModelTemplate[] = [];
  readonly clips: ClipInfo[] = [];
  readonly clipByName = new Map<string, ClipInfo>();
  /** Bone name of the hips (track binding). */
  hipsName = 'Hips';
  private readyPromise: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly modelListeners = new Set<(slot: number) => void>();
  /** Manifest variants (slots fill in as their GLBs load). */
  variantCount = 0;
  private slots: (ModelTemplate | null)[] = [];

  /** Called (after ready) whenever another variant model finished loading. */
  onModelAdded(fn: (slot: number) => void): () => void {
    this.modelListeners.add(fn);
    return () => this.modelListeners.delete(fn);
  }

  /** True if the exact model for this variant is loaded. */
  hasVariant(variant: number): boolean {
    if (this.variantCount === 0) return this.models.length > 0;
    return !!this.slots[Math.abs(variant) % this.variantCount];
  }

  /** Slot index a variant maps to. */
  slotOf(variant: number): number {
    return this.variantCount ? Math.abs(variant) % this.variantCount : 0;
  }

  onReady(fn: () => void): void {
    if (this.status === 'ready') fn();
    else this.listeners.add(fn);
  }

  load(ctx: GameContext): Promise<void> {
    if (!this.readyPromise) this.readyPromise = this.doLoad(ctx);
    return this.readyPromise;
  }

  private async doLoad(ctx: GameContext): Promise<void> {
    this.status = 'loading';
    const assets = ctx.assets;
    try {
      const ok = await this.loadFromManifests(assets);
      if (!ok) await this.loadFallback(assets);
    } catch (e) {
      console.warn('[characters] asset load failed, trying fallback', e);
      try {
        await this.loadFallback(assets);
      } catch (e2) {
        console.warn('[characters] fallback failed', e2);
      }
    }
    if (this.models.length === 0) {
      this.status = 'failed';
      console.warn('[characters] no character model available — using placeholder visuals');
      return;
    }
    this.status = 'ready';
    console.log(`[characters] library ready: source=${this.source} models=${this.models.length} clips=${this.clips.length} (${this.clips.map((c) => c.name).join(', ')})`);
    for (const fn of this.listeners) fn();
    this.listeners.clear();
  }

  private async loadFromManifests(assets: Assets): Promise<boolean> {
    const [cm, am] = await Promise.all([assets.json(CHAR_MANIFEST), assets.json(ANIM_MANIFEST)]);
    if (!cm) return false;
    const meta = new Map<string, ClipMeta>();
    collectClipMeta(cm, meta);
    if (am) collectClipMeta(am, meta);

    // Models: entries in the character manifest that are not animation files.
    const models: ManifestModel[] = [];
    const animFiles = new Set<string>();
    for (const e of collectGlbEntries(cm)) {
      const file = resolveRel(CHAR_MANIFEST, String(e.file ?? e.glb ?? e.path ?? e.url));
      if (/(^|\/)anims?\//.test(file) || 'clips' in e || /anim/i.test(String(e.kind ?? e.type ?? ''))) {
        animFiles.add(file);
        continue;
      }
      if (/lod1|_lod[1-9]/i.test(file) && !e.id) continue;
      const lod1 = typeof e.lod1 === 'string' ? resolveRel(CHAR_MANIFEST, e.lod1) : typeof (e.lods as string[] | undefined)?.[1] === 'string' ? resolveRel(CHAR_MANIFEST, (e.lods as string[])[1]) : undefined;
      const tags = [e.sex, e.gender, e.body, e.kind, e.type, e.outfit].filter((t): t is string => typeof t === 'string');
      models.push({ id: String(e.id ?? file), file, lod1, tags });
    }
    if (am) for (const e of collectGlbEntries(am)) animFiles.add(resolveRel(ANIM_MANIFEST, String(e.file ?? e.glb ?? e.path ?? e.url)));
    if (models.length === 0) return false;

    // Progressive: ready once the first model that loads + all clips are in; the other variants stream in
    // and characters re-build when their variant arrives (see onModelAdded).
    this.variantCount = models.length;
    this.slots = new Array(models.length).fill(null);
    const loads = models.map((m, i) =>
      assets.tryGltf(m.file).then(async (g) => {
        if (!g) return null;
        const l1 = m.lod1 ? await assets.tryGltf(m.lod1) : null;
        const t = this.addModel(m.id, g, l1, m.tags);
        if (t) {
          this.slots[i] = t;
          if (this.status === 'ready') for (const fn of this.modelListeners) fn(i);
        }
        return t;
      }),
    );
    const first = await Promise.race([
      Promise.any(loads.map((p) => p.then((t) => t ?? Promise.reject(new Error('missing'))))).catch(() => null),
      Promise.all(loads).then((all) => all.find((t) => t) ?? null),
    ]);
    if (!first) return false;
    const animGltfs = await Promise.all([...animFiles].map((f) => assets.tryGltf(f)));
    const clips: THREE.AnimationClip[] = [];
    for (const g of animGltfs) if (g) clips.push(...g.animations);
    this.addClips(clips, meta);
    this.source = 'manifest';
    return true;
  }

  private async loadFallback(assets: Assets): Promise<void> {
    const g = await assets.tryGltf(FALLBACK);
    if (!g) return;
    this.addModel('soldier', g, null, ['male', 'fallback']);
    this.addClips(g.animations.filter((a) => !/tpose/i.test(a.name)), new Map());
    this.source = 'fallback';
  }

  private addModel(id: string, g: GLTF, lod1: GLTF | null, tags: string[]): ModelTemplate | null {
    const scene = g.scene;
    // Measure facing & scale on a temporary wrapper.
    const wrap = new THREE.Group();
    const probe = Assets.cloneScene(scene);
    wrap.add(probe);
    const rig = new Rig(probe);
    if (!rig.ok) {
      console.warn(`[characters] model ${id}: skeleton not recognised`);
      return null;
    }
    rig.measure(wrap);
    const facing = detectFacing(rig);
    const scale = rig.height > 1.3 && rig.height < 2.3 ? 1 : 1.8 / Math.max(0.01, rig.height);
    if (rig.bones.hips) this.hipsName = rig.bones.hips.name;
    const t: ModelTemplate = { id, scene, lod1: lod1?.scene ?? null, facing, scale, tags };
    this.models.push(t);
    return t;
  }

  private addClips(clips: THREE.AnimationClip[], meta: Map<string, ClipMeta>): void {
    const tpl = this.models[0];
    let analysisRoot: THREE.Group | null = null;
    let analysisRig: Rig | null = null;
    for (const clip of clips) {
      if (this.clipByName.has(clip.name)) continue;
      const m = meta.get(clip.name);
      const isLoco = /walk|jog|run|sprint|crawl|strafe|swim|move/i.test(clip.name) || m?.mode === 'loco';
      if (isLoco) stripRootMotion(clip, this.hipsName);
      let analysed: { speed: number; dir: THREE.Vector2 } | null = null;
      if (isLoco && !(m?.speed_mps && m.speed_mps > 0.05) && tpl) {
        if (!analysisRoot) {
          analysisRoot = new THREE.Group();
          analysisRoot.add(Assets.cloneScene(tpl.scene));
          analysisRig = new Rig(analysisRoot.children[0]);
          analysisRig.measure(analysisRoot);
        }
        try {
          analysed = analyseLocomotion(clip, analysisRoot, analysisRig!, tpl.facing);
        } catch (e) {
          console.warn('[characters] clip analysis failed', clip.name, e);
        }
      }
      const info = makeClipInfo(clip, m, analysed);
      this.clips.push(info);
      this.clipByName.set(info.name, info);
    }
  }

  /** Create a model instance (skeleton clone) for a character variant. */
  instantiate(variant: number): ModelInstance | null {
    if (this.models.length === 0) return null;
    const template = (this.variantCount ? this.slots[this.slotOf(variant)] : null) ?? this.models[Math.abs(variant) % this.models.length];
    const container = new THREE.Group();
    container.name = 'characterModel';
    const model = Assets.cloneScene(template.scene);
    container.add(model);
    let lod1: THREE.Object3D | null = null;
    if (template.lod1) {
      lod1 = Assets.cloneScene(template.lod1);
      lod1.visible = false;
      container.add(lod1);
    }
    if (template.facing < 0) container.rotation.y = Math.PI;
    container.scale.setScalar(template.scale);
    const meshes: THREE.SkinnedMesh[] = [];
    const lod1Meshes: THREE.SkinnedMesh[] = [];
    model.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = o as THREE.SkinnedMesh;
        sm.castShadow = true;
        sm.receiveShadow = true;
        sm.frustumCulled = false; // animated bounds are unreliable; the visual culls by its own sphere
        meshes.push(sm);
      } else if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).castShadow = true;
      }
    });
    lod1?.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = o as THREE.SkinnedMesh;
        sm.castShadow = true;
        sm.frustumCulled = false;
        lod1Meshes.push(sm);
      }
    });
    // LOD1 shares the LOD0 skeleton pose: bind its skinned meshes to LOD0's bones by name.
    if (lod1 && lod1Meshes.length) {
      const byName = new Map<string, THREE.Bone>();
      model.traverse((o) => {
        if ((o as THREE.Bone).isBone) byName.set(o.name, o as THREE.Bone);
      });
      for (const sm of lod1Meshes) {
        const bones = sm.skeleton.bones.map((b) => byName.get(b.name) ?? b);
        sm.bind(new THREE.Skeleton(bones, sm.skeleton.boneInverses), sm.bindMatrix);
      }
    }
    const rig = new Rig(model);
    return { container, model, lod1, rig, meshes, lod1Meshes, template };
  }

  /** Clips matching a predicate. */
  find(pred: (c: ClipInfo) => boolean): ClipInfo[] {
    return this.clips.filter(pred);
  }
}

export const characterLibrary = new CharacterLibrary();
