// Lighting rig: hemispheric fill + one shadow-casting key light that blends between the
// outdoor sun (driven by time of day) and indoor fluorescent light (driven by whether the
// camera is inside). Also owns fog, sky dome, glow layer and post-processing.
import { BABYLON } from './babylon.js';
import { clamp01, lerp, smoothstep } from '../core/mathutil.js';

const V3 = BABYLON.Vector3, C3 = BABYLON.Color3;
const mix3 = (a, b, t, out) => { out.r = lerp(a.r, b.r, t); out.g = lerp(a.g, b.g, t); out.b = lerp(a.b, b.b, t); return out; };

export class Lighting {
  constructor(scene, camera, quality = 'high') {
    this.scene = scene;
    this.quality = quality;
    this.hemi = new BABYLON.HemisphericLight('hemi', new V3(0.15, 1, -0.1), scene);
    this.key = new BABYLON.DirectionalLight('key', new V3(-0.3, -1, 0.4).normalize(), scene);
    this.key.autoUpdateExtends = false;
    this.key.autoCalcShadowZBounds = false;
    this.key.shadowMinZ = 1; this.key.shadowMaxZ = 140;
    this.indoor = 0;
    this.casters = [];
    this.shadows = null;
    if (quality !== 'low') this._makeShadows(quality === 'high' ? 2048 : 1024);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.004;
    this._makeSky();
    this.glow = new BABYLON.GlowLayer('glow', scene, { mainTextureFixedSize: 512, blurKernelSize: 24 });
    this.glow.intensity = 0.55;
    this.glowMeshes = new Set();
    this.glow.customEmissiveColorSelector = (mesh, subMesh, material, result) => {
      if (this.glowMeshes.has(mesh) || (mesh.metadata && /glow|screen/.test(mesh.metadata.mat || ''))) result.set(material.emissiveColor.r, material.emissiveColor.g, material.emissiveColor.b, 1);
      else result.set(0, 0, 0, 0);
    };
    if (quality !== 'low' && camera) this._makePipeline(camera);
    this.tod = { sunDir: new V3(0, -1, 0), windowColor: new C3(0.7, 0.8, 0.9), daylight: 1, lightsOut: false };
    this._c = { a: new C3(), b: new C3(), c: new C3() };
  }

