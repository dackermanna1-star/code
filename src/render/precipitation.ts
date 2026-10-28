/**
 * Local precipitation and airborne particles around the observer: rain,
 * snow, windblown dust and volcanic ash.
 *
 * What falls follows the world: water rain or snow by temperature, slow
 * methane rain on Titan-like worlds; dust on dry dusty worlds when the wind
 * is up; ash near active volcanism. Rain and snow only fall under thick
 * cloud (read from the same weather map the clouds are rendered from).
 * Terminal fall speed scales as √(g/ρ) relative to Earth, so drops drift
 * down slowly in dense air and low gravity.
 *
 * Particles live in a box around the camera, wrapped in the planet-fixed
 * frame so they stay put in the world while the observer moves.
 */
import * as THREE from 'three';
import type { Body } from '../astro/body';
import { PRE_EXPOSURE_TEX, PRE_EXPOSURE_GLSL } from './exposure';
import { noise3 } from '../core/noise';

export type PrecipKind = 'none' | 'rain' | 'snow' | 'dust' | 'ash';

const BOX = 36; // m
const N = 6000;

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aSeed;     // xyz in [0,1), w random
attribute float aEnd;     // 0 = head, 1 = tail (rain streaks)
uniform mat3 uBasis;      // local (east, up, north) → world
uniform vec3 uOffset;     // camera position in the local frame, mod BOX
uniform vec3 uVel;        // fall + wind velocity in the local frame (m/s)
uniform float uTime;
uniform float uBox;
uniform float uStreak;    // streak length (s of motion)
uniform float uSize;
uniform float uCount;     // fraction of particles active
uniform float uFlutter;
varying float vAlpha;
void main() {
  if (aSeed.w > uCount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 v = uVel * (0.8 + 0.4 * aSeed.w);
  vec3 p = aSeed.xyz * uBox + v * uTime;
  // flutter (snowflakes, dust)
  p.x += sin(uTime * 1.7 + aSeed.w * 40.0) * uFlutter;
  p.z += cos(uTime * 1.3 + aSeed.w * 23.0) * uFlutter;
  p -= v * uStreak * aEnd;
  // wrap into a box centred on the camera (world-stationary)
  p = mod(p - uOffset + uBox * 0.5 + v * uStreak * aEnd, uBox) - uBox * 0.5 - v * uStreak * aEnd;
  vec3 w = uBasis * p;
  float d = length(w);
  vAlpha = smoothstep(uBox * 0.5, uBox * 0.3, d) * smoothstep(0.3, 1.2, d);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * 300.0 / max(-mv.z, 0.1), 1.0, 12.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;      // radiance (scene units)
uniform float uPoints;
${PRE_EXPOSURE_GLSL}
varying float vAlpha;
void main() {
  #include <logdepthbuf_fragment>
  float a = vAlpha;
  if (uPoints > 0.5) {
    vec2 c = gl_PointCoord - 0.5;
    a *= smoothstep(0.25, 0.05, dot(c, c));
  }
  if (a <= 0.003) discard;
  gl_FragColor = vec4(uColor * uPreExposure * a, a);
}
`;

export class Precipitation {
  readonly group = new THREE.Group();
  private lines: THREE.LineSegments;
  private points: THREE.Points;
  private lineMat: THREE.ShaderMaterial;
  private pointMat: THREE.ShaderMaterial;
  kind: PrecipKind = 'none';
  intensity = 0;
  private target = 0;

  constructor(readonly body: Body) {
    const seeds = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      seeds[i * 4] = Math.random(); seeds[i * 4 + 1] = Math.random(); seeds[i * 4 + 2] = Math.random(); seeds[i * 4 + 3] = Math.random();
    }
    // rain: 2 vertices per drop
    const lg = new THREE.BufferGeometry();
    const ls = new Float32Array(N * 8), le = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < 2; k++) {
        ls.set(seeds.subarray(i * 4, i * 4 + 4), (i * 2 + k) * 4);
        le[i * 2 + k] = k;
      }
    }
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    lg.setAttribute('aSeed', new THREE.BufferAttribute(ls, 4));
    lg.setAttribute('aEnd', new THREE.BufferAttribute(le, 1));
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    pg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    pg.setAttribute('aEnd', new THREE.BufferAttribute(new Float32Array(N), 1));
    const uniforms = () => ({
      uBasis: { value: new THREE.Matrix3() }, uOffset: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3() },
      uTime: { value: 0 }, uBox: { value: BOX }, uStreak: { value: 0 }, uSize: { value: 0.02 }, uCount: { value: 0 }, uFlutter: { value: 0 },
      uColor: { value: new THREE.Vector3() }, uPoints: { value: 0 }, tPreExposure: PRE_EXPOSURE_TEX,
    });
    const common = { vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.NormalBlending };
    this.lineMat = new THREE.ShaderMaterial({ ...common, uniforms: uniforms() });
    this.pointMat = new THREE.ShaderMaterial({ ...common, uniforms: { ...uniforms(), uPoints: { value: 1 } } });
    this.lines = new THREE.LineSegments(lg, this.lineMat);
    this.points = new THREE.Points(pg, this.pointMat);
    this.lines.frustumCulled = this.points.frustumCulled = false;
    this.lines.renderOrder = this.points.renderOrder = 30;
    this.group.add(this.lines, this.points);
    this.group.visible = false;
  }

  /**
   * camBody: camera in planet-fixed coordinates; rot: planet orientation
   * (body → world); weather: cloud coverage/height overhead; light: ambient
   * illuminance (scene units) at the camera; alt: altitude above ground.
   */
  update(dt: number, time: number, camBody: THREE.Vector3, rot: THREE.Quaternion, weather: { coverage: number; height: number } | null,
    light: THREE.Vector3, alt: number, groundTemp: number, enabled: boolean) {
    const p = this.body.planet!;
    const atm = p.atmosphere;
    const clouds = p.clouds;
    let kind: PrecipKind = 'none';
    let target = 0;
    if (enabled && atm && atm.pressure > 0.003 && alt < 3000) {
      const wet = clouds && weather ? smoothstep(0.55, 0.85, weather.coverage) * smoothstep(0.35, 0.75, weather.height) : 0;
      const precipLiquid = p.liquid === 'water' || p.liquid === 'methane' || p.liquid === 'nitrogen' || p.liquid === 'ammonia';
      if (wet > 0.02 && precipLiquid && clouds && clouds.overcast < 0.9) {
        const freezing = p.liquid === 'water' ? groundTemp < 272 : p.liquid === 'methane' ? groundTemp < 88 : false;
        kind = freezing ? 'snow' : 'rain';
        target = wet * (0.4 + 0.6 * clouds.storminess);
      } else if (atm.hazes.includes('dust') || (p.surface && p.surface.dunes > 0.2 && p.liquid === 'none')) {
        // dust lifted when the wind gusts (slowly varying, deterministic in time)
        const gust = noise3(time / 90, camBody.x / 3e4, camBody.z / 3e4, 17) * 0.5 + 0.5;
        kind = 'dust';
        target = smoothstep(0.55, 0.85, gust) * Math.min(1, atm.pressure * 20 + 0.2);
      } else if (p.volcanism > 0.75) {
        kind = 'ash';
        target = 0.25 + 0.25 * (noise3(time / 120, 1, 2, 5) * 0.5 + 0.5);
      }
    }
    if (kind !== this.kind && this.intensity > 0.02) { kind = this.kind; target = 0; }
    this.kind = kind;
    this.target = target;
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * 0.5);
    this.group.visible = this.intensity > 0.01 && this.kind !== 'none';
    if (!this.group.visible) return;

    // local frame at the camera: x = east, y = up, z = north (planet-fixed → world via rot)
    const up = camBody.clone().normalize();
    const east = new THREE.Vector3(-up.z, 0, up.x);
    if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
    east.normalize();
    const north = new THREE.Vector3().crossVectors(up, east);
    const basisB = new THREE.Matrix4().makeBasis(east, up, north);
    const toWorld = new THREE.Matrix4().makeRotationFromQuaternion(rot).multiply(basisB);
    const m3 = new THREE.Matrix3().setFromMatrix4(toWorld);
    const off = new THREE.Vector3(camBody.dot(east), camBody.dot(up), camBody.dot(north));
    off.set(((off.x % BOX) + BOX) % BOX, ((off.y % BOX) + BOX) % BOX, ((off.z % BOX) + BOX) % BOX);

    // terminal velocity relative to Earth: v ∝ √(g / ρ)
    const rhoRel = Math.max(0.01, (atm!.pressure * (atm!.meanMolecularMass / 29) * (288 / Math.max(p.tempMean, 40))));
    const vScale = Math.sqrt((p.gravity / 9.81) / rhoRel);
    const wind = (clouds?.windSpeed ?? 6) * 0.25;
    const windDir = new THREE.Vector3(Math.cos(time * 0.01), 0, Math.sin(time * 0.01));
    let vFall = 0, streak = 0, size = 0.02, flutter = 0, albedo = 0.5, alpha = 1;
    const k = this.kind;
    if (k === 'rain') { vFall = (p.liquid === 'methane' ? 6 : 8) * vScale; streak = 0.045; albedo = 0.35; alpha = 0.6; }
    else if (k === 'snow') { vFall = 1.0 * vScale; size = 0.03; flutter = 0.4; albedo = 0.9; }
    else if (k === 'dust') { vFall = 0.4 * vScale; size = 0.015; flutter = 0.6; albedo = 0.45; }
    else { vFall = 0.8 * vScale; size = 0.025; flutter = 0.3; albedo = 0.18; }
    const horiz = k === 'dust' ? wind * 3 : wind;
    const vel = new THREE.Vector3(windDir.x * horiz, -vFall, windDir.z * horiz);
    const col = new THREE.Vector3().copy(light).multiplyScalar(albedo / Math.PI * alpha);
    if (k === 'dust' || k === 'ash') {
      const pal = p.surface?.palette.sand ?? [0.5, 0.4, 0.3];
      col.multiply(new THREE.Vector3(pal[0] * 2, pal[1] * 2, pal[2] * 2));
    }
    const lines = k === 'rain';
    this.lines.visible = lines;
    this.points.visible = !lines;
    const u = (lines ? this.lineMat : this.pointMat).uniforms;
    u.uBasis.value.copy(m3);
    u.uOffset.value.copy(off);
    u.uVel.value.copy(vel);
    u.uTime.value = time % 3600;
    u.uStreak.value = streak;
    u.uSize.value = size;
    u.uFlutter.value = flutter;
    u.uCount.value = Math.min(1, this.intensity);
    u.uColor.value.copy(col);
  }

  dispose() {
    this.lines.geometry.dispose();
    this.points.geometry.dispose();
    this.lineMat.dispose();
    this.pointMat.dispose();
  }
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
