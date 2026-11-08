import * as THREE from 'three';
import { AtmosphereModel, ATM, createAtmosphereUniforms, SkyViewLut } from './atmosphere.js';
import { createSkyUniforms, createSkyDome, SkyCapture, SKY_COMMON_GLSL } from './sky.js';
import { sunPosition, moonPosition, TIME_PRESETS, wrapHours, SOLAR } from './sun.js';
import { Terrain, makeGroundHeight } from './terrain.js';
import { createNoiseTexture, createWaveTexture, createReliefTexture, loadGroundTextures } from './textures.js';

// =============================================================================
// ENVIRONMENT MODULE — sky, sun & time of day, atmosphere / aerial perspective,
// outside environment map, fog, terrain (all regions) and water.
//
// Per frame (priority 30):
//   time of day -> sun / moon directions -> atmosphere uniforms -> sky-view LUT
//   (only when the sun or observer altitude changed) -> CPU lighting (throttled)
//   -> app.sun.* -> terrain clipmap -> fog -> env map (throttled)
//
// Outside ambient: the sky PMREM (scenes.outside.environment) carries most of
// the sky light for standard materials; app.sun.ambientIntensity keeps the
// physical sky irradiance (cabin fill, other modules) and the outside
// hemisphere light is trimmed to a small fill after core:lights (priority 25).
// =============================================================================

const DEG = Math.PI / 180;
const ENV_SHARE = 0.85;          // share of sky ambient delivered by the PMREM (outside)
const HEMI_SHARE = 0.18;         // remaining fill through the hemisphere light (outside)
const MOON_ILLUM = 0.075;         // boosted moonlight (scene units) so night is never pitch black
const NIGHT_GLOW = [0.00034, 0.00046, 0.00078];
const X_REF_FOG = 10000;         // distance (m) where the exp2 fog matches the physical extinction

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

class Environment {
  constructor(app) {
    this.app = app;
    this.model = new AtmosphereModel();
    const tex = this.model.makeTextures();
    this.atmU = createAtmosphereUniforms(tex);
    this.skyU = createSkyUniforms(this.atmU);
    // geo anchors shared by every shader that includes GEO_GLSL
    this.skyU.uGeoDep = { value: new THREE.Vector2(app.world.departureOrigin.x, app.world.departureOrigin.z) };
    this.skyU.uGeoArr = { value: new THREE.Vector2(app.world.arrivalOrigin.x, app.world.arrivalOrigin.z) };
    this.skyU.uSkyIrrUp = { value: new THREE.Vector3(1, 1, 1) };
    this.skyU.uSkyIrrDown = { value: new THREE.Vector3(0.1, 0.1, 0.1) };
    this.skyU.uMoonIrr = { value: new THREE.Vector3() };

    this.skyView = new SkyViewLut(app, this.atmU);
    this.dome = createSkyDome(this.skyU, !!app.pipeline?.reversedDepth);
    if (!String(app.debug?.module || '').includes('env-nosky')) app.skyRoot.add(this.dome);
    app.scenes.outside.background = null;

    // --- state ------------------------------------------------------------------
    this.hours = 16.5;
    this.timeOverride = null;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, -1, 0);
    this.sunEl = 45; this.moonEl = -10; this.moonPhase = 0.85;
    this.camWorld = new THREE.Vector3(0, 3.8, 0);
    this.altKm = 0.0038;
    this.nightFactor = 0;
    this._lut = { sun: new THREE.Vector3(9, 9, 9), alt: -1 };
    this._light = { t: -1e9, sun: new THREE.Vector3(9, 9, 9), alt: -1 };
    this._env = { t: -1e9, sun: new THREE.Vector3(9, 9, 9), alt: -1, night: -1, cloud: -1, rt: null };
    this.skyIrrUp = [1, 1, 1];
    this.skyIrrDown = [0.1, 0.1, 0.1];
    this.fogColor = new THREE.Color(0.6, 0.7, 0.8);
    this.visibilityKm = 3.912 / (ATM.rayScat[1] + ATM.mieScat + ATM.mieAbs);
    this._tmp = [0, 0, 0]; this._tmp2 = [0, 0, 0]; this._tmp3 = [0, 0, 0];

