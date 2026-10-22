// Validates the procedural model library against src/sim/specs.js.
// Usage: node scripts/models-check.mjs   (exit code 1 on failure)

import { buildVehicleModel, buildAircraftModel, buildPropModel } from '../src/render/models/index.js';
import { VEHICLE_SPECS, AIRCRAFT_SPECS, PROP_KINDS } from '../src/sim/specs.js';

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const tris = (g) => g.attributes.position.count / 3;

function checkGeometry(name, g) {
  if (!g || !g.isBufferGeometry) return fail(`${name}: not a BufferGeometry`);
  const { position, normal, color } = g.attributes;
  if (!position || !normal || !color) return fail(`${name}: missing position/normal/color`);
  for (const [k, a] of Object.entries({ position, normal, color })) {
    if (a.itemSize !== 3) fail(`${name}: ${k} itemSize ${a.itemSize}`);
    if (a.count !== position.count) fail(`${name}: ${k} count mismatch`);
  }
  if (!g.index && position.count % 3) fail(`${name}: non-indexed vertex count not a multiple of 3`);
  for (const [k, a] of Object.entries({ position, normal, color })) {
    const arr = a.array;
    for (let i = 0; i < arr.length; i++) {
      if (!Number.isFinite(arr[i])) { fail(`${name}: ${k} has NaN/Infinity`); break; }
    }
  }
  const n = normal.array;
  let bad = 0;
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]);
    if (Math.abs(l - 1) > 0.02) bad++;
  }
  if (bad) fail(`${name}: ${bad} non-unit normals`);
  const c = color.array;
  for (let i = 0; i < c.length; i++) {
    if (c[i] < 0 || c[i] > 1.5) { fail(`${name}: colour out of range (${c[i]})`); break; }
  }
}

function bbox(g, offset = [0, 0, 0]) {
  g.computeBoundingBox();
  const b = g.boundingBox;
  return {
    min: [b.min.x + offset[0], b.min.y + offset[1], b.min.z + offset[2]],
    max: [b.max.x + offset[0], b.max.y + offset[1], b.max.z + offset[2]],
  };
}
function union(a, b) {
  return { min: a.min.map((v, i) => Math.min(v, b.min[i])), max: a.max.map((v, i) => Math.max(v, b.max[i])) };
}
const size = (b) => b.max.map((v, i) => v - b.min[i]);
function within(name, what, actual, expected, tol) {
  const r = actual / expected;
  if (r < 1 - tol || r > 1 + tol) fail(`${name}: ${what} ${actual.toFixed(2)} vs spec ${expected} (tol ±${Math.round(tol * 100)}%)`);
  else if (Math.abs(r - 1) > tol * 0.6) warn(`${name}: ${what} ${actual.toFixed(2)} vs spec ${expected}`);
}

// vertices near a point (gun space)
function hasVertexNear(g, p, eps) {
  const a = g.attributes.position.array;
  for (let i = 0; i < a.length; i += 3) {
    if (Math.abs(a[i] - p[0]) < eps && Math.abs(a[i + 1] - p[1]) < eps && Math.abs(a[i + 2] - p[2]) < eps) return true;
  }
  return false;
}
function maxZNear(g, x, y, r) {
  const a = g.attributes.position.array;
  let m = -Infinity;
  for (let i = 0; i < a.length; i += 3) {
    if (Math.hypot(a[i] - x, a[i + 1] - y) <= r && a[i + 2] > m) m = a[i + 2];
  }
  return m;
}
function hash(g) {
  const a = g.attributes.position.array;
  let h = 0;
  for (let i = 0; i < a.length; i += 7) h = (h * 31 + Math.round(a[i] * 1e4)) | 0;
  return `${a.length}:${h}`;
}

const table = [];

