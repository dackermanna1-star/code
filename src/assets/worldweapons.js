// Third-person / dropped weapon models (p_ / w_ models): very low poly, readable silhouettes.
// Local frame: grip at origin, barrel toward +X, top of the weapon +Z, GoldSrc units.
import * as THREE from 'three';
import { createLightUniforms, createGsMaterial, setLightUniforms, canvasTexture } from './pm/gslight.js';

// ------------------------------------------------------------------ palette texture
// 4x4 swatches of 32x32 px; every face samples one swatch (with a little painted wear).
const SW = {
  black: 0, dark: 1, gun: 2, silver: 3, wood: 4, darkwood: 5, olive: 6, darkolive: 7,
  tan: 8, green: 9, greygreen: 10, red: 11, brass: 12, rubber: 13, steel: 14, clay: 15,
};
const SW_COL = ['#262628', '#3c3d40', '#5a5c60', '#a4a6aa', '#7a4c26', '#56341a', '#56603a', '#3c4428',
  '#a08a5c', '#4c5c34', '#646e64', '#a82020', '#b08a3a', '#1a1a1a', '#b4b8bc', '#b6a274'];

let paletteTex = null;
function palette() {
  if (paletteTex) return paletteTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  SW_COL.forEach((col, i) => {
    const x = (i % 4) * 32, y = Math.floor(i / 4) * 32;
    g.fillStyle = col; g.fillRect(x, y, 32, 32);
    const grd = g.createLinearGradient(0, y, 0, y + 32);
    grd.addColorStop(0, 'rgba(255,255,255,0.10)'); grd.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = grd; g.fillRect(x, y, 32, 32);
    if (i === SW.wood || i === SW.darkwood) {
      for (let k = 0; k < 10; k++) {
        g.strokeStyle = `rgba(40,20,5,${0.25 + rnd() * 0.3})`;
        g.beginPath(); const yy = y + rnd() * 32; g.moveTo(x, yy); g.bezierCurveTo(x + 10, yy + 3, x + 20, yy - 3, x + 32, yy + rnd() * 3); g.stroke();
      }
    }
    if (i === SW.steel) {
      const gg = g.createLinearGradient(x, 0, x + 32, 0);
      gg.addColorStop(0, 'rgba(255,255,255,0.25)'); gg.addColorStop(0.5, 'rgba(0,0,0,0.1)'); gg.addColorStop(1, 'rgba(255,255,255,0.2)');
      g.fillStyle = gg; g.fillRect(x, y, 32, 32);
    }
    const img = g.getImageData(x, y, 32, 32);
    for (let p = 0; p < img.data.length; p += 4) {
      const n = (rnd() - 0.5) * (i === SW.red ? 10 : 22);
      img.data[p] += n; img.data[p + 1] += n; img.data[p + 2] += n;
    }
    g.putImageData(img, x, y);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.strokeRect(x + 2.5, y + 2.5, 27, 27); // edge wear line
  });
  paletteTex = canvasTexture(c);
  paletteTex.name = 'worldweapon_palette';
  return paletteTex;
}

// ------------------------------------------------------------------ geometry builder
class WB {
  constructor() { this.P = []; this.N = []; this.UV = []; this.tris = 0; }

  _uv(sw, a, b) {
    const x = (sw % 4) * 32, y = Math.floor(sw / 4) * 32;
    return [(x + 4 + a * 24) / 128, 1 - (y + 4 + (1 - b) * 24) / 128];
  }

