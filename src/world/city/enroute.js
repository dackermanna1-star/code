// =============================================================================
// En-route settlements: small towns scattered along the route, seen as
// clusters of street lights through cloud gaps at dusk / night (by day they
// are sub-pixel from cruise altitude). Deterministic 25 km tiles in WORLD
// coordinates around the aircraft, merged into ONE points draw call that is
// rebuilt only when the set of tiles changes.
// =============================================================================
import * as THREE from 'three';
import { GEO } from '../geo.js';
import { rng, hash2 } from './util.js';
import { LAMP } from './roads.js';

const TILE = 25000;
const RADIUS = 2;            // tiles around the aircraft (5x5 = 125 km square)

export class EnRoute {
  constructor(app, material) {
    this.app = app;
    this.material = material;
    this.points = null;
    this.key = '';
    this.group = new THREE.Group();
    this.group.name = 'city.enroute';
    app.worldRoot.add(this.group);
    this._p = new THREE.Vector3();
  }
  update() {
    const app = this.app;
    const p = app.flight.state.position;
    const ti = Math.floor(p.x / TILE), tj = Math.floor(p.z / TILE);
    const key = `${ti},${tj},${app.world.arrivalOrigin.x | 0},${app.world.arrivalOrigin.z | 0}`;
    if (key === this.key) return;
    this.key = key;
    this._build(ti, tj);
  }
  _build(ti, tj) {
    const app = this.app;
    const dep = { x: app.world.departureOrigin.x, z: app.world.departureOrigin.z };
    const arr = { x: app.world.arrivalOrigin.x, z: app.world.arrivalOrigin.z };
    const P = [], C = [], A = [];
    for (let i = ti - RADIUS; i <= ti + RADIUS; i++) {
      for (let j = tj - RADIUS; j <= tj + RADIUS; j++) {
        const r = rng((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0);
        const n = r() < 0.35 ? 0 : (r() < 0.7 ? 1 : 2);
        for (let t = 0; t < n; t++) {
          const cx = (i + 0.15 + 0.7 * r()) * TILE, cz = (j + 0.15 + 0.7 * r()) * TILE;
          if (Math.hypot(cx - dep.x, cz - dep.z) < 30000 || Math.hypot(cx - arr.x, cz - arr.z) < 35000) continue;
          if (GEO.waterMask(cx, cz, dep, arr) > 0.01) continue;
          const h0 = GEO.terrainHeight(cx, cz, dep, arr);
          if (h0 > 1300) continue;
          const R = 500 + 1800 * Math.pow(r(), 2);
          const sp = 75;
          const rot = r() * Math.PI;
          const c = Math.cos(rot), s = Math.sin(rot);
          for (let gx = -R; gx <= R; gx += sp) {
            for (let gz = -R; gz <= R; gz += sp) {
              const d = Math.hypot(gx, gz) / R + 0.25 * GEO.vnoise(gx / 400 + i * 7, gz / 400 + j * 3);
              if (d > 1) continue;
              if (hash2((gx / sp) | 0, ((gz / sp) | 0) + t * 999 + i * 31 + j * 17) > 0.85 - d * 0.5) continue;
              const x = cx + gx * c - gz * s, z = cz + gx * s + gz * c;
              const y = GEO.terrainHeight(x, z, dep, arr);
              if (y < -0.5) continue;
              const core = d < 0.3;
              const col = core ? LAMP.led : (r() < 0.8 ? LAMP.sodium : LAMP.mercury);
              const E = core ? 45 : 32;
              P.push(x, y + 8, z); C.push(col[0] * E, col[1] * E, col[2] * E); A.push(3.0, 0, 0, 0);
            }
          }
        }
      }
    }
    if (this.points) { this.group.remove(this.points); this.points.geometry.dispose(); this.points = null; }
    if (!P.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aP', new THREE.Float32BufferAttribute(A, 4));
    g.computeBoundingSphere();
    this.points = new THREE.Points(g, this.material);
    this.points.name = 'city.enrouteLights';
    this.points.renderOrder = 5;
    this.group.add(this.points);
  }
}
