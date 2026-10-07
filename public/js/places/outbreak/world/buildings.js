// Drawing what the building kit made: one mesh per 256-stud square of the
// map for everything solid, one for its glass, and the doors (instanced, so
// each can swing on its own). The material picks each face's photo texture
// from the texture array by the layer stored on its vertices, multiplies in
// the tint, draws wallpaper patterns and paint, bumps it with the normal map,
// darkens it with grime, and lets less of the sky's light in indoors. Rain
// makes the outside wet and shiny.
import * as THREE from 'three';
import { noiseTex } from '../textures.js';
import { Kit, VB } from '../build/kit.js';

const TBN_GLSL = `
mat3 obTBN(vec3 eye, vec3 n, vec2 uv) {
  vec3 q0 = dFdx(eye), q1 = dFdy(eye);
  vec2 st0 = dFdx(uv), st1 = dFdy(uv);
  vec3 q1p = cross(q1, n), q0p = cross(n, q0);
  vec3 T = q1p * st0.x + q0p * st1.x, B = q1p * st0.y + q0p * st1.y;
  float det = max(dot(T, T), dot(B, B));
  float sc = det == 0.0 ? 0.0 : inversesqrt(det);
  return mat3(T * sc, B * sc, n);
}`;

/** The material for kit geometry. */
export function buildingMaterial(photos, o = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const uni = { sCol: photos.surfCol, sNor: photos.surfNor, noiseT: { value: noiseTex() }, wet: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 tint; attribute vec4 lay;\nvarying vec4 vTint; varying vec4 vLay; varying vec2 vSuv; varying vec3 vWp; varying float vUp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vTint = tint; vLay = lay * 255.0; vSuv = uv;
{
  vec4 wp4 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  wp4 = instanceMatrix * wp4;
  #endif
  vWp = (modelMatrix * wp4).xyz;
  vUp = normal.y;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray sCol, sNor; uniform sampler2D noiseT; uniform float wet;
varying vec4 vTint; varying vec4 vLay; varying vec2 vSuv; varying vec3 vWp; varying float vUp;
vec3 bNrm; float bOut;
${TBN_GLSL}`)
      .replace('#include <map_fragment>', `{
  float L = floor(vLay.x + 0.5), pat = floor(vLay.y + 0.5);
  vec4 tc = texture(sCol, vec3(vSuv, L));
  bNrm = texture(sNor, vec3(vSuv, L)).xyz * 2.0 - 1.0;
  vec3 col = tc.rgb;
  vec3 tint = vTint.rgb;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  if (pat > 3.5) {
    // paint: the photo's light and shade, the tint's colour
    float k = pat > 4.5 ? 0.2 : 0.45;
    col = mix(vec3(lum), col, k) * tint * (pat > 4.5 ? 1.7 : 1.55);
    bNrm = mix(vec3(0.0, 0.0, 1.0), bNrm, pat > 4.5 ? 0.25 : 0.6);
  } else {
    col *= tint;
    if (pat > 0.5) {
      // wallpaper: stripes, or a small diamond print, over the tinted plaster
      vec2 p = vSuv * 9.0;
      float m;
      if (pat < 1.5) m = smoothstep(0.32, 0.3, abs(fract(p.x * 2.0) - 0.5)) * 0.5 + smoothstep(0.05, 0.03, abs(fract(p.x * 2.0) - 0.5)) * 0.5;
      else { vec2 q = abs(fract(p * vec2(3.0, 2.2) + vec2(0.0, floor(p.x * 3.0) * 0.5)) - 0.5); m = smoothstep(0.24, 0.2, q.x + q.y); }
      col *= mix(1.0, 0.8, m);
      col = mix(col, col * vec3(1.06, 1.0, 0.9), m);
    }
  }
  // grime: streaks down the walls, dirt in patches
  float g1 = texture(noiseT, vWp.xz / 41.0 + vWp.y / 97.0).r, g2 = texture(noiseT, vec2(vWp.x + vWp.z, vWp.y * 0.25) / 23.0).r;
  float grime = smoothstep(0.45, 0.85, g1) * 0.22 + smoothstep(0.55, 0.9, g2) * 0.14 * (1.0 - abs(vUp));
  col *= 1.0 - grime;
  bOut = smoothstep(0.6, 0.95, vTint.a);
  col *= 1.0 - wet * 0.32 * bOut * (1.0 - smoothstep(0.5, 0.9, vUp) * 0.3);
  diffuseColor.rgb *= col;
}`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = vLay.z / 255.0;
roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.35, wet * bOut);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  mat3 tbn = obTBN(-vViewPosition, normal, vSuv);
  normal = normalize(tbn * vec3(bNrm.xy * 0.8, bNrm.z));
}`)
      .replace('#include <aomap_fragment>', `{
  float ambientOcclusion = vTint.a;
  reflectedLight.indirectDiffuse *= ambientOcclusion;
  reflectedLight.indirectSpecular *= ambientOcclusion * ambientOcclusion;
}`);
  };
  mat.customProgramCacheKey = () => 'ob-bld' + (o.key || '');
  mat.userData.uni = uni;
  return mat;
}

