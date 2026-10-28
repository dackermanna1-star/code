/**
 * Per-frame scene assembly. Everything is placed relative to the camera in
 * float64 (floating origin) before three.js uploads float32 matrices; the
 * camera itself always sits at the origin.
 */
import * as THREE from 'three';
import { RenderPipeline } from './pipeline';
import { PlanetRenderer, type FrameContext, type SunLight } from './planetrenderer';
import { flareAt, StarRenderer } from './star';
import { PointSprites } from './points';
import { GasGiantRenderer } from './gasgiant';
import { BeltRenderer } from './belts';
import { StarField } from './starfield';
import { GalaxyRenderer } from './galaxyrenderer';
import type { Cosmos } from '../sim/cosmos';
import { ShipRenderer } from './shipmodels';
import { BlackHoleRenderer, type AccretionDisk } from './blackhole';
import { NebulaRenderer } from './nebula';
import { CometTail } from './comet';
import { SunShadows } from './shadows';
import type { Ship } from '../sim/ship';
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
  /** rocks & vegetation density 0..1 */
  scatter: number;
}

export const QUALITY_PRESETS: Record<string, QualitySettings & { renderScale: number }> = {
  low: { lodK: 2.2, atmSteps: 12, cloudSteps: 24, detail: 0.6, fov: 60, renderScale: 0.7, scatter: 0.3 },
  medium: { lodK: 3.0, atmSteps: 18, cloudSteps: 36, detail: 0.85, fov: 60, renderScale: 0.85, scatter: 0.6 },
  high: { lodK: 3.6, atmSteps: 24, cloudSteps: 48, detail: 1, fov: 60, renderScale: 1, scatter: 0.85 },
  ultra: { lodK: 4.5, atmSteps: 32, cloudSteps: 72, detail: 1, fov: 60, renderScale: 1, scatter: 1 },
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
  readonly blackHoles = new Map<string, BlackHoleRenderer>();
  readonly comets = new Map<string, CometTail>();
  readonly belts: BeltRenderer[] = [];
  readonly starField: StarField;
  readonly galaxies: GalaxyRenderer;
  readonly galaxyScene = new THREE.Scene();
  readonly nebulae = new NebulaRenderer();
  readonly shadows = new SunShadows();
  cosmos: Cosmos | null = null;
  shipRenderer: ShipRenderer | null = null;
  ship: Ship | null = null;
  readonly bodyPoints: PointSprites;
  quality: QualitySettings = { ...QUALITY_PRESETS.high };
  private system: StarSystem | null = null;
  frame = 0;
  /** camera-relative positions of bodies computed this frame */
  readonly bodyRel = new Map<string, THREE.Vector3>();
  readonly ctx: FrameContext;
  camUPos = new UPos();
  /** transient point sources this frame (set by the app from the event system) */
  transients: { upos: UPos; lumV: number; color: [number, number, number]; name: string }[] = [];
  /** debugging switches (tests) */
  debug = { noAtmosphere: false };
  /** accessibility: tone down FTL streak / tunnel effects */
  reduceMotion = false;

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
    this.bodyPoints = new PointSprites(512, () => this.pipeline.exposureTexture);
    this.scene.add(this.bodyPoints.points);
    this.starField = new StarField(() => this.pipeline.exposureTexture);
    this.scene.add(this.starField.group);
    this.galaxies = new GalaxyRenderer(() => this.pipeline.exposureTexture);
    this.scene.add(this.galaxies.points.points);
    this.galaxyScene.add(this.galaxies.group);
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
    for (const bh of this.blackHoles.values()) bh.dispose();
    this.blackHoles.clear();
    for (const c of this.comets.values()) { this.scene.remove(c.mesh); c.dispose(); }
    this.comets.clear();
    this.planets.clear();
    this.stars.clear();
    this.giants.clear();
    this.belts.length = 0;
    this.system = sys;
    if (!sys) return;
    for (const b of sys.bodies) {
      if (b.kind === 'comet') {
        const c = new CometTail(b);
        this.comets.set(b.id, c);
        this.scene.add(c.mesh);
      }
      if (b.kind === 'black-hole') {
        this.blackHoles.set(b.id, new BlackHoleRenderer(b, accretionDiskFor(b, sys)));
        continue;
      }
      if (b.star && (b.kind === 'star' || b.kind === 'white-dwarf' || b.kind === 'brown-dwarf' || b.kind === 'neutron-star')) {
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
        const flare = flareAt(b, world.time).amp;
        suns.push({ body: b, rel, color: b.star!.color, luminosity: b.star!.luminosity * (1 + flare), radius: b.radius });
        const sr = this.stars.get(b.id);
        if (sr) sr.update(rel, sys.bodyRotation(b, _q), world.time, ctx.pixelAngle);
        const bh = this.blackHoles.get(b.id);
        if (bh) bh.update(ctx, rel, sys.bodyRotation(b, _q));
        const d = rel.length();
        const ang = b.radius / d;
        if (ang < ctx.pixelAngle * 1.5) {
          const flux = (b.star!.luminosity * (1 + flare)) / (4 * Math.PI * d * d) / SOLAR_CONSTANT;
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
    // catalogued stars outside the active system (unresolved points)
    if (this.cosmos) {
      for (const k of this.cosmos.knownSystems) {
        if (!k.lumV || k.id === this.cosmos.activeRef?.id) continue;
        const rel = k.upos.sub(this.camUPos, _v);
        const d = rel.length();
        const flux = (k.lumV * 3.828e26) / (4 * Math.PI * d * d) / SOLAR_CONSTANT;
        this.bodyPoints.add(rel, k.color!, flux);
      }
    }
    if (sys && suns.length) {
      for (const [id, c] of this.comets) {
        const b = sys.byId.get(id);
        const rel = this.bodyRel.get(id);
        if (!b || !rel) continue;
        const toStar = _v.copy(suns[0].rel).sub(rel);
        const r = toStar.length();
        toStar.divideScalar(r);
        const Esc = suns[0].luminosity / (4 * Math.PI * r * r) / SOLAR_CONSTANT;
        const E = new THREE.Vector3(suns[0].color[0] * Esc, suns[0].color[1] * Esc, suns[0].color[2] * Esc);
        const vel = _v2.copy(b.velSys).applyQuaternion(sys.q);
        c.update(rel, toStar.clone(), vel.clone(), r / 1.495978707e11, E, ctx.pixelAngle);
      }
    }
    // transient events (supernovae, novae, …) as unresolved points
    for (const tr of this.transients) {
      const rel = tr.upos.sub(this.camUPos, _v);
      const d = rel.length();
      this.bodyPoints.add(rel, tr.color, (tr.lumV * 3.828e26) / (4 * Math.PI * d * d) / SOLAR_CONSTANT);
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

    // universe: star field of the current galaxy + galaxies
    const cosmos = this.cosmos;
    if (cosmos) {
      const hide = cosmos.activeRef ? cosmos.activeRef.upos.sub(this.camUPos, new THREE.Vector3()) : null;
      this.starField.update(this.camUPos, cosmos.camG, ctx.pixelAngle, hide);
      this.galaxies.update(cosmos.galaxies, this.camUPos, _q.copy(ctx.camQuat), ctx.pixelAngle, this.frame, this.pipeline.depthTexture,
        Math.ceil(this.pipeline.width / 2), Math.ceil(this.pipeline.height / 2), cosmos.current);
      this.nebulae.update(cosmos.nebulae, cosmos.current, cosmos.camG, ctx.pixelAngle, this.frame, this.pipeline.depthTexture,
        Math.ceil(this.pipeline.width / 2), Math.ceil(this.pipeline.height / 2));
    }
    this.updateShip(world, suns);
    if (!draw) return;
    this.renderShadows(suns);
    this.pipeline.beginFrame(this.scene, cam);
    if (this.galaxies.group.children.length) this.pipeline.overlayHalfRes(this.galaxyScene, cam);
    if (this.nebulae.drawn) this.pipeline.overlayHalfResOver(this.nebulae.scene, cam);
    const atm: { body: Body; atmPass: { material: THREE.ShaderMaterial } | null }[] = [
      ...[...this.planets.values()].filter((p) => p.atmosphereVisible && p.atmPass),
      ...[...this.giants.values()].filter((g) => g.atmosphereVisible && g.atmPass),
    ];
    atm.sort((a, b) => this.bodyRel.get(b.body.id)!.lengthSq() - this.bodyRel.get(a.body.id)!.lengthSq());
    if (!this.debug.noAtmosphere) for (const p of atm) this.pipeline.composite(p.atmPass!.material);
    for (const bh of this.blackHoles.values()) if (bh.visible) this.pipeline.composite(bh.material);
    if (this.overlayScene.children.length) this.pipeline.overlay(this.overlayScene, cam);
    this.pipeline.endFrame(dt);
  }

  /** Sun shadow cascades on the planet under the camera (when close to its surface). */
  private renderShadows(suns: SunLight[]) {
    let best: PlanetRenderer | null = null;
    for (const p of this.planets.values()) {
      if (p.terrainActive && p.camAltitude < 12000 && (!best || p.camAltitude < best.camAltitude)) best = p;
    }
    for (const p of this.planets.values()) if (p !== best) p.material.uniforms.uShadowOn.value = 0;
    if (!best || !suns.length || !this.shadows.enabled || this.quality.scatter <= 0.05) return;
    const L = suns[0].rel.clone().sub(best.lastRel).normalize();
    const up = best.lastCamBody.clone().normalize().applyQuaternion(best.lastRot);
    if (L.dot(up) < -0.05) { best.material.uniforms.uShadowOn.value = 0; return; } // night
    const casters: THREE.Object3D[] = [best.group];
    if (this.shipRenderer) casters.push(this.shipRenderer.model.group);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.shadows.render(this.renderer, this.scene, casters, best.material, this.quality.lodK,
      best.lastRel, best.lastRot, best.lastCamBody, L, fwd, best.material.uniforms, best.body.id);
  }

  private updateShip(world: World, suns: SunLight[]) {
    const ship = this.ship;
    if (!ship) {
      if (this.shipRenderer) { this.scene.remove(this.shipRenderer.root); this.shipRenderer = null; }
      this.pipeline.ftl.tunnel = 0;
      this.pipeline.ftl.streak = 0;
      return;
    }
    if (!this.shipRenderer || this.shipRenderer.cls !== ship.spec.cls) {
      if (this.shipRenderer) this.scene.remove(this.shipRenderer.root);
      this.shipRenderer = new ShipRenderer(ship.spec.cls);
      this.scene.add(this.shipRenderer.root);
    }
    const sr = this.shipRenderer;
    // camera-relative position (precise when ship and camera share a frame body)
    const rel = _v;
    const view = world.view;
    if (ship.frame.body && view.body === ship.frame.body) rel.copy(ship.frame.offsetWorld(_v2)).sub(view.offsetWorld(new THREE.Vector3()));
    else ship.frame.toUPos(_u).sub(this.camUPos, rel);
    sr.root.position.copy(rel);
    sr.model.group.quaternion.copy(ship.orient);
    // lighting from stars, sky and planetshine
    const E1 = new THREE.Vector3(), d1 = new THREE.Vector3(), E2 = new THREE.Vector3(), d2 = new THREE.Vector3();
    const sky = new THREE.Color(0, 0, 0), ground = new THREE.Color(0, 0, 0);
    if (suns[0]) {
      d1.copy(suns[0].rel).sub(rel);
      const dist = d1.length();
      d1.divideScalar(dist);
      const E = suns[0].luminosity / (4 * Math.PI * dist * dist) / SOLAR_CONSTANT;
      E1.set(suns[0].color[0] * E, suns[0].color[1] * E, suns[0].color[2] * E);
      const b = ship.frame.body;
      if (b && b.planet) {
        const off = ship.frame.offsetWorld(new THREE.Vector3());
        const up = off.clone().normalize();
        const cosS = up.dot(d1);
        const alt = off.length() - b.radius;
        // planet shadow
        const sinH = b.radius / Math.max(off.length(), b.radius);
        if (cosS < -Math.sqrt(Math.max(0, 1 - sinH * sinH))) E1.set(0, 0, 0);
        const atm = b.planet.atmosphere;
        const pressure = atm ? atm.pressure * Math.exp(-Math.max(alt, 0) / (atm.scaleHeight || 8000)) : 0;
        if (pressure > 1e-4) {
          const tau = Math.min(8, pressure * 0.12 / Math.max(cosS, 0.05));
          E1.multiply(new THREE.Vector3(Math.exp(-tau * 0.4), Math.exp(-tau * 0.7), Math.exp(-tau * 1.4)));
          sky.setRGB(E * 0.04 * Math.min(1, pressure), E * 0.06 * Math.min(1, pressure), E * 0.1 * Math.min(1, pressure)).multiplyScalar(Math.max(0, cosS + 0.1));
        }
        const albedo = b.planet.albedo;
        const view = Math.max(0, b.radius / Math.max(off.length(), b.radius));
        ground.setRGB(E * albedo * 0.3, E * albedo * 0.28, E * albedo * 0.25).multiplyScalar(Math.max(0, cosS) * view);
      }
    }
    if (suns[1]) {
      d2.copy(suns[1].rel).sub(rel);
      const dist = d2.length();
      d2.divideScalar(dist);
      const E = suns[1].luminosity / (4 * Math.PI * dist * dist) / SOLAR_CONSTANT;
      E2.set(suns[1].color[0] * E, suns[1].color[1] * E, suns[1].color[2] * E);
    }
    sr.setLighting(d1, E1, suns[1] ? d2 : null, suns[1] ? E2 : null, sky, ground);
    const air = ship.atmo.pressure / 1e5;
    const flow = ship.velocity.lengthSq() > 1 ? ship.velocity.clone().normalize() : new THREE.Vector3(0, 0, -1);
    sr.update(world.time, ship.engineLevel, air * 3, ship.heatGlow, flow, ship.gearDown);
    // FTL screen effects
    const j = ship.jump;
    this.pipeline.ftl.tunnel = j.phase === 'tunnel' ? Math.min(1, j.t * 2, (j.duration - j.t) * 2 + 0.2) : j.phase === 'charging' ? Math.min(0.3, j.t * 0.1) : j.phase === 'exit' ? Math.max(0, 1 - j.t) : 0;
    this.pipeline.ftl.streak = ship.warp.active ? Math.min(1, Math.log10(1 + ship.warp.speed / 3e6) / 3) : 0;
    if (this.reduceMotion) {
      this.pipeline.ftl.tunnel *= 0.25;
      this.pipeline.ftl.streak *= 0.25;
    }
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

/**
 * Accretion disk for a black hole: bright and hot when fed by a companion
 * star (X-ray binary), faint for a quiescent supermassive hole, none when
 * isolated (lensing only).
 */
function accretionDiskFor(b: Body, sys: StarSystem): AccretionDisk | null {
  const mSun = b.mass / 1.98847e30;
  const companion = sys.bodies.some((o) => o !== b && o.kind === 'star');
  // (the visible inner disk; real disks extend much further but fade in the optical)
  if (mSun > 1e5) return { inner: 3, outer: 16, tempInner: 2.2e5 * Math.pow(mSun / 1e6, -0.25), brightness: 0.02 };
  if (companion) return { inner: 3, outer: 18, tempInner: 1.0e7 * Math.pow(mSun / 10, -0.25), brightness: 1 };
  return null;
}
