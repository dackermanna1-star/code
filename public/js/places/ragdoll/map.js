// The Olympic park: the sky and the light, the ground (with the lake and the
// pool cut out of it), the stadium in the middle (track, infield, stands full
// of people, the flame, the big screen, the podium), the paths out to the
// venues, trees, lamps, fountains and the mountains and sea around it all.
// The venues themselves are built by their events (see events/*.js).
import * as THREE from 'three';
import { Kit, mat, colorMat, boxGeo, cylGeo, canvas, tex, textTex, rng, V } from './kit.js';
import { Crowd, Flags } from './crowd.js';

// Where everything is (studs). The stadium's long axis runs east-west.
export const SITES = {
  stadium: { x: 0, z: 0, S: 60, track: 40, lanes: 6, laneW: 3, stands0: 66, tiers: 15, tierD: 3.2, tierH: 2.2 },
  flame: { x: 0, z: -138 },
  stairs: { x: 0, z: -232 }, // the plaza at the foot of the stairs
  cannon: { x: 236, z: 0 },
  wipeout: { x: -232, z: 0 },
  dive: { x: 0, z: 252 },
  bowling: { x: 236, z: 210 },
};
export const LAKE = { x0: -660, x1: -222, z0: -95, z1: 95, y: -3, bottom: -14 };
export const POOL = { x0: -54, x1: 54, z0: 222, z1: 284, y: -1.2, bottom: -21 };
// places kept clear of trees
const CLEAR = [
  [-185, -125, 185, 125], [-60, -470, 60, -120], [-70, -260, 70, -180], [210, -110, 720, 110], [-680, -120, -200, 120],
  [-80, 180, 80, 320], [130, 150, 335, 285], [-12, -400, 12, 400], [-400, -12, 400, 12], [100, 80, 200, 200],
];

// --- sky -------------------------------------------------------------------------------------------------------------------------------------
function skyTexture() {
  const r = rng(21);
  const c = canvas(2048, 1024, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a6fd6'); g.addColorStop(0.28, '#5a9ae8'); g.addColorStop(0.45, '#a9cdf2'); g.addColorStop(0.5, '#dcebf7'); g.addColorStop(0.52, '#c9d9c4'); g.addColorStop(1, '#8aa070');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // the sun
    const sx = w * 0.37, sy = h * 0.2;
    let sg = x.createRadialGradient(sx, sy, 0, sx, sy, 260); sg.addColorStop(0, 'rgba(255,253,240,1)'); sg.addColorStop(0.06, 'rgba(255,250,230,0.95)'); sg.addColorStop(0.2, 'rgba(255,240,200,0.35)'); sg.addColorStop(1, 'rgba(255,240,200,0)');
    x.fillStyle = sg; x.fillRect(0, 0, w, h);
    // fair-weather clouds: clumps of soft puffs with shaded bottoms
    for (let i = 0; i < 46; i++) {
      const cx = r() * w, cy = h * (0.12 + r() * 0.33), cw = 60 + r() * 170, ch = cw * (0.25 + r() * 0.15);
      const pers = 0.45 + (cy / h) * 1.3; // smaller and flatter towards the horizon
      for (let k = 0; k < 16; k++) {
        const px = cx + (r() - 0.5) * cw * 1.2 * pers, py = cy + (r() - 0.5) * ch * 0.6 * pers, pr = (16 + r() * 34) * pers;
        const pg = x.createRadialGradient(px, py - pr * 0.3, 0, px, py, pr);
        pg.addColorStop(0, 'rgba(255,255,255,0.9)'); pg.addColorStop(0.6, 'rgba(244,247,252,0.55)'); pg.addColorStop(1, 'rgba(220,230,245,0)');
        x.fillStyle = pg; x.beginPath(); x.ellipse(px, py, pr * 1.4, pr * 0.8, 0, 0, Math.PI * 2); x.fill();
      }
    }
  });
  const t = tex(c, { clamp: true }); t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