function freeArray() { this.array = null; }

function geometryOf(a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.nrm, 4, true));
  g.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
  g.setAttribute('tint', new THREE.BufferAttribute(a.tint, 4, true));
  g.setAttribute('lay', new THREE.BufferAttribute(a.lay, 4, true));
  g.setIndex(new THREE.BufferAttribute(a.idx, 1));
  g.computeBoundingSphere();
  return g;
}

const DOOR_KINDS = ['wood', 'plank', 'metal', 'gate', 'glass'];

export class Buildings {
  /** K: a Kit that has built everything. */
  constructor(world, K, photos, phys) {
    this.world = world; this.K = K; this.phys = phys;
    this.mat = buildingMaterial(photos);
    this.glassMat = new THREE.MeshStandardMaterial({ color: 0x8a9aa4, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.32, depthWrite: false, envMapIntensity: 1.6, side: THREE.DoubleSide });
    this.meshes = [];
    this.inner = []; // { mesh, x, z }: drawn only when you're near
    this.detail = []; // small things: drawn at middle distance
    let verts = 0, tris = 0, innerVerts = 0, detailVerts = 0;
    const mk = (a, material, o = {}) => {
      const m = new THREE.Mesh(geometryOf(a), material);
      m.castShadow = !!o.shadow; m.receiveShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix();
      if (o.order) m.renderOrder = o.order;
      // the arrays aren't needed once they're on the graphics card
      for (const at of Object.values(m.geometry.attributes)) at.onUpload(freeArray);
      m.geometry.index.onUpload(freeArray);
      world.scene.add(m); this.meshes.push(m);
      return m;
    };
    for (const c of K.cells.values()) {
      const a = c.opaque.arrays();
      if (a.nv) { mk(a, this.mat, { shadow: true }); verts += a.nv; tris += a.idx.length / 3; }
      const ai = c.inner.arrays();
      if (ai.nv) { const m = mk(ai, this.mat, { shadow: true }); m.visible = false; this.inner.push({ mesh: m, x: c.x, z: c.z }); innerVerts += ai.nv; tris += ai.idx.length / 3; }
      const ad = c.detail.arrays();
      if (ad.nv) { const m = mk(ad, this.mat, { shadow: true }); m.visible = false; this.detail.push({ mesh: m, x: c.x, z: c.z }); detailVerts += ad.nv; tris += ad.idx.length / 3; }
      const gl = c.glass.arrays();
      if (gl.nv) mk(gl, this.glassMat, { order: 2 });
      // free the build buffers
      c.opaque = c.inner = c.detail = c.glass = null;
    }
    this.verts = verts; this.innerVerts = innerVerts; this.detailVerts = detailVerts; this.tris = tris;
    if (K.signs?.length) this._signs(K.signs);
    // furniture and clutter: built for the buildings near you, thrown away when you leave
    this.furnished = new Map(); // building id -> { mesh, colliders, loot, ladders }
    this.queue = [];
    this.withJobs = K.buildings.filter((B) => B.jobs?.length).map((B) => ({ B, x: (B.bbox[0] + B.bbox[2]) / 2, z: (B.bbox[1] + B.bbox[3]) / 2, r: Math.hypot(B.bbox[2] - B.bbox[0], B.bbox[3] - B.bbox[1]) / 2 }));
    this.ladders = (K.ladders || []).slice();
    this._scanT = 0;
    this.loadRange = 150; this.unloadRange = 230;
    this.onFurnish = null; // (B, out, loaded) - tells the loot about spots coming and going
    this._doors(photos);
  }

