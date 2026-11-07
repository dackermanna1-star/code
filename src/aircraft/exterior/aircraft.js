// =============================================================================
// OUR AIRCRAFT: assembles wings, engines, gear, fuselage/tail, lights and the
// per-frame animation from app.flight.state.
// =============================================================================
import * as THREE from 'three';
import { AIRCRAFT, DEG } from '../../core/constants.js';
import { buildWingGeometry, wingAnchors } from './wing.js';
import { buildEngineGeometry, buildPylonGeometry, REVERSER_TRAVEL } from './engine.js';
import { buildMainGear, buildNoseGear, MAIN_PIVOT, NOSE_PIVOT } from './gear.js';
import { buildFuselage, buildFin, buildHStab, buildAntennas, sectionPoint, fuselageShape, FUS_V, Z0, Z1 } from './fuselage.js';
import { createMaterials, engineMaterials } from './materials.js';
import { setupMesh, SHARED } from './shading.js';
import { GlowSet, beacon, beamCones } from './lights.js';
import { smoothSeams, gridGeometry, merge } from './geom.js';
import { orient } from './wing.js';
import { Contrails } from './contrails.js';
import { buildDecals, decalMaterial } from './decals.js';
import { stencilSheet } from './textures.js';

const E = AIRCRAFT.engine;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

/** flapsDeg -> { travel 0..1, main deflection deg, aft extra deg } (737 detents 0/1/5/15/25/30/40) */
const FLAP_TABLE = [[0, 0, 0, 0], [1, 0.3, 1.5, 0], [2, 0.42, 2.5, 0.5], [5, 0.6, 5, 2], [10, 0.73, 9, 5], [15, 0.83, 13, 8], [25, 0.95, 21, 14], [30, 1.0, 25, 17], [40, 1.0, 33, 23]];
const _fp = [0, 0, 0];
function flapPose(deg) {
  const T = FLAP_TABLE;
  _fp[0] = _fp[1] = _fp[2] = 0;
  if (deg <= 0) return _fp;
  for (let i = 1; i < T.length; i++) {
    if (deg <= T[i][0]) {
      const t = (deg - T[i - 1][0]) / (T[i][0] - T[i - 1][0]);
      _fp[0] = T[i - 1][1] + (T[i][1] - T[i - 1][1]) * t; _fp[1] = T[i - 1][2] + (T[i][2] - T[i - 1][2]) * t; _fp[2] = T[i - 1][3] + (T[i][3] - T[i - 1][3]) * t;
      return _fp;
    }
  }
  _fp[0] = 1; _fp[1] = 33; _fp[2] = 23;
  return _fp;
}

function pivoted(part, material, opts) {
  const g = part.geo.clone();
  g.translate(-part.pivot.x, -part.pivot.y, -part.pivot.z);
  const grp = new THREE.Group();
  grp.position.copy(part.pivot);
  grp.add(setupMesh(new THREE.Mesh(g, material), opts));
  grp.userData.axis = part.axis.clone();
  grp.userData.base = part.pivot.clone();
  return grp;
}