  quad(a, b, c, d, sw) { // CCW from outside
    const n = new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a))
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...d), new THREE.Vector3(...b))).normalize();
    const uv = [this._uv(sw, 0, 0), this._uv(sw, 1, 0), this._uv(sw, 1, 1), this._uv(sw, 0, 1)];
    for (const [i, j, k] of [[0, 1, 2], [0, 2, 3]]) {
      for (const idx of [i, j, k]) {
        this.P.push(...[a, b, c, d][idx]); this.N.push(n.x, n.y, n.z); this.UV.push(...uv[idx]);
      }
      this.tris++;
    }
  }

  tri(a, b, c, sw) {
    const n = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a))
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a))).normalize();
    const uv = [this._uv(sw, 0, 0), this._uv(sw, 1, 0), this._uv(sw, 0.5, 1)];
    [a, b, c].forEach((p, i) => { this.P.push(...p); this.N.push(n.x, n.y, n.z); this.UV.push(...uv[i]); });
    this.tris++;
  }

  /** Hexahedron from 8 corners: bottom face b0..b3 then top t0..t3, each CCW seen from above,
   *  ordered (-x,-y), (+x,-y), (+x,+y), (-x,+y). */
  hex(c, sw, skip = {}) {
    const [b0, b1, b2, b3, t0, t1, t2, t3] = c;
    if (!skip.bottom) this.quad(b0, b3, b2, b1, sw);
    if (!skip.top) this.quad(t0, t1, t2, t3, sw);
    if (!skip.right) this.quad(b0, b1, t1, t0, sw); // -y side
    if (!skip.left) this.quad(b2, b3, t3, t2, sw); // +y side
    if (!skip.back) this.quad(b3, b0, t0, t3, sw); // -x
    if (!skip.front) this.quad(b1, b2, t2, t1, sw); // +x
  }

  /** Axis-aligned box: x0..x1, z0..z1, width w (centred on y = yc). */
  box(x0, x1, z0, z1, w, sw, yc = 0) {
    const y0 = yc - w / 2, y1 = yc + w / 2;
    this.hex([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], sw);
  }

  /** Tapered box along X: section at x0 = [z0,z1,w], at x1 = [z0,z1,w]. */
  taper(x0, s0, x1, s1, sw, yc = 0) {
    const [a0, a1, wa] = s0, [b0, b1, wb] = s1;
    const xa = Math.min(x0, x1) === x0;
    const P = (x, z, y) => [x, yc + y, z];
    const L = xa ? [x0, a0, a1, wa] : [x1, b0, b1, wb];
    const R = xa ? [x1, b0, b1, wb] : [x0, a0, a1, wa];
    this.hex([P(L[0], L[1], -L[3] / 2), P(R[0], R[1], -R[3] / 2), P(R[0], R[1], R[3] / 2), P(L[0], L[1], L[3] / 2),
      P(L[0], L[2], -L[3] / 2), P(R[0], R[2], -R[3] / 2), P(R[0], R[2], R[3] / 2), P(L[0], L[2], L[3] / 2)], sw);
  }

  /** Slanted block (grips, magazines): top edge x range at height zt, bottom edge x range at zb. */
  slant(top, zt, bot, zb, w, sw, yc = 0) {
    const y0 = yc - w / 2, y1 = yc + w / 2;
    this.hex([[bot[0], y0, zb], [bot[1], y0, zb], [bot[1], y1, zb], [bot[0], y1, zb],
      [top[0], y0, zt], [top[1], y0, zt], [top[1], y1, zt], [top[0], y1, zt]], sw);
  }

  /** Cylinder along an axis ('x' | 'y' | 'z') between a0..a1, centred at (p, q) in the other two axes. */
  cyl(axis, a0, a1, p, q, r, sw, sides = 6, caps = true) {
    const pt = (a, ang) => {
      const u = Math.cos(ang) * r, v = Math.sin(ang) * r;
      if (axis === 'x') return [a, p + u, q + v];
      if (axis === 'y') return [p + v, a, q + u];
      return [p + u, q + v, a];
    };
    const off = Math.PI / sides;
    for (let i = 0; i < sides; i++) {
      const t0 = off + (i / sides) * Math.PI * 2, t1 = off + ((i + 1) / sides) * Math.PI * 2;
      this.quad(pt(a0, t0), pt(a0, t1), pt(a1, t1), pt(a1, t0), sw);
    }
    if (caps) {
      for (let i = 1; i < sides - 1; i++) {
        const t = (k) => off + (k / sides) * Math.PI * 2;
        this.tri(pt(a1, t(0)), pt(a1, t(i)), pt(a1, t(i + 1)), sw);
        this.tri(pt(a0, t(0)), pt(a0, t(i + 1)), pt(a0, t(i)), sw);
      }
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ weapon shapes
const C = SW;
// Generic parts ------------------------------------------------------
function pistolGrip(b, sw = C.black, w = 1.15, top = [-1.9, 0.7], bot = [-2.9, -0.5], zt = 1.0, zb = -3.2) {
  b.slant(top, zt, bot, zb, w, sw);
}
function triggerGuard(b, x0 = 0.4, x1 = 2.6, sw = C.black) {
  b.box(x0, x1, -0.15, 0.2, 0.45, sw);
  b.box(x1 - 0.35, x1, -0.15, 1.0, 0.45, sw);
}
function rifleMag(b, x0, x1, curve, len, sw = C.black, w = 1.0, z0 = 1.0) {
  // two segments for a curved magazine
  const h = len / 2;
  b.slant([x0, x1], z0, [x0 + curve * 0.4, x1 + curve * 0.4], z0 - h, w, sw);
  b.slant([x0 + curve * 0.4, x1 + curve * 0.4], z0 - h, [x0 + curve, x1 + curve * 0.9], z0 - len, w, sw);
}
function scope(b, x0, x1, z, r, sw = C.black) {
  b.cyl('x', x0 + 1.2, x1 - 1.2, 0, z, r, sw, 6);
  b.cyl('x', x0, x0 + 1.2, 0, z, r * 1.25, sw, 6);
  b.cyl('x', x1 - 1.2, x1, 0, z, r * 1.45, sw, 6);
  b.box((x0 + x1) / 2 - 1.6, (x0 + x1) / 2 + 1.6, z - r - 0.9, z - r + 0.1, 0.8, sw); // mount
}

const DEFS = {};
const def = (id, hold, opts, build) => { DEFS[id] = { id, hold, ...opts, build }; };

// --- melee
def('knife', 'knife', { muzzle: [10.5, 0, 0.2] }, (b) => {
  b.taper(-2.4, [-0.6, 0.55, 1.0], 2.2, [-0.5, 0.5, 1.05], C.rubber);
  b.box(-2.9, -2.4, -0.55, 0.5, 1.05, C.dark); // pommel
  b.box(2.2, 2.6, -1.0, 1.1, 1.3, C.dark); // guard
  b.taper(2.6, [-0.75, 0.75, 0.35], 9.0, [-0.2, 0.55, 0.2], C.steel);
  b.hex([[9.0, -0.1, -0.2], [11.0, -0.02, 0.3], [11.0, 0.02, 0.3], [9.0, 0.1, -0.2],
    [9.0, -0.1, 0.55], [11.0, -0.02, 0.36], [11.0, 0.02, 0.36], [9.0, 0.1, 0.55]], C.steel);
});

// --- pistols
function pistol(b, o) {
  const { len = 7.2, back = -2.2, slide = C.black, frame = C.black, grip = C.black, h = 1.5, w = 1.1, barrel = 0 } = o;
  b.box(back, back + len, 1.5, 1.5 + h, w, slide);
  b.box(back + 0.3, back + len - 0.4, 0.8, 1.5, w * 0.92, frame);
  pistolGrip(b, grip, w * 1.02);
  triggerGuard(b);
  b.box(back + len - 0.6, back + len - 0.2, 1.5 + h, 1.5 + h + 0.3, 0.3, slide); // front sight
  b.box(back + 0.2, back + 0.7, 1.5 + h, 1.5 + h + 0.3, 0.7, slide); // rear sight
  if (barrel) b.cyl('x', back + len, back + len + barrel, 0, 1.5 + h * 0.55, 0.42, C.dark, 6);
}
def('glock', 'pistol', { muzzle: [5.0, 0, 2.3], mag: [-2.2, 0, -3.0] }, (b) => pistol(b, { len: 7.1, slide: C.black, frame: C.rubber, grip: C.rubber }));
def('usp', 'pistol', { muzzle: [5.6, 0, 2.3], mag: [-2.2, 0, -3.0] }, (b) => pistol(b, { len: 7.8, slide: C.black, frame: C.dark, grip: C.dark }));
def('p228', 'pistol', { muzzle: [5.0, 0, 2.3], mag: [-2.2, 0, -3.0] }, (b) => pistol(b, { len: 7.2, slide: C.dark, frame: C.black, grip: C.black, h: 1.4 }));
def('fiveseven', 'pistol', { muzzle: [5.2, 0, 2.3], mag: [-2.2, 0, -3.0] }, (b) => pistol(b, { len: 7.4, slide: C.gun, frame: C.black, grip: C.black, h: 1.35, w: 1.05 }));
def('deagle', 'pistol', { muzzle: [7.8, 0, 2.6], mag: [-2.2, 0, -3.0] }, (b) => {
  pistol(b, { len: 10.0, back: -2.4, slide: C.silver, frame: C.silver, grip: C.black, h: 1.9, w: 1.3 });
  b.box(-1.0, 7.4, 3.4, 3.7, 0.7, C.silver); // top rib
});
def('elite', 'dual', { muzzle: [5.6, 0, 2.3], mag: [-2.2, 0, -3.0] }, (b) => {
  // one Beretta; createWorldWeapon('elite') builds the pair
  pistol(b, { len: 7.8, back: -2.2, slide: C.silver, frame: C.silver, grip: C.black, h: 1.4, w: 1.05, barrel: 0.5 });
});

// --- shotguns
def('m3', 'rifle', { leftHand: [11.5, 0, 1.4], muzzle: [25, 0, 3.0], mag: [10, 0, 1.0] }, (b) => {
  b.box(-2.5, 5.5, 0.8, 3.7, 1.5, C.black);
  b.cyl('x', 5.5, 25, 0, 3.0, 0.55, C.black, 6);
  b.cyl('x', 5.5, 19.5, 0, 1.75, 0.55, C.black, 6);
  b.box(8.0, 14.5, 0.95, 2.6, 1.6, C.dark); // pump
  b.taper(-2.5, [0.6, 3.4, 1.4], -14, [-2.0, 2.9, 1.5], C.black);
  b.box(-14.6, -14.0, -2.1, 3.0, 1.6, C.rubber);
  pistolGrip(b, C.black, 1.15, [-2.4, 0.2], [-3.4, -1.0], 1.0, -2.8);
  triggerGuard(b);
  b.box(23.8, 24.3, 3.5, 3.95, 0.3, C.black);
});
def('xm1014', 'rifle', { leftHand: [10.5, 0, 1.3], muzzle: [23.5, 0, 3.0], mag: [9, 0, 1.0] }, (b) => {
  b.box(-2.5, 6.0, 0.8, 3.7, 1.5, C.black);
  b.cyl('x', 6.0, 23.5, 0, 3.0, 0.55, C.black, 6);
  b.cyl('x', 6.0, 19.0, 0, 1.75, 0.6, C.black, 6);
  b.box(7.0, 14.0, 0.9, 2.7, 1.7, C.black);
  pistolGrip(b);
  triggerGuard(b);
  b.box(-12.0, -2.5, 2.2, 3.4, 0.9, C.black); // tube stock
  b.box(-13.5, -12.0, -1.6, 3.6, 1.5, C.rubber);
  b.slant([-12.5, -11.5], 2.3, [-13.5, -12.5], -1.4, 1.2, C.black);
  b.box(-1.0, 4.0, 3.7, 4.3, 0.5, C.black); // ghost ring rail
});

// --- SMGs
def('mac10', 'rifle', { leftHand: [5.2, 0, 0.4], muzzle: [8.2, 0, 3.0], mag: [-0.8, 0, -4] }, (b) => {
  b.box(-2.6, 6.0, 0.8, 4.2, 1.6, C.black);
  b.cyl('x', 6.0, 8.2, 0, 3.0, 0.5, C.dark, 6);
  b.slant([-1.4, 1.0], 0.9, [-2.0, 0.5], -5.2, 1.1, C.black); // grip + mag
  triggerGuard(b, 1.0, 3.0);
  b.box(-7.5, -2.6, 3.2, 3.6, 0.3, C.dark, -0.6); // wire stock
  b.box(-7.5, -2.6, 3.2, 3.6, 0.3, C.dark, 0.6);
  b.box(-7.9, -7.5, 1.0, 3.8, 1.6, C.dark);
});
def('tmp', 'rifle', { leftHand: [4.8, 0, -1.4], muzzle: [11.5, 0, 2.6], mag: [-0.8, 0, -4] }, (b) => {
  b.box(-3.0, 5.5, 0.8, 3.6, 1.3, C.black);
  b.cyl('x', 5.5, 11.5, 0, 2.6, 0.7, C.black, 6);
  b.slant([-1.6, 0.7], 0.9, [-2.4, 0.1], -5.0, 1.0, C.black);
  b.slant([3.9, 5.3], 0.9, [3.6, 5.0], -2.6, 1.0, C.black); // vertical foregrip
  triggerGuard(b, 0.8, 2.8);
  b.box(-1.0, 3.5, 3.6, 4.0, 0.5, C.dark);
});
def('mp5', 'rifle', { leftHand: [11.5, 0, 1.4], muzzle: [16.8, 0, 2.6], mag: [5.5, 0, -2] }, (b) => {
  b.box(-2.6, 9.4, 1.2, 3.9, 1.4, C.black);
  b.box(9.4, 14.6, 1.0, 3.4, 1.65, C.black);
  b.cyl('x', 14.6, 16.8, 0, 2.6, 0.45, C.dark, 6);
  b.cyl('x', 15.4, 16.0, 0, 3.6, 0.55, C.black, 6); // front sight ring
  b.cyl('x', -1.8, -0.8, 0, 4.4, 0.6, C.black, 6); // rear drum
  rifleMag(b, 4.0, 5.6, 2.2, 6.0, C.black, 0.9, 1.3);
  pistolGrip(b);
  triggerGuard(b);
  b.taper(-2.6, [1.6, 3.6, 1.2], -11, [0.2, 3.2, 1.2], C.black);
  b.box(-11.6, -11, -0.4, 3.4, 1.4, C.rubber);
});
def('ump45', 'rifle', { leftHand: [8.6, 0, 1.0], muzzle: [13.2, 0, 2.5], mag: [5.2, 0, -2] }, (b) => {
  b.box(-2.6, 10.2, 0.8, 3.9, 1.5, C.dark);
  b.box(-1.5, 6.0, 3.9, 4.3, 0.6, C.black); // rail
  b.cyl('x', 10.2, 13.2, 0, 2.5, 0.48, C.black, 6);
  b.slant([4.4, 6.2], 0.9, [4.7, 6.6], -5.0, 1.0, C.black); // straight mag
  pistolGrip(b, C.dark);
  triggerGuard(b);
  b.box(-11, -2.6, 2.6, 3.4, 1.0, C.dark); // folding stock bar
  b.box(-11.6, -11, -0.6, 3.4, 1.4, C.dark);
});
def('p90', 'rifle', { leftHand: [6.2, 0, 0.6], muzzle: [11.4, 0, 2.2], mag: [0, 0, 4.2] }, (b) => {
  b.taper(-8.0, [-1.6, 3.4, 1.9], 0.0, [-0.4, 3.6, 2.0], C.black);
  b.taper(0.0, [1.0, 3.6, 2.0], 9.4, [0.6, 3.0, 1.8], C.black);
  b.box(-6.0, 7.5, 3.6, 4.5, 1.5, C.darkolive); // top magazine
  b.cyl('x', 9.4, 11.4, 0, 2.2, 0.45, C.dark, 6);
  b.slant([-0.8, 0.8], 1.0, [-1.4, 0.4], -2.8, 1.2, C.black); // grip
  b.slant([5.4, 7.0], 1.0, [5.2, 6.8], -0.9, 1.2, C.black); // front of thumbhole
  b.box(-0.8, 6.8, -1.2, -0.6, 1.2, C.black);
});

// --- rifles
def('ak47', 'rifle', { leftHand: [12.5, 0, 1.6], muzzle: [23.6, 0, 2.15], mag: [5, 0, -2] }, (b) => {
  b.box(-3.0, 9.0, 0.8, 3.4, 1.7, C.black);
  b.box(-1.0, 8.6, 3.4, 3.8, 1.3, C.dark); // dust cover
  b.box(9.0, 15.6, 1.0, 3.1, 1.9, C.wood); // lower handguard
  b.box(9.0, 15.0, 3.1, 3.9, 1.2, C.wood); // upper handguard
  b.cyl('x', 15.0, 22.6, 0, 2.15, 0.45, C.black, 6);
  b.cyl('x', 15.0, 19.0, 0, 3.4, 0.4, C.black, 6); // gas tube
  b.box(20.6, 21.3, 2.3, 4.0, 0.5, C.black); // front sight
  b.box(22.6, 23.6, 1.7, 2.6, 0.9, C.black); // muzzle
  rifleMag(b, 3.6, 5.6, 3.0, 7.2, C.black, 1.0);
  pistolGrip(b, C.darkwood);
  triggerGuard(b);
  b.taper(-3.0, [0.4, 3.0, 1.5], -14.0, [-2.6, 2.4, 1.6], C.wood);
  b.box(-14.4, -14.0, -2.7, 2.5, 1.7, C.darkwood);
});
def('m4a1', 'rifle', { leftHand: [11.5, 0, 1.4], muzzle: [21.6, 0, 2.3], mag: [4.2, 0, -2] }, (b) => {
  b.box(-3.0, 7.5, 0.8, 3.6, 1.35, C.black);
  b.box(7.5, 15.0, 1.1, 3.5, 1.75, C.black); // handguard
  b.cyl('x', 15.0, 21.6, 0, 2.3, 0.4, C.black, 6);
  b.box(14.4, 15.2, 3.0, 5.4, 0.45, C.black); // front sight post
  b.box(-1.6, 4.6, 3.6, 4.0, 0.8, C.black); // carry handle base
  b.box(-1.6, -0.4, 4.0, 5.4, 0.8, C.black);
  b.box(-0.4, 4.6, 5.0, 5.4, 0.8, C.black);
  b.box(3.6, 4.6, 4.0, 5.0, 0.8, C.black);
  b.slant([3.2, 5.0], 1.0, [3.8, 5.6], -4.8, 1.0, C.black);
  pistolGrip(b);
  triggerGuard(b);
  b.box(-11.0, -3.0, 2.0, 3.0, 1.0, C.black); // buffer tube
  b.taper(-7.0, [0.0, 3.2, 1.3], -12.0, [-1.6, 3.1, 1.4], C.black);
});
def('galil', 'rifle', { leftHand: [12, 0, 1.4], muzzle: [22.5, 0, 2.3], mag: [5, 0, -2] }, (b) => {
  b.box(-3.0, 9.0, 0.8, 3.5, 1.6, C.black);
  b.box(9.0, 15.4, 1.0, 3.2, 1.8, C.wood);
  b.cyl('x', 15.4, 22.5, 0, 2.3, 0.45, C.black, 6);
  b.box(19.6, 20.2, 2.6, 4.6, 0.4, C.black);
  b.box(4.0, 8.0, 3.5, 4.0, 0.6, C.dark); // carry handle
  rifleMag(b, 3.8, 5.8, 2.4, 7.0, C.black, 1.0);
  pistolGrip(b);
  triggerGuard(b);
  b.box(-12.5, -3.0, 2.6, 3.2, 0.5, C.black, -0.6);
  b.box(-12.5, -3.0, 2.6, 3.2, 0.5, C.black, 0.6);
  b.box(-13.0, -12.4, -1.4, 3.3, 1.6, C.black);
});
def('famas', 'rifle', { leftHand: [6.8, 0, 0.8], muzzle: [17.2, 0, 2.4], mag: [-4.5, 0, -2] }, (b) => {
  b.box(-11.5, 10.0, 0.4, 3.6, 1.7, C.dark);
  b.taper(-11.5, [-1.6, 3.6, 1.6], -6.0, [0.4, 3.6, 1.7], C.dark); // butt
  b.box(-6.5, 9.0, 4.8, 5.6, 0.8, C.black); // carry handle
  b.box(-6.5, -5.5, 3.6, 4.8, 0.8, C.black);
  b.box(8.0, 9.0, 3.6, 4.8, 0.8, C.black);
  b.cyl('x', 10.0, 17.2, 0, 2.4, 0.42, C.black, 6);
  b.slant([-5.6, -3.6], 0.6, [-5.2, -3.2], -4.0, 1.0, C.black); // mag behind the grip
  pistolGrip(b, C.black, 1.2, [-1.4, 0.8], [-2.2, 0.0], 0.6, -3.2);
  b.box(-0.4, 3.0, -0.6, 0.6, 1.4, C.black); // big trigger guard
});
def('sg552', 'rifle', { leftHand: [10.5, 0, 1.4], muzzle: [18.6, 0, 2.3], mag: [4.6, 0, -2] }, (b) => {
  b.box(-3.0, 8.0, 0.8, 3.6, 1.5, C.black);
  b.box(8.0, 13.4, 1.0, 3.4, 1.8, C.dark);
  b.cyl('x', 13.4, 18.6, 0, 2.3, 0.42, C.black, 6);
  scope(b, -0.4, 6.2, 5.0, 0.85);
  rifleMag(b, 3.6, 5.4, 1.6, 6.8, C.dark, 1.0);
  pistolGrip(b);
  triggerGuard(b);
  b.box(-11.0, -3.0, 2.8, 3.4, 1.0, C.black);
  b.box(-11.0, -6.0, 0.0, 0.5, 1.0, C.black);
  b.box(-11.6, -11.0, -0.2, 3.4, 1.5, C.black);
});
def('aug', 'rifle', { leftHand: [6.4, 0, -1.2], muzzle: [17.0, 0, 2.2], mag: [-4.6, 0, -2] }, (b) => {
  b.taper(-11.0, [-1.6, 3.4, 1.9], -2.0, [0.2, 3.4, 2.0], C.olive);
  b.box(-2.0, 7.5, 0.5, 3.4, 2.0, C.olive);
  b.cyl('x', -2.0, 6.0, 0, 4.6, 0.95, C.olive, 6); // integral scope
  b.box(-1.0, 5.0, 3.3, 3.8, 1.0, C.olive);
  b.cyl('x', 7.5, 17.0, 0, 2.2, 0.45, C.black, 6);
  b.slant([5.6, 7.0], 0.6, [5.2, 6.6], -3.0, 1.1, C.olive); // vertical foregrip
  b.slant([-5.6, -3.6], 0.6, [-5.2, -3.2], -4.4, 1.0, C.darkolive);
  pistolGrip(b, C.olive, 1.2, [-1.2, 0.8], [-2.0, 0.0], 0.6, -3.0);
  b.box(-1.6, 5.8, -0.9, -0.3, 1.5, C.olive); // closed guard
});

// --- snipers
def('scout', 'rifle', { leftHand: [11, 0, 0.9], muzzle: [25, 0, 2.3], mag: [3.5, 0, -1] }, (b) => {
  b.box(-3.0, 6.0, 0.8, 3.0, 1.2, C.dark);
  b.taper(6.0, [0.4, 2.6, 1.6], 15.0, [1.0, 2.4, 1.3], C.greygreen); // forestock
  b.cyl('x', 6.0, 25.0, 0, 2.3, 0.38, C.black, 6);
  scope(b, -0.6, 9.0, 4.4, 0.75);
  b.box(1.6, 2.4, 1.8, 2.6, 2.4, C.black, -1.2); // bolt
  b.taper(-3.0, [0.2, 3.0, 1.4], -13.4, [-2.2, 2.8, 1.5], C.greygreen);
  b.box(-13.8, -13.4, -2.3, 2.8, 1.5, C.rubber);
  pistolGrip(b, C.greygreen, 1.2, [-2.6, 0.2], [-3.6, -1.0], 0.8, -2.6);
  triggerGuard(b);
});
def('awp', 'rifle', { leftHand: [11.5, 0, 0.7], muzzle: [29, 0, 2.4], mag: [3.5, 0, -1.6] }, (b) => {
  b.box(-3.0, 7.0, 0.6, 3.2, 1.5, C.olive);
  b.taper(7.0, [0.2, 2.9, 2.0], 16.0, [0.8, 2.7, 1.6], C.olive);
  b.cyl('x', 7.0, 27.5, 0, 2.4, 0.55, C.black, 6);
  b.cyl('x', 27.5, 29.0, 0, 2.4, 0.75, C.black, 6); // brake
  scope(b, -1.6, 10.4, 5.0, 1.0);
  b.box(1.4, 2.4, 2.0, 2.8, 2.8, C.black, -1.4);
  b.slant([2.6, 4.6], 0.7, [2.8, 4.8], -2.2, 1.2, C.black); // mag
  b.taper(-3.0, [0.0, 3.2, 1.8], -15.0, [-2.8, 3.2, 1.8], C.olive);
  b.box(-11.0, -6.0, -1.0, 0.6, 1.9, C.olive); // thumbhole lower bar
  b.box(-15.6, -15.0, -2.9, 3.2, 1.9, C.rubber);
  pistolGrip(b, C.olive, 1.3, [-1.8, 0.6], [-2.8, -0.4], 0.8, -3.0);
  triggerGuard(b);
});
def('g3sg1', 'rifle', { leftHand: [13, 0, 1.3], muzzle: [26.5, 0, 2.4], mag: [5, 0, -2] }, (b) => {
  b.box(-3.0, 10.0, 0.8, 3.6, 1.5, C.black);
  b.taper(10.0, [1.0, 3.4, 1.8], 17.5, [1.2, 3.2, 1.6], C.black);
  b.cyl('x', 17.5, 26.5, 0, 2.4, 0.45, C.black, 6);
  scope(b, -0.5, 9.5, 5.2, 0.9);
  b.slant([4.2, 6.0], 1.0, [4.5, 6.4], -4.6, 1.0, C.black);
  pistolGrip(b);
  triggerGuard(b);
  b.taper(-3.0, [0.6, 3.4, 1.5], -14.0, [-2.6, 3.6, 1.6], C.black);
  b.box(-12.0, -6.0, 3.6, 4.4, 1.2, C.black); // cheek rest
  b.box(-14.5, -14.0, -2.7, 3.6, 1.7, C.rubber);
});
def('sg550', 'rifle', { leftHand: [12.5, 0, 1.3], muzzle: [25.5, 0, 2.3], mag: [4.6, 0, -2] }, (b) => {
  b.box(-3.0, 9.0, 0.8, 3.6, 1.5, C.dark);
  b.box(9.0, 16.0, 1.0, 3.4, 1.8, C.dark);
  b.cyl('x', 16.0, 25.5, 0, 2.3, 0.42, C.black, 6);
  scope(b, -0.6, 9.0, 5.1, 0.9);
  rifleMag(b, 3.6, 5.4, 1.6, 6.8, C.dark, 1.0);
  pistolGrip(b);
  triggerGuard(b);
  b.taper(-3.0, [0.4, 3.6, 1.4], -14.0, [-2.6, 3.2, 1.5], C.dark);
  b.box(-11.5, -5.0, -1.2, 0.0, 1.0, C.dark);
  b.box(-14.4, -14.0, -2.7, 3.2, 1.6, C.rubber);
  b.box(14.0, 16.0, -1.6, 1.0, 0.4, C.dark, -0.5); // folded bipod
  b.box(14.0, 16.0, -1.6, 1.0, 0.4, C.dark, 0.5);
});

// --- machine gun
def('m249', 'rifle', { leftHand: [13.5, 0, 1.0], muzzle: [26.5, 0, 2.6], mag: [4, 2, -2] }, (b) => {
  b.box(-3.0, 10.5, 0.6, 4.3, 1.9, C.black);
  b.box(-1.0, 8.0, 4.3, 4.9, 1.6, C.dark); // feed cover
  b.cyl('x', 10.5, 18.5, 0, 2.6, 0.95, C.dark, 6); // heat shield
  b.cyl('x', 18.5, 26.5, 0, 2.6, 0.5, C.black, 6);
  b.box(25.0, 25.6, 3.1, 4.5, 0.4, C.black);
  b.box(1.5, 7.5, -4.8, 0.6, 3.6, C.darkolive, 1.0); // ammo box
  b.box(1.4, 7.6, -0.2, 0.4, 3.7, C.black, 1.0);
  pistolGrip(b);
  triggerGuard(b);
  b.taper(-3.0, [0.4, 3.8, 1.6], -13.0, [-1.8, 3.4, 1.7], C.black);
  b.box(-13.5, -13.0, -2.0, 3.4, 1.8, C.rubber);
  b.box(17.0, 18.5, -2.2, 1.7, 0.4, C.black, -0.5); // folded bipod
  b.box(17.0, 18.5, -2.2, 1.7, 0.4, C.black, 0.5);
  b.box(3.0, 8.0, 4.9, 5.6, 0.5, C.black); // carry handle
});

// --- equipment
def('hegrenade', 'grenade', {}, (b) => {
  b.cyl('z', -1.4, 1.1, 0, 0, 1.3, C.green, 8);
  b.cyl('z', -1.7, -1.4, 0, 0, 0.9, C.green, 8, true);
  b.cyl('z', 1.1, 1.6, 0, 0, 0.85, C.green, 8, true);
  b.cyl('z', 1.6, 2.3, 0, 0, 0.45, C.gun, 6);
  b.box(0.3, 0.7, -1.0, 2.2, 0.5, C.gun); // spoon
  b.cyl('y', -0.15, 0.15, -0.6, 2.2, 0.45, C.silver, 6, false); // pin ring
});
def('flashbang', 'grenade', {}, (b) => {
  b.cyl('z', -2.0, 1.6, 0, 0, 0.95, C.gun, 8);
  b.cyl('z', -0.4, 0.2, 0, 0, 1.02, C.dark, 8, false);
  b.cyl('z', 1.6, 2.4, 0, 0, 0.45, C.silver, 6);
  b.box(0.35, 0.75, -1.2, 2.3, 0.5, C.silver);
});
def('smokegrenade', 'grenade', {}, (b) => {
  b.cyl('z', -2.2, 1.7, 0, 0, 1.0, C.greygreen, 8);
  b.cyl('z', 0.6, 1.0, 0, 0, 1.05, C.black, 8, false);
  b.cyl('z', 1.7, 2.5, 0, 0, 0.45, C.gun, 6);
  b.box(0.35, 0.75, -1.4, 2.4, 0.5, C.gun);
});
function c4Brick(b, L = 10, W = 6, H = 2.6, y0 = 0) {
  // bricks of explosive (along +Y from y0) + keypad/timer box on top
  b.box(-W / 2, W / 2, -H / 2, H / 2, L, C.clay, y0 + L / 2);
  b.box(-W / 2 - 0.05, W / 2 + 0.05, -0.15, 0.15, L + 0.1, C.black, y0 + L / 2); // tape seam
  b.box(-W * 0.3, W * 0.3, H / 2, H / 2 + 0.7, L * 0.45, C.dark, y0 + L * 0.42);
  b.box(-W * 0.22, W * 0.05, H / 2 + 0.7, H / 2 + 0.8, L * 0.3, C.green, y0 + L * 0.42); // display
  b.box(W * 0.1, W * 0.25, H / 2 + 0.7, H / 2 + 0.85, L * 0.3, C.gun, y0 + L * 0.42); // keys
}
def('c4', 'c4', { leftHand: [0, 10.4, 0] }, (b) => c4Brick(b, 10, 6, 2.6, 0.4));

// --- zombie survival
def('molotov', 'grenade', {}, (b) => {
  b.cyl('z', -2.6, 1.2, 0, 0, 1.25, C.green, 8); // bottle
  b.cyl('z', 1.2, 2.0, 0, 0, 0.85, C.green, 8, false);
  b.cyl('z', 2.0, 3.6, 0, 0, 0.42, C.green, 6); // neck
  b.cyl('z', 3.4, 5.4, 0.25, 0, 0.55, C.tan, 5); // rag
  b.box(-1.0, 1.0, -1.6, 0.4, 2.62, C.tan); // label
});
def('flamethrower', 'rifle', { leftHand: [12.5, 0, 0.6], muzzle: [27.5, 0, 1.8], mag: [6, 0, -3] }, (b) => {
  b.box(-3.0, 9.0, 0.3, 3.4, 2.0, C.dark); // body
  b.cyl('x', 9.0, 25.0, 0, 1.8, 0.65, C.steel, 6); // wand
  b.cyl('x', 24.0, 27.5, 0, 1.8, 0.95, C.black, 6); // nozzle
  b.cyl('x', 25.0, 26.0, 0, 0.4, 0.35, C.brass, 5); // igniter
  b.cyl('x', 1.0, 11.5, 0, -2.2, 2.0, C.red, 8); // fuel tank under the body
  b.cyl('x', 0.4, 1.0, 0, -2.2, 1.6, C.dark, 8);
  b.cyl('x', 11.5, 12.1, 0, -2.2, 1.6, C.dark, 8);
  b.slant([12.0, 13.2], 1.0, [11.6, 12.8], -3.0, 1.0, C.black); // front grip
  pistolGrip(b);
  triggerGuard(b);
  b.taper(-3.0, [0.4, 3.2, 1.6], -12.5, [-1.6, 3.0, 1.6], C.dark);
});
def('rpg', 'rifle', { leftHand: [9.5, 0, 0.4], muzzle: [36, 0, 2.6], mag: [31, 0, 2.6] }, (b) => {
  b.cyl('x', -16, 26, 0, 2.6, 1.25, C.darkolive, 8); // tube
  b.cyl('x', -19, -16, 0, 2.6, 1.8, C.darkolive, 8); // rear flare
  b.cyl('x', 1.5, 10.5, 0, 2.6, 1.6, C.wood, 8); // wooden heat guard
  pistolGrip(b);
  triggerGuard(b);
  b.slant([9.0, 10.2], 1.4, [8.6, 9.8], -2.8, 1.0, C.black); // front grip
  b.box(3.5, 6.5, 3.9, 5.4, 0.8, C.black); // sight
  // warhead in the muzzle
  b.cyl('x', 26, 29, 0, 2.6, 0.95, C.olive, 6);
  b.cyl('x', 29, 31.5, 0, 2.6, 2.1, C.olive, 8);
  b.cyl('x', 31.5, 33.5, 0, 2.6, 1.7, C.olive, 8);
  b.cyl('x', 33.5, 35.2, 0, 2.6, 1.1, C.olive, 8);
  b.cyl('x', 35.2, 36.2, 0, 2.6, 0.45, C.olive, 6);
});
def('m32', 'rifle', { leftHand: [9.0, 0, 0.2], muzzle: [17, 0, 2.0], mag: [3.5, 0, 0.8] }, (b) => {
  b.cyl('x', 0.5, 6.5, 0, 0.9, 2.5, C.black, 8); // revolving drum
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.cyl('x', 6.4, 6.6, Math.cos(a) * 1.5, 0.9 + Math.sin(a) * 1.5, 0.55, C.brass, 5); }
  b.cyl('x', 6.5, 17, 0, 2.0, 1.05, C.dark, 8); // barrel
  b.box(-1.0, 7.0, 3.3, 4.0, 1.2, C.dark); // top strap
  b.box(7.0, 15.0, 0.2, 0.9, 1.6, C.black); // rail
  b.slant([9.0, 10.2], 0.3, [8.6, 9.8], -3.2, 1.0, C.black); // foregrip
  pistolGrip(b);
  triggerGuard(b);
  b.taper(-1.5, [0.2, 2.8, 1.4], -12.0, [-1.4, 2.6, 1.4], C.black);
  b.box(2.0, 5.0, 4.0, 5.0, 0.7, C.black);
});
// projectiles (nose along +X)
def('rpg_rocket', 'none', {}, (b) => {
  b.cyl('x', -9, 0, 0, 0, 0.9, C.olive, 6); // motor
  for (const a of [0, 1, 2, 3]) { const s = Math.sin(a * Math.PI / 2), c = Math.cos(a * Math.PI / 2); b.box(-9, -6, c * 1.6 - 0.1, c * 1.6 + 0.1, 0.2 + Math.abs(s) * 3, C.dark); }
  b.cyl('x', 0, 2.5, 0, 0, 2.1, C.olive, 8);
  b.cyl('x', 2.5, 4.5, 0, 0, 1.7, C.olive, 8);
  b.cyl('x', 4.5, 6.2, 0, 0, 1.1, C.olive, 8);
  b.cyl('x', 6.2, 7.2, 0, 0, 0.45, C.olive, 6);
});
def('grenade40', 'none', {}, (b) => {
  b.cyl('x', -2.2, -1.0, 0, 0, 1.05, C.brass, 8);
  b.cyl('x', -1.0, 1.2, 0, 0, 1.0, C.olive, 8);
  b.cyl('x', 1.2, 1.9, 0, 0, 0.65, C.olive, 8);
});

export const WORLD_WEAPON_IDS = Object.keys(DEFS);

const HOLD_BY_ID = Object.fromEntries(Object.values(DEFS).map((d) => [d.id, d.hold]));
export function weaponHoldType(id) { return HOLD_BY_ID[id] || 'rifle'; }

const geoCache = new Map();
function weaponGeometry(id) {
  if (geoCache.has(id)) return geoCache.get(id);
  const b = new WB();
  DEFS[id].build(b);
  const g = b.build();
  g.userData.triangles = b.tris;
  geoCache.set(id, g);
  return g;
}

function attachLighting(group, lightUniforms) {
  const u = lightUniforms || createLightUniforms();
  const mat = createGsMaterial(palette(), u);
  group.traverse((o) => { if (o.isMesh && !o.userData.keepMaterial) o.material = mat; });
  group.userData.lightUniforms = u;
  group.userData.material = mat;
  /** setLight(ambient[3], shade[3], dirGS[3]) — same GoldSrc lighting as the player models. */
  group.userData.setLight = (ambient, shade, dir) => setLightUniforms(u, ambient, shade, dir, group.parent);
  group.userData.dispose = () => { mat.dispose(); };
  return mat;
}

/**
 * createWorldWeapon(id) -> THREE.Group. Grip at the origin, barrel +X, top +Z.
 * userData: { weaponId, hold, leftHand: Vector3|null (support-hand point), muzzle: Vector3, setLight(a,s,d) }
 * The optional second argument shares an existing light-uniform set (used by the player models).
 */
export function createWorldWeapon(weaponId, lightUniforms) {
  const d = DEFS[weaponId];
  if (!d) throw new Error('unknown weapon ' + weaponId);
  const group = new THREE.Group();
  group.name = 'w_' + weaponId;
  if (weaponId === 'elite') {
    const right = new THREE.Mesh(weaponGeometry('elite'));
    const left = new THREE.Mesh(weaponGeometry('elite'));
    right.name = 'right'; left.name = 'left';
    left.position.set(0.5, 4.5, 0); left.rotation.z = 0.12;
    group.add(right, left);
    group.userData.dual = true;
  } else {
    group.add(new THREE.Mesh(weaponGeometry(weaponId)));
  }
  // silencer for the USP / M4A1 (hidden until setSilenced(true))
  if (weaponId === 'usp' || weaponId === 'm4a1') {
    const sb = new WB();
    if (weaponId === 'usp') sb.cyl('x', 5.6, 10.6, 0, 2.3, 0.62, C.black, 6);
    else sb.cyl('x', 20.6, 28.6, 0, 2.3, 0.75, C.black, 6);
    const sil = new THREE.Mesh(sb.build());
    sil.name = 'silencer';
    sil.visible = false;
    group.add(sil);
  }
  const muzzle0 = d.muzzle ? new THREE.Vector3(...d.muzzle) : null;
  group.userData.setSilenced = (on) => {
    const sil = group.getObjectByName('silencer');
    if (!sil) return;
    sil.visible = !!on;
    if (muzzle0) group.userData.muzzle.copy(muzzle0).x += on ? (weaponId === 'usp' ? 5 : 7) : 0;
  };
  group.userData.weaponId = weaponId;
  group.userData.hold = d.hold;
  group.userData.leftHand = d.leftHand ? new THREE.Vector3(...d.leftHand) : null;
  group.userData.muzzle = d.muzzle ? new THREE.Vector3(...d.muzzle) : null;
  group.userData.mag = d.mag ? new THREE.Vector3(...d.mag) : null;
  attachLighting(group, lightUniforms);
  // local-space bounds (e.g. to lay a dropped weapon on the floor: rotate it on its side, lift by the half width)
  group.userData.bounds = new THREE.Box3().setFromObject(group, true);
  return group;
}

/**
 * Convenience for dropped weapons (w_ models): the same model lying on its right side with
 * the origin on the floor under its middle, so `group.position = floor point` looks right.
 * userData mirrors createWorldWeapon (setLight, dispose, weaponId, ...).
 */
export function createDroppedWeapon(weaponId) {
  const w = createWorldWeapon(weaponId);
  const b = w.userData.bounds;
  const c = b.getCenter(new THREE.Vector3());
  w.rotation.x = Math.PI / 2; // left side up: local (x, y, z) -> (x, -z, y)
  w.position.set(-c.x, c.z, -b.min.y);
  const group = new THREE.Group();
  group.name = 'dropped_' + weaponId;
  group.add(w);
  group.userData = { ...w.userData };
  group.userData.setLight = (ambient, shade, dir) => setLightUniforms(w.userData.lightUniforms, ambient, shade, dir, group.parent);
  return group;
}

/** C4 brick lying on the floor (~14 x 8 x 4 units), origin at the bottom centre. */
export function createPlantedC4() {
  const b = new WB();
  // two rows of explosive bricks
  b.box(-7, 7, 0, 3.0, 3.9, C.clay, -2.0);
  b.box(-7, 7, 0, 3.0, 3.9, C.clay, 2.0);
  b.box(-7.05, 7.05, 1.3, 1.6, 8.0, C.black); // tape
  b.box(-4.2, -3.8, 0, 3.1, 8.1, C.black);
  b.box(3.8, 4.2, 0, 3.1, 8.1, C.black);
  // control box with keypad and display
  b.box(-3.6, 3.0, 3.0, 4.0, 5.2, C.dark, 0.2);
  b.box(-3.2, 0.2, 4.0, 4.15, 3.6, C.green, 1.0); // display
  b.box(0.8, 2.6, 4.0, 4.2, 3.6, C.gun, 0.2); // keypad
  b.cyl('x', -6.0, 6.0, 4.3, 3.4, 0.22, C.red, 4, false); // wires
  b.cyl('x', -6.0, 6.0, -4.3, 3.4, 0.22, C.brass, 4, false);
  const g = b.build();
  const mesh = new THREE.Mesh(g);
  const group = new THREE.Group();
  group.name = 'planted_c4';
  group.add(mesh);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x401010 });
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.5), ledMat);
  led.position.set(2.3, -2.0, 4.25);
  led.userData.keepMaterial = true;
  group.add(led);
  attachLighting(group);
  const disposeLight = group.userData.dispose;
  group.userData.dispose = () => { disposeLight(); ledMat.dispose(); led.geometry.dispose(); g.dispose(); };
  return {
    object3D: group,
    setBlink(on) { ledMat.color.setHex(on ? 0xff2020 : 0x401010); },
  };
}

/** Defuse kit lying on the floor: zipped pouch with wire cutters. Origin at the bottom centre. */
export function createDefuseKit() {
  const b = new WB();
  b.taper(-3.6, [0, 1.8, 4.6], 3.6, [0, 1.8, 4.6], C.darkolive);
  b.box(-3.7, 3.7, 1.8, 2.1, 4.0, C.olive);
  b.box(-3.5, 3.5, 0.85, 1.05, 4.7, C.black); // zip
  b.box(-1.6, 1.6, 2.1, 2.5, 0.5, C.black, -1.2); // handle loop
  b.box(3.7, 6.2, 0.4, 0.9, 0.5, C.red, 0.6); // cutter handles
  b.box(3.7, 6.2, 0.4, 0.9, 0.5, C.red, -0.6);
  b.box(6.2, 7.4, 0.5, 0.8, 0.8, C.steel);
  const group = new THREE.Group();
  group.name = 'defuse_kit';
  group.add(new THREE.Mesh(b.build()));
  attachLighting(group);
  return group;
}