// --- the stadium -----------------------------------------------------------------------------------------------------------------------------------
/** A point on the stadium curve r out from the centre line, u in [0,1): [x, z, nx, nz] (n = outward). */
export function stadiumPoint(r, u, S = SITES.stadium.S) {
  const P = 4 * S + 2 * Math.PI * r;
  let d = (((u % 1) + 1) % 1) * P;
  if (d < 2 * S) return [-S + d, -r, 0, -1]; // north straight, going east
  d -= 2 * S;
  if (d < Math.PI * r) { const a = -Math.PI / 2 + d / r; return [S + Math.cos(a) * r, Math.sin(a) * r, Math.cos(a), Math.sin(a)]; }
  d -= Math.PI * r;
  if (d < 2 * S) return [S - d, r, 0, 1];
  d -= 2 * S;
  const a = Math.PI / 2 + d / r;
  return [-S + Math.cos(a) * r, Math.sin(a) * r, Math.cos(a), Math.sin(a)];
}
/** Distance from the stadium's centre line (0 inside the straight's span). */
export function stadiumR(x, z, S = SITES.stadium.S) { const dx = Math.max(0, Math.abs(x) - S); return Math.hypot(dx, z); }

/** A ring band between radii r0 and r1 at height y (flat), as a mesh in the kit. */
function ringBand(K, r0, r1, y, material, n = 160, o = {}) {
  const P = [], N = [], U = [];
  const sc = o.uv || 10;
  for (let i = 0; i < n; i++) {
    const a = stadiumPoint(r0, i / n), b = stadiumPoint(r0, (i + 1) / n), c = stadiumPoint(r1, (i + 1) / n), d = stadiumPoint(r1, i / n);
    const ua = (i / n) * (o.len || 400) / sc, ub = ((i + 1) / n) * (o.len || 400) / sc;
    const va = r0 / sc, vc = r1 / sc;
    P.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1], a[0], y, a[1], c[0], y, c[1], d[0], y, d[1]);
    U.push(ua, va, ub, va, ub, vc, ua, va, ub, vc, ua, vc);
    for (let k = 0; k < 6; k++) N.push(0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  K.geo(g, material, 0, 0, 0);
}

function seatsTexture() {
  return tex(canvas(256, 64, (x, w, h) => {
    x.fillStyle = '#9a9a98'; x.fillRect(0, 0, w, h);
    const cols = ['#1f6fd1', '#1f6fd1', '#1f6fd1', '#f4f4f0'];
    for (let i = 0; i < 8; i++) { x.fillStyle = cols[i % 4]; x.fillRect(i * 32 + 3, 4, 26, 26); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(i * 32 + 3, 26, 26, 4); }
  }));
}

