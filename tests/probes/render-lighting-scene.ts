// Showcase scene for render-lighting probes: test room + golden-hour sun with shadows through the window,
// warm point lights (clustered), hemispheric fill, gradient sky dome, SSAO2 + DefaultRenderingPipeline (ACES, bloom,
// FXAA, grain, vignette), HDR emissive quad, optional PS2 post-process.
import {
  Vector3, Color3, Color4, FreeCamera, HemisphericLight, PointLight, ShadowGenerator, MeshBuilder, StandardMaterial,
  PBRMaterial, ShaderMaterial, Effect, PostProcess, Texture, ClusteredLightContainer, DefaultRenderingPipeline,
  SSAO2RenderingPipeline, ImageProcessingConfiguration, SceneInstrumentation, Constants, Mesh, VertexData,
  type Scene, type Camera, type Engine, type DirectionalLight,
} from "@babylonjs/core";
import { buildRoom, makeSun, type Room } from "./render-lighting-room.ts";

// ---------------------------------------------------------------- PS2 post-process
export const PS2_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 lowRes;       // internal resolution, e.g. 640x448 (== this post-process input size)
uniform float levels;      // 31.0 -> 5 bits per channel (15-bit colour)
uniform float ditherAmount; // 0..1

// 4x4 ordered Bayer threshold in [0,1): M2(x,y)=2*(x^y)+y ; M4 = 4*M2(low bits) + M2(high bits)
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  vec2 lo = mod(q, 2.0);
  vec2 hi = floor(q * 0.5);
  float m2lo = 2.0 * abs(lo.x - lo.y) + lo.y;
  float m2hi = 2.0 * abs(hi.x - hi.y) + hi.y;
  return (4.0 * m2lo + m2hi + 0.5) / 16.0;
}

void main(void) {
  vec2 px = floor(vUV * lowRes);            // low-res pixel index
  vec2 uv = (px + 0.5) / lowRes;            // sample texel centre (input is NEAREST-sampled anyway)
  vec3 c = texture2D(textureSampler, uv).rgb;
  float t = mix(0.5, bayer4(px), ditherAmount);
  c = floor(clamp(c, 0.0, 1.0) * levels + t) / levels;   // ordered-dither quantisation
  gl_FragColor = vec4(c, 1.0);
}
`;

export function createPs2PostProcess(camera: Camera, engine: Engine, w = 640, h = 448): PostProcess {
  if (!Effect.ShadersStore["ps2FragmentShader"]) Effect.ShadersStore["ps2FragmentShader"] = PS2_FRAGMENT;
  // size {width,height}: this PP's INPUT texture is 640x448, i.e. the previous stage renders at low res;
  // NEAREST sampling of that input gives the blocky upscale when this PP draws to the full-res canvas.
  const pp = new PostProcess("ps2", "ps2", ["lowRes", "levels", "ditherAmount"], null, { width: w, height: h }, camera,
    Texture.NEAREST_SAMPLINGMODE, engine, false);
  pp.onApplyObservable.add((effect) => {
    effect.setFloat2("lowRes", w, h);
    effect.setFloat("levels", 31);
    effect.setFloat("ditherAmount", 1);
  });
  return pp;
}

/** Keep a post-process last in the camera chain (DefaultRenderingPipeline re-appends its effects on every rebuild). */
export function keepLast(camera: Camera, pp: PostProcess): void {
  const i = camera._postProcesses.indexOf(pp);
  if (i !== -1 && i !== camera._postProcesses.length - 1) {
    camera.detachPostProcess(pp);
    camera.attachPostProcess(pp);
  }
}

// ---------------------------------------------------------------- sky dome
const SKY_VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main(void) {
  vDir = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;
const SKY_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 sunDir;      // towards the sun
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 ground;
uniform vec3 sunColor;
void main(void) {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(horizon, zenith, pow(h, 0.45)) : mix(horizon * 0.6, ground, pow(-h, 0.3));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 8.0) * 0.6 + pow(s, 900.0) * 30.0);   // glow + HDR disc (blooms)
  gl_FragColor = vec4(col, 1.0);
}`;

