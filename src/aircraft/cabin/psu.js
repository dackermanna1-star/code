// Passenger service units (one per row and side, under the bins): reading
// lights (emissive lens + pooled real SpotLight), gasper air vents, attendant
// call button + amber call light, lit 'fasten seatbelt' / 'no smoking' signs,
// oxygen mask door, speaker grille (texture). All instanced.
import * as THREE from 'three';
import { ROWS, SEAT_LIST, SEAT } from '../../core/constants.js';
import { clamp, damp } from '../../core/util.js';
import { GeoBuilder, roundedBoxGeometry } from './geom.js';
import { PSU_LAYOUT as L } from './textures.js';
import { PROF } from './profile.js';

const PSU_X = (PROF.psuX0 + 1.33) / 2;     // centre of the PSU channel (b = 0)
const PSU_FACE_Y = PROF.psuY - 0.022;      // visible lower face
const LENS_ON = new THREE.Color(7.5, 6.3, 4.6);
const CALL_ON = new THREE.Color(5.0, 2.4, 0.35);
const CALLBTN_ON = new THREE.Color(0.9, 0.75, 0.4);
const OFF = new THREE.Color(0, 0, 0);

/** MeshStandardMaterial whose instanceColor is used as EMISSIVE (diffuse stays the base colour). */
function emissiveInstanced(color, roughness = 0.35) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, envMapIntensity: 0.6 });
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance += vColor;\n#endif');
  };
  m.customProgramCacheKey = () => 'cabinEmInst';
  return m;
}

function withBake(g, b = [0.12, 0.2, 0.9, 0]) {
  const n = g.attributes.position.count, arr = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) arr.set(b, i * 4);
  g.setAttribute('bake', new THREE.BufferAttribute(arr, 4));
  return g;
}

function psuBaseGeometry(variant) {
  const g = roundedBoxGeometry(L.wid, 0.022, L.len, 0.006, 2);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const v0 = variant === 'economy' ? 1 : 0.5;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    if (n.getY(i) < -0.5) uv.setXY(i, (z + L.len / 2) / L.len, v0 - 0.5 * (x + L.wid / 2) / L.wid);
    else uv.setXY(i, 0.02, v0 - 0.01);
  }
  return withBake(g, [0.1, 0.22, 0.92, 0]);
}