function buildStadium(K, world, crowd, flags) {
  const st = SITES.stadium, S = st.S;
  // infield (mown stripes) and the track
  const inner = st.track, outer = st.track + st.lanes * st.laneW;
  const mownM = mat('mown');
  // the infield: a box over the straight and two half-discs
  K.box(0, 0.05, 0, 2 * S, 0.1, 2 * inner, mownM, { col: false });
  for (const sx of [-1, 1]) K.geo(new THREE.CircleGeometry(inner, 40, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).rotateY(sx > 0 ? 0 : Math.PI), mownM, sx * S, 0.1, 0);
  ringBand(K, inner, outer, 0.12, mat('track'), 200, { uv: 10, len: 600 });
  // lane lines
  const white = colorMat(0xf6f6f2, 0.6);
  for (let l = 0; l <= st.lanes; l++) ringBand(K, inner + l * st.laneW - 0.12, inner + l * st.laneW + 0.12, 0.16, white, 200);
  // start and finish lines across the north straight
  for (const x of [-S + 2, S - 2]) K.box(x, 0.17, -(inner + outer) / 2, 0.5, 0.02, outer - inner, white, { col: false });
  // apron and the barrier round the track
  const r0 = st.stands0;
  ringBand(K, outer, r0, 0.1, mat('track'), 160, { uv: 10, len: 600 });
  const wallM = colorMat(0x1a4fa8, 0.5);
  const n = 96;
  for (let i = 0; i < n; i++) {
    const [ax, az] = stadiumPoint(r0, i / n), [bx, bz] = stadiumPoint(r0, (i + 1) / n);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, L = Math.hypot(bx - ax, bz - az) + 0.25, yaw = Math.atan2(-(bz - az), bx - ax);
    K.box(mx, 0.9, mz, L, 1.8, 0.6, wallM, { rot: yaw, col: false });
    K.col(mx, 5, mz, L, 10, 1.5, yaw); // (players stay on the field)
  }
  // the stands: tiers stepping up and out; seats painted on the treads
  const seatM = new THREE.MeshStandardMaterial({ map: seatsTexture(), roughness: 0.75 });
  const conc = mat('concrete');
  const N = 176, T = st.tiers;
  const tread = [], riser = [];
  for (let t = 0; t < T; t++) {
    const ra = r0 + t * st.tierD, rb = ra + st.tierD, y = 2 + t * st.tierH, y0 = t ? y - st.tierH : 0;
    for (let i = 0; i < N; i++) {
      const a = stadiumPoint(ra, i / N), b = stadiumPoint(ra, (i + 1) / N), c = stadiumPoint(rb, (i + 1) / N), d = stadiumPoint(rb, i / N);
      const P = 4 * S + 2 * Math.PI * ra, u0 = (i / N) * P / 8, u1 = ((i + 1) / N) * P / 8;
      tread.push([a, b, c, d, y, u0, u1]);
      riser.push([a, b, y0, y, u0, u1]);
      // spectators: about two in three seats taken
      if (i % 1 === 0) {
        const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const per = Math.max(1, Math.round(seg / 2.3));
        for (let k = 0; k < per; k++) {
          if (Math.random() < 0.3) continue;
          const f = (k + 0.5) / per, rr = ra + st.tierD * 0.55;
          const p = stadiumPoint(rr, (i + f) / N);
          crowd.seat(p[0], y + 0.05, p[1], Math.atan2(p[2], p[3]));
        }
      }
    }
  }
  const quads = (list, isTread) => {
    const P = [], U = [], Nn = [];
    for (const q of list) {
      if (isTread) {
        const [a, b, c, d, y, u0, u1] = q;
        P.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1], a[0], y, a[1], c[0], y, c[1], d[0], y, d[1]);
        U.push(u0, 1, u1, 1, u1, 0, u0, 1, u1, 0, u0, 0);
        for (let k = 0; k < 6; k++) Nn.push(0, 1, 0);
      } else {
        const [a, b, y0, y1, u0, u1] = q;
        P.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y0, a[1], b[0], y1, b[1], a[0], y1, a[1]);
        U.push(u0, 0, u1, 0, u1, (y1 - y0) / 8, u0, 0, u1, (y1 - y0) / 8, u0, (y1 - y0) / 8);
        // facing inwards
        for (let k = 0; k < 6; k++) Nn.push(-a[2], 0, -a[3]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    return g;
  };
  K.geo(quads(tread, true), seatM, 0, 0, 0);
  K.geo(quads(riser, false), conc, 0, 0, 0);
  // the outer wall, with arches, and the rim
  const rOut = r0 + T * st.tierD, topY = 2 + (T - 1) * st.tierH;
  const facade = new THREE.MeshStandardMaterial({ map: facadeTexture(), roughness: 0.7 });
  const NF = 88;
  for (let i = 0; i < NF; i++) {
    const [ax, az, nx, nz] = stadiumPoint(rOut, i / NF), [bx, bz] = stadiumPoint(rOut, (i + 1) / NF);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, L = Math.hypot(bx - ax, bz - az) + 0.3, yaw = Math.atan2(-(bz - az), bx - ax);
    K.geo(boxGeo(L, topY + 3, 1.6, 1), facade, mx + nx * 0.8, (topY + 3) / 2, mz + nz * 0.8, yaw);
    K.box(mx + nx * 0.3, topY + 3.6, mz + nz * 0.3, L, 1.2, 2.6, 'white', { rot: yaw, col: false });
    if (i % 4 === 0) flags.add(mx + nx * 1.4, topY + 4.2, mz + nz * 1.4, 9, 0.2 + Math.sin(i) * 0.15, i / 4);
  }
  // roofs over the two long sides: a white membrane on steel arms
  const roofM = colorMat(0xf6f8fa, 0.5, 0, { side: THREE.DoubleSide, emissive: 0x9aa4ae, emissiveIntensity: 0.35 });
  for (const sz of [-1, 1]) {
    const zIn = sz * (r0 + 14), zOut = sz * (rOut + 1), y0 = topY + 16, y1 = topY + 12;
    const L = 2 * S + 60, depth = Math.abs(zOut - zIn), mid = (zIn + zOut) / 2;
    const tilt = Math.atan2(y0 - y1, depth) * sz;
    K.geo(boxGeo(L, 0.6, depth + 2, 1), roofM, 0, (y0 + y1) / 2, mid, [tilt * 57.3, 0, 0]);
    for (let x = -L / 2 + 6; x <= L / 2 - 6; x += 18) {
      K.box(x, (topY + 3 + y1) / 2 + 2, zOut, 1.2, y1 - topY + 2, 1.2, 'steel', { col: false });
      K.geo(boxGeo(0.8, 0.8, depth, 1), mat('steel'), x, (y0 + y1) / 2 - 0.8, mid, [tilt * 57.3, 0, 0]);
    }
  }
  // floodlight masts at the four corners
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * (S + 92), z = sz * 82;
    K.cyl(x, 32, z, 1.4, 64, 'steel', { rTop: 0.9, col: false, seg: 10 });
    // the head of the mast faces the middle of the field
    const yaw = Math.atan2(x, z);
    K.box(x, 66, z, 14, 7, 1.5, 'darkSteel', { rot: yaw, col: false });
    K.box(x - Math.sin(yaw) * 0.85, 66, z - Math.cos(yaw) * 0.85, 12.6, 5.8, 0.3, colorMat(0xfffbe8, 0.3, 0, { emissive: 0xfff5d0, emissiveIntensity: 1.6 }), { rot: yaw, col: false, noShadow: true });
  }
  // the Olympic rings painted on the infield
  const ringCols = [0x0081c8, 0x000000, 0xee334e, 0xfcb131, 0x00a651];
  const RP = [[-13, -3], [0, -3], [13, -3], [-6.5, 3.2], [6.5, 3.2]];
  RP.forEach(([x, z], i) => K.geo(new THREE.RingGeometry(5.2, 6.4, 48).rotateX(-Math.PI / 2), colorMat(ringCols[i], 0.6), x, 0.2 + i * 0.002, z));
  return { topY, rOut };
}