    // --- terrain ----------------------------------------------------------------
    const ground = loadGroundTextures(app);
    const aniso = Math.min(app.quality?.anisotropy || 4, app.renderer.capabilities.getMaxAnisotropy?.() || 4);
    const lowQ = (app.quality?.detail ?? 1) === 0;
    this.terrainTextures = { noise: createNoiseTexture(512, lowQ ? 1 : Math.min(4, aniso)), waves: createWaveTexture(256, lowQ ? 1 : aniso), relief: createReliefTexture(512, lowQ ? 1 : Math.min(4, aniso)), ...ground };
    // debug: ?module=env-noterrain / env-nosky / env-nopmrem (combinable)
    const dbg = String(app.debug?.module || '');
    this._dbg = dbg;
    this.terrain = null;
    if (!dbg.includes('env-noterrain')) {
      try {
        this.terrain = new Terrain(app, this, this.skyU, this.terrainTextures);
        app.worldRoot.add(this.terrain.mesh);
      } catch (e) {
        console.error('[environment] terrain init failed', e);
        this.terrain = null;
      }
    }

    // --- environment map ----------------------------------------------------------
    const envSize = Math.max(128, app.quality?.envMapSize || 256);
    this.capture = new SkyCapture(app, this.skyU, envSize * 4);
    this.pmrem = new THREE.PMREMGenerator(app.renderer);
    this.pmrem.compileEquirectangularShader();

    // --- fog -----------------------------------------------------------------------
    this.fog = new THREE.FogExp2(0xb8c8d8, 0.00005);
    app.scenes.outside.fog = this.fog;

    // --- world hooks ---------------------------------------------------------------
    this.groundHeight = makeGroundHeight(app);
    app.world.groundHeight = this.groundHeight;
    app.events.on('world:arrivalMoved', ({ origin }) => {
      const o = origin || app.world.arrivalOrigin;
      this.skyU.uGeoArr.value.set(o.x, o.z);
      this.terrain?.invalidate();
    });
    app.events.on('quality:changed', () => this._onQualityChanged());

    app.addUpdate((dt) => this.update(dt), 30, 'environment');
    app.addUpdate(() => this._postLights(), 26, 'environment:lights');
    // prime everything once so the first frame (and other modules' init) see sane values
    this.update(0, true);

