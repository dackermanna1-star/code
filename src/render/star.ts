/**
 * Resolved star rendering: photosphere sphere (limb darkening, convective
 * granulation scaled to surface gravity, starspots scaled by activity,
 * faculae) and a faint coronal halo. Radiance is physical: σT⁴/π relative to
 * the solar-constant unit, so exposure handles the brightness range.
 */
import * as THREE from 'three';
import { NOISE_GLSL } from './shaders/noise.glsl';
import { SIGMA_SB, SOLAR_CONSTANT } from '../core/constants';
import type { Body } from '../astro/body';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vObjN;
varying vec3 vWorldN;
varying vec3 vWorldPos;
void main() {
  vObjN = normalize(position);
  vWorldN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}
uniform vec3 uColor;
uniform float uRadiance;
uniform float uTime;
uniform float uActivity;
uniform float uGranScale;
uniform float uLimb;
uniform float uSeed;
varying vec3 vObjN;
varying vec3 vWorldN;
varying vec3 vWorldPos;
void main() {
  #include <logdepthbuf_fragment>
  vec3 V = normalize(-vWorldPos);
  float mu = clamp(dot(normalize(vWorldN), V), 0.0, 1.0);
  // quadratic limb darkening
  float limb = 1.0 - uLimb * (1.0 - mu) - 0.2 * uLimb * (1.0 - mu) * (1.0 - mu);
  vec3 p = vObjN * uGranScale + vec3(uSeed);
  // granulation: bright cell centres, dark lanes, slowly evolving
  vec3 c = cellular(p + vec3(0.0, uTime * 0.02, 0.0));
  float gran = 0.88 + 0.24 * smoothstep(0.0, 0.5, c.y - c.x);
  vec3 c2 = cellular(p * 0.23 + vec3(uTime * 0.004));
  gran *= 0.95 + 0.1 * smoothstep(0.0, 0.6, c2.y - c2.x);
  // starspots (umbra/penumbra) in activity belts
  float lat = abs(vObjN.y);
  float belt = smoothstep(0.05, 0.2, lat) * smoothstep(0.6, 0.35, lat);
  float sp = fbm3(vObjN * 5.0 + vec3(uSeed * 1.7, uTime * 0.0005, 0.0), 4);
  float spot = smoothstep(0.62 - uActivity * 0.25, 0.7 - uActivity * 0.25, sp + 0.35) * belt * uActivity;
  float umbra = smoothstep(0.72 - uActivity * 0.25, 0.78 - uActivity * 0.25, sp + 0.35) * belt * uActivity;
  float fac = smoothstep(0.5, 0.62, sp + 0.35) * belt * uActivity * (1.0 - mu) * 0.4;
  float b = gran * limb * (1.0 - 0.45 * spot - 0.45 * umbra) * (1.0 + fac);
  vec3 col = uColor * uRadiance * b;
  // cooler limb is redder
  col *= mix(vec3(1.0), vec3(1.08, 0.95, 0.85), (1.0 - mu) * 0.6);
  gl_FragColor = vec4(min(col, vec3(6e4)), 1.0);
}
`;

const HALO_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vQ;
void main() {
  vQ = position.xy;
  vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float s = length(modelMatrix[0].xyz);
  c.xy += position.xy * s;
  gl_Position = projectionMatrix * c;
  #include <logdepthbuf_vertex>
}
`;

const HALO_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uRadiance;
uniform float uInner; // star radius as fraction of quad half-size
varying vec2 vQ;
void main() {
  #include <logdepthbuf_fragment>
  float r = length(vQ);
  if (r < uInner * 0.995 || r > 1.0) discard;
  float x = r / uInner; // in stellar radii
  // K-corona-like power-law falloff (very faint relative to the disc)
  float k = 2e-5 * pow(x, -4.0) + 4e-7 * pow(x, -2.2);
  float fade = smoothstep(1.0, 0.7, r);
  gl_FragColor = vec4(uColor * uRadiance * k * fade, 1.0);
}
`;

export function starRadiance(T: number): number {
  return (SIGMA_SB * T ** 4) / Math.PI / SOLAR_CONSTANT;
}

export class StarRenderer {
  readonly group = new THREE.Group();
  readonly sphere: THREE.Mesh;
  readonly halo: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private haloMat: THREE.ShaderMaterial;

  constructor(readonly body: Body) {
    const s = body.star!;
    const R = body.radius;
    const geo = new THREE.SphereGeometry(1, 96, 64);
    const gscale = THREE.MathUtils.clamp(60 * Math.sqrt(R / 6.957e8), 30, 400);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uColor: { value: new THREE.Vector3(...s.color) },
        uRadiance: { value: starRadiance(s.temperature) },
        uTime: { value: 0 },
        uActivity: { value: s.activity },
        uGranScale: { value: gscale },
        uLimb: { value: THREE.MathUtils.clamp(0.95 - (s.temperature - 3000) / 30000, 0.35, 0.85) },
        uSeed: { value: (body.id.length * 13.7) % 50 },
      },
    });
    this.sphere = new THREE.Mesh(geo, this.mat);
    this.sphere.scale.setScalar(R);
    this.haloMat = new THREE.ShaderMaterial({
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      uniforms: {
        uColor: { value: new THREE.Vector3(...s.color) },
        uRadiance: { value: starRadiance(s.temperature) },
        uInner: { value: 1 / 6 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.haloMat);
    this.halo.scale.setScalar(R * 6);
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 5;
    this.group.add(this.sphere, this.halo);
  }

  update(rel: THREE.Vector3, rot: THREE.Quaternion, time: number, pixelAngle: number) {
    this.group.position.copy(rel);
    this.sphere.quaternion.copy(rot);
    this.mat.uniforms.uTime.value = time % 1e6;
    const ang = this.body.radius / Math.max(rel.length(), 1);
    // hide when sub-pixel (point sprite takes over)
    this.group.visible = ang > pixelAngle * 0.75;
  }

  dispose() {
    this.sphere.geometry.dispose();
    this.halo.geometry.dispose();
    this.mat.dispose();
    this.haloMat.dispose();
  }
}
