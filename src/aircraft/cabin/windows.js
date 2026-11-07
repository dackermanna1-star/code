// Sculpted sidewall tiles with deep rounded window reveals, dual acrylic panes,
// pull-down shades (instanced, interactive, eased) and the over-wing exit hatch
// lining panels.
import * as THREE from 'three';
import { WINDOWS, DOORS, WINDOW } from '../../core/constants.js';
import { rng, clamp } from '../../core/util.js';
import { GeoBuilder, addBox } from './geom.js';
import { RL, CY, WIN, PROF, liningPoint, vOfY, roundedRectRay, liningFrame } from './profile.js';
import { bakeSidewall } from './bake.js';

export const TILE_HZ = WINDOW.pitch / 2;           // 0.254
export const TILE_NTOP = 10;
export const TILE_NSIDE = 12;
export const V_BOT = vOfY(PROF.arcY0);
export const V_TOP = vOfY(PROF.arcY1);
export const SHADE_OPEN_OFFSET = 0.405;

// funnel rings: [depth, hz, hv, r]
const R0 = WIN.rev, RI = WIN.inner, RO = WIN.outer;
const FUNNEL = [
  [0.004, R0.hz - 0.003, R0.hv - 0.003, R0.r - 0.003],
  [0.014, R0.hz - 0.008, R0.hv - 0.009, R0.r - 0.008],
  [0.040, (R0.hz - 0.008 + RI.hz + 0.002) / 2, (R0.hv - 0.009 + RI.hv + 0.002) / 2, (R0.r + RI.r) / 2 - 0.004],
  [0.070, RI.hz + 0.002, RI.hv + 0.002, RI.r + 0.002],
  [RI.d, RI.hz, RI.hv, RI.r],
  [0.092, RI.hz - 0.005, RI.hv - 0.006, RI.r - 0.004],
  [RO.d, RO.hz, RO.hv, RO.r],
];
const FUNNEL_AO = [0.9, 0.82, 0.7, 0.55, 0.5, 0.42, 0.32];

const _a = [0, 0, 0, 0];
function planePoint(z, u, d) {
  return [WIN.cx + WIN.ux * u + WIN.nx * d, WIN.cy + WIN.uy * u + WIN.ny * d, z];
}

/**
 * Lining tile (right side) with a window reveal centred at z = 0, covering
 * z in [-hz, hz] and arc length v in [vBot, vTop]. Returns a GeoBuilder.
 *   inset: offset of the surface towards the cabin (hatch plug panels)
 *   uOffset: sidewall texture u offset (0 or 0.5: panel seam every 2 bays)
 */
export function buildWindowTile({ hz = TILE_HZ, vBot = V_BOT, vTop = V_TOP, nTop = TILE_NTOP, nSide = TILE_NSIDE, sideV = null, inset = 0, uOffset = 0, rings = 5, funnel = true } = {}) {
  const b = new GeoBuilder('windowTile');
  // boundary points CCW (seen from the cabin; +z right, +v up): right edge up, top edge left, left edge down, bottom edge right
  const sv = sideV || Array.from({ length: nSide + 1 }, (_, i) => vBot + (vTop - vBot) * (i / nSide));
  const B = [];
  for (let i = 0; i < sv.length - 1; i++) B.push([hz, sv[i]]);
  for (let i = 0; i < nTop; i++) B.push([hz - (2 * hz) * (i / nTop), vTop]);
  for (let i = sv.length - 1; i > 0; i--) B.push([-hz, sv[i]]);
  for (let i = 0; i < nTop; i++) B.push([-hz + (2 * hz) * (i / nTop), vBot]);
  const N = B.length;
  const ang = B.map(([z, v]) => Math.atan2(v, z));
  const H = ang.map((a) => roundedRectRay(a, R0.hz, R0.hv, R0.r));
  const lp = [0, 0, 0, 0];
  const surf = (z, v, out) => {
    liningPoint(v, lp);
    out.p = [lp[0] + lp[2] * inset, lp[1] + lp[3] * inset, z];
    out.n = [lp[2], lp[3], 0];
  };
  // --- lining rings from the hole outline (j = 0) to the boundary (j = rings)
  const base = b.n;
  const o = {};
  for (let j = 0; j <= rings; j++) {
    const t = j / rings, f = Math.pow(t, 1.35);
    for (let i = 0; i < N; i++) {
      const z = H[i][0] + (B[i][0] - H[i][0]) * f, v = H[i][1] + (B[i][1] - H[i][1]) * f;
      surf(z, v, o);
      const bk = bakeSidewall(o.p[1], 1, 0);
      if (j === 0) bk[2] *= 0.93;
      b.vert(o.p[0], o.p[1], o.p[2], o.n[0], o.n[1], o.n[2], uOffset + 0.5 * (z + hz) / (2 * hz), (v - vBot) / (vTop - vBot), bk);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N;
      const a = base + j * N + i, bb = base + j * N + i2, c = base + (j + 1) * N + i2, d = base + (j + 1) * N + i;
      b.quad(a, d, c, bb);
    }
  }
  if (funnel) buildFunnel(b, ang, H, inset);
  return b;
}