function facadeTexture() {
  return tex(canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#e9e4da'; x.fillRect(0, 0, w, h);
    // two storeys of arches
    for (const [y, ah] of [[150, 80], [40, 70]]) {
      x.fillStyle = '#5a6470';
      x.beginPath(); x.moveTo(40, y + ah); x.lineTo(40, y + 30); x.arc(128, y + 30, 88, Math.PI, 0); x.lineTo(216, y + ah); x.closePath(); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(40, y + ah - 8, 176, 8);
    }
    x.fillStyle = '#d4cdbf'; x.fillRect(0, 128, w, 10); x.fillRect(0, 0, w, 8);
  }));
}

// --- the flame ----------------------------------------------------------------------------------------------------------------------------------------
function buildFlame(K) {
  const { x, z } = SITES.flame;
  // a plinth, a fluted column and the cauldron
  K.box(x, 2, z, 24, 4, 24, 'marble');
  K.box(x, 5, z, 18, 2, 18, 'marble');
  K.cyl(x, 26, z, 4.5, 40, 'marble', { rTop: 3.8, seg: 24 });
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; K.box(x + Math.cos(a) * 4.2, 26, z + Math.sin(a) * 4.2, 0.6, 40, 0.6, 'marbleDark', { rot: -a, col: false }); }
  K.cyl(x, 47, z, 5.5, 2, 'gold', { rTop: 5, col: false, seg: 24 });
  const bowl = new THREE.LatheGeometry([new THREE.Vector2(0.1, 0), new THREE.Vector2(3, 0.2), new THREE.Vector2(6.5, 2.2), new THREE.Vector2(9, 5), new THREE.Vector2(8.6, 5.4), new THREE.Vector2(6, 3)], 32);
  K.geo(bowl, 'gold', x, 48, z);
  return V(x, 53.5, z);
}

// --- the big screen -------------------------------------------------------------------------------------------------------------------------------
export class BigScreen {
  constructor(world, x, y, z, yaw, w = 44, h = 24.75) {
    this.c = document.createElement('canvas'); this.c.width = 1024; this.c.height = 576;
    this.t = new THREE.CanvasTexture(this.c); this.t.colorSpace = THREE.SRGBColorSpace; this.t.anisotropy = 4;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 2.4, h + 2.4, 1.6), new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.5, metalness: 0.4 }));
    frame.position.set(x, y, z); frame.rotation.y = yaw; world.scene.add(frame);
    this.m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.t, toneMapped: false }));
    this.m.position.set(x, y, z); this.m.rotation.y = yaw; this.m.translateZ(0.85);
    world.scene.add(this.m);
    const legM = new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.7, roughness: 0.4 });
    for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(1.6, y - h / 2, 1.6), legM); leg.position.set(x, (y - h / 2) / 2, z); leg.rotation.y = yaw; leg.translateX(s * w * 0.35); leg.translateZ(-1.5); world.scene.add(leg); }
    this.draw(() => {});
  }
  /** Paint the screen: fn(ctx, w, h). */
  draw(fn) {
    const x = this.c.getContext('2d'), w = this.c.width, h = this.c.height;
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b2a5a'); g.addColorStop(1, '#06142c');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    fn(x, w, h);
    // LED grain
    x.fillStyle = 'rgba(0,0,0,0.18)';
    for (let yy = 0; yy < h; yy += 4) x.fillRect(0, yy, w, 1);
    this.t.needsUpdate = true;
  }
}

