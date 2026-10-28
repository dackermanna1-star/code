// Probe: PBRMaterial + WorldMaterialPlugin end-to-end (texture arrays, per-vertex surf/tint/metal, normal maps,
// shadows, fog, HDR emissive + bloom). The StandardMaterial variant is render-materials-plugin-std.probe.ts.
import {
  Engine, Scene, Vector3, Color3, Color4, FreeCamera, HemisphericLight, DirectionalLight, ShadowGenerator, Mesh, VertexData,
  PBRMaterial, StandardMaterial, DefaultRenderingPipeline, Matrix, MeshBuilder, ReflectionProbe, RenderTargetTexture, type Material,
} from "@babylonjs/core";
import { WorldMaterialPlugin, createTextureArray } from "./render-materials-worldmat.ts";
import { makeAlbedoLayers, makeNormalLayers, GeomBuilder, TEX, type SurfAttrs, type V3 } from "./render-materials-proctex.ts";

const lin = (c: V3): V3 => [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2)];

export async function runWorldMatScene(kind: "pbr" | "std", opts: { bloom: boolean; env?: boolean }) {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);
  const sky = new Color3(0.55, 0.62, 0.72);
  scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 12;
  scene.fogEnd = 34;
  scene.fogColor = sky;
  const cam = new FreeCamera("cam", new Vector3(0.5, 2.4, -6.5), scene);
  cam.setTarget(new Vector3(0, 0.9, 1.5));
  cam.minZ = 0.05;
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = kind === "pbr" ? 0.35 : 0.3;
  hemi.groundColor = new Color3(0.25, 0.22, 0.2);
  // sun shining towards the camera (-z) so shadows fall in front of the boxes
  const sunDir = new Vector3(-0.5, -1, -0.8).normalize();
  const sun = new DirectionalLight("sun", sunDir, scene);
  sun.position = sunDir.scale(-25);
  sun.intensity = kind === "pbr" ? 3.0 : 0.9;
  // IMPORTANT: otherwise the shadow depth range is the camera's minZ..maxZ (0.05..10000) and bias is useless
  sun.autoCalcShadowZBounds = true;
  const sg = new ShadowGenerator(2048, sun);
  sg.usePercentageCloserFiltering = true;
  sg.bias = 0.002;
  sg.normalBias = 0.01;

  // --- textures
  const albedo = createTextureArray(scene, makeAlbedoLayers(), TEX, { mipmaps: true });
  const normal = createTextureArray(scene, makeNormalLayers(), TEX, { mipmaps: true });

  // --- material
  let mat: Material;
  if (kind === "pbr") {
    const m = new PBRMaterial("world", scene);
    m.metallic = 0; // non-null metallic/roughness => METALLICWORKFLOW (needed for the roughness/metal injection)
    m.roughness = 1;
    m.albedoColor = Color3.White();
    mat = m;
  } else {
    const m = new StandardMaterial("world", scene);
    m.specularColor = new Color3(0.6, 0.6, 0.6);
    mat = m;
  }
  const plugin = new WorldMaterialPlugin(mat);
  plugin.setTextures(albedo, normal);

  // tint colour space: PBR expects linear vertex colours, Standard works in gamma space
  const T = (c: V3): V3 => (kind === "pbr" ? lin(c) : c);
  const S = (layer: number, normalLayer: number, rough: number, tint: V3, worldSize: number, extra: Partial<SurfAttrs> = {}): SurfAttrs => ({
    layer, normalLayer, rough, emissive: 0, tint: T(tint), metal: 0, worldSize, ...extra,
  });

  // --- static environment: ground (tiles), back wall (bricks), all in ONE mesh/draw call
  const env = new GeomBuilder();
  env.quad([0, 0, 4], [0, 1, 0], [0, 0, 1], 12, 16, S(3, 3, 0.35, [1, 1, 1], 0.6)); // tiles: uv repeats every 0.6 m
  env.quad([-1.5, 2, 3.2], [0, 0, -1], [0, 1, 0], 3.5, 2, S(1, 1, 0.9, [1, 1, 1], 1.0)); // brick wall facing the camera
  env.quad([-4.6, 1, 0.5], [1, 0, 0], [0, 1, 0], 2.5, 1, S(5, 0, 0.6, [1, 1, 1], 2.0)); // "F" panel facing +X
  // --- dynamic-ish island: several boxes in one mesh with per-face surfaces
  const props = new GeomBuilder();
  props.box([-1.6, 0.5, 0.6], [0.5, 0.5, 0.5], () => S(2, 0, 0.55, [1, 1, 1], 0.8)); // wood crate
  props.box([0, 0.4, 0], [0.4, 0.4, 0.4], () => S(0, 2, 0.25, [0.9, 0.9, 1.0], 0.8, { metal: 1 })); // metallic + dome normals
  props.box([1.5, 0.35, 0.4], [0.35, 0.35, 0.35], (f) => S(f % 2 ? 3 : 1, f % 2 ? 3 : 1, 0.5, [[1, 0.4, 0.4], [0.4, 1, 0.4], [0.4, 0.4, 1], [1, 1, 0.4], [1, 0.4, 1], [0.4, 1, 1]][f] as V3, 0.5));
  props.box([0.4, 1.25, 0.9], [0.12, 0.12, 0.12], () => S(4, 0, 0.3, [1.0, 0.85, 0.6], 1, { emissive: 6 })); // HDR emissive "bulb"
  props.box([8, 1.0, 18], [1.0, 1.0, 1.0], () => S(4, 0, 0.6, [1, 0.2, 0.2], 0.8)); // far red crate: fog check

  const toMesh = (name: string, g: GeomBuilder): Mesh => {
    const m = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = g.positions;
    vd.normals = g.normals;
    vd.uvs = g.uvs;
    vd.colors = g.colors;
    vd.indices = g.indices;
    vd.applyToMesh(m, false);
    m.setVerticesData("surf", g.surf, false, 4); // AFTER the geometry exists
    m.material = mat;
    return m;
  };
  const envMesh = toMesh("env", env);
  envMesh.receiveShadows = true;
  const propMesh = toMesh("props", props);
  propMesh.receiveShadows = true;
  sg.addShadowCaster(propMesh);

  // a mesh WITHOUT the custom "surf" attribute (and without colours) using the same material
  const noSurf = MeshBuilder.CreateBox("noSurf", { size: 0.5 }, scene);
  noSurf.position.set(-3.2, 0.25, -1.6);
  noSurf.material = mat;
  let envInfo: Record<string, unknown> | null = null;
  if (opts.env) {
    // Network-free IBL: gradient sky dome + scene geometry captured once into a cube RT, used as the scene
    // environment (PBR reflections/IBL). Re-render on demand with probe.cubeTexture.resetRefreshCounter().
    const dome = MeshBuilder.CreateSphere("skyDome", { diameter: 200, segments: 12, sideOrientation: Mesh.BACKSIDE }, scene);
    const dm = new StandardMaterial("skyDomeMat", scene);
    dm.disableLighting = true;
    dm.emissiveColor = sky;
    dm.fogEnabled = false;
    dome.material = dm;
    const probe = new ReflectionProbe("envProbe", 128, scene, true);
    probe.position = new Vector3(0, 1.5, -1);
    // ONLY meshes whose materials do not sample scene.environmentTexture (else: GL feedback loop errors)
    probe.renderList!.push(dome);
    probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    scene.environmentTexture = probe.cubeTexture;
    envInfo = { probeSize: 128 };
  }
  let pipeline: DefaultRenderingPipeline | null = null;
  if (opts.bloom) {
    pipeline = new DefaultRenderingPipeline("pp", true, scene, [cam]);
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 1.0;
    pipeline.bloomWeight = 0.8;
    pipeline.bloomKernel = 48;
    pipeline.imageProcessing.toneMappingEnabled = true;
    pipeline.imageProcessing.toneMappingType = 1; // ACES
  }

  await scene.whenReadyAsync();
  for (let i = 0; i < 3; i++) scene.render();

  const w = engine.getRenderWidth(), h = engine.getRenderHeight();
  const readWorld = async (p: V3) => {
    const sp = Vector3.Project(new Vector3(...p), Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
    const d = (await engine.readPixels(Math.round(sp.x), Math.round(h - sp.y), 1, 1)) as Uint8Array;
    return [d[0], d[1], d[2]];
  };
  const effect = propMesh.subMeshes[0].effect!;
  const frag = effect.fragmentSourceCode;
  const vert = effect.vertexSourceCode;
  // CPU frame time (render only)
  const t0 = performance.now();
  for (let i = 0; i < 30; i++) scene.render();
  const msPerFrame = (performance.now() - t0) / 30;
  const result = {
    kind,
    ready: mat.isReady(propMesh),
    compileError: effect.getCompilationError(),
    fragHasSampler: frag.includes("wmAlbedoSampler"),
    fragHasSampler2DArrayDecl: /uniform\s+highp\s+sampler2DArray\s+wmAlbedoSampler/.test(frag),
    vertHasSurfAttr: /in\s+vec4\s+surf;/.test(vert),
    vertUsesUvUpdated: vert.includes("vWmUV=uvUpdated") || vert.includes("vWmUV = uvUpdated"),
    defines: {
      UV1: !!propMesh.subMeshes[0].materialDefines?.["UV1"],
      VERTEXCOLOR: !!propMesh.subMeshes[0].materialDefines?.["VERTEXCOLOR"],
      VERTEXALPHA: !!propMesh.subMeshes[0].materialDefines?.["VERTEXALPHA"],
      WORLDMAT_NORMALMAP: !!propMesh.subMeshes[0].materialDefines?.["WORLDMAT_NORMALMAP"],
      METALLICWORKFLOW: !!propMesh.subMeshes[0].materialDefines?.["METALLICWORKFLOW"],
      FOG: !!propMesh.subMeshes[0].materialDefines?.["FOG"],
      SHADOW1_env: !!envMesh.subMeshes[0].materialDefines?.["SHADOW1"],
      SHADOWPCF1_env: !!envMesh.subMeshes[0].materialDefines?.["SHADOWPCF1"],
    },
    pixels: {
      groundLit_grout: await readWorld([2.4, 0, -1.2]),
      tileCenter_lit: await readWorld([2.85, 0, -0.45]),
      tileCenter_inCrateShadow: await readWorld([-1.95, 0, -0.45]),
      emissiveBulb: await readWorld([0.4, 1.25, 0.78]),
      farCrateFogged: await readWorld([8, 1.0, 16.95]),
      farCrateFogFactorExpected: +((scene.fogEnd - Vector3.Distance(cam.position, new Vector3(8, 1, 17))) / (scene.fogEnd - scene.fogStart)).toFixed(3),
      nearWood: await readWorld([-1.6, 0.5, 0.09]),
      sky: [Math.round(sky.r * 255), Math.round(sky.g * 255), Math.round(sky.b * 255)],
    },
    msPerFrameCPU: +msPerFrame.toFixed(2),
    activeMeshes: scene.getActiveMeshes().length,
    shadowRenderList: sg.getShadowMap()?.renderList?.length,
    noSurfMesh: {
      ready: mat.isReady(noSurf),
      WORLDMAT_SURF: !!noSurf.subMeshes[0].materialDefines?.["WORLDMAT_SURF"],
      VERTEXCOLOR: !!noSurf.subMeshes[0].materialDefines?.["VERTEXCOLOR"],
      pixel: await readWorld([-3.2, 0.25, -1.86]),
      propMesh_WORLDMAT_SURF: !!propMesh.subMeshes[0].materialDefines?.["WORLDMAT_SURF"],
    },
    envInfo,
    metalCubeFront: await readWorld([0, 0.45, -0.41]),
  };
  engine.runRenderLoop(() => scene.render());
  return { result, scene, engine, cam, plugin, pipeline };
}

export async function probe() {
  const { result } = await runWorldMatScene("pbr", { bloom: true });
  return result;
}
