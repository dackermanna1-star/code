// The vehicles' own effects: tyre smoke, engine smoke and fire, spray off
// boats, rotor dust, a fireball and flying wreckage when one blows up, and
// the player's headlight beams at night. Two instanced billboard pools (one
// alpha-blended for smoke, one additive for fire, sparks and glints), each a
// single draw call; a small pool of debris meshes (Kenney crash parts).
//
//   const fx = new VehFX(scene)
//   fx.smoke(x, y, z, vx, vy, vz, life, size0, size1, shade, alpha)
//   fx.flame(x, y, z, vx, vy, vz, life, size, heat)
//   fx.spark(x, y, z, vx, vy, vz)  fx.spray(x, y, z, vx, vy, vz, size)
//   fx.fireball(pos, size)  fx.debris(name, pos, vel, spin)
//   fx.update(dt, camera, light)
import * as THREE from 'three';
import { V } from '../state.js';
import { debrisGeometry, debrisMaterial } from './models.js';

function puffTexture() {
  const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d');
  const img = x.createImageData(S, S);
  // a soft lumpy puff: radial falloff times a little value noise
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blobs = []; for (let i = 0; i < 9; i++) blobs.push([S / 2 + (rnd() - 0.5) * S * 0.4, S / 2 + (rnd() - 0.5) * S * 0.4, S * (0.16 + rnd() * 0.14)]);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const dx = (i - S / 2) / (S / 2), dy = (j - S / 2) / (S / 2);
    let a = Math.max(0, 1 - Math.hypot(dx, dy)); a = a * a * (3 - 2 * a);
    let b = 0; for (const [bx, by, br] of blobs) b += Math.max(0, 1 - Math.hypot(i - bx, j - by) / br);
    a *= 0.55 + Math.min(0.45, b * 0.3);
    const k = (j * S + i) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(a * 255);
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const VERT = `
attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iSz;
varying vec2 vUv; varying vec4 vCol;
#include <fog_pars_vertex>
void main() {
  vUv = uv; vCol = iCol;
  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSz.y), s = sin(iSz.y);
  mvPosition.xy += vec2(c * position.x - s * position.y, s * position.x + c * position.y) * iSz.x;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = `
uniform sampler2D map; uniform float uLight;
varying vec2 vUv; varying vec4 vCol;
#include <fog_pars_fragment>
void main() {
  float a = texture2D(map, vUv).a * vCol.a;
  if (a < 0.004) discard;
#ifdef ADD
  gl_FragColor = vec4(vCol.rgb, a);
  #ifdef USE_FOG
    float fd = vFogDepth;
    #ifdef FOG_EXP2
      float ff = 1.0 - exp(-fogDensity * fogDensity * fd * fd);
    #else
      float ff = smoothstep(fogNear, fogFar, fd);
    #endif
    gl_FragColor.a *= 1.0 - ff;
  #endif
#else
  gl_FragColor = vec4(vCol.rgb * uLight, a);
  #include <fog_fragment>
#endif
}`;

/** A pool of camera-facing particles simulated on the CPU. */
class Pool {
  constructor(scene, max, additive, tex) {
    this.max = max; this.n = 0;
    // simulation state (struct of arrays)
    const f = (k) => new Float32Array(max * k);
    this.p = f(3); this.v = f(3); this.age = f(1); this.life = f(1); this.s0 = f(1); this.s1 = f(1);
    this.c = f(3); this.a = f(1); this.rot = f(1); this.rv = f(1); this.grav = f(1); this.drag = f(1);
    // instance attributes
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.attributes.position); g.setAttribute('uv', quad.attributes.uv);
    this.iPos = new THREE.InstancedBufferAttribute(f(3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iCol = new THREE.InstancedBufferAttribute(f(4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iSz = new THREE.InstancedBufferAttribute(f(2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.iPos); g.setAttribute('iCol', this.iCol); g.setAttribute('iSz', this.iSz);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uLight: { value: 1 } }]),
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, defines: additive ? { ADD: 1 } : {},
    });
    this.mat.uniforms.map.value = tex;
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 5;
    this.mesh.name = additive ? 'vehFire' : 'vehSmoke';
    this.geo = g;
    scene.add(this.mesh);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0.5) {
    let i = this.n;
    if (i >= this.max) { i = (Math.random() * this.max) | 0; } else this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.c[i * 3] = r; this.c[i * 3 + 1] = g; this.c[i * 3 + 2] = b; this.a[i] = a;
    this.rot[i] = Math.random() * 6.283; this.rv[i] = (Math.random() - 0.5) * 1.5; this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    let n = this.n;
    const p = this.p, v = this.v, P = this.iPos.array, Cc = this.iCol.array, Sz = this.iSz.array;
    for (let i = 0; i < n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        // swap with the last
        n--;
        if (i !== n) this._move(n, i);
        i--; continue;
      }
      const k = 1 - Math.min(1, this.drag[i] * dt);
      v[i * 3] *= k; v[i * 3 + 1] = v[i * 3 + 1] * k - this.grav[i] * dt; v[i * 3 + 2] *= k;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      this.rot[i] += this.rv[i] * dt;
      const t = this.age[i] / this.life[i];
      P[i * 3] = p[i * 3]; P[i * 3 + 1] = p[i * 3 + 1]; P[i * 3 + 2] = p[i * 3 + 2];
      // fade in fast, out slow
      const fa = Math.min(1, t * 8) * (1 - t) * (1 - t * 0.3);
      Cc[i * 4] = this.c[i * 3]; Cc[i * 4 + 1] = this.c[i * 3 + 1]; Cc[i * 4 + 2] = this.c[i * 3 + 2]; Cc[i * 4 + 3] = this.a[i] * fa;
      Sz[i * 2] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t); Sz[i * 2 + 1] = this.rot[i];
    }
    this.n = n;
    this.geo.instanceCount = n;
    for (const at of [this.iPos, this.iCol, this.iSz]) { at.clearUpdateRanges(); at.addUpdateRange(0, n * at.itemSize); at.needsUpdate = true; }
    this.mesh.visible = n > 0;
  }
  _move(from, to) {
    const cp = (arr, k) => { for (let q = 0; q < k; q++) arr[to * k + q] = arr[from * k + q]; };
    cp(this.p, 3); cp(this.v, 3); cp(this.age, 1); cp(this.life, 1); cp(this.s0, 1); cp(this.s1, 1); cp(this.c, 3); cp(this.a, 1);
    cp(this.rot, 1); cp(this.rv, 1); cp(this.grav, 1); cp(this.drag, 1);
    cp(this.iPos.array, 3); cp(this.iCol.array, 4); cp(this.iSz.array, 2);
  }
}

const _v = new THREE.Vector3();

export class VehFX {
  constructor(scene) {
    this.scene = scene;
    const tex = puffTexture();
    this.smokeP = new Pool(scene, 1400, false, tex);
    this.fireP = new Pool(scene, 900, true, tex);
    // a flash for explosions (pre-allocated; never added or removed at runtime)
    this.flash = new THREE.PointLight(0xffa040, 0, 160, 1.6);
    this.flash.position.set(0, -1000, 0);
    scene.add(this.flash);
    this.flashT = 0;
    this.siren = null; // { pos, r, b, k } set by the fleet each frame
    this.deb = [];
    this.beams = this._beams();
  }

  smoke(x, y, z, vx, vy, vz, life, s0, s1, shade = 0.8, alpha = 0.5) {
    this.smokeP.emit(x, y, z, vx, vy, vz, life, s0, s1, shade, shade, shade * 1.02, alpha, -2.5, 0.9);
  }
  flame(x, y, z, vx, vy, vz, life, size, heat = 1) {
    this.fireP.emit(x, y, z, vx, vy, vz, life, size, size * 0.35, 3.2 * heat, 1.25 * heat, 0.35 * heat, 0.9, -6, 1.2);
  }
  spark(x, y, z, vx, vy, vz) {
    this.fireP.emit(x, y, z, vx, vy, vz, 0.25 + Math.random() * 0.35, 0.35, 0.12, 6, 3.6, 1.2, 1, 80, 0.3);
  }
  spray(x, y, z, vx, vy, vz, size = 2) {
    // white water: (r, g, b) foam white, then alpha, gravity (it falls back), drag
    this.smokeP.emit(x, y, z, vx, vy, vz, 0.7 + Math.random() * 0.5, size, size * 2.6, 0.95, 0.98, 1, 0.5, 40, 0.6);
  }
  /** A fireball with smoke, sparks and a flash. */
  fireball(p, size = 1) {
    const R = Math.random;
    // a hot core (additive, quick)
    for (let i = 0; i < 14 * size; i++) {
      const a = R() * 6.283, e = R() * 1.2, s = (8 + R() * 22) * size;
      this.fireP.emit(p.x, p.y + 2, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 6, Math.sin(a) * Math.cos(e) * s, 0.35 + R() * 0.4, (8 + R() * 6) * size, (14 + R() * 8) * size, 3.0, 1.4 + R() * 0.5, 0.3, 1, -6, 2.5);
    }
    // the body of the fireball: solid orange puffs that roll up
    for (let i = 0; i < 26 * size; i++) {
      const a = R() * 6.283, e = R() * 1.3, s = (6 + R() * 18) * size, k = R();
      this.smokeP.emit(p.x + (R() - 0.5) * 4, p.y + 1.5, p.z + (R() - 0.5) * 4, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 10, Math.sin(a) * Math.cos(e) * s, 0.45 + R() * 0.5, (6 + R() * 5) * size, (15 + R() * 10) * size, 3.2 + k * 1.2, 1.2 + k * 0.9, 0.2 + k * 0.15, 0.95, -8, 1.8);
    }
    // black smoke after
    for (let i = 0; i < 20 * size; i++) {
      const a = R() * 6.283, s = (4 + R() * 12) * size;
      this.smokeP.emit(p.x, p.y + 4, p.z, Math.cos(a) * s, 10 + R() * 16, Math.sin(a) * s, 3 + R() * 3.5, 8 * size, 28 * size, 0.07, 0.065, 0.06, 0.8, -3, 0.6);
    }
    for (let i = 0; i < 34; i++) { const a = R() * 6.283, s = 30 + R() * 60; this.spark(p.x, p.y + 2, p.z, Math.cos(a) * s, 20 + R() * 50, Math.sin(a) * s); }
    this.flash.position.set(p.x, p.y + 12, p.z);
    this.flashT = 0.8;
  }
  /** A piece of wreckage flying off. */
  debris(name, p, vx, vy, vz, spin = 8) {
    let d;
    if (this.deb.length >= 36) { d = this.deb.shift(); d.mesh.geometry = debrisGeometry(name); }
    else { d = { mesh: new THREE.Mesh(debrisGeometry(name), debrisMaterial()) }; this.scene.add(d.mesh); }
    d.mesh.visible = true;
    d.mesh.position.copy(p);
    d.v = new THREE.Vector3(vx, vy, vz);
    d.w = new THREE.Vector3((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin);
    d.t = 0; d.rest = false;
    d.r = d.mesh.geometry.boundingSphere.radius * 0.5;
    this.deb.push(d);
    return d;
  }

  update(dt, camera, light = 1) {
    this.smokeP.mat.uniforms.uLight.value = light;
    this.smokeP.update(dt);
    this.fireP.update(dt);
    if (this.flashT > 0) { this.flashT = Math.max(0, this.flashT - dt); this.flash.intensity = this.flashT * this.flashT * 7000; this.flash.color.setRGB(1, 0.62, 0.25); }
    else if (this.siren) {
      // no explosion going on: the light becomes the nearest light bar's red/blue spill
      const s = this.siren;
      this.flash.position.copy(s.pos);
      this.flash.color.setRGB(s.r ? 1 : 0.15, 0.1, s.r ? 0.08 : 1);
      this.flash.intensity = (s.r || s.b) ? 2400 * s.k : 0;
    } else if (this.flash.intensity) this.flash.intensity = 0;
    // debris: fly, tumble, bounce, rest, fade
    for (let i = this.deb.length - 1; i >= 0; i--) {
      const d = this.deb[i], m = d.mesh;
      d.t += dt;
      if (d.t > 40) { m.visible = false; this.deb.splice(i, 1); this.scene.remove(m); continue; }
      if (d.rest) continue;
      d.v.y -= 80 * dt;
      m.position.addScaledVector(d.v, dt);
      m.rotation.x += d.w.x * dt; m.rotation.y += d.w.y * dt; m.rotation.z += d.w.z * dt;
      const g = V.phys ? V.phys.groundAt(m.position.x, m.position.y + 2, m.position.z, 0.3, 2) : 3;
      if (m.position.y < g + d.r * 0.3) {
        m.position.y = g + d.r * 0.3;
        if (V.ground.heightAt(m.position.x, m.position.z) < -0.05 && g < 0.5) { d.v.multiplyScalar(0.2); d.v.y = -2; if (m.position.y < -6) { d.rest = true; m.visible = false; } continue; }
        if (Math.abs(d.v.y) < 6 && Math.hypot(d.v.x, d.v.z) < 3) { d.rest = true; m.rotation.x = Math.round(m.rotation.x / Math.PI) * Math.PI; m.rotation.z = Math.round(m.rotation.z / Math.PI) * Math.PI; continue; }
        d.v.y = -d.v.y * 0.35; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6);
        if (Math.abs(d.v.y) > 10) this.spark(m.position.x, m.position.y, m.position.z, d.v.x, 15, d.v.z);
      }
    }
  }

  // ---- the player's headlights at night: two beams on the road and a spot light ----------------------------------------------
  _beams() {
    const S = 128, cv = document.createElement('canvas'); cv.width = 64; cv.height = S;
    const x = cv.getContext('2d');
    const img = x.createImageData(64, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < 64; i++) {
      const t = j / (S - 1); // 0 = at the car, 1 = far ahead
      const u = (i - 31.5) / 32;
      let a = 0;
      for (const c of [-0.45, 0.45]) { const w = 0.1 + t * 0.45; const dx = (u - c * (1 - t * 0.55)) / w; a += Math.exp(-dx * dx * 1.6); }
      a = Math.min(1, a) * Math.pow(Math.sin(Math.min(1, t * 6) * Math.PI / 2), 1) * Math.pow(1 - t, 1.4);
      const k = (j * 64 + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(a * 255);
    }
    x.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.0, 0.9, 0.7), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'headlightBeams';
    mesh.renderOrder = 3;
    mesh.visible = false;
    this.scene.add(mesh);
    const spot = new THREE.SpotLight(0xffe2b8, 0, 220, 0.5, 0.55, 1.2);
    spot.position.set(0, -1000, 0);
    this.scene.add(spot); this.scene.add(spot.target);
    return { mesh, spot };
  }
  /** Point the beams from a vehicle (or hide them with null). */
  headlights(v, night) {
    const b = this.beams;
    if (!v || night < 0.05 || !v.lights || v.dead) { b.mesh.visible = false; b.spot.intensity = 0; return; }
    const d = v.def;
    const h = Math.atan2(v._fw.x, v._fw.z);
    const len = 70, w = Math.max(16, d.size.w * 2.6);
    _v.set(0, 0, d.hull.z1 - 1).applyQuaternion(v.quat).add(v.pos);
    const g = V.phys.groundAt(_v.x, v.pos.y + 2, _v.z, 0.5, 2);
    b.mesh.visible = true;
    b.mesh.position.set(_v.x, g + 0.12, _v.z);
    b.mesh.rotation.set(0, h, 0);
    b.mesh.scale.set(w, 1, len);
    b.mesh.material.opacity = 0.28 * night;
    b.spot.intensity = 2800 * night;
    _v.set(0, d.hull.y1 * 0.45, d.hull.z1).applyQuaternion(v.quat).add(v.pos);
    b.spot.position.copy(_v);
    _v.set(0, -2, 60).applyQuaternion(v.quat).add(v.pos);
    b.spot.target.position.copy(_v);
    b.spot.target.updateMatrixWorld();
  }
}
