// Cabin doors: L1 / R1 / L2 / R2 plug-type doors (leaf with viewing window,
// big operating handle, slide bustle, girt bar + "SLIDE ARMED" warning strap,
// placards) with their surrounds (jamb tunnel, trim, sill threshold, assist
// handle, girt-bar floor brackets), and the reinforced flight-deck door.
//
// Doors are built in a RIGHT-SIDE local frame (x outboard, z aft, origin at the
// door centre station on the floor); left doors use a mirrored group
// (scale.x = -1) and pre-flipped placards.
//
// Opening sequence (~7 s): handle rotates 180°, the door lifts/moves inboard
// to unlatch, then swings outward & forward on its hinge arm and parks flat
// against the fuselage forward of the opening, inner lining facing out.
import * as THREE from 'three';
import { AIRCRAFT, DOORS, ZONES } from '../../core/constants.js';
import { Kit, T, mul, MIRROR_X, box, boxMM, rbox, cyl, plane, plate, frame, tube, grabHandle, slab, ccw, worldUV, smoothstep, clamp, easeInOut , flipX } from './geom.js';

const CY = AIRCRAFT.fuselage.centerY;
const RL = AIRCRAFT.fuselage.radiusInner - AIRCRAFT.fuselage.liningInset;   // 1.69
const R_SKIN = 1.885;
const R_LEAF_IN = 1.672, R_LEAF_OUT = 1.872;
const arcX = (y, r) => { const d = y - CY; return Math.sqrt(Math.max(0, r * r - d * d)); };
const phiAt = (y, r) => Math.asin(clamp((y - CY) / r, -1, 1));
/** Inner radius of the hole edge at height y (dado below 0.3, lining above). */
const xIn = (y) => (y < 0.3 ? 1.625 + (1.668 - 1.625) * (y / 0.3) : arcX(y, RL));

/** Matrix placing an object on the cylinder r at height y / station z, local +z = inward normal, +y = up tangent, +x = aft. */
export function surfaceFrame(y, z, r, inset = 0) {
  const p = phiAt(y, r), c = Math.cos(p), s = Math.sin(p);
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-s, c, 0), new THREE.Vector3(-c, -s, 0));
  m.setPosition((r - inset) * c, CY + (r - inset) * s, z);
  return m;
}