// ---------------------------------------------------------------- vehicles
const VB = { hull: 2500, turret: 1200, gun: 300, total: 4000 };
for (const [type, spec] of Object.entries(VEHICLE_SPECS)) {
  for (const f of [0, 1]) {
    const name = `${type}/${f}`;
    let m;
    try { m = buildVehicleModel(type, f); } catch (e) { fail(`${name}: build threw ${e.stack}`); continue; }
    const p = m.parts;
    for (const k of ['hull', 'turret', 'gun']) if (!p[k]) fail(`${name}: missing part ${k}`);
    if (type === 'spaag' && !p.radar) fail(`${name}: missing radar part`);
    for (const [k, g] of Object.entries(p)) checkGeometry(`${name}.${k}`, g);
    const t = Object.fromEntries(Object.entries(p).map(([k, g]) => [k, tris(g)]));
    const total = t.hull + t.turret + t.gun + (t.radar || 0) + (t.emissive || 0);
    for (const k of ['hull', 'turret', 'gun']) if (t[k] > VB[k]) fail(`${name}: ${k} ${t[k]} tris > ${VB[k]}`);
    if (total > VB.total) fail(`${name}: total ${total} tris > ${VB.total}`);
    table.push([name, t.hull, t.turret, t.gun, t.radar || 0, t.emissive || 0, total]);
    // muzzle / pod front exactly at barrelLength
    const gb = bbox(p.gun);
    if (Math.abs(gb.max[2] - spec.barrelLength) > 1e-3) fail(`${name}: gun max z ${gb.max[2].toFixed(4)} != barrelLength ${spec.barrelLength}`);
    if (spec.twinGunOffsetX) {
      for (const sx of [1, -1]) {
        const z = maxZNear(p.gun, sx * spec.twinGunOffsetX, 0, 0.12);
        if (Math.abs(z - spec.barrelLength) > 1e-3) fail(`${name}: no barrel ending at x=${sx * spec.twinGunOffsetX}, z=${spec.barrelLength} (got ${z})`);
      }
    } else if (spec.tubes) {
      const { cols, rows, spacing } = spec.tubes;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x = (c - (cols - 1) / 2) * spacing, y = (r - (rows - 1) / 2) * spacing;
        const z = maxZNear(p.gun, x, y, spacing * 0.45);
        if (Math.abs(z - spec.barrelLength) > 0.02) fail(`${name}: tube (${r},${c}) mouth not at z=${spec.barrelLength} (got ${z.toFixed(3)})`);
      }
      const [pw, ph, pl] = spec.podSize;
      const s = size(gb);
      if (s[0] < pw * 0.85 || s[0] > pw * 1.15 || s[1] < ph * 0.7 || s[1] > ph * 1.2 || Math.abs(gb.min[2]) > 0.05 || Math.abs(s[2] - pl) > 0.05) {
        fail(`${name}: pod bbox ${s.map((v) => v.toFixed(2))} (min z ${gb.min[2].toFixed(2)}) vs podSize ${spec.podSize}`);
      }
    } else {
      const z = maxZNear(p.gun, 0, 0, spec.gunRadius * 2.5);
      if (Math.abs(z - spec.barrelLength) > 1e-3) fail(`${name}: barrel on axis ends at ${z}, not ${spec.barrelLength}`);
    }
    // overall size: hull length, hull+turret width/height
    const hb = bbox(p.hull);
    const tb = bbox(p.turret, spec.turretPivot);
    within(name, 'length', size(hb)[2], spec.length, 0.1);
    within(name, 'width', Math.max(size(hb)[0], size(tb)[0]), spec.width, 0.12);
    // height without antennas/MG tops: use the 98th percentile of turret+hull vertex heights
    const ys = [];
    for (const [g, off] of [[p.hull, 0], [p.turret, spec.turretPivot[1]]]) {
      const a = g.attributes.position.array;
      for (let i = 1; i < a.length; i += 3) ys.push(a[i] + off);
    }
    ys.sort((a, b) => a - b);
    within(name, 'height (p98)', ys[Math.floor(ys.length * 0.98)], spec.height, 0.15);
    if (hb.min[1] < -0.25) fail(`${name}: hull extends below ground (${hb.min[1].toFixed(2)})`);
  }
}

