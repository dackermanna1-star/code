/**
 * Per-frame scene assembly. Everything is placed relative to the camera in
 * float64 (floating origin) before three.js uploads float32 matrices; the
 * camera itself always sits at the origin.
 */
import * as THREE from 'three';
import { RenderPipeline } from './pipeline';
import { PlanetRenderer, type FrameContext, type SunLight } from './planetrenderer';
import { StarRenderer } from './star';
import { PointSprites } from './points';
import { GasGiantRenderer } from './gasgiant';
import { BeltRenderer } from './belts';
import { TerrainWorkerPool } from '../terrain/workerpool';
import type { World } from '../sim/world';
import type { Body, StarSystem } from '../astro/body';
import { UPos } from '../core/upos';
import { SOLAR_CONSTANT } from '../core/constants';

export interface QualitySettings {
  lodK: number;
  atmSteps: number;
  cloudSteps: number;
  detail: number;
  fov: number;
}

export const QUALITY_PRESETS: Record<string, QualitySettings & { renderScale: number }> = {
  low: { lodK: 2.2, atmSteps: 12, cloudSteps: 24, detail: 0.6, fov: 60, renderScale: 0.7 },
  medium: { lodK: 3.0, atmSteps: 18, cloudSteps: 36, detail: 0.85, fov: 60, renderScale: 0.85 },
  high: { lodK: 3.6, atmSteps: 24, cloudSteps: 48, detail: 1, fov: 60, renderScale: 1 },
  ultra: { lodK: 4.5, atmSteps: 32, cloudSteps: 72, detail: 1, fov: 60, renderScale: 1 },
};

