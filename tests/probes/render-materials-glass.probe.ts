// Probe: transparent glass setups (PBR / Standard), env reflections from a render-once ReflectionProbe,
// depth-write / depth-prepass / culling variants with many overlapping shards in ONE mesh, and the CPU cost of
// sorting 300 separate transparent shard meshes.
import {
  Engine, Scene, Vector3, Color3, Color4, FreeCamera, HemisphericLight, DirectionalLight, Mesh, MeshBuilder, VertexData,
  PBRMaterial, StandardMaterial, ReflectionProbe, RenderTargetTexture, FresnelParameters, Matrix, DynamicTexture, Texture, Viewport, type Material,
} from "@babylonjs/core";
import { GeomBuilder, type V3, type SurfAttrs } from "./render-materials-proctex.ts";

const S0: SurfAttrs = { layer: 0, normalLayer: 0, rough: 0, emissive: 0, tint: [1, 1, 1], metal: 0, worldSize: 1 };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Thin triangular glass shard (prism): 2 caps + 3 sides, flat normals, correct winding via polyFace. */
function shard(g: GeomBuilder, c: V3, r: () => number, size: number, thick: number) {
  // random orthonormal frame
  const n0: V3 = [r() - 0.5, r() - 0.5, r() - 0.5];
  const l = Math.hypot(...n0);
  const n: V3 = [n0[0] / l, n0[1] / l, n0[2] / l];
  const a0: V3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const cr = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let u = cr(n, a0);
  const ul = Math.hypot(...u);
  u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const v = cr(n, u);
  const pts: V3[] = [];
  for (let k = 0; k < 3; k++) {
    const ang = (k / 3) * Math.PI * 2 + r() * 1.2;
    const rad = size * (0.5 + r() * 0.6);
    pts.push([c[0] + (u[0] * Math.cos(ang) + v[0] * Math.sin(ang)) * rad, c[1] + (u[1] * Math.cos(ang) + v[1] * Math.sin(ang)) * rad, c[2] + (u[2] * Math.cos(ang) + v[2] * Math.sin(ang)) * rad]);
  }
  const off = (p: V3, s: number): V3 => [p[0] + n[0] * s, p[1] + n[1] * s, p[2] + n[2] * s];
  const top = pts.map((p) => off(p, thick / 2));
  const bot = pts.map((p) => off(p, -thick / 2));
  g.polyFace(top, n, S0);
  g.polyFace(bot, [-n[0], -n[1], -n[2]], S0);
  for (let k = 0; k < 3; k++) {
    const k2 = (k + 1) % 3;
    const e: V3 = [pts[k2][0] - pts[k][0], pts[k2][1] - pts[k][1], pts[k2][2] - pts[k][2]];
    let sn = cr(e, n);
    const sl = Math.hypot(...sn);
    sn = [sn[0] / sl, sn[1] / sl, sn[2] / sl];
    // make side normal point away from the centroid
    const mid: V3 = [(pts[k][0] + pts[k2][0]) / 2 - c[0], (pts[k][1] + pts[k2][1]) / 2 - c[1], (pts[k][2] + pts[k2][2]) / 2 - c[2]];
    if (sn[0] * mid[0] + sn[1] * mid[1] + sn[2] * mid[2] < 0) sn = [-sn[0], -sn[1], -sn[2]];
    g.polyFace([bot[k], bot[k2], top[k2], top[k]], sn, S0);
  }
}

