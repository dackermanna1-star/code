// Small decor: rounded toy-like plants (with a gentle "breathing" sway), cookbooks, mugs,
// a plate stack, a cookie jar and a diner napkin holder. All built at their local origin
// (bottom centre); static parts are merged by the caller.

import * as THREE from 'three';
import { PALETTE } from '../palette';
import {
  part, grp, rbox, rboxB, lathe, fillet, puck, tube, mergeGeo, xf,
  lacquer, enamel, matte, chrome, glass, Rand, type V3,
} from '../props/util';

export interface Plant {
  root: THREE.Group;
  foliage: THREE.Group;
  phase: number;
}

/** A soft leaf: an ellipsoid along +X (base at origin), drooping and folded along its midrib. */
function leafGeo(len: number, wid: number, thick: number, droop = 0.25, fold = 0.25, ws = 10, hs = 6): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, ws, hs).translate(1, 0, 0).scale(len / 2, thick, wid / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = x / len;
    p.setY(i, y - droop * len * t * t + Math.abs(z) * fold);
  }
  g.computeVertexNormals();
  return g;
}

function potGeo(r: number, h: number): THREE.BufferGeometry {
  return lathe(fillet([[0, 0], [r * 0.78, 0, r * 0.12], [r, h * 0.9, r * 0.1], [r * 1.08, h * 0.93, r * 0.04], [r * 1.08, h, r * 0.03], [r * 0.92, h], [r * 0.9, h * 0.9]], 4), 28);
}

function pot(parent: THREE.Object3D, r: number, h: number, color: string, band = PALETTE.cream) {
  part(parent, potGeo(r, h), lacquer(color, 0.32));
  part(parent, new THREE.TorusGeometry(r * 0.98, r * 0.045, 6, 28).rotateX(Math.PI / 2), lacquer(band, 0.32), { pos: [0, h * 0.62, 0] });
  part(parent, puck(r * 0.9, h * 0.05, r * 0.05, 20), matte('#6a4a36', 0.95), { pos: [0, h * 0.84, 0], cast: false });
}

/** Place a leaf (built along +X, flat in XZ): roll about its own axis, pitch up, then yaw. */
function leafAt(g: THREE.BufferGeometry, pos: V3, yaw: number, pitch: number, roll: number): THREE.BufferGeometry {
  const m = new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationZ(pitch)).multiply(new THREE.Matrix4().makeRotationX(roll));
  m.setPosition(pos[0], pos[1], pos[2]);
  return g.clone().applyMatrix4(m);
}