/** The reveal funnel from the lining hole down to the outer pane. */
function buildFunnel(b, ang, H, inset) {
  const N = ang.length;
  const ringsP = [];
  // ring 0: hole outline on the (inset) surface
  const lp = [0, 0, 0, 0];
  ringsP.push(H.map(([z, v]) => { liningPoint(v, lp); return [lp[0] + lp[2] * inset, lp[1] + lp[3] * inset, z]; }));
  for (const [d, hz, hv, r] of FUNNEL) {
    ringsP.push(ang.map((a) => { const [z, u] = roundedRectRay(a, hz, hv, r); return planePoint(z, u, d); }));
  }
  const K = ringsP.length;
  const base = b.n;
  const per = [];
  for (let k = 0; k < K; k++) {
    for (let i = 0; i < N; i++) {
      const P = ringsP[k][i];
      const Pn = ringsP[k][(i + 1) % N], Pp = ringsP[k][(i - 1 + N) % N];
      const Mn = ringsP[Math.min(K - 1, k + 1)][i], Mp = ringsP[Math.max(0, k - 1)][i];
      const T = [Pn[0] - Pp[0], Pn[1] - Pp[1], Pn[2] - Pp[2]];
      const M = [Mn[0] - Mp[0], Mn[1] - Mp[1], Mn[2] - Mp[2]];
      let n = [T[1] * M[2] - T[2] * M[1], T[2] * M[0] - T[0] * M[2], T[0] * M[1] - T[1] * M[0]];
      // orient towards the window axis
      const d = k === 0 ? 0 : FUNNEL[k - 1][0];
      const C = planePoint(0, 0, d);
      const toAxis = [C[0] - P[0], C[1] - P[1], C[2] - P[2]];
      if (n[0] * toAxis[0] + n[1] * toAxis[1] + n[2] * toAxis[2] < 0) n = [-n[0], -n[1], -n[2]];
      if (k === 0) { // soften the lip: blend with the lining normal (pointing into the cabin)
        n = [n[0] - WIN.nx * 1.2, n[1] - WIN.ny * 1.2, n[2]];
      }
      const l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
      // facing up (sill) receives more of the sidewall wash, facing down (head) less
      const up = n[0] * WIN.ux + n[1] * WIN.uy;
      const sw = (0.25 + 0.5 * clamp(up + 0.3, 0, 1)) * (k < 2 ? 1 : 0.6);
      const ao = FUNNEL_AO[Math.max(0, k - 1)] * (k === 0 ? 1.05 : 1);
      b.vert(P[0], P[1], P[2], n[0], n[1], n[2], 0.22 + 0.06 * (i / N), 0.3 + k * 0.02, [0.07, sw, Math.min(1, ao), 0]);
    }
    per.push(k);
  }
  for (let k = 0; k < K - 1; k++) {
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N;
      const a = base + k * N + i, bb = base + k * N + i2, c = base + (k + 1) * N + i2, d = base + (k + 1) * N + i;
      b.quad(a, bb, c, d);
    }
  }
}

/** Planar rounded-rect pane (right side, window-local) as triangle fan. */
function paneBuilder(hz, hv, r, d, nSeg = 48) {
  const b = new GeoBuilder('pane');
  const c = planePoint(0, 0, d);
  const ci = b.vert(c[0], c[1], c[2], -WIN.nx, -WIN.ny, 0, 0.5, 0.5, [0, 0, 1, 0]);
  const first = b.n;
  for (let i = 0; i < nSeg; i++) {
    const a = (i / nSeg) * Math.PI * 2;
    const [z, u] = roundedRectRay(a, hz, hv, r);
    const p = planePoint(z, u, d);
    b.vert(p[0], p[1], p[2], -WIN.nx, -WIN.ny, 0, 0.5 + z / (2 * hz), 0.5 + u / (2 * hv), [0, 0, 1, 0]);
  }
  for (let i = 0; i < nSeg; i++) b.tri(ci, first + ((i + 1) % nSeg), first + i);
  return b;
}