export function createSkyDome(scene: Scene, sun: DirectionalLight): ShaderMaterial {
  Effect.ShadersStore["skyDomeVertexShader"] = SKY_VERTEX;
  Effect.ShadersStore["skyDomeFragmentShader"] = SKY_FRAGMENT;
  const mat = new ShaderMaterial("skyDome", scene, { vertex: "skyDome", fragment: "skyDome" }, {
    attributes: ["position"],
    uniforms: ["worldViewProjection", "sunDir", "zenith", "horizon", "ground", "sunColor"],
  });
  mat.setVector3("sunDir", sun.direction.scale(-1));
  mat.setColor3("zenith", new Color3(0.18, 0.32, 0.62));
  mat.setColor3("horizon", new Color3(1.0, 0.62, 0.36));
  mat.setColor3("ground", new Color3(0.08, 0.07, 0.07));
  mat.setColor3("sunColor", new Color3(1.0, 0.75, 0.45));
  mat.backFaceCulling = false;
  mat.disableDepthWrite = true;
  const dome = MeshBuilder.CreateSphere("skyDome", { diameter: 400, segments: 16, sideOrientation: 1 /* BACKSIDE */ }, scene);
  dome.material = mat;
  dome.infiniteDistance = true;
  dome.isPickable = false;
  dome.applyFog = false;
  dome.renderingGroupId = 0;
  return mat;
}

// ---------------------------------------------------------------- showcase
export interface ShowcaseOptions { ssao?: boolean; pipeline?: boolean; ps2?: boolean; clustered?: boolean; sky?: boolean }
export interface Showcase {
  scene: Scene; camera: FreeCamera; room: Room; sun: DirectionalLight; sg: ShadowGenerator; drp?: DefaultRenderingPipeline;
  ssao?: SSAO2RenderingPipeline; ps2?: PostProcess; si: SceneInstrumentation; points: PointLight[];
}

export function buildShowcase(scene: Scene, engine: Engine, opts: ShowcaseOptions = {}): Showcase {
  const o = { ssao: true, pipeline: true, ps2: false, clustered: true, sky: true, ...opts };
  scene.clearColor = new Color4(0, 0, 0, 1);
  const camera = new FreeCamera("cam", new Vector3(0.35, 1.6, 3.75), scene);
  camera.setTarget(new Vector3(3.4, 0.55, 1.3));
  camera.fov = 1.2;
  camera.minZ = 0.05;
  camera.maxZ = 300;
  const si = new SceneInstrumentation(scene);
  const room = buildRoom(scene);
  for (const m of room.meshes) m.receiveShadows = true;

  // sun: low, warm, from SW. PBR + ACES: intensity ~4-6 reads as bright sunlight.
  const sun = makeSun(scene, 225, 20);
  sun.intensity = 5;
  sun.autoCalcShadowZBounds = true;
  const sg = new ShadowGenerator(2048, sun);
  for (const m of room.casters) sg.addShadowCaster(m, false);
  sg.usePercentageCloserFiltering = true;
  sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  sg.bias = 0.0005;
  sg.normalBias = 0.02;

  // sky/bounce fill
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.35;
  hemi.diffuse = new Color3(0.6, 0.7, 0.95);
  hemi.groundColor = new Color3(0.35, 0.25, 0.18);
  hemi.specular = Color3.Black();

  // warm interior lights
  const points: PointLight[] = [];
  const pp = [new Vector3(2.6, 2.55, 3.5), new Vector3(4.5, 2.1, 0.5), new Vector3(0.45, 0.55, 0.45)];
  for (let i = 0; i < pp.length; i++) {
    const l = new PointLight("lamp" + i, pp[i], scene);
    l.diffuse = new Color3(1.0, 0.68, 0.38);
    l.specular = new Color3(1.0, 0.68, 0.38);
    l.intensity = i === 2 ? 1.5 : 3;
    l.range = 4;
    points.push(l);
  }
  if (o.clustered) new ClusteredLightContainer("interiorLights", points, scene);

  // emissive "TV" quad on the east wall: HDR emissive (>1) so bloom picks it up
  const tv = MeshBuilder.CreatePlane("tv", { width: 0.9, height: 0.5 }, scene);
  tv.position.set(4.98, 1.3, 2.4);
  tv.rotation.y = Math.PI / 2;
  const tvMat = new PBRMaterial("tvMat", scene);
  tvMat.albedoColor = Color3.Black();
  tvMat.emissiveColor = new Color3(0.35, 0.65, 1.0);
  tvMat.emissiveIntensity = 4;
  tvMat.metallic = 0;
  tvMat.roughness = 0.3;
  tv.material = tvMat;
  // a bulb
  const bulb = MeshBuilder.CreateSphere("bulb", { diameter: 0.16, segments: 8 }, scene);
  bulb.position.copyFrom(pp[0]);
  const bulbMat = new StandardMaterial("bulbMat", scene);
  bulbMat.disableLighting = true;
  bulbMat.emissiveColor = new Color3(6, 4.4, 2.8); // HDR > 1 -> blooms
  bulb.material = bulbMat;

  if (o.sky) createSkyDome(scene, sun);

  const ip = scene.imageProcessingConfiguration;
  let ssao: SSAO2RenderingPipeline | undefined;
  let drp: DefaultRenderingPipeline | undefined;
  // ORDER MATTERS: SSAO2 first (operates on HDR scene colour), then DefaultRenderingPipeline, then custom PPs.
  if (o.ssao) {
    ssao = new SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.5, blurRatio: 1 }, [camera], false, Constants.TEXTURETYPE_HALF_FLOAT);
    ssao.radius = 0.6;
    ssao.totalStrength = 1.2;
    ssao.base = 0.1;
    ssao.samples = 16;
    ssao.maxZ = 60;
    ssao.minZAspect = 0.5;
    ssao.expensiveBlur = true;
  }
  if (o.pipeline) {
    drp = new DefaultRenderingPipeline("drp", true, scene, [camera]);
    drp.fxaaEnabled = true;
    drp.bloomEnabled = true;
    drp.bloomThreshold = 1.0;   // HDR: only > 1.0 luminance blooms (emissive > 1, sun disc)
    drp.bloomWeight = 0.35;
    drp.bloomKernel = 64;
    drp.bloomScale = 0.5;
    drp.grainEnabled = true;
    drp.grain.intensity = 6;
    drp.grain.animated = true;
    drp.imageProcessingEnabled = true;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.1;
    ip.contrast = 1.15;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.2;
    ip.vignetteColor = new Color4(0, 0, 0, 0);
    ip.vignetteStretch = 0.2;
  }
  let ps2: PostProcess | undefined;
  if (o.ps2) {
    ps2 = createPs2PostProcess(camera, engine);
    const keep = ps2;
    drp?.onBuildObservable.add(() => keepLast(camera, keep));
  }
  return { scene, camera, room, sun, sg, drp, ssao, ps2, si, points };
}