/** Big fiddle-leaf style floor plant (~1.2 m): a short trunk with a crown of broad round leaves. */
export function bigPlant(seed = 1): Plant {
  const root = new THREE.Group();
  root.name = 'bigPlant';
  pot(root, 0.165, 0.32, PALETTE.coral);
  const foliage = grp(root, [0, 0.28, 0], 'foliage');
  const r = new Rand(seed * 13);
  const stems: THREE.BufferGeometry[] = [];
  const leavesA: THREE.BufferGeometry[] = [];
  const leavesB: THREE.BufferGeometry[] = [];
  // trunk + three branches
  const trunkTop: V3 = [0.02, 0.62, 0.0];
  stems.push(tube([[0, 0, 0], [0.01, 0.3, 0.01], trunkTop], 0.014, 16, 8));
  const tips: V3[] = [trunkTop];
  for (let b = 0; b < 3; b++) {
    const a = b * 2.1 + 0.4;
    const tip: V3 = [Math.cos(a) * 0.17, 0.5 + b * 0.09, Math.sin(a) * 0.17];
    stems.push(tube([[0.01, 0.28 + b * 0.06, 0], [tip[0] * 0.5, tip[1] - 0.08, tip[2] * 0.5], tip], 0.009, 12, 6));
    tips.push(tip);
  }
  const big = leafGeo(1, 0.8, 0.055, 0.18, 0.12, 18, 10);
  let k = 0;
  for (const tip of tips) {
    const n = tip === trunkTop ? 9 : 6;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + r.range(-0.4, 0.4) + k;
      const L = r.range(0.18, 0.25);
      const pos: V3 = [tip[0] + Math.cos(a) * 0.02, tip[1] - j * 0.03 + r.range(-0.02, 0.02), tip[2] + Math.sin(a) * 0.02];
      const geo = leafAt(big, pos, -a, r.range(0.35, 0.95), r.range(-0.7, 0.7));
      const sc = new THREE.Matrix4().makeTranslation(pos[0], pos[1], pos[2]).multiply(new THREE.Matrix4().makeScale(L, L, L)).multiply(new THREE.Matrix4().makeTranslation(-pos[0], -pos[1], -pos[2]));
      geo.applyMatrix4(sc);
      ((j + k) % 2 ? leavesB : leavesA).push(geo);
    }
    k += 1.3;
  }
  // top bud leaves
  for (let j = 0; j < 3; j++) {
    const geo = leafAt(leafGeo(0.15, 0.11, 0.009, 0.06, 0.1, 14, 8), [trunkTop[0], trunkTop[1] + 0.02, trunkTop[2]], j * 2.1, 1.15, 0.3);
    leavesA.push(geo);
  }
  part(foliage, mergeGeo(stems), enamel('#6a8a3a', 0.6), { cast: false });
  part(foliage, mergeGeo(leavesA), lacquer(PALETTE.leaf, 0.42));
  part(foliage, mergeGeo(leavesB), lacquer(PALETTE.leafDark, 0.42));
  return { root, foliage, phase: seed * 1.7 };
}

/** Small potted plant: 'succulent' rosette, 'bush' (round herb) or 'trailing' (pothos vines). */
export function smallPlant(kind: 'succulent' | 'bush' | 'trailing', potColor: string, seed = 1, trail = 0.3): Plant {
  const root = new THREE.Group();
  root.name = 'plant:' + kind;
  const r = new Rand(seed * 31);
  const pr = kind === 'trailing' ? 0.07 : 0.055;
  const ph = kind === 'trailing' ? 0.1 : 0.08;
  pot(root, pr, ph, potColor);
  const foliage = grp(root, [0, ph * 0.86, 0], 'foliage');
  const a: THREE.BufferGeometry[] = [], b: THREE.BufferGeometry[] = [], stems: THREE.BufferGeometry[] = [];
  if (kind === 'succulent') {
    for (let ring = 0; ring < 3; ring++) {
      const m = 7 - ring * 2;
      for (let i = 0; i < m; i++) {
        const yaw = (i / m) * Math.PI * 2 + ring * 0.5;
        const L = 0.07 - ring * 0.015;
        (ring % 2 ? b : a).push(xf(leafGeo(L, L * 0.55, L * 0.22, -0.1, 0.05), [0, ring * 0.012, 0], [0, yaw, 0.3 + ring * 0.45]));
      }
    }
  } else if (kind === 'bush') {
    for (let i = 0; i < 22; i++) {
      const yaw = r.range(0, Math.PI * 2);
      const L = r.range(0.05, 0.075);
      (i % 2 ? b : a).push(xf(leafGeo(L, L * 0.62, 0.006, 0.15, 0.25), [r.range(-0.015, 0.015), r.range(0.0, 0.06), r.range(-0.015, 0.015)], [0, yaw, r.range(0.2, 1.1)]));
    }
  } else {
    // trailing vines spilling forward (+Z) and down
    for (let v = 0; v < 5; v++) {
      const x = (v - 2) * 0.03 + r.range(-0.01, 0.01);
      const len = trail * r.range(0.6, 1.1) * (v === 2 ? 1.2 : 1);
      const pts: V3[] = [
        [x * 0.5, 0.02, 0],
        [x, 0.045, 0.06],
        [x * 1.4, 0.0, pr + 0.06],
        [x * 1.6 + r.range(-0.02, 0.02), -len * 0.55, pr + 0.075],
        [x * 1.8 + r.range(-0.03, 0.03), -len, pr + 0.07],
      ];
      stems.push(tube(pts, 0.0035, 32, 5, false, 0.5));
      const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
      const k = Math.round(len / 0.045) + 2;
      for (let j = 1; j <= k; j++) {
        const q = curve.getPoint(j / (k + 0.5));
        const side = j % 2 ? 1 : -1;
        (j % 3 ? a : b).push(xf(leafGeo(0.045, 0.034, 0.005, 0.12, 0.2), [q.x, q.y, q.z], [0, side > 0 ? -0.3 : Math.PI + 0.3, -0.4 + r.range(-0.3, 0.3)]));
      }
    }
    for (let i = 0; i < 6; i++) a.push(xf(leafGeo(0.05, 0.038, 0.005, 0.12, 0.2), [0, 0.02, 0], [0, (i / 6) * Math.PI * 2, 0.45]));
  }
  if (stems.length) part(foliage, mergeGeo(stems), enamel('#5a8a3a', 0.6), { cast: false });
  if (a.length) part(foliage, mergeGeo(a), lacquer(kind === 'succulent' ? '#8fd1a8' : PALETTE.leaf, 0.42));
  if (b.length) part(foliage, mergeGeo(b), lacquer(kind === 'succulent' ? '#6cbf8e' : PALETTE.leafDark, 0.42));
  return { root, foliage, phase: seed * 2.3 };
}