// ---------------------------------------------------------------- aircraft
const AB = { attack_heli: 4500, transport_heli: 4500, jet: 3000, transport_plane: 5000, fpv_drone: 600, recon_uav: 600 };
for (const [type, spec] of Object.entries(AIRCRAFT_SPECS)) {
  for (const f of [0, 1]) {
    const name = `${type}/${f}`;
    let m;
    try { m = buildAircraftModel(type, f); } catch (e) { fail(`${name}: build threw ${e.stack}`); continue; }
    const p = m.parts;
    if (!p.body) fail(`${name}: missing body`);
    for (const [k, g] of Object.entries(p)) checkGeometry(`${name}.${k}`, g);
    const t = Object.fromEntries(Object.entries(p).map(([k, g]) => [k, tris(g)]));
    const total = Object.values(t).reduce((s, v) => s + v, 0);
    if (total > AB[type]) fail(`${name}: ${total} tris > ${AB[type]}`);
    table.push([name, t.body, (t.rotor || 0) + (t.tailRotor || 0), (t.rotorBlur || 0) + (t.tailRotorBlur || 0) + (t.propBlur || 0), 0, t.emissive || 0, total]);
    let ub = bbox(p.body);
    const ground = spec.skidHeight ? -spec.skidHeight : 0;
    if (p.propBlur && type === 'recon_uav') ub = union(ub, bbox(p.propBlur));
    if (spec.rotorPivot) {
      for (const k of ['rotor', 'rotorBlur']) if (!p[k]) fail(`${name}: missing ${k}`);
      for (const k of ['tailRotor', 'tailRotorBlur']) if (!p[k]) fail(`${name}: missing ${k}`);
      const rb = bbox(p.rotor);
      const rr = Math.max(...rb.max.map(Math.abs), ...rb.min.map(Math.abs));
      within(name, 'rotor radius', rr, spec.rotorRadius, 0.03);
      if (size(rb)[1] > 1.0) fail(`${name}: rotor not flat in XZ (${size(rb)[1].toFixed(2)} tall)`);
      const bb = bbox(p.rotorBlur);
      within(name, 'rotor blur radius', Math.max(bb.max[0], bb.max[2]), spec.rotorRadius, 0.03);
      if (size(bb)[1] > 0.05) fail(`${name}: rotorBlur not a flat XZ disc`);
      const tr = bbox(p.tailRotor);
      within(name, 'tail rotor radius', Math.max(tr.max[1], tr.max[2], -tr.min[1], -tr.min[2]), spec.tailRotorRadius, 0.05);
      if (size(tr)[0] > 0.6) fail(`${name}: tail rotor not in the YZ plane`);
      const tbb = bbox(p.tailRotorBlur);
      if (size(tbb)[0] > 0.05) fail(`${name}: tailRotorBlur not a flat YZ disc`);
      ub = union(ub, bbox(p.rotor, spec.rotorPivot));
      ub = union(ub, bbox(p.tailRotor, spec.tailRotorPivot));
      within(name, 'length incl. rotors', size(ub)[2], spec.length, 0.12);
      // fuselage width measured on a slice just behind the cockpit (gear, stores and tailplanes excluded)
      const cz = spec.cockpit[2];
      const a = p.body.attributes.position.array;
      let wmin = Infinity, wmax = -Infinity;
      for (let i = 0; i < a.length; i += 3) if (a[i + 2] > cz - 1.0 && a[i + 2] < cz && a[i + 1] > ground + 0.6) { wmin = Math.min(wmin, a[i]); wmax = Math.max(wmax, a[i]); }
      if (type === 'attack_heli') within(name, 'stub wing span', size(bbox(p.body))[0], spec.width, 0.15);
      else within(name, 'fuselage width', wmax - wmin, spec.width, 0.15);
      within(name, 'height (pivot y + hub)', bbox(p.rotor, spec.rotorPivot).max[1], spec.height, 0.08);
      if (Math.abs(bbox(p.body).min[1] - ground) > 0.12) fail(`${name}: gear bottom ${bbox(p.body).min[1].toFixed(2)} != ground ${ground}`);
    } else if (type === 'fpv_drone') {
      // length/width in the spec are the diagonal motor-to-motor wheelbase
      const [px, , pz] = spec.propPivots[0];
      within(name, 'motor diagonal', 2 * Math.hypot(px, pz), spec.length, 0.05);
      within(name, 'frame + warhead length', size(bbox(p.body))[2], spec.length, 0.12);
    } else {
      within(name, 'length', size(ub)[2], spec.length, 0.1);
      within(name, 'width', size(ub)[0], spec.width, 0.1);
      if (type !== 'transport_plane') within(name, 'height', size(ub)[1], spec.height, 0.2);
      else within(name, 'height (gear up)', size(ub)[1], spec.height, 0.12);
    }
    if (spec.propPivots || spec.propPivot) {
      if (!p.propBlur) fail(`${name}: missing propBlur`);
      else {
        const pivots = spec.propPivots || [spec.propPivot];
        const pa = p.propBlur.attributes.position.array;
        for (const pv of pivots) {
          let rmax = 0;
          for (let i = 0; i < pa.length; i += 3) {
            const d = Math.hypot(pa[i] - pv[0], pa[i + 1] - pv[1], pa[i + 2] - pv[2]);
            if (d <= spec.propRadius * 1.1 && d > rmax) rmax = d;
          }
          if (Math.abs(rmax - spec.propRadius) > spec.propRadius * 0.03) fail(`${name}: prop disc at ${pv} has radius ${rmax.toFixed(3)}, spec ${spec.propRadius}`);
        }
      }
    }
    if (spec.nozzle) {
      const [nx, ny, nz] = spec.nozzle;
      if (!hasVertexNear(p.body, [nx, ny, nz], 0.6)) warn(`${name}: no geometry near nozzle ${spec.nozzle}`);
    }
  }
}

