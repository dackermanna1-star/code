// Ceiling & floor fixtures: hanging EXIT signs, exit locator signs above doors
// and hatches, emergency lights, ceiling PA speakers, master call lights,
// photoluminescent floor-path marking, aft attendant handset, and the class
// divider curtain (cloth with pleats, animated open/close).
import * as THREE from 'three';
import { DOORS, ZONES, AISLE } from '../../core/constants.js';
import { clamp, damp } from '../../core/util.js';
import { GeoBuilder, addBox, roundedBoxGeometry } from './geom.js';
import { PROF, ceilingY, liningFrame } from './profile.js';
import { CABIN_Z0, CABIN_Z1, doorHole } from './shell.js';

function bakeConst(g, b) {
  const n = g.attributes.position.count, arr = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) arr.set(b, i * 4);
  g.setAttribute('bake', new THREE.BufferAttribute(arr, 4));
  return g;
}

export function createFixtures(app, M, tex, root, deps = {}) {
  const group = new THREE.Group();
  group.name = 'cabin-fixtures';
  root.add(group);
  const detail = app.quality?.detail ?? 1;
  const housing = new GeoBuilder('fixHousing');      // light grey plastic housings
  const chrome = new GeoBuilder('fixChrome');
  const decals = new GeoBuilder('fixDecals');        // atlas-mapped (placard material)
  const dark = new GeoBuilder('fixDark');
  const exitFaces = new GeoBuilder('exitFaces');     // emissive EXIT sign faces
  const uvr = (r) => (u, v) => [r[0] + (r[2] - r[0]) * u, r[1] + (r[3] - r[1]) * v];
  const exitRow = (row) => (u, v) => [0.02 + u * 0.96, 1 - (row + 1) / 4 + 0.01 + v * (0.25 - 0.02)];

  // --------------------------------------------------------------- hanging EXIT signs over the aisle
  const hanging = [
    { z: CABIN_Z0 - 0.12, row: 3 },          // forward entry, seen from the cabin and the entry area
    { z: (DOORS.OWL1.z + DOORS.OWL2.z) / 2, row: 3 },
    { z: CABIN_Z1 + 0.1, row: 3 },
  ];
  for (const h of hanging) {
    const y = ceilingY(0) - 0.16;
    housing.addGeometry(roundedBoxGeometry(0.44, 0.135, 0.055, 0.012, 2), new THREE.Matrix4().makeTranslation(0, y, h.z), [0.35, 0.02, 0.9, 0]);
    chrome.addGeometry(new THREE.CylinderGeometry(0.008, 0.008, ceilingY(0) - y - 0.06, 8), new THREE.Matrix4().makeTranslation(0, (y + 0.06 + ceilingY(0)) / 2, h.z), [0.4, 0, 1, 0]);
    housing.addGeometry(new THREE.CylinderGeometry(0.03, 0.035, 0.012, 16), new THREE.Matrix4().makeTranslation(0, ceilingY(0) - 0.004, h.z), [0.5, 0, 1, 0]);
    for (const f of [1, -1]) {
      const g = new THREE.PlaneGeometry(0.4, 0.105);
      if (f < 0) g.rotateY(Math.PI);
      exitFaces.addGeometry(g, new THREE.Matrix4().makeTranslation(0, y, h.z + f * 0.0285), null, exitRow(h.row));
    }
  }
  // locator EXIT signs above the door openings (on the entry lining) and above the over-wing hatches
  const fm = new THREE.Matrix4();
  for (const id of ['L1', 'R1', 'L2', 'R2']) {
    const d = DOORS[id], hole = doorHole(id);
    const yy = Math.min(1.99, hole.top + 0.08);
    liningFrame(d.side, yy, 0.012, d.z, fm);
    housing.addGeometry(roundedBoxGeometry(0.03, 0.09, 0.3, 0.008, 2), fm.clone().multiply(new THREE.Matrix4().makeTranslation(-0.004, 0, 0)), [0.3, 0.02, 0.9, 0]);
    exitFaces.addGeometry(new THREE.PlaneGeometry(0.27, 0.07).rotateY(Math.PI / 2), fm.clone().multiply(new THREE.Matrix4().makeTranslation(0.0115, 0, 0)), null, exitRow(0));
  }
  for (const id of ['OWL1', 'OWL2', 'OWR1', 'OWR2']) {
    const d = DOORS[id];
    // small lit EXIT sign on the PSU channel lip right above the hatch, facing the aisle
    const s = d.side === 'left' ? -1 : 1;
    const x = s * (PROF.psuX0 - 0.004), y = PROF.psuY + 0.0;
    const g = new THREE.PlaneGeometry(0.2, 0.05).rotateY(-s * Math.PI / 2);
    const m = new THREE.Matrix4().makeTranslation(x - s * 0.002, y - 0.035, d.z);
    housing.addGeometry(new THREE.BoxGeometry(0.02, 0.07, 0.24), new THREE.Matrix4().makeTranslation(x + s * 0.008, y - 0.035, d.z), [0.2, 0.05, 0.9, 0]);
    exitFaces.addGeometry(g, m, null, exitRow(0));
  }

  // --------------------------------------------------------------- emergency lights + ceiling speakers + master call panels
  const span0 = ZONES.flightDeckDoorZ + 0.8, span1 = ZONES.aftBulkheadZ - 0.8;
  const emZ = [];
  for (let z = -13.6; z < 13.6; z += 2.62) emZ.push(z);
  for (const z of emZ) {
    const y = ceilingY(0);
    chrome.addGeometry(roundedBoxGeometry(0.15, 0.012, 0.075, 0.004, 1), new THREE.Matrix4().makeTranslation(0, y - 0.004, z), [0.4, 0, 1, 0]);
    housing.addGeometry(roundedBoxGeometry(0.13, 0.012, 0.058, 0.004, 1), new THREE.Matrix4().makeTranslation(0, y - 0.007, z), [0.75, 0, 1, 0]);
  }
  const spkR = tex.placardRect('speaker');
  if (detail >= 0) {
    for (let z = span0 + 1.2; z < span1; z += 2.3) {
      for (const x of [-0.36, 0.36]) {
        const y = ceilingY(x) - 0.002;
        const g = new THREE.CircleGeometry(0.055, 24).rotateX(Math.PI / 2);
        decals.addGeometry(g, new THREE.Matrix4().makeTranslation(x, y, z + (x > 0 ? 0.6 : 0)), [0.55, 0, 1, 0], uvr(spkR));
      }
    }
  }
  // master call light panels near the galleys (blue = passenger call, pink = lav, amber = interphone)
  const mcl = [];
  for (const z of [CABIN_Z0 - 0.45, CABIN_Z1 + 0.5]) {
    const y = ceilingY(0.3);
    housing.addGeometry(roundedBoxGeometry(0.2, 0.02, 0.07, 0.006, 1), new THREE.Matrix4().makeTranslation(0.3, y - 0.006, z), [0.5, 0, 1, 0]);
    for (let k = 0; k < 3; k++) mcl.push(new THREE.Vector3(0.24 + k * 0.06, y - 0.017, z));
  }
  const mclMat = new THREE.MeshStandardMaterial({ color: '#d7d9dc', roughness: 0.3 });
  mclMat.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', '').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance += vColor;\n#endif'); };
  mclMat.customProgramCacheKey = () => 'cabinEmInst';
  const mclMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 16), mclMat, mcl.length);
  mclMesh.name = 'cabin-master-call-lights';
  const mtx = new THREE.Matrix4();
  mcl.forEach((p, i) => { mclMesh.setMatrixAt(i, mtx.makeTranslation(p.x, p.y, p.z)); mclMesh.setColorAt(i, new THREE.Color(0, 0, 0)); });
  group.add(mclMesh);
  const MCL_BLUE = new THREE.Color(0.4, 1.2, 4.5), OFF = new THREE.Color(0, 0, 0);

  // --------------------------------------------------------------- aft attendant handset (right sidewall between lav and R2)
  {
    const z = (ZONES.aftLavs.zMax + doorHole('R2').z0) / 2;
    liningFrame('right', 1.3, 0.004, z, fm);
    dark.addGeometry(roundedBoxGeometry(0.03, 0.22, 0.12, 0.01, 2), fm.clone().multiply(new THREE.Matrix4().makeTranslation(0.015, 0, 0)), [0.2, 0.05, 0.85, 0]);
    dark.addGeometry(new THREE.CapsuleGeometry(0.02, 0.12, 4, 10), fm.clone().multiply(new THREE.Matrix4().makeTranslation(0.045, 0, 0)), [0.2, 0.05, 0.9, 0]);
    decals.addGeometry(new THREE.PlaneGeometry(0.11, 0.028).rotateY(Math.PI / 2), fm.clone().multiply(new THREE.Matrix4().makeTranslation(0.031, 0.135, 0)), [0.3, 0.1, 1, 0], uvr(tex.placardRect('handset')));
  }

  // --------------------------------------------------------------- photoluminescent floor path marking
  const strip = new GeoBuilder('floorStrip');
  const red = new GeoBuilder('floorRed');
  const stripRun = (x, z0, z1) => addBox(strip, x - 0.0125, 0, z0, x + 0.0125, 0.004, z1, [0.2, 0, 0.9, 0]);
  const bx = AISLE.businessHalfWidth + 0.02, ex = AISLE.halfWidth + 0.045;
  for (const s of [-1, 1]) {
    stripRun(s * bx, CABIN_Z0 + 0.2, ZONES.classDividerZ - 0.1);
    // economy: interrupted at the over-wing exits by red exit indicators
    const ow0 = DOORS.OWL1.z - 0.35, ow1 = DOORS.OWL2.z + 0.35;
    stripRun(s * ex, ZONES.classDividerZ + 0.1, ow0);
    stripRun(s * ex, ow1, CABIN_Z1 - 0.1);
    addBox(red, s * ex - 0.0125, 0, ow0, s * ex + 0.0125, 0.0045, ow1, [0.2, 0, 0.9, 0]);
    addBox(red, s * bx - 0.0125, 0, CABIN_Z0 - 0.1, s * bx + 0.0125, 0.0045, CABIN_Z0 + 0.2, [0.2, 0, 0.9, 0]);
    addBox(red, s * ex - 0.0125, 0, CABIN_Z1 - 0.1, s * ex + 0.0125, 0.0045, CABIN_Z1 + 0.25, [0.2, 0, 0.9, 0]);
  }

  // --------------------------------------------------------------- build static meshes
  const meshes = [];
  const add = (b, mat, name, shadow = false) => {
    if (b.empty) return null;
    const m = new THREE.Mesh(b.build(), mat);
    m.name = name; m.castShadow = shadow; m.receiveShadow = true;
    group.add(m); meshes.push(m);
    return m;
  };
  add(housing, M.greyPlastic, 'cabin-fixture-housings', true);
  add(chrome, M.chrome, 'cabin-fixture-chrome');
  add(decals, M.placard, 'cabin-fixture-decals');
  add(dark, M.darkPlastic, 'cabin-fixture-dark', true);
  add(strip, M.glowStrip, 'cabin-floor-path');
  add(red, M.floorRed, 'cabin-floor-path-exit');
  const exitMesh = add(exitFaces, M.exitSign, 'cabin-exit-signs');
  if (exitMesh) exitMesh.receiveShadow = false;

  // --------------------------------------------------------------- class divider curtain
  const curtain = createCurtain(app, M, group);

  function update(dt) {
    curtain.update(dt);
    const any = deps.psu?.anyCall;
    if (any !== mclMesh.userData.state) {
      mclMesh.userData.state = any;
      for (let i = 0; i < mcl.length; i += 3) mclMesh.setColorAt(i, any ? MCL_BLUE : OFF);
      mclMesh.instanceColor.needsUpdate = true;
    }
  }
  return { update, curtain, group };
}