export function updatePlant(p: Plant, time: number) {
  const s = Math.sin(time * 1.1 + p.phase);
  p.foliage.scale.set(1 + s * 0.008, 1 + s * 0.016, 1 + s * 0.008);
  p.foliage.rotation.z = Math.sin(time * 0.6 + p.phase * 1.3) * 0.012;
  p.foliage.rotation.x = Math.sin(time * 0.5 + p.phase * 0.7) * 0.008;
}

// ---------------------------------------------------------------------------------------------

/** Row of chunky cookbooks standing along X (spines facing +Z). */
export function cookbooks(colors: string[], seed = 1): THREE.Group {
  const g = new THREE.Group();
  g.name = 'cookbooks';
  const r = new Rand(seed * 5);
  let x = 0;
  colors.forEach((c, i) => {
    const t = r.range(0.028, 0.042), h = r.range(0.17, 0.22), d = r.range(0.13, 0.15);
    const lean = i === colors.length - 1 ? -0.22 : 0;
    const b = grp(g, [x + t / 2 + (lean ? 0.03 : 0), 0, 0], 'book', [0, 0, lean]);
    part(b, rboxB(t, h, d, 0.006, 2), lacquer(c, 0.45));
    part(b, rboxB(t - 0.008, h - 0.012, d - 0.004, 0.003, 1), matte('#fff8ea', 0.85), { pos: [0, 0.006, -0.004], cast: false });
    for (const y of [h * 0.22, h * 0.78]) part(b, rbox(t + 0.002, 0.008, 0.004, 0.002, 1), lacquer(i % 2 ? PALETTE.butter : PALETTE.cream, 0.4), { pos: [0, y, d / 2], cast: false });
    x += t + 0.004;
  });
  return g;
}

export function mug(color: string): THREE.Group {
  const g = new THREE.Group();
  g.name = 'mug';
  const R = 0.04, H = 0.085;
  part(g, lathe(fillet([[0, 0], [R - 0.006, 0, 0.006], [R, 0.008, 0.006], [R, H, 0.003], [R - 0.005, H], [R - 0.005, 0.012, 0.006], [0, 0.012]], 3), 28), lacquer(color, 0.3));
  part(g, new THREE.TorusGeometry(0.024, 0.0065, 10, 24, Math.PI * 1.2).rotateZ(-Math.PI * 0.6), lacquer(color, 0.3), { pos: [R + 0.006, H * 0.52, 0] });
  part(g, new THREE.TorusGeometry(R - 0.0015, 0.0025, 6, 36).rotateX(Math.PI / 2), lacquer(PALETTE.cream, 0.3), { pos: [0, H * 0.7, 0], cast: false });
  return g;
}

