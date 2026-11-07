// =============================================================================
// Aircraft factory: cheap LOD narrowbodies for the airports and traffic.
//
//   const ac = app.exterior.createAircraft({ livery: 'northwind', seed: 3, variant: '737-900' });
//   ac.group.position.set(x, AIRCRAFT.groundHeight, z);   // same frame convention as ours
//   ac.update(dt, { n1: 25, lights: { beacon: true, nav: true }, gear: 1, flaps: 5 });
//
// Draw calls per aircraft: body (fuselage, fin, stabs, wings, nacelles, pylons:
// one merged mesh, livery atlas) + gear + left flaps + right flaps + glows (<= 5).
// Geometries are shared per variant, livery textures/materials per livery.
// =============================================================================
import * as THREE from 'three';
import { AIRCRAFT, DEG } from '../../core/constants.js';
import { buildWingGeometry, wingAnchors } from './wing.js';
import { buildEngineGeometry, buildPylonGeometry } from './engine.js';
import { buildMainGear, buildNoseGear, MAIN_PIVOT, NOSE_PIVOT } from './gear.js';
import { buildFuselage, buildFin, buildHStab, buildAntennas } from './fuselage.js';
import { LIVERIES, LSW, paintLivery } from './liveries.js';
import { merge, flatUV, mirrorX } from './geom.js';
import { GlowSet, strobe, beacon } from './lights.js';

export const VARIANTS = {
  '737-800': { stretchFwd: 0, stretchAft: 0 },
  '737-900': { stretchFwd: 1.32, stretchAft: 1.32 },
  '737-700': { stretchFwd: -1.45, stretchAft: -1.1 },
};

const sw = (g, key) => flatUV(g, LSW[key][0], LSW[key][1]);
const xf = (g, m) => { g.applyMatrix4(m); return g; };

