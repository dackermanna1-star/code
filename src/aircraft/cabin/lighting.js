// LED mood lighting controller. Follows app.flight.state.cabin.{lightsMode,
// lightLevel, moodColor} with smooth 5-10 s transitions, drives:
//   * the baked-GI uniforms (ceiling wash, sidewall wash, cove glow) of every cabin material
//   * a fixed set of PointLights hidden above the ceiling (soft top-down "area" light for seats/floor)
//   * a mood-coloured HemisphereLight (ceiling bounce / carpet bounce)
//   * the emissive LED strips
//   * a pool of reading-light SpotLights (pre-allocated, never added/removed -> no shader recompiles)
import * as THREE from 'three';
import { damp, clamp } from '../../core/util.js';
import { ZONES } from '../../core/constants.js';
import { SHARED } from './materials.js';

const C = (r, g, b) => new THREE.Color(r, g, b);
// Linear-HDR targets per mode. ceil/side: baked wash radiance; led: cove strip emissive;
// pts: intensity of the hidden ceiling point lights (candela-ish); hemi: interior bounce fill.
export const MODES = {
  boarding: { ceil: C(0.30, 0.50, 1.00).multiplyScalar(0.95), side: C(1.0, 0.85, 0.68).multiplyScalar(0.62), led: C(0.32, 0.55, 1.0).multiplyScalar(3.2), pts: 1.0, ptsColor: C(1.0, 0.9, 0.78), hemi: 0.32, hemiSky: C(0.75, 0.82, 1.0), hemiGround: C(0.32, 0.27, 0.22), env: 1.0, warm: true },
  bright: { ceil: C(1.0, 0.97, 0.92).multiplyScalar(1.0), side: C(1.0, 0.95, 0.88).multiplyScalar(0.72), led: C(1.0, 0.96, 0.9).multiplyScalar(3.2), pts: 1.25, ptsColor: C(1.0, 0.96, 0.9), hemi: 0.36, hemiSky: C(1.0, 0.98, 0.95), hemiGround: C(0.34, 0.31, 0.28), env: 1.0, warm: true },
  cruise: { ceil: C(0.50, 0.66, 1.0).multiplyScalar(0.82), side: C(1.0, 0.94, 0.86).multiplyScalar(0.5), led: C(0.48, 0.66, 1.0).multiplyScalar(2.6), pts: 0.85, ptsColor: C(1.0, 0.95, 0.9), hemi: 0.28, hemiSky: C(0.8, 0.86, 1.0), hemiGround: C(0.3, 0.27, 0.24), env: 0.85, warm: true },
  dim: { ceil: C(1.0, 0.6, 0.3).multiplyScalar(0.36), side: C(1.0, 0.68, 0.42).multiplyScalar(0.25), led: C(1.0, 0.58, 0.28).multiplyScalar(1.4), pts: 0.24, ptsColor: C(1.0, 0.72, 0.48), hemi: 0.14, hemiSky: C(1.0, 0.72, 0.5), hemiGround: C(0.25, 0.18, 0.12), env: 0.35, warm: false },
  night: { ceil: C(0.30, 0.15, 0.95).multiplyScalar(0.62), side: C(0.26, 0.14, 0.75).multiplyScalar(0.035), led: C(0.36, 0.16, 1.0).multiplyScalar(2.0), pts: 0.035, ptsColor: C(0.42, 0.32, 1.0), hemi: 0.035, hemiSky: C(0.4, 0.3, 1.0), hemiGround: C(0.05, 0.04, 0.08), env: 0.1, warm: false },
};

// Overall cabin light level relative to daylight: keeps direct sun ~10x brighter than the
// LED-lit lining (auto-exposure brings the cabin back to a natural brightness).
export const CABIN_GAIN = 0.32;

