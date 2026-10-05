// Draw-call reduction: instanced flames for every torch/candle/brazier, and static-mesh merging
// for furniture and props (one draw per material instead of one per primitive).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

export class FlameSystem {
  constructor(scene, glowTex, max = 600) {
    this.max = max;
    this.flames = [];
    const outerGeo = new THREE.ConeGeometry(0.09, 0.32, 8, 1, true);
    outerGeo.translate(0, 0.16, 0);
    const innerGeo = new THREE.ConeGeometry(0.05, 0.2, 8, 1, true);
    innerGeo.translate(0, 0.1, 0);
    const mk = (geo, opacity) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }), max);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = 3;
      scene.add(m);
      return m;
    };
    this.outer = mk(outerGeo, 0.9);
    this.inner = mk(innerGeo, 0.95);
    // glows as soft camera-facing points
    const g = new THREE.BufferGeometry();
    this.gpos = new Float32Array(max * 3);
    this.gcol = new Float32Array(max * 3);
    this.gsize = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.gpos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.gcol, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.gsize, 1));
    this.glowMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowTex }, scale: { value: 500 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute vec3 color; uniform float scale; varying vec3 vColor; varying float vFade;
        void main() { vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / max(0.1, -mv.z); vFade = clamp(1.0 - (-mv.z - 22.0) / 14.0, 0.0, 1.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying vec3 vColor; varying float vFade;
        void main() { float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vColor * a * 0.55 * vFade, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.glow = new THREE.Points(g, this.glowMat);
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 3;
    scene.add(this.glow);
    this.objects = [this.outer, this.inner, this.glow];
  }

  add(pos, scale, color) {
    if (this.flames.length >= this.max) return;
    const col = new THREE.Color(color);
    this.flames.push({ pos: pos.clone(), scale, col, seed: Math.random() * 100 });
  }

  clear() {
    this.flames.length = 0;
  }

  update(t, cam, height) {
    this.glowMat.uniforms.scale.value = height * 0.5;
    let n = 0;
    for (const f of this.flames) {
      const dx = f.pos.x - cam.x, dz = f.pos.z - cam.z;
      if (dx * dx + dz * dz > 38 * 38) continue;
      const k = Math.sin(t * 13 + f.seed) * 0.12 + Math.sin(t * 29 + f.seed * 2) * 0.08;
      const s = f.scale;
      _q.setFromAxisAngle(_p.set(0, 1, 0), t * 2 + f.seed);
      _m.compose(f.pos, _q, _s.set(s * (1 - k * 0.5), s * (1 + k), s * (1 - k * 0.5)));
      this.outer.setMatrixAt(n, _m);
      _c.copy(f.col).multiplyScalar(2.2);
      this.outer.setColorAt(n, _c);
      _m.compose(f.pos, _q, _s.set(s, s * (1 + k * 1.4), s));
      this.inner.setMatrixAt(n, _m);
      _c.setRGB(1, 0.94, 0.7).multiplyScalar(2.5);
      this.inner.setColorAt(n, _c);
      this.gpos[n * 3] = f.pos.x;
      this.gpos[n * 3 + 1] = f.pos.y + 0.12 * s;
      this.gpos[n * 3 + 2] = f.pos.z;
      const gi = 0.8 + k * 1.1;
      this.gcol[n * 3] = f.col.r * gi;
      this.gcol[n * 3 + 1] = f.col.g * gi;
      this.gcol[n * 3 + 2] = f.col.b * gi;
      this.gsize[n] = 0.9 * s;
      n++;
    }
    this.outer.count = this.inner.count = n;
    this.outer.instanceMatrix.needsUpdate = this.inner.instanceMatrix.needsUpdate = true;
    if (this.outer.instanceColor) this.outer.instanceColor.needsUpdate = true;
    if (this.inner.instanceColor) this.inner.instanceColor.needsUpdate = true;
    this.glow.geometry.setDrawRange(0, n);
    this.glow.geometry.attributes.position.needsUpdate = true;
    this.glow.geometry.attributes.color.needsUpdate = true;
    this.glow.geometry.attributes.size.needsUpdate = true;
  }
}

// Collect flame markers (from makeFlame) under an object, register them, and remove the markers.
export function harvestFlames(root, system) {
  root.updateMatrixWorld(true);
  const markers = [];
  root.traverse((o) => { if (o.userData.flameSpec) markers.push(o); });
  for (const m of markers) {
    const pos = m.getWorldPosition(new THREE.Vector3());
    const sc = m.getWorldScale(new THREE.Vector3()).y * m.userData.flameSpec.scale;
    system.add(pos, sc, m.userData.flameSpec.color);
    m.removeFromParent();
  }
}

// Merge all meshes under `root` into one mesh per material (local to root). Sprites/points kept.
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMat = new Map();
  const keep = [];
  root.traverse((o) => {
    if (o === root) return;
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.geometry && !Array.isArray(o.material)) {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(_m.multiplyMatrices(inv, o.matrixWorld));
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(g);
    } else if (o.isSprite || o.isPoints) keep.push(o);
  });
  const out = new THREE.Group();
  out.position.copy(root.position);
  out.quaternion.copy(root.quaternion);
  out.scale.copy(root.scale);
  for (const [mat, geos] of byMat) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    out.add(new THREE.Mesh(merged, mat));
  }
  for (const k of keep) {
    const wp = k.getWorldPosition(new THREE.Vector3());
    k.removeFromParent();
    k.position.copy(wp).applyMatrix4(inv);
    out.add(k);
  }
  out.userData = root.userData;
  return out;
}