export function createPSUs(app, M, tex, root, lighting) {
  const group = new THREE.Group();
  group.name = 'cabin-psus';
  root.add(group);

  // ---- layout ---------------------------------------------------------------------------
  const units = [];
  for (const r of ROWS) {
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? -1 : 1;
      const letters = r.letters.filter((Lt) => Math.sign(r.x[Lt]) === s);
      // aisle -> window order
      letters.sort((a, b) => Math.abs(r.x[a]) - Math.abs(r.x[b]));
      const cfg = r.cls === 'business' ? L.business : L.economy;
      units.push({ row: r.row, cls: r.cls, side, s, z: r.z - (r.cls === 'business' ? 0.12 : 0.07), seats: letters.map((Lt) => `${r.row}${Lt}`), cfg, call: false, callLevel: 0 });
    }
  }
  const unitM = new THREE.Matrix4(), tmpM = new THREE.Matrix4(), rotY = new THREE.Matrix4().makeRotationY(Math.PI);
  const unitMatrix = (u, target) => {
    target.makeTranslation(PSU_X, PSU_FACE_Y + 0.011, 0);
    if (u.s < 0) target.premultiply(rotY);
    return target.premultiply(tmpM.makeTranslation(0, 0, u.z));
  };
  /** PSU-local (a along z, b across, dy below the face) -> world position */
  const localToWorld = (u, a, b, dy, out) => out.set(u.s * (PSU_X + b), PSU_FACE_Y - dy, u.z + u.s * a);

  // ---- base panels ----------------------------------------------------------------------
  const econ = units.filter((u) => u.cls === 'economy'), bus = units.filter((u) => u.cls === 'business');
  const bases = [];
  for (const [list, variant] of [[econ, 'economy'], [bus, 'business']]) {
    const im = new THREE.InstancedMesh(psuBaseGeometry(variant), M.psu, list.length);
    im.name = 'cabin-psu-' + variant;
    im.receiveShadow = true; im.castShadow = true;
    list.forEach((u, i) => im.setMatrixAt(i, unitMatrix(u, unitM)));
    group.add(im); bases.push(im);
  }

  // ---- per-seat parts ------------------------------------------------------------------------
  const seats = [];       // { seatId, unit, idx, lensPos, gasperPos, light, gasper, gasperAnim }
  for (const u of units) u.seats.forEach((id, k) => seats.push({ seatId: id, unit: u, k, light: false, gasper: 0.0, gasperTarget: 0, gAnim: 1 }));
  // initial gasper states: most closed, some open (left by previous passengers)
  seats.forEach((st, i) => { const r = ((i * 2654435761) >>> 0) / 4294967296; st.gasper = st.gasperTarget = r < 0.3 ? 1 : 0; });

  const lensGeo = withBake(new THREE.CylinderGeometry(0.0235, 0.0245, 0.004, 16, 1), [0.1, 0.1, 1, 0]);
  const lensMat = emissiveInstanced(new THREE.Color('#d9dcdf'), 0.25);
  const lenses = new THREE.InstancedMesh(lensGeo, lensMat, seats.length);
  lenses.name = 'cabin-psu-lenses';
  const btnGeo = withBake(new THREE.BoxGeometry(0.024, 0.006, 0.024), [0.1, 0.15, 0.9, 0]);
  const buttons = new THREE.InstancedMesh(btnGeo, M.greyPlastic, seats.length);
  buttons.name = 'cabin-psu-buttons';
  // gasper: bezel ring (static) + nozzle (twists)
  const ringGeo = withBake(new THREE.TorusGeometry(0.024, 0.005, 4, 16).rotateX(Math.PI / 2), [0.1, 0.12, 0.85, 0]);
  const rings = new THREE.InstancedMesh(ringGeo, M.chrome, seats.length);
  rings.name = 'cabin-psu-gasper-rings';
  const nozB = new GeoBuilder('nozzle');
  nozB.addGeometry(new THREE.SphereGeometry(0.019, 12, 4, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), null, [0.1, 0.12, 0.85, 0]);
  nozB.addGeometry(new THREE.CylinderGeometry(0.0085, 0.0085, 0.012, 10, 1, true), new THREE.Matrix4().makeTranslation(0, -0.018, 0), [0.1, 0.1, 0.8, 0]);
  nozB.addGeometry(new THREE.CircleGeometry(0.0062, 10).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(0, -0.0241, 0), [0.0, 0.0, 0.08, 0]);
  // grip ribs on the nozzle collar
  for (let i = 0; i < 0; i++) {
    const a = (i / 6) * Math.PI * 2;
    nozB.addGeometry(new THREE.BoxGeometry(0.003, 0.006, 0.004), new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeTranslation(0.0175, -0.004, 0)), [0.1, 0.12, 0.8, 0]);
  }
  const nozzles = new THREE.InstancedMesh(nozB.build(), M.darkPlastic, seats.length);
  nozzles.name = 'cabin-psu-gaspers';

  // per-unit parts: call button + call light, signs
  const callBtnGeo = withBake(new THREE.CylinderGeometry(0.0145, 0.0155, 0.006, 20), [0.1, 0.15, 0.9, 0]);
  const callBtnMat = emissiveInstanced(new THREE.Color('#b9bdc2'), 0.4);
  const callBtns = new THREE.InstancedMesh(callBtnGeo, callBtnMat, units.length);
  callBtns.name = 'cabin-psu-callbuttons';
  const callLightGeo = withBake(new THREE.CylinderGeometry(0.011, 0.012, 0.004, 16), [0.1, 0.1, 1, 0]);
  const callLightMat = emissiveInstanced(new THREE.Color('#d8c9a8'), 0.3);
  const callLights = new THREE.InstancedMesh(callLightGeo, callLightMat, units.length);
  callLights.name = 'cabin-psu-calllights';
  const signW = (L.sign.a1 - L.sign.a0) / 2 - 0.004, signH = L.sign.b1 - L.sign.b0;
  const signGeo = new THREE.PlaneGeometry(signW, signH).rotateX(Math.PI / 2).rotateY(Math.PI);   // faces down, image-up = forward
  const signsBelt = new THREE.InstancedMesh(signGeo, M.signBelt, units.length);
  const signsSmoke = new THREE.InstancedMesh(signGeo, M.signSmoke, units.length);
  signsBelt.name = 'cabin-psu-sign-belt'; signsSmoke.name = 'cabin-psu-sign-smoke';
  for (const m of [lenses, buttons, rings, nozzles, callBtns, callLights, signsBelt, signsSmoke]) { m.frustumCulled = true; m.receiveShadow = m.material !== M.signBelt && m.material !== M.signSmoke; group.add(m); }

  const v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
  const place = (im, i, pos, rotYaw = 0, scale = 1) => { q.setFromEuler(e.set(0, rotYaw, 0)); sc.setScalar(scale); im.setMatrixAt(i, unitM.compose(pos, q, sc)); };
  seats.forEach((st, i) => {
    const u = st.unit, a = u.cfg.lights[st.k], ga = u.cfg.gaspers[st.k];
    st.lensPos = localToWorld(u, a, L.lensB, 0.0015, new THREE.Vector3());
    st.buttonPos = localToWorld(u, a, L.buttonB, 0.002, new THREE.Vector3());
    st.gasperPos = localToWorld(u, ga, L.gasperB, 0.0, new THREE.Vector3());
    place(lenses, i, st.lensPos);
    place(buttons, i, st.buttonPos);
    place(rings, i, localToWorld(u, ga, L.gasperB, 0.001, v));
    writeNozzle(i);
    lenses.setColorAt(i, OFF);
    // seat aim point for the reading spot
    const sd = SEAT_LIST.find((x) => x.id === st.seatId);
    st.seat = sd;
    st.aim = new THREE.Vector3(sd ? sd.x : u.s * 1.0, (sd?.cls === 'business' ? SEAT.business.cushionY : SEAT.economy.cushionY) + 0.05, (sd ? sd.z : u.z) + 0.02);
  });
  units.forEach((u, i) => {
    u.callPos = localToWorld(u, L.callA, L.callB, 0.002, new THREE.Vector3());
    u.callLightPos = localToWorld(u, L.callLightA, L.callLightB, 0.0015, new THREE.Vector3());
    place(callBtns, i, u.callPos);
    place(callLights, i, u.callLightPos);
    callBtns.setColorAt(i, OFF); callLights.setColorAt(i, OFF);
    // signs: same orientation on both sides so the pictograms read for passengers facing forward
    const sa = (L.sign.a0 + L.sign.a1) / 2, sb = (L.sign.b0 + L.sign.b1) / 2;
    const c = localToWorld(u, sa, sb, 0.0012, v);
    const da = (signW / 2 + 0.002) * u.s;
    // belt sign forward of the no-smoking sign (seen from behind: belt left on both sides)
    signsBelt.setMatrixAt(i, unitM.compose(new THREE.Vector3(c.x, c.y, c.z - da * u.s * (u.s > 0 ? 1 : 1)), q.identity(), sc.setScalar(1)));
    signsSmoke.setMatrixAt(i, unitM.compose(new THREE.Vector3(c.x, c.y, c.z + da * u.s * (u.s > 0 ? 1 : 1)), q.identity(), sc));
  });
  for (const m of [lenses, buttons, rings, nozzles, callBtns, callLights, signsBelt, signsSmoke]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); }

  function writeNozzle(i) {
    const st = seats[i];
    const t = st.gasper;
    v.copy(st.gasperPos); v.y -= 0.004 + t * 0.003;
    q.setFromEuler(e.set(0, t * 2.1 + i * 0.7, 0));
    nozzles.setMatrixAt(i, unitM.compose(v, q, sc.setScalar(1)));
    nozzles.instanceMatrix.needsUpdate = true;
  }

  // ---- pick proxies -------------------------------------------------------------------------
  const nProx = seats.length * 2 + units.length;
  const proxGeo = new THREE.BoxGeometry(1, 1, 1);
  const proxies = new THREE.InstancedMesh(proxGeo, new THREE.MeshBasicMaterial({ visible: false }), nProx);
  proxies.name = 'cabin-psu-proxies';
  group.add(proxies);
  let pi = 0;
  const proxyInfo = [];
  const setProxy = (center, sx, sy, sz, info) => {
    proxies.setMatrixAt(pi, unitM.compose(center, q.identity(), sc.set(sx, sy, sz)));
    proxyInfo.push(info);
    return pi++;
  };
  seats.forEach((st) => {
    const c = st.lensPos.clone().lerp(st.buttonPos, 0.5); c.y -= 0.008;
    setProxy(c, 0.085, 0.03, 0.058, { kind: 'light', st });
    setProxy(st.gasperPos.clone().setY(st.gasperPos.y - 0.012), 0.062, 0.035, 0.058, { kind: 'gasper', st });
  });
  units.forEach((u) => setProxy(u.callPos.clone().lerp(u.callLightPos, 0.5).setY(u.callPos.y - 0.008), 0.08, 0.03, 0.05, { kind: 'call', u }));
  proxies.instanceMatrix.needsUpdate = true;
  proxies.computeBoundingSphere();

  // ---- behaviour ------------------------------------------------------------------------------
  const bySeat = new Map(seats.map((st, i) => { st.index = i; return [st.seatId, st]; }));
  const unitIndex = new Map(units.map((u, i) => [u, i]));
  const tmpC = new THREE.Color();

  function setReadingLight(seatId, on, { sound = true } = {}) {
    const st = bySeat.get(seatId);
    if (!st) return false;
    on = !!on;
    if (st.light === on) return true;
    st.light = on;
    lenses.setColorAt(st.index, on ? LENS_ON : OFF);
    lenses.instanceColor.needsUpdate = true;
    if (on) lighting?.acquireSpot?.(st, st.lensPos, st.aim, 9);
    else lighting?.releaseSpot?.(st);
    if (sound) app.audio?.play?.('switch_click', { position: st.buttonPos, volume: 0.7 });
    app.events?.emit?.('cabin:readingLight', { seatId, on });
    return true;
  }
  function setGasper(seatId, open, { sound = true } = {}) {
    const st = bySeat.get(seatId);
    if (!st) return false;
    st.gasperTarget = open ? 1 : 0;
    st.gAnim = 0; st.gFrom = st.gasper;
    activeG.add(st);
    if (sound) app.audio?.play?.('gasper', { position: st.gasperPos, volume: 0.8 });
    app.events?.emit?.('cabin:gasper', { seatId, open: !!open });
    return true;
  }
  function toggleCallUnit(u, force) {
    const on = force === undefined ? !u.call : !!force;
    if (on === u.call) return u.call;
    u.call = on;
    const i = unitIndex.get(u);
    callLights.setColorAt(i, on ? CALL_ON : OFF);
    callBtns.setColorAt(i, on ? CALLBTN_ON : OFF);
    callLights.instanceColor.needsUpdate = true; callBtns.instanceColor.needsUpdate = true;
    app.audio?.play?.('button_press', { position: u.callPos, volume: 0.7 });
    if (on) app.audio?.play?.('chime_call', { position: u.callPos });
    app.events?.emit?.('cabin:call', { row: u.row, side: u.side, on });
    return on;
  }
  function toggleCall(seatId) {
    const st = bySeat.get(seatId);
    if (!st) return false;
    return toggleCallUnit(st.unit);
  }
  st0SpotLost();
  function st0SpotLost() { for (const st of seats) st.onSpotLost = () => {}; }

  if (app.interactions?.add) {
    proxyInfo.forEach((info, i) => {
      if (info.kind === 'light') {
        app.interactions.add({ object: proxies, instanceId: i, maxDistance: 1.9, priority: 3,
          label: () => `${info.st.light ? 'Turn off' : 'Turn on'} reading light ${info.st.seatId}`,
          onInteract: () => setReadingLight(info.st.seatId, !info.st.light) });
      } else if (info.kind === 'gasper') {
        app.interactions.add({ object: proxies, instanceId: i, maxDistance: 1.9, priority: 3,
          label: () => (info.st.gasperTarget > 0.5 ? 'Close air vent' : 'Open air vent'),
          onInteract: () => setGasper(info.st.seatId, info.st.gasperTarget < 0.5) });
      } else {
        app.interactions.add({ object: proxies, instanceId: i, maxDistance: 1.9, priority: 3,
          label: () => (info.u.call ? 'Cancel attendant call' : 'Call flight attendant'),
          onInteract: () => toggleCallUnit(info.u) });
      }
    });
  }

  // ---- signs ------------------------------------------------------------------------------------
  const signState = { belt: 1, smoke: 1, beltT: 1, smokeT: 1 };
  const SIGN_ON = new THREE.Color(1.55, 1.48, 1.36), SIGN_OFF = new THREE.Color(0.018, 0.018, 0.02);
  app.events?.on?.('cabin:seatbelt', ({ on }) => { signState.beltForced = !!on; signState.beltForcedAt = app.time; });

  const activeG = new Set();
  function update(dt) {
    const st = app.flight?.state?.cabin;
    let belt = st ? !!st.seatbelt : true;
    if (signState.beltForced !== undefined && app.time - signState.beltForcedAt < 0.5) belt = signState.beltForced;
    const smoke = st ? st.noSmoking !== false : true;
    signState.beltT = damp(signState.beltT, belt ? 1 : 0, 18, dt);
    signState.smokeT = damp(signState.smokeT, smoke ? 1 : 0, 18, dt);
    M.signBelt.color.copy(SIGN_OFF).lerp(SIGN_ON, signState.beltT);
    M.signSmoke.color.copy(SIGN_OFF).lerp(SIGN_ON, signState.smokeT);
    // gaspers twist animation
    for (const s of activeG) {
      s.gAnim = Math.min(1, s.gAnim + dt / 0.35);
      const k = s.gAnim * s.gAnim * (3 - 2 * s.gAnim);
      s.gasper = s.gFrom + (s.gasperTarget - s.gFrom) * k;
      writeNozzle(s.index);
      if (s.gAnim >= 1) activeG.delete(s);
    }
    // call lights pulse very slightly (LED driver) — no: real call lights are steady.
    void tmpC;
  }

  function psuForSeat(seatId) {
    const st = bySeat.get(seatId);
    if (!st) return null;
    return {
      seatId, row: st.unit.row, side: st.unit.side, index: st.k,
      readingLight: st.light, gasper: st.gasperTarget > 0.5, gasperAmount: st.gasper, call: st.unit.call,
      lensPosition: st.lensPos, gasperPosition: st.gasperPos, callPosition: st.unit.callPos, buttonPosition: st.buttonPos,
      position: new THREE.Vector3(st.unit.s * PSU_X, PSU_FACE_Y, st.unit.z),
      setReadingLight: (on) => setReadingLight(seatId, on), setGasper: (open) => setGasper(seatId, open), toggleCall: () => toggleCall(seatId),
    };
  }

  return {
    update, setReadingLight, setGasper, toggleCall, psuForSeat, units, seats,
    get anyCall() { return units.some((u) => u.call); },
    group,
  };
}