// --- trees, lamps, fountains -------------------------------------------------------------------------------------------------------------------------
function clearAt(x, z) {
  for (const [x0, z0, x1, z1] of CLEAR) if (x > x0 && x < x1 && z > z0 && z < z1) return false;
  if (x > LAKE.x0 - 10 && x < LAKE.x1 + 10 && z > LAKE.z0 - 10 && z < LAKE.z1 + 10) return false;
  return true;
}
function buildTrees(world) {
  const r = rng(99);
  const cyp = [], oak = [];
  for (let i = 0; i < 2400 && cyp.length + oak.length < 700; i++) {
    const x = (r() - 0.5) * 1500, z = (r() - 0.5) * 1300;
    if (!clearAt(x, z)) continue;
    if (Math.hypot(x, z) < 200) continue;
    (r() < 0.45 ? cyp : oak).push([x, z, 0.75 + r() * 0.6, r() * 6.28]);
  }
  // avenues of cypresses along the paths
  for (let k = -1; k <= 1; k += 2) {
    for (let z = -175; z > -225; z -= 14) cyp.push([k * 16, z, 1, 0]);
    for (let x = 190; x < 222; x += 14) cyp.push([x, k * 16, 0.9, 0]);
    for (let x = -190; x > -222; x -= 14) cyp.push([x, k * 16, 0.9, 0]);
    for (let z = 130; z < 190; z += 14) cyp.push([k * 16, z, 0.9, 0]);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const inst = (geo, material, list, f) => {
    const im = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((t, i) => { f(t, p, s); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t[3]); m.compose(p, q, s); im.setMatrixAt(i, m); });
    im.castShadow = true; im.receiveShadow = true;
    world.scene.add(im);
    return im;
  };
  const trunk = cylGeo(0.5, 0.7, 1, 6);
  inst(trunk, mat('bark'), cyp, (t, P, Sc) => { P.set(t[0], 2 * t[2], t[1]); Sc.set(t[2], 4 * t[2], t[2]); });
  const cone = new THREE.ConeGeometry(3.2, 22, 9); cone.translate(0, 11, 0);
  inst(cone, mat('cypress'), cyp, (t, P, Sc) => { P.set(t[0], 2.5 * t[2], t[1]); Sc.set(t[2], t[2], t[2]); });
  inst(trunk, mat('bark'), oak, (t, P, Sc) => { P.set(t[0], 3 * t[2], t[1]); Sc.set(t[2] * 1.4, 6 * t[2], t[2] * 1.4); });
  const crown = new THREE.IcosahedronGeometry(6, 1); crown.scale(1.2, 0.85, 1.2);
  const crownC = crown.attributes.position;
  for (let i = 0; i < crownC.count; i++) { const k = 0.85 + Math.sin(i * 12.9898) * 0.15; crownC.setXYZ(i, crownC.getX(i) * k, crownC.getY(i) * k, crownC.getZ(i) * k); }
  crown.computeVertexNormals();
  inst(crown, mat('olive'), oak, (t, P, Sc) => { P.set(t[0], 9 * t[2], t[1]); Sc.set(t[2], t[2], t[2]); });
}

function buildLamps(K, list) {
  for (const [x, z] of list) {
    K.cyl(x, 6, z, 0.25, 12, 'darkSteel', { col: false, seg: 8 });
    K.box(x, 12.2, z, 1.6, 0.5, 1.6, 'darkSteel', { col: false });
    K.box(x, 11.6, z, 1.2, 0.8, 1.2, colorMat(0xfff4d6, 0.3, 0, { emissive: 0xffe9b0, emissiveIntensity: 0.8 }), { col: false, noShadow: true });
  }
}