// ---------------------------------------------------------------------------------- curtain
function createCurtain(app, M, group) {
  const Z = ZONES.classDividerZ;
  const xEdge = 0.40, top = 2.03, bottom = 0.07;
  const nu = 48, nv = 8, pleats = 8;
  const clothLen = xEdge * 1.7;
  // track
  const track = new GeoBuilder('curtainTrack');
  addBox(track, -0.84, top + 0.012, Z - 0.012, 0.84, top + 0.03, Z + 0.012, [0.3, 0.02, 0.9, 0]);
  const trackMesh = new THREE.Mesh(track.build(), M.metal);
  trackMesh.name = 'cabin-curtain-track'; trackMesh.castShadow = true;
  group.add(trackMesh);

  const geos = [], meshes = [];
  for (const s of [-1, 1]) {
    const g = new THREE.BufferGeometry();
    const n = (nu + 1) * (nv + 1);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uv = new Float32Array(n * 2), bake = new Float32Array(n * 4);
    const idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const k = j * (nu + 1) + i;
      uv[k * 2] = (i / nu) * 2.2; uv[k * 2 + 1] = (j / nv) * 5;
      const y = bottom + (top - bottom) * (j / nv);
      bake.set([0.45, 0.1, 0.8 + 0.2 * (j / nv), 0], k * 4);
      void y;
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
      idx.push(a, b, c, a, c, d);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('bake', new THREE.BufferAttribute(bake, 4));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, M.curtain);
    m.name = 'cabin-curtain'; m.castShadow = true; m.receiveShadow = true;
    m.userData.side = s;
    group.add(m); geos.push(g); meshes.push(m);
  }
  const state = { open: true, amount: 1, target: 1, t: 1, dirty: true, from: 1 };
  function rebuild() {
    for (const g of geos) {
      const s = meshes[geos.indexOf(g)].userData.side;
      const p = g.attributes.position.array;
      // width occupied by this half: closed -> xEdge (to the centre), open -> gathered 0.075 m
      const w = 0.13 + (xEdge - 0.13) * (1 - state.amount);
      const amp = Math.min(0.045, Math.sqrt(Math.max(0, clothLen * clothLen - w * w)) / (pleats * Math.PI) * 1.3 + 0.008);
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;
        const y = bottom + (top - bottom) * v;
        for (let i = 0; i <= nu; i++) {
          const u = i / nu;
          const x = s * (xEdge - w * u);
          // pleats + slight sway towards the hem
          const z = Z + amp * Math.sin(u * pleats * Math.PI * 2) * (0.85 + 0.15 * v) + (1 - v) * 0.01 * Math.sin(u * 3.0 + s);
          const k = (j * (nu + 1) + i) * 3;
          p[k] = x; p[k + 1] = y; p[k + 2] = z;
        }
      }
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
      g.computeBoundingSphere();
    }
  }
  rebuild();
  // pick proxies: one per curtain half (cover only the gathered stack when open, so the aisle stays pickable)
  const proxies = [-1, 1].map((s) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1, 1.9, 0.14), new THREE.MeshBasicMaterial({ visible: false }));
    p.name = 'cabin-curtain-proxy'; p.userData.side = s;
    group.add(p);
    return p;
  });
  const proxy = proxies[1];
  function placeProxies() {
    const w = 0.13 + (xEdge - 0.13) * (1 - state.amount);
    for (const p of proxies) { p.scale.x = Math.max(0.08, w); p.position.set(p.userData.side * (xEdge - w / 2), 1.08, Z); p.updateMatrixWorld(); }
  }
  placeProxies();
  const api = {
    get open() { return state.target > 0.5; },
    setOpen(v, { sound = true } = {}) {
      const t = v ? 1 : 0;
      if (t === state.target) return;
      state.from = state.amount; state.target = t; state.t = 0;
      if (sound) app.audio?.play?.('paper', { position: proxy.position, volume: 0.25, rate: 0.6 });
    },
    update(dt) {
      if (state.t >= 1) return;
      state.t = Math.min(1, state.t + dt / 1.4);
      const k = state.t * state.t * (3 - 2 * state.t);
      state.amount = state.from + (state.target - state.from) * k;
      rebuild();
      placeProxies();
    },
    proxy,
  };
  if (app.interactions?.add) {
    for (const p of proxies) app.interactions.add({
      object: p, maxDistance: 1.8, priority: -1,
      label: () => (api.open ? 'Close curtain' : 'Open curtain'),
      onInteract: () => api.setOpen(!api.open),
    });
  }
  return api;
}