export function chainNames(camera: Camera): string[] {
  return camera._postProcesses.map((p) => (p ? p.name : "null"));
}

// ---------------------------------------------------------------- fake light shaft (PS2 trick)
/**
 * Additive, unlit, depth-tested (no depth write) prism extruded from a window rectangle along the sun direction.
 * Vertex alpha fades from `nearAlpha` at the window to 0 at `length` metres. Walls hide the parts that pass through them.
 */
export function createLightShaft(scene: Scene, corners: Vector3[], sunDir: Vector3, length = 6, color = new Color3(1, 0.75, 0.45), nearAlpha = 0.18): Mesh {
  const d = sunDir.normalize();
  const far = corners.map((c) => c.add(d.scale(length)));
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const pushV = (p: Vector3, a: number) => { positions.push(p.x, p.y, p.z); colors.push(color.r, color.g, color.b, a); };
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const base = positions.length / 3;
    pushV(corners[i], nearAlpha); pushV(corners[j], nearAlpha); pushV(far[j], 0); pushV(far[i], 0);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const mesh = new Mesh("lightShaft", scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.colors = colors;
  vd.indices = indices;
  vd.applyToMesh(mesh);
  mesh.hasVertexAlpha = true;
  const mat = new StandardMaterial("lightShaftMat", scene);
  mat.disableLighting = true;
  mat.emissiveColor = Color3.White(); // vertex colour multiplies emissive
  mat.diffuseColor = Color3.Black();
  mat.backFaceCulling = false;
  mat.disableDepthWrite = true;
  mat.alphaMode = Constants.ALPHA_ADD;
  mat.alpha = 0.999; // < 1 => goes to the transparent queue
  mat.fogEnabled = false;
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  return mesh;
}