export function plateStack(n = 4): THREE.Group {
  const g = new THREE.Group();
  g.name = 'plates';
  const geo = lathe(fillet([[0, 0], [0.06, 0, 0.004], [0.075, 0.008, 0.01], [0.1, 0.014, 0.004], [0.098, 0.017], [0.072, 0.011, 0.01], [0, 0.009]], 3), 32);
  const cols = ['#ffffff', PALETTE.cabinet, '#ffffff', PALETTE.butter, '#ffffff'];
  for (let i = 0; i < n; i++) part(g, geo, lacquer(cols[i % cols.length], 0.25), { pos: [0, i * 0.011, 0] });
  return g;
}

export function cookieJar(scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.name = 'cookieJar';
  const R = 0.075 * scale, H = 0.15 * scale;
  const prof = fillet([[0, 0], [R - 0.01, 0, 0.01], [R, 0.015, 0.012], [R, H - 0.02, 0.02], [R * 0.78, H, 0.006], [R * 0.78, H + 0.008]], 4);
  // cookies inside (drawn first, opaque)
  const cookie = puck(0.034 * scale, 0.012 * scale, 0.005, 16, 2);
  const chips: THREE.BufferGeometry[] = [];
  const cookies: THREE.BufferGeometry[] = [];
  const r = new Rand(4);
  for (let i = 0; i < 7; i++) {
    const y = 0.006 + (i % 4) * 0.02 * scale + Math.floor(i / 4) * 0.035 * scale;
    const pos: V3 = [r.range(-0.025, 0.025) * scale, y, r.range(-0.02, 0.025) * scale];
    const rot: V3 = [r.range(-0.6, 0.6), r.range(0, 3), r.range(-0.9, 0.9)];
    cookies.push(xf(cookie, pos, rot));
    for (let k = 0; k < 4; k++) {
      const a = r.range(0, Math.PI * 2), rr = r.range(0.006, 0.024) * scale;
      chips.push(xf(new THREE.SphereGeometry(0.0045 * scale, 6, 4), [Math.cos(a) * rr, 0.012 * scale, Math.sin(a) * rr], [0, 0, 0]).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1))));
    }
  }
  part(g, mergeGeo(cookies), lacquer('#e2a866', 0.6));
  part(g, mergeGeo(chips), enamel('#5a3220', 0.5), { cast: false });
  part(g, lathe(prof, 36), glass('#f3fbff', 0.28), { order: 3 });
  // lid with a knob
  part(g, lathe(fillet([[0, H + 0.03 * scale], [R * 0.7, H + 0.022 * scale, 0.02], [R * 0.9, H + 0.006, 0.006], [R * 0.9, H], [R * 0.75, H - 0.004]], 4), 36), lacquer(PALETTE.coral, 0.3));
  part(g, new THREE.SphereGeometry(0.016 * scale, 18, 12), lacquer(PALETTE.cream, 0.3), { pos: [0, H + 0.04 * scale, 0] });
  return g;
}

/** Chrome diner napkin dispenser (napkins facing ±X). */
export function napkinHolder(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'napkins';
  part(g, rboxB(0.12, 0.012, 0.075, 0.005, 2), chrome());
  for (const s of [-1, 1]) part(g, rboxB(0.012, 0.11, 0.075, 0.005, 2), chrome(), { pos: [s * 0.052, 0.006, 0] });
  part(g, rboxB(0.09, 0.1, 0.07, 0.006, 2), matte('#ffffff', 0.9), { pos: [0, 0.008, 0] });
  part(g, rbox(0.022, 0.05, 0.002, 0.004, 1), lacquer(PALETTE.coral, 0.4), { pos: [0.059, 0.06, 0], rot: [0, Math.PI / 2, 0], cast: false });
  return g;
}

