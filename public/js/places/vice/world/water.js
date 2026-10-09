// The sea around Vice City - the ocean, the bay, the marinas and the canals -
// all one surface at y = 0 that follows the camera and fills everything the
// ground carves below sea level (world/ground.js).
//
// It is drawn in two passes over the same camera-centred grid:
//   1. absorb: multiplies what's under it (the seabed, already drawn) by the
//      water's transmittance - red goes first, so white sand turns turquoise
//      in the shallows, teal further out and disappears in the deep;
//   2. light: adds the light scattered in the water (teal to navy with depth),
//      the sky's reflection (Fresnel, with the sky's own clouds and sunset
//      colours - SKY_GLSL), the sun's (or the moon's) glitter, whitecaps,
//      surf lines rolling onto the beaches and foam where it meets the shore.
// The swell is real geometry near the camera, from the same waves as waveAt().
//
//   const water = new Water(world, ground);
//   water.update(dt, sky)
//   water.waveAt(x, z, t = water.t) -> surface height (0 +- 0.6) for boats and swimmers
//   water.depthAt(x, z) -> depth of the water below the still surface (0 on land)
//   water.t (s), water.uniforms
import * as THREE from 'three';
import { V } from '../state.js';
import { SKY_GLSL } from './sky.js';
import { groundTexture, groundGLSL } from './terrain.js';
import { waterNormalTex, noiseTex, cloudTex } from './textures.js';
import { smooth } from '../../outbreak/noise.js';

const GW = 9.81 / 0.33;  // gravity in studs/s² for the waves' speed (deep water: w = sqrt(g k))
// the swell: direction of travel (x, z), wavelength, amplitude (the ocean swell rolls in from the east)
const WAVES = [
  [-0.96, 0.28, 150, 0.26],
  [-0.8, -0.6, 82, 0.14],
  [-0.99, -0.12, 47, 0.08],
  [-0.45, 0.89, 27, 0.05],
].map(([dx, dz, L, a], i) => {
  const l = Math.hypot(dx, dz), k = (Math.PI * 2) / L;
  return { kx: (dx / l) * k, kz: (dz / l) * k, om: Math.sqrt(GW * k), a, L, ph: i * 1.7 + 0.3 };
});
const SWASH = 0.085;     // the slow rise and fall of the water on the beaches
const GRID_N = 160, GRID_R = 1500, GRID_FAR = 24000;

const WAVE_GLSL = `
uniform vec4 wK[4];   // kx, kz, omega, amplitude
uniform vec4 wP[4];   // phase, wavelength, -, -
uniform float wTime;
// how big the swell is here: calm in the bay and canals, full on the open ocean, none in the shallows
float waveAtt(vec2 p, float depth) {
  float open = max(smoothstep(3000.0, 3700.0, p.x), smoothstep(3000.0, 3900.0, p.y));
  return smoothstep(0.2, 7.0, depth) * (0.32 + 0.68 * open);
}
// height and slope (dh/dx, dh/dz) of the swell; fade: drops the short waves far from the camera
vec3 waves(vec2 p, float dist) {
  vec3 o = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float f = 1.0 - smoothstep(wP[i].y * 8.0, wP[i].y * 14.0, dist);
    float ph = wK[i].x * p.x + wK[i].y * p.y - wK[i].z * wTime + wP[i].x;
    float a = wK[i].w * f;
    o.x += a * sin(ph);
    float c = a * cos(ph);
    o.y += c * wK[i].x; o.z += c * wK[i].y;
  }
  return o;
}
float swash(float coast, float depth) {
  return ${SWASH.toFixed(3)} * sin(wTime * 0.75 + coast * 0.06) * (1.0 - smoothstep(0.5, 3.0, depth));
}`;