export function createFactory(app) {
  const geoCache = new Map();
  const matCache = new Map();
  const detail = Math.min(1, app.quality?.detail ?? 1);

  function buildVariant(name) {
    if (geoCache.has(name)) return geoCache.get(name);
    const V = VARIANTS[name] || VARIANTS['737-800'];
    const sf = V.stretchFwd, sa = V.stretchAft;
    const body = [];
    // fuselage (single mesh, livery UVs)
    const fu = buildFuselage({ rows: 64, segs: 28, stretchFwd: sf, stretchAft: sa, wells: false, split: false });
    body.push(fu.all);
    const fin = buildFin({ rowsN: 6, colsN: 6, stretchAft: sa });
    body.push(fin.fin, fin.rudder);
    const hs = buildHStab({ rows: 3, n: 5, stretchAft: sa });
    const stab = merge([hs.stab, hs.elevator]);
    body.push(sw(stab.clone(), 'grey'), sw(mirrorX(stab), 'grey'));
    body.push(sw(buildAntennas(sf, sa), 'white'));
    // wings (fixed + stowed slats/spoilers/aileron); flaps separate
    const W = buildWingGeometry(-1);
    const wingParts = [W.fixed, W.groundSpoilers.geo, W.flightSpoilers.geo, W.aileron.geo];
    const wing = merge(wingParts.map((g) => g.clone()));
    sw(wing, 'grey');
    body.push(wing, mirrorX(wing));
    // engines
    const E = AIRCRAFT.engine;
    const EG = buildEngineGeometry(-1);
    const eng = [];
    eng.push(sw(EG.cowl.clone(), 'engine'), sw(EG.sleeve.clone(), 'engine'), sw(EG.lip.clone(), 'metal'), sw(EG.duct.clone(), 'dark'), sw(EG.core.clone(), 'metal'), sw(EG.spinner.clone(), 'dark'));
    eng.forEach((g) => g.deleteAttribute && g.attributes.color && g.deleteAttribute('color'));
    const disc = new THREE.CircleGeometry(0.78, 14); disc.rotateY(Math.PI); disc.translate(0, 0, 0.95);
    eng.push(sw(disc, 'dark'));
    const engine = merge(eng);
    engine.translate(E.x, E.y, E.inletZ);
    const pylon = sw(buildPylonGeometry(-1), 'grey');
    const engR = merge([engine, pylon]);
    body.push(engR, mirrorX(engR));
    const bodyGeo = merge(body);
    bodyGeo.translate(0, 0, 0);
    bodyGeo.computeBoundingSphere();

    // gear (static, down)
    const MG = buildMainGear(-1);
    const mg = [];
    const T = new THREE.Matrix4().makeTranslation(MAIN_PIVOT.x, MAIN_PIVOT.y, MAIN_PIVOT.z);
    mg.push(sw(MG.leg.clone(), 'grey'), sw(MG.chrome.clone(), 'metal'), sw(MG.dark.clone(), 'dark'));
    for (const c of MG.wheelCentres) {
      const m = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z);
      mg.push(xf(sw(MG.tyre.clone(), 'tyre'), m), xf(sw(MG.wheel.clone(), 'metal'), m));
    }
    const mainGear = xf(merge(mg), T);
    const NG = buildNoseGear(-1);
    const ng = [sw(NG.leg.clone(), 'grey'), sw(NG.chrome.clone(), 'metal'), sw(NG.dark.clone(), 'dark')];
    for (const c of NG.wheelCentres) {
      const m = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z);
      ng.push(xf(sw(NG.tyre.clone(), 'tyre'), m), xf(sw(NG.wheel.clone(), 'metal'), m));
    }
    const noseGear = xf(merge(ng), new THREE.Matrix4().makeTranslation(NOSE_PIVOT.x, NOSE_PIVOT.y - 0, NOSE_PIVOT.z - sf));
    const gearGeo = merge([mainGear, mirrorX(mainGear), noseGear]);

    // flaps per side (pivot-relative), main + aft merged (aft follows the main flap only)
    const flapSide = (fl) => {
      const g = merge([fl.main.geo.clone(), fl.aft.geo.clone()]);
      sw(g, 'grey');
      g.translate(-fl.main.pivot.x, -fl.main.pivot.y, -fl.main.pivot.z);
      return { geo: g, pivot: fl.main.pivot.clone(), axis: fl.main.axis.clone(), chord: fl.chord };
    };
    const flapsIn = flapSide(W.inboardFlap), flapsOut = flapSide(W.outboardFlap);
    const out = { bodyGeo, gearGeo, flapsIn, flapsOut, sf, sa };
    geoCache.set(name, out);
    return out;
  }

  function material(livery, variant) {
    const key = `${livery}|${variant}`;
    if (matCache.has(key)) return matCache.get(key);
    const liv = LIVERIES[livery] || LIVERIES.halcyon;
    const V = VARIANTS[variant] || VARIANTS['737-800'];
    const L = paintLivery(liv, { W: 2048, H: 1024, stretchFwd: V.stretchFwd, stretchAft: V.stretchAft, detail: 0, normals: false });
    const m = new THREE.MeshStandardMaterial({ name: `ai-${livery}`, map: L.map, roughnessMap: L.roughnessMap, roughness: 1, metalness: 0.05, envMapIntensity: 1 });
    matCache.set(key, m);
    return m;
  }

  /** Create one aircraft. Returns { group, update(dt, partial), setState(partial), livery, variant }. */
  function createAircraft({ livery = 'halcyon', seed = 1, variant = '737-800', castShadow = true } = {}) {
    if (!LIVERIES[livery]) livery = 'halcyon';
    if (!VARIANTS[variant]) variant = '737-800';
    const G = buildVariant(variant);
    const mat = material(livery, variant);
    const group = new THREE.Group();
    group.name = `aircraft:${livery}`;
    const body = new THREE.Mesh(G.bodyGeo, mat);
    body.castShadow = castShadow; body.receiveShadow = true;
    const gear = new THREE.Mesh(G.gearGeo, mat);
    gear.castShadow = castShadow;
    group.add(body, gear);
    // flaps: one mesh per side containing the inboard + outboard flaps is not possible with
    // different hinge lines, so the outboard flap carries the deflection and the inboard flap
    // is merged into the same pivot (small error, invisible at distance).
    const flapGeo = merge([G.flapsIn.geo.clone().translate(G.flapsIn.pivot.x - G.flapsOut.pivot.x, G.flapsIn.pivot.y - G.flapsOut.pivot.y, G.flapsIn.pivot.z - G.flapsOut.pivot.z), G.flapsOut.geo]);
    const flaps = [];
    for (const sgn of [1, -1]) {
      const side = new THREE.Group(); side.scale.x = sgn;
      const p = new THREE.Group(); p.position.copy(G.flapsOut.pivot);
      const m = new THREE.Mesh(flapGeo, mat); m.castShadow = castShadow;
      p.add(m); side.add(p); group.add(side);
      flaps.push(p);
    }
    // lights
    const A = wingAnchors();
    const navR = A.navPos.clone(), navL = navR.clone(); navL.x *= -1;
    const LL = [
      { pos: navL, color: 0xff1a12, size: 0.9, min: 2.2, dir: new THREE.Vector3(-0.8, 0, -0.6), cone: 62 },
      { pos: navR, color: 0x18ff4a, size: 0.9, min: 2.2, dir: new THREE.Vector3(0.8, 0, -0.6), cone: 62 },
      { pos: navL.clone().add(new THREE.Vector3(0, 0.02, 0.12)), color: 0xf2f6ff, size: 1.8, min: 3 },
      { pos: navR.clone().add(new THREE.Vector3(0, 0.02, 0.12)), color: 0xf2f6ff, size: 1.8, min: 3 },
      { pos: new THREE.Vector3(0, 1.43, AIRCRAFT.tailZ + G.sa - 0.25), color: 0xfff6e8, size: 0.6, min: 2, dir: new THREE.Vector3(0, 0, 1), cone: 70 },
      { pos: new THREE.Vector3(0, 2.5, 3.2), color: 0xff2008, size: 1.1, min: 2.4, dir: new THREE.Vector3(0, 1, 0), cone: 100 },
      { pos: new THREE.Vector3(0, -1.66, -1.2), color: 0xff2008, size: 1.1, min: 2.4, dir: new THREE.Vector3(0, -1, 0), cone: 100 },
      { pos: new THREE.Vector3(-A.landingPos.x, A.landingPos.y, A.landingPos.z - 0.05), color: 0xfff1dc, size: 1.6, min: 3, dir: new THREE.Vector3(0, -0.06, -1), cone: 20, pull: 0.15 },
      { pos: new THREE.Vector3(A.landingPos.x, A.landingPos.y, A.landingPos.z - 0.05), color: 0xfff1dc, size: 1.6, min: 3, dir: new THREE.Vector3(0, -0.06, -1), cone: 20, pull: 0.15 },
      { pos: new THREE.Vector3(0, -1.8, -15.9 - G.sf), color: 0xfff1dc, size: 1.0, min: 2.5, dir: new THREE.Vector3(0, -0.12, -1), cone: 28 },
      { pos: new THREE.Vector3(-1.6, 1.62, 15.4 + G.sa), color: 0xfff1dc, size: 0.35, min: 1.5, dir: new THREE.Vector3(0.35, 1, 0.1), cone: 60 },
      { pos: new THREE.Vector3(1.6, 1.62, 15.4 + G.sa), color: 0xfff1dc, size: 0.35, min: 1.5, dir: new THREE.Vector3(-0.35, 1, 0.1), cone: 60 },
    ];
    const glows = new GlowSet(LL);
    group.add(glows.mesh);
    // logo light: simple emissive boost of the livery would need a per-instance material; skipped.
    const r = mulberry(seed);
    const state = { n1: 0, lights: { nav: true, beacon: false, strobe: false, landing: false, taxi: false, logo: false }, gear: 1, flaps: 0, t: r() * 10, phase: r() };
    let flapCur = 0;
    function setState(partial = {}) {
      if (partial.n1 !== undefined) state.n1 = partial.n1;
      if (partial.gear !== undefined) state.gear = partial.gear;
      if (partial.flaps !== undefined) state.flaps = partial.flaps;
      if (partial.lights) Object.assign(state.lights, partial.lights);
    }
    function update(dt = 0.016, partial) {
      if (partial) setState(partial);
      state.t += dt;
      flapCur += (state.flaps - flapCur) * Math.min(1, dt * 1.5);
      const deg = Math.min(40, Math.max(0, flapCur));
      const travel = Math.min(1, deg / 15) * 0.5;
      for (const f of flaps) {
        f.position.copy(G.flapsOut.pivot);
        f.position.z += travel * G.flapsOut.chord;
        f.position.y -= travel * 0.3 * G.flapsOut.chord;
        f.quaternion.setFromAxisAngle(G.flapsOut.axis, deg * 0.8 * DEG);
      }
      gear.visible = state.gear > 0.5;
      const L = state.lights, t = state.t;
      glows.set(0, L.nav ? 45 : 0); glows.set(1, L.nav ? 45 : 0); glows.set(4, L.nav ? 30 : 0);
      const s = L.strobe ? strobe(t, 1.2, state.phase) : 0;
      glows.set(2, s * 900); glows.set(3, s * 900);
      glows.set(5, L.beacon ? beacon(t, 1, state.phase) * 160 : 0);
      glows.set(6, L.beacon ? beacon(t, 1, state.phase + 0.5) * 160 : 0);
      glows.set(7, L.landing ? 600 : 0); glows.set(8, L.landing ? 600 : 0);
      glows.set(9, L.taxi ? 320 : 0);
      glows.set(10, L.logo ? 40 : 0); glows.set(11, L.logo ? 40 : 0);
      glows.commit();
    }
    update(0);
    return { group, update, setState, livery, variant, parts: { body, gear, flaps, glows } };
  }

  return { createAircraft, variants: Object.keys(VARIANTS) };
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