/** Shade geometry in the shade-local frame (x across, y up, z towards the cabin). */
function shadeGeometry() {
  const b = new GeoBuilder('shade');
  const S = WIN.shade, w = S.hz, h = S.hv;
  const bake = [0.10, 0.35, 0.85, 0];
  // main panel with rounded lower corners, slightly bowed (stiff plastic)
  const nx = 8, ny = 12;
  b.grid(nx, ny, (i, j, o) => {
    const x = -w + (2 * w) * (i / nx), y = -h + (2 * h) * (j / ny);
    o.p = [x, y, -0.0015 * (1 - (x / w) ** 2)]; o.n = [0, 0, 1]; o.uv = [i / nx, j / ny]; o.bake = bake;
  });
  // grip lip at the bottom edge (towards the cabin)
  const lip = new THREE.BoxGeometry(2 * w - 0.05, 0.012, 0.016);
  b.addGeometry(lip, new THREE.Matrix4().makeTranslation(0, -h + 0.008, 0.008), [0.12, 0.45, 0.8, 0], (u, v) => [0.5 + (u - 0.5) * 0.3, 0.02 + v * 0.02]);
  // finger recess shadow strip
  const rec = new THREE.PlaneGeometry(0.09, 0.012);
  b.addGeometry(rec, new THREE.Matrix4().makeTranslation(0, -h + 0.02, 0.0005), [0.05, 0.1, 0.45, 0], () => [0.5, 0.06]);
  return b.build();
}

/**
 * Hatch (Type III over-wing exit) plug panel: lining panel with window reveal,
 * bevelled frame (built for the right side, mirrored by the caller), plus
 * side-aware handle & placards (never mirrored so text reads correctly).
 */
function buildHatchGeometry(dims) {
  const out = { lining: new GeoBuilder('hatch'), dark: new GeoBuilder('hatchDark') };
  const vb = vOfY(dims.sillY), vt = vOfY(dims.sillY + dims.height);
  const hz = dims.width / 2 - 0.002;
  out.lining.append(buildWindowTile({ hz, vBot: vb + 0.004, vTop: vt - 0.004, nTop: 10, nSide: 14, inset: 0.012, uOffset: 0.25 }));
  // bevel band around the panel edge (from the proud panel back into the lining)
  const lp = [0, 0, 0, 0];
  const edge = [];
  const ns = 14, v0 = vb + 0.004, v1 = vt - 0.004;
  for (let i = 0; i < ns; i++) edge.push([hz, v0 + (v1 - v0) * i / ns, 1, 0]);
  for (let i = 0; i < 10; i++) edge.push([hz - 2 * hz * i / 10, v1, 0, 1]);
  for (let i = 0; i < ns; i++) edge.push([-hz, v1 - (v1 - v0) * i / ns, -1, 0]);
  for (let i = 0; i < 10; i++) edge.push([-hz + 2 * hz * i / 10, v0, 0, -1]);
  const base = out.dark.n;
  for (const [zz, v, nzz, nv] of edge) {
    liningPoint(v, lp);
    const phi = Math.asin((lp[1] - CY) / RL);
    const nxp = -Math.sin(phi) * nv, nyp = Math.cos(phi) * nv;
    out.dark.vert(lp[0] + lp[2] * 0.012, lp[1] + lp[3] * 0.012, zz, nxp, nyp, nzz, 0, 0, [0.06, 0.18, 0.7, 0]);
    out.dark.vert(lp[0] - lp[2] * 0.004, lp[1] - lp[3] * 0.004, zz, nxp, nyp, nzz, 0, 0, [0.03, 0.08, 0.35, 0]);
  }
  const E = edge.length;
  for (let i = 0; i < E; i++) {
    const i2 = (i + 1) % E;
    const a = base + i * 2, bb = base + i2 * 2;
    out.dark.quad(a, bb, bb + 1, a + 1);
  }
  return out;
}