    this.api = this._makeApi();
  }

  /** Rebuild quality-dependent parts (terrain grid / shader detail, env-map size). */
  _onQualityChanged() {
    const app = this.app;
    try {
      const detail = Math.max(0, Math.min(3, app.quality?.detail ?? 1));
      if (this.terrain && this.terrain.cfg.detail !== detail) {
        app.worldRoot.remove(this.terrain.mesh);
        this.terrain.dispose();
        this.terrain = new Terrain(app, this, this.skyU, this.terrainTextures);
        app.worldRoot.add(this.terrain.mesh);
        this.api.terrain = this.terrain;
      }
      const envSize = Math.max(128, app.quality?.envMapSize || 256) * 4;
      if (this.capture.rt.width !== envSize) {
        this.capture.dispose();
        this.capture = new SkyCapture(app, this.skyU, envSize);
        if (this._env.rt) { this._env.rt.dispose(); this._env.rt = null; }
      }
    } catch (e) {
      console.warn('[environment] quality change failed', e);
    }
    this._env.t = -1e9;
    this._maybeUpdateEnvMap(true);
  }

  // ------------------------------------------------------------------------- time
  resolveHours() {
    const app = this.app;
    if (this.timeOverride !== null && Number.isFinite(this.timeOverride)) return this.timeOverride;
    if (Number.isFinite(app.debug?.tod)) return app.debug.tod;
    const s = app.settings?.get?.('timeOfDay');
    if (s && s !== 'auto' && TIME_PRESETS[s] !== undefined) return TIME_PRESETS[s];
    const st = app.flight?.state;
    return Number.isFinite(st?.timeOfDay) ? st.timeOfDay : 16.5;
  }

  // ------------------------------------------------------------------------- frame
  update(dt, force = false) {
    const app = this.app;
    const U = this.skyU;
    this.hours = wrapHours(this.resolveHours());
    const sp = sunPosition(this.hours, this.sunDir);
    this.sunEl = sp.elevationDeg; this.sunAz = sp.azimuthDeg;
    const mp = moonPosition(this.hours, this.moonDir);
    this.moonEl = mp.elevationDeg; this.moonPhase = mp.phase;

    // observer
    app.world.toWorld(app.camera.position, this.camWorld);
    if (!Number.isFinite(this.camWorld.y)) this.camWorld.set(0, 3.8, 0);
    this.altKm = clamp(this.camWorld.y / 1000, 0.0012, 60);
    U.uAtmSunDir.value.copy(this.sunDir);
    U.uAtmCamH.value = this.altKm;
    U.uAtmCamR.value = ATM.Rg + this.altKm;
    U.uAtmMoonDir.value.copy(this.moonDir);
    U.uTime.value = app.time;

    // night factor (0 = day ... 1 = full night)
    this.nightFactor = smooth(-3, -11, this.sunEl);
    const mI = MOON_ILLUM * this.moonPhase;
    U.uAtmMoonIllum.value.set(mI * 0.92, mI * 0.97, mI * 1.05).multiplyScalar(this.nightFactor);
    U.uAtmNightGlow.value.set(NIGHT_GLOW[0], NIGHT_GLOW[1], NIGHT_GLOW[2]).multiplyScalar(0.25 + 0.75 * this.nightFactor);
    U.uStars.value = smooth(-5, -13, this.sunEl) * (0.75 + 0.25 * smooth(0.5, 9, this.altKm));
    U.uSunDisc.value = 260;
    U.uMoonDisc.value = 2.6 + 10 * this.nightFactor;
    // sidereal rotation of the star field around the celestial pole
    const lat = SOLAR.latitude * DEG;
    const pole = _v1.set(0, Math.sin(lat), -Math.cos(lat));
    _m4.makeRotationAxis(pole, -(this.hours / 24) * Math.PI * 2 * 1.0027);
    U.uStarRot.value.setFromMatrix4(_m4);

    // sky-view LUT (only when something changed)
    const L = this._lut;
    const altChanged = Math.abs(this.altKm - L.alt) > Math.max(0.002, L.alt * 0.006);
    if (force || altChanged || L.sun.angleTo(this.sunDir) > 0.0004) {
      this.skyView.render();
      L.sun.copy(this.sunDir); L.alt = this.altKm;
    }

    // CPU lighting (throttled)
    const LI = this._light;
    const sunMoved = LI.sun.angleTo(this.sunDir);
    const altMoved = Math.abs(this.altKm - LI.alt);
    const jump = sunMoved > 1.0 * DEG || altMoved > Math.max(0.3, LI.alt * 0.15);
    if (force || jump || (app.time - LI.t > 0.25 && (sunMoved > 0.001 || altMoved > Math.max(0.01, LI.alt * 0.02))) || app.time - LI.t > 5) {
      this._computeLighting();
      LI.t = app.time; LI.sun.copy(this.sunDir); LI.alt = this.altKm;
    }
    this._applySun();

    // terrain
    if (this.terrain) {
      let gh = 0;
      try { gh = this.groundHeight(this.camWorld.x, this.camWorld.z); } catch { gh = 0; }
      const agl = Math.max(1, this.camWorld.y - Math.max(gh, 0));
      this.terrain.update(this.camWorld, agl, app.time);
    }

    // fog
    this._updateFog();

    // environment map (throttled)
    this._maybeUpdateEnvMap(force);
  }

  _computeLighting() {
    const m = this.model;
    const sun = [this.sunDir.x, this.sunDir.y, this.sunDir.z];
    const E0 = ATM.sunE;
    // sky irradiance at the observer and at sea level (cosine-weighted hemisphere)
    this.skyIrrCam = this._irradiance(this.altKm, sun);
    const g = this._irradiance(0.002, sun);
    this.skyIrrUp = g;
    // sun at sea level
    const tg = m.sunTransmittance(0.002, sun[1], this._tmp);
    const sunH = [E0[0] * tg[0] * Math.max(0, sun[1]), E0[1] * tg[1] * Math.max(0, sun[1]), E0[2] * tg[2] * Math.max(0, sun[1])];
    const alb = [0.10, 0.115, 0.075];
    const moonI = this.skyU.uAtmMoonIllum.value;
    const mH = Math.max(0, this.moonDir.y);
    this.skyIrrDown = [0, 1, 2].map((c) => alb[c] * (sunH[c] + g[c] + [moonI.x, moonI.y, moonI.z][c] * mH));
    this.skyU.uSkyIrrUp.value.set(...g);
    this.skyU.uSkyIrrDown.value.set(...this.skyIrrDown);
    this.skyU.uGroundRadiance.value.set(...this.skyIrrDown.map((v) => v / Math.PI));
    // fog colour: asymptotic haze colour looking at the ground ~10 km away, averaged over azimuth
    const h = this.altKm;
    const r = ATM.Rg + h;
    const dip = Math.acos(clamp(ATM.Rg / r, -1, 1));
    const el = -(dip + Math.atan2(h, 12) + 0.002);
    // (sunward azimuths are down-weighted: their bright forward-scattering glow is not
    // representative of the haze in front of most objects)
    let fr = 0, fg = 0, fb = 0, wsum = 0;
    const out = this._tmp2;
    const sh = Math.hypot(sun[0], sun[2]) || 1;
    for (let i = 0; i < 12; i++) {
      const az = (i + 0.5) / 12 * Math.PI * 2;
      const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
      const cs = (d[0] * sun[0] + d[2] * sun[2]) / (sh * Math.cos(el));
      const w = 1 - 0.8 * smooth(0.2, 0.95, cs);
      m.skyRadiance(h, d, sun, E0, out, 20);
      const T = out.T;
      const ns = this._nightSky(d, this._tmp3);
      fr += w * (out[0] / Math.max(0.05, 1 - T[0]) + ns[0]);
      fg += w * (out[1] / Math.max(0.05, 1 - T[1]) + ns[1]);
      fb += w * (out[2] / Math.max(0.05, 1 - T[2]) + ns[2]);
      wsum += w;
    }
    this.fogColor.setRGB(fr / wsum, fg / wsum, fb / wsum);
  }

  /** Analytic moonlit night sky (mirror of GLSL atmNightSky). */
  _nightSky(d, out) {
    const U = this.skyU;
    const md = this.moonDir, mI = U.uAtmMoonIllum.value, glow = U.uAtmNightGlow.value;
    const mu = Math.max(d[1], -0.02) + 0.035;
    const m = Math.min(1 / mu, 28);
    const c = d[0] * md.x + d[1] * md.y + d[2] * md.z;
    const g = ATM.mieG, g2 = g * g;
    const pR = 3 / (16 * Math.PI) * (1 + c * c);
    const pM = 3 / (8 * Math.PI) * ((1 - g2) * (1 + c * c)) / ((2 + g2) * Math.pow(Math.max(1e-4, 1 + g2 - 2 * g * c), 1.5));
    const mm = Math.min(1 / (Math.max(md.y, -0.02) + 0.035), 28);
    const up = smooth(-0.03, 0.02, md.y);
    const hz = 1 - clamp(d[1], 0, 1);
    const glowK = 0.55 + 1.6 * hz * hz * hz;
    const mie = ATM.mieScat + ATM.mieAbs;
    const MI = [mI.x, mI.y, mI.z], GL = [glow.x, glow.y, glow.z];
    for (let k = 0; k < 3; k++) {
      const tau = (ATM.rayScat[k] * ATM.rayH + mie * ATM.mieH) * m;
      const scat = (ATM.rayScat[k] * ATM.rayH * pR + ATM.mieScat * ATM.mieH * pM) * m;
      const Tm = Math.exp(-(ATM.rayScat[k] * ATM.rayH + mie * ATM.mieH) * mm) * up;
      out[k] = MI[k] * Tm * scat * (1 - Math.exp(-tau)) / Math.max(tau, 1e-4) * 1.6 + GL[k] * glowK;
    }
    return out;
  }

  _irradiance(hKm, sun) {
    const m = this.model, E0 = ATM.sunE, out = this._tmp2, ns = this._tmp3;
    let r = 0, g = 0, b = 0;
    const RINGS = 5, AZ = 8;
    for (let i = 0; i < RINGS; i++) {
      const u1 = (i + 0.5) / RINGS;
      const st = Math.sqrt(u1), ct = Math.sqrt(1 - u1);
      for (let j = 0; j < AZ; j++) {
        const ph = (j + 0.5 + i * 0.37) / AZ * Math.PI * 2;
        const d = [st * Math.cos(ph), Math.max(0.02, ct), st * Math.sin(ph)];
        m.skyRadiance(hKm, d, sun, E0, out, 14);
        this._nightSky(d, ns);
        r += out[0] + ns[0]; g += out[1] + ns[1]; b += out[2] + ns[2];
      }
    }
    const k = Math.PI / (RINGS * AZ);
    return [r * k, g * k, b * k];
  }

  _applySun() {
    const app = this.app, s = app.sun, m = this.model;
    const E0 = ATM.sunE;
    const t = m.sunTransmittance(this.altKm, this.sunDir.y, this._tmp);
    const sr = E0[0] * t[0], sg = E0[1] * t[1], sb = E0[2] * t[2];
    const useMoon = this.sunEl < -4.5;
    if (!useMoon) {
      const mx = Math.max(sr, sg, sb, 1e-6);
      s.direction.copy(this.sunDir);
      s.color.setRGB(sr / mx, sg / mx, sb / mx);
      s.intensity = mx > 1e-5 ? mx : 0;
      this.skyU.uMoonIrr.value.set(0, 0, 0);
    } else {
      // moonlight (blue-shifted to read as night)
      const mI = this.skyU.uAtmMoonIllum.value;
      const mt = m.sunTransmittance(this.altKm, this.moonDir.y, this._tmp3);
      const k = smooth(-4.5, -10, this.sunEl) * smooth(-1, 5, this.moonEl);
      const mr = mI.x * mt[0] * k, mg = mI.y * mt[1] * k, mb = mI.z * mt[2] * k;
      const mx = Math.max(mr, mg, mb, 1e-6);
      s.direction.copy(this.moonDir);
      s.color.setRGB(mr / mx * 0.82, mg / mx * 0.9, mb / mx);
      s.intensity = mx > 1e-6 ? mx : 0;
      this.skyU.uMoonIrr.value.set(mr, mg, mb);
    }
    if (this.moonEl > -2 && !useMoon) {
      // moon still lights the terrain a little in twilight
      const mI = this.skyU.uAtmMoonIllum.value;
      this.skyU.uMoonIrr.value.set(mI.x, mI.y, mI.z).multiplyScalar(smooth(-1, 5, this.moonEl) * 0.5);
    }
    const ir = this.skyIrrCam || this.skyIrrUp;
    const amb = Math.max(ir[0], ir[1], ir[2], 1e-5);
    s.ambientIntensity = amb;
    s.skyColor.setRGB(ir[0] / amb, ir[1] / amb, ir[2] / amb);
    const gd = this.skyIrrDown;
    s.groundColor.setRGB(gd[0] / amb, gd[1] / amb, gd[2] / amb);
    s.cabinFill = 0.22;
    // cabin reflections: RoomEnvironment kept, intensity follows daylight
    const day = clamp((ir[0] * 0.2126 + ir[1] * 0.7152 + ir[2] * 0.0722) / 1.1, 0, 1);
    // daylight-driven base for the cabin's reflections; the cabin module scales it by its own light level
    app.cabinEnvBase = 0.1 + 0.28 * Math.sqrt(day);
    app.scenes.cabin.environmentIntensity = app.cabinEnvBase;
    app.scenes.outside.environmentIntensity = ENV_SHARE;
    this.daylight = day;
  }

  /** After core:lights (25): trim the outside hemisphere light (the PMREM supplies the sky light). */
  _postLights() {
    const L = this.app.lights;
    if (L?.hemiOutside && this.app.scenes.outside.environment) L.hemiOutside.intensity = this.app.sun.ambientIntensity * HEMI_SHARE;
  }

  _updateFog() {
    const sc = this.app.scenes.outside;
    if (!sc.fog) sc.fog = this.fog;
    // mean extinction along a slant path from the observer down to the ground (exponential layers)
    const h = Math.max(0.001, this.altKm);
    const kR = ATM.rayH / h * (1 - Math.exp(-h / ATM.rayH)), kM = ATM.mieH / h * (1 - Math.exp(-h / ATM.mieH));
    const betaKm = ATM.rayScat[1] * kR + (ATM.mieScat + ATM.mieAbs) * kM;
    const beta = betaKm / 1000;
    this.fog.density = Math.sqrt(beta / X_REF_FOG);
    this.fog.color.copy(this.fogColor);
  }

  _maybeUpdateEnvMap(force) {
    const E = this._env, app = this.app;
    const cov = app.clouds && typeof app.clouds.coverage === 'number' ? app.clouds.coverage : 0;
    const cloudBelow = clamp(cov, 0, 1) * smooth(2.5, 5.5, this.altKm);
    const changed = E.sun.angleTo(this.sunDir) > 0.5 * DEG || Math.abs(Math.log((this.altKm + 0.1) / (E.alt + 0.1))) > 0.12
      || Math.abs(this.nightFactor - E.night) > 0.05 || Math.abs(cloudBelow - E.cloud) > 0.08;
    if (!force && !(changed && app.time - E.t > 1.5)) return;
    if (this._dbg.includes('env-nopmrem')) return;
    // brighten the lower hemisphere when a cloud deck is below us
    const gr = this.skyU.uGroundRadiance.value;
    const saved = _v3.copy(gr);
    if (cloudBelow > 0) {
      const up = this.skyIrrUp;
      const sunT = this.model.sunTransmittance(this.altKm, this.sunDir.y, this._tmp);
      const cl = [0, 1, 2].map((c) => 0.75 * (ATM.sunE[c] * sunT[c] * Math.max(0, this.sunDir.y) + up[c]) / Math.PI);
      gr.set(gr.x + (cl[0] - gr.x) * cloudBelow, gr.y + (cl[1] - gr.y) * cloudBelow, gr.z + (cl[2] - gr.z) * cloudBelow);
    }
    try {
      const tex = this.capture.render();
      E.rt = this.pmrem.fromEquirectangular(tex, E.rt);
      app.scenes.outside.environment = E.rt.texture;
    } catch (e) {
      console.warn('[environment] env map update failed', e);
    }
    gr.copy(saved);
    E.t = app.time; E.sun.copy(this.sunDir); E.alt = this.altKm; E.night = this.nightFactor; E.cloud = cloudBelow;
  }

  // ------------------------------------------------------------------------- API
  _makeApi() {
    const env = this;
    const dirArr = [0, 0, 0];
    return {
      /** Ground / water-surface height (m) at world (x, z). */
      groundHeight: (x, z) => env.groundHeight(x, z),
      /** Force the clock (hours, e.g. 18.6) or null to follow settings / the director. */
      setTimeOverride(h) { env.timeOverride = (h === null || h === undefined) ? null : Number(h); },
      /** Sky radiance (linear HDR, scene units) seen from the current observer towards a WORLD direction. */
      skyColorAt(dirWorld, target = new THREE.Color()) {
        const d = _v2.copy(dirWorld).normalize();
        dirArr[0] = d.x; dirArr[1] = d.y; dirArr[2] = d.z;
        const s = env.sunDir;
        const out = env.model.skyRadiance(env.altKm, dirArr, [s.x, s.y, s.z], ATM.sunE, [0, 0, 0], 20);
        const ns = env._nightSky(dirArr, [0, 0, 0]);
        if (out.hitsGround) {
          const T = out.T, g = env.skyU.uGroundRadiance.value;
          out[0] += T[0] * g.x; out[1] += T[1] * g.y; out[2] += T[2] * g.z;
        }
        return target.setRGB(out[0] + ns[0], out[1] + ns[1], out[2] + ns[2]);
      },
      get sunElevationDeg() { return env.sunEl; },
      get sunAzimuthDeg() { return env.sunAz; },
      get moonElevationDeg() { return env.moonEl; },
      get timeOfDay() { return env.hours; },
      /** 0 = day, 1 = night (sun below ~ -11 deg). */
      get nightFactor() { return env.nightFactor; },
      /** 0..1 rough daylight level (sky irradiance). */
      get daylight() { return env.daylight; },
      /** True sun / moon directions (WORLD). app.sun.direction is the key light (moon at night). */
      sunDirection: env.sunDir,
      moonDirection: env.moonDir,
      get visibilityKm() { return env.visibilityKm; },
      /** Haze colour used for scene fog (linear HDR). */
      fogColor: env.fogColor,
      /** The FogExp2 installed on scenes.outside (re-set every frame at priority 30; modules may scale it afterwards). */
      fog: env.fog,
      /**
       * Shared uniforms + GLSL for other modules' shaders (clouds, water, glow):
       *   uniforms: spread into your ShaderMaterial uniforms (same objects, updated every frame)
       *   glsl.atmosphere: defines atmSkyView(dirWorld), atmTransmittance(rKm, mu),
       *     atmSunTransmittance(hKm, muS), atmAerial(radiance, dirWorld, distKm[, extraSky]),
       *     atmNightSky(dir), uniforms uAtmSunDir / uAtmSunIllum / uAtmCamH (km) / uAtmCamR.
       */
      uniforms: env.skyU,
      glsl: { atmosphere: SKY_COMMON_GLSL },
      terrain: env.terrain,
      skyDome: env.dome,
      /** Debug: force an env-map refresh. */
      refreshEnvironment() { env._env.t = -1e9; env._maybeUpdateEnvMap(true); },
    };
  }
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();

export async function init(app) {
  const env = new Environment(app);
  if (app.debug?.module === 'env-stats') console.log(`[environment] LUT bake ${env.model.bakeMs.toFixed(1)} ms, terrain levels ${env.terrain?.levels}`);
  return env.api;
}