function fountain(K, x, z, r = 9) {
  K.cyl(x, 0.6, z, r, 1.2, 'marble', { seg: 32 });
  K.cyl(x, 1.25, z, r - 1, 0.2, colorMat(0x3f9fd6, 0.08, 0.1, { transparent: true, opacity: 0.85 }), { col: false, seg: 32, noShadow: true });
  K.cyl(x, 3, z, 1.2, 4, 'marble', { col: false, seg: 12 });
  K.cyl(x, 5.2, z, 3, 0.6, 'marble', { col: false, seg: 20 });
  return V(x, 5.6, z);
}

/** Olympic rings standing on a plinth (as a monument). */
export function ringsMonument(K, x, y, z, yaw, size = 1) {
  const cols = ['blue', 'black', 'red', 'yellow', 'green'];
  const RP = [[-2.2, 0.5], [0, 0.5], [2.2, 0.5], [-1.1, -0.55], [1.1, -0.55]];
  const geo = new THREE.TorusGeometry(1, 0.13, 10, 48);
  const blackM = colorMat(0x111111, 0.4, 0.3);
  RP.forEach(([rx, ry], i) => {
    const off = new THREE.Vector3(rx * size, ry * size, (i % 2 ? 0.25 : -0.25) * size).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const m = cols[i] === 'black' ? blackM : colorMat({ blue: 0x0081c8, red: 0xee334e, yellow: 0xfcb131, green: 0x00a651 }[cols[i]], 0.35, 0.3);
    K.geo(geo, m, x + off.x, y + off.y, z + off.z, yaw, { scale: [size, size, size] });
  });
}

// --- distant scenery ---------------------------------------------------------------------------------------------------------------------------------------
function buildDistance(world) {
  const r = rng(31);
  const g = new THREE.BufferGeometry();
  const P = [];
  const col = [];
  // a ring of hills and mountains, flat-shaded
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + r() * 0.05;
    const south = Math.sin(a) > 0.55; // the sea is to the south
    if (south) continue;
    const R = 1350 + r() * 500, h = 120 + r() * 260, w = 220 + r() * 260;
    const cx = Math.cos(a) * R, cz = Math.sin(a) * R;
    const segs = 7;
    for (let k = 0; k < segs; k++) {
      const a0 = (k / segs) * Math.PI * 2, a1 = ((k + 1) / segs) * Math.PI * 2;
      const j0 = 0.8 + r() * 0.4, j1 = 0.8 + r() * 0.4;
      P.push(cx, h * (0.85 + r() * 0.3), cz, cx + Math.cos(a1) * w * j1, -5, cz + Math.sin(a1) * w * j1, cx + Math.cos(a0) * w * j0, -5, cz + Math.sin(a0) * w * j0);
      const far = (R - 1350) / 500, c = new THREE.Color().setHSL(0.3 - far * 0.08, 0.25 - far * 0.1, 0.36 + far * 0.12);
      for (let m = 0; m < 3; m++) col.push(c.r, c.g, c.b);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  world.scene.add(m);
  // the sea
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 2600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a7fb8, roughness: 0.25, metalness: 0.1 }));
  sea.position.set(0, -2, 2050);
  world.scene.add(sea);
  // a beach between the park and the sea
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(6000, 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe6d3a0, roughness: 1 }));
  beach.position.set(0, -0.6, 760);
  world.scene.add(beach);
}

// --- the ground ------------------------------------------------------------------------------------------------------------------------------------------
/** Grass over [x0,x1]x[z0,z1] with rectangular holes (the lake, the pool). */
function ground(K, x0, z0, x1, z1, holes) {
  // cut the area into strips around the holes
  const xs = new Set([x0, x1]), zs = new Set([z0, z1]);
  for (const h of holes) { xs.add(h.x0); xs.add(h.x1); zs.add(h.z0); zs.add(h.z1); }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
  for (let i = 0; i < X.length - 1; i++) {
    for (let j = 0; j < Z.length - 1; j++) {
      const cx = (X[i] + X[i + 1]) / 2, cz = (Z[j] + Z[j + 1]) / 2;
      if (holes.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1)) continue;
      K.span(X[i], -4, Z[j], X[i + 1], 0, Z[j + 1], 'grass');
    }
  }
}