function addHatchDetails(side, dims, tex, B) {
  const fm = new THREE.Matrix4();
  const place = (geo, y, inset, lz, bucket, bake, uv) => {
    liningFrame(side, y, inset, dims.z, fm);
    fm.multiply(new THREE.Matrix4().makeTranslation(0, 0, lz));
    B[bucket].addGeometry(geo, fm, bake, uv);
  };
  const uvr = (r) => (u, v) => [r[0] + (r[2] - r[0]) * u, r[1] + (r[3] - r[1]) * v];
  const top = dims.sillY + dims.height;
  // handle well + red pull handle + 'PULL' placard
  place(new THREE.BoxGeometry(0.006, 0.07, 0.25), top - 0.085, 0.012, 0, 'dark', [0.04, 0.05, 0.35, 0]);
  place(new THREE.BoxGeometry(0.024, 0.028, 0.2), top - 0.085, 0.022, 0, 'red', [0.1, 0.25, 0.9, 0]);
  place(new THREE.PlaneGeometry(0.075, 0.032).rotateY(Math.PI / 2), top - 0.085, 0.0345, 0, 'placard', [0.12, 0.35, 1, 0], uvr(tex.placardRect('pull')));
  // clear protective cover over the handle (thin frame)
  place(new THREE.BoxGeometry(0.03, 0.004, 0.23), top - 0.05, 0.024, 0, 'dark', [0.1, 0.2, 0.8, 0]);
  // instruction placard below the window and 'EXIT' above it
  place(new THREE.PlaneGeometry(0.12, 0.165).rotateY(Math.PI / 2), 0.66, 0.0135, 0, 'placard', [0.1, 0.35, 0.95, 0], uvr(tex.placardRect('hatch-instr')));
  place(new THREE.PlaneGeometry(0.11, 0.034).rotateY(Math.PI / 2), 1.305, 0.0135, 0, 'placard', [0.1, 0.5, 1, 0], uvr(tex.placardRect('exit-red')));
}

/** Window basis matrix (shade-local frame) for a side. */
function windowBasis(side, z, d, u, target) {
  const s = side === 'left' ? -1 : 1;
  const Nx = WIN.nx * s, Ny = WIN.ny, Ux = WIN.ux * s, Uy = WIN.uy;
  // x: across (+z on the right side, -z on the left), y: U, z: -N (towards the cabin)
  target.set(
    0, Ux, -Nx, WIN.cx * s + Nx * d + Ux * u,
    0, Uy, -Ny, WIN.cy + Ny * d + Uy * u,
    s, 0, 0, z,
    0, 0, 0, 1,
  );
  return target;
}