function vertexShader(G) {
  return `
${groundGLSL(G)}
${WAVE_GLSL}
uniform vec2 gridPos;
varying vec3 vW;
varying vec2 vG;   // still-water depth, coast distance
#include <fog_pars_vertex>
void main() {
  vec2 p = position.xz + gridPos;
  vec2 g = groundAt(p);
  float depth = max(-g.x, 0.0);
  float dist = length(p - cameraPosition.xz);
  float y = waves(p, dist).x * waveAtt(p, depth) + swash(g.y, depth);
  vec4 wp = vec4(p.x, y, p.y, 1.0);
  vW = wp.xyz; vG = vec2(depth, g.y);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
}

function fragmentShader(G, absorb) {
  return `
${absorb ? '#define ABSORB' : ''}
${SKY_GLSL}
${groundGLSL(G)}
${WAVE_GLSL}
uniform sampler2D nMap, noiseT;
uniform vec3 lightCol, specDir, specCol, deepCol, midCol, absorbK;
uniform float specI, night, wind;
varying vec3 vW;
varying vec2 vG;
#include <fog_pars_fragment>
void main() {
  vec2 p = vW.xz;
  float bed = hAt(p);
  float depth = vW.y - bed;           // water above the ground here
  float dist = length(cameraPosition - vW);
  float far = smoothstep(60.0, 1400.0, dist);
  // the surface: the swell's slope plus two layers of drifting ripples (calmer far away)
  float att = waveAtt(p, max(vG.x, 0.0));
  vec3 wv = waves(p, dist);
  vec2 drift = vec2(wTime * 0.011, wTime * 0.006);
  vec2 n1 = texture(nMap, p / 61.0 + drift).xy * 2.0 - 1.0;
  vec2 n2 = texture(nMap, (p / 19.0) * mat2(0.8, -0.6, 0.6, 0.8) - drift * 1.9).xy * 2.0 - 1.0;
  vec2 n3 = texture(nMap, p / 233.0 - drift * 0.4).xy * 2.0 - 1.0;
  float rip = mix(0.75, 0.3, far) * (0.7 + wind * 0.6);
  vec2 slope = wv.yz * att + (n1 * 0.55 + n2 * 0.4) * rip * 0.22 + n3 * 0.06;
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 v = normalize(cameraPosition - vW);
  float nv = max(dot(n, v), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  // foam: the shore, surf lines rolling in on the beaches, whitecaps out at sea
  float lace = texture(noiseT, p / 6.5 + drift * 3.0).r * 0.6 + texture(nMap, p / 4.3 - drift * 2.0).x * 0.5;
  float shore = 1.0 - smoothstep(0.0, 0.14, depth);
  float coast = vG.y;
  float zone = smoothstep(0.35, 0.8, vG.x) * (1.0 - smoothstep(1.2, 2.6, vG.x)) * (1.0 - smoothstep(-20.0, -140.0, coast));
  float ph = coast / 30.0 - wTime * 0.1;
  float band = fract(ph);
  float brk = texture(noiseT, p / 70.0 + vec2(floor(ph) * 0.37, 0.0)).g;
  float surf = smoothstep(0.0, 0.02, band) * (1.0 - smoothstep(0.025, 0.13, band)) * zone * smoothstep(0.42, 0.6, brk);
  float crest = wv.x * att / 0.5;
  float caps = smoothstep(0.55, 0.95, crest) * smoothstep(0.62, 0.8, texture(noiseT, p / 37.0 + drift * 2.0).b) * wind * (1.0 - far);
  float foam = clamp(shore * smoothstep(0.45, 0.85, lace + shore * 0.2) * 0.85 + surf * smoothstep(0.2, 0.6, lace + 0.15) + caps, 0.0, 1.0);
  foam *= 1.0 - smoothstep(600.0, 1600.0, dist);
  // transmittance down to the bed and back (red goes first)
  float dd = max(depth, 0.0);
  vec3 T = exp(-absorbK * dd * (1.0 + (1.0 - nv) * 0.6));
#ifdef ABSORB
  vec3 keep = T * (1.0 - F) * (1.0 - foam);
  gl_FragColor = vec4(keep, 1.0);
  #ifdef USE_FOG
    // (the same fog as the light pass, so the two add up)
    #include <fog_fragment>
    gl_FragColor.rgb = keep * (1.0 - fogFactor);
  #endif
#else
  // light scattered in the water: teal, deepening to navy
  vec3 scat = mix(midCol, deepCol, smoothstep(3.0, 20.0, dd));
  vec3 body = scat * lightCol * (1.0 - T) * 0.62;
  // the sky reflected (the reflection never points below the horizon)
  // (rough water reflects a little higher up the sky, so a little bluer)
  vec3 r = reflect(-v, n); r.y = abs(r.y) + 0.05 + far * 0.03; r = normalize(r);
  vec3 refl = skyColor(r) * 0.9;
  // the sun's (moon's) glitter: sharp up close, a broad path further off
  vec3 h = normalize(specDir + v);
  float nh = max(dot(n, h), 0.0);
  float pw = mix(1400.0, 160.0, far);
  float spec = pow(nh, pw) * (pw + 8.0) / 50.0 + pow(nh, 70.0) * 0.18;
  vec3 col = body * (1.0 - F) * (1.0 - foam) + refl * F * (1.0 - foam) + specCol * spec * specI * (1.0 - foam);
  // light through the crests (towards the sun)
  col += midCol * lightCol * pow(max(dot(-v, specDir), 0.0), 4.0) * max(wv.x * att, 0.0) * 0.8 * (1.0 - night);
  col += lightCol * vec3(0.92, 0.96, 1.0) * foam * 0.85;
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
#endif
}`;
}

export class Water {
  constructor(world, ground) {
    this.world = world; this.G = ground;
    this.t = 0;
    const sky = V.sky;
    this.uniforms = {
      hMap: { value: groundTexture(ground) }, nMap: { value: waterNormalTex() }, noiseT: { value: noiseTex() },
      wK: { value: WAVES.map((w) => new THREE.Vector4(w.kx, w.kz, w.om, w.a)) }, wP: { value: WAVES.map((w) => new THREE.Vector4(w.ph, w.L, 0, 0)) }, wTime: { value: 0 },
      gridPos: { value: new THREE.Vector2() },
      lightCol: { value: new THREE.Color(1, 1, 1) }, specDir: { value: new THREE.Vector3(0, 1, 0) }, specCol: { value: new THREE.Color(1, 1, 1) }, specI: { value: 1 },
      deepCol: { value: new THREE.Color(0x0b3a78) }, midCol: { value: new THREE.Color(0x1a98a4) }, absorbK: { value: new THREE.Vector3(0.45, 0.07, 0.04) },
      night: { value: 0 }, wind: { value: 0.4 },
    };
    // the sky's uniforms (shared objects, so they stay in step), or stand-ins without a sky
    const skyU = sky?.uniforms || {
      skZen: { value: new THREE.Color(0x1456d2) }, skHor: { value: new THREE.Color(0xa6cef6) }, skHorSun: { value: new THREE.Color(0xdceafa) }, skSunCol: { value: new THREE.Color(1, 1, 1) },
      skSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.3).normalize() }, skMoonDir: { value: new THREE.Vector3(0, 1, 0) }, skCloudLit: { value: new THREE.Color(1, 1, 1) }, skCloudShade: { value: new THREE.Color(0.6, 0.65, 0.75) },
      skBelt: { value: new THREE.Color(0, 0, 0) }, skP: { value: new THREE.Vector4(0.3, 0, 0.3, 0) }, skP2: { value: new THREE.Vector4(0.5, 0, 0, 40) }, skCloud: { value: cloudTex() },
    };
    const vs = vertexShader(ground);
    const mk = (absorb) => new THREE.ShaderMaterial({
      vertexShader: vs, fragmentShader: fragmentShader(ground, absorb),
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      transparent: true, depthWrite: !absorb, fog: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: absorb ? THREE.ZeroFactor : THREE.OneFactor, blendDst: absorb ? THREE.SrcColorFactor : THREE.OneFactor,
    });
    this.absorbMat = mk(true); this.lightMat = mk(false);
    for (const m of [this.absorbMat, this.lightMat]) Object.assign(m.uniforms, this.uniforms, skyU);
    const geo = this._grid();
    this.absorb = new THREE.Mesh(geo, this.absorbMat);
    this.light = new THREE.Mesh(geo, this.lightMat);
    this.absorb.renderOrder = -100; this.light.renderOrder = -99;
    for (const m of [this.absorb, this.light]) { m.frustumCulled = false; m.name = 'water'; world.scene.add(m); }
    this.meshes = [this.absorb, this.light];
    this._hid = false;
  }

  /** A square grid, dense in the middle (2 studs) and coarse at the edge, with a far skirt. */
  _grid() {
    const n = GRID_N, V1 = n + 1, pos = new Float32Array(V1 * V1 * 3), idx = [];
    const s = (u) => GRID_R * (0.1 * u + 0.9 * u * Math.abs(u));
    for (let j = 0; j < V1; j++) for (let i = 0; i < V1; i++) {
      const u = (i / n) * 2 - 1, w = (j / n) * 2 - 1, k = (j * V1 + i) * 3;
      const edge = i === 0 || j === 0 || i === n || j === n;
      pos[k] = edge && Math.abs(u) === 1 ? Math.sign(u) * GRID_FAR : s(u);
      pos[k + 2] = edge && Math.abs(w) === 1 ? Math.sign(w) * GRID_FAR : s(w);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * V1 + i, b = a + 1, c = a + V1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  /** Depth of the still water at (x, z) (0 on land). */
  depthAt(x, z) { return Math.max(0, -this.G.heightAt(x, z)); }

  /** The height of the sea surface at (x, z) at time t (the same waves the sea is drawn with). */
  waveAt(x, z, t = this.t) {
    const depth = this.depthAt(x, z);
    const open = Math.max(smooth(3000, 3700, x), smooth(3000, 3900, z));
    const att = smooth(0.2, 7, depth) * (0.32 + 0.68 * open);
    let h = 0;
    if (att > 0) for (let i = 0; i < 4; i++) { const w = WAVES[i]; h += w.a * Math.sin(w.kx * x + w.kz * z - w.om * t + w.ph); }
    const sw = depth < 3 ? SWASH * Math.sin(t * 0.75 + this.G.coastAt(x, z) * 0.06) * (1 - smooth(0.5, 3, depth)) : 0;
    return h * att + sw;
  }

  update(dt, sky) {
    // the debug stand-in sea isn't needed once this draws
    if (!this._hid && V.debug?.children?.[1]) { V.debug.children[1].visible = false; this._hid = true; }
    this.t += dt;
    const u = this.uniforms, cam = this.world.camera.position;
    u.wTime.value = this.t;
    u.gridPos.value.set(Math.round(cam.x / 8) * 8, Math.round(cam.z / 8) * 8);
    if (!sky?.uniforms) return;
    const su = sky.uniforms, st = sky.state, S = sky.sun, H = sky.hemi;
    // the light that falls on the water: sun (or moon) plus sky
    const ld = sky.lightDir || su.skSunDir.value;
    u.lightCol.value.copy(S.color).multiplyScalar(S.intensity * Math.max(0, ld.y) * 0.32)
      .add(_c.copy(H.color).multiplyScalar(H.intensity * 0.5));
    // glitter from the sun by day, the moon by night
    const day = su.skSunDir.value.y > -0.02;
    u.specDir.value.copy(day ? su.skSunDir.value : su.skMoonDir.value);
    u.specCol.value.copy(S.color);
    u.specI.value = day ? S.intensity * 1.6 : S.intensity * 3.5;
    u.night.value = st.night;
    u.wind.value = st.wind ?? 0.4;
  }
}
const _c = new THREE.Color();