  /** Signs: every sign's words drawn once into one picture, and a flat quad for each. */
  _signs(list) {
    const STY = {
      shop: { fg: '#f4f0e0', bg: null, font: '900 70px Arial Narrow, Arial, sans-serif' },
      pharmacy: { fg: '#ffffff', bg: null, font: '900 70px Arial Narrow, Arial, sans-serif' },
      police: { fg: '#ffffff', bg: '#24489a', font: '800 64px Arial, sans-serif', border: '#d8dce8' },
      medical: { fg: '#c42020', bg: '#f4f4f0', font: '800 64px Arial, sans-serif', border: '#c42020' },
      plaque: { fg: '#2a2a2a', bg: '#d8d4c8', font: '700 62px Georgia, serif', border: '#6a665e' },
      number: { fg: '#ffffff', bg: '#2a4a8a', font: '800 76px Arial, sans-serif', border: '#ffffff' },
      fire: { fg: '#ffffff', bg: '#b82a20', font: '800 64px Arial, sans-serif' },
      gas: { fg: '#ffffff', bg: null, font: '900 74px Arial, sans-serif' },
      cross: { fg: '#ffffff', bg: '#2a9a4a', font: '900 96px Arial, sans-serif', cross: true },
      icon: { fg: '#e8c060', bg: '#3a3028', font: '400 100px serif' },
    };
    const keys = new Map();
    for (const s of list) { const k = s.style + '|' + s.text; if (!keys.has(k)) keys.set(k, { s, aspect: s.w / s.h }); }
    const W = 2048, H0 = 96;
    let x = 0, y = 0, rowH = H0;
    for (const v of keys.values()) {
      const w = Math.min(W, Math.round(H0 * v.aspect));
      if (x + w > W) { x = 0; y += rowH + 4; }
      v.rect = [x, y, w, H0]; x += w + 4;
    }
    const H = Math.pow(2, Math.ceil(Math.log2(y + H0 + 4)));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    for (const v of keys.values()) {
      const st = STY[v.s.style] || STY.plaque, [rx, ry, rw, rh] = v.rect;
      if (st.bg) { g.fillStyle = st.bg; g.fillRect(rx, ry, rw, rh); }
      if (st.border) { g.strokeStyle = st.border; g.lineWidth = 5; g.strokeRect(rx + 6, ry + 6, rw - 12, rh - 12); }
      g.fillStyle = st.fg; g.font = st.font; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (st.cross) { const c = Math.min(rw, rh) * 0.7; g.fillRect(rx + rw / 2 - c / 6, ry + rh / 2 - c / 2, c / 3, c); g.fillRect(rx + rw / 2 - c / 2, ry + rh / 2 - c / 6, c, c / 3); continue; }
      // squeeze the words to fit
      const tw = g.measureText(v.s.text).width, k = Math.min(1, (rw - 24) / tw);
      g.save(); g.translate(rx + rw / 2, ry + rh / 2 + 3); g.scale(k, 1); g.fillText(v.s.text, 0, 0); g.restore();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const pos = [], uv = [], nrm = [], idx = [];
    for (const s of list) {
      const v = keys.get(s.style + '|' + s.text), [rx, ry, rw, rh] = v.rect;
      const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
      const ax = c * s.w / 2, az = -sn * s.w / 2; // along the sign (local x)
      const nx = sn, nz = c; // facing (local z)
      const b = pos.length / 3;
      const px = s.x + nx * 0.02, pz = s.z + nz * 0.02;
      pos.push(px - ax, s.y - s.h / 2, pz - az, px + ax, s.y - s.h / 2, pz + az, px + ax, s.y + s.h / 2, pz + az, px - ax, s.y + s.h / 2, pz - az);
      const u0 = rx / W, u1 = (rx + rw) / W, v0 = 1 - (ry + rh) / H, v1 = 1 - ry / H;
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      for (let i = 0; i < 4; i++) nrm.push(nx, 0, nz);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, alphaTest: 0.4, transparent: false }));
    m.receiveShadow = true;
    this.world.scene.add(m);
    this.signMesh = m;
  }

  /** Doors: one instanced model per kind; each swings about its hinge. */
  _doors(photos) {
    const byKind = {};
    for (const kind of DOOR_KINDS) {
      const K3 = new Kit(null);
      K3.begin({ x: 0, y: 0, z: 0, seed: 1 });
      doorModel(K3, kind);
      K3.end();
      const c = [...K3.cells.values()][0];
      const geo = geometryOf(c.opaque.arrays());
      const list = this.K.doors.filter((d) => (d.kind || 'wood') === kind);
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(geo, this.mat, list.length);
      im.castShadow = true; im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.world.scene.add(im);
      byKind[kind] = { mesh: im, list };
      list.forEach((d, i) => { d.mesh = im; d.index = i; });
    }
    this.doorKinds = byKind;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._Y = new THREE.Vector3(0, 1, 0);
    for (const d of this.K.doors) {
      d.open = d.target = d.open || 0;
      if (this.phys) d.box = this.phys.add(d.x, d.y + d.h / 2, d.z, d.w / 2, d.h / 2, 0.22, d.yaw, d.kind === 'metal' || d.kind === 'gate' ? 'metal' : 'wood', { door: d, shootable: true });
      this._place(d);
    }
    for (const k of Object.values(byKind)) { k.mesh.instanceMatrix.needsUpdate = true; k.mesh.computeBoundingSphere(); }
    this.moving = new Set();
  }

  /** Where a door's leaf is for its open amount (0 shut .. 1 open a quarter turn). */
  _place(d) {
    const ang = d.yaw + d.open * (Math.PI / 2) * d.hinge * (d.side || 1) * 0.95;
    const c = Math.cos(ang), s = Math.sin(ang);
    // the leaf's middle: half a width from the hinge, along the leaf
    const lx = -d.hinge * d.w / 2;
    const x = d.hx + lx * c, z = d.hz - lx * s;
    if (d.mesh) {
      this._q.setFromAxisAngle(this._Y, ang);
      this._v.set(x, d.y, z);
      this._s.set(d.w / 4.4, d.h / 7.6, 1);
      this._m.compose(this._v, this._q, this._s);
      d.mesh.setMatrixAt(d.index, this._m);
      d.mesh.instanceMatrix.needsUpdate = true;
    }
    if (d.box && this.phys) this.phys.move(d.box, x, d.y + d.h / 2, z, ang);
    d.cx = x; d.cz = z; d.ang = ang;
  }

  /** Open or shut a door (to = 0..1), or toggle it. */
  setDoor(d, to) {
    if (d.broken && to < 0.5) return;
    d.target = to ?? (d.target > 0.5 ? 0 : 1);
    this.moving.add(d);
  }

  /**
   * Furnish a building: its jobs run one at a time (a room each) into one vertex buffer, over as many
   * frames as it takes (budget in ms; Infinity = all now); the mesh appears when the last is done.
   */
  furnish(B, budget = Infinity) {
    let rec = this.furnished.get(B.id);
    if (rec && rec.done) return true;
    if (!rec) { rec = { vb: new VB(4096), out: { colliders: [], loot: [], ladders: [] }, next: 0, done: false, mesh: null }; this.furnished.set(B.id, rec); }
    const t0 = performance.now();
    while (rec.next < B.jobs.length) {
      this.K.runJob(B, rec.next++, rec.vb, rec.out);
      if (performance.now() - t0 > budget) return false;
    }
    const a = rec.vb.arrays();
    if (a.nv) {
      rec.mesh = new THREE.Mesh(geometryOf(a), this.mat);
      rec.mesh.castShadow = true; rec.mesh.receiveShadow = true;
      rec.mesh.matrixAutoUpdate = false; rec.mesh.updateMatrix();
      this.world.scene.add(rec.mesh);
    }
    rec.vb = null; rec.done = true;
    Object.assign(rec, rec.out);
    for (const L of rec.ladders) this.ladders.push(L);
    this.onFurnish?.(B, rec, true);
    return true;
  }
  unfurnish(B) {
    const rec = this.furnished.get(B.id);
    if (!rec) return;
    if (rec.mesh) { this.world.scene.remove(rec.mesh); rec.mesh.geometry.dispose(); }
    for (const b of rec.out.colliders) this.phys?.remove(b);
    for (const L of rec.out.ladders) { const i = this.ladders.indexOf(L); if (i >= 0) this.ladders.splice(i, 1); }
    this.furnished.delete(B.id);
    if (rec.done) this.onFurnish?.(B, rec, false);
  }
  /** Furnish everything near a point straight away (when you appear somewhere). */
  furnishNear(x, z, R = this.loadRange) {
    for (const q of this.withJobs) if (Math.hypot(q.x - x, q.z - z) - q.r < R) this.furnish(q.B);
  }

  update(dt, camera, sky) {
    this.mat.userData.uni.wet.value = sky?.wet ?? 0;
    // furniture: every so often see what's come into range and what's gone out of it
    const cp0 = camera.position;
    this._scanT -= dt;
    if (this._scanT <= 0) {
      this._scanT = 0.3;
      const want = [];
      for (const q of this.withJobs) {
        const d = Math.hypot(q.x - cp0.x, q.z - cp0.z) - q.r;
        const rec = this.furnished.get(q.B.id);
        if ((!rec || !rec.done) && d < this.loadRange) want.push([d, q.B]);
        else if (rec && d > this.unloadRange) this.unfurnish(q.B);
      }
      want.sort((a, b) => a[0] - b[0]);
      this.queue = want.map((w) => w[1]);
    }
    // build a little each frame (nearest first), within a few milliseconds
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < 3) { if (this.furnish(this.queue[0], 3 - (performance.now() - t0))) this.queue.shift(); else break; }
    // insides: only near the camera
    const cp = camera.position;
    for (const q of this.inner) {
      const d = Math.max(Math.abs(cp.x - q.x), Math.abs(cp.z - q.z));
      q.mesh.visible = d < 128 + (this.innerRange ?? 190);
    }
    for (const q of this.detail) {
      const d = Math.max(Math.abs(cp.x - q.x), Math.abs(cp.z - q.z));
      q.mesh.visible = d < 128 + (this.detailRange ?? 520);
    }
    for (const d of this.moving) {
      const sp = d.broken ? 6 : 2.6;
      d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), sp * dt);
      this._place(d);
      if (Math.abs(d.open - d.target) < 1e-4) { d.open = d.target; this.moving.delete(d); }
    }
  }
}