function toMesh(name: string, g: GeomBuilder, scene: Scene, mat: Material): Mesh {
  const m = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = g.positions;
  vd.normals = g.normals;
  vd.indices = g.indices;
  vd.applyToMesh(m);
  m.material = mat;
  return m;
}

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.45, 0.6, 0.8, 1);
  const cam = new FreeCamera("cam", new Vector3(0, 1.5, -5.6), scene);
  cam.setTarget(new Vector3(0, 1.15, 0));
  new HemisphericLight("h", new Vector3(0, 1, 0), scene).intensity = 0.35;
  const sun = new DirectionalLight("sun", new Vector3(0.3, -0.6, 0.8).normalize(), scene);
  sun.intensity = 1.0;

  // --- opaque background: striped wall + ground + coloured posts, and a gradient "sky" dome for reflections
  const wall = MeshBuilder.CreatePlane("wall", { width: 12, height: 5 }, scene);
  wall.position.set(0, 2.5, 2.5);
  const wm = new StandardMaterial("wm", scene);
  const chk = new DynamicTexture("chk", 256, scene, true);
  const cx2 = chk.getContext() as CanvasRenderingContext2D;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { cx2.fillStyle = (x + y) % 2 ? "#2a2a30" : "#5a5a66"; cx2.fillRect(x * 32, y * 32, 32, 32); }
  chk.update();
  chk.wrapU = chk.wrapV = Texture.WRAP_ADDRESSMODE;
  chk.uScale = 6; chk.vScale = 2.5;
  wm.diffuseTexture = chk;
  wm.specularColor = Color3.Black();
  wall.material = wm;
  for (let i = 0; i < 6; i++) {
    const post = MeshBuilder.CreateBox("post" + i, { width: 0.18, height: 2.6, depth: 0.18 }, scene);
    post.position.set(-5 + i * 2, 1.3, 1.6);
    const pm = new StandardMaterial("pm" + i, scene);
    pm.diffuseColor = Color3.FromHSV(i * 60, 0.8, 0.8);
    post.material = pm;
  }
  const ground = MeshBuilder.CreateGround("ground", { width: 14, height: 10 }, scene);
  const gm = new StandardMaterial("gm", scene);
  gm.diffuseColor = new Color3(0.2, 0.2, 0.22);
  ground.material = gm;
  const dome = MeshBuilder.CreateSphere("dome", { diameter: 60, segments: 16, sideOrientation: Mesh.BACKSIDE }, scene);
  const dm = new StandardMaterial("dm", scene);
  dm.disableLighting = true;
  dm.emissiveColor = new Color3(0.55, 0.7, 0.95);
  dome.material = dm;

  // --- environment for reflections: render-once reflection probe (no network assets needed)
  const probeR = new ReflectionProbe("env", 128, scene, true);
  probeR.renderList!.push(dome, wall, ground, ...scene.meshes.filter((m) => m.name.startsWith("post")));
  probeR.position = new Vector3(0, 1.2, 0);
  probeR.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;

  // --- glass materials
  const pbrGlass = (name: string): PBRMaterial => {
    const m = new PBRMaterial(name, scene);
    m.albedoColor = new Color3(0.85, 0.95, 0.92);
    m.alpha = 0.18;
    m.metallic = 0;
    m.roughness = 0.04;
    m.reflectionTexture = probeR.cubeTexture;
    m.environmentIntensity = 1.0;
    // defaults: useRadianceOverAlpha = useSpecularOverAlpha = true (reflections stay bright on low-alpha glass)
    return m;
  };
  const mDefault = pbrGlass("glassDefault");
  const mNoDepth = pbrGlass("glassNoDepthWrite");
  mNoDepth.disableDepthWrite = true;
  const mPrePass = pbrGlass("glassDepthPrePass");
  mPrePass.needDepthPrePass = true;
  const mTwoSided = pbrGlass("glassTwoSidedSeparate");
  mTwoSided.backFaceCulling = false;
  mTwoSided.separateCullingPass = true;
  mTwoSided.disableDepthWrite = true;
  const mStd = new StandardMaterial("glassStd", scene);
  mStd.diffuseColor = new Color3(0.8, 0.9, 0.88);
  mStd.alpha = 0.2;
  mStd.specularColor = new Color3(1, 1, 1);
  mStd.specularPower = 256;
  mStd.reflectionTexture = probeR.cubeTexture;
  mStd.reflectionFresnelParameters = new FresnelParameters({ bias: 0.15, power: 2, leftColor: Color3.White(), rightColor: Color3.Black() });
  mStd.disableDepthWrite = true;

  const variants: Array<[string, Material]> = [
    ["PBR default (depth write on)", mDefault],
    ["PBR disableDepthWrite", mNoDepth],
    ["PBR needDepthPrePass", mPrePass],
    ["PBR 2-sided separateCullingPass", mTwoSided],
    ["Standard + fresnel reflection", mStd],
  ];
  const tris: Record<string, number> = {};
  variants.forEach(([name, mat], i) => {
    const r = rng(1234); // identical shards per column
    const g = new GeomBuilder();
    const cx = -4 + i * 2;
    for (let k = 0; k < 14; k++) shard(g, [cx + (r() - 0.5) * 1.0, 0.6 + r() * 0.9, (r() - 0.5) * 1.0], r, 0.35, 0.012);
    // window pane piece (thin box) behind the shards
    g.box([cx, 1.9, 0.6], [0.8, 0.45, 0.003], () => S0);
    tris[name] = g.indices.length / 3;
    toMesh("glass_" + i, g, scene, mat);
  });

  await scene.whenReadyAsync();
  for (let i = 0; i < 3; i++) scene.render();

  // CPU cost: 300 separate transparent shard meshes (sorted per frame) vs the same shards in 1 mesh
  const gl = (engine as unknown as { _gl: WebGL2RenderingContext })._gl;
  const timeFrames = (n: number) => {
    gl.finish();
    const ts: number[] = [];
    for (let i = 0; i < n; i++) { const t0 = performance.now(); scene.render(); ts.push(performance.now() - t0); }
    ts.sort((a, b) => a - b);
    return { min: +ts[0].toFixed(2), median: +ts[ts.length >> 1].toFixed(2) };
  };
  const baseFrame = timeFrames(10);
  const r = rng(99);
  const many: Mesh[] = [];
  for (let k = 0; k < 300; k++) {
    const g = new GeomBuilder();
    shard(g, [(r() - 0.5) * 8, 0.2 + r() * 2.5, -1.5 + r() * 3], r, 0.12, 0.008);
    many.push(toMesh("s" + k, g, scene, mNoDepth));
  }
  await scene.whenReadyAsync();
  for (let i = 0; i < 3; i++) scene.render();
  const manyFrame = timeFrames(10);
  for (const m of many) m.setEnabled(false);
  const gAll = new GeomBuilder();
  const r2 = rng(99);
  for (let k = 0; k < 300; k++) shard(gAll, [(r2() - 0.5) * 8, 0.2 + r2() * 2.5, -1.5 + r2() * 3], r2, 0.12, 0.008);
  const one = toMesh("shardsOne", gAll, scene, mNoDepth);
  await scene.whenReadyAsync();
  for (let i = 0; i < 3; i++) scene.render();
  const oneFrame = timeFrames(10);
  one.setEnabled(false);
  for (const m of many) m.dispose();

  const w = engine.getRenderWidth(), h = engine.getRenderHeight();
  const read = async (p: V3) => {
    const sp = Vector3.Project(new Vector3(...p), Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
    const d = (await engine.readPixels(Math.round(sp.x), Math.round(h - sp.y), 1, 1)) as Uint8Array;
    return [d[0], d[1], d[2]];
  };
  scene.render();
  const sanityPostGreen = await read([-1, 1.3, 1.5]);
  // zoomed comparison panels: one camera per variant (3x2 grid of viewports)
  const panels: FreeCamera[] = [];
  variants.forEach((_, i) => {
    const c = new FreeCamera("panel" + i, new Vector3(-4 + i * 2, 1.35, -1.55), scene);
    c.setTarget(new Vector3(-4 + i * 2, 1.25, 0.3));
    c.viewport = new Viewport((i % 3) / 3, i < 3 ? 0.5 : 0, 1 / 3, 0.5);
    panels.push(c);
  });
  const overview = new FreeCamera("overview", cam.position.clone(), scene);
  overview.setTarget(new Vector3(0, 1.15, 0));
  overview.viewport = new Viewport(2 / 3, 0, 1 / 3, 0.5);
  panels.push(overview);
  scene.activeCameras = panels;
  const out = {
    sanityPostGreen,
    trianglesPerColumn: tris,
    probeTextureReady: probeR.cubeTexture.isReady(),
    paneCenterPixels: await Promise.all(variants.map((_, i) => read([-4 + i * 2, 1.9, 0.597]))),
    cpuFrame_baseline_ms: baseFrame,
    cpuFrame_plus300SeparateTransparentMeshes_ms: manyFrame,
    cpuFrame_plus300ShardsInOneMesh_ms: oneFrame,
  };
  engine.runRenderLoop(() => scene.render());
  return out;
}