export function createWindows(app, M, tex, root, opts = {}) {
  const detail = app.quality?.detail ?? 1;
  const group = new THREE.Group();
  group.name = 'cabin-windows';
  root.add(group);

  // --- panes (merged, both sides) -------------------------------------------------
  const innerR = paneBuilder(RI.hz + 0.004, RI.hv + 0.004, RI.r + 0.003, RI.d);
  const outerR = paneBuilder(RO.hz + 0.004, RO.hv + 0.004, RO.r + 0.003, RO.d);
  const inner = new GeoBuilder('panesInner'), outer = new GeoBuilder('panesOuter');
  const zs = [...new Set(WINDOWS.map((w) => w.z))];
  for (const z of zs) {
    const r1 = new GeoBuilder().appendTranslated(innerR, 0, 0, z);
    inner.append(r1); inner.appendMirroredX(r1);
    const r2 = new GeoBuilder().appendTranslated(outerR, 0, 0, z);
    outer.append(r2); outer.appendMirroredX(r2);
  }
  const paneOuter = new THREE.Mesh(outer.build(), M.paneOuter);
  paneOuter.renderOrder = 2; paneOuter.name = 'cabin-panes-outer';
  const paneInner = new THREE.Mesh(inner.build(), M.paneInner);
  paneInner.renderOrder = 3; paneInner.name = 'cabin-panes-inner';
  group.add(paneOuter, paneInner);

  // --- hatch panels -------------------------------------------------------------------
  const hatchBuild = { lining: new GeoBuilder(), dark: new GeoBuilder(), red: new GeoBuilder(), placard: new GeoBuilder() };
  for (const id of ['OWL1', 'OWL2', 'OWR1', 'OWR2']) {
    const D = { ...DOORS[id] };
    const parts = buildHatchGeometry(D);
    for (const k of Object.keys(parts)) {
      const t = new GeoBuilder().appendTranslated(parts[k], 0, 0, D.z);
      if (D.side === 'left') hatchBuild[k].appendMirroredX(t); else hatchBuild[k].append(t);
    }
    addHatchDetails(D.side, D, tex, hatchBuild);
  }
  const hatchMeshes = [];
  for (const [k, mat] of [['lining', M.sidewall], ['dark', M.darkPlastic], ['red', M.red], ['placard', M.placard]]) {
    if (hatchBuild[k].empty) continue;
    const mesh = new THREE.Mesh(hatchBuild[k].build(), mat);
    mesh.castShadow = k === 'lining' || k === 'dark'; mesh.receiveShadow = true; mesh.name = 'cabin-hatch-' + k;
    group.add(mesh); hatchMeshes.push(mesh);
  }

  // --- shades -------------------------------------------------------------------------
  const sGeo = shadeGeometry();
  const shades = new THREE.InstancedMesh(sGeo, M.shade, WINDOWS.length);
  shades.name = 'cabin-shades';
  shades.castShadow = true; shades.receiveShadow = true;
  shades.frustumCulled = false;
  group.add(shades);
  // pick proxies
  const proxyGeo = new THREE.BoxGeometry(0.36, 0.5, 0.09);
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  const proxies = new THREE.InstancedMesh(proxyGeo, proxyMat, WINDOWS.length);
  proxies.name = 'cabin-window-proxies';
  group.add(proxies);

  const R = rng(48207);
  const m = new THREE.Matrix4();
  const list = [];
  const active = new Set();
  WINDOWS.forEach((w, i) => {
    // realistic gate state: most shades up, a few half or fully down
    let s0 = 0;
    const r = R();
    if (!w.inHatch) { if (r < 0.12) s0 = 0.35 + R() * 0.3; else if (r < 0.2) s0 = 0.75 + R() * 0.25; else if (r < 0.24) s0 = 1; }
    const sgn = w.side === 'left' ? -1 : 1;
    const pos = new THREE.Vector3(WIN.cx * sgn, WIN.cy, w.z);
    const entry = {
      index: w.index, z: w.z, side: w.side, inHatch: !!w.inHatch, shade: s0, mesh: shades, instanceId: i, position: pos,
      _from: s0, _to: s0, _t: 1, _dur: 1,
      setShade(v, { sound = true, instant = false } = {}) {
        v = clamp(v, 0, 1);
        if (instant) { this.shade = this._to = this._from = v; this._t = 1; writeShade(i, v); return; }
        if (Math.abs(v - this._to) < 1e-3) return;
        if (sound) app.audio?.play?.(v > this.shade ? 'shade_down' : 'shade_up', { position: pos, volume: 0.9 });
        this._from = this.shade; this._to = v; this._t = 0; this._dur = 0.45 + Math.abs(v - this.shade) * 0.55;
        active.add(this);
      },
      toggle() { this.setShade(this.shade > 0.15 ? 0 : 1); },
    };
    list.push(entry);
    windowBasis(w.side, w.z, WIN.shade.d, 0, m);
    m.multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.035));
    proxies.setMatrixAt(i, m);
    writeShade(i, s0);
  });
  proxies.instanceMatrix.needsUpdate = true;
  proxies.computeBoundingSphere();

  function writeShade(i, v) {
    const w = WINDOWS[i];
    windowBasis(w.side, w.z, WIN.shade.d, (1 - v) * SHADE_OPEN_OFFSET, m);
    shades.setMatrixAt(i, m);
    shades.instanceMatrix.needsUpdate = true;
  }

  // interactions: one entry per window on the proxy InstancedMesh
  const handles = [];
  if (app.interactions?.add) {
    list.forEach((e, i) => {
      handles.push(app.interactions.add({
        object: proxies, instanceId: i, maxDistance: 2.1, priority: 1,
        label: () => (e._to > 0.15 ? 'Raise window shade' : 'Lower window shade'),
        onInteract: () => e.toggle(),
      }));
    });
  }

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function update(dt) {
    if (active.size === 0) return;
    for (const e of active) {
      e._t = Math.min(1, e._t + dt / e._dur);
      // slight overshoot-free spring feel: eased tween
      e.shade = e._from + (e._to - e._from) * ease(e._t);
      writeShade(e.instanceId, e.shade);
      if (e._t >= 1) { e.shade = e._to; active.delete(e); }
    }
  }

  return { list, update, shades, proxies, paneInner, paneOuter, hatchMeshes, group };
}