/** Curved panel on cylinder r between heights y0..y1 and stations z0..z1, optional circular hole (centre y, z, radius). */
function curvedPanel(r, y0, y1, z0, z1, { inward = true, hole = null, nz = 8, ny = 16 } = {}) {
  const pos = [], nor = [], uv = [], idx = [];
  const v0 = phiAt(y0, r) * r, v1 = phiAt(y1, r) * r;
  const P = (z, v) => {
    const p = v / r; const c = Math.cos(p), s = Math.sin(p);
    pos.push(r * c, CY + r * s, z);
    if (inward) nor.push(-c, -s, 0); else nor.push(c, s, 0);
    uv.push(z * 1.3, v * 1.3);
    return pos.length / 3 - 1;
  };
  const quad = (a, b, c, d) => { if (inward) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c); };
  if (!hole) {
    const grid = [];
    for (let j = 0; j <= ny; j++) { grid.push([]); for (let i = 0; i <= nz; i++) grid[j].push(P(z0 + (z1 - z0) * i / nz, v0 + (v1 - v0) * j / ny)); }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nz; i++) quad(grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1]);
  } else {
    // square region around the hole is meshed as an annulus; the rest as a coarse grid of 4 rects
    const hv = phiAt(hole.y, r) * r, hz = hole.z, hr = hole.r, sq = hole.sq || hole.r * 1.6;
    const rect = (za, zb, va, vb, nI, nJ) => {
      const g = [];
      for (let j = 0; j <= nJ; j++) { g.push([]); for (let i = 0; i <= nI; i++) g[j].push(P(za + (zb - za) * i / nI, va + (vb - va) * j / nJ)); }
      for (let j = 0; j < nJ; j++) for (let i = 0; i < nI; i++) quad(g[j][i], g[j + 1][i], g[j + 1][i + 1], g[j][i + 1]);
    };
    rect(z0, z1, v0, hv - sq, nz, Math.max(2, Math.round(ny * (hv - sq - v0) / (v1 - v0))));
    rect(z0, z1, hv + sq, v1, nz, Math.max(2, Math.round(ny * (v1 - hv - sq) / (v1 - v0))));
    rect(z0, hz - sq, hv - sq, hv + sq, 2, 4);
    rect(hz + sq, z1, hv - sq, hv + sq, 2, 4);
    const N = 32;
    const inner = [], outer = [];
    for (let k = 0; k <= N; k++) {
      const a = (k / N) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      inner.push(P(hz + hr * ca, hv + hr * sa));
      const t = sq / Math.max(Math.abs(ca), Math.abs(sa));
      outer.push(P(hz + t * ca, hv + t * sa));
    }
    // the outer square must share the rect edges' vertices loosely (small T-junctions are invisible)
    for (let k = 0; k < N; k++) quad(inner[k], inner[k + 1], outer[k + 1], outer[k]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Strip surface between two radii functions along y at a fixed station z (jamb faces). normal = +z * dir. */
function jambFace(z, y0, y1, rInFn, rOutFn, dir, n = 20) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const y = y0 + (y1 - y0) * i / n;
    pos.push(rInFn(y), y, z, rOutFn(y), y, z);
    nor.push(0, 0, dir, 0, 0, dir);
    uv.push(0, y * 1.3, 0.25, y * 1.3);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    if (dir > 0) idx.push(a, b, d, a, d, c); else idx.push(a, d, b, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const COL = { lining: [0.46, 0.465, 0.46], trim: [0.62, 0.63, 0.64], bustle: [0.7, 0.71, 0.7], dark: [0.07, 0.07, 0.075], jamb: [0.72, 0.72, 0.71], skin: [0.85, 0.86, 0.88] };

/**
 * Build a door (surround into `staticKit`, leaf as its own group).
 * returns { id, group, pivot, leaf, handle, girt, strap, setOpen(), open, armed, update(dt) ... }
 */
export function buildDoor(ctx, id) {
  const { M, tex, root, staticKit } = ctx;
  const d = DOORS[id];
  const mirror = d.side === 'left';
  const pl = (g) => (mirror ? flipX(g) : g);
  const R = (n) => tex.rect(n);
  const w = d.width, h = d.height;
  const hz0 = -w / 2 - 0.02, hz1 = w / 2 + 0.02, top = h + 0.03;   // hole (matches the cabin lining hole)

  // ==================================================================== surround (static)
  const sk = new Kit();
  // jamb faces (fore / aft) and the head
  sk.add('plastic', jambFace(hz0, 0, top, xIn, (y) => arcX(y, R_SKIN), 1), null, { color: COL.jamb });
  sk.add('plastic', jambFace(hz1, 0, top, xIn, (y) => arcX(y, R_SKIN), -1), null, { color: COL.jamb });
  {
    const x0 = xIn(top), x1 = arcX(top, R_SKIN);
    const g = boxMM(x0, top, hz0, x1, top + 0.03, hz1, [2, 1, 4]);
    sk.add('plastic', g, null, { color: COL.jamb });
  }
  // door seal (dark rubber bead) on the jamb faces near the skin
  for (const [z, dz] of [[hz0, 0.006], [hz1, -0.006]]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const y = 0.02 + (top - 0.04) * i / 12; pts.push([arcX(y, 1.86), y, z + dz]); }
    sk.add('rubber', tube(pts, 0.009, 6, 24), null, { color: COL.dark });
  }
  // sill / threshold: ribbed stainless plate from the cabin floor out to the skin, + outer face
  const sillX0 = 1.56, sillX1 = arcX(0, R_SKIN) + 0.01;
  sk.add('steel', boxMM(sillX0, -0.03, hz0, sillX1, 0.006, hz1, [2, 1, 2]), null, { color: [0.85, 0.85, 0.86], ao: false });
  for (let i = 0; i < 9; i++) { const x = sillX0 + 0.015 + i * (sillX1 - sillX0 - 0.03) / 8; sk.add('steel', boxMM(x - 0.004, 0.006, hz0 + 0.02, x + 0.004, 0.01, hz1 - 0.02), null, { color: [0.7, 0.7, 0.72], ao: false }); }
  sk.add('plastic', boxMM(sillX1 - 0.02, -0.35, hz0, sillX1, -0.03, hz1), null, { color: [0.6, 0.6, 0.62], ao: false });
  sk.add('rubber', boxMM(sillX0 - 0.01, 0.0, hz0 - 0.01, sillX0 + 0.012, 0.012, hz1 + 0.01), null, { color: COL.dark });
  // trim frame on the lining around the opening (curved strips) + kick plates
  for (const [za, zb] of [[hz0 - 0.05, hz0], [hz1, hz1 + 0.05]]) sk.add('plastic', curvedPanel(RL - 0.006, 0.3, top + 0.05, za, zb, { nz: 1, ny: 14 }), null, { color: COL.trim });
  sk.add('plastic', curvedPanel(RL - 0.006, top, top + 0.06, hz0 - 0.05, hz1 + 0.05, { nz: 4, ny: 1 }), null, { color: COL.trim });
  for (const [za, zb] of [[hz0 - 0.05, hz0], [hz1, hz1 + 0.05]]) sk.add('steel', boxMM(1.585, 0, za, 1.64, 0.3, zb), null, { color: [0.78, 0.78, 0.79] });
  // assist handle on the aft side of the opening (follows the lining curvature)
  {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const y = 0.95 + 0.55 * i / 6; pts.push([arcX(y, RL - 0.055), y, hz1 + 0.11]); }
    sk.add('chrome', tube(pts, 0.013, 10, 24));
    for (const y of [0.95, 1.5]) {
      const a = arcX(y, RL - 0.004), b = arcX(y, RL - 0.055);
      sk.add('chrome', tube([[a, y, hz1 + 0.11], [b, y, hz1 + 0.11]], 0.011, 8, 2));
      sk.add('chrome', cyl(0.022, 0.022, 0.01, 16), mul(surfaceFrame(y, hz1 + 0.11, RL, 0.004), T(0, 0, 0, Math.PI / 2, 0, 0)));
    }
    sk.add('placard', pl(plane(0.1, 0.022)), mul(surfaceFrame(1.6, hz1 + 0.11, RL, 0.007)), { uvRect: R('assist') });
  }
  // door number + warning placards on the trim
  sk.add('placard', pl(plane(0.05, 0.05)), surfaceFrame(top + 0.12, hz0 - 0.03, RL, 0.006), { uvRect: R('door' + id) });
  // girt-bar floor brackets
  for (const z of [-w / 2 + 0.12, w / 2 - 0.12]) {
    sk.add('steel', rbox(0.06, 0.03, 0.05, 0.008), T(1.46, 0.015, z), { color: [0.7, 0.7, 0.72] });
    sk.add('rubber', box(0.02, 0.012, 0.03), T(1.46, 0.032, z), { color: COL.dark });
  }
  const placeM = mul(T(0, 0, d.z), mirror ? MIRROR_X : new THREE.Matrix4());
  staticKit.merge(sk, placeM);

  // ==================================================================== leaf (moving group)
  const group = new THREE.Group();
  group.name = `galley-door-${id}`;
  group.position.set(0, 0, d.z);
  root.add(group);
  const sx = mirror ? -1 : 1;
  const MX = mirror ? MIRROR_X : new THREE.Matrix4();
  const conj = (m) => (mirror ? mul(MIRROR_X, m, MIRROR_X) : m);
  const mk = (kit) => { if (!mirror) return kit; const k2 = new Kit(); k2.merge(kit, MIRROR_X); return k2; };
  // hinge pivot: outboard of the skin at the forward edge of the opening
  const pivotX = R_SKIN + 0.055, pivotZ = hz0 - 0.005;
  const pivot = new THREE.Group();
  pivot.position.set(sx * pivotX, 0, pivotZ);
  group.add(pivot);
  const leaf = new THREE.Group();      // leaf in closed pose relative to the pivot
  leaf.position.set(-sx * pivotX, 0, -pivotZ);
  pivot.add(leaf);

  const lk = new Kit((x, y) => 0.75 + 0.25 * smoothstep(0.0, 0.5, y));
  const lw = w - 0.006, lz0 = -lw / 2, lz1 = lw / 2, ly0 = 0.012, ly1 = h + 0.018;
  const win = { y: id[1] === '1' || id[1] === '2' ? 1.43 : 1.38, z: 0.02, r: 0.085 };
  if (d.kind === 'service') win.y = 1.33;
  // inner lining with the window hole, outer skin with the window hole, edges
  lk.add('plastic', curvedPanel(R_LEAF_IN, 0.47, ly1, lz0, lz1, { hole: { y: win.y, z: win.z, r: win.r + 0.012, sq: 0.15 }, nz: 6, ny: 14 }), null, { color: COL.lining });
  lk.add('plastic', curvedPanel(R_LEAF_OUT, ly0, ly1, lz0, lz1, { inward: false, hole: { y: CY + R_LEAF_OUT * (win.y - CY) / R_LEAF_IN, z: win.z, r: win.r, sq: 0.15 }, nz: 6, ny: 18 }), null, { color: COL.skin, ao: false });
  lk.add('plastic', jambFace(lz0, ly0, ly1, (y) => arcX(y, y < 0.47 ? 1.6 : R_LEAF_IN), (y) => arcX(y, R_LEAF_OUT), -1), null, { color: COL.jamb });
  lk.add('plastic', jambFace(lz1, ly0, ly1, (y) => arcX(y, y < 0.47 ? 1.6 : R_LEAF_IN), (y) => arcX(y, R_LEAF_OUT), 1), null, { color: COL.jamb });
  lk.add('plastic', boxMM(arcX(ly1, R_LEAF_IN), ly1 - 0.012, lz0, arcX(ly1, R_LEAF_OUT), ly1, lz1, [2, 1, 4]), null, { color: COL.jamb });
  lk.add('plastic', boxMM(arcX(ly0, 1.6), ly0, lz0, arcX(ly0, R_LEAF_OUT), ly0 + 0.012, lz1, [2, 1, 4]), null, { color: COL.jamb });
  // decorative seam grooves on the lining
  for (const y of [0.9, ly1 - 0.12]) lk.add('plastic', curvedPanel(R_LEAF_IN - 0.001, y, y + 0.004, lz0 + 0.03, lz1 - 0.03, { nz: 2, ny: 1 }), null, { color: [0.3, 0.3, 0.3] });
  // window tunnel + panes
  {
    const fIn = surfaceFrame(win.y, win.z, R_LEAF_IN);
    const tunnel = new THREE.CylinderGeometry(win.r + 0.012, win.r, R_LEAF_OUT - R_LEAF_IN + 0.02, 28, 1, true);
    tunnel.rotateX(Math.PI / 2);   // axis along local z
    // flip normals to face inside the tunnel
    const I = tunnel.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
    const N = tunnel.attributes.normal; for (let i = 0; i < N.count; i++) N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i));
    lk.add('plastic', tunnel, mul(fIn, T(0, 0, -(R_LEAF_OUT - R_LEAF_IN) / 2)), { color: [0.3, 0.3, 0.31], ao: false });
    lk.add('plastic', frame(2 * (win.r + 0.03), 2 * (win.r + 0.03), 0.024, 0.008, win.r + 0.03), mul(fIn, T(0, 0, 0.004)), { color: [0.55, 0.56, 0.57] });
    lk.add('glass', new THREE.CircleGeometry(win.r + 0.005, 28), mul(fIn, T(0, 0, -0.012)));
    lk.add('glass', new THREE.CircleGeometry(win.r, 28), mul(fIn, T(0, 0, -(R_LEAF_OUT - R_LEAF_IN) + 0.01)));
    // strap clips either side of the window
    for (const dz of [-1, 1]) lk.add('chrome', rbox(0.02, 0.03, 0.014, 0.004), mul(fIn, T(dz * (win.r + 0.05), -0.01, 0.007)));
  }
  // slide bustle (bottom of the door)
  {
    const bx1 = arcX(0.25, R_LEAF_IN) - 0.005, bx0 = 1.47;
    lk.add('plastic', rbox(bx1 - bx0 + 0.04, 0.42, lw - 0.05, 0.03, 3), T((bx0 + bx1) / 2 + 0.02, 0.26, 0), { color: COL.bustle, ao: (x, y) => 0.7 + 0.3 * smoothstep(0.03, 0.3, y) });
    lk.add('placard', pl(plane(0.34, 0.085)), T(bx0 - 0.0005, 0.33, 0, 0, -Math.PI / 2, 0), { uvRect: R('bustle') });
    lk.add('placard', pl(plane(0.3, 0.064)), T(bx0 - 0.0005, 0.2, 0, 0, -Math.PI / 2, 0), { uvRect: R('girtBar') });
    // stow hooks for the girt bar
    for (const z of [-w / 2 + 0.12, w / 2 - 0.12]) lk.add('chrome', rbox(0.03, 0.04, 0.03, 0.006), T(bx0 - 0.012, 0.43, z), { color: [0.75, 0.75, 0.77] });
    // manual inflation handle (red)
    lk.add('plastic', rbox(0.02, 0.05, 0.12, 0.008), T(bx0 - 0.01, 0.1, lw / 2 - 0.16), { color: [0.75, 0.05, 0.04] });
    lk.add('placard', pl(plane(0.11, 0.018)), T(bx0 - 0.0005, 0.06, lw / 2 - 0.16, 0, -Math.PI / 2, 0), { uvRect: R('manual') });
  }
  // placards on the lining
  lk.add('placard', pl(plane(0.17, 0.133)), surfaceFrame(1.08, lz1 - 0.12, R_LEAF_IN, 0.002), { uvRect: R('doorInstr') });
  lk.add('placard', pl(plane(0.15, 0.15)), surfaceFrame(1.08, -0.05, R_LEAF_IN, 0.002), { uvRect: R('doorArrow') });
  lk.add('placard', pl(plane(0.22, 0.041)), surfaceFrame(0.62, 0, R_LEAF_IN, 0.002), { uvRect: R('doorWarn') });
  // handle pivot hub (static part on the leaf)
  lk.add('chrome', cyl(0.045, 0.05, 0.03, 24), mul(surfaceFrame(1.08, -0.05, R_LEAF_IN, 0.015), T(0, 0, 0, Math.PI / 2, 0, 0)));
  // outer skin details: hinge fairing, handle recess (seen when open)
  lk.add('plastic', boxMM(R_LEAF_OUT - 0.002, 0.95, lz0 + 0.02, R_LEAF_OUT + 0.004, 1.2, lz0 + 0.14), mul(T(0, 0, 0)), { color: [0.25, 0.26, 0.28] });
  const leafMeshes = mk(lk).meshes(M, leaf, { namePrefix: `galley-door-${id}` });
  for (const m of Object.values(leafMeshes)) { m.castShadow = m.material !== M.glass && m.material !== M.placard; }

  // operating handle (rotates about the surface normal)
  const handle = new THREE.Group();
  handle.matrixAutoUpdate = false;
  const hBase = conj(surfaceFrame(1.08, -0.05, R_LEAF_IN, 0.035));
  const hk = new Kit(() => 1);
  hk.add('chrome', cyl(0.03, 0.03, 0.03, 20), T(0, 0, 0, Math.PI / 2, 0, 0));
  hk.add('chrome', rbox(0.3, 0.04, 0.025, 0.012), T(-0.15, 0, 0.012));
  hk.add('chrome', rbox(0.11, 0.05, 0.04, 0.016), T(-0.26, 0, 0.022), { color: [0.08, 0.08, 0.085] });
  mk(hk).meshes(M, handle, { namePrefix: `galley-door-${id}-handle` });
  leaf.add(handle);
  const _hr = new THREE.Matrix4();
  const setHandle = (a) => { handle.matrix.copy(hBase).multiply(_hr.makeRotationZ(sx * a)); handle.matrixWorldNeedsUpdate = true; };
  setHandle(0);

  // girt bar (moves between the stow hooks on the bustle and the floor brackets)
  const girt = new THREE.Group();
  const gk = new Kit(() => 1);
  gk.add('steel', cyl(0.012, 0.012, w - 0.12, 12), T(0, 0, 0, Math.PI / 2, 0, 0), { color: [0.85, 0.85, 0.86] });
  for (const z of [-w / 2 + 0.12, w / 2 - 0.12]) gk.add('steel', rbox(0.03, 0.035, 0.035, 0.006), T(0, 0, z), { color: [0.6, 0.6, 0.62] });
  gk.add('steel', box(0.03, 0.012, w - 0.3), T(0.0, 0.018, 0), { color: [0.9, 0.7, 0.1] });
  gk.meshes(M, girt, { namePrefix: `galley-door-${id}-girt` });
  // stowed on the bustle (moves with the leaf); when armed the door is closed and the bar sits in the floor brackets
  leaf.add(girt);
  const girtStow = new THREE.Vector3(sx * 1.455, 0.43, 0), girtArm = new THREE.Vector3(sx * 1.43, 0.035, 0);

  // slide-armed warning strap across the viewing window
  const strap = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.04), M.placard);
  {
    const rr = tex.rect('slideFlag');
    const U = strap.geometry.attributes.uv;
    for (let i = 0; i < U.count; i++) U.setXY(i, rr[0] + (rr[2] - rr[0]) * U.getX(i), rr[1] + (rr[3] - rr[1]) * U.getY(i));
  }
  strap.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(strap.geometry.attributes.position.count * 3).fill(1), 3));
  strap.name = `galley-door-${id}-strap`;
  strap.matrixAutoUpdate = false;
  leaf.add(strap);
  const fWin = surfaceFrame(win.y, win.z, R_LEAF_IN, 0.017);
  const strapArmed = conj(mul(fWin, T(0, 0, 0, 0, 0, -0.18)));
  const strapStowed = conj(mul(fWin, T(win.r + 0.075, -0.06, -0.004, 0, 0, Math.PI / 2), T(0, 0, 0, 0, 0, 0, 0.55, 1, 1)));
  const _ma = new THREE.Matrix4(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3();
  strapArmed.decompose(_p1, _q1, _s1); strapStowed.decompose(_p2, _q2, _s2);
  const qa = _q1.clone(), qs = _q2.clone(), pa = _p1.clone(), ps = _p2.clone(), sa = _s1.clone(), ss = _s2.clone();
  const setArm = (k) => {
    // k: 0 disarmed .. 1 armed
    const e = easeInOut(clamp(k));
    girt.position.lerpVectors(girtStow, girtArm, e);
    _q1.slerpQuaternions(qs, qa, e); _p1.lerpVectors(ps, pa, e); _s1.lerpVectors(ss, sa, e);
    strap.matrix.compose(_p1, _q1, _s1); strap.matrixWorldNeedsUpdate = true;
  };
  setArm(0);

  // hinge arm (visible while the door swings)
  const armK = new Kit(() => 1);
  armK.add('steel', rbox(0.16, 0.08, 0.05, 0.012), T(-0.08, 1.05, 0.02), { color: [0.7, 0.7, 0.72] });
  armK.add('steel', rbox(0.16, 0.08, 0.05, 0.012), T(-0.08, 0.55, 0.02), { color: [0.7, 0.7, 0.72] });
  armK.add('steel', cyl(0.02, 0.02, 0.62, 12), T(0, 0.8, 0));
  mk(armK).meshes(M, pivot, { namePrefix: `galley-door-${id}-arm` });

  // ==================================================================== animation
  // open: 0 closed .. 1 open.  Timeline (normalised): handle 0..0.18, unlatch 0.15..0.3, swing 0.3..1
  const st = { id, open: false, k: 0, target: 0, duration: 7.0, armed: false, armK: 0, armDelay: 0, armTarget: 0 };
  const apply = () => {
    const k = st.k;
    setHandle(-Math.PI * easeInOut(clamp(k / 0.18)));
    const un = easeInOut(clamp((k - 0.15) / 0.15));
    leaf.position.set(-sx * pivotX - sx * 0.025 * un * (1 - easeInOut(clamp((k - 0.3) / 0.15))), 0.018 * un, -pivotZ);
    const sw = easeInOut(clamp((k - 0.3) / 0.7));
    pivot.rotation.y = sx * sw * Math.PI * 0.985;
  };
  apply();
  return {
    id, def: d, group, leaf, pivot, st, mirror,
    get open() { return st.target > 0.5; },
    setOpen(open, { instant = false } = {}) {
      st.target = open ? 1 : 0;
      if (instant) { st.k = st.target; apply(); }
    },
    setArmed(on, { instant = false, delay = 0 } = {}) {
      st.armTarget = on ? 1 : 0; st.armDelay = instant ? 0 : delay;
      if (instant) { st.armK = st.armTarget; setArm(st.armK); }
    },
    get armed() { return st.armTarget > 0.5; },
    get moving() { return st.k !== st.target; },
    update(dt) {
      if (st.k !== st.target) {
        const step = dt / st.duration;
        st.k = st.k < st.target ? Math.min(st.target, st.k + step) : Math.max(st.target, st.k - step);
        apply();
      }
      if (st.armK !== st.armTarget) {
        if (st.armDelay > 0) { st.armDelay -= dt; return; }
        const step = dt / 1.6;
        st.armK = st.armK < st.armTarget ? Math.min(st.armTarget, st.armK + step) : Math.max(st.armTarget, st.armK - step);
        setArm(st.armK);
      }
    },
    soundPos: new THREE.Vector3(mirror ? -1.6 : 1.6, 1.2, d.z),
    handleProxy: { c: new THREE.Vector3(...[(mirror ? -1 : 1) * arcX(1.08, R_LEAF_IN - 0.05), 1.08, d.z - 0.05]), s: new THREE.Vector3(0.12, 0.35, 0.4) },
  };
}

