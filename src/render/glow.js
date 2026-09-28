// L4D2-style glow outlines: teammates seen through walls (blue-white, white
// when black-and-white, orange when incapacitated, red when pinned) and pickups
// near the player / under the crosshair.
//
// Cost model (cheap on every quality): outlined meshes are drawn as proxies
// that share geometry (and skeletons) with the real meshes into a small
// half-res mask scene — a handful of draw calls, no whole-scene traversal. The
// mask shader tests each fragment against the world pass's depth texture, so
// "through walls" costs nothing extra. One full-res 16-tap composite adds the
// soft outline (plus a faint fill) into the HDR scene before the viewmodel is
// drawn. Both passes are disabled on frames with nothing to outline.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MASK_VS = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  void main() {
    #include <skinbase_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
  }
`;
// mode 0: always drawn; mode 1: only where hidden behind world geometry.
// The mask has its own depth buffer, so only the outlined model's nearest
// surface counts: an arm in front of the torso or the far side of the body is
// never "hidden" (that self-occlusion drew cel-shaded internal edges). Visible
// fragments write transparent black instead of discarding so they still win
// the depth test. alpha carries the fill weight (faint inner tint).
const MASK_FS = /* glsl */ `
  uniform vec3 color;
  uniform float mode, fill, vis, hasDepth, cNear, cFar;
  uniform vec2 invRes;
  uniform sampler2D tDepth;
  float linZ(float d) { return cNear * cFar / (cFar - d * (cFar - cNear)); }
  void main() {
    if (hasDepth > 0.5 && mode > 0.5) {
      float sd = texture2D(tDepth, gl_FragCoord.xy * invRes).r;
      float z = linZ(gl_FragCoord.z);
      // visible: no glow, or a dimmer one (vis) for far / downed teammates
      // (visible + no glow: a 0.1 alpha marker with no colour, so the
      // composite treats it as covered and never paints a rim across the
      // visible part of a half-hidden body)
      if (z < linZ(sd) + 0.14 + z * 0.004) { gl_FragColor = vis > 0.001 ? vec4(color * vis, 0.35) : vec4(0.0, 0.0, 0.0, 0.1); return; }
    }
    gl_FragColor = vec4(color, 0.35 + fill);
  }
`;
const COMP_FS = /* glsl */ `
  uniform sampler2D tMask;
  uniform vec2 texel;
  uniform float radius;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tMask, vUv);
    vec3 acc = vec3(0.0);
    float wsum = 0.0, cw = 0.0;
    for (int i = 0; i < 16; i++) {
      float fi = float(i);
      float r = sqrt((fi + 0.5) / 16.0);
      float a = fi * 2.39996;
      vec4 s = texture2D(tMask, vUv + vec2(cos(a), sin(a)) * r * radius * texel);
      float w = 1.0 - r * 0.5;
      float inside = step(0.2, s.a) * w; // glowing (hidden / faint-rim) pixels only
      acc += s.rgb * inside;
      cw += inside;
      wsum += w;
    }
    float cov = step(0.01, c.a);
    if (cw < 1e-4 || cov > 0.5 && c.a < 0.36) discard; // nothing near, or inside the silhouette
    // silhouette rim: solid for the inner ~third of the radius, then a soft
    // falloff (coverage of the tap disc drops from 0.5 at the edge to 0)
    vec3 rim = acc / cw * smoothstep(0.0, 0.26, cw / wsum) * 1.35 * (1.0 - cov);
    gl_FragColor = vec4(rim + c.rgb * max(0.0, c.a - 0.35) * cov, 1.0);
  }