function path(K, x0, z0, x1, z1, w = 14) {
  const L = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0);
  K.box((x0 + x1) / 2, 0.06, (z0 + z1) / 2, L, 0.12, w, 'paving', { rot: yaw, col: false });
  // kerbs
  for (const s of [-1, 1]) {
    const ox = Math.sin(yaw) * (w / 2) * s, oz = Math.cos(yaw) * (w / 2) * s;
    K.box((x0 + x1) / 2 + ox, 0.2, (z0 + z1) / 2 + oz, L, 0.4, 0.6, 'marble', { rot: yaw, col: false });
  }
}

export function buildPark(world) {
  const K = new Kit(world);
  world.setSky(skyTexture());
  world.scene.fog = new THREE.Fog(0xcfe0ee, 500, 2300);
  // light: a bright Mediterranean afternoon
  world.ambient.color.set(0xcfe2ff); world.ambient.groundColor.set(0x9a917c); world.ambient.intensity = 1.25;
  world.sun.color.set(0xfff1dc); world.sun.intensity = 2.6;
  world.fill.color.set(0xc8dcff); world.fill.intensity = 0.35;
  const crowd = new Crowd(world, 9000);
  const flags = new Flags(world);

  ground(K, -1100, -900, 1100, 760, [LAKE, POOL]);
  const stad = buildStadium(K, world, crowd, flags);
  const flame = buildFlame(K);
  // the concourse round the stadium and the paths out to the venues
  ringBand(K, stad.rOut + 1.5, stad.rOut + 26, 0.05, mat('paving'), 120, { uv: 24, len: 1200 });
  path(K, 0, -137, 0, -205, 16); // north: the flame and the stairs
  path(K, 172 + 24, 0, 226, 0, 16); // east: the cannons
  path(K, -172 - 24, 0, -222, 0, 16); // west: the lake
  path(K, 0, 136, 0, 200, 16); // south: the pool
  path(K, 120, 118, 175, 168, 14); // south-east: the bowling
  // plazas
  K.box(0, 0.05, -137, 60, 0.1, 60, 'paving', { col: false });
  const fountains = [fountain(K, 140, 140, 8), fountain(K, -140, 140, 8), fountain(K, -140, -140, 8), fountain(K, 140, -140, 8)];
  const lamps = [];
  for (let z = -150; z > -205; z -= 18) lamps.push([-9, z], [9, z]);
  for (let x = 205; x < 226; x += 12) lamps.push([x, -9], [x, 9]);
  for (let x = -205; x > -226; x -= 12) lamps.push([x, -9], [x, 9]);
  for (let z = 145; z < 200; z += 18) lamps.push([-9, z], [9, z]);
  for (let i = 0; i < 40; i++) { const p = stadiumPoint(stad.rOut + 24, i / 40); lamps.push([p[0], p[1]]); }
  buildLamps(K, lamps);
  // the Olympic rings over the way to the stairs
  ringsMonument(K, 0, 21, -200, 0, 5);
  for (const sx of [-1, 1]) K.box(sx * 19.5, 15.5, -200, 2.4, 31, 2.4, 'marble');
  K.box(0, 31.5, -200, 43, 1.6, 2.8, 'marble');
  buildTrees(world);
  buildDistance(world);
  // the big screen over the south stand, facing the field
  const screen = new BigScreen(world, 0, 70, 112 + 12, Math.PI);
  // the podium on the infield, facing north
  const podium = buildPodium(K, 0, 26);
  return { K, crowd, flags, screen, flame, fountains, podium };
}

function buildPodium(K, x, z) {
  const spots = [];
  // (as the crowd in the north stand sees it: second on the left, third on the right)
  const blocks = [[0, 4.5, 'gold', '1'], [7, 3.2, 'silver', '2'], [-7, 2, 'bronze', '3']];
  for (const [dx, h, m] of blocks) {
    K.box(x + dx, h / 2, z, 6.6, h, 6.6, 'marble');
    K.box(x + dx, h - 0.1, z - 3.35, 6.6, 0.4, 0.15, m, { col: false });
    spots.push(V(x + dx, h, z));
  }
  // numbers on the fronts
  blocks.forEach(([dx, h, , n]) => {
    const t = textTex(n, { w: 128, h: 128, bg: '#f5f2ea', fg: '#1a2a5a', size: 100 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
    m.position.set(x + dx, h / 2, z - 3.32); m.rotation.y = Math.PI;
    K.group.add(m);
  });
  // a red carpet up to it
  K.box(x, 0.18, z - 12, 22, 0.1, 14, colorMat(0xb01e28, 0.9), { col: false });
  return spots;
}
