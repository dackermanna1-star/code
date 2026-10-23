import * as THREE from 'three';
import { U } from '../engine/uniforms.js';
import { LOGDEPTH_GLSL, CLIPMAP_GLSL } from '../shaders/common.js';
import { ATMOSPHERE_USE_GLSL } from './atmosphere.js';

// Wind-blown sand, entirely on the GPU and stateless: each particle's position is a pure
// function of its seed, the integrated wind travel and the terrain. Particles live in a
// box that wraps around the camera, so the count stays constant however far you walk.
//
//  GRAIN: saltating sand hopping along the surface. Height follows the max of the ground
//         and a few upwind samples, so grains carried over a dune crest keep flying and
//         form plumes off the brink before settling.
//  DUST:  big soft wisps that give windy days and storms their volume.
//  Kicks: short ballistic bursts thrown up by footsteps and landings.

const QUAD = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
const QUAD_INDEX = [0, 1, 2, 0, 2, 3];

const COMMON_FRAG = /* glsl */ `
${CLIPMAP_GLSL}
${ATMOSPHERE_USE_GLSL}
uniform float uOpacity;
varying vec2 vQuad;
varying float vAlpha;
varying vec3 vWorld;

vec4 shadeGrain(float a) {
  vec3 L = uLightDir;
  vec3 V = normalize(cameraPosition - vWorld);
  // Lit about like the sand it came from, glowing a little when backlit by a low sun.
  float fwd = pow(max(dot(-V, L), 0.0), 6.0);
  vec3 alb = vec3(0.62, 0.4, 0.22);
  float sh = clipShadow(vWorld.xz);
  float ndl = max(L.y, 0.0) * 0.6 + 0.25;
  vec3 col = alb / ATM_PI * (keyLightIrradiance() * (ndl + 1.2 * fwd) * sh + skyIrradiance(vec3(0.0, 1.0, 0.0)));
  col = applyAerial(col, vWorld);
  return vec4(col * exposure() * a, a);
}
`;

const FIELD_VERT = /* glsl */ `
${LOGDEPTH_GLSL}
${CLIPMAP_GLSL}
attribute vec4 aSeed;
uniform vec2 uWindDir;
uniform float uWindSpeed;
uniform vec2 uWindOffset;
uniform float uStorm;
uniform float uAmount;
uniform float uBox;
varying vec2 vQuad;
varying float vAlpha;
varying vec3 vWorld;

void main() {
  if (aSeed.w > uAmount) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
#ifdef GRAIN
  float speedMul = 0.45 + 0.75 * aSeed.z;
#else
  float speedMul = 0.7 + 0.5 * aSeed.z;
#endif
  vec2 p = aSeed.xy * uBox + uWindOffset * speedMul;
  vec2 rel = mod(p - cameraPosition.xz + 0.5 * uBox, uBox) - 0.5 * uBox;
  p = cameraPosition.xz + rel;
  float edge = 1.0 - smoothstep(0.36, 0.5, max(abs(rel.x), abs(rel.y)) / uBox);
  float spd = uWindSpeed * speedMul;
  float ground = clipHeight(p);
#ifdef GRAIN
  float hopLen = 0.25 + 0.1 * spd * (0.5 + aSeed.z);
  float u = fract(dot(p, uWindDir) / hopLen + aSeed.w * 13.0);
  float hopH = (0.015 + 0.2 * aSeed.y * aSeed.y) * (0.25 + spd / 10.0);
  float up1 = clipHeight(p - uWindDir * 2.5) - 0.25;
  float up2 = clipHeight(p - uWindDir * 7.0) - 1.0;
  float base = max(ground, max(up1, up2));
  float y = base + hopH * 4.0 * u * (1.0 - u) + uStorm * aSeed.y * aSeed.z * 5.0;
  vec3 vel = vec3(uWindDir.x, (hopH * 4.0 * (1.0 - 2.0 * u)) / hopLen, uWindDir.y) * spd;
  float size = 0.0035 + 0.005 * aSeed.z;
#else
  float y = ground + 0.2 + aSeed.y * aSeed.y * (1.5 + 16.0 * uStorm);
  y += sin(aSeed.x * 40.0 + uWindOffset.x * 0.05) * 0.3;
  vec3 vel = vec3(uWindDir.x, 0.0, uWindDir.y) * spd;
  float size = mix(0.8, 3.0, aSeed.z) * (1.0 + 1.5 * uStorm);
#endif
  vec3 wp = vec3(p.x, y, p.y);
  vec4 vp = viewMatrix * vec4(wp, 1.0);
  vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz;
  float l2 = length(vv.xy);
  vec2 sd = l2 > 1e-5 ? vv.xy / l2 : vec2(1.0, 0.0);
  vec2 pd = vec2(-sd.y, sd.x);
#ifdef GRAIN
  // Motion streak: roughly what a 1/60 s exposure would smear.
  float streak = size + l2 * 0.016;
#else
  float streak = size * 1.6;
#endif
  vp.xy += sd * position.x * streak + pd * position.y * size;
  float dist = length(vp.xyz);
  vQuad = position.xy;
  vAlpha = edge * smoothstep(0.25, 1.2, dist) * (1.0 - smoothstep(uBox * 0.32, uBox * 0.5, dist));
  vWorld = wp;
  gl_Position = logDepth(projectionMatrix * vp);
}
`;