/** Reinforced flight-deck door (static leaf, knock interaction) + keypad. */
export function buildCockpitDoor(ctx) {
  const { tex, staticKit } = ctx;
  const R = (n) => tex.rect(n);
  const zf = ZONES.flightDeckDoorZ;
  const hw = 0.36, dh = 1.93, t = 0.044;
  const k = new Kit();
  const zc = zf - t / 2 - 0.0005;
  // leaf: reinforced composite, slightly darker grey, with a stainless kick plate and decompression louvres
  k.add('plastic', worldUV(rbox(2 * hw - 0.008, dh - 0.006, t, 0.006, 2), 1.2), T(0, dh / 2, zc), { color: [0.7, 0.71, 0.7] });
  k.add('plastic', worldUV(box(2 * hw - 0.1, dh - 0.5, 0.004), 1.2), T(0, dh / 2 + 0.16, zf + 0.0015), { color: [0.74, 0.75, 0.74] });
  k.add('steel', box(2 * hw - 0.03, 0.24, 0.004), T(0, 0.13, zf + 0.002), { color: [0.85, 0.85, 0.86] });
  k.add('placard', plane(0.4, 0.2), T(0, 0.42, zf + 0.0045), { uvRect: R('louvre') });
  k.add('placard', plane(0.2, 0.05), T(0, 0.56, zf + 0.0045), { uvRect: R('decomp') });
  k.add('placard', plane(0.36, 0.12), T(0, 1.34, zf + 0.0045), { uvRect: R('crewOnly') });
  // peephole
  k.add('chrome', cyl(0.016, 0.018, 0.012, 20), T(0, 1.56, zf + 0.006, Math.PI / 2, 0, 0));
  k.add('glassDark', new THREE.CircleGeometry(0.008, 16), T(0, 1.56, zf + 0.0125));
  // lever handle + deadbolt escutcheon (left side as seen from the cabin; hinges on the right)
  const hx = -hw + 0.07;
  k.add('chrome', rbox(0.05, 0.16, 0.012, 0.01), T(hx, 1.02, zf + 0.008));
  k.add('chrome', cyl(0.014, 0.014, 0.05, 12), T(hx, 1.05, zf + 0.03, Math.PI / 2, 0, 0));
  k.add('chrome', rbox(0.13, 0.024, 0.022, 0.01), T(hx + 0.06, 1.05, zf + 0.055));
  k.add('chrome', cyl(0.018, 0.018, 0.012, 16), T(hx, 0.96, zf + 0.012, Math.PI / 2, 0, 0));
  k.add('rubber', box(0.004, 0.012, 0.004), T(hx, 0.96, zf + 0.019), { color: [0.05, 0.05, 0.05] });
  // hinges (right side)
  for (const y of [0.25, 0.95, 1.65]) k.add('steel', cyl(0.012, 0.012, 0.11, 12), T(hw - 0.006, y, zf + 0.006), { color: [0.7, 0.7, 0.72] });
  // keypad on the forward-lav wall facing the vestibule (left side, x = -0.42)
  const kx = -ZONES.forwardGalley.xMin + 0.0;     // -0.42
  const kpz = zf + 0.18;
  k.add('rubber', rbox(0.022, 0.2, 0.12, 0.008), T(kx + 0.011, 1.3, kpz), { color: [0.12, 0.12, 0.13] });
  k.add('placard', plane(0.1, 0.133), T(kx + 0.0225, 1.29, kpz, 0, Math.PI / 2, 0), { uvRect: R('keypad') });
  // pull-out placard: knock
  staticKit.merge(k);
  return {
    proxy: { c: new THREE.Vector3(0, 1.2, zf + 0.02), s: new THREE.Vector3(2 * hw, 1.9, 0.05) },
    keypadLeds: T(kx + 0.023, 1.39, kpz, 0, Math.PI / 2, 0),
  };
}
