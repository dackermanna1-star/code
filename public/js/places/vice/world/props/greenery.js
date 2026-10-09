// Greenery along the roads: royal palms down Biscayne Boulevard's median and
// coconut palms on the others (with low hedges between), palms in sidewalk
// pits on the beach avenues, Brickell and Downtown, shade trees along the
// leafy streets of the Gables, Little Havana and the suburbs, palms lining
// the causeway approaches, and the islands' shores.
import { V } from '../../state.js';
import { hash, rnd, resample } from './kit.js';

// sidewalk trees by district style: [palm chance, shade tree chance, spacing]
const STYLE = {
  deco: [0.9, 0, 44], resort: [0.85, 0, 46], tower: [0.75, 0.05, 52], condo: [0.7, 0.1, 50],
  havana: [0.35, 0.45, 48], villa: [0.3, 0.65, 42], suburb: [0.2, 0.55, 60], lowrise: [0.25, 0.35, 64],
  warehouse: [0.15, 0.1, 90], park: [0.6, 0.3, 40], mansion: [0.8, 0.1, 36], port: [0.5, 0, 80], airport: [0.6, 0, 70],
};

export function buildGreenery(P) {
  const R = V.roads, plan = P.plan;
  if (!R) return;
  const r = rnd(4242);
  // ---- boulevard medians ----
  R.medians.forEach((m, i) => {
    const D = plan.districtAt(m.x, m.z), n = R.medians[i + 1];
    const royal = Math.abs(m.x - 500) < 12 || D.style === 'tower' || D.style === 'villa';
    if (hash(m.x, m.z, 1) > 0.06) {
      P.addPalm(m.x, m.y, m.z, royal ? 0.85 + hash(m.x, m.z, 2) * 0.2 : 0.8 + hash(m.x, m.z, 2) * 0.3, 0, royal ? 'royal' : 'coconut', true);
      P.occupy(m.x, m.z, 3);
    }
    // low hedges between the palms
    const dd = n ? Math.hypot(n.x - m.x, n.z - m.z) : 0;
    if (dd > 28 && dd < 40) for (const t of [0.35, 0.65]) if (hash(m.x, m.z, 3 + t) < 0.75) P.addBush(m.x + (n.x - m.x) * t, m.y, m.z + (n.z - m.z) * t, 0.7, hash(m.x, m.z + t, 4) < 0.3 ? 'bougain' : 'shrub');
  });
  // ---- sidewalk trees ----
  const lampGrid = new Set();
  for (const l of R.lamps) lampGrid.add(Math.round(l.x / 8) * 4096 + Math.round(l.z / 8));
  const nearLamp = (x, z) => { const i = Math.round(x / 8), j = Math.round(z / 8); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (lampGrid.has((i + a) * 4096 + j + b)) return true; return false; };
  for (const w of R.walkways) {
    const e = plan.edges[w.edge];
    if (e.bridge || e.elevated || w.w < 11) continue;
    const L = Math.hypot(w.bx - w.ax, w.bz - w.az);
    if (L < 40) continue;
    const mx = (w.ax + w.bx) / 2, mz = (w.az + w.bz) / 2, D = plan.districtAt(mx, mz), st = STYLE[D.style] || STYLE.lowrise;
    const tx = (w.bx - w.ax) / L, tz = (w.bz - w.az) / L;
    // towards the road from the walkway's centre line
    const rx = -tz * w.side, rz = tx * w.side;
    const toRoad = -1, off = w.w / 2 - 2.6;
    let spacing = st[2];
    if (e.cls === 'drive') spacing *= 0.75;
    for (let d = 18 + hash(w.ax, w.az, 7) * spacing * 0.5; d < L - 18; d += spacing * (0.85 + r() * 0.3)) {
      const x = w.ax + tx * d + rx * off * toRoad, z = w.az + tz * d + rz * off * toRoad;
      if (nearLamp(x, z) || !P.isFree(x, z, 4) || !P.free(x, z, 2)) continue;
      const q = r();
      if (q < st[0]) { P.addPalm(x, w.y, z, 0.78 + r() * 0.3, 0, D.style === 'tower' && r() < 0.5 ? 'royal' : 'coconut'); P.occupy(x, z, 3); }
      else if (q < st[0] + st[1]) { P.addTree(x, w.y, z, 0.7 + r() * 0.35); P.occupy(x, z, 4); }
    }
  }
  // ---- causeway approaches: palms either side where the road is on land near the water ----
  for (const e of plan.edges) {
    if (!e.crossing || e.elevated) continue;
    const hw = e.width / 2 + (e.walk || 0) + 7;
    const wetD = e.pts.filter((p) => p.wet).map((p) => p.d);
    if (!wetD.length) continue;
    for (let d = 10; d < e.len - 10; d += 26) {
      const p = pointOn(e, d);
      if (p.wet || p.y > 3.6) continue;
      const near = Math.min(...wetD.map((w) => Math.abs(w - d)));
      if (near > 260) continue;
      for (const s of [-1, 1]) {
        const x = p.x - p.tz * hw * s, z = p.z + p.tx * hw * s;
        if (!plan.isLand(x, z, 6) || P.roads.clear(x, z) < 2 || !P.free(x, z, 3) || !P.isFree(x, z, 4)) continue;
        P.addPalm(x, P.gy(x, z), z, 0.85 + r() * 0.25, 0, e.cls === 'blvd' ? 'royal' : 'coconut'); P.occupy(x, z, 3);
      }
    }
  }
  // ---- the islands' shores ----
  for (const id of ['watson', 'star', 'brickellkey']) {
    const Ld = plan.landById[id];
    for (const s of resample(Ld.pts, 18, true)) {
      const nx = -s.tz, nz = s.tx, x = s.x + nx * 12, z = s.z + nz * 12;
      if (r() < 0.35 || !plan.isLand(x, z) || P.roads.clear(x, z) < 2 || !P.free(x, z, 3) || !P.isFree(x, z, 4)) continue;
      P.addPalm(x, P.gy(x, z), z, 0.8 + r() * 0.35, (r() - 0.3) * 0.2); P.occupy(x, z, 3);
    }
  }
}

function pointOn(e, d) {
  const pts = e.pts;
  let i = 1;
  while (i < pts.length - 1 && pts[i].d < d) i++;
  const a = pts[i - 1], b = pts[i], L = b.d - a.d || 1, t = Math.min(1, Math.max(0, (d - a.d) / L));
  const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, tx, tz, wet: a.wet || b.wet };
}