const FIELD_FRAG = /* glsl */ `
${COMMON_FRAG}
uniform float uStormOpacity;
void main() {
  float r = length(vQuad);
#ifdef GRAIN
  float a = (1.0 - smoothstep(0.3, 1.0, r)) * vAlpha * uOpacity;
#else
  float a = (1.0 - smoothstep(0.0, 1.0, r)) * vAlpha * uOpacity;
  a *= a;
#endif
  if (a < 0.002) discard;
  gl_FragColor = shadeGrain(a);
}
`;

const KICK_VERT = /* glsl */ `
${LOGDEPTH_GLSL}
attribute vec4 aOrigin; // x, y, z, birth time
attribute vec4 aVel;    // vx, vy, vz, size
uniform float uTime;
varying vec2 vQuad;
varying float vAlpha;
varying vec3 vWorld;
void main() {
  float t = uTime - aOrigin.w;
  const float life = 0.9;
  if (t < 0.0 || t > life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // Ballistic with strong air drag: sand puffs out, then drifts down.
  float drag = 3.5;
  float k = (1.0 - exp(-drag * t)) / drag;
  vec3 wp = aOrigin.xyz + aVel.xyz * k + vec3(0.0, -4.0, 0.0) * t * t * 0.5;
  vec4 vp = viewMatrix * vec4(wp, 1.0);
  float size = aVel.w * (1.0 + t * 1.5);
  vp.xy += position.xy * size;
  vQuad = position.xy;
  vAlpha = (1.0 - t / life) * (1.0 - t / life) * smoothstep(0.15, 0.6, length(vp.xyz));
  vWorld = wp;
  gl_Position = logDepth(projectionMatrix * vp);
}
`;

const KICK_FRAG = /* glsl */ `
${COMMON_FRAG}
void main() {
  float r = length(vQuad);
  float a = (1.0 - smoothstep(0.0, 1.0, r));
  a = a * a * vAlpha * uOpacity;
  if (a < 0.003) discard;
  // A puff of fine sand, not individual sparkling grains: matte and mostly in shadow.
  vec4 c = shadeGrain(a);
  gl_FragColor = vec4(c.rgb * 0.55, c.a);
}
`;

function quadGeometry(instances, attrs) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(QUAD, 3));
  g.setIndex(QUAD_INDEX);
  for (const [name, attr] of Object.entries(attrs)) g.setAttribute(name, attr);
  g.instanceCount = instances;
  return g;
}