`;
const COMP_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// scene-linear (pre tone map) colours
export const GLOW = {
  team: [0.1, 0.34, 1.7],
  teamBW: [1.1, 1.1, 1.1],
  incap: [1.7, 0.36, 0.04],
  pinned: [1.7, 0.08, 0.05],
  item: [0.62, 0.8, 1.15],
  target: [1.5, 1.0, 0.32],
};

export class GlowOutlines {
  constructor(camera, quality) {
    this.camera = camera;
    this.quality = quality;
    this.maskScene = new THREE.Scene();
    this.maskScene.matrixWorldAutoUpdate = false; // proxies carry copied world matrices
    this.maskRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: true, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
    this.maskMat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Vector3(1, 1, 1) }, mode: { value: 0 }, fill: { value: 0 }, vis: { value: 0 }, hasDepth: { value: 0 },
        cNear: { value: 0.04 }, cFar: { value: 600 }, invRes: { value: new THREE.Vector2(1, 1) }, tDepth: { value: null },
      },
      vertexShader: MASK_VS, fragmentShader: MASK_FS, depthTest: true, depthWrite: true, side: THREE.DoubleSide,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { tMask: { value: this.maskRT.texture }, texel: { value: new THREE.Vector2(1, 1) }, radius: { value: 3 } },
      vertexShader: COMP_VS, fragmentShader: COMP_FS, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, transparent: true,
    });
    this.quad = new FullScreenQuad(this.compMat);
    this.proxies = new WeakMap(); // source mesh -> proxy
    this.merged = new Map(); // item type -> one position-only geometry (1 mask draw per item)
    this.list = [];
    const self = this;
    // mask render: runs right after the world pass (its depth texture is live)
    this.maskPass = new (class extends Pass {
      constructor() { super(); this.needsSwap = false; this.enabled = false; }
      render(renderer, writeBuffer, readBuffer) { self.renderMask(renderer, readBuffer); }
    })();
    // composite: after AO, before the viewmodel, straight into the scene buffer
    this.compPass = new (class extends Pass {
      constructor() { super(); this.needsSwap = false; this.enabled = false; }
      render(renderer, writeBuffer, readBuffer) {
        const auto = renderer.autoClear;
        renderer.autoClear = false;
        const t = this.renderToScreen ? null : readBuffer, R = self.rect;
        if (t && R) { t.scissor.set(R[0], R[1], R[2], R[3]); t.scissorTest = true; }
        renderer.setRenderTarget(t);
        self.quad.render(renderer);
        if (t) t.scissorTest = false;
        renderer.autoClear = auto;
      }
    })();
  }
  setSize(w, h) {
    const mw = Math.max(1, Math.round(w / 2)), mh = Math.max(1, Math.round(h / 2));
    this.maskRT.setSize(mw, mh);
    this.maskMat.uniforms.invRes.value.set(1 / mw, 1 / mh);
    this.compMat.uniforms.texel.value.set(1 / w, 1 / h);
    this.compMat.uniforms.radius.value = Math.max(4, h / 105);
    this.w = w; this.h = h;
  }
  // Queue one object (and its visible descendants) for this frame.
  add(root, color, mode = 0, fill = 0, k = 1, vis = 0) {
    if (!root) return;
    const L = this.list;
    root.traverseVisible((o) => {
      if (!o.isMesh || o.userData.xray || o.isInstancedMesh || o.isPoints) return;
      let p = this.proxies.get(o);
      if (!p || p.geometry !== o.geometry) {
        p = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, this.maskMat) : new THREE.Mesh(o.geometry, this.maskMat);
        if (o.isSkinnedMesh) { p.bind(o.skeleton, o.bindMatrix); p.boundingSphere = o.boundingSphere; }
        p.matrixAutoUpdate = false;
        p.matrixWorldAutoUpdate = false;
        p.userData.col = new THREE.Vector3();
        p.onBeforeRender = onProxy;
        this.proxies.set(o, p);
      }
      p.matrixWorld.copy(o.matrixWorld);
      if (p.isSkinnedMesh) p.bindMatrixInverse.copy(o.matrixWorld).invert();
      p.frustumCulled = o.frustumCulled;
      p.userData.col.set(color[0] * k, color[1] * k, color[2] * k);
      p.userData.mode = mode;
      p.userData.fill = fill;
      p.userData.vis = vis;
      L.push(p);
    });
  }
  // Rigid multi-part model drawn as one merged proxy (cached per key).
  addMerged(root, key, color, mode = 0, fill = 0, k = 1, vis = 0) {
    let g = this.merged.get(key);
    if (g === undefined) { g = buildMerged(root); this.merged.set(key, g); }
    if (!g) return this.add(root, color, mode, fill, k, vis);
    let p = this.proxies.get(root);
    if (!p) {
      p = new THREE.Mesh(g, this.maskMat);
      p.matrixAutoUpdate = false;
      p.matrixWorldAutoUpdate = false;
      p.userData.col = new THREE.Vector3();
      p.onBeforeRender = onProxy;
      this.proxies.set(root, p);
    }
    p.matrixWorld.copy(root.matrixWorld);
    p.userData.col.set(color[0] * k, color[1] * k, color[2] * k);
    p.userData.mode = mode;
    p.userData.fill = fill;
    p.userData.vis = vis;
    this.list.push(p);
  }
  // Per-frame game hook: decides who/what glows.
  update(game) {
    this.list.length = 0;
    if (game.level !== this._lvl) { // drop the previous level's usable outlines
      this._lvl = game.level;
      for (const k of [...this.merged.keys()]) if (typeof k !== 'string') { this.merged.get(k)?.dispose(); this.merged.delete(k); }
    }
    const me = game.player;
    const outlineOn = game.settings?.outlines !== false;
    if (outlineOn && game.state === 'playing') {
      for (const s of game.survivors || []) {
        const m = s.model, rig = m?.rig;
        if (!rig) continue;
        // retire the old translucent x-ray silhouette: the outline replaces it
        if (rig.xray) for (const x of rig.xray) if (x.layers.mask !== 0x80000000) x.layers.set(31);
        if (s === me || s.dead || m.hidden || !rig.mesh) continue;
        const trouble = s.pinned || s.incapped || s.hanging;
        const c = s.pinned ? GLOW.pinned : trouble ? GLOW.incap : s.blackAndWhite ? GLOW.teamBW : GLOW.team;
        // L4D2: a silhouette rim only where the teammate is hidden; in plain
        // view nothing, except a faint rim once they are far off (or down)
        const cp = this.camera.position;
        const d = Math.hypot(s.pos.x - cp.x, s.pos.y + 1 - cp.y, s.pos.z - cp.z);
        const vis = trouble ? 0.55 * sat((d - 7) / 8) : 0.4 * sat((d - 20) / 14);
        this.add(rig.root, c, 1, 0, 1, vis);
        // the gun (many small parts) as one merged proxy per weapon type
        if (m.weaponObj && m.weaponObj.visible) this.addMerged(m.weaponObj, 'wpn:' + m.weaponType, c, 1, 0, 1, vis);
      }
      const items = game.items?.items;
      if (items && me && !me.dead) {
        const hi = game.items.highlight;
        const ex = me.pos.x, ey = me.pos.y + 1.2, ez = me.pos.z;
        for (const it of items) {
          if (it.taken || !it.mesh) continue;
          const d = Math.hypot(it.pos.x - ex, (it.pos.y - ey) * 1.5, it.pos.z - ez);
          if (it === hi) this.addMerged(it.mesh, 'item:' + it.type, GLOW.target, 0, 0, 1);
          else if (d < 3.5 && !me.incapped) this.addMerged(it.mesh, 'item:' + it.type, GLOW.item, 0, 0, Math.min(1, (3.5 - d) / 1.2) * 0.8);
        }
      }
      // usable objects (event buttons, radios, generators...): amber outline
      // when targeted, built once from the prop parts around the use point
      const cu = game.currentUsable, u = cu?.usable;
      if (u && !u.door && !me?.dead) {
        const obj = u.glow || this.usableProxy(game.level, u);
        if (obj) this.addMerged(obj, obj, GLOW.target, 0, 0, 1);
      }
    }
    const on = this.list.length > 0;
    if (on) this.rect = this.screenRect();
    this.maskPass.enabled = on;
    this.compPass.enabled = on;
  }
  // Merge the logged prop parts (props.js) that sit around a usable's use
  // point into one object for the outline pass. Cached on the usable; null
  // when nothing small enough is there (the use point is then just a spot).
  usableProxy(level, u) {
    if (u._glowObj !== undefined) return u._glowObj;
    u._glowObj = null;
    const G = level?._partG, Mv = level?._partM;
    if (!G) return null;
    const r = Math.min(0.6, (u.radius || 2) * 0.35), px = u.pos.x, py = u.pos.y, pz = u.pos.z;
    const parts = [];
    for (let i = 0, n = G.length; i < n; i++) {
      const o = i * 16;
      const dx = Mv[o + 12] - px, dy = Mv[o + 13] - py, dz = Mv[o + 14] - pz;
      if (dx * dx + dy * dy + dz * dz > r * r) continue;
      _rel.fromArray(Mv, o);
      _sv.setFromMatrixScale(_rel);
      if (Math.max(_sv.x, _sv.y, _sv.z) > 1.4) continue; // walls / big slabs are not the device
      let g = new THREE.BufferGeometry();
      g.setAttribute('position', G[i].attributes.position.clone());
      if (G[i].index) g.setIndex(G[i].index.clone());
      if (g.index) g = g.toNonIndexed();
      g.applyMatrix4(_rel);
      parts.push(g);
      if (parts.length > 60) break;
    }
    if (!parts.length) return null;
    const m = mergeGeometries(parts);
    if (!m) return null;
    m.computeBoundingSphere();
    const obj = new THREE.Object3D(); // identity transform: geometry is in world space
    obj.updateMatrixWorld(true);
    this.merged.set(obj, m);
    u._glowObj = obj;
    return obj;
  }
  // Pixel rect (x, y, w, h; GL bottom-left origin) covering every queued proxy
  // plus the rim radius, so the full-res composite only shades that area.
  // null = whole screen (a proxy reaches behind the camera).
  screenRect() {
    const cam = this.camera, W = this.w || 1, H = this.h || 1;
    cam.updateMatrixWorld();
    _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    let x0 = 1, y0 = 1, x1 = -1, y1 = -1;
    for (const p of this.list) {
      const bs = p.isSkinnedMesh ? p.boundingSphere : p.geometry.boundingSphere;
      if (!bs) return null;
      _sph.copy(bs).applyMatrix4(p.matrixWorld);
      const c = _sph.center, r = _sph.radius;
      _v4.set(c.x, c.y, c.z, 1).applyMatrix4(_pv);
      if (_v4.w - r < cam.near * 2) return null;
      // conservative: r / (w - r) in NDC, scaled by the projection
      const e = r / (_v4.w - r), ex = e * cam.projectionMatrix.elements[0], ey = e * cam.projectionMatrix.elements[5];
      const nx = _v4.x / _v4.w, ny = _v4.y / _v4.w;
      x0 = Math.min(x0, nx - ex); x1 = Math.max(x1, nx + ex);
      y0 = Math.min(y0, ny - ey); y1 = Math.max(y1, ny + ey);
    }
    const pad = this.compMat.uniforms.radius.value + 2;
    const px0 = Math.max(0, Math.floor((x0 * 0.5 + 0.5) * W - pad)), px1 = Math.min(W, Math.ceil((x1 * 0.5 + 0.5) * W + pad));
    const py0 = Math.max(0, Math.floor((y0 * 0.5 + 0.5) * H - pad)), py1 = Math.min(H, Math.ceil((y1 * 0.5 + 0.5) * H + pad));
    const r = this._rect || (this._rect = [0, 0, 0, 0]);
    r[0] = px0; r[1] = py0; r[2] = Math.max(0, px1 - px0); r[3] = Math.max(0, py1 - py0);
    return r;
  }
  renderMask(renderer, readBuffer) {
    const u = this.maskMat.uniforms;
    const depth = readBuffer.depthTexture;
    u.tDepth.value = depth || null;
    u.hasDepth.value = depth ? 1 : 0;
    u.cNear.value = this.camera.near;
    u.cFar.value = this.camera.far;
    const S = this.maskScene;
    for (const p of this.list) { p.parent = S; S.children.push(p); }
    const auto = renderer.autoClear, ca = renderer.getClearAlpha();
    renderer.getClearColor(_cc);
    renderer.setRenderTarget(this.maskRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.autoClear = false;
    renderer.render(S, this.camera);
    renderer.autoClear = auto;
    renderer.setClearColor(_cc, ca);
    for (const p of S.children) p.parent = null;
    S.children.length = 0;
  }
}

const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const _pv = new THREE.Matrix4(), _sph = new THREE.Sphere(), _v4 = new THREE.Vector4();
const _cc = new THREE.Color(), _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4(), _sv = new THREE.Vector3();
function buildMerged(root) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || !o.visible) return;
    if (o.material?.blending === THREE.AdditiveBlending) return; // muzzle flashes, glints
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', o.geometry.attributes.position.clone());
    if (o.geometry.index) g.setIndex(o.geometry.index.clone());
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(_rel.multiplyMatrices(_inv, o.matrixWorld));
    parts.push(g);
  });
  if (!parts.length) return null;
  const m = mergeGeometries(parts);
  m?.computeBoundingSphere();
  return m;
}
function onProxy(renderer, scene, camera, geometry, material) {
  const u = material.uniforms;
  u.color.value.copy(this.userData.col);
  u.mode.value = this.userData.mode;
  u.fill.value = this.userData.fill;
  u.vis.value = this.userData.vis;
  material.uniformsNeedUpdate = true;
}
