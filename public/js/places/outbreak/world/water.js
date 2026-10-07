// Water: the sea, the river and the lake, all with one shader - two layers
// of moving ripples, the sky reflected more at grazing angles (Fresnel), the
// sun's glitter, clear turquoise shallows over sand fading to deep blue-green,
// and a line of foam where it meets the shore. It reads the height map, so it
// knows how deep it is everywhere.
import * as THREE from 'three';
import { HEIGHT_GLSL, heightTexture } from './terrainView.js';
import { waterNormalTex } from '../textures.js';
import { spline } from './terrain.js';
import { RIVER, LAKE, SIZE } from './layout.js';

const VS = `
varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FS = `
uniform sampler2D nMap;
uniform vec3 sunDir, sunCol, skyCol, horCol, deep, shallow;
uniform float time, flow, rough, sunI, night;
varying vec3 vW;
${HEIGHT_GLSL}
#include <fog_pars_fragment>
void main() {
  vec2 p = vW.xz;
  vec2 drift = vec2(time * 0.012, time * 0.007) + vec2(0.0, time * flow);
  vec3 n1 = texture2D(nMap, p / 70.0 + drift).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(nMap, p / 23.0 * mat2(0.8, -0.6, 0.6, 0.8) - drift * 1.7).xyz * 2.0 - 1.0;
  // calmer further off (the ripples are too small to see; strong normals there just sparkle)
  float far = smoothstep(25.0, 700.0, length(cameraPosition - vW));
  vec3 n = normalize(vec3((n1.xy + n2.xy * 0.6) * mix(0.6, 0.16, far), 1.0 / rough));
  n = normalize(vec3(n.x, n.z, n.y));
  vec3 v = normalize(cameraPosition - vW);
  float depth = max(0.0, vW.y - hAt(p));
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 refl = mix(horCol, skyCol, smoothstep(0.0, 0.5, r.y));
  vec3 body = mix(shallow, deep, smoothstep(0.0, 14.0, depth));
  vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));
  // the sun glitters on it
  vec3 h = normalize(sunDir + v);
  float spec = pow(max(dot(n, h), 0.0), 380.0) * 2.2 + pow(max(dot(n, h), 0.0), 40.0) * 0.08;
  col += sunCol * spec * sunI;
  // foam on the shore
  float foam = (1.0 - smoothstep(0.0, 1.6, depth)) * (0.55 + 0.45 * sin(time * 1.3 + p.x * 0.05 + p.y * 0.07));
  foam *= smoothstep(0.35, 0.7, texture2D(nMap, p / 9.0 + drift * 3.0).x);
  col = mix(col, vec3(0.85, 0.9, 0.92) * (1.0 - night * 0.85), foam * 0.6);
  float alpha = clamp(0.55 + depth * 0.08 + fres * 0.4, 0.0, 0.97);
  alpha *= smoothstep(0.0, 0.35, depth);
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}`;

export class Water {
  constructor(world, T) {
    this.world = world;
    this.uniforms = {
      hMap: { value: heightTexture(T) }, nMap: { value: waterNormalTex() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(1, 1, 1) }, skyCol: { value: new THREE.Color(0x4a7ab0) }, horCol: { value: new THREE.Color(0xa8c0d8) },
      deep: { value: new THREE.Color(0x0e2e3a) }, shallow: { value: new THREE.Color(0x3a7a78) },
      time: { value: 0 }, flow: { value: 0 }, rough: { value: 1.6 }, sunI: { value: 1 }, night: { value: 0 },
    };
    const mk = (flow) => {
      const u = { ...this.uniforms, flow: { value: flow }, ...THREE.UniformsLib.fog };
      const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: u, transparent: true, depthWrite: false, fog: true });
      return m;
    };
    this.seaMat = mk(0);
    this.riverMat = mk(-0.05);
    // the sea: a huge plane at sea level
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 4, SIZE * 4, 1, 1).rotateX(-Math.PI / 2), this.seaMat);
    sea.position.y = 0;
    sea.renderOrder = 2;
    world.scene.add(sea);
    this.sea = sea;
    // the lake
    const lg = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
    const lake = new THREE.Mesh(lg, this.seaMat);
    lake.scale.set(LAKE.rx * 1.25, 1, LAKE.rz * 1.25); lake.position.set(LAKE.x, LAKE.level, LAKE.z);
    lake.renderOrder = 2;
    world.scene.add(lake);
    // the river: a ribbon following its course, falling with the land
    const pts = T.river, pos = [], idx = [];
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
      const w = RIVER.w * 0.75 + 4;
      const y = pts[k].level;
      pos.push(pts[k].x + nx * w, y, pts[k].z + nz * w, pts[k].x - nx * w, y, pts[k].z - nz * w);
      if (k < pts.length - 1) { const q = k * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setIndex(idx); rg.computeBoundingSphere();
    const river = new THREE.Mesh(rg, this.riverMat);
    river.renderOrder = 2;
    world.scene.add(river);
    this.meshes = [sea, lake, river];
  }
  update(dt, sky) {
    const u = this.uniforms, su = sky.uniforms;
    u.time.value += dt;
    u.sunDir.value.copy(su.sunDir.value.y > 0 ? su.sunDir.value : su.moonDir.value);
    u.sunCol.value.copy(su.sunDir.value.y > 0 ? su.sunCol.value : new THREE.Color(0x8aa0d8));
    u.sunI.value = su.sunDir.value.y > 0 ? sky.sun.intensity * 0.6 : sky.moon.intensity * 0.6;
    u.skyCol.value.copy(su.zenith.value); u.horCol.value.copy(su.horizon.value);
    u.night.value = su.night.value;
    const nk = 1 - su.night.value * 0.85;
    u.deep.value.setHex(0x0e2e3a).multiplyScalar(nk * (1 - sky.w.cover * 0.3));
    u.shallow.value.setHex(0x3a7a78).multiplyScalar(nk * (1 - sky.w.cover * 0.3));
    u.rough.value = 1.6 + sky.w.wind * 1.4;
    this.sea.position.x = Math.round(this.world.camera.position.x / 200) * 200;
    this.sea.position.z = Math.round(this.world.camera.position.z / 200) * 200;
  }
}

void spline;