export class SandParticles {
  constructor(atmosphere, atlas, quality) {
    this.group = new THREE.Group();
    const base = () => ({
      ...atmosphere.materialUniforms(),
      uLogDepthFC: U.uLogDepthFC,
      tHeight: U.tHeight,
      tNormal: U.tNormal,
      tShadow: U.tShadow,
      uClip: U.uClip,
      uAtlasInv: U.uAtlasInv,
      uWindDir: U.uWindDir,
      uWindSpeed: U.uWindSpeed,
      uWindOffset: U.uWindOffset,
      uStorm: U.uStorm,
      uTime: U.uTime,
    });
    const matOpts = { transparent: true, depthWrite: false, premultipliedAlpha: true, blending: THREE.NormalBlending };

    const makeField = (count, define, box, opacity) => {
      const seeds = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        seeds[i * 4] = Math.random();
        seeds[i * 4 + 1] = Math.random();
        seeds[i * 4 + 2] = Math.random();
        seeds[i * 4 + 3] = (i + Math.random()) / count; // ordered: lower w = always active
      }
      const geo = quadGeometry(count, { aSeed: new THREE.InstancedBufferAttribute(seeds, 4) });
      const mat = new THREE.ShaderMaterial({
        vertexShader: FIELD_VERT,
        fragmentShader: FIELD_FRAG,
        defines: { ...atlas.defines, [define]: 1 },
        uniforms: { ...base(), uAmount: { value: 0 }, uBox: { value: box }, uOpacity: { value: opacity }, uStormOpacity: { value: 0 } },
        ...matOpts,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 60;
      this.group.add(mesh);
      return mesh;
    };
    this.grains = makeField(quality.particles, 'GRAIN', 34, 0.5);
    this.dust = makeField(Math.max(200, Math.round(quality.particles / 10)), 'DUST', 110, 0.22);

    // Footstep kicks: a ring buffer of short-lived particles.
    this.kickCount = 512;
    this.kickOrigin = new THREE.InstancedBufferAttribute(new Float32Array(this.kickCount * 4).fill(-1e4), 4);
    this.kickVel = new THREE.InstancedBufferAttribute(new Float32Array(this.kickCount * 4), 4);
    this.kickOrigin.setUsage(THREE.DynamicDrawUsage);
    this.kickVel.setUsage(THREE.DynamicDrawUsage);
    const kgeo = quadGeometry(this.kickCount, { aOrigin: this.kickOrigin, aVel: this.kickVel });
    const kmat = new THREE.ShaderMaterial({
      vertexShader: KICK_VERT,
      fragmentShader: KICK_FRAG,
      defines: { ...atlas.defines },
      uniforms: { ...base(), uOpacity: { value: 0.32 } },
      ...matOpts,
    });
    this.kicks = new THREE.Mesh(kgeo, kmat);
    this.kicks.frustumCulled = false;
    this.kicks.renderOrder = 61;
    this.group.add(this.kicks);
    this.kickCursor = 0;
    this.kickDirty = false;
  }

  /** Throw sand from a footstep (or a landing when count is large). */
  kick(x, y, z, heading, speed, count = 8) {
    const fx = Math.sin(heading);
    const fz = -Math.cos(heading);
    const now = U.uTime.value;
    const o = this.kickOrigin.array;
    const v = this.kickVel.array;
    for (let i = 0; i < count; i++) {
      const k = this.kickCursor;
      this.kickCursor = (this.kickCursor + 1) % this.kickCount;
      const a = Math.random() * Math.PI * 2;
      const spread = 0.25 + Math.random() * 0.5;
      // Walking flicks sand forward off the toe; running throws it back.
      const along = speed > 3 ? -0.6 - Math.random() * 0.9 : 0.15 + Math.random() * 0.35;
      o[k * 4] = x + Math.cos(a) * 0.05;
      o[k * 4 + 1] = y + 0.03;
      o[k * 4 + 2] = z + Math.sin(a) * 0.05;
      o[k * 4 + 3] = now + Math.random() * 0.03;
      v[k * 4] = fx * along * (0.6 + speed * 0.4) + Math.cos(a) * spread;
      v[k * 4 + 1] = 0.6 + Math.random() * (0.6 + speed * 0.25);
      v[k * 4 + 2] = fz * along * (0.6 + speed * 0.4) + Math.sin(a) * spread;
      v[k * 4 + 3] = 0.03 + Math.random() * 0.05;
    }
    this.kickDirty = true;
  }

  update(weather) {
    const c = weather.current;
    // Sand only starts to saltate above ~5 m/s.
    const w = U.uWindSpeed.value;
    const sal = Math.min(1, Math.max(0, (w - 4.5) / 5));
    this.grains.material.uniforms.uAmount.value = Math.min(1, c.particles * sal);
    this.dust.material.uniforms.uAmount.value = Math.min(1, Math.max(0, c.particles - 0.35) * 1.4 + c.storm * 0.5);
    this.dust.material.uniforms.uOpacity.value = 0.12 + 0.35 * c.storm;
    this.grains.visible = this.grains.material.uniforms.uAmount.value > 0.001;
    this.dust.visible = this.dust.material.uniforms.uAmount.value > 0.001;
    if (this.kickDirty) {
      this.kickOrigin.needsUpdate = true;
      this.kickVel.needsUpdate = true;
      this.kickDirty = false;
    }
  }
}