export function buildOwnAircraft(app) {
  const q = app.quality || { detail: 1 };
  const detail = q.detail ?? 1;
  const M = createMaterials(app, { livery: 'halcyon', detail });
  const root = new THREE.Group();
  root.name = 'ownAircraft';

  // ------------------------------------------------------------------ wings
  const W = buildWingGeometry(detail);
  const EG = buildEngineGeometry(detail);
  const pylonGeo = buildPylonGeometry(detail);
  const MG = buildMainGear(detail);
  const sides = [];
  const sheet = stencilSheet();
  const decalMat = decalMaterial(sheet);
  for (const sgn of [1, -1]) {
    const side = new THREE.Group();
    side.name = sgn > 0 ? 'rightWing' : 'leftWing';
    side.scale.x = sgn;
    side.add(setupMesh(new THREE.Mesh(W.fixed, M.wing)));
    side.add(buildDecals(sheet, sgn, decalMat));
    const P = {
      slats: pivoted(W.slats, M.slat), kruegers: pivoted(W.kruegers, M.wing),
      gsp: pivoted(W.groundSpoilers, M.wing), fsp: pivoted(W.flightSpoilers, M.wing),
      ifl: pivoted(W.inboardFlap.main, M.wing), ofl: pivoted(W.outboardFlap.main, M.wing),
      ail: pivoted(W.aileron, M.wing),
    };
    // aft flaps are children of the main flaps (pivot relative to the main flap pivot)
    for (const [mainKey, fl] of [['ifl', W.inboardFlap], ['ofl', W.outboardFlap]]) {
      const aft = pivoted(fl.aft, M.wing);
      aft.position.sub(fl.main.pivot);
      aft.userData.base = aft.position.clone();
      P[mainKey].add(aft);
      P[mainKey].userData.aft = aft;
      P[mainKey].userData.chord = fl.chord;
    }
    for (const k of Object.keys(P)) side.add(P[k]);

    // engine
    const eng = new THREE.Group();
    eng.name = 'engine';
    eng.position.set(E.x, E.y, E.inletZ);
    const em = engineMaterials(M);
    eng.add(setupMesh(new THREE.Mesh(EG.cowl, M.nacelle)));
    eng.add(setupMesh(new THREE.Mesh(merge([EG.strake]), M.nacelle)));
    eng.add(setupMesh(new THREE.Mesh(EG.lip, M.lip)));
    eng.add(setupMesh(new THREE.Mesh(EG.duct, M.duct), { cast: false }));
    eng.add(setupMesh(new THREE.Mesh(EG.core, M.core)));
    eng.add(setupMesh(new THREE.Mesh(EG.cascade, M.cascade), { cast: false }));
    const sleeve = setupMesh(new THREE.Mesh(EG.sleeve, M.nacelle));
    eng.add(sleeve);
    const fan = new THREE.Group();
    const blades = new THREE.Mesh(EG.blades, em.blades);
    const blurDisc = new THREE.Mesh(EG.blurDisc, em.blur);
    blurDisc.renderOrder = 2;
    const spinner = setupMesh(new THREE.Mesh(EG.spinner, em.spinner), { cast: false });
    fan.add(blades, spinner);
    eng.add(fan, blurDisc);
    side.add(eng);
    side.add(setupMesh(new THREE.Mesh(pylonGeo, M.pylon)));

    // main gear
    const gear = new THREE.Group();
    gear.position.copy(MAIN_PIVOT);
    const upper = new THREE.Group();
    upper.add(setupMesh(new THREE.Mesh(MG.leg, M.gearPaint)));
    const lower = new THREE.Group();
    lower.add(setupMesh(new THREE.Mesh(MG.chrome, M.chrome)), setupMesh(new THREE.Mesh(MG.dark, M.darkMetal)));
    const wheels = [];
    for (let i = 0; i < 2; i++) {
      const wg = new THREE.Group();
      wg.position.copy(MG.wheelCentres[i]);
      const flip = i === 0 ? -1 : 1;     // inner wheel: hubcap side faces inboard -> mirror it
      const inner = new THREE.Group(); inner.scale.x = flip;
      inner.add(setupMesh(new THREE.Mesh(MG.tyre, M.tyre)), setupMesh(new THREE.Mesh(MG.wheel, M.wheel)));
      if (i === 1) inner.add(setupMesh(new THREE.Mesh(MG.hubcap, M.hubcap)));
      wg.add(inner);
      lower.add(wg);
      wheels.push(wg);
    }
    gear.add(upper, lower);
    side.add(gear);

    root.add(side);
    sides.push({ sgn, side, P, eng, sleeve, fan, blades, blurDisc, em, gear, lower, wheels, fanAngle: Math.random() * 6 });
  }

  // ------------------------------------------------------------------ fuselage & tail
  const fusDetail = detail >= 2 ? { rows: 300, segs: 144 } : detail >= 1 ? { rows: 220, segs: 112 } : { rows: 150, segs: 80 };
  const FU = buildFuselage({ ...fusDetail });
  const fuselage = new THREE.Group(); fuselage.name = 'fuselage';
  const upperMesh = setupMesh(new THREE.Mesh(FU.upper, M.livery));
  const bellyMesh = setupMesh(new THREE.Mesh(FU.belly, M.livery));
  fuselage.add(upperMesh);
  root.add(bellyMesh);
  // nose / tail caps
  const sh = FU.shape;
  {
    const o = {};
    const ring = (z, n = 48) => { const s = sh.sec(z); const pts = []; for (let j = 0; j <= n; j++) { sectionPoint(s, (j / n) * Math.PI * 2, o); pts.push(new THREE.Vector3(o.x, o.y, z)); } return pts; };
    // APU exhaust: short dark tube at the tail cone
    const zt = sh.z1;
    const rr = ring(zt - 0.002, 32);
    const tube = gridGeometry(2, rr.length, (i, j, p, uv) => { const c = rr[j]; const k = i ? 0.75 : 1; const cy = 1.42; p.x = c.x * k; p.y = cy + (c.y - cy) * k; p.z = zt - i * 0.25; uv.u = 0; uv.v = 0; });
    const apu = new THREE.Mesh(merge([tube, new THREE.CircleGeometry(0.12, 16).translate(0, 1.42, zt - 0.25)]), M.apu);
    fuselage.add(apu);
  }
  const FIN = buildFin({ rowsN: detail >= 1 ? 40 : 24, colsN: detail >= 1 ? 26 : 16 });
  fuselage.add(setupMesh(new THREE.Mesh(FIN.fin, M.livery)));
  const rudderPivot = new THREE.Group(); rudderPivot.position.copy(FIN.hinge);
  const rg = FIN.rudder.clone(); rg.translate(-FIN.hinge.x, -FIN.hinge.y, -FIN.hinge.z);
  rudderPivot.add(setupMesh(new THREE.Mesh(rg, M.livery)));
  fuselage.add(rudderPivot);
  const ant = new THREE.Mesh(buildAntennas(), M.antenna);
  fuselage.add(ant);
  root.add(fuselage);
  // horizontal stabilisers (always visible – they can be glimpsed from the last rows)
  const HS = buildHStab({ rows: detail >= 1 ? 18 : 12 });
  const stabs = [];
  for (const sgn of [1, -1]) {
    const g = new THREE.Group(); g.scale.x = sgn;
    g.add(setupMesh(new THREE.Mesh(HS.stab, M.wing)));
    const ep = new THREE.Group(); ep.position.copy(HS.hinge);
    const eg = HS.elevator.clone(); eg.translate(-HS.hinge.x, -HS.hinge.y, -HS.hinge.z);
    ep.add(setupMesh(new THREE.Mesh(eg, M.wing)));
    g.add(ep);
    root.add(g);
    stabs.push({ g, ep });
  }

  // ------------------------------------------------------------------ nose gear + doors
  const NG = buildNoseGear(detail);
  const nose = new THREE.Group(); nose.name = 'noseGear';
  nose.position.copy(NOSE_PIVOT);
  const nUpper = new THREE.Group();
  nUpper.add(setupMesh(new THREE.Mesh(NG.leg, M.gearPaint)));
  const nLower = new THREE.Group();
  nLower.add(setupMesh(new THREE.Mesh(NG.chrome, M.chrome)), setupMesh(new THREE.Mesh(NG.dark, M.darkMetal)));
  const steer = new THREE.Group();
  steer.position.copy(NG.axle);
  const nWheels = [];
  for (let i = 0; i < 2; i++) {
    const wg = new THREE.Group();
    wg.position.copy(NG.wheelCentres[i]).sub(NG.axle);
    const inner = new THREE.Group(); inner.scale.x = i === 0 ? -1 : 1;
    inner.add(setupMesh(new THREE.Mesh(NG.tyre, M.tyre)), setupMesh(new THREE.Mesh(NG.wheel, M.wheel)));
    wg.add(inner);
    steer.add(wg);
    nWheels.push(wg);
  }
  nLower.add(steer);
  nose.add(nUpper, nLower);
  fuselage.add(nose);
  // nose doors: patches of the fuselage surface (same UVs) hinged at the well edges
  const doors = [];
  {
    const zA = -17.25, zB = -15.25;
    for (const sgn of [1, -1]) {
      const ph0 = Math.PI - 0.02 * sgn, ph1 = Math.PI - 0.2 * sgn;
      const o = {};
      const g = gridGeometry(10, 5, (i, j, p, uv) => {
        const z = zA + (zB - zA) * i / 9;
        const s = sh.sec(z);
        const ph = ph0 + (ph1 - ph0) * j / 4;
        sectionPoint(s, ph, o);
        p.x = o.x * 1.01; p.y = o.y - 0.004; p.z = z;
        uv.u = (z - Z0) / (Z1 - Z0); uv.v = 1 - (ph / (Math.PI * 2)) * FUS_V;
      });
      orient(g, [0, -1, 0]);
      const s0 = sh.sec((zA + zB) / 2); sectionPoint(s0, ph1, o);
      const hinge = new THREE.Vector3(o.x, o.y, zA);
      g.translate(-hinge.x, -hinge.y, -hinge.z);
      const dg = new THREE.Group(); dg.position.copy(hinge);
      dg.add(setupMesh(new THREE.Mesh(g, M.livery)));
      dg.userData.sgn = sgn;
      fuselage.add(dg);
      doors.push(dg);
    }
  }

  // ------------------------------------------------------------------ lights
  const A = wingAnchors();
  const navL = new THREE.Vector3(-A.navPos.x - 0.02, A.navPos.y, A.navPos.z - 0.03);
  const navR = navL.clone(); navR.x *= -1;
  const aftL = new THREE.Vector3(-A.aftPos.x, A.aftPos.y, A.aftPos.z + 0.05), aftR = aftL.clone(); aftR.x *= -1;
  const llL = new THREE.Vector3(-A.landingPos.x, A.landingPos.y, A.landingPos.z - 0.05), llR = llL.clone(); llR.x *= -1;
  const toL = llL.clone().add(new THREE.Vector3(0.35, 0.02, 0.1)), toR = toL.clone(); toR.x *= -1;
  const logoL = HS.logoLightPos.clone(); logoL.x *= -1;
  const logoR = HS.logoLightPos.clone();
  const wiL = new THREE.Vector3(-1.86, 0.32, -3.6), wiR = wiL.clone(); wiR.x *= -1;
  const fwd = (deg, side) => new THREE.Vector3(Math.sin(deg * DEG) * side, 0, -Math.cos(deg * DEG));
  const LIGHTS = [
    { id: 'navL', pos: navL, color: 0xff1a12, size: 0.9, min: 2.2, dir: fwd(55, -1), cone: 62 },
    { id: 'navR', pos: navR, color: 0x18ff4a, size: 0.9, min: 2.2, dir: fwd(55, 1), cone: 62 },
    { id: 'strobeL', pos: navL.clone().add(new THREE.Vector3(-0.04, 0.02, 0.12)), color: 0xf2f6ff, size: 1.8, min: 3 },
    { id: 'strobeR', pos: navR.clone().add(new THREE.Vector3(0.04, 0.02, 0.12)), color: 0xf2f6ff, size: 1.8, min: 3 },
    { id: 'aftL', pos: aftL, color: 0xfff6e8, size: 0.7, min: 2, dir: new THREE.Vector3(0, 0, 1), cone: 70 },
    { id: 'aftR', pos: aftR, color: 0xfff6e8, size: 0.7, min: 2, dir: new THREE.Vector3(0, 0, 1), cone: 70 },
    { id: 'tail', pos: new THREE.Vector3(0, 1.43, AIRCRAFT.tailZ - 0.25), color: 0xfff6e8, size: 0.6, min: 2, dir: new THREE.Vector3(0, 0, 1), cone: 70 },
    { id: 'beaconTop', pos: new THREE.Vector3(0, 2.5, 3.2), color: 0xff2008, size: 1.1, min: 2.4, dir: new THREE.Vector3(0, 1, 0), cone: 100 },
    { id: 'beaconBot', pos: new THREE.Vector3(0, -1.66, -1.2), color: 0xff2008, size: 1.1, min: 2.4, dir: new THREE.Vector3(0, -1, 0), cone: 100 },
    { id: 'landL', pos: llL, color: 0xfff1dc, size: 1.6, min: 3, dir: new THREE.Vector3(0, -0.06, -1), cone: 20, pull: 0.15 },
    { id: 'landR', pos: llR, color: 0xfff1dc, size: 1.6, min: 3, dir: new THREE.Vector3(0, -0.06, -1), cone: 20, pull: 0.15 },
    { id: 'turnL', pos: toL, color: 0xfff1dc, size: 1.1, min: 2.5, dir: new THREE.Vector3(-0.42, -0.05, -1), cone: 26 },
    { id: 'turnR', pos: toR, color: 0xfff1dc, size: 1.1, min: 2.5, dir: new THREE.Vector3(0.42, -0.05, -1), cone: 26 },
    { id: 'taxi', pos: new THREE.Vector3(0, -1.8, -15.9), color: 0xfff1dc, size: 1.0, min: 2.5, dir: new THREE.Vector3(0, -0.12, -1), cone: 28 },
    { id: 'logoL', pos: logoL, color: 0xfff1dc, size: 0.35, min: 1.5, dir: new THREE.Vector3(0.35, 1, 0.1), cone: 60 },
    { id: 'logoR', pos: logoR, color: 0xfff1dc, size: 0.35, min: 1.5, dir: new THREE.Vector3(-0.35, 1, 0.1), cone: 60 },
    { id: 'wingL', pos: wiL, color: 0xfff1dc, size: 0.35, min: 1.5, dir: new THREE.Vector3(-0.8, -0.35, 0.5), cone: 40 },
    { id: 'wingR', pos: wiR, color: 0xfff1dc, size: 0.35, min: 1.5, dir: new THREE.Vector3(0.8, -0.35, 0.5), cone: 40 },
  ];
  const LI = Object.fromEntries(LIGHTS.map((l, i) => [l.id, i]));
  const glows = new GlowSet(LIGHTS, { flex: true, shared: SHARED });
  root.add(glows.mesh);
  const taxiBase = LIGHTS[LI.taxi].pos.clone();

  // local (shader) lights
  const FL = SHARED;
  const flPos = FL.uFLPos.value, flCol = FL.uFLCol.value, flDir = FL.uFLDir.value;
  flPos[0].copy(navL).add(new THREE.Vector3(-0.05, 0.08, -0.12)); flPos[1].copy(navR).add(new THREE.Vector3(0.05, 0.08, -0.12));
  flPos[2].copy(wiL); flDir[2].set(-0.8, -0.38, 0.48, Math.cos(24 * DEG));
  flPos[3].copy(wiR); flDir[3].set(0.8, -0.38, 0.48, Math.cos(24 * DEG));
  flPos[4].copy(logoL); flDir[4].set(0.45, 1, 0.15, Math.cos(40 * DEG));
  flPos[5].copy(logoR); flDir[5].set(-0.45, 1, 0.15, Math.cos(40 * DEG));
  flPos[6].set(0, 2.62, 3.2); flPos[7].set(0, -1.8, -1.2);
  for (const d of flDir) { const l = Math.hypot(d.x, d.y, d.z) || 1; d.x /= l; d.y /= l; d.z /= l; }
  const navTipBase = [flPos[0].clone(), flPos[1].clone()];

  // real spot light for the ground (landing / taxi) – one light, always present
  const spot = new THREE.SpotLight(0xfff1dc, 0, 900, 14 * DEG, 0.45, 2);
  spot.position.set(0, -1.25, -3.0);
  spot.target.position.set(0, -2.62, -120);
  spot.castShadow = false;
  root.add(spot, spot.target);

  // landing light beams (visible in haze / cloud at night)
  const beams = beamCones([
    { pos: llL, dir: new THREE.Vector3(0.02, -0.07, -1), length: 70, radius: 9 },
    { pos: llR, dir: new THREE.Vector3(-0.02, -0.07, -1), length: 70, radius: 9 },
  ]);
  root.add(beams.mesh);

  // contrails
  const contrails = new Contrails(app);

  // ------------------------------------------------------------------ visibility
  // the upper fuselage is still rendered into the outside shadow map in first person
  // (layer 1 on the sun's shadow camera) so the aircraft keeps its full shadow.
  const SHADOW_LAYER = 5;
  try { app.lights?.sunOutside?.shadow?.camera?.layers?.enable(SHADOW_LAYER); } catch { /* */ }
  let fuselageVisible = false;
  const fpHidden = [fuselage];
  function setFuselageVisible(v) {
    fuselageVisible = !!v;
    for (const o of fpHidden) {
      o.traverse((c) => {
        if (!c.isMesh) return;
        if (fuselageVisible) c.layers.set(0); else c.layers.set(SHADOW_LAYER);
        if (fuselageVisible) c.layers.enable(SHADOW_LAYER);
      });
    }
  }
  setFuselageVisible(false);

  // ------------------------------------------------------------------ animation state
  const S = {
    flex: -0.12, flexV: 0, flapT: 0, flapMain: 0, flapAft: 0, slat: 0, krueger: 0,
    gsp: 0, fsp: [0, 0], ail: 0, gear: 1, strut: 0, wheelA: 0, nWheelA: 0, rud: 0, elev: 0,
    strobePrev: 0, t: 0, n1: [0, 0],
  };
  const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _sun = new THREE.Vector3();
  const N1_RPM = 5380;

  function update(dt) {
    const st = app.flight?.state;
    if (!st) return;
    S.t += dt;
    const t = S.t;
    const onGround = st.onGround !== false;

    // --- wing flex (2nd order, ~1.3 Hz first bending) ---------------------------------
    const ias = st.airspeed || 0;
    const lift = onGround ? Math.pow(clamp01((ias - 25) / 52), 2) : 1;
    const gY = st.gForce ? st.gForce.y : 1;
    const turb = (st.turbulence || 0) * (Math.sin(t * 7.1) * 0.5 + Math.sin(t * 11.3 + 1) * 0.3 + Math.sin(t * 3.7) * 0.2) * 0.12;
    const target = -0.12 + lift * (0.58 * gY - 0.02) + turb;
    const w = 2 * Math.PI * 1.25, z = 0.12;
    const sub = Math.max(1, Math.ceil(dt / 0.01));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      const acc = -w * w * (S.flex - target) - 2 * z * w * S.flexV;
      S.flexV += acc * h; S.flex += S.flexV * h;
    }
    SHARED.uFlex.value = S.flex;
    SHARED.uFlexRoll.value = THREE.MathUtils.clamp((st.angularVelocity ? st.angularVelocity.z : 0) * -0.25, -0.08, 0.08);

    // --- high-lift devices ---------------------------------------------------------------
    const fd = st.flapsDeg || 0;
    const fp = flapPose(fd);
    const ft = fp[0], fm = fp[1], fa = fp[2];
    S.flapT = ft; S.flapMain = fm; S.flapAft = fa;
    const slatsTarget = st.slats ?? (fd > 0.3 ? (fd >= 29 ? 1 : 0.6) : 0);
    S.slat = damp(S.slat, slatsTarget, 6, dt);
    S.krueger = damp(S.krueger, slatsTarget > 0.05 ? 1 : 0, 3.5, dt);
    // spoilers
    const sp = clamp01(st.spoilers || 0);
    S.gsp = damp(S.gsp, onGround ? sp : 0, 5, dt);
    const ail = THREE.MathUtils.clamp(st.aileron || 0, -1, 1);
    S.ail = damp(S.ail, ail, 10, dt);
    S.rud = damp(S.rud, THREE.MathUtils.clamp(st.rudder || 0, -1, 1), 6, dt);
    S.elev = damp(S.elev, THREE.MathUtils.clamp(st.elevator || 0, -1, 1), 6, dt);

    for (const sd of sides) {
      const P = sd.P;
      // right wing: aileron up = +ail; left: -ail
      const up = sd.sgn > 0 ? S.ail : -S.ail;
      // slats: rotate about the arc-track axis (negative = forward/down)
      P.slats.quaternion.setFromAxisAngle(P.slats.userData.axis, -S.slat * 22 * DEG);
      P.kruegers.quaternion.setFromAxisAngle(P.kruegers.userData.axis, smooth(S.krueger) * 118 * DEG);
      // flaps: Fowler travel (aft + down) then rotation about the flap LE line
      for (const k of ['ifl', 'ofl']) {
        const g = P[k];
        const c = g.userData.chord;
        g.position.copy(g.userData.base);
        g.position.z += ft * 0.5 * c;
        g.position.y -= ft * 0.16 * c + Math.sin(fm * DEG) * 0.05 * c;
        g.quaternion.setFromAxisAngle(g.userData.axis, fm * DEG);
        const aft = g.userData.aft;
        aft.position.copy(aft.userData.base);
        aft.position.z += smooth(fa / 17) * 0.06 * c;
        aft.position.y -= smooth(fa / 17) * 0.02 * c;
        aft.quaternion.setFromAxisAngle(aft.userData.axis, fa * DEG);
      }
      // spoilers: flight spoilers = speedbrake + roll assist on the up-aileron wing
      const rollAssist = clamp01((up - 0.12) / 0.88) * 0.55;
      const fspT = Math.max(sp * (onGround ? 1 : 0.62), rollAssist);
      sd.fspV = damp(sd.fspV ?? 0, fspT, 6, dt);
      P.fsp.quaternion.setFromAxisAngle(P.fsp.userData.axis, -sd.fspV * 52 * DEG);
      P.gsp.quaternion.setFromAxisAngle(P.gsp.userData.axis, -S.gsp * 58 * DEG);
      P.ail.quaternion.setFromAxisAngle(P.ail.userData.axis, -up * 18 * DEG);

      // engine
      const e = st.engines?.[sd.sgn > 0 ? 1 : 0] || { n1: 0 };
      const n1 = Math.max(0, e.n1 || 0);
      const omega = n1 / 100 * N1_RPM / 60 * Math.PI * 2;
      sd.fanAngle = (sd.fanAngle + omega * dt) % (Math.PI * 2);
      const smearTurns = omega / (60 * Math.PI * 2);          // ~1/60 s exposure
      const pitchSmear = omega * 24 / (60 * Math.PI * 2);
      const blur = smooth((pitchSmear - 0.35) / 0.9);
      sd.fan.rotation.z = -sd.fanAngle;
      sd.em.blades.opacity = 1 - 0.93 * blur;
      sd.em.blades.transparent = blur > 0.01;
      sd.em.blades.depthWrite = blur < 0.5;
      sd.blurDisc.visible = blur > 0.01;
      sd.em.blur.opacity = 0.92 * blur;
      sd.blurDisc.rotation.z = -sd.fanAngle * 0.013;
      sd.em.smear.value = Math.min(1, smearTurns);
      const rev = smooth(st.reverser || 0);
      sd.sleeve.position.z = rev * REVERSER_TRAVEL;

      // main gear: retraction inboard (-90°), strut extension in the air, wheel spin
      const g = clamp01(st.gear ?? 1);
      const ang = -90 * DEG * (1 - smoothGear(g));
      sd.gear.rotation.z = ang;
      sd.lower.position.copy(MG.up).multiplyScalar(-S.strut);
      for (const wg of sd.wheels) wg.rotation.x = S.wheelA;
    }
    // gear common
    const g = clamp01(st.gear ?? 1);
    S.strut = damp(S.strut, onGround ? 0 : 0.13, onGround ? 12 : 3, dt);
    S.wheelA -= (st.wheelRpm || 0) / 60 * Math.PI * 2 * dt;
    S.nWheelA -= (st.wheelRpm || 0) / 60 * Math.PI * 2 * dt * (0.565 / 0.343);
    nose.rotation.x = 90 * DEG * (1 - smoothGear(g));
    nLower.position.copy(NG.up).multiplyScalar(-S.strut * 0.8);
    steer.setRotationFromAxisAngle(NG.up, THREE.MathUtils.clamp(st.nosewheelSteer || 0, -1.3, 1.3));
    for (const wg of nWheels) wg.rotation.x = S.nWheelA;
    const doorsOpen = smooth(st.gearDoorsOpen ?? (g > 0.01 ? 1 : 0));
    for (const d of doors) d.rotation.z = d.userData.sgn * doorsOpen * 82 * DEG;
    // tail surfaces
    rudderPivot.setRotationFromAxisAngle(FIN.axis, -S.rud * 22 * DEG);
    for (const s of stabs) s.ep.setRotationFromAxisAngle(HS.axis, -S.elev * 18 * DEG);

    // --- lights ----------------------------------------------------------------------------
    const L = st.lights || {};
    const sunY = app.sun?.direction ? app.sun.direction.y : 1;
    const dark = 1 - smooth((sunY + 0.06) / 0.2);
    // strobe: flash events inside the last frame interval (never missed at low fps)
    const sFlash = L.strobe ? (window.__extStrobeHold ? 1 : strobeWindow(t - dt, t, 1.2, 0)) : 0;
    const bcn = L.beacon ? (window.__extStrobeHold ? 1 : beacon(t, 1.0)) : 0;
    const bcn2 = L.beacon ? (window.__extStrobeHold ? 1 : beacon(t, 1.0, 0.5)) : 0;
    const nav = L.nav !== false ? 1 : 0;
    const gearDown = smoothGear(g);
    glows.set(LI.navL, nav * 45); glows.set(LI.navR, nav * 45);
    glows.set(LI.aftL, nav * 30); glows.set(LI.aftR, nav * 30); glows.set(LI.tail, nav * 30);
    glows.set(LI.strobeL, sFlash * 900); glows.set(LI.strobeR, sFlash * 900);
    glows.set(LI.beaconTop, bcn * 160); glows.set(LI.beaconBot, bcn2 * 160);
    glows.set(LI.landL, L.landing ? 600 : 0); glows.set(LI.landR, L.landing ? 600 : 0);
    glows.set(LI.turnL, L.runwayTurnoff ? 300 : 0); glows.set(LI.turnR, L.runwayTurnoff ? 300 : 0);
    glows.set(LI.taxi, L.taxi && gearDown > 0.95 ? 320 : 0);
    glows.set(LI.logoL, L.logo ? 40 : 0); glows.set(LI.logoR, L.logo ? 40 : 0);
    glows.set(LI.wingL, L.wing ? 40 : 0); glows.set(LI.wingR, L.wing ? 40 : 0);
    glows.commit();
    // local lights on our own skin
    const tipFlash = sFlash * 220;
    flCol[0].set(nav * 2.5 + tipFlash, tipFlash, tipFlash);
    flCol[1].set(tipFlash, nav * 2.5 + tipFlash, tipFlash);
    const wl = L.wing ? 16 : 0;
    flCol[2].set(wl, wl * 0.95, wl * 0.86); flCol[3].copy(flCol[2]);
    const lg = L.logo ? 22 : 0;
    flCol[4].set(lg, lg * 0.95, lg * 0.86); flCol[5].copy(flCol[4]);
    flCol[6].set(bcn * 3, bcn * 0.25, 0); flCol[7].set(bcn2 * 3, bcn2 * 0.25, 0);
    // tip lights follow the flex
    const fl = S.flex * Math.pow(Math.min(1.25, (Math.abs(navL.x) - 1.9) / 15.25), 2);
    flPos[0].y = navTipBase[0].y + fl; flPos[1].y = navTipBase[1].y + fl;
    // ground spot light (only meaningful when dark)
    const landing = L.landing ? 1 : 0, taxi = L.taxi && gearDown > 0.95 ? 1 : 0;
    const agl = st.altitudeAGL ?? 0;
    const low = 1 - smooth((agl - 300) / 600);
    spot.intensity = dark * low * (landing * 9000 + taxi * 2500);
    spot.angle = landing ? 13 * DEG : 22 * DEG;
    const haze = 0.05 + 0.9 * (st.inCloud || 0);
    beams.uniforms.uIntensity.value = landing * Math.max(dark, (st.inCloud || 0) * 0.5) * haze * 0.6;
    beams.mesh.visible = beams.uniforms.uIntensity.value > 0.002;

    contrails.update(dt, st);
  }
  function smoothGear(g) { return g * g * (3 - 2 * g); }

  // view mode coupling
  app.events?.on?.('view:mode', (e) => setFuselageVisible(e && e.mode === 'cinematic'));

  return {
    root, update, setFuselageVisible, get fuselageVisible() { return fuselageVisible; },
    parts: { sides, fuselage, nose, doors, stabs, glows, spot, contrails, materials: M, rudder: rudderPivot, belly: bellyMesh },
    materials: M,
  };
}

/** 1 if a strobe flash started within (t0, t1]; also lights for 1 frame minimum. */
const FLASHES = [0.03, 0.17];
function strobeWindow(t0, t1, period, offset) {
  let best = 0;
  for (const f of FLASHES) {
    // most recent flash time <= t1
    const k = Math.floor((t1 - f - offset) / period);
    const tf = k * period + f + offset;
    if (tf > t0 - 0.03 && tf <= t1) best = Math.max(best, f === 0.03 ? 1 : 0.85);
  }
  return best;
}
