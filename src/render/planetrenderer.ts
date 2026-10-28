/**
 * Renders one solid planet/moon: terrain quadtree (activated by angular size),
 * terrain material uniforms, atmosphere LUTs + composite pass, cloud layer.
 */
import * as THREE from 'three';
import type { Body } from '../astro/body';
import { TerrainQuadtree } from '../terrain/quadtree';
import type { TerrainWorkerPool } from '../terrain/workerpool';
import { createTerrainMaterial } from './terrainmaterial';
import { SurfaceScatter } from './scatter';
import { Fauna } from './fauna';
import { Fliers, Floaters } from './aerial';
import { Precipitation } from './precipitation';
import { SurfaceGenerator } from '../terrain/surface';
import { AtmosphereLUTs } from './atmosphere';
import { AtmospherePass, auroraFor } from './atmospherepass';
import { CloudLayer } from './clouds';

export interface SunLight {
  body: Body;
  rel: THREE.Vector3;           // camera-relative position
  color: [number, number, number];
  luminosity: number;           // W
  radius: number;
}

export interface FrameContext {
  time: number;
  frame: number;
  pixelAngle: number;
  camQuat: THREE.Quaternion;
  camera: THREE.PerspectiveCamera;
  suns: SunLight[];
  quality: { lodK: number; atmSteps: number; cloudSteps: number; detail: number; scatter?: number };
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m3 = new THREE.Matrix3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const SOLAR_CONSTANT = 3.828e26 / (4 * Math.PI * 1.495978707e11 ** 2);

export function sunIlluminanceAt(s: SunLight, pRel: THREE.Vector3, outDir: THREE.Vector3, outIllum: THREE.Vector3) {
  outDir.copy(s.rel).sub(pRel);
  const d = outDir.length();
  outDir.multiplyScalar(1 / d);
  const E = s.luminosity / (4 * Math.PI * d * d) / SOLAR_CONSTANT;
  outIllum.set(s.color[0] * E, s.color[1] * E, s.color[2] * E);
}

export class PlanetRenderer {
  readonly group = new THREE.Group();
  terrain: TerrainQuadtree | null = null;
  readonly material: THREE.ShaderMaterial;
  luts: AtmosphereLUTs | null = null;
  clouds: CloudLayer | null = null;
  atmPass: AtmospherePass | null = null;
  private lutReady = false;
  terrainActive = false;
  atmosphereVisible = false;
  /** occluding spheres for eclipses (camera-relative centre, radius) */
  occluders: THREE.Vector4[] = [];
  /** rocks and plants near the camera */
  scatter: SurfaceScatter | null = null;
  fauna: Fauna | null = null;
  floaters: Floaters | null = null;
  fliers: Fliers | null = null;
  precip: Precipitation | null = null;
  /** camera altitude above this planet's surface (m), from the last update */
  camAltitude = Infinity;
  /** planet orientation and camera-relative centre used this frame */
  readonly lastRel = new THREE.Vector3();
  readonly lastRot = new THREE.Quaternion();
  readonly lastCamBody = new THREE.Vector3();
  private weatherHere: { coverage: number; height: number } | null = null;
  private lastTime = NaN;
  private gen: SurfaceGenerator | null = null;

  constructor(readonly body: Body, readonly pool: TerrainWorkerPool, private renderer: THREE.WebGLRenderer) {
    const sp = body.planet!.surface!;
    const hasAtm = !!body.planet!.atmosphereRender;
    this.material = createTerrainMaterial(sp, { hasAtmosphere: hasAtm, clouds: hasAtm && !!body.planet!.clouds });
    this.group.matrixAutoUpdate = true;
  }

  private ensureAtmosphere() {
    const p = this.body.planet!;
    if (this.lutReady || !p.atmosphereRender) return;
    this.luts = new AtmosphereLUTs(p.atmosphereRender);
    this.luts.compute(this.renderer);
    this.luts.bind(this.material.uniforms);
    if (p.clouds) this.clouds = new CloudLayer(p.clouds, this.renderer);
    this.atmPass = new AtmospherePass(this.luts, this.clouds);
    this.lutReady = true;
  }

