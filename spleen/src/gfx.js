/* ==========================================================================
   SPLEEN: SEPSIS — gfx.js
   Babylon.js rendering layer. The simulation lives in 2D tile space
   (x right, y down/south). Babylon space: X = x, Y = height, Z = -y.
   ========================================================================== */
"use strict";

const Gfx = (function () {
  const G = {};
  let engine, scene, camera, canvas, overlay, octx, glow = null, pipeline = null;
  let hemi, dirLight, ptLight, outerGround;
  const V3 = () => BABYLON.Vector3;
  G.ready = false;
  G.quality = 'high';
  G.shake = 0;                // trauma 0..1
  G.shakeScale = 1;           // from options
  G.time = 0;
  G.view = { tx: 8.5, ty: 5.5, cx: 8.5, cy: 5.5, dist: 14, fitW: 17.2, fitH: 11.4, elev: 1.02, fov: 0.78 };
  G.flash = 0;                // camera hit punch
  G.caPulse = 0;              // chromatic aberration pulse
  const matCache = new Map();
  const geoCache = new Map();

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */
  function col3(hex, k = 1) { const r = hexToRgb(hex); return new BABYLON.Color3(r[0] * k, r[1] * k, r[2] * k); }
  function col4(hex, a = 1, k = 1) { const r = hexToRgb(hex); return new BABYLON.Color4(r[0] * k, r[1] * k, r[2] * k, a); }
  G.col3 = col3; G.col4 = col4;
  G.v3 = (x, y, h) => new BABYLON.Vector3(x, h || 0, -y);

  /* ------------------------------------------------------------------ */
  /* init                                                                */
  /* ------------------------------------------------------------------ */
  G.init = function (canvasEl, overlayEl, quality) {
    canvas = canvasEl; overlay = overlayEl; octx = overlay.getContext('2d');
    G.quality = quality || 'high';
    engine = new BABYLON.Engine(canvas, G.quality !== 'low', { preserveDrawingBuffer: !!window.__TEST__, stencil: true, powerPreference: 'high-performance', antialias: G.quality !== 'low' }, true);
    engine.enableOfflineSupport = false;
    scene = new BABYLON.Scene(engine);
    // Babylon's attachControl preventDefaults pointerdown, which suppresses the compat mousedown/mouseup
    // events Input listens for. The game uses no Babylon picking/pointer input, so detach it.
    scene.detachControl();
    scene.clearColor = new BABYLON.Color4(0.03, 0.01, 0.02, 1);
    scene.ambientColor = new BABYLON.Color3(0.12, 0.08, 0.1);
    scene.skipPointerMovePicking = true;
    scene.autoClear = true;
    camera = new BABYLON.FreeCamera('cam', new BABYLON.Vector3(8, 14, -14), scene);
    camera.fov = G.view.fov; camera.minZ = 0.5; camera.maxZ = 200;
    camera.inputs.clear();
    hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0.2, 1, -0.3), scene);
    hemi.intensity = 0.95;
    dirLight = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(0.4, -1, 0.6), scene);
    dirLight.intensity = 0.35;
    ptLight = new BABYLON.PointLight('pt', new BABYLON.Vector3(0, 2.2, 0), scene);
    ptLight.intensity = 0.8; ptLight.range = 7.5;
    // big dark ground under everything
    outerGround = BABYLON.MeshBuilder.CreateGround('outer', { width: 220, height: 220 }, scene);
    outerGround.position.y = -0.04;
    const om = new BABYLON.StandardMaterial('outerMat', scene);
    om.diffuseColor = new BABYLON.Color3(0.05, 0.01, 0.02); om.specularColor = BABYLON.Color3.Black();
    outerGround.material = om; outerGround.isPickable = false;

    setupPost();
    buildGeoCache();
    buildPools();
    G.resize();
    window.addEventListener('resize', () => G.resize());
    G.ready = true;
    return { engine, scene };
  };

  function setupPost() {
    if (glow) { glow.dispose(); glow = null; }
    if (pipeline) { pipeline.dispose(); pipeline = null; }
    const q = G.quality;
    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.15; ip.contrast = 1.25;
    if (q !== 'low') {
      glow = new BABYLON.GlowLayer('glow', scene, { mainTextureRatio: q === 'high' ? 0.5 : 0.35, blurKernelSize: q === 'high' ? 48 : 32, mainTextureSamples: 1 });
      glow.intensity = 0.75;
      glow.customEmissiveColorSelector = function (mesh, subMesh, material, result) {
        const m = mesh.metadata && mesh.metadata.glow ? mesh.metadata.glow : (material && material.metadata && material.metadata.glow);
        if (m) result.set(m.r, m.g, m.b, m.a); else result.set(0, 0, 0, 0);
      };
    }
    pipeline = new BABYLON.DefaultRenderingPipeline('pp', q !== 'low', scene, [camera]);
    pipeline.fxaaEnabled = true;
    pipeline.samples = 1;
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 2.2;
    pipeline.imageProcessing.vignetteStretch = 0.3;
    pipeline.imageProcessing.vignetteColor = new BABYLON.Color4(0, 0, 0, 0);
    pipeline.imageProcessing.vignetteCameraFov = 0.7;
    if (q === 'high') {
      pipeline.bloomEnabled = true; pipeline.bloomThreshold = 0.82; pipeline.bloomWeight = 0.22; pipeline.bloomKernel = 48; pipeline.bloomScale = 0.5;
      pipeline.chromaticAberrationEnabled = true; pipeline.chromaticAberration.aberrationAmount = 12; pipeline.chromaticAberration.radialIntensity = 1.4;
      pipeline.grainEnabled = true; pipeline.grain.intensity = 7; pipeline.grain.animated = true;
    } else if (q === 'medium') {
      pipeline.chromaticAberrationEnabled = true; pipeline.chromaticAberration.aberrationAmount = 8;
    }
  }
  G.setQuality = function (q) {
    if (q === G.quality) return;
    G.quality = q; setupPost(); G.resize();
  };

  G.resize = function () {
    if (!engine) return;
    const dpr = window.devicePixelRatio || 1;
    const cap = G.quality === 'high' ? 2 : G.quality === 'medium' ? 1.25 : 0.85;
    engine.setHardwareScalingLevel(1 / Math.min(dpr, cap));
    engine.resize();
    overlay.width = Math.round(window.innerWidth * Math.min(dpr, 2));
    overlay.height = Math.round(window.innerHeight * Math.min(dpr, 2));
    overlay.style.width = window.innerWidth + 'px'; overlay.style.height = window.innerHeight + 'px';
    G.ovScale = Math.min(dpr, 2);
    fitCamera();
  };

  /* ------------------------------------------------------------------ */
  /* camera                                                              */
  /* ------------------------------------------------------------------ */
  function camPose(tx, ty, d) {
    const e = G.view.elev; // elevation angle from horizontal
    return { pos: new BABYLON.Vector3(tx, Math.sin(e) * d, -ty - Math.cos(e) * d), tgt: new BABYLON.Vector3(tx, 0, -ty) };
  }
  function projectWith(p, vp, w, h) {
    const v = BABYLON.Vector3.TransformCoordinates(p, vp);
    return { x: (v.x + 1) * 0.5 * w, y: (1 - v.y) * 0.5 * h };
  }
  /** Find a camera distance so that a fw x fh tile area (plus walls) fits the screen */
  function computeDist(fw, fh) {
    const W = window.innerWidth, H = window.innerHeight, aspect = W / H;
    const test = (d) => {
      const pose = camPose(0, 0, d);
      const view = BABYLON.Matrix.LookAtLH(pose.pos, pose.tgt, BABYLON.Vector3.Up());
      const proj = BABYLON.Matrix.PerspectiveFovLH(G.view.fov, aspect, 0.5, 300, engine.isNDCHalfZRange);
      const vp = view.multiply(proj);
      const pts = [[-fw / 2, -fh / 2, 1.0], [fw / 2, -fh / 2, 1.0], [-fw / 2, fh / 2, 0], [fw / 2, fh / 2, 0], [-fw / 2, fh / 2, 0.6], [fw / 2, -fh / 2, 0]];
      for (const p of pts) {
        const s = projectWith(new BABYLON.Vector3(p[0], p[2], -p[1]), vp, 1, 1);
        if (s.x < 0.01 || s.x > 0.99 || s.y < 0.06 || s.y > 0.985) return false;
      }
      return true;
    };
    let lo = 4, hi = 160;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (test(mid)) hi = mid; else lo = mid; }
    return hi;
  }
  function fitCamera() {
    let fw = 17.4, fh = 11.6;
    G.view.baseFitW = fw; G.view.baseFitH = fh; G.view.baseDist = computeDist(fw, fh);
    applyBounds();
  }
  function applyBounds() {
    const v = G.view;
    if (v.whole && v.roomW) {
      v.fitW = v.roomW + 0.4; v.fitH = v.roomH + 0.6; v.dist = computeDist(v.fitW, v.fitH);
    } else { v.fitW = v.baseFitW; v.fitH = v.baseFitH; v.dist = v.baseDist; }
  }
  /** Set which room-space rectangle the camera should keep in view; whole = zoom out to fit it all */
  G.setCameraBounds = function (W, H, whole) { G.view.roomW = W; G.view.roomH = H; G.view.whole = !!whole; applyBounds(); };
  G.updateCamera = function (px, py, dt, snap) {
    const v = G.view, W = v.roomW || 17, H = v.roomH || 11;
    let tx, ty;
    const hw = v.fitW / 2 - 0.2, hh = v.fitH / 2 - 0.2;
    if (W <= v.fitW + 0.01) tx = W / 2; else tx = clamp(px, hw, W - hw);
    if (H <= v.fitH + 0.01) ty = H / 2; else ty = clamp(py, hh, H - hh);
    // lead slightly toward the aim when following
    if (snap) { v.cx = tx; v.cy = ty; }
    else { const k = damp(6, dt); v.cx = lerp(v.cx, tx, k); v.cy = lerp(v.cy, ty, k); }
    // shake
    G.shake = Math.max(0, G.shake - dt * 1.6);
    const tr = G.shake * G.shake * G.shakeScale;
    const t = G.time * 31;
    const sx = (Math.sin(t * 1.3) + Math.sin(t * 2.7) * 0.5) * 0.35 * tr;
    const sy = (Math.cos(t * 1.7) + Math.sin(t * 3.1) * 0.5) * 0.35 * tr;
    G.flash = Math.max(0, G.flash - dt * 5);
    const pose = camPose(v.cx + sx, v.cy + sy, v.dist * (1 - G.flash * 0.025));
    camera.position.copyFrom(pose.pos); camera.setTarget(pose.tgt);
    if (pipeline && pipeline.chromaticAberrationEnabled) {
      G.caPulse = Math.max(0, G.caPulse - dt * 2.5);
      pipeline.chromaticAberration.aberrationAmount = (G.quality === 'high' ? 10 : 6) + G.caPulse * (G.reduceFlash ? 12 : 60);
    }
  };
  G.addShake = function (amt) { G.shake = Math.min(1, Math.max(G.shake, amt)); };
  G.punch = function (amt) { G.flash = Math.max(G.flash, amt * (G.reduceFlash ? 0.3 : 1)); };

  /* screen <-> world (sim coords) */
  G.screenToWorld = function (px, py, h = 0.5) {
    if (!camera) return null;
    const r = canvas.getBoundingClientRect();
    const nx = ((px - r.left) / r.width) * 2 - 1, ny = 1 - ((py - r.top) / r.height) * 2;
    const vp = scene.getTransformMatrix(); const inv = vp.clone(); inv.invert();
    const zNear = engine.isNDCHalfZRange ? 0 : -1;
    const a = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(nx, ny, zNear), inv);
    const b = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(nx, ny, 1), inv);
    const dy = b.y - a.y; if (Math.abs(dy) < 1e-6) return null;
    const t = (h - a.y) / dy;
    return { x: a.x + (b.x - a.x) * t, y: -(a.z + (b.z - a.z) * t) };
  };
  G.worldToScreen = function (x, y, h = 0) {
    const vp = scene.getTransformMatrix();
    const v = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(x, h, -y), vp);
    return { x: (v.x + 1) * 0.5 * window.innerWidth, y: (1 - v.y) * 0.5 * window.innerHeight, behind: v.z > 1 };
  };

  /* ------------------------------------------------------------------ */
  /* materials                                                           */
  /* ------------------------------------------------------------------ */
  /** Organic cell material: diffuse body + fresnel rim glow. */
  G.cellMat = function (hex, opts = {}) {
    const key = 'cell:' + hex + JSON.stringify(opts);
    if (matCache.has(key)) return matCache.get(key);
    const m = new BABYLON.StandardMaterial(key, scene);
    const c = hexToRgb(hex);
    const dk = opts.dark != null ? opts.dark : 0.5;
    m.diffuseColor = new BABYLON.Color3(c[0] * dk, c[1] * dk, c[2] * dk);
    m.specularColor = new BABYLON.Color3(0.35, 0.35, 0.35); m.specularPower = opts.spec || 48;
    m.emissiveColor = new BABYLON.Color3(1, 1, 1);
    const f = new BABYLON.FresnelParameters();
    const rim = opts.rim != null ? opts.rim : 1.15, core = opts.core != null ? opts.core : 0.22;
    f.leftColor = new BABYLON.Color3(Math.min(1.5, c[0] * rim + 0.08), Math.min(1.5, c[1] * rim + 0.08), Math.min(1.5, c[2] * rim + 0.08));
    f.rightColor = new BABYLON.Color3(c[0] * core, c[1] * core, c[2] * core);
    f.bias = 0.0; f.power = opts.power || 1.7;
    m.emissiveFresnelParameters = f;
    if (opts.alpha != null) { m.alpha = opts.alpha; m.backFaceCulling = true; }
    const gk = opts.glow != null ? opts.glow : 0.35;
    if (gk > 0) m.metadata = { glow: new BABYLON.Color4(c[0] * gk, c[1] * gk, c[2] * gk, 1) };
    if (opts.flat) m.disableLighting = false;
    matCache.set(key, m);
    return m;
  };
  /** Flat unlit emissive material (bullets, particles, telegraphs) */
  G.glowMat = function (hex, opts = {}) {
    const key = 'glow:' + hex + JSON.stringify(opts);
    if (matCache.has(key)) return matCache.get(key);
    const m = new BABYLON.StandardMaterial(key, scene);
    const c = hexToRgb(hex), k = opts.k != null ? opts.k : 1;
    m.disableLighting = true;
    m.emissiveColor = new BABYLON.Color3(c[0] * k, c[1] * k, c[2] * k);
    m.diffuseColor = BABYLON.Color3.Black(); m.specularColor = BABYLON.Color3.Black();
    if (opts.alpha != null) m.alpha = opts.alpha;
    if (opts.additive) { m.alphaMode = BABYLON.Engine.ALPHA_ADD; m.disableDepthWrite = true; if (m.alpha === 1) m.alpha = 0.999; }
    if (opts.noDepth) m.disableDepthWrite = true;
    if (opts.zOffset) m.zOffset = opts.zOffset;
    if (opts.texture) { m.opacityTexture = opts.texture; m.emissiveTexture = null; }
    const gk = opts.glow != null ? opts.glow : 0.8;
    if (gk > 0) m.metadata = { glow: new BABYLON.Color4(c[0] * gk, c[1] * gk, c[2] * gk, 1) };
    m.backFaceCulling = opts.backFace !== false;
    m.freeze && opts.freeze && m.freeze();
    matCache.set(key, m);
    return m;
  };
  G.plainMat = function (hex, opts = {}) {
    const key = 'plain:' + hex + JSON.stringify(opts);
    if (matCache.has(key)) return matCache.get(key);
    const m = new BABYLON.StandardMaterial(key, scene);
    const c = hexToRgb(hex);
    m.diffuseColor = new BABYLON.Color3(c[0], c[1], c[2]);
    m.specularColor = new BABYLON.Color3(opts.spec || 0.1, opts.spec || 0.1, opts.spec || 0.1);
    if (opts.emissive) m.emissiveColor = col3(opts.emissive, opts.ek || 1);
    if (opts.alpha != null) m.alpha = opts.alpha;
    if (opts.glow) { const g = hexToRgb(opts.glow); m.metadata = { glow: new BABYLON.Color4(g[0], g[1], g[2], 1) }; }
    matCache.set(key, m);
    return m;
  };

  /* ------------------------------------------------------------------ */
  /* geometry cache + part cloning                                       */
  /* ------------------------------------------------------------------ */
  function buildGeoCache() {
    const MB = BABYLON.MeshBuilder;
    const add = (k, m) => { m.isVisible = false; m.setEnabled(false); m.isPickable = false; geoCache.set(k, m); };
    add('sphere', MB.CreateSphere('g_sphere', { diameter: 2, segments: 14 }, scene));
    add('sphereLo', MB.CreateSphere('g_sphereLo', { diameter: 2, segments: 7 }, scene));
    add('ico', MB.CreateIcoSphere('g_ico', { radius: 1, subdivisions: 2, flat: false }, scene));
    add('icoFlat', MB.CreateIcoSphere('g_icoF', { radius: 1, subdivisions: 1, flat: true }, scene));
    add('capsule', MB.CreateCapsule('g_cap', { radius: 0.5, height: 2, tessellation: 14, subdivisions: 2, orientation: new BABYLON.Vector3(1, 0, 0) }, scene));
    add('cyl', MB.CreateCylinder('g_cyl', { diameter: 2, height: 2, tessellation: 12 }, scene));
    add('cone', MB.CreateCylinder('g_cone', { diameterTop: 0, diameterBottom: 2, height: 2, tessellation: 10 }, scene));
    add('torus', MB.CreateTorus('g_torus', { diameter: 2, thickness: 0.25, tessellation: 28 }, scene));
    add('torusThick', MB.CreateTorus('g_torusT', { diameter: 2, thickness: 0.6, tessellation: 22 }, scene));
    add('disc', MB.CreateDisc('g_disc', { radius: 1, tessellation: 32 }, scene));
    add('box', MB.CreateBox('g_box', { size: 2 }, scene));
    add('plane', MB.CreatePlane('g_plane', { size: 2 }, scene));
    add('octa', MB.CreatePolyhedron('g_octa', { type: 1, size: 1 }, scene));
    add('dodeca', MB.CreatePolyhedron('g_dodeca', { type: 2, size: 1 }, scene));
    add('tetra', MB.CreatePolyhedron('g_tetra', { type: 0, size: 1 }, scene));
    // lay discs & planes flat on the ground (normal up)
    for (const k of ['disc', 'plane']) { const m = geoCache.get(k); m.rotation.x = Math.PI / 2; m.bakeCurrentTransformIntoVertices(); }
  }
  /** Clone a cached geometry into a mesh part. pos in Babylon local space. */
  G.part = function (shape, mat, parent, x = 0, y = 0, z = 0, sx = 1, sy, sz) {
    const base = geoCache.get(shape);
    // fresh mesh sharing the cached geometry's vertex buffers (Mesh.clone is ~0.5ms/part)
    const m = new BABYLON.Mesh(shape + '_p', scene);
    base.geometry.applyToMesh(m);
    m.isPickable = false;
    m.material = mat;
    if (parent) m.parent = parent;
    m.position.set(x, y, z);
    m.scaling.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
    return m;
  };
  G.node = function (name) { return new BABYLON.TransformNode(name || 'n', scene); };
  G.disposeNode = function (n) { if (n) n.dispose(false, false); };
  /** flash all meshes under a node white (hit feedback) */
  G.setOverlay = function (node, on, hex = '#ffffff', a = 0.85) {
    if (!node) return;
    const ms = node._ovMeshes || (node._ovMeshes = node.getChildMeshes(false));
    for (const m of ms) { m.renderOverlay = on; if (on) { m.overlayColor = col3(hex); m.overlayAlpha = a; } }
  };
  G.setOutline = function (mesh, on, hex = '#ffffff', w = 0.04) {
    if (!mesh) return;
    mesh.renderOutline = on; if (on) { mesh.outlineColor = col3(hex); mesh.outlineWidth = w; }
  };

  /* ------------------------------------------------------------------ */
  /* thin-instance pools                                                 */
  /* ------------------------------------------------------------------ */
  class Pool {
    constructor(mesh, max) {
      this.mesh = mesh; this.max = max; this.buf = new Float32Array(16 * max); this.n = 0;
      mesh.setEnabled(true); mesh.isVisible = true; mesh.isPickable = false;
      mesh.thinInstanceSetBuffer('matrix', this.buf, 16, false);
      mesh.thinInstanceCount = 0;
      mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true;
    }
    begin() { this.n = 0; }
    /** x,z Babylon coords; y height; rot about Y; non-uniform scale */
    push(x, y, z, sx, sy, sz, rot) {
      if (this.n >= this.max) return;
      const o = this.n * 16, b = this.buf;
      const c = rot ? Math.cos(rot) : 1, s = rot ? Math.sin(rot) : 0;
      b[o] = c * sx; b[o + 1] = 0; b[o + 2] = -s * sx; b[o + 3] = 0;
      b[o + 4] = 0; b[o + 5] = sy; b[o + 6] = 0; b[o + 7] = 0;
      b[o + 8] = s * sz; b[o + 9] = 0; b[o + 10] = c * sz; b[o + 11] = 0;
      b[o + 12] = x; b[o + 13] = y; b[o + 14] = z; b[o + 15] = 1;
      this.n++;
    }
    end() {
      const vis = this.n > 0;
      if (vis !== this.mesh.isVisible) this.mesh.isVisible = vis;
      this.mesh.thinInstanceCount = this.n;
      if (vis) this.mesh.thinInstanceBufferUpdated('matrix');
    }
  }
  G.pools = {};
  function poolMesh(shape, name) {
    const base = geoCache.get(shape);
    const m = base.clone(name, null, true); m.makeGeometryUnique && m.makeGeometryUnique();
    return m;
  }
  function radialTexture(name, inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)') {
    const dt = new BABYLON.DynamicTexture(name, { width: 128, height: 128 }, scene, false);
    const c = dt.getContext(); const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner); g.addColorStop(0.55, inner); g.addColorStop(1, outer);
    c.fillStyle = g; c.fillRect(0, 0, 128, 128); dt.hasAlpha = true; dt.update();
    return dt;
  }
  function ringTexture(name) {
    const dt = new BABYLON.DynamicTexture(name, { width: 128, height: 128 }, scene, false);
    const c = dt.getContext(); c.clearRect(0, 0, 128, 128);
    const g = c.createRadialGradient(64, 64, 30, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.82, 'rgba(255,255,255,0.35)'); g.addColorStop(0.93, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(64, 64, 64, 0, TAU); c.fill(); dt.hasAlpha = true; dt.update();
    return dt;
  }
  function softTexture(name) {
    const dt = new BABYLON.DynamicTexture(name, { width: 128, height: 128 }, scene, false);
    const c = dt.getContext(); const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128); dt.hasAlpha = true; dt.update();
    return dt;
  }
  function buildPools() {
    const P = G.pools;
    // ground shadows
    {
      const m = poolMesh('disc', 'pool_shadow');
      const mat = new BABYLON.StandardMaterial('shadowMat', scene);
      mat.diffuseColor = BABYLON.Color3.Black(); mat.specularColor = BABYLON.Color3.Black();
      mat.emissiveColor = BABYLON.Color3.Black(); mat.disableLighting = true;
      mat.opacityTexture = radialTexture('shadowTex'); mat.disableDepthWrite = true; mat.zOffset = -2;
      m.material = mat; P.shadow = new Pool(m, 160);
    }
    G.texRing = ringTexture('ringTex');
    G.texSoft = softTexture('softTex');
    // telegraph shapes (additive, pulsing)
    const tele = (name, shape, hex, tex, max) => {
      const m = poolMesh(shape, name);
      const mat = new BABYLON.StandardMaterial(name + 'M', scene);
      const c = hexToRgb(hex);
      mat.disableLighting = true; mat.emissiveColor = new BABYLON.Color3(c[0], c[1], c[2]); mat.diffuseColor = BABYLON.Color3.Black();
      mat.specularColor = BABYLON.Color3.Black(); mat.alphaMode = BABYLON.Engine.ALPHA_ADD; mat.disableDepthWrite = true;
      if (tex) mat.opacityTexture = tex; mat.alpha = 0.6; mat.backFaceCulling = false;
      m.material = mat; return new Pool(m, max);
    };
    P.teleDisc = tele('tele_disc', 'disc', '#ff3b2f', G.texRing, 80);
    P.teleLine = tele('tele_line', 'plane', '#ff3b2f', null, 60);
    P.teleWarm = tele('tele_warm', 'disc', '#ffb02f', G.texRing, 60);
    P.beam = tele('beam', 'plane', '#ffd0f0', null, 40); P.beam.mesh.material.alpha = 0.95;
    P.beam.mesh.metadata = { glow: new BABYLON.Color4(1, 0.3, 0.7, 1) };
    P.beamCore = tele('beamCore', 'plane', '#ffffff', null, 40); P.beamCore.mesh.material.alpha = 1;
    // zones (soft discs)
    const zone = (name, hex, a, glowK) => {
      const m = poolMesh('disc', name);
      const mat = new BABYLON.StandardMaterial(name + 'M', scene);
      const c = hexToRgb(hex);
      mat.disableLighting = true; mat.emissiveColor = new BABYLON.Color3(c[0], c[1], c[2]);
      mat.diffuseColor = BABYLON.Color3.Black(); mat.specularColor = BABYLON.Color3.Black();
      mat.opacityTexture = G.texSoft; mat.alpha = a; mat.disableDepthWrite = true; mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
      if (glowK) m.metadata = { glow: new BABYLON.Color4(c[0] * glowK, c[1] * glowK, c[2] * glowK, 1) };
      m.material = mat; return new Pool(m, 60);
    };
    P.zSpore = zone('z_spore', '#9affc8', 0.55, 0.15);
    P.zAcid = zone('z_acid', '#c8ff2a', 0.7, 0.25);
    P.zNet = zone('z_net', '#7ff3ff', 0.22, 0.05);
    P.zBio = zone('z_bio', '#6aff9a', 0.5, 0.15);
    P.zRot = zone('z_rot', '#ff7a2a', 0.55, 0.2);
    P.zPull = zone('z_pull', '#c8b0ff', 0.35, 0.1);
    // net strands ring
    {
      const m = poolMesh('torus', 'z_netRing'); m.material = G.glowMat('#bff8ff', { glow: 0.12, alpha: 0.5, k: 0.7 });
      P.netRing = new Pool(m, 20);
    }
  }
  /** bullet / particle pools are created on demand per style key */
  G.bulletPool = function (key, shape, hex, opts = {}) {
    const P = G.pools;
    if (P[key]) return P[key];
    const m = poolMesh(shape, 'pool_' + key);
    m.material = G.glowMat(hex, { glow: opts.glow != null ? opts.glow : 0.9, k: opts.k || 1, alpha: opts.alpha, additive: opts.additive });
    P[key] = new Pool(m, opts.max || 400);
    return P[key];
  };
  G.particlePool = function (hex) {
    const key = 'pt_' + hex;
    return G.bulletPool(key, 'icoFlat', hex, { glow: 0.55, max: 260, k: 1.1 });
  };
  G.beginPools = function () { for (const k in G.pools) G.pools[k].begin(); };
  G.endPools = function () {
    // keep the pulse floor high so telegraphs stay readable on red floors (0.48..0.72)
    const a = G.reduceFlash ? 0.62 : 0.6 + 0.12 * Math.sin(G.time * 10);
    G.pools.teleDisc.mesh.material.alpha = a; G.pools.teleLine.mesh.material.alpha = a * 0.85;
    G.pools.teleWarm.mesh.material.alpha = G.reduceFlash ? 0.5 : 0.5 + 0.1 * Math.sin(G.time * 9);
    for (const k in G.pools) G.pools[k].end();
  };

  /* ------------------------------------------------------------------ */
  /* region lighting                                                     */
  /* ------------------------------------------------------------------ */
  G.setRegion = function (region) {
    const p = region.pal;
    const cc = hexToRgb(p.clear);
    scene.clearColor = new BABYLON.Color4(cc[0], cc[1], cc[2], 1);
    hemi.diffuse = col3(p.hemi, 0.95); hemi.groundColor = col3(p.ground, 1); hemi.specular = col3(p.hemi, 0.2);
    dirLight.diffuse = col3(p.hemi, 0.5);
    outerGround.material.diffuseColor = col3(p.fog, 0.9);
    if (pipeline) { const v = hexToRgb(p.fog); pipeline.imageProcessing.vignetteColor = new BABYLON.Color4(v[0] * 0.4, v[1] * 0.2, v[2] * 0.3, 0); }
  };
  G.setPlayerLight = function (x, y, hex, k = 1) {
    ptLight.position.set(x, 2.4, -y);
    if (hex) ptLight.diffuse = col3(hex, 1);
    ptLight.intensity = 0.7 * k;
  };

  /* ------------------------------------------------------------------ */
  /* procedural tissue floor                                             */
  /* ------------------------------------------------------------------ */
  const PX = 40; // texture pixels per tile
  G.PX = PX;
  G.paintFloor = function (room, region, seed) {
    const W = room.W, H = room.H;
    const cv = document.createElement('canvas'); cv.width = W * PX; cv.height = H * PX;
    const c = cv.getContext('2d');
    const p = region.pal, rng = makeRng(seed);
    const A = hexToRgb(p.floorA), B = hexToRgb(p.floorB), Vn = hexToRgb(p.vein), Sp = hexToRgb(p.speck);
    // base noise
    const noise = makeNoise2D(seed);
    const img = c.createImageData(cv.width, cv.height), d = img.data;
    const sc = 1 / (PX * 2.2);
    for (let y = 0; y < cv.height; y += 2) {
      for (let x = 0; x < cv.width; x += 2) {
        const n = fbm(noise, x * sc, y * sc, 4);
        const n2 = noise(x * sc * 4 + 50, y * sc * 4);
        const t = clamp(n * 1.4 - 0.2 + n2 * 0.15, 0, 1);
        const r = lerp(A[0], B[0], t), g = lerp(A[1], B[1], t), b = lerp(A[2], B[2], t);
        for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) {
          const i = ((y + yy) * cv.width + (x + xx)) * 4;
          d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255; d[i + 3] = 255;
        }
      }
    }
    c.putImageData(img, 0, 0);
    // tissue cells: soft blobs with darker membranes
    const cells = Math.floor(W * H * 0.9);
    for (let i = 0; i < cells; i++) {
      const x = rng.range(0, cv.width), y = rng.range(0, cv.height), r = rng.range(PX * 0.35, PX * 1.1);
      c.beginPath(); c.arc(x, y, r, 0, TAU);
      c.fillStyle = rgbStr(mixRgb(A, B, rng.next()), 0.25); c.fill();
      c.lineWidth = rng.range(1, 2.5); c.strokeStyle = rgbStr(scaleRgb(A, 0.55), 0.35); c.stroke();
      if (rng.chance(0.4)) { c.beginPath(); c.arc(x + rng.range(-r, r) * 0.3, y + rng.range(-r, r) * 0.3, r * 0.22, 0, TAU); c.fillStyle = rgbStr(scaleRgb(Vn, 0.8), 0.3); c.fill(); }
    }
    // veins
    c.lineCap = 'round';
    const veins = 4 + Math.floor(W * H / 60);
    for (let i = 0; i < veins; i++) {
      let x = rng.range(0, cv.width), y = rng.range(0, cv.height), a = rng.range(0, TAU);
      const len = rng.int(14, 34), w0 = rng.range(2.5, 6);
      for (let pass = 0; pass < 2; pass++) {
        let px = x, py = y, pa = a;
        c.beginPath(); c.moveTo(px, py);
        for (let s = 0; s < len; s++) { pa += rng.range(-0.45, 0.45); px += Math.cos(pa) * PX * 0.35; py += Math.sin(pa) * PX * 0.35; c.lineTo(px, py); }
        c.strokeStyle = pass === 0 ? rgbStr(scaleRgb(Vn, 0.6), 0.35) : rgbStr(Vn, 0.55);
        c.lineWidth = pass === 0 ? w0 * 2.4 : w0 * 0.7; c.stroke();
      }
    }
    // specks
    for (let i = 0; i < W * H * 2; i++) {
      c.fillStyle = rgbStr(Sp, rng.range(0.1, 0.35));
      c.beginPath(); c.arc(rng.range(0, cv.width), rng.range(0, cv.height), rng.range(0.8, 2.4), 0, TAU); c.fill();
    }
    // wall ambient occlusion
    const g1 = (x0, y0, x1, y1) => { const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(0,0,0,0.65)'); g.addColorStop(1, 'rgba(0,0,0,0)'); return g; };
    c.fillStyle = g1(0, PX, 0, PX * 2.6); c.fillRect(0, 0, cv.width, PX * 2.6);
    c.fillStyle = g1(0, cv.height - PX, 0, cv.height - PX * 2.6); c.fillRect(0, cv.height - PX * 2.6, cv.width, PX * 2.6);
    c.fillStyle = g1(PX, 0, PX * 2.6, 0); c.fillRect(0, 0, PX * 2.6, cv.height);
    c.fillStyle = g1(cv.width - PX, 0, cv.width - PX * 2.6, 0); c.fillRect(cv.width - PX * 2.6, 0, PX * 2.6, cv.height);
    // obstacle contact shadows
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const t = room.grid[ty * W + tx];
      if (t === T_ROCK || t === T_CLOT) {
        const g = c.createRadialGradient((tx + 0.5) * PX, (ty + 0.62) * PX, PX * 0.2, (tx + 0.5) * PX, (ty + 0.62) * PX, PX * 0.85);
        g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect((tx - 0.5) * PX, (ty - 0.4) * PX, PX * 2, PX * 2);
      }
    }
    return cv;
  };
  /** paint a splat decal into the room floor canvas */
  G.splat = function (room, x, y, r, hex, a = 0.6) {
    if (!room || !room.floorCanvas) return;
    const c = room.floorCanvas.getContext('2d');
    const col = hexToRgb(hex);
    const cx = x * PX, cy = y * PX, R = r * PX;
    c.save();
    c.globalAlpha = a;
    c.fillStyle = rgbStr(scaleRgb(col, 0.55), 1);
    c.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const ang = i / n * TAU, rr = R * (0.65 + Math.random() * 0.45);
      const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath(); c.fill();
    c.globalAlpha = a * 0.8;
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * TAU, d = R * (1 + Math.random() * 0.9), rr = R * (0.08 + Math.random() * 0.16);
      c.beginPath(); c.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, rr, 0, TAU); c.fill();
    }
    c.globalAlpha = a * 0.35; c.fillStyle = rgbStr(col, 1);
    c.beginPath(); c.arc(cx, cy, R * 0.4, 0, TAU); c.fill();
    c.restore();
    room.floorDirty = true;
  };
  G.scorch = function (room, x, y, r) {
    if (!room || !room.floorCanvas) return;
    const c = room.floorCanvas.getContext('2d');
    const g = c.createRadialGradient(x * PX, y * PX, 0, x * PX, y * PX, r * PX);
    g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(0.7, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect((x - r) * PX, (y - r) * PX, r * 2 * PX, r * 2 * PX);
    room.floorDirty = true;
  };
  G.paintText = function (room, lines, cx, cy, hex) {
    const c = room.floorCanvas.getContext('2d');
    c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `600 ${Math.round(PX * 0.42)}px "JetBrains Mono", monospace`;
    lines.forEach((ln, i) => {
      const y = (cy + i * 0.72) * PX;
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillText(ln, cx * PX + 2, y + 2);
      c.fillStyle = hex; c.globalAlpha = 0.55; c.fillText(ln, cx * PX, y); c.globalAlpha = 1;
    });
    c.restore(); room.floorDirty = true;
  };

  /* ------------------------------------------------------------------ */
  /* room meshes                                                         */
  /* ------------------------------------------------------------------ */
  let roomRoot = null, roomFloorTex = null, roomVis = null;
  G.buildRoom = function (room, region) {
    G.clearRoom();
    const W = room.W, H = room.H, p = region.pal;
    roomRoot = new BABYLON.TransformNode('room', scene);
    roomVis = { root: roomRoot, clots: {}, doors: [], acid: null, room };
    // floor
    const ground = BABYLON.MeshBuilder.CreateGround('floor', { width: W, height: H, subdivisions: 1 }, scene);
    ground.position.set(W / 2, 0, -H / 2); ground.parent = roomRoot; ground.isPickable = false;
    roomFloorTex = new BABYLON.DynamicTexture('floorTex', room.floorCanvas, scene, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    roomFloorTex.wrapU = roomFloorTex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    roomFloorTex.update(true);
    const fm = new BABYLON.StandardMaterial('floorMat', scene);
    fm.diffuseTexture = roomFloorTex; fm.specularColor = new BABYLON.Color3(0.08, 0.06, 0.07); fm.specularPower = 12;
    fm.emissiveTexture = roomFloorTex; fm.emissiveColor = new BABYLON.Color3(0.32, 0.32, 0.32);
    ground.material = fm; ground.receiveShadows = false;
    roomVis.floorMat = fm;
    room.floorDirty = false;

    // walls: lumpy membrane spheres merged
    const wallParts = [], rimParts = [];
    const rng = makeRng(room.seed ^ 0x55aa);
    const wallMat = G.cellMat(p.wall, { rim: 2.2, core: 0.5, glow: 0.0, dark: 1.0, power: 2.4 });
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      if (room.grid[ty * W + tx] !== T_WALL) continue;
      // only build visible wall tiles (adjacent to non-wall)
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = tx + dx, ny = ty + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (room.grid[ny * W + nx] !== T_WALL) { edge = true; break; }
      }
      if (!edge) continue;
      const south = ty === H - 1;
      const h = south ? rng.range(0.32, 0.45) : rng.range(0.75, 1.05);
      const m = BABYLON.MeshBuilder.CreateSphere('w', { diameter: 1, segments: 6 }, scene);
      m.scaling.set(rng.range(1.25, 1.55), h * 1.6, rng.range(1.25, 1.55));
      m.position.set(tx + 0.5 + rng.range(-0.1, 0.1), h * 0.35, -(ty + 0.5) + rng.range(-0.1, 0.1));
      wallParts.push(m);
      if (rng.chance(0.4)) {
        const n = BABYLON.MeshBuilder.CreateSphere('w2', { diameter: 1, segments: 5 }, scene);
        const s = rng.range(0.5, 0.85);
        n.scaling.set(s, s * (south ? 0.6 : 1.1), s);
        n.position.set(tx + rng.range(0.1, 0.9), h * 0.7, -(ty + rng.range(0.1, 0.9)));
        wallParts.push(n);
      }
    }
    if (wallParts.length) {
      const wm = BABYLON.Mesh.MergeMeshes(wallParts, true, true, undefined, false, false);
      wm.material = wallMat; wm.parent = roomRoot; wm.isPickable = false;
    }

    // obstacles
    const rockMat = G.cellMat(region.id === 'gut' ? '#a89860' : region.id === 'cortex' ? '#6a70a8' : region.id === 'lungs' ? '#9a98b8' : '#b8a090', { rim: 0.8, core: 0.08, glow: 0, dark: 0.55, power: 2.4 });
    const rocks = [], holes = [], acids = [];
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const t = room.grid[ty * W + tx];
      if (t === T_ROCK) {
        const m = BABYLON.MeshBuilder.CreateIcoSphere('r', { radius: 0.5, subdivisions: 3 }, scene);
        const pos = m.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        for (let i = 0; i < pos.length; i += 3) { const k = 1 + rng.range(-0.18, 0.22); pos[i] *= k; pos[i + 1] *= k; pos[i + 2] *= k; }
        m.updateVerticesData(BABYLON.VertexBuffer.PositionKind, pos);
        const s = rng.range(0.95, 1.2);
        m.scaling.set(s * 1.1, s * rng.range(0.7, 0.95), s * 1.1); m.rotation.y = rng.range(0, TAU);
        m.position.set(tx + 0.5, 0.3, -(ty + 0.5));
        rocks.push(m);
      } else if (t === T_HOLE) {
        holes.push([tx, ty]);
      } else if (t === T_ACID) {
        acids.push([tx, ty]);
      } else if (t === T_CLOT) {
        const m = G.makeClot(tx, ty, rng);
        m.parent = roomRoot; roomVis.clots[tx + ',' + ty] = m;
      }
    }
    if (rocks.length) {
      const rm = BABYLON.Mesh.MergeMeshes(rocks, true, true);
      rm.material = rockMat; rm.parent = roomRoot; rm.isPickable = false;
    }
    if (holes.length) {
      const hm = G.plainMat('#000000', { spec: 0 });
      const rimMat = G.cellMat(p.wall, { rim: 1.6, core: 0.3, glow: 0, dark: 0.9 });
      const discs = [], rims = [];
      for (const [tx, ty] of holes) {
        discs.push(G.part('disc', hm, null, tx + 0.5, 0.012, -(ty + 0.5), 0.58, 1, 0.58));
        rims.push(G.part('torusThick', rimMat, null, tx + 0.5, 0.02, -(ty + 0.5), 0.55, 0.5, 0.55));
      }
      for (const [list, mat] of [[discs, hm], [rims, rimMat]]) {
        const mm = BABYLON.Mesh.MergeMeshes(list, true, true);
        mm.material = mat; mm.parent = roomRoot; mm.isPickable = false;
      }
    }
    if (acids.length) {
      const am = G.glowMat('#b8ff2a', { glow: 0.25, k: 0.75, alpha: 0.85 });
      const parts = [];
      for (const [tx, ty] of acids) {
        const d = BABYLON.MeshBuilder.CreateDisc('a', { radius: 0.62, tessellation: 18 }, scene);
        d.rotation.x = Math.PI / 2; d.position.set(tx + 0.5, 0.015, -(ty + 0.5)); parts.push(d);
      }
      const am2 = BABYLON.Mesh.MergeMeshes(parts, true, true); am2.material = am; am2.parent = roomRoot;
      roomVis.acidMat = am;
    }

    // doors
    for (const d of room.doors) {
      const dv = G.makeDoor(d, room, region);
      roomVis.doors.push(dv);
    }
    return roomVis;
  };
  G.makeClot = function (tx, ty, rng) {
    // merged into one mesh in clot-local space (pivot at clot centre for damageClot scaling)
    const mat = G.cellMat('#a81a2a', { rim: 1.3, core: 0.25, glow: 0.05, dark: 0.7 });
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const s = rng.range(0.28, 0.42);
      parts.push(G.part('sphereLo', mat, null, rng.range(-0.22, 0.22), s * 0.75, rng.range(-0.22, 0.22), s, s * 0.85, s));
    }
    const m = BABYLON.Mesh.MergeMeshes(parts, true, true);
    m.name = 'clot'; m.material = mat; m.isPickable = false;
    m.position.set(tx + 0.5, 0, -(ty + 0.5));
    return m;
  };
  G.removeClot = function (tx, ty) {
    if (!roomVis) return;
    const k = tx + ',' + ty, m = roomVis.clots[k];
    if (m) { m.dispose(); delete roomVis.clots[k]; }
  };
  G.damageClot = function (tx, ty, frac) {
    if (!roomVis) return;
    const m = roomVis.clots[tx + ',' + ty];
    if (m) { const s = 0.55 + 0.45 * frac; m.scaling.set(s, s, s); }
  };
  const DOOR_COL = { normal: '#ffffff', mutation: '#ffd36b', shop: '#7dffb0', boss: '#ff3b4f', tumor: '#c06bff', elite: '#ff9a3a', start: '#ffffff' };
  G.makeDoor = function (d, room, region) {
    const root = new BABYLON.TransformNode('door', scene); root.parent = roomRoot;
    const horiz = d.dir === 'N' || d.dir === 'S';
    root.position.set(d.x, 0, -d.y);
    root.rotation.y = horiz ? 0 : Math.PI / 2;
    const special = d.kind !== 'normal' && d.kind !== 'start';
    const hex = DOOR_COL[d.kind] || '#ffffff';
    const pillarMat = G.cellMat(special ? hex : region.pal.wall, special ? { rim: 1.3, core: 0.25, glow: 0.3, dark: 0.45 } : { rim: 2.6, core: 0.7, glow: 0, dark: 1.6, power: 2.2 });
    for (const sx of [-1, 1]) {
      G.part('sphere', pillarMat, root, sx * 1.72, 0.42, 0, 0.5, d.dir === 'S' ? 0.45 : 0.85, 0.5);
      G.part('sphere', pillarMat, root, sx * 1.95, 0.25, 0.25, 0.32, 0.4, 0.32);
    }
    if (special) {
      const ring = G.part('torus', G.glowMat(hex, { glow: 0.8, k: 0.9 }), root, 0, 0.03, 0, 1.25, 1, 0.6);
      const orb = G.part('sphere', G.glowMat(hex, { glow: 1, k: 1 }), root, 0, d.dir === 'S' ? 0.7 : 1.35, 0, 0.13);
      root.metadata = { orb };
    }
    // membrane: a vertical translucent sheet that sinks into the floor when the door opens
    const memMat = G.glowMat(d.kind === 'boss' ? '#ff3b4f' : region.pal.accent, { alpha: 0.38, glow: 0.12, k: 0.5, backFace: false });
    const mem = G.part('plane', memMat, root, 0, 0.55, 0, 1.45, 1, 0.55);
    mem.rotation.x = -Math.PI / 2;
    return { root, mem, d, open: 1, target: 1, low: d.dir === 'S' };
  };
  G.setDoorsOpen = function (open) {
    if (!roomVis) return;
    for (const dv of roomVis.doors) dv.target = (open && !dv.d.sealed) ? 1 : 0;
  };
  G.updateRoom = function (dt) {
    if (!roomVis) return;
    for (const dv of roomVis.doors) {
      dv.open = approach(dv.open, dv.target, dt * 4);
      const k = 1 - dv.open, hgt = dv.low ? 0.3 : 0.55;
      dv.mem.scaling.set(1.45, 1, Math.max(0.001, hgt * k));
      dv.mem.position.y = hgt * k;
      dv.mem.isVisible = k > 0.01;
      const o = dv.root.metadata && dv.root.metadata.orb; if (o) o.position.y = (dv.low ? 0.7 : 1.35) + Math.sin(G.time * 2.5) * 0.08;
    }
    if (roomVis.acidMat) { const s = 0.7 + Math.sin(G.time * 3) * 0.12; roomVis.acidMat.emissiveColor.set(0.72 * s, 1.0 * s, 0.16 * s); }
    const room = roomVis.room;
    if (room.floorDirty) {
      room.floorDirtyT = (room.floorDirtyT || 0) + dt;
      if (room.floorDirtyT > 0.12) { roomFloorTex.update(true); room.floorDirty = false; room.floorDirtyT = 0; }
    }
    if (roomVis.floorMat && room.pulse) {
      const k = 0.32 + room.pulse * 0.2;
      roomVis.floorMat.emissiveColor.set(k, k * 0.92, k * 0.95);
    }
  };
  G.clearRoom = function () {
    if (roomRoot) { roomRoot.dispose(false, false); roomRoot = null; }
    if (roomFloorTex) { roomFloorTex.dispose(); roomFloorTex = null; }
    if (roomVis && roomVis.floorMat) roomVis.floorMat.dispose();
    roomVis = null;
  };
  G.roomRoot = () => roomRoot;

  /* ------------------------------------------------------------------ */
  /* overlay 2D (damage numbers, labels)                                 */
  /* ------------------------------------------------------------------ */
  const floaters = [];
  G.floatText = function (x, y, text, hex = '#ffffff', size = 16, opts = {}) {
    if (floaters.length > 80) floaters.shift();
    floaters.push({ x, y, h: opts.h || 1.1, text, hex, size, t: 0, life: opts.life || 0.75, vy: opts.vy || 1.6, vx: rnd(-0.4, 0.4), crit: !!opts.crit });
  };
  G.labels = []; // persistent per-frame labels set by game: {x,y,h,text,hex,size,sub}
  G.drawOverlay = function (dt) {
    const s = G.ovScale || 1;
    octx.setTransform(s, 0, 0, s, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.textAlign = 'center'; octx.textBaseline = 'middle';
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.t += dt;
      if (f.t >= f.life) { floaters.splice(i, 1); continue; }
      const k = f.t / f.life;
      const p = G.worldToScreen(f.x + f.vx * f.t, f.y, f.h + f.vy * easeOut(k) * 0.9);
      const sc = f.crit ? (1.25 + (1 - Math.min(1, f.t * 8)) * 0.6) : (1 + (1 - Math.min(1, f.t * 10)) * 0.4);
      octx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      octx.font = `800 ${Math.round(f.size * sc)}px "Unbounded", "JetBrains Mono", sans-serif`;
      octx.lineWidth = 4; octx.strokeStyle = 'rgba(0,0,0,0.75)'; octx.strokeText(f.text, p.x, p.y);
      octx.fillStyle = f.hex; octx.fillText(f.text, p.x, p.y);
    }
    octx.globalAlpha = 1;
    for (const L of G.labels) {
      const p = G.worldToScreen(L.x, L.y, L.h || 1.6);
      octx.font = `700 ${L.size || 14}px "JetBrains Mono", monospace`;
      const w = octx.measureText(L.text).width + 16;
      if (L.box !== false) {
        octx.fillStyle = 'rgba(6,4,10,0.78)'; octx.strokeStyle = L.hex || '#fff'; octx.lineWidth = 1;
        roundRect(octx, p.x - w / 2, p.y - 13, w, 26, 6); octx.fill(); octx.stroke();
      }
      octx.fillStyle = L.hex || '#fff'; octx.fillText(L.text, p.x, p.y + 1);
      if (L.sub) { octx.font = '600 11px "JetBrains Mono", monospace'; octx.fillStyle = 'rgba(255,255,255,0.75)'; octx.fillText(L.sub, p.x, p.y + 24); }
    }
    G.labels.length = 0;
  };
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  G.clearFloaters = () => { floaters.length = 0; };

  /* ------------------------------------------------------------------ */
  /* frame                                                               */
  /* ------------------------------------------------------------------ */
  G.render = function (dt) {
    G.time += dt;
    scene.render();
  };
  G.engine = () => engine; G.scene = () => scene; G.camera = () => camera;
  G.fps = () => engine ? engine.getFps() : 0;
  return G;
})();