/** The leaf of a door, its hinge side at x = -2.2 / its middle at 0, 4.4 wide, 7.6 tall, 0.3 thick, bottom at y = 0. */
function doorModel(K, kind) {
  const w = 2.2, h = 7.6;
  if (kind === 'wood') {
    const m = { side: K_mat('woodFine', 0x9a6a48), px: K_mat('woodFine', 0x7a5236), nx: K_mat('woodFine', 0x7a5236) };
    K.box(0, h / 2, 0, w - 0.05, h / 2 - 0.02, 0.15, m, { col: false });
    for (const s of [-1, 1]) for (const yy of [2.1, 5.4]) K.box(0, yy, s * 0.17, w - 0.55, 1.35, 0.03, K_mat('woodFine', 0x8a5e40), { col: false });
    for (const s of [-1, 1]) K.box(w - 0.55, 3.7, s * 0.3, 0.1, 0.1, 0.18, K_mat('metal', 0xc0a060, { p: 5, r: 60 }), { col: false });
  } else if (kind === 'plank') {
    K.box(0, h / 2, 0, w - 0.05, h / 2 - 0.02, 0.15, K_mat('planks', 0xb0987a), { col: false });
    for (const s of [-1, 1]) for (const yy of [1.4, 6.2]) K.box(0, yy, s * 0.17, w - 0.15, 0.25, 0.04, K_mat('planks', 0x8a7458), { col: false });
    K.box(w - 0.6, 3.7, 0.25, 0.1, 0.35, 0.1, K_mat('metal', 0x3a3a3a, { p: 5 }), { col: false });
  } else if (kind === 'metal') {
    K.box(0, h / 2, 0, w - 0.05, h / 2 - 0.02, 0.15, K_mat('milMetal', 0x9aa4a8, { p: 4 }), { col: false });
    for (const s of [-1, 1]) K.box(w - 0.55, 3.7, s * 0.3, 0.12, 0.1, 0.2, K_mat('metal', 0x2a2a2a, { p: 5 }), { col: false });
  } else if (kind === 'gate') {
    for (let i = 0; i <= 6; i++) K.box(-w + 0.1 + i * (2 * w - 0.2) / 6, h / 2, 0, 0.08, h / 2, 0.08, K_mat('metal', 0x3a3c3e, { p: 4 }), { col: false });
    for (const yy of [0.4, h / 2, h - 0.4]) K.box(0, yy, 0, w, 0.12, 0.1, K_mat('metal', 0x3a3c3e, { p: 4 }), { col: false });
  } else if (kind === 'glass') {
    for (const s of [-1, 1]) K.box(s * (w - 0.25), h / 2, 0, 0.25, h / 2, 0.15, K_mat('metal', 0x5a5e62, { p: 4 }), { col: false });
    for (const yy of [0.5, h - 0.25]) K.box(0, yy, 0, w, yy < 1 ? 0.5 : 0.25, 0.15, K_mat('metal', 0x5a5e62, { p: 4 }), { col: false });
    K.box(0, h / 2 + 0.25, 0, w - 0.5, h / 2 - 0.75, 0.04, K_mat('concrete', 0x3a4448, { r: 25 }), { col: false });
  }
}
import { mat as K_mat } from '../build/kit.js';