  /**
   * rel: planet centre relative to camera (universe axes).
   * rot: planet orientation (body-fixed → universe).
   * camBody: camera position in the body-fixed frame.
   */
  update(ctx: FrameContext, rel: THREE.Vector3, rot: THREE.Quaternion, camBody: THREE.Vector3) {
    const R = this.body.radius;
    const dist = rel.length();
    const angular = R / Math.max(dist, 1);
    // terrain once the disc spans a few pixels; drop it far away to free memory
    const want = angular > ctx.pixelAngle * 1.5;
    if (want && !this.terrain) {
      this.terrain = new TerrainQuadtree(this.body.id, this.body.planet!.surface!, this.pool, this.material);
      this.group.add(this.terrain.group);
    } else if (!want && this.terrain && angular < ctx.pixelAngle * 0.3) {
      this.group.remove(this.terrain.group);
      this.terrain.dispose();
      this.terrain = null;
    }
    this.terrainActive = !!this.terrain && want;
    this.group.visible = this.terrainActive;
    if (!this.terrainActive) {
      this.atmosphereVisible = false;
      return;
    }
    this.ensureAtmosphere();
    this.group.position.copy(rel);
    this.group.quaternion.copy(rot);
    this.terrain!.lodK = ctx.quality.lodK;
    const camDir = _v2.set(0, 0, -1).applyQuaternion(ctx.camQuat).applyQuaternion(_q.copy(rot).invert());
    this.terrain!.update(camBody, camDir);

    // ground scatter (created on first approach; shares this material's uniforms)
    const altCam = camBody.length() - R;
    this.camAltitude = altCam;
    this.lastRel.copy(rel);
    this.lastRot.copy(rot);
    this.lastCamBody.copy(camBody);
    if (!this.scatter && altCam < 4000) {
      this.gen = new SurfaceGenerator(this.body.planet!.surface!);
      this.scatter = new SurfaceScatter(this.body, this.material.uniforms, !!this.luts);
      this.group.add(this.scatter.group);
    }
    if (this.scatter) {
      const lvl = this.terrain?.stats.maxLevel ?? 0;
      const spacing = (Math.PI / 2) * R / Math.pow(2, lvl) / 32;
      this.scatter.update(this.gen, camBody, ctx.time, ctx.quality.scatter ?? 0.85, spacing);
      if (!this.fauna && this.body.planet!.life.kind === 'complex') {
        this.fauna = new Fauna(this.body, this.scatter.rockMat);
        this.group.add(this.fauna.group);
      }
      if (!this.floaters && this.body.planet!.life.kind === 'complex') {
        this.floaters = new Floaters(this.body, this.scatter.aerialMaterial());
        this.fliers = new Fliers(this.body, this.scatter.aerialMaterial());
        this.group.add(this.floaters.group, this.fliers.group);
      }
      const dt = isFinite(this.lastTime) ? Math.max(0, ctx.time - this.lastTime) : 0;
      const sunB = ctx.suns[0] ? ctx.suns[0].rel.clone().sub(rel).normalize().applyQuaternion(rot.clone().invert()) : null;
      const storm = this.precip?.kind === 'rain' || this.precip?.kind === 'snow' ? this.precip.intensity : 0;
      const lifeOn = (ctx.quality.scatter ?? 0.85) > 0;
      this.fauna?.update(this.gen, camBody, dt, lifeOn, sunB, storm);
      this.floaters?.update(this.gen, camBody, ctx.time % 1e6, lifeOn);
      this.fliers?.update(this.gen, camBody, ctx.time % 1e6, lifeOn, sunB, storm);
    }
    // local precipitation / airborne particles
    if (!this.precip && this.body.planet!.atmosphere && altCam < 3000) {
      this.precip = new Precipitation(this.body);
      this.group.add(this.precip.group);
    }
    if (this.precip && this.gen) {
      const dirB = _v2.copy(camBody).normalize();
      if (this.clouds && this.atmPass && (ctx.frame % 30 === 0 || !this.weatherHere)) {
        const a = this.atmPass.material.uniforms.uCloudDrift.value as number;
        const c = Math.cos(a), sn = Math.sin(a);
        const wd = new THREE.Vector3(c * dirB.x + sn * dirB.z, dirB.y, -sn * dirB.x + c * dirB.z);
        this.weatherHere = this.clouds.sample(this.renderer, wd);
      }
      const s0 = ctx.suns[0];
      const light = new THREE.Vector3();
      if (s0) {
        const L = new THREE.Vector3(), E = new THREE.Vector3();
        sunIlluminanceAt(s0, rel, L, E);
        const upW = _v.copy(camBody).normalize().applyQuaternion(rot);
        const muS = upW.dot(L);
        light.copy(E).multiplyScalar(Math.max(muS, 0) * 0.55 + Math.max(muS + 0.1, 0) * 0.25);
      }
      const temp = this.gen.sample(dirB.x, dirB.y, dirB.z, 50).temp;
      const dtp = isFinite(this.lastTime) ? Math.min(0.2, Math.max(0, ctx.time - this.lastTime)) : 0;
      this.precip.update(dtp, ctx.time, camBody, rot, this.weatherHere, light, altCam, temp, (ctx.quality.scatter ?? 0.85) > 0);
    }
    this.lastTime = ctx.time;

    const u = this.material.uniforms;
    u.uPlanetCenter.value.copy(rel);
    u.uWorldToPlanet.value.setFromMatrix4(_m4.makeRotationFromQuaternion(_q.copy(rot).invert()));
    // seasons from axial tilt: subsolar latitude and an amplitude set by thermal inertia
    if (ctx.suns[0] && !this.body.rotation.locked) {
      const sunB = _v.copy(ctx.suns[0].rel).sub(rel).normalize().applyQuaternion(_q.copy(rot).invert());
      const P = this.body.planet!.atmosphere?.pressure ?? 0;
      const ocean = this.body.planet!.surface!.oceanFraction;
      const amp = Math.min(80, 30 * (1 + 0.6 / (0.15 + P)) * (1 - 0.5 * ocean));
      u.uSeason.value.set(sunB.y * 2, amp);
    } else u.uSeason.value.set(0, 0);
    u.uTime.value = ctx.time % 100000;
    u.uPixelAngle.value = ctx.pixelAngle;
    u.uLodK.value = ctx.quality.lodK;
    u.uDetail.value = ctx.quality.detail;
    for (let k = 0; k < 2; k++) {
      const s = ctx.suns[k];
      if (s) {
        sunIlluminanceAt(s, rel, u.uSunDir.value[k], u.uSunIllum.value[k]);
        u.uSunPos.value[k].set(s.rel.x, s.rel.y, s.rel.z, s.radius);
      } else {
        u.uSunIllum.value[k].set(0, 0, 0);
      }
    }
    const n = Math.min(4, this.occluders.length);
    for (let i = 0; i < n; i++) u.uOcc.value[i].copy(this.occluders[i]);
    u.uOccCount.value = n;

    // atmosphere composite pass uniforms
    this.atmosphereVisible = !!this.atmPass;
    if (this.atmPass) {
      const au = this.atmPass.material.uniforms;
      au.uCamPos.value.copy(rel).negate();
      au.uInvProj.value.copy(ctx.camera.projectionMatrixInverse);
      _m4.makeRotationFromQuaternion(ctx.camQuat);
      au.uViewToWorld.value.setFromMatrix4(_m4);
      au.uFar.value = ctx.camera.far;
      au.uFrame.value = ctx.frame % 64;
      au.uSteps.value = ctx.quality.atmSteps;
      au.uAxis.value.set(0, 1, 0).applyQuaternion(rot); // spherical: no oblateness stretch (uOblate = 0)
      updateAurora(au, this.body, ctx, rel);
      for (let k = 0; k < 2; k++) {
        au.uSunDir.value[k].copy(u.uSunDir.value[k]);
        au.uSunIllum.value[k].copy(u.uSunIllum.value[k]);
      }
      if (this.clouds) {
        _m4.makeRotationFromQuaternion(_q.copy(rot).invert());
        au.uWorldToPlanet.value.setFromMatrix4(_m4);
        au.uCloudTime.value = ctx.time % 1e5;
        const wind = this.clouds.params.windSpeed / (this.body.radius + this.clouds.params.bottom);
        au.uCloudDrift.value = (ctx.time * wind) % (Math.PI * 2);
        // the same weather drives cloud shadows on the ground
        const cp = this.clouds.params;
        u.uShadowWeather.value = this.clouds.weather.texture;
        u.uShadowDrift.value = au.uCloudDrift.value;
        u.uCloudMidR.value = this.body.radius + (cp.bottom + cp.top) / 2;
        u.uShadowStrength.value = Math.min(1, cp.density * (cp.top - cp.bottom) * 0.02);
        au.uCloudSteps.value = ctx.quality.cloudSteps;
        au.uPixelAngle.value = ctx.pixelAngle;
      }
      // skip when the atmosphere is sub-pixel
      const Rt = this.luts!.params.topRadius;
      this.atmosphereVisible = Rt / Math.max(dist, 1) > ctx.pixelAngle * 2;
    }
  }