export function createLighting(app, M, root, opts = {}) {
  const q = app.quality || { maxLights: 8, detail: 1 };
  // allocate for the richest preset; lights beyond the current preset's budget are hidden
  const counts = (qq) => { const ns = clamp(Math.round((qq?.maxLights || 8) / 4), 1, 4); return { ns, np: clamp((qq?.maxLights || 8) - ns + 2, 4, 12) }; };
  const { ns: nSpots, np: nPts } = counts(q);
  const group = new THREE.Group();
  group.name = 'cabin-lights';
  root.add(group);

  // --- hidden ceiling lights -------------------------------------------------------------
  const pts = [];
  const zA = ZONES.flightDeckDoorZ + 1.0, zB = ZONES.aftBulkheadZ - 1.0;
  for (let i = 0; i < nPts; i++) {
    const z = zA + (zB - zA) * (nPts === 1 ? 0.5 : i / (nPts - 1));
    const l = new THREE.PointLight(0xffffff, 1, 0, 1.25);
    l.position.set(0, 2.62, z);
    l.castShadow = false;
    l.name = 'cabin-ceiling-light-' + i;
    group.add(l);
    pts.push(l);
  }
  // spacing-dependent scale so total light is roughly quality independent
  const spacing = (zB - zA) / Math.max(1, nPts - 1);
  const ptScale = 1.55 * Math.pow(spacing / 2.5, 0.8);

  // --- interior bounce hemisphere ----------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.3);
  hemi.name = 'cabin-interior-hemi';
  group.add(hemi);

  // --- reading-light spot pool -------------------------------------------------------------
  const spots = [];
  for (let i = 0; i < nSpots; i++) {
    const s = new THREE.SpotLight(0xfff1dc, 0, 3.2, 0.42, 0.6, 2);
    s.position.set(0, -10, 0);
    s.target.position.set(0, -11, 0);
    s.castShadow = false;
    s.name = 'cabin-reading-spot-' + i;
    s.userData.owner = null;
    group.add(s, s.target);
    spots.push(s);
  }

  // --- state ----------------------------------------------------------------------------------
  const cur = { ceil: new THREE.Color(), side: new THREE.Color(), led: new THREE.Color(), pts: 0, ptsColor: new THREE.Color(), hemi: 0, hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), env: 1 };
  const tgt = { ceil: new THREE.Color(), side: new THREE.Color(), led: new THREE.Color(), pts: 0, ptsColor: new THREE.Color(), hemi: 0, hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), env: 1 };
  const mood = new THREE.Color();
  const tmp = new THREE.Color();
  const api = { mode: 'boarding', level: 1, transition: 7, override: null };
  let primed = false;

  function computeTarget() {
    const st = app.flight?.state?.cabin || {};
    const modeName = api.override?.mode || st.lightsMode || 'boarding';
    const P = MODES[modeName] || MODES.boarding;
    const level = clamp(api.override?.level ?? (st.lightLevel ?? 1), 0, 1.5);
    api.mode = modeName; api.level = level;
    // mood colour tints the 'white' components in warm modes (normalised so it never brightens)
    mood.copy(st.moodColor || tmp.setRGB(1, 1, 1));
    const mx = Math.max(mood.r, mood.g, mood.b, 1e-3);
    mood.multiplyScalar(1 / mx);
    const k = level;
    tgt.ceil.copy(P.ceil).multiplyScalar(k);
    tgt.side.copy(P.side).multiplyScalar(k);
    tgt.led.copy(P.led).multiplyScalar(Math.max(0.15, k));
    tgt.pts = P.pts * k;
    tgt.ptsColor.copy(P.ptsColor);
    tgt.hemi = P.hemi * k;
    tgt.hemiSky.copy(P.hemiSky);
    tgt.hemiGround.copy(P.hemiGround);
    tgt.env = P.env * (0.4 + 0.6 * k);
    if (P.warm) { tgt.side.multiply(mood); tgt.ptsColor.multiply(mood); }
  }

  function apply() {
    const G = CABIN_GAIN;
    SHARED.uCeilWash.value.copy(cur.ceil).multiplyScalar(G);
    SHARED.uSideWash.value.copy(cur.side).multiplyScalar(G);
    SHARED.uGlow.value.copy(cur.led).multiplyScalar(0.22 * G);
    M.led.color.copy(cur.led).multiplyScalar(0.55);
    M.ledSide.color.copy(cur.side).multiplyScalar(4.0 * G);
    for (const l of pts) { l.color.copy(cur.ptsColor); l.intensity = cur.pts * ptScaleCur * G; }
    hemi.color.copy(cur.hemiSky);
    hemi.groundColor.copy(cur.hemiGround);
    hemi.intensity = cur.hemi * G;
    // cabin reflections: scale the environment with the cabin light level (only if nobody else drives it)
    const sc = app.scenes.cabin;
    // base comes from the environment module (daylight) every frame; never read back our own output
    const base = app.cabinEnvBase ?? 0.35;
    sc.environmentIntensity = base * cur.env * 0.5;
  }

  function update(dt) {
    computeTarget();
    const lam = primed ? 3.0 / Math.max(0.5, api.transition) : 1e9;
    const a = 1 - Math.exp(-lam * dt);
    cur.ceil.lerp(tgt.ceil, a); cur.side.lerp(tgt.side, a); cur.led.lerp(tgt.led, a);
    cur.pts = damp(cur.pts, tgt.pts, lam, dt); cur.ptsColor.lerp(tgt.ptsColor, a);
    cur.hemi = damp(cur.hemi, tgt.hemi, lam, dt); cur.hemiSky.lerp(tgt.hemiSky, a); cur.hemiGround.lerp(tgt.hemiGround, a);
    cur.env = damp(cur.env, tgt.env, lam, dt);
    primed = true;
    apply();
    // sun haze on the window acrylic
    if (app.sunDirectionLocal) {
      app.sunDirectionLocal(SHARED.uSunLocal.value);
      const sl = app.lights?.sunCabin;
      SHARED.uSunHaze.value.copy(app.sun?.color || tmp.setRGB(1, 1, 1)).multiplyScalar((sl?.intensity ?? 0) * 0.05);
    }
  }

  // --- reading spots ----------------------------------------------------------------------------
  let spotStamp = 0;
  function acquireSpot(owner, pos, target, intensity = 4.2) {
    let s = spots.find((x) => x.userData.owner === owner);
    if (!s) {
      s = spots.find((x) => !x.userData.owner);
      if (!s) { s = spots.reduce((a, b) => (a.userData.stamp < b.userData.stamp ? a : b)); s.userData.owner?.onSpotLost?.(); }
    }
    s.userData.owner = owner; s.userData.stamp = ++spotStamp;
    s.position.copy(pos); s.target.position.copy(target); s.target.updateMatrixWorld();
    s.userData.targetIntensity = intensity;
    return s;
  }
  function releaseSpot(owner) {
    const s = spots.find((x) => x.userData.owner === owner);
    if (s) { s.userData.owner = null; s.userData.targetIntensity = 0; }
  }
  function updateSpots(dt) {
    for (const s of spots) {
      const t = s.userData.targetIntensity || 0;
      s.intensity = damp(s.intensity, t, 14, dt);
      if (!s.userData.owner && s.intensity < 0.01) { s.intensity = 0; s.position.y = -10; }
    }
  }

  // quality change: never exceed the light budget chosen at start-up, hide extras when lowering
  app.events?.on?.('quality:changed', (qq) => {
    const c = counts(qq);
    const useP = Math.min(c.np, nPts);
    const step = nPts / useP;
    let on = 0;
    pts.forEach((l, i) => { l.visible = Math.floor(i / step) !== Math.floor((i - 1) / step) || i === 0; if (l.visible) on++; });
    // keep the total illumination roughly constant
    ptScaleCur = ptScale * nPts / Math.max(1, on);
    spots.forEach((sp, i) => { sp.visible = i < c.ns; });
  });
  let ptScaleCur = ptScale;

  return {
    api, update, updateSpots, acquireSpot, releaseSpot, spots, points: pts, hemi, group,
    get current() { return cur; },
    setOverride(o) { api.override = o; },
  };
}