const _u = new UPos();
const _u2 = new UPos();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly pipeline: RenderPipeline;
  readonly scene = new THREE.Scene();
  readonly overlayScene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly pool: TerrainWorkerPool;
  readonly planets = new Map<string, PlanetRenderer>();
  readonly stars = new Map<string, StarRenderer>();
  readonly giants = new Map<string, GasGiantRenderer>();
  readonly belts: BeltRenderer[] = [];
  readonly bodyPoints: PointSprites;
  quality: QualitySettings = { ...QUALITY_PRESETS.high };
  private system: StarSystem | null = null;
  frame = 0;
  /** camera-relative positions of bodies computed this frame */
  readonly bodyRel = new Map<string, THREE.Vector3>();
  readonly ctx: FrameContext;
  camUPos = new UPos();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.02, 1e27);
    this.camera.position.set(0, 0, 0);
    this.pipeline = new RenderPipeline(this.renderer);
    this.pool = new TerrainWorkerPool();
    this.bodyPoints = new PointSprites(256, () => this.pipeline.exposureTexture);
    this.scene.add(this.bodyPoints.points);
    this.ctx = {
      time: 0, frame: 0, pixelAngle: 0.001, camQuat: new THREE.Quaternion(), camera: this.camera, suns: [],
      quality: this.quality,
    };
  }

  resize(w: number, h: number) {
    this.pipeline.setSize(w, h);
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
  }

  setSystem(sys: StarSystem | null) {
    if (sys === this.system) return;
    for (const p of this.planets.values()) {
      this.scene.remove(p.group);
      p.dispose();
    }
    for (const s of this.stars.values()) {
      this.scene.remove(s.group);
      s.dispose();
    }
    for (const g of this.giants.values()) {
      this.scene.remove(g.group);
      g.dispose();
    }
    for (const b of this.belts) {
      this.scene.remove(b.points);
      b.dispose();
    }
    this.planets.clear();
    this.stars.clear();
    this.giants.clear();
    this.belts.length = 0;
    this.system = sys;
    if (!sys) return;
    for (const b of sys.bodies) {
      if (b.star && (b.kind === 'star' || b.kind === 'white-dwarf' || b.kind === 'brown-dwarf')) {
        const s = new StarRenderer(b);
        this.stars.set(b.id, s);
        this.scene.add(s.group);
      } else if (b.planet?.gasGiant) {
        const g = new GasGiantRenderer(b, this.renderer);
        this.giants.set(b.id, g);
        this.scene.add(g.group);
      } else if (b.planet?.surface) {
        const p = new PlanetRenderer(b, this.pool, this.renderer);
        this.planets.set(b.id, p);
        this.scene.add(p.group);
      }
    }
    for (const belt of sys.belts) {
      const br = new BeltRenderer(belt, () => this.pipeline.exposureTexture);
      this.belts.push(br);
      this.scene.add(br.points);
    }
  }

  /** Camera-relative position of a body, precise when the view is anchored nearby. */
  relOf(world: World, b: Body, out: THREE.Vector3): THREE.Vector3 {
    const view = world.view;
    if (view.body && view.body.system === b.system) {
      // vector anchor→b plus camera offset from anchor (all float64, no UPos rounding)
      b.system.relative(view.body, b, out);
      return out.sub(view.offsetWorld(_v2));
    }
    return b.system.bodyUPos(b, _u2).sub(this.camUPos, out);
  }

  render(world: World, dt: number, draw = true) {
    this.frame++;
    const cam = this.camera;
    const view = world.view;
    view.toUPos(this.camUPos);
    view.worldOrientation(_q);
    cam.quaternion.copy(_q);
    cam.fov = this.quality.fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    const ctx = this.ctx;
    ctx.time = world.time;
    ctx.frame = this.frame;
    ctx.pixelAngle = (2 * Math.tan((cam.fov * Math.PI) / 360)) / this.pipeline.height;
    ctx.camQuat.copy(_q);
    ctx.quality = this.quality;

    this.bodyRel.clear();
    this.bodyPoints.begin();
    this.bodyPoints.material.uniforms.uPixelAngle.value = ctx.pixelAngle;
    const sys = this.system;
    const suns: SunLight[] = [];
    if (sys) {
      for (const b of sys.bodies) {
        if (b.kind === 'barycenter') continue;
        this.bodyRel.set(b.id, this.relOf(world, b, new THREE.Vector3()));
      }
      for (const b of sys.stars) {
        const rel = this.bodyRel.get(b.id)!;
        suns.push({ body: b, rel, color: b.star!.color, luminosity: b.star!.luminosity, radius: b.radius });
        const sr = this.stars.get(b.id);
        if (sr) sr.update(rel, sys.bodyRotation(b, _q), world.time, ctx.pixelAngle);
        const d = rel.length();
        const ang = b.radius / d;
        if (ang < ctx.pixelAngle * 1.5) {
          const flux = b.star!.luminosity / (4 * Math.PI * d * d) / SOLAR_CONSTANT;
          this.bodyPoints.add(rel, b.star!.color, flux * Math.min(1, (ctx.pixelAngle * 1.5 - ang) / (ctx.pixelAngle * 0.75)));
        }
      }
      suns.sort((a, b) => b.luminosity / b.rel.lengthSq() - a.luminosity / a.rel.lengthSq());
      ctx.suns = suns;
      for (const b of sys.bodies) {
        if (b.isStarLike || b.kind === 'barycenter') continue;
        const rel = this.bodyRel.get(b.id)!;
        const pr = this.planets.get(b.id);
        const gr = this.giants.get(b.id);
        const d = rel.length();
        if (gr) {
          gr.occluders = this.occludersFor(b, rel, sys);
          gr.update(ctx, rel, sys.bodyRotation(b, _q));
        }
        if (pr) {
          // eclipse occluders: largest bodies as seen from this planet
          pr.occluders = this.occludersFor(b, rel, sys);
          const camBody = _v.copy(rel).negate().applyQuaternion(sys.bodyRotation(b, _q).invert());
          pr.update(ctx, rel, sys.bodyRotation(b, _q), camBody);
        }
        // point sprite when unresolved
        const ang = b.radius / d;
        if (ang < ctx.pixelAngle * 2 && suns.length) {
          let flux = 0;
          const col = [0, 0, 0];
          const albedo = b.planet?.albedo ?? 0.3;
          for (const s of suns) {
            const toSun = _v.copy(s.rel).sub(rel);
            const ds = toSun.length();
            const E = s.luminosity / (4 * Math.PI * ds * ds) / SOLAR_CONSTANT;
            const alpha = Math.acos(THREE.MathUtils.clamp(toSun.dot(_v2.copy(rel).negate()) / (ds * d), -1, 1));
            const phase = (Math.sin(alpha) + (Math.PI - alpha) * Math.cos(alpha)) / Math.PI;
            const f = (2 / 3) * albedo * E * (b.radius / d) ** 2 * phase;
            flux += f;
            col[0] += s.color[0] * f; col[1] += s.color[1] * f; col[2] += s.color[2] * f;
          }
          if (flux > 0) {
            const pc = b.planet?.surface?.palette.sand ?? [0.6, 0.6, 0.6];
            const tint = [pc[0] * 2 + 0.3, pc[1] * 2 + 0.3, pc[2] * 2 + 0.3];
            const fade = THREE.MathUtils.clamp((ctx.pixelAngle * 2 - ang) / ctx.pixelAngle, 0, 1);
            this.bodyPoints.add(rel, [col[0] / flux * tint[0], col[1] / flux * tint[1], col[2] / flux * tint[2]], flux * fade);
          }
        }
      }
    }
    this.bodyPoints.end();
    if (sys && suns.length) {
      const s0 = suns[0];
      const lumRel = s0.luminosity / (4 * Math.PI) / SOLAR_CONSTANT;
      for (const br of this.belts) {
        const prel = this.bodyRel.get(br.belt.parent.id) ?? _v.set(0, 0, 0);
        br.update(world.time, prel, sys.q, s0.rel, lumRel, ctx.pixelAngle);
      }
    }

    if (!draw) return;
    this.pipeline.beginFrame(this.scene, cam);
    const atm: { body: Body; atmPass: { material: THREE.ShaderMaterial } | null }[] = [
      ...[...this.planets.values()].filter((p) => p.atmosphereVisible && p.atmPass),
      ...[...this.giants.values()].filter((g) => g.atmosphereVisible && g.atmPass),
    ];
    atm.sort((a, b) => this.bodyRel.get(b.body.id)!.lengthSq() - this.bodyRel.get(a.body.id)!.lengthSq());
    for (const p of atm) this.pipeline.composite(p.atmPass!.material);
    if (this.overlayScene.children.length) this.pipeline.overlay(this.overlayScene, cam);
    this.pipeline.endFrame(dt);
  }

  private occludersFor(b: Body, rel: THREE.Vector3, sys: StarSystem): THREE.Vector4[] {
    const list: { v: THREE.Vector4; s: number }[] = [];
    for (const o of sys.bodies) {
      if (o === b || o.isStarLike || o.kind === 'barycenter') continue;
      const orel = this.bodyRel.get(o.id)!;
      const d = _v.copy(orel).sub(rel).length();
      list.push({ v: new THREE.Vector4(orel.x, orel.y, orel.z, o.radius), s: o.radius / d });
    }
    list.sort((a, c) => c.s - a.s);
    return list.slice(0, 4).map((x) => x.v);
  }

  get terrainStats() {
    let nodes = 0, drawn = 0, pending = 0, maxLevel = 0;
    for (const p of this.planets.values()) {
      const s = p.stats;
      if (!s) continue;
      nodes += s.nodes; drawn += s.drawn; pending += s.pending; maxLevel = Math.max(maxLevel, s.maxLevel);
    }
    return { nodes, drawn, pending, maxLevel };
  }
}