  get stats() {
    return this.terrain?.stats;
  }

  dispose() {
    if (this.terrain) this.terrain.dispose();
    this.scatter?.dispose();
    this.fauna?.dispose();
    this.floaters?.dispose();
    this.fliers?.dispose();
    this.precip?.dispose();
    this.luts?.dispose();
    this.clouds?.dispose();
    this.material.dispose();
    this.atmPass?.material.dispose();
  }
}

export { _v, _v2, _m3 };

/** Set aurora uniforms on an atmosphere pass from the body's magnetosphere and the host star. */
export function updateAurora(au: Record<string, THREE.IUniform>, body: Body, ctx: FrameContext, rel: THREE.Vector3) {
  const p = body.planet;
  const s = ctx.suns[0];
  if (!p || !p.atmosphere || !s || !au.uAurora) return;
  const distAU = s.rel.distanceTo(rel) / 1.495978707e11;
  const giant = p.type === 'gas-giant' || p.type === 'ice-giant';
  const a = auroraFor(giant ? Math.max(p.magneticField, 5) : p.magneticField, p.atmosphere.composition, s.body.star?.activity ?? 0.3, distAU, giant);
  au.uAurora.value = a ? a.intensity : 0;
  if (a) {
    (au.uAuroraLow.value as THREE.Vector3).set(...a.low);
    (au.uAuroraHigh.value as THREE.Vector3).set(...a.high);
  }
  au.uAuroraTime.value = ctx.time % 1e5;
}
