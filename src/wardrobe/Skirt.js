import * as THREE from 'three';
import { buildFitted } from './GarmentBuilder.js';
import { makeFabricMaterial } from './fabric.js';
import { Cloth } from '../physics/Cloth.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

/**
 * Skirts, dress skirts and coat tails.  A tube is fitted around the body's
 * convex envelope (hips → legs) with flare / pleats.  Fitted styles are
 * skinned (pelvis → thighs); flowing styles are simulated cloth whose
 * waistband follows the body exactly and which collides with the legs.
 * An optional fitted bodice (body-derived) completes dresses and coats.
 */
export function buildSkirt(w, o, cfg) {
  const atlas = w.atlas, ch = w.character, L = atlas.L;
  const mat = makeFabricMaterial(o);
  const group = new THREE.Group();
  group.name = 'skirt';
  let covered = null;
  const bones = ch.skeleton.bones;
  const boneIndex = Object.fromEntries(bones.map((b, i) => [b.name, i]));

  if (cfg.bodice) {
    const key = (o._id || 'x') + ':bodice';
    let res = w.geomCache.get(key);
    if (!res) { res = buildFitted(atlas, cfg.bodice); w.geomCache.set(key, res); }
    const m = new THREE.SkinnedMesh(res.geometry, mat);
    m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
    m.renderOrder = 3;
    group.add(m);
    m.bind(ch.skeleton, ch.body.bindMatrix);
    covered = o.sheer ? null : res.covered;
  }
  ch.model.add(group);
  for (const c of group.children) c.bind && c.bind(ch.skeleton, ch.body.bindMatrix);

  // -------------------------------------------------- ring geometry (rest pose)
  const topY = cfg.top === 'waist' ? L.naturalWaistY - 0.005 : cfg.top === 'hip' ? L.pelvis.y + 0.012 : L.pelvis.y - 0.055;
  const hemY = Math.max(0.04, topY - cfg.length);
  const R = cfg.rows, C = cfg.cols || (cfg.length > 0.8 ? 60 : 56);
  const open = cfg.openFront || 0;           // angular gap (rad) at the front
  const wrap = !open;
  const cz = -0.005;
  // body slice support function
  const P = atlas.P;
  const slices = new Map();
  for (let i = 0; i < atlas.count; i++) {
    if (atlas.arm[i] > 0.15 || atlas.hand[i] > 0.1 || atlas.head[i] > 0.2) continue;
    const k = Math.round(P[i * 3 + 1] * 100);
    if (!slices.has(k)) slices.set(k, []);
    slices.get(k).push(i);
  }
  const angles = [];
  for (let c = 0; c < C; c++) {
    const t = wrap ? c / C : c / (C - 1);
    angles.push(open ? open / 2 + t * (Math.PI * 2 - open) : t * Math.PI * 2 + (cfg.slit ? 0.5 : 0));
  }
  // legs are spread in the bind pose; measure the envelope as if standing
  const hipX = Math.abs(L.hipL.x), ankX = Math.abs(L.ankleL.x);
  const standAnkX = 0.075;
  const adduct = (y) => { const t = clamp((L.hipL.y - y) / (L.hipL.y - L.ankleL.y), 0, 1); return t * (ankX - standAnkX); };
  const support = (y, th) => {
    const ux = Math.sin(th), uz = Math.cos(th);
    let best = 0.05;
    const k0 = Math.round(y * 100);
    const ad = adduct(y);
    for (let k = k0 - 2; k <= k0 + 2; k++) {
      const arr = slices.get(k); if (!arr) continue;
      for (const i of arr) {
        const lx = P[i * 3] - Math.sign(P[i * 3]) * ad * atlas.leg[i];
        const d = lx * ux + (P[i * 3 + 2] - cz) * uz;
        if (d > best) best = d;
      }
    }
    return best;
  };
  void hipX;
  const ease = cfg.ease ?? (cfg.sim ? 0.012 : 0.009);
  const layerOff = cfg.layerOff || 0;
  const rest = new Float32Array(R * C * 3);
  const restN = new Float32Array(R * C * 3);
  const radii = new Float32Array(R * C);
  const hipY = L.pelvis.y - 0.06;
  for (let r = 0; r < R; r++) {
    const y = topY + (hemY - topY) * (r / (R - 1));
    for (let c = 0; c < C; c++) {
      const easeR = mix(cfg.topEase ?? 0.005, ease, smoothstep(0, 0.06, topY - y));
      let rad = support(Math.max(y, 0.06), angles[c]) + easeR + layerOff;
      // a skirt hangs from the widest part of the hips; it never follows the
      // body back in (except deliberately tapered pencil styles)
      if (r > 0 && cfg.flare >= 0) rad = Math.max(rad, radii[(r - 1) * C + c]);
      radii[r * C + c] = rad;
    }
  }
  // flare: add linearly below the hip line, pencil: taper slightly
  for (let r = 0; r < R; r++) {
    const y = topY + (hemY - topY) * (r / (R - 1));
    const below = Math.max(0, hipY - y);
    for (let c = 0; c < C; c++) {
      let rad = radii[r * C + c];
      rad += cfg.flare > 0 ? cfg.flare * below : cfg.flare * below;
      if (cfg.flare < 0) rad = Math.max(rad, support(Math.max(y, 0.06), angles[c]) + 0.006);
      if (cfg.pleats) {
        const amp = 0.012 * smoothstep(0.02, 0.25, topY - y);
        const ph = (c / C) * cfg.pleats;
        rad += amp * (Math.abs((ph % 1) - 0.5) * 4 - 1);
      }
      radii[r * C + c] = rad;
    }
  }
  for (let r = 0; r < R; r++) {
    const y = topY + (hemY - topY) * (r / (R - 1));
    for (let c = 0; c < C; c++) {
      const th = angles[c], rad = radii[r * C + c];
      const i = (r * C + c) * 3;
      rest[i] = Math.sin(th) * rad; rest[i + 1] = y; rest[i + 2] = cz + Math.cos(th) * rad;
      restN[i] = Math.sin(th); restN[i + 1] = 0; restN[i + 2] = Math.cos(th);
    }
  }

  // skin weights per particle: nearest body vertex (waistband) blended to thighs below
  const SIx = new Uint16Array(R * C * 4), SWx = new Float32Array(R * C * 4);
  const nearestW = (px, py, pz) => {
    let best = -1, bd = 1e9;
    const k0 = Math.round(py * 100);
    for (let k = k0 - 2; k <= k0 + 2; k++) {
      const arr = slices.get(k); if (!arr) continue;
      for (const i of arr) {
        const d = (P[i * 3] - px) ** 2 + (P[i * 3 + 1] - py) ** 2 + (P[i * 3 + 2] - pz) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  };
  const pelvisI = boneIndex.pelvis, thL = boneIndex.thigh_l, thR = boneIndex.thigh_r, calfL = boneIndex.calf_l, calfR = boneIndex.calf_r;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const q = r * C + c, i = q * 3;
    const y = rest[i + 1];
    const m = new Map();
    const nb = nearestW(rest[i], Math.max(y, topY - 0.15), rest[i + 2]);
    const depth = smoothstep(L.pelvis.y - 0.02, L.crotchY - 0.12, y);
    const knee = smoothstep(L.kneeL.y + 0.06, L.kneeL.y - 0.25, y);
    const side = 0.5 + 0.5 * clamp(rest[i] / 0.07, -1, 1);
    const top = 1 - depth;
    if (nb >= 0) for (let k = 0; k < 4; k++) {
      const wt = atlas.SW[nb * 4 + k] * top; if (wt > 0) m.set(atlas.SI[nb * 4 + k], (m.get(atlas.SI[nb * 4 + k]) || 0) + wt);
    } else m.set(pelvisI, top);
    const legs = depth * 0.92;
    m.set(pelvisI, (m.get(pelvisI) || 0) + depth * 0.08);
    m.set(thL, (m.get(thL) || 0) + legs * side * (1 - knee * 0.35));
    m.set(thR, (m.get(thR) || 0) + legs * (1 - side) * (1 - knee * 0.35));
    if (knee > 0) { m.set(calfL, (m.get(calfL) || 0) + legs * side * knee * 0.35); m.set(calfR, (m.get(calfR) || 0) + legs * (1 - side) * knee * 0.35); }
    const arr = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    let s = 0; for (const e of arr) s += e[1];
    arr.forEach((e, k) => { SIx[q * 4 + k] = e[0]; SWx[q * 4 + k] = e[1] / (s || 1); });
  }

  // index buffer (grid, optionally wrapped / slit)
  const slitRow = cfg.slit ? Math.floor(R * (1 - cfg.slit)) : R;
  const index = [];
  const cm = wrap ? C : C - 1;
  for (let r = 0; r < R - 1; r++) for (let c = 0; c < cm; c++) {
    if (wrap && c === C - 1 && r >= slitRow) continue;
    const a = r * C + c, b = r * C + ((c + 1) % C), d = (r + 1) * C + c, e = (r + 1) * C + ((c + 1) % C);
    index.push(a, d, b, b, d, e);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(rest.slice(), 3));
  geom.setAttribute('restPos', new THREE.BufferAttribute(rest, 3));
  geom.setAttribute('restNormal', new THREE.BufferAttribute(restN, 3));
  geom.setIndex(index);
  geom.computeVertexNormals();

  if (!cfg.sim) {
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SIx, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SWx, 4));
    const mesh = new THREE.SkinnedMesh(geom, mat);
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.renderOrder = 3;
    group.add(mesh);
    mesh.bind(ch.skeleton, ch.body.bindMatrix);
    return { object: group, covered, material: mat, dispose: () => { geom.dispose(); group.parent && group.parent.remove(group); } };
  }

  // -------------------------------------------------- simulated cloth
  const cloth = new Cloth({
    rows: R, cols: C, wrap, wrapRows: slitRow, rest, pinRows: 1, softRows: cfg.heavy ? 2 : 2,
    gatherH: cfg.gather || 1,
    stiffness: { struct: 1.0, shear: cfg.stiffness ? 0.8 : 0.55, bend: cfg.tight ? 0.45 : cfg.heavy ? 0.25 : cfg.pleats ? 0.3 : 0.08 + 0.12 * (cfg.stiffness || 0) },
    damping: cfg.heavy ? 0.02 : 0.012,
    thickness: 0.006 + layerOff * 0.2,
  });
  const simMesh = new THREE.Mesh(geom, mat);
  simMesh.frustumCulled = false; simMesh.castShadow = true; simMesh.receiveShadow = true;
  simMesh.renderOrder = 3;
  const scene = ch.root.parent;
  scene.add(simMesh);

  // colliders (model rest space, attached to bones)
  const legRad = (bn, y0, y1) => {
    let s = 0, n = 0;
    const bi = boneIndex[bn];
    const head = ch.restModel[bn], tail = ch.tailModel[bn];
    const ax = new THREE.Vector3().subVectors(tail, head); const l = ax.length(); ax.divideScalar(l);
    const v = new THREE.Vector3();
    for (let i = 0; i < atlas.count; i++) {
      const y = P[i * 3 + 1]; if (y < Math.min(y0, y1) || y > Math.max(y0, y1)) continue;
      let wsum = 0; for (let k = 0; k < 4; k++) if (atlas.SI[i * 4 + k] === bi) wsum += atlas.SW[i * 4 + k];
      if (wsum < 0.5) continue;
      v.set(P[i * 3], y, P[i * 3 + 2]).sub(head);
      const t = v.dot(ax); v.addScaledVector(ax, -t);
      s += v.length(); n++;
    }
    return n ? s / n : 0.06;
  };
  const caps = [];
  for (const sd of ['l', 'r']) {
    const hip = ch.restModel['thigh_' + sd], knee = ch.restModel['calf_' + sd], ank = ch.restModel['foot_' + sd];
    caps.push({ bone: 'thigh_' + sd, a: hip.clone().lerp(knee, 0.12), b: knee.clone(), ra: legRad('thigh_' + sd, L.crotchY - 0.06, L.crotchY - 0.0) * 0.98, rb: legRad('thigh_' + sd, knee.y + 0.02, knee.y + 0.08) * 0.95 });
    caps.push({ bone: 'calf_' + sd, a: knee.clone(), b: ank.clone().lerp(knee, 0.08), ra: legRad('calf_' + sd, knee.y - 0.16, knee.y - 0.08) * 0.95, rb: legRad('calf_' + sd, ank.y + 0.04, ank.y + 0.1) * 0.9 });
  }
  caps.push({ bone: 'pelvis', a: new THREE.Vector3(0.06, L.pelvis.y - 0.05, -0.03), b: new THREE.Vector3(-0.06, L.pelvis.y - 0.05, -0.03), ra: 0.11, rb: 0.11 });
  // hands and forearms brush the fabric aside
  for (const sd of ['l', 'r']) {
    const el = ch.restModel['lowerarm_' + sd], wr = ch.restModel['hand_' + sd];
    caps.push({ bone: 'lowerarm_' + sd, a: el.clone().lerp(wr, 0.35), b: wr.clone(), ra: 0.032, rb: 0.03 });
    const mid = ch.restModel['middle_02_' + sd];
    caps.push({ bone: 'hand_' + sd, a: wr.clone(), b: mid.clone(), ra: 0.03, rb: 0.024 });
  }
  for (const c of caps) {
    c.bi = boneIndex[c.bone];
    const inward = /^(lowerarm|hand)_/.test(c.bone);
    cloth.capsules.push({ a: new THREE.Vector3(), b: new THREE.Vector3(), ra: c.ra, rb: c.rb, inward });
  }
  // leg capsules double as the radial hull (indices 0..3 are thighs/calves)
  const hullLegs = caps.slice(0, 4).map((c) => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), ra: c.ra * 1.18 + 0.004, rb: c.rb * 1.18 + 0.004, src: c }));
  cloth.hull = { o: new THREE.Vector3(), legs: hullLegs };
  const pelvisRest = ch.restModel.pelvis.clone();

  const m4 = new THREE.Matrix4();
  const boneMats = bones.map(() => new THREE.Matrix4());
  const tmp = new THREE.Vector3(), acc = new THREE.Vector3();
  const pinRows = 3;
  const pinNow = new Float32Array(R * C * 3), pinPrev = new Float32Array(R * C * 3), pinStep = new Float32Array(R * C * 3);
  const updateBoneMats = () => {
    ch.root.updateMatrixWorld(true);
    for (let i = 0; i < bones.length; i++) boneMats[i].multiplyMatrices(bones[i].matrixWorld, ch.skeleton.boneInverses[i]);
  };
  const lbs = (q, out) => {
    acc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const wt = SWx[q * 4 + k]; if (!wt) continue;
      tmp.set(rest[q * 3], rest[q * 3 + 1], rest[q * 3 + 2]).applyMatrix4(boneMats[SIx[q * 4 + k]]);
      acc.addScaledVector(tmp, wt);
    }
    out[q * 3] = acc.x; out[q * 3 + 1] = acc.y; out[q * 3 + 2] = acc.z;
  };
  const initAll = () => {
    updateBoneMats();
    const all = new Float32Array(R * C * 3);
    for (let q = 0; q < R * C; q++) lbs(q, all);
    cloth.reset(all);
    for (let q = 0; q < pinRows * C; q++) { pinPrev[q * 3] = all[q * 3]; pinPrev[q * 3 + 1] = all[q * 3 + 1]; pinPrev[q * 3 + 2] = all[q * 3 + 2]; }
  };
  initAll();
  let warm = 0;
  const posAttr = geom.attributes.position;
  const update = (dt) => {
    if (!(dt > 0)) return;
    updateBoneMats();
    for (let q = 0; q < pinRows * C; q++) lbs(q, pinNow);
    // teleport / big jump detection
    const jump = Math.hypot(pinNow[0] - pinPrev[0], pinNow[1] - pinPrev[1], pinNow[2] - pinPrev[2]);
    if (jump > 0.5) { initAll(); return; }
    for (let k = 0; k < caps.length; k++) {
      const c = caps[k], cc = cloth.capsules[k];
      cc.a.copy(c.a).applyMatrix4(boneMats[c.bi]);
      cc.b.copy(c.b).applyMatrix4(boneMats[c.bi]);
    }
    cloth.hull.o.copy(pelvisRest).applyMatrix4(boneMats[pelvisI]);
    for (const h of hullLegs) { h.a.copy(h.src.a).applyMatrix4(boneMats[h.src.bi]); h.b.copy(h.src.b).applyMatrix4(boneMats[h.src.bi]); }
    const sub = warm < 30 ? 4 : 2;
    warm++;
    const h = Math.min(dt, 1 / 30) / sub;
    for (let s = 1; s <= sub; s++) {
      const t = s / sub;
      for (let q = 0; q < pinRows * C * 3; q++) pinStep[q] = pinPrev[q] + (pinNow[q] - pinPrev[q]) * t;
      cloth.pin.set(pinStep.subarray(0, pinRows * C * 3));
      cloth.step(h, warm < 30 ? 6 : 7);
    }
    pinPrev.set(pinNow.subarray(0, pinRows * C * 3));
    if (!Number.isFinite(cloth.x[cloth.x.length - 1]) || !Number.isFinite(cloth.x[0])) { initAll(); return; }
    posAttr.array.set(cloth.x);
    posAttr.needsUpdate = true;
    geom.computeVertexNormals();
  };
  // let the cloth settle before first display
  for (let i = 0; i < 40; i++) update(1 / 60);

  return {
    object: group, covered, material: mat, sim: cloth, update,
    dispose: () => { scene.remove(simMesh); geom.dispose(); group.parent && group.parent.remove(group); },
  };
}
