/**
 * Renders one solid planet/moon: terrain quadtree (activated by angular size),
 * terrain material uniforms, atmosphere LUTs + composite pass, cloud layer.
 */
import * as THREE from 'three';
import type { Body } from '../astro/body';
import { TerrainQuadtree } from '../terrain/quadtree';
import type { TerrainWorkerPool } from '../terrain/workerpool';
import { createTerrainMaterial } from './terrainmaterial';
import { AtmosphereLUTs } from './atmosphere';
import { AtmospherePass } from './atmospherepass';
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
  quality: { lodK: number; atmSteps: number; cloudSteps: number; detail: number };
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

  constructor(readonly body: Body, readonly pool: TerrainWorkerPool, private renderer: THREE.WebGLRenderer) {
    const sp = body.planet!.surface!;
    const hasAtm = !!body.planet!.atmosphereRender;
    this.material = createTerrainMaterial(sp, { hasAtmosphere: hasAtm });
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

    const u = this.material.uniforms;
    u.uPlanetCenter.value.copy(rel);
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
        au.uCloudSteps.value = ctx.quality.cloudSteps;
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
    this.luts?.dispose();
    this.clouds?.dispose();
    this.material.dispose();
    this.atmPass?.material.dispose();
  }
}

export { _v, _v2, _m3 };
