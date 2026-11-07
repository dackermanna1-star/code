// =============================================================================
// Road / rail ribbons draped on the terrain (one merged mesh per region), with
// optional elevated sections (bridges / flyovers: deck, parapets, piers), and a
// collector for the additive light points (street lights, warning lights).
// =============================================================================
import * as THREE from 'three';
import { resample, ST, clamp } from './util.js';

export const ROAD = { HIGHWAY: 0, ARTERIAL: 1, STREET: 2, RAIL: 3, RURAL: 4, PIER: 5 };

export class RoadNet {
  constructor(land) {
    this.land = land;
    this.P = []; this.U = []; this.R = []; this.I = [];
    this.n = 0;
  }
  /**
   * Add a road along a 2D polyline [[x, z], ...].
   * opts: type, lanes (per direction), med (median half width), hw (half width; derived for highways),
   * elev(s, L) -> metres above terrain (bridges), step (sample spacing), infra (GeoBuilder for decks / piers)
   * Returns the dense 3D centreline [{x, y, z, s, tx, tz}] for traffic / lights.
   */
  add(pts, { type = ROAD.ARTERIAL, lanes = 2, med = 0.5, hw = null, elev = null, step = 12, infra = null, deckColor = [0.32, 0.31, 0.29], minY = null } = {}) {
    const S = resample(pts, step);
    if (S.length < 2) return [];
    const L = S[S.length - 1].s;
    if (hw === null) hw = type === ROAD.RAIL ? 2.6 : type === ROAD.PIER ? 4 : med + lanes * 3.6 + (type === ROAD.HIGHWAY ? 3.0 : 1.2);
    const land = this.land;
    const out = [];
    const base = this.n;
    let prevDeck = null;
    for (let k = 0; k < S.length; k++) {
      const p = S[k];
      const rx = -p.tz, rz = p.tx;     // right-hand normal of the polyline direction
      const lx = p.x - rx * hw, lz = p.z - rz * hw, gx = p.x + rx * hw, gz = p.z + rz * hw;
      let hc = land.h(p.x, p.z), hl = land.h(lx, lz), hr = land.h(gx, gz);
      if (minY !== null) { hc = Math.max(hc, minY); hl = Math.max(hl, minY); hr = Math.max(hr, minY); }
      const e = elev ? elev(p.s, L) : 0;
      let yl, yr, yc;
      if (e > 0.3) {
        const deck = Math.max(hc, hl, hr) * 0 + hc + e;
        yl = yr = yc = deck;
      } else {
        const lift = type === ROAD.RAIL ? 0.45 : 0.18;
        yc = hc + lift; yl = Math.max(hl, hc - 1.5) + lift; yr = Math.max(hr, hc - 1.5) + lift;
        if (e > 0) { yl += e; yr += e; yc += e; }
      }
      this.P.push(lx, yl, lz, gx, yr, gz);
      this.U.push(-hw, p.s, hw, p.s);
      this.R.push(hw, lanes, type, med, hw, lanes, type, med);
      this.n += 2;
      if (k > 0) {
        const a = base + (k - 1) * 2;
        this.I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      out.push({ x: p.x, y: yc, z: p.z, s: p.s, tx: p.tx, tz: p.tz, ground: hc, deck: e > 0.3 });
      // elevated deck structure
      if (infra && e > 0.3) {
        const cur = { lx, lz, gx, gz, y: yc, x: p.x, z: p.z, ground: hc, s: p.s };
        if (prevDeck) {
          infra.setStyle(ST.PLAIN, 3.1, 3, 3).setColor(deckColor);
          const t = 1.1;      // deck thickness
          // fascia (outer faces) + parapets
          infra.quad([prevDeck.gx, prevDeck.y - t, prevDeck.gz], [cur.gx, cur.y - t, cur.gz], [cur.gx, cur.y + 1.0, cur.gz], [prevDeck.gx, prevDeck.y + 1.0, prevDeck.gz], [0, 0, 1, 0, 1, 1, 0, 1]);
          infra.quad([cur.lx, cur.y - t, cur.lz], [prevDeck.lx, prevDeck.y - t, prevDeck.lz], [prevDeck.lx, prevDeck.y + 1.0, prevDeck.lz], [cur.lx, cur.y + 1.0, cur.lz], [0, 0, 1, 0, 1, 1, 0, 1]);
          // soffit
          infra.quad([prevDeck.lx, prevDeck.y - t, prevDeck.lz], [cur.lx, cur.y - t, cur.lz], [cur.gx, cur.y - t, cur.gz], [prevDeck.gx, prevDeck.y - t, prevDeck.gz]);
          // piers every ~36 m
          if (Math.floor(cur.s / 36) !== Math.floor(prevDeck.s / 36) && cur.y - cur.ground > 2.5) {
            const pw = Math.min(hw * 0.7, 7);
            infra.box(cur.x, cur.z, cur.ground - 1, cur.y - t, 0.9, pw, Math.atan2(-p.tz, p.tx) + Math.PI / 2, { roofStyle: null });
          }
        }
        prevDeck = cur;
      } else prevDeck = null;
    }
    return out;
  }
  build(material, name) {
    if (this.n === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    const N = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n; i++) N[i * 3 + 1] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('aUv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('aRoad', new THREE.Float32BufferAttribute(this.R, 4));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.name = name;
    m.matrixAutoUpdate = false;
    m.renderOrder = -1;
    return m;
  }
}

/** Additive light points (static). */
export class LightSet {
  constructor() { this.P = []; this.C = []; this.A = []; }
  /** kind: 0 street (on with uLights), 1 always on, 2 warning (night). */
  add(x, y, z, col, size = 1.0, kind = 0, blink = 0, phase = 0) {
    this.P.push(x, y, z); this.C.push(col[0], col[1], col[2]); this.A.push(size, blink, phase, kind);
  }
  get count() { return this.P.length / 3; }
  build(material, name) {
    if (!this.P.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aP', new THREE.Float32BufferAttribute(this.A, 4));
    g.computeBoundingSphere();
    const p = new THREE.Points(g, material);
    p.name = name;
    p.matrixAutoUpdate = false;
    p.renderOrder = 5;
    return p;
  }
}

/** Street lights along a dense centreline (from RoadNet.add). */
export const LAMP = {
  sodium: [1.0, 0.5, 0.16],
  led: [1.0, 0.9, 0.78],
  mercury: [0.82, 0.92, 1.0],
};
export function lightsAlong(lights, line, { spacing = 36, offset = 8, both = false, height = 9, color = LAMP.sodium, E = 40, size = 1.2, median = false } = {}) {
  if (!line || line.length < 2) return;
  const L = line[line.length - 1].s;
  let j = 0;
  let side = 1;
  for (let s = spacing * 0.5; s < L; s += spacing) {
    while (j < line.length - 2 && line[j + 1].s < s) j++;
    const a = line[j], b = line[j + 1];
    const t = clamp((s - a.s) / Math.max(1e-6, b.s - a.s), 0, 1);
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t;
    const rx = -a.tz, rz = a.tx;
    const c = [color[0] * E, color[1] * E, color[2] * E];
    if (median) {
      lights.add(x + rx * 1.8, y + height, z + rz * 1.8, c, size);
      lights.add(x - rx * 1.8, y + height, z - rz * 1.8, c, size);
    } else if (both) {
      lights.add(x + rx * offset, y + height, z + rz * offset, c, size);
      lights.add(x - rx * offset, y + height, z - rz * offset, c, size);
    } else {
      lights.add(x + rx * offset * side, y + height, z + rz * offset * side, c, size);
      side = -side;
    }
  }
}