// ---------------------------------------------------------------- props
const PSIZE = {
  tree_pine: [14, 20.5, 'h'], tree_broadleaf: [9, 13.5, 'h'], tree_dead: [8, 12.5, 'h'], bush: [1.0, 2.2, 'm'], rock: [0.9, 2.2, 'm'],
  sandbags: [2.9, 3.15, 'x'], hesco: [3.2, 3.5, 'x'], jersey_barrier: [2.9, 3.1, 'x'], tank_trap: [1.2, 2.2, 'm'], crates: [1.6, 2.4, 'h'],
  fuel_tank: [7.8, 9.0, 'x'], radio_mast: [29, 34, 'h'], guard_tower: [7.5, 9, 'h'], car: [4.3, 4.8, 'z'], car_wreck: [4.3, 4.8, 'z'],
  street_lamp: [6.5, 7.6, 'h'], power_pole: [8.5, 9.6, 'h'], parachute: [6.8, 8.2, 'm'], debris_concrete: [0.45, 0.9, 'm'], debris_metal: [0.6, 1.0, 'm'],
};
const TREE = new Set(['tree_pine', 'tree_broadleaf', 'tree_dead']);
for (const kind of PROP_KINDS) {
  for (const v of [0, 1, 2, 3]) {
    const name = `${kind}#${v}`;
    let m;
    try { m = buildPropModel(kind, v); } catch (e) { fail(`${name}: build threw ${e.stack}`); continue; }
    checkGeometry(`${name}.lod0`, m.lod0);
    if (m.lod1) checkGeometry(`${name}.lod1`, m.lod1);
    const t0 = tris(m.lod0), t1 = m.lod1 ? tris(m.lod1) : 0;
    const b0 = TREE.has(kind) ? 500 : 800, b1 = TREE.has(kind) ? 40 : 60;
    if (t0 > b0) fail(`${name}: lod0 ${t0} > ${b0}`);
    if (t1 > b1) fail(`${name}: lod1 ${t1} > ${b1}`);
    if (v === 0) table.push([kind, t0, t1, 0, 0, 0, t0]);
    const s = size(bbox(m.lod0));
    const lim = PSIZE[kind];
    if (lim) {
      const val = lim[2] === 'h' ? bbox(m.lod0).max[1] : lim[2] === 'x' ? s[0] : lim[2] === 'z' ? s[2] : Math.max(...s);
      if (val < lim[0] || val > lim[1]) fail(`${name}: size ${val.toFixed(2)} outside [${lim[0]}, ${lim[1]}]`);
    }
    if (kind !== 'parachute' && bbox(m.lod0).min[1] < -0.3) fail(`${name}: extends ${bbox(m.lod0).min[1].toFixed(2)} below ground`);
    if (kind === 'parachute') {
      const b = bbox(m.lod0);
      if (Math.abs(b.min[1]) > 0.05) fail(`${name}: harness point should be at the origin (min y ${b.min[1]})`);
      if (b.max[1] < 6.5 || b.max[1] > 7.5) fail(`${name}: apex at ${b.max[1].toFixed(2)}, expected ~7`);
    }
  }
  // determinism and variant variety
  const a = buildPropModel(kind, 1), b = buildPropModel(kind, 1), c = buildPropModel(kind, 2);
  if (hash(a.lod0) !== hash(b.lod0)) fail(`${kind}: not deterministic`);
  if (['tree_pine', 'tree_broadleaf', 'tree_dead', 'rock', 'bush'].includes(kind) && hash(a.lod0) === hash(c.lod0)) fail(`${kind}: variants 1 and 2 identical`);
}
{
  const c0 = buildPropModel('car', 0).lod0.attributes.color.array, c1 = buildPropModel('car', 1).lod0.attributes.color.array;
  let diff = 0;
  for (let i = 0; i < Math.min(c0.length, c1.length); i++) diff += Math.abs(c0[i] - c1[i]);
  if (diff < 1) fail('car: variant does not change paint colour');
}
for (const [type] of Object.entries(VEHICLE_SPECS)) {
  const a = buildVehicleModel(type, 1).parts.hull, b = buildVehicleModel(type, 1).parts.hull;
  if (hash(a) !== hash(b)) fail(`${type}: vehicle build not deterministic`);
}

