// Orchestrates world construction: facades, paint/grime atlases, lamps,
// sky, baked irradiance. Props, ground and overhead infrastructure plug in here.
import * as THREE from 'three';
import { buildFacades } from './facades.js';
import { FACADES, LAMPS, POLES, facadeById, facadeToWorld, facadeNormal } from './layout.js';
import { StaticBatcher } from '../voxel/batch.js';
import { createFacadeMaterial } from '../render/facadeMaterial.js';
import { PaintAtlas } from '../textures/paintAtlas.js';
import { generateGrime } from '../textures/grime.js';
import { bakeIrradiance, IRR } from './irradiance.js';
import { shared } from '../render/shaderlib.js';
import { createSky, skyIrradiance } from '../render/sky.js';
import { LAYER_REFLECT } from './units.js';
import { Ground } from './ground.js';
import { Windows } from './windows.js';
import { CollisionGrid } from './collision.js';
import { GMAT } from './groundData.js';
import { Wires } from './wires.js';
import { PropWorld } from './propPlacement.js';
import { Traffic } from './traffic.js';

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

export class World {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.lamps = [];
    this.timings = {};
  }

  async build(progress = () => {}) {
    const T = (k, t0) => (this.timings[k] = Math.round(performance.now() - t0));
    let t0 = performance.now();

    // ── facades ──
    const fac = buildFacades();
    this.facadeData = fac;
    T('facadeVoxels', t0);
    progress(0.2);
    await yieldFrame();

    // ── paint + grime atlases ──
    t0 = performance.now();
    const atlas = new PaintAtlas().pack(FACADES).createTextures();
    this.atlas = atlas;
    for (const f of FACADES) {
      const e = atlas.entries.get(f.id);
      if (!e) continue;
      const fx = fac.fixtures.filter((x) => x.facade === f);
      const g = generateGrime(f, fx, atlas.grimePPM, e.v0);
      atlas.blitFacade('grime', f.id, g);
    }
    T('grime', t0);
    progress(0.3);
    await yieldFrame();

    // paint (graffiti) runs in workers while the rest of the world is built
    let paintDone = Promise.resolve(null);
    const tPaint = performance.now();
    if (this.engine.paintFacades) paintDone = this.engine.paintFacades(atlas, FACADES, fac.fixtures);

    // ── facade meshes ──
    t0 = performance.now();
    const facPaint = atlas.facadeUniform(FACADES);
    this.facadeMaterial = createFacadeMaterial({
      facPaint,
      paint: atlas.color.tex,
      paintProps: atlas.props.tex,
      grime: atlas.grime.tex,
    });
    const batcher = new StaticBatcher({ chunkLength: 14, name: 'facades' });
    for (const r of fac.results) batcher.add(r.geometry, r.matrix);
    const facGroup = batcher.build(this.facadeMaterial, { castShadow: true, receiveShadow: true });
    facGroup.traverse((o) => o.isMesh && o.layers.enable(LAYER_REFLECT));
    this.scene.add(facGroup);
    this.facadeGroup = facGroup;
    T('facadeMesh', t0);
    progress(0.45);
    await yieldFrame();

    // ── collision ──
    t0 = performance.now();
    this.collision = new CollisionGrid();
    for (const r of fac.results) if (!r.facade.backdrop) this.collision.addFacade(r);
    T('collision', t0);

    // ── ground ──
    t0 = performance.now();
    this.ground = new Ground(this.engine).build();
    T('ground', t0);
    progress(0.55);
    await yieldFrame();

    // ── vacant gravel lot beyond the far-left fence ──
    {
      const lot = new THREE.Mesh(new THREE.PlaneGeometry(14, 42).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x17161a, roughness: 0.75 }));
      lot.position.set(-29.2, 0.0, -79);
      lot.receiveShadow = true;
      lot.layers.enable(LAYER_REFLECT);
      this.scene.add(lot);
      const yard = new THREE.Mesh(new THREE.PlaneGeometry(9, 42).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.6 }));
      yard.position.set(26.5, 0.0, -79);
      this.scene.add(yard);
    }

    // ── sky ──
    const sky = createSky();
    sky.layers.enable(LAYER_REFLECT);
    this.scene.add(sky);
    const si = skyIrradiance();
    shared.uSkyIrr.value.copy(si.up);
    shared.uSkyIrrSide.value.copy(si.side);
    shared.uGroundIrr.value.setRGB(0.012, 0.012, 0.014);

    // ── lamps (+ street lights and car light rigs behind the fence) ──
    this.buildLamps();
    this.traffic = new Traffic(this.engine);
    this.extraFogLights = this.traffic.buildLights(this.scene, this.lamps);
    this.traffic.build();

    // ── props ──
    t0 = performance.now();
    this.props = await new PropWorld(this.engine).build(fac.fixtures, (k) => progress(0.55 + 0.07 * k));
    T('props', t0);

    // cobra lights sit just under their lens, so the head stays out of its own shadow map
    for (const l of this.lamps) {
      const a = l.def.kind === 'cobra' && this.props.poleAnchors?.get(l.def.id)?.light;
      if (!a) continue;
      const dx = l.light.target.position.x - l.light.position.x;
      l.light.position.set(a.x, a.y - 0.04, a.z);
      l.light.target.position.set(a.x + dx, 0, a.z);
      l.pos.copy(l.light.position);
    }

    // ── overhead wires (strung to the poles' insulators) ──
    t0 = performance.now();
    this.wires = new Wires(this.engine);
    this.wires.layout(this.props.poleAnchors);
    this.wires.build();
    T('wires', t0);
    progress(0.62);
    await yieldFrame();

    // ── windows (glass panes follow the sash models) ──
    t0 = performance.now();
    const panes = this.props.panes;
    const provider = this.engine.paneProvider ?? ((fx) => {
      const p = panes.get(fx);
      return p && p.length ? p : null;
    });
    this.windows = new Windows(this.engine).build(fac.fixtures, (fx) => provider(fx) ?? [{ x: -fx.w / 2 + 0.05, y: 0.05, w: fx.w - 0.1, h: fx.h - 0.1, z: 0.03 }]);
    T('windows', t0);

    // ── irradiance bake ──
    t0 = performance.now();
    const vpls = this.collectVPLs();
    const irr = bakeIrradiance({ vpls });
    shared.uIrrA.value = irr.texA;
    shared.uIrrB.value = irr.texB;
    shared.uIrrMin.value.copy(IRR.min);
    shared.uIrrInvSize.value.set(1 / (IRR.max.x - IRR.min.x), 1 / (IRR.max.y - IRR.min.y), 1 / (IRR.max.z - IRR.min.z));
    this.blockHeightAt = irr.heightAt;
    T('irradiance', t0);
    progress(0.7);
    const ps = await paintDone;
    this.timings.paint = Math.round(performance.now() - tPaint);
    this.timings.paintWorkers = ps?.workers ?? 0;
  }

  buildLamps() {
    for (const L of LAMPS) {
      const f = facadeById(L.facade);
      const out = L.out ?? 0.18;
      const pos = facadeToWorld(f, L.u, L.y, out);
      const n = facadeNormal(f);
      const light = new THREE.SpotLight(L.color, L.intensity, L.spot.dist, L.spot.angle, L.spot.penumbra, 2);
      light.position.copy(pos);
      const target = pos.clone().addScaledVector(n, out < 0 ? -0.6 : 1.1);
      target.y = 0;
      light.target.position.copy(target);
      light.castShadow = !!L.shadow;
      if (light.castShadow) {
        light.shadow.mapSize.set(1024, 1024);
        light.shadow.camera.near = 0.15;
        light.shadow.camera.far = L.spot.dist;
        light.shadow.bias = -0.0004;
        light.shadow.normalBias = 0.02;
        light.shadow.radius = 3;
      }
      this.scene.add(light, light.target);
      this.lamps.push({ def: L, light, base: L.intensity, pos, normal: n });
    }
    for (const P of POLES) {
      if (!P.light) continue;
      // cobra head arm reaches toward the alley centre (−X for poles on the right)
      const dir = P.x > 0 ? -1 : 1;
      const pos = new THREE.Vector3(P.x + dir * P.light.reach, P.light.height - 0.15, P.z);
      const light = new THREE.SpotLight(0xff9440, 15, 26, 1.2, 0.55, 2);
      light.position.copy(pos);
      light.target.position.set(pos.x + dir * 0.6, 0, pos.z);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.camera.near = 0.3;
      light.shadow.camera.far = 26;
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = 0.02;
      light.shadow.radius = 3;
      this.scene.add(light, light.target);
      this.lamps.push({ def: { id: P.id, kind: 'cobra', flicker: 0.02 }, light, base: 15, pos, normal: new THREE.Vector3(0, -1, 0) });
    }
  }

  collectVPLs() {
    const vpls = [];
    for (const l of this.lamps) {
      const p = l.light.position;
      const c = l.light.color.clone().multiplyScalar(l.base);
      // light hitting the ground below bounces up (wet asphalt is dark: low albedo)
      const ground = l.light.target.position.clone();
      ground.y = 0.05;
      vpls.push({ pos: ground, color: c.clone().multiplyScalar(0.03), dir: new THREE.Vector3(0, 1, 0), radius: 1.2, reach: 12 });
      // light hitting the nearby wall bounces back into the alley
      if (l.def.kind !== 'cobra') {
        const wall = p.clone().addScaledVector(l.normal, -Math.max(0, (l.def.out ?? 0.18) - 0.05));
        wall.y = Math.max(0.6, p.y - 1.2);
        vpls.push({ pos: wall, color: c.clone().multiplyScalar(0.04), dir: l.normal.clone(), radius: 1.0, reach: 10 });
      }
    }
    // lit windows spill warm light outward
    for (const fx of this.facadeData.fixtures) {
      if (fx.kind !== 'window' || !fx.lit) continue;
      const n = facadeNormal(fx.facade);
      const p = fx.center.clone().addScaledVector(n, 0.4);
      vpls.push({ pos: p, color: new THREE.Color(1.0, 0.62, 0.3).multiplyScalar(0.12), dir: n, radius: 0.8, reach: 9 });
    }
    return vpls;
  }

  groundHeight(x, z) {
    return this.ground ? this.ground.sample.smoothHeight(x, z) : 0;
  }

  /** Footstep surface name at a point (matches the audio engine's surfaces). */
  surfaceAt(x, z) {
    if (!this.ground) return 'asphalt';
    const w = this.ground.sample.water(x, z);
    const m = this.ground.sample.material(x, z);
    if (m === GMAT.GRATE) return 'grate';
    if (m === GMAT.MANHOLE) return 'metal';
    if (w > 0.004) return 'puddle';
    if (w > 0.0008) return 'wet';
    const litter = this.props?.surfaceAt(x, z);
    if (litter) return litter;
    if (m === GMAT.CONCRETE || m === GMAT.SIDEWALK || m === GMAT.BRICK || m === GMAT.CURB) return 'concrete';
    if (m === GMAT.GRAVEL) return 'debris';
    return 'asphalt';
  }

  /** Deterministic gust function (replaced by the audio engine's windAt when available). */
  windAt(t) {
    if (this.engine.audio?.windAt) return this.engine.audio.windAt(t);
    const g = 0.5 + 0.5 * Math.sin(t * 0.21) * Math.sin(t * 0.077 + 1.3);
    const gust = Math.max(0, Math.sin(t * 0.13 + 2.0)) ** 6;
    return Math.min(1, 0.15 + 0.45 * g + 0.5 * gust);
  }

  update(dt, t) {
    shared.uWind.value = this.windAt(t);
    this.windows?.update(dt, t);
    this.props?.update(dt, t);
    this.traffic?.update(dt, t);
    // lamp flicker
    for (const l of this.lamps) {
      const fl = l.def.flicker ?? 0;
      if (fl <= 0) continue;
      l.light.intensity = l.base * this.flickerValue(l, t, fl);
    }
  }

  flickerValue(l, t, amount) {
    // mostly steady, occasional bursts of rapid flicker (shared with audio buzz)
    const s = l.def.id.length * 13.37;
    const slow = Math.sin(t * 0.37 + s) * Math.sin(t * 0.13 + s * 2.1);
    const burst = slow > 0.82 ? 1 : 0;
    let v = 1 - 0.02 * amount * Math.sin(t * 50 + s);
    if (burst && amount > 0.3) {
      const n = Math.sin(t * 61.0 + s) * Math.sin(t * 23.3 + s) + Math.sin(t * 7.1);
      v *= n > 0.2 ? 1 : n > -0.6 ? 0.35 : 0.05;
    }
    l.flicker = v;
    return v;
  }
}
