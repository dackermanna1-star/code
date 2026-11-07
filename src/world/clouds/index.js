import * as THREE from 'three';
import { createNoiseTextures, createWeatherMap, NOISE_PERIOD, BASE_TILE, CIRRUS_TILE } from './noise.js';
import { LAYERS, PRESETS, densityAtCPU, coverageAround } from './weather.js';
import { MARCH_FRAG, RESOLVE_FRAG, COMPOSITE_FRAG, PROBE_FRAG, SHADOW_FRAG, SHADOW_SAMPLE_GLSL } from './shaders.js';

// =============================================================================
// CLOUDS & WEATHER
//
// An outside post pass (order 10) that raymarches volumetric clouds at reduced
// resolution (app.quality.cloudScale / cloudSteps):
//
//   1. MARCH (low res, MRT): jittered (IGN) ray march through spherical shells
//      (fair-weather cumulus ~1.4-3.5 km with towers en route, stratocumulus deck
//      4.6-6.5 km, 2D cirrus at 11.8 km), Beer-Lambert + dual-lobe HG phase +
//      multiple-scattering octaves + powder, light march towards the sun,
//      sky/ground ambient, sun colour from the atmosphere at the cloud's altitude
//      (Earth shadow at dusk), aerial perspective from the environment's LUTs.
//      Stops at the scene depth, so near geometry is fogged when the camera is
//      inside a cloud and occludes the clouds otherwise.
//   2. RESOLVE (low res): temporal accumulation, history reprojected in world
//      space (camera-relative, floating-origin safe) + neighbourhood clamp.
//   3. COMPOSITE (full res): depth-aware (bilateral) upsample, scene*T + L.
//
// Plus a tiny probe pass read back asynchronously (cloud density around the
// aircraft, sun / sky transmittance) and a ground cloud-shadow map for other
// shaders (app.clouds.shadow).
//
// API: densityAt(worldPos), aircraftDensity, inCloud, coverage, lightAttenuation,
//      setWeather(name), weather, shadow {texture, uniforms, glsl}, enabled.
// Writes app.flight.state.inCloud (priority 30); emits 'env:cloud' {inside, density}.
// =============================================================================

const SIGMA = 0.045;                     // extinction (1/m) per unit density
const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const PROBE_W = 8;
const SHADOW_SIZE = 256, SHADOW_EXTENT = 30000;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const pmod = (a, n) => ((a % n) + n) % n;
const WEATHER_NAMES = ['auto', 'clear', 'scattered', 'overcast'];