  _makeShadows(size) {
    const sg = new BABYLON.ShadowGenerator(size, this.key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_MEDIUM;
    sg.bias = 0.0012;
    sg.normalBias = 0.025;
    sg.darkness = 0.35;
    sg.transparencyShadow = false;
    this.shadows = sg;
  }
  addShadowCaster(mesh) { if (this.shadows) this.shadows.addShadowCaster(mesh, false); mesh.receiveShadows = true; }
  removeShadowCaster(mesh) { if (this.shadows) this.shadows.removeShadowCaster(mesh, false); }
  addShadowReceiver(mesh) { mesh.receiveShadows = true; }

  _makeSky() {
    const sky = BABYLON.MeshBuilder.CreateSphere('sky', { diameter: 700, segments: 12, sideOrientation: BABYLON.Mesh.BACKSIDE, updatable: true }, this.scene);
    const mat = new BABYLON.StandardMaterial('m_sky', this.scene);
    mat.disableLighting = true; mat.emissiveColor = C3.White(); mat.diffuseColor = C3.Black(); mat.fogEnabled = false; mat.backFaceCulling = false;
    sky.material = mat;
    sky.isPickable = false;
    sky.infiniteDistance = true;
    sky.applyFog = false;
    const pos = sky.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    this.skyY = [];
    for (let i = 0; i < pos.length; i += 3) this.skyY.push(pos[i + 1] / 350);
    this.skyColors = new Float32Array((pos.length / 3) * 4);
    sky.setVerticesData(BABYLON.VertexBuffer.ColorKind, this.skyColors, true, 4);
    this.sky = sky;
    const sun = BABYLON.MeshBuilder.CreateSphere('sun', { diameter: 22, segments: 8 }, this.scene);
    const sm = new BABYLON.StandardMaterial('m_sun', this.scene);
    sm.disableLighting = true; sm.emissiveColor = new C3(1, 0.95, 0.8); sm.fogEnabled = false;
    sun.material = sm; sun.infiniteDistance = true; sun.isPickable = false;
    this.sun = sun; this.sunMat = sm;
  }
  _paintSky(zenith, horizon, ground) {
    const c = this.skyColors;
    for (let i = 0; i < this.skyY.length; i++) {
      const y = this.skyY[i];
      let r, g, b;
      if (y >= 0) { const t = Math.pow(clamp01(y), 0.6); r = lerp(horizon.r, zenith.r, t); g = lerp(horizon.g, zenith.g, t); b = lerp(horizon.b, zenith.b, t); }
      else { r = ground.r; g = ground.g; b = ground.b; }
      c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b; c[i * 4 + 3] = 1;
    }
    this.sky.updateVerticesData(BABYLON.VertexBuffer.ColorKind, c);
  }

  _makePipeline(camera) {
    const p = new BABYLON.DefaultRenderingPipeline('pipe', true, this.scene, [camera]);
    p.fxaaEnabled = true;
    p.bloomEnabled = true; p.bloomThreshold = 0.82; p.bloomWeight = 0.22; p.bloomKernel = 48; p.bloomScale = 0.5;
    p.imageProcessingEnabled = true;
    p.imageProcessing.toneMappingEnabled = true;
    p.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    p.imageProcessing.exposure = 1.08;
    p.imageProcessing.contrast = 1.12;
    p.imageProcessing.vignetteEnabled = true;
    p.imageProcessing.vignetteWeight = 1.6;
    p.imageProcessing.vignetteColor = new BABYLON.Color4(0.05, 0.04, 0.03, 1);
    p.grainEnabled = true; p.grain.intensity = 5; p.grain.animated = true;
    p.samples = 1;
    this.pipeline = p;
  }

  /**
   * minutes: time of day in minutes (0..1440). indoorTarget: 1 when the camera is inside.
   * focus: Vector3 the shadow frustum follows. lightsOut: night-time dim indoor lighting.
   */
  update(dt, minutes, indoorTarget, focus, lightsOut) {
    this.indoor += (indoorTarget - this.indoor) * (1 - Math.exp(-4 * dt));
    const k = this.indoor;
    const hour = minutes / 60;
    // Sun path: rises ~05:30, sets ~20:30.
    const dayT = (hour - 5.5) / 15;
    const elev = Math.sin(clamp01(dayT) * Math.PI) * 1.15;
    const daylight = smoothstep(-0.05, 0.25, dayT < 0 || dayT > 1 ? -0.2 : elev);
    const az = lerp(-1.9, 1.9, clamp01(dayT));
    // Sun sits in the south (light travels toward -z, onto the yard-facing facade).
    const sunDir = new V3(Math.sin(az) * Math.cos(elev), -Math.max(0.15, Math.sin(elev)), -(Math.cos(az) * Math.cos(elev) * 0.6 + 0.4)).normalize();
    const moonDir = new V3(0.3, -0.8, -0.5).normalize();
    const { a, b, c } = this._c;
    // Outdoor key colour & intensity
    const warm = new C3(1.0, 0.68, 0.42), noon = new C3(1.0, 0.96, 0.88), moon = new C3(0.5, 0.6, 0.85);
    const sunCol = mix3(warm, noon, smoothstep(0.1, 0.7, elev), a);
    const outI = lerp(0.28, 1.65, daylight);
    const outCol = mix3(moon, sunCol, daylight, new C3());
    const outDir = V3.Lerp(moonDir, sunDir, daylight).normalize();
    // Indoor fluorescent
    const inCol = lightsOut ? new C3(0.6, 0.68, 0.92) : new C3(1.0, 0.98, 0.93);
    const inI = lightsOut ? 0.62 : 1.0;
    const inDir = new V3(0.32, -1, 0.22).normalize();
    this.key.direction = V3.Lerp(outDir, inDir, k).normalize();
    this.key.diffuse = mix3(outCol, inCol, k, b);
    this.key.specular = this.key.diffuse.scale(0.4);
    this.key.intensity = lerp(outI, inI, k);
    // Hemispheric fill
    const skyDay = new C3(0.6, 0.68, 0.8), skyNight = new C3(0.13, 0.16, 0.26);
    const hemiOut = mix3(skyNight, skyDay, daylight, new C3());
    const hemiIn = lightsOut ? new C3(0.32, 0.37, 0.5) : new C3(0.82, 0.81, 0.77);
    this.hemi.diffuse = mix3(hemiOut, hemiIn, k, c);
    this.hemi.groundColor = mix3(new C3(0.22, 0.2, 0.17).scale(lerp(0.3, 1, daylight)), lightsOut ? new C3(0.14, 0.14, 0.18) : new C3(0.6, 0.58, 0.54), k, new C3());
    this.hemi.intensity = lerp(lerp(0.42, 0.62, daylight), lightsOut ? 0.55 : 0.58, k);
    // Sky & fog
    const zenith = mix3(new C3(0.02, 0.03, 0.08), new C3(0.28, 0.47, 0.75), daylight, new C3());
    const dusk = 1 - Math.abs(smoothstep(0.0, 0.5, elev) * 2 - 1) * 0.0;
    const horizonDay = mix3(new C3(0.95, 0.62, 0.42), new C3(0.72, 0.8, 0.88), smoothstep(0.05, 0.45, elev), new C3());
    const horizon = mix3(new C3(0.06, 0.07, 0.12), horizonDay, daylight, new C3());
    void dusk;
    if (!this._lastSky || Math.abs(this._lastSky - minutes) > 3) { this._paintSky(zenith, horizon, horizon.scale(0.6)); this._lastSky = minutes; }
    const fogOut = horizon, fogIn = lightsOut ? new C3(0.07, 0.08, 0.12) : new C3(0.32, 0.31, 0.28);
    this.scene.fogColor = mix3(fogOut, fogIn, k, new C3());
    this.scene.fogDensity = lerp(0.0045, 0.011, k);
    this.scene.clearColor = new BABYLON.Color4(this.scene.fogColor.r, this.scene.fogColor.g, this.scene.fogColor.b, 1);
    this.sun.position = sunDir.scale(-300);
    this.sun.isVisible = daylight > 0.05;
    this.sunMat.emissiveColor = mix3(warm, new C3(1, 0.97, 0.85), smoothstep(0, 0.5, elev), new C3());
    // Shadow frustum follows the focus, snapped to reduce shimmer.
    if (focus) {
      const snap = 0.5;
      const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
      const ext = 24;
      this.key.position = new V3(fx, 0, fz).subtract(this.key.direction.scale(70));
      this.key.orthoLeft = -ext; this.key.orthoRight = ext; this.key.orthoTop = ext; this.key.orthoBottom = -ext;
    }
    this.tod.daylight = daylight;
    this.tod.lightsOut = lightsOut;
    this.tod.windowColor = mix3(new C3(0.05, 0.07, 0.14), mix3(new C3(0.95, 0.7, 0.5), new C3(0.75, 0.86, 0.97), smoothstep(0.05, 0.4, elev), new C3()), daylight, new C3());
    return this.tod;
  }
}