// ---------------------------------------------------------------- timing
function buildAll() {
  for (const t of Object.keys(VEHICLE_SPECS)) for (const f of [0, 1]) buildVehicleModel(t, f);
  for (const t of Object.keys(AIRCRAFT_SPECS)) for (const f of [0, 1]) buildAircraftModel(t, f);
  for (const k of PROP_KINDS) buildPropModel(k, 0);
}
const t0 = performance.now();
buildAll();
const t1 = performance.now();
buildAll();
const t2 = performance.now();

// ---------------------------------------------------------------- report
const pad = (s, n) => String(s).padStart(n);
console.log('model                  hull/body  turret/rot  gun/blur  radar  emiss  total');
for (const [n, a, b, c, d, e, tot] of table) console.log(`${n.padEnd(22)} ${pad(a, 9)} ${pad(b, 11)} ${pad(c, 9)} ${pad(d, 6)} ${pad(e, 6)} ${pad(tot, 6)}`);
console.log(`\nbuild everything (14 vehicles, 14 aircraft, ${PROP_KINDS.length} props): first ${(t1 - t0).toFixed(0)} ms, warm ${(t2 - t1).toFixed(0)} ms`);
if (warnings.length) console.log(`\n${warnings.length} warning(s):\n  ${warnings.join('\n  ')}`);
if (errors.length) {
  console.log(`\n${errors.length} error(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log('\nall checks passed');
