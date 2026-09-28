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
// alpha carries the fill weight so teammates get a faint body tint, items none.
const MASK_FS = /* glsl */ `
  uniform vec3 color;
  uniform float mode, fill, hasDepth, cNear, cFar;
  uniform vec2 invRes;
  uniform sampler2D tDepth;
  float linZ(float d) { return cNear * cFar / (cFar - d * (cFar - cNear)); }
  void main() {
    if (hasDepth > 0.5 && mode > 0.5) {
      float sd = texture2D(tDepth, gl_FragCoord.xy * invRes).r;
      if (linZ(gl_FragCoord.z) < linZ(sd) + 0.18) discard; // visible: no glow
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
    float wsum = 0.0;
    for (int i = 0; i < 16; i++) {
      float fi = float(i);
      float r = sqrt((fi + 0.5) / 16.0);
      float a = fi * 2.39996;
      vec4 s = texture2D(tMask, vUv + vec2(cos(a), sin(a)) * r * radius * texel);
      float w = 1.0 - r * 0.6;
      acc += s.rgb * step(0.01, s.a) * w;
      wsum += w;
    }
    vec3 halo = acc / wsum;
    float cov = step(0.01, c.a);
    // bright soft rim outside the silhouette, faint tint inside
    vec3 col = halo * 2.6 * (1.0 - cov) + c.rgb * max(0.0, c.a - 0.35) * cov;
    if (dot(col, col) < 1e-6) discard;
    gl_FragColor = vec4(col, 1.0);
  }
`;
const COMP_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// scene-linear (pre tone map) colours
export const GLOW = {
  team: [0.42, 0.66, 1.35],
  teamBW: [1.1, 1.1, 1.1],
  incap: [1.5, 0.42, 0.06],
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
    this.maskRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
    this.maskMat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Vector3(1, 1, 1) }, mode: { value: 0 }, fill: { value: 0 }, hasDepth: { value: 0 },
        cNear: { value: 0.04 }, cFar: { value: 600 }, invRes: { value: new THREE.Vector2(1, 1) }, tDepth: { value: null },
      },
      vertexShader: MASK_VS, fragmentShader: MASK_FS, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { tMask: { value: this.maskRT.texture }, texel: { value: new THREE.Vector2(1, 1) }, radius: { value: 3 } },
      vertexShader: COMP_VS, fragmentShader: COMP_FS, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, transparent: true,
    });
    this.quad = new FullScreenQuad(this.compMat);
    this.proxies = new WeakMap(); // source mesh -> proxy
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
        renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
        self.quad.render(renderer);
        renderer.autoClear = auto;
      }
    })();
  }
  setSize(w, h) {
    const mw = Math.max(1, Math.round(w / 2)), mh = Math.max(1, Math.round(h / 2));
    this.maskRT.setSize(mw, mh);
    this.maskMat.uniforms.invRes.value.set(1 / mw, 1 / mh);
    this.compMat.uniforms.texel.value.set(1 / w, 1 / h);
    this.compMat.uniforms.radius.value = Math.max(2.5, h / 210);
  }
  // Queue one object (and its visible descendants) for this frame.
  add(root, color, mode = 0, fill = 0, k = 1) {
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
      L.push(p);
    });
  }
  // Per-frame game hook: decides who/what glows.
  update(game) {
    this.list.length = 0;
    const me = game.player;
    const outlineOn = game.settings?.outlines !== false;
    if (outlineOn && game.state === 'playing') {
      for (const s of game.survivors || []) {
        const m = s.model, rig = m?.rig;
        if (!rig) continue;
        // retire the old translucent x-ray silhouette: the outline replaces it
        if (rig.xray) for (const x of rig.xray) if (x.layers.mask !== 0x80000000) x.layers.set(31);
        if (s === me || s.dead || m.hidden || !rig.mesh) continue;
        const c = s.pinned ? GLOW.pinned : (s.incapped || s.hanging) ? GLOW.incap : s.blackAndWhite ? GLOW.teamBW : GLOW.team;
        this.add(rig.root, c, 1, 0.1);
        if (m.weaponObj && m.weaponObj.parent !== rig.root) this.add(m.weaponObj, c, 1, 0.1);
      }
      const items = game.items?.items;
      if (items && me && !me.dead) {
        const hi = game.items.highlight;
        const ex = me.pos.x, ey = me.pos.y + 1.2, ez = me.pos.z;
        for (const it of items) {
          if (it.taken || !it.mesh) continue;
          const d = Math.hypot(it.pos.x - ex, (it.pos.y - ey) * 1.5, it.pos.z - ez);
          if (it === hi) this.add(it.mesh, GLOW.target, 0, 0, 1);
          else if (d < 4.5 && !me.incapped) this.add(it.mesh, GLOW.item, 0, 0, Math.min(1, (4.5 - d) / 1.5) * 0.8);
        }
      }
    }
    const on = this.list.length > 0;
    this.maskPass.enabled = on;
    this.compPass.enabled = on;
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
    renderer.clear(true, false, false);
    renderer.autoClear = false;
    renderer.render(S, this.camera);
    renderer.autoClear = auto;
    renderer.setClearColor(_cc, ca);
    for (const p of S.children) p.parent = null;
    S.children.length = 0;
  }
}

const _cc = new THREE.Color();
function onProxy(renderer, scene, camera, geometry, material) {
  const u = material.uniforms;
  u.color.value.copy(this.userData.col);
  u.mode.value = this.userData.mode;
  u.fill.value = this.userData.fill;
  material.uniformsNeedUpdate = true;
}