class Clouds {
  constructor(app) {
    this.app = app;
    this.ok = false;
    this.enabled = true;
    this.weatherName = 'auto';
    this.preset = [...PRESETS.auto];
    this.auto = 1;
    this.aircraftDensity = 0;
    this.inCloud = 0;
    this.lightAttenuation = 1;
    this.skyAttenuation = 1;
    this.coverage = 0.3;
    this.coverageCu = 0.3;
    this.coverageDeck = 0;
    this._inside = false;
    this.windOffset = new THREE.Vector2(0, 0);
    this.cirrusOffset = new THREE.Vector2(0, 0);
    this.camWorld = new THREE.Vector3();
    this.prevCamWorld = new THREE.Vector3();
    this.prevRot = new THREE.Quaternion();
    this.prevProj = new THREE.Matrix4();
    this.histValid = false;
    this.histIdx = 0;
    this.arrA = new THREE.Vector2(app.world.arrivalOrigin.x, app.world.arrivalOrigin.z);
    this.arrB = this.arrA.clone();
    this.arrMix = 1;
    this.keyColor = new THREE.Color(1, 1, 1);
    this.keyIntensity = 6;
    this.probe = { pending: false, data: new Uint8Array(PROBE_W * 4), valid: false, density: 0, max: 0, sunT: 1, skyT: 1, camDensity: 0, frame: 0 };
    this.ctx = {
      wm: null, camX: 0, camZ: 0, windX: 0, windZ: 0, depRel: [0, 0], arrRelA: [0, 0], arrRelB: [0, 0], arrMix: 1,
      preset: this.preset, auto: 1, cuTop: LAYERS.cuTop,
    };
    this._covT = -1e9;
    this._shadowFrame = -1e9;
    this._tmpV = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._m4 = new THREE.Matrix4();
    this._m4b = new THREE.Matrix4();
    this._axX = new THREE.Vector3();
    this._axZ = new THREE.Vector3();

    // --- weather map (CPU, so densityAt agrees with the GPU) ------------------------------
    this.wm = createWeatherMap();
    this.ctx.wm = this.wm;

    // --- GPU noise ---------------------------------------------------------------------------
    try {
      this.noise = createNoiseTextures(app);
      this.ok = true;
    } catch (e) {
      console.warn('[clouds] noise generation failed; volumetric clouds disabled', e);
      this.noise = null;
    }
    if (String(app.debug?.module || '').includes('clouds-stats')) {
      console.log(`[clouds] weather map ${this.wm.ms.toFixed(0)} ms, noise ${this.noise?.ms.toFixed(0)} ms (base ${this.noise?.baseSize}³)`);
    }

    // --- initial weather -----------------------------------------------------------------------
    this._applyWeatherName(this._resolveWeather(), true);

    if (this.ok) {
      try {
        this._makeMaterials();
        this._allocTargets();
        this.pass = app.pipeline.addOutsidePass({ name: 'clouds', order: 10, render: (c) => this.render(c) });
      } catch (e) {
        console.warn('[clouds] pass setup failed; volumetric clouds disabled', e);
        this.ok = false;
      }
    }

    app.addUpdate((dt) => this.update(dt), 30, 'clouds');
    app.events.on('world:arrivalMoved', ({ origin } = {}) => this._onArrivalMoved(origin || app.world.arrivalOrigin));
    app.events.on('settings:changed', ({ key } = {}) => { if (key === 'weather') this._applyWeatherName(this._resolveWeather()); });
    app.events.on('pipeline:resize', () => this._allocTargets());
    app.events.on('quality:changed', () => this._allocTargets());
    app.events.on('flight:skip', () => { this.histValid = false; });
    app.events.on('flight:restart', () => { this.histValid = false; });

    this.api = this._makeApi();
  }

  // ------------------------------------------------------------------------- weather
  _resolveWeather() {
    const d = this.app.debug?.weather;
    if (d && WEATHER_NAMES.includes(d)) return d;
    const s = this.app.settings?.get?.('weather');
    return WEATHER_NAMES.includes(s) ? s : 'auto';
  }

  _applyWeatherName(name, instant = false) {
    if (!WEATHER_NAMES.includes(name)) name = 'auto';
    this.weatherName = name;
    this._targetPreset = PRESETS[name] || PRESETS.auto;
    this._targetAuto = name === 'auto' ? 1 : 0;
    if (instant) {
      for (let k = 0; k < 4; k++) this.preset[k] = this._targetPreset[k];
      this.auto = this._targetAuto;
    }
  }

  _onArrivalMoved(origin) {
    // cross-fade the regional weather from the old to the new arrival anchor (no popping)
    const st = this.app.flight?.state;
    const cur = this._arrCurrent();
    this.arrA.set(cur.x, cur.y);
    this.arrB.set(origin.x, origin.z);
    const px = st?.position?.x ?? 0, pz = st?.position?.z ?? 0;
    const near = Math.min(Math.hypot(this.arrA.x - px, this.arrA.y - pz), Math.hypot(this.arrB.x - px, this.arrB.y - pz));
    this.arrMix = near > 260000 || !this.app.started ? 1 : 0;
  }
  _arrCurrent() {
    return this._tmpArr = (this._tmpArr || new THREE.Vector2()).copy(this.arrA).lerp(this.arrB, this.arrMix);
  }

  // ------------------------------------------------------------------------- materials / targets
  _makeMaterials() {
    const app = this.app, P = app.pipeline;
    const env = app.environment;
    const hasAtm = !!(env && env.uniforms && env.glsl && env.glsl.atmosphere);
    this.hasAtm = hasAtm;
    const shared = {
      tWeather: { value: this.wm.texture },
      tBase: { value: this.noise.base.texture },
      tDetail: { value: this.noise.detail.texture },
      uBaseTexel: { value: BASE_TILE / this.noise.baseSize },
      uNoiseOff: { value: new THREE.Vector3() },
      uCamAlt: { value: 0 },
      uDepRel: { value: new THREE.Vector2() },
      uArrRelA: { value: new THREE.Vector2() },
      uArrRelB: { value: new THREE.Vector2() },
      uArrMix: { value: 1 },
      uPreset: { value: new THREE.Vector4() },
      uAuto: { value: 1 },
      uCuTop: { value: LAYERS.cuTop },
      uSigma: { value: SIGMA },
      uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
    };
    this.shared = shared;
    const marchU = {
      ...(hasAtm ? env.uniforms : {}),
      ...shared,
      tDepth: { value: null },
      tCirrus: { value: this.noise.cirrus.texture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uInvProj: { value: new THREE.Matrix4() },
      uCamToWorld: { value: new THREE.Matrix3() },
      uNear: { value: 0.25 }, uFar: { value: 450000 },
      uSteps: { value: 32 },
      uLightSteps: { value: 4 },
      uFrame: { value: 0 },
      uKeyColor: { value: new THREE.Vector3(1, 1, 1) },
      uKeyIsSun: { value: 1 },
      uAmbTop: { value: new THREE.Vector3(0.5, 0.6, 0.8) },
      uAmbBottom: { value: new THREE.Vector3(0.2, 0.2, 0.2) },
      uMaxDist: { value: 150000 },
      uNearOK: { value: 1 },
      uPixAngle: { value: 0.003 },
      uDetail: { value: 1 },
      uCirrusOff: { value: new THREE.Vector2() },
      uFogColor: { value: new THREE.Vector3(0.6, 0.7, 0.8) },
      uFogDensity: { value: 0.00005 },
      uMsScale: { value: 1.3 },
    };
    this.marchMat = new THREE.ShaderMaterial({
      name: 'clouds.march', glslVersion: THREE.GLSL3, vertexShader: FS_VERT,
      fragmentShader: MARCH_FRAG({ atmosphere: hasAtm ? env.glsl.atmosphere : '', depthGLSL: P.depthGLSL, maxSteps: 320 }),
      uniforms: marchU, depthTest: false, depthWrite: false,
    });
    this.resolveMat = new THREE.ShaderMaterial({
      name: 'clouds.resolve', vertexShader: FS_VERT, fragmentShader: RESOLVE_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tCur: { value: null }, tCurDist: { value: null }, tHist: { value: null },
        uInvProj: marchU.uInvProj, uCamToWorld: marchU.uCamToWorld,
        uPrevVP: { value: new THREE.Matrix4() }, uDrift: { value: new THREE.Vector3() },
        uTexel: { value: new THREE.Vector2() }, uHistValid: { value: 0 }, uBlend: { value: 0.12 },
      },
    });
    this.compositeMat = new THREE.ShaderMaterial({
      name: 'clouds.composite', vertexShader: FS_VERT, fragmentShader: COMPOSITE_FRAG(P.depthGLSL), depthTest: false, depthWrite: false,
      uniforms: {
        tScene: { value: null }, tDepth: { value: null }, tCloud: { value: null }, tCloudDist: { value: null },
        uLowRes: { value: new THREE.Vector2(1, 1) }, uInvProj: marchU.uInvProj,
        uNear: marchU.uNear, uFar: marchU.uFar, uNearOK: marchU.uNearOK,
      },
    });
    this.probeMat = new THREE.ShaderMaterial({
      name: 'clouds.probe', vertexShader: FS_VERT, fragmentShader: PROBE_FRAG, depthTest: false, depthWrite: false,
      uniforms: { ...shared, uProbe: { value: new THREE.Vector3() }, uCamProbe: { value: new THREE.Vector3() }, uAxisX: { value: new THREE.Vector3(1, 0, 0) }, uAxisZ: { value: new THREE.Vector3(0, 0, 1) } },
    });
    this.shadowMat = new THREE.ShaderMaterial({
      name: 'clouds.shadow', vertexShader: FS_VERT, fragmentShader: SHADOW_FRAG, depthTest: false, depthWrite: false,
      uniforms: { ...shared, uCenter: { value: new THREE.Vector3() }, uSize: { value: SHADOW_EXTENT } },
    });
    this.probeRT = new THREE.WebGLRenderTarget(PROBE_W, 1, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.shadowRT = new THREE.WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.shadowRT.texture.colorSpace = THREE.NoColorSpace;
    this.shadowUniforms = {
      tCloudShadow: { value: this.shadowRT.texture },
      uCloudShadowCenter: { value: new THREE.Vector2() },
      uCloudShadowSize: { value: SHADOW_EXTENT },
      uCloudShadowAmount: { value: 1 },
    };
  }

  _allocTargets() {
    if (!this.ok || !this.marchMat) return;
    const app = this.app, P = app.pipeline;
    const scale = clamp(app.quality?.cloudScale || 0.5, 0.2, 1);
    const w = Math.max(16, Math.round(P.width * scale)), h = Math.max(16, Math.round(P.height * scale));
    if (this.rtMarch && this.rtMarch.width === w && this.rtMarch.height === h) return;
    this.rtMarch?.dispose(); this.rtHist?.forEach((r) => r.dispose());
    const opt = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.LinearSRGBColorSpace };
    this.rtMarch = new THREE.WebGLRenderTarget(w, h, { ...opt, count: 2, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.rtHist = [new THREE.WebGLRenderTarget(w, h, opt), new THREE.WebGLRenderTarget(w, h, opt)];
    this.histValid = false;
    this.lowW = w; this.lowH = h;
  }

  // ------------------------------------------------------------------------- per frame (priority 30)
  update(dt) {
    const app = this.app;
    const st = app.flight?.state;
    if (!st) return;
    const simDt = app.paused ? 0 : dt * (app.timeScale || 1);

    // weather transitions (a few seconds)
    const kW = 1 - Math.exp(-dt / 2.5);
    for (let k = 0; k < 4; k++) this.preset[k] += (this._targetPreset[k] - this.preset[k]) * kW;
    this.auto += (this._targetAuto - this.auto) * kW;
    if (this.arrMix < 1) this.arrMix = Math.min(1, this.arrMix + simDt / 90);

    // wind drift (clouds move with the wind aloft; cirrus faster)
    const wdir = (Number.isFinite(st.windDir) ? st.windDir : 250) + 180;
    const wsp = Math.max(5, (Number.isFinite(st.windSpeed) ? st.windSpeed : 6) * 1.4);
    const wx = Math.sin(wdir * Math.PI / 180) * wsp, wz = -Math.cos(wdir * Math.PI / 180) * wsp;
    this.windVel = this.windVel || new THREE.Vector3();
    this.windVel.set(wx, 0, wz);
    this.windOffset.x = pmod(this.windOffset.x + wx * simDt, NOISE_PERIOD);
    this.windOffset.y = pmod(this.windOffset.y + wz * simDt, NOISE_PERIOD);
    this.cirrusOffset.x = pmod(this.cirrusOffset.x - wx * 2.5 * simDt, CIRRUS_TILE);
    this.cirrusOffset.y = pmod(this.cirrusOffset.y - wz * 2.5 * simDt, CIRRUS_TILE);
    this.evolve = ((this.evolve || 0) + simDt * 0.8) % DETAIL_PERIOD_EVOLVE;

    // CPU context (densityAt / coverage)
    const c = this.ctx;
    const pos = st.position;
    this._updateCtx(pos.x, pos.z);

    // density at the aircraft: GPU probe when available, CPU approximation otherwise
    const pr = this.probe;
    let dens, sunT, skyT;
    if (pr.valid && app.frame - pr.frame < 120) { dens = pr.density; sunT = pr.sunT; skyT = pr.skyT; }
    else {
      dens = densityAtCPU(pos.x, pos.y, pos.z, c) * 0.6;
      sunT = 1 - 0.85 * clamp(densityAtCPU(pos.x + app.sun.direction.x * 600, pos.y + app.sun.direction.y * 600, pos.z + app.sun.direction.z * 600, c) * 3, 0, 1);
      skyT = 1;
    }
    const kd = 1 - Math.exp(-dt / 0.35);
    this.aircraftDensity += (dens - this.aircraftDensity) * kd;
    // how milky the view is: optical depth over ~40 m (wing tip / engine distance)
    const fog = 1 - Math.exp(-this.aircraftDensity * SIGMA * 40);
    const target = clamp(fog * 1.6, 0, 1);
    this.inCloud += (target - this.inCloud) * (1 - Math.exp(-dt / 0.4));
    if (this.inCloud < 1e-4) this.inCloud = 0;
    st.inCloud = this.inCloud;
    const inside = this._inside ? this.inCloud > 0.42 : this.inCloud > 0.5;
    if (inside !== this._inside) {
      this._inside = inside;
      app.events.emit('env:cloud', { inside, density: this.aircraftDensity });
    }
    const ks = 1 - Math.exp(-dt / 0.8);
    this.lightAttenuation += (clamp(sunT, 0, 1) - this.lightAttenuation) * ks;
    this.skyAttenuation += (clamp(skyT, 0, 1) - this.skyAttenuation) * ks;

    // coverage (for the environment's env map: deck below etc.)
    if (app.time - this._covT > 0.5) {
      this._covT = app.time;
      const cv = coverageAround(pos.x, pos.z, 25000, c, this._covOut || (this._covOut = [0, 0]));
      this.coverageCu = cv[0]; this.coverageDeck = cv[1];
      this.coverage = clamp(Math.max(cv[0], cv[1]), 0, 1);
    }

    // key light: remember the undimmed values for the shader, then dim the sun for everyone else
    const s = app.sun;
    // (if nobody re-set app.sun since our last write, start from the undimmed values we kept)
    const fresh = s.intensity !== this._wroteI || s.ambientIntensity !== this._wroteA;
    if (fresh) { this._baseI = s.intensity; this._baseA = s.ambientIntensity; }
    const baseI = this._baseI, baseA = this._baseA;
    this.keyColor.copy(s.color);
    this.keyIntensity = baseI;
    this.ambColor = this.ambColor || new THREE.Color();
    this.ambColor.copy(s.skyColor).multiplyScalar(baseA);
    this.groundAmb = this.groundAmb || new THREE.Color();
    this.groundAmb.copy(s.groundColor).multiplyScalar(baseA);
    if (this.api?.dimSun !== false) {
      s.intensity = baseI * this.lightAttenuation;
      // inside a cloud the light becomes diffuse: a little more fill, much less sun
      s.ambientIntensity = baseA * (1 + 0.35 * this.inCloud * (1 - this.lightAttenuation));
    } else { s.intensity = baseI; s.ambientIntensity = baseA; }
    this._wroteI = s.intensity; this._wroteA = s.ambientIntensity;
  }

  _updateCtx(px, pz) {
    const c = this.ctx, app = this.app;
    c.camX = px; c.camZ = pz;
    c.windX = this.windOffset.x; c.windZ = this.windOffset.y;
    const dep = app.world.departureOrigin;
    c.depRel[0] = dep.x - px; c.depRel[1] = dep.z - pz;
    c.arrRelA[0] = this.arrA.x - px; c.arrRelA[1] = this.arrA.y - pz;
    c.arrRelB[0] = this.arrB.x - px; c.arrRelB[1] = this.arrB.y - pz;
    c.arrMix = this.arrMix;
    c.auto = this.auto;
    c.cuTop = this._cuTop(px, pz);
  }

  _cuTop(px, pz) {
    // towers only exist en route (auto weather): use the tall cumulus shell there only
    if (this.auto < 0.5) return LAYERS.cuTop;
    const dep = this.app.world.departureOrigin, a = this._arrCurrent();
    const dDep = Math.hypot(px - dep.x, pz - dep.z), dArr = Math.hypot(px - a.x, pz - a.y);
    return dDep > 45000 && dArr > 70000 ? LAYERS.towerTop : LAYERS.cuTop;
  }

  // ------------------------------------------------------------------------- render (outside pass)
  render({ renderer, input, output, depthTexture, camera }) {
    if (!this.ok || !this.enabled) return false;
    const app = this.app, P = app.pipeline;
    if (!this.rtMarch) this._allocTargets();
    const st = app.flight.state;
    const q = app.quality || {};

    // --- camera in the world (float64 on the CPU)
    camera.updateMatrixWorld();
    const camW = app.world.toWorld(camera.position, this.camWorld);
    const rot = this._q.copy(st.quaternion).multiply(camera.quaternion);
    const U = this.marchMat.uniforms, S = this.shared;
    U.uCamToWorld.value.setFromMatrix4(this._m4.makeRotationFromQuaternion(rot));
    U.uInvProj.value.copy(camera.projectionMatrixInverse);
    U.uNear.value = camera.near; U.uFar.value = camera.far;

    // floating-origin safe noise offsets
    S.uNoiseOff.value.set(pmod(camW.x - this.windOffset.x, NOISE_PERIOD), this.evolve || 0, pmod(camW.z - this.windOffset.y, NOISE_PERIOD));
    S.uCamAlt.value = camW.y;
    const dep = app.world.departureOrigin;
    S.uDepRel.value.set(dep.x - camW.x, dep.z - camW.z);
    S.uArrRelA.value.set(this.arrA.x - camW.x, this.arrA.y - camW.z);
    S.uArrRelB.value.set(this.arrB.x - camW.x, this.arrB.y - camW.z);
    S.uArrMix.value = this.arrMix;
    S.uPreset.value.fromArray(this.preset);
    S.uAuto.value = this.auto;
    S.uCuTop.value = this._cuTop(camW.x, camW.z);
    U.uCirrusOff.value.copy(this.cirrusOffset);

    // --- lighting
    const env = app.environment;
    const sunKey = !!(this.hasAtm && env && !(env.sunElevationDeg < -4.5));
    S.uKeyDir.value.copy(app.sun.direction).normalize();
    U.uKeyIsSun.value = sunKey ? 1 : 0;
    U.uKeyColor.value.set(this.keyColor.r, this.keyColor.g, this.keyColor.b).multiplyScalar(this.keyIntensity);
    const amb = this.ambColor || app.sun.skyColor, gamb = this.groundAmb || app.sun.groundColor;
    U.uAmbTop.value.set(amb.r, amb.g, amb.b).multiplyScalar(0.38);
    // ground bounce, desaturated (light reaching cloud bases from below is a mix of ground and haze)
    const gl = (gamb.r + gamb.g + gamb.b) / 3;
    U.uAmbBottom.value.set(gamb.r * 0.4 + gl * 0.6, gamb.g * 0.4 + gl * 0.6, gamb.b * 0.4 + gl * 0.6).multiplyScalar(0.45).addScaledVector(U.uAmbTop.value, 0.4);
    const fog = app.scenes.outside.fog;
    if (fog) { U.uFogColor.value.set(fog.color.r, fog.color.g, fog.color.b); U.uFogDensity.value = fog.density || 0.00005; }

    // --- quality
    const detail = q.detail ?? 1;
    U.uSteps.value = Math.round(clamp(q.cloudSteps || 40, 8, 150));
    U.uLightSteps.value = [3, 4, 5, 6][clamp(detail, 0, 3)];   // 45 m doubling: 0.3 / 0.7 / 1.4 / 2.8 km
    U.uDetail.value = detail === 0 ? 0.7 : 1;
    const alt = camW.y;
    U.uMaxDist.value = (60000 + 200000 * smooth(1500, 10000, alt)) * (detail === 0 ? 0.75 : 1);
    U.uFrame.value = app.frame % 1024;
    const fovY = camera.fov * Math.PI / 180;
    U.uPixAngle.value = fovY / this.lowH;
    U.uRes.value.set(this.lowW, this.lowH);
    // pixels closer than 30 m may skip the march only when no cloud is near the camera
    const camShell = alt > LAYERS.cuBase - 400 && alt < Math.max(S.uCuTop.value, LAYERS.deckTop + 500);
    const nearFog = this.probe.valid ? Math.max(this.probe.max, this.probe.camDensity) : (camShell ? 1 : 0);
    U.uNearOK.value = !camShell || nearFog < 0.002 ? 1 : 0;
    U.tDepth.value = depthTexture;

    // --- 1. march
    P.fullscreen(this.marchMat, this.rtMarch);

    // --- 2. temporal resolve
    const R = this.resolveMat.uniforms;
    const prev = this.rtHist[this.histIdx], next = this.rtHist[1 - this.histIdx];
    // previous view-projection relative to the CURRENT camera position (world axes)
    const d = this._tmpV.copy(this.prevCamWorld).sub(camW);
    const jump = d.length() > 3000;
    this._m4.makeRotationFromQuaternion(this.prevRot).setPosition(d);       // prev camera -> relative world
    this._m4b.copy(this._m4).invert();
    R.uPrevVP.value.multiplyMatrices(this.prevProj, this._m4b);
    R.uDrift.value.copy(this.windVel || this._tmpV2.set(0, 0, 0)).multiplyScalar(app.paused ? 0 : (app.dt || 0) * (app.timeScale || 1));
    R.tCur.value = this.rtMarch.textures[0];
    R.tCurDist.value = this.rtMarch.textures[1];
    R.tHist.value = prev.texture;
    R.uTexel.value.set(1 / this.lowW, 1 / this.lowH);
    R.uHistValid.value = this.histValid && !jump ? 1 : 0;
    R.uBlend.value = detail === 0 ? 0.2 : 0.12;
    P.fullscreen(this.resolveMat, next);
    this.histIdx = 1 - this.histIdx;
    this.histValid = true;
    this.prevCamWorld.copy(camW);
    this.prevRot.copy(rot);
    this.prevProj.copy(camera.projectionMatrix);

    // --- 3. upsample + composite
    const C = this.compositeMat.uniforms;
    C.tScene.value = input.texture;
    C.tDepth.value = depthTexture;
    C.tCloud.value = next.texture;
    C.tCloudDist.value = this.rtMarch.textures[1];
    C.uLowRes.value.set(this.lowW, this.lowH);
    P.fullscreen(this.compositeMat, output);

    // --- probe (async readback) and shadow map
    this._probe(renderer, camW);
    if (app.frame - this._shadowFrame >= 12) this._renderShadow(camW);
    return true;
  }

  _probe(renderer, camW) {
    const app = this.app, pr = this.probe;
    if (pr.pending || app.frame % 4 !== 0) return;
    const st = app.flight.state;
    const PU = this.probeMat.uniforms;
    PU.uProbe.value.copy(st.position).sub(camW);
    this._axX.set(1, 0, 0).applyQuaternion(st.quaternion);
    this._axZ.set(0, 0, 1).applyQuaternion(st.quaternion);
    PU.uAxisX.value.copy(this._axX); PU.uAxisZ.value.copy(this._axZ);
    PU.uCamProbe.value.set(0, 0, 0);
    this.app.pipeline.fullscreen(this.probeMat, this.probeRT);
    pr.pending = true;
    const frame = app.frame;
    let p;
    try { p = renderer.readRenderTargetPixelsAsync(this.probeRT, 0, 0, PROBE_W, 1, pr.data); } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).then(() => {
      const b = pr.data;
      pr.density = b[0] / 255 * 4; pr.max = b[1] / 255 * 4;
      pr.sunT = b[4] / 255; pr.skyT = b[8] / 255;
      pr.camDensity = b[16] / 255 * 4;
      pr.valid = true; pr.frame = frame;
    }).catch((e) => {
      if (!pr.warned) { pr.warned = true; console.warn('[clouds] probe readback unavailable, using CPU estimates', e); }
      pr.valid = false;
    }).finally(() => { pr.pending = false; });
  }

  _renderShadow(camW) {
    const app = this.app;
    this._shadowFrame = app.frame;
    const st = app.flight.state;
    const SU = this.shadowMat.uniforms;
    // snap the centre to whole texels so the map does not shimmer while flying
    const texel = SHADOW_EXTENT / SHADOW_SIZE;
    const cx = Math.round(st.position.x / texel) * texel, cz = Math.round(st.position.z / texel) * texel;
    let gh = 0;
    try { gh = app.world.groundHeight(cx, cz) || 0; } catch { gh = 0; }
    SU.uCenter.value.set(cx - camW.x, Math.max(gh, 0) - camW.y, cz - camW.z);
    app.pipeline.fullscreen(this.shadowMat, this.shadowRT);
    this.shadowUniforms.uCloudShadowCenter.value.set(cx, cz);
  }

  // ------------------------------------------------------------------------- API
  _makeApi() {
    const self = this;
    const ctx = this.ctx;
    return {
      /** Approximate cloud density (0..1) at a WORLD position (coverage map + layer profiles, no 3D noise). */
      densityAt(p) {
        if (!p) return 0;
        return densityAtCPU(p.x, p.y, p.z, ctx);
      },
      /** Smoothed cloud density around the aircraft (GPU probe, 0..~1). */
      get aircraftDensity() { return self.aircraftDensity; },
      /** 0..1 how deep in cloud the aircraft is (also written to app.flight.state.inCloud). */
      get inCloud() { return self.inCloud; },
      /** Fraction of the sky covered by cloud around the aircraft (max of cumulus / deck), 0..1. */
      get coverage() { return self.coverage; },
      get coverageCumulus() { return self.coverageCu; },
      get coverageDeck() { return self.coverageDeck; },
      /**
       * Direct sunlight transmittance at the aircraft (1 = clear sun, 0 = fully blocked by cloud).
       * The clouds module already applies it to app.sun.intensity each frame (priority 30, after the
       * environment); set api.dimSun = false to take over.
       */
      get lightAttenuation() { return self.lightAttenuation; },
      /** Transmittance straight up (1 = open sky above). */
      get skyAttenuation() { return self.skyAttenuation; },
      dimSun: true,
      /** 'auto' | 'clear' | 'scattered' | 'overcast' (blends over a few seconds). */
      setWeather(name) { self._applyWeatherName(String(name || 'auto')); },
      get weather() { return self.weatherName; },
      get enabled() { return self.enabled; },
      set enabled(v) { self.enabled = !!v; self.histValid = false; },
      layers: LAYERS,
      /**
       * Ground cloud-shadow map for other shaders: spread `uniforms` into a ShaderMaterial and include `glsl`,
       * then multiply sunlight by cloudShadow(worldXZ). Covers 30 km around the aircraft.
       */
      shadow: { texture: self.shadowRT?.texture || null, uniforms: self.shadowUniforms || null, glsl: SHADOW_SAMPLE_GLSL },
      /** Debug */
      get stats() { return { ok: self.ok, low: [self.lowW, self.lowH], noiseMs: self.noise?.ms, weatherMs: self.wm?.ms, probe: { ...self.probe, data: undefined } }; },
      _self: self,
    };
  }
}

const DETAIL_PERIOD_EVOLVE = 512 * 64;

export async function init(app) {
  const c = new Clouds(app);
  return c.api;
}
