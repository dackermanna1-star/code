// Crew stations & emergency equipment: fold-down attendant jumpseats (L1 single
// on the forward-lav wall, aft double in the aft galley recess), forward
// attendant panel (FAP touchscreen) + aft attendant panel, interphones, fire
// extinguishers, PBE, first-aid kit, flashlight (with blinking charge LED),
// megaphone, crew coat closet (interactive door, coats inside), magazine rack,
// galley curtains.
import * as THREE from 'three';
import { AIRCRAFT, ZONES } from '../../core/constants.js';
import { Kit, T, mul, box, boxMM, rbox, cyl, plane, frame, tube, grabHandle, lathe, slab, ccw, worldUV, smoothstep } from './geom.js';

const CY = AIRCRAFT.fuselage.centerY;
const arcX = (y, r = 1.665) => { const d = y - CY; return Math.sqrt(Math.max(0, r * r - d * d)); };
const COL = { cushion: [0.08, 0.1, 0.14], shell: [0.62, 0.63, 0.64], belt: [0.05, 0.05, 0.06], red: [0.7, 0.05, 0.04], lam: [0.8, 0.8, 0.79], navy: [0.035, 0.05, 0.09] };

/** Jumpseat: static back/headrest/harness on the wall + instanced folding pan. frameM: wall frame (local z = out of the wall, y up, x along the wall). */
export function buildJumpseat(ctx, kit, frameM, width = 0.42, seats = 1) {
  const R = (n) => ctx.tex.rect(n);
  const out = [];
  for (let i = 0; i < seats; i++) {
    const x = (i - (seats - 1) / 2) * (width + 0.02);
    const M = (m) => mul(frameM, m);
    // back cushion + headrest + shell
    kit.add('plastic', rbox(width + 0.02, 0.78, 0.03, 0.012, 2), M(T(x, 0.88, 0.015)), { color: COL.shell });
    kit.add('fabric', rbox(width - 0.04, 0.5, 0.06, 0.025, 3), M(T(x, 0.78, 0.055)), { color: COL.cushion, uvScale: 6 });
    kit.add('fabric', rbox(width - 0.14, 0.17, 0.06, 0.025, 3), M(T(x, 1.17, 0.055)), { color: COL.cushion, uvScale: 6 });
    // 4-point harness: shoulder straps + buckle
    for (const dx of [-0.1, 0.1]) kit.add('rubber', box(0.045, 0.42, 0.004), M(T(x + dx, 0.82, 0.088, 0, 0, dx > 0 ? -0.06 : 0.06)), { color: COL.belt });
    kit.add('chrome', rbox(0.07, 0.07, 0.014, 0.01), M(T(x, 0.6, 0.095)));
    // pan hinge brackets
    for (const dx of [-width / 2 + 0.01, width / 2 - 0.01]) kit.add('steel', box(0.02, 0.1, 0.06), M(T(x + dx, 0.47, 0.03)), { color: [0.55, 0.55, 0.57] });
    if (i === 0) kit.add('placard', plane(0.16, 0.034), M(T(x, 1.3, 0.0012)), { uvRect: R('jumpseat') });
    // the folding pan (hinge axis along local x at the wall, y = 0.47)
    const base = mul(frameM, T(x, 0.47, 0.055));
    out.push(ctx.parts.jumpPan.add(base, false));
  }
  return out;
}

/** Instanced jumpseat pan geometry: hinge at the origin, pan extends along +z (down position), cushion on +y. */
export function jumpPanGeometry() {
  const k = new Kit(() => 1), f = new Kit(() => 1);
  k.add('plastic', rbox(0.4, 0.035, 0.4, 0.015, 2).translate(0, -0.01, 0.2), null, { color: COL.shell });
  f.add('fabric', rbox(0.37, 0.05, 0.36, 0.02, 3).translate(0, 0.03, 0.2), null, { color: COL.cushion, uvScale: 6 });
  k.add('rubber', box(0.42, 0.04, 0.02).translate(0, -0.005, 0.395), null, { color: [0.12, 0.12, 0.12] });
  // lap belt halves lying on the cushion
  k.add('rubber', box(0.05, 0.004, 0.2).translate(-0.12, 0.057, 0.15), null, { color: COL.belt });
  k.add('rubber', box(0.05, 0.004, 0.2).translate(0.12, 0.057, 0.15), null, { color: COL.belt });
  return { shell: k, cushion: f };
}

/** Fire extinguisher in a quick-release bracket (frame: wall frame). */
export function extinguisher(kit, frameM, R) {
  const M = (m) => mul(frameM, m);
  kit.add('steel', box(0.14, 0.04, 0.03), M(T(0, 0.12, 0.015)), { color: [0.5, 0.5, 0.52] });
  kit.add('steel', box(0.14, 0.04, 0.03), M(T(0, 0.38, 0.015)), { color: [0.5, 0.5, 0.52] });
  const body = lathe([[0, 0], [0.058, 0], [0.062, 0.02], [0.062, 0.34], [0.05, 0.38], [0.022, 0.4], [0.02, 0.43]], 24);
  kit.add('gloss', body, M(T(0, 0.05, 0.075)), { color: [0.62, 0.03, 0.02] });
  kit.add('chrome', box(0.03, 0.05, 0.04), M(T(0, 0.5, 0.075)));
  kit.add('rubber', rbox(0.11, 0.018, 0.03, 0.006), M(T(0.03, 0.535, 0.075, 0, 0, -0.15)), { color: [0.1, 0.1, 0.1] });
  kit.add('rubber', tube([[0.02, 0.5, 0.075], [0.07, 0.46, 0.09], [0.07, 0.3, 0.13]], 0.007, 6, 12), M(new THREE.Matrix4()), { color: [0.06, 0.06, 0.06] });
  kit.add('placard', plane(0.09, 0.07), M(T(0, 0.24, 0.1375)), { uvRect: R('extLabel') });
  kit.add('placard', plane(0.13, 0.071), M(T(0, 0.66, 0.0012)), { uvRect: R('extinguisher') });
}
export function pbe(kit, frameM, R) {
  const M = (m) => mul(frameM, m);
  kit.add('plastic', rbox(0.22, 0.24, 0.12, 0.02, 2), M(T(0, 0.12, 0.06)), { color: [0.55, 0.56, 0.57] });
  kit.add('placard', plane(0.17, 0.093), M(T(0, 0.14, 0.1205)), { uvRect: R('pbe') });
  kit.add('rubber', box(0.18, 0.012, 0.012), M(T(0, 0.24, 0.124)), { color: [0.75, 0.05, 0.04] });
}
export function flashlight(kit, frameM, R) {
  const M = (m) => mul(frameM, m);
  kit.add('rubber', rbox(0.07, 0.24, 0.05, 0.01), M(T(0, 0.12, 0.025)), { color: [0.12, 0.12, 0.13] });
  kit.add('rubber', cyl(0.022, 0.026, 0.24, 16), M(T(0, 0.15, 0.06)), { color: [0.05, 0.05, 0.055] });
  kit.add('chrome', cyl(0.03, 0.026, 0.04, 16), M(T(0, 0.29, 0.06)));
  kit.add('placard', plane(0.09, 0.02), M(T(0, 0.33, 0.0012)), { uvRect: R('flashlight') });
}
export function megaphone(kit, frameM, R) {
  const M = (m) => mul(frameM, m);
  kit.add('steel', box(0.18, 0.03, 0.04), M(T(0, 0.02, 0.02)), { color: [0.5, 0.5, 0.52] });
  const horn = lathe([[0.03, 0], [0.045, 0.08], [0.11, 0.24], [0.115, 0.25]], 24);
  kit.add('gloss', horn, M(T(0, 0.14, 0.12, Math.PI / 2, 0, 0)), { color: [0.85, 0.85, 0.83] });
  kit.add('rubber', cyl(0.035, 0.035, 0.1, 16), M(T(0, 0.14, 0.08, Math.PI / 2, 0, 0)), { color: [0.1, 0.1, 0.1] });
  kit.add('rubber', rbox(0.03, 0.1, 0.04, 0.01), M(T(0, 0.08, 0.07)), { color: [0.1, 0.1, 0.1] });
  kit.add('placard', plane(0.09, 0.02), M(T(0, 0.3, 0.0012)), { uvRect: R('megaphone') });
}
export function firstAid(kit, frameM, R) {
  const M = (m) => mul(frameM, m);
  kit.add('plastic', rbox(0.3, 0.2, 0.12, 0.015, 2), M(T(0, 0.1, 0.06)), { color: [0.85, 0.85, 0.83] });
  kit.add('placard', plane(0.16, 0.0875), M(T(0, 0.1, 0.1205)), { uvRect: R('firstAid') });
}

/** Forward attendant panel: bezel + touchscreen + hard keys + handset. frameM: wall frame. Returns the screen mesh. */
export function fapPanel(ctx, kit, frameM) {
  const R = (n) => ctx.tex.rect(n);
  const M = (m) => mul(frameM, m);
  kit.add('rubber', rbox(0.2, 0.15, 0.03, 0.01, 2), M(T(0, 0, 0.015)), { color: [0.13, 0.135, 0.14] });
  kit.add('rubber', box(0.168, 0.106, 0.004), M(T(0, 0.012, 0.031)), { color: [0.02, 0.02, 0.02] });
  for (let i = 0; i < 5; i++) kit.add('rubber', rbox(0.024, 0.012, 0.008, 0.003), M(T(-0.064 + i * 0.032, -0.056, 0.032)), { color: [0.3, 0.31, 0.32] });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), ctx.M.screen);
  screen.name = 'galley-fap-screen';
  screen.matrixAutoUpdate = false;
  screen.matrix.copy(M(T(0, 0.012, 0.0335)));
  ctx.root.add(screen);
  // interphone handset beside the panel
  kit.add('rubber', rbox(0.065, 0.19, 0.03, 0.01), M(T(0.15, -0.02, 0.015)), { color: [0.13, 0.13, 0.14] });
  kit.add('rubber', new THREE.CapsuleGeometry(0.019, 0.13, 4, 10), M(T(0.15, -0.02, 0.044)), { color: [0.18, 0.18, 0.19] });
  kit.add('placard', plane(0.065, 0.015), M(T(0.15, 0.088, 0.0012)), { uvRect: R('interphone') });
  return screen;
}

/** Crew coat closet (forward right, in front of the business bulkhead). */
export function buildCloset(ctx, staticKit) {
  const { tex, parts } = ctx;
  const R = (n) => tex.rect(n);
  const zF = -13.3, zB = ZONES.businessFrontBulkheadZ - 0.035, x0 = 0.64;
  const k = new Kit((x, y, z) => 0.66 + 0.34 * smoothstep(0, 0.3, y));
  const kin = new Kit((x, y, z) => (0.55 + 0.45 * smoothstep(0, 0.4, y)) * (0.7 + 0.3 * smoothstep(0, 0.25, z - zF)));
  const dx0 = 0.68, dx1 = 1.16, dy0 = 0.03, dy1 = 1.76;
  // front panel outline with the door opening
  const outline = (r, notch = true) => {
    const pts = [[x0, 0]];
    if (notch) pts.push([dx0, 0], [dx0, dy1], [dx1, dy1], [dx1, 0]);
    for (let i = 0; i <= 14; i++) { const y = 2.07 * i / 14; pts.push([arcX(y, r), y]); }
    pts.push([0.672, 2.2], [x0, 2.2]);
    return ccw(pts);
  };
  k.add('plastic', worldUV(slab(outline(1.665), zF - 0.02, zF), 1.2), null, { color: COL.lam });
  // side panel (aisle side) + back panel (full height, behind it is the cabin's business bulkhead)
  k.add('plastic', worldUV(boxMM(x0, 0, zF, x0 + 0.025, 2.2, zB, [1, 8, 3]), 1.2), null, { color: COL.lam });
  kin.add('plastic', worldUV(slab(outline(1.665, false), zB - 0.015, zB), 1.2), null, { color: [0.75, 0.75, 0.74] });
  // interior: floor, ceiling, hat shelf, rail with coats, crew bag
  kin.add('plastic', boxMM(x0 + 0.025, 0, zF, 1.6, 0.01, zB), null, { color: [0.3, 0.3, 0.32] });
  kin.add('plastic', boxMM(x0 + 0.025, 1.95, zF, arcX(1.95), 1.97, zB), null, { color: [0.85, 0.85, 0.84] });
  kin.add('plastic', boxMM(x0 + 0.025, 1.62, zF, arcX(1.62) - 0.01, 1.64, zB), null, { color: [0.82, 0.82, 0.81] });
  const zr = (zF + zB) / 2;
  kin.add('chrome', cyl(0.012, 0.012, 1.25 - x0, 12), T((x0 + 1.25) / 2, 1.56, zr, 0, 0, Math.PI / 2));
  const coat = coatGeometry();
  const hanger = tube([[0, 0, -0.2], [0, 0.07, -0.02], [0, 0.07, 0.02], [0, 0, 0.2], [0, 0, -0.2]], 0.005, 6, 40);
  for (const [i, x] of [0.78, 0.9, 1.04].entries()) {
    kin.add('chrome', tube([[x, 1.56, zr], [x, 1.6, zr + 0.01], [x, 1.62, zr - 0.02], [x, 1.6, zr - 0.03]], 0.004, 6, 10));
    kin.add('chrome', hanger.clone(), T(x, 1.49, zr));
    kin.add('fabric', coat.clone(), T(x + 0.01 * i, 1.49, zr, 0, Math.PI / 2 + (i - 1) * 0.06, 0), { color: i === 1 ? [0.02, 0.03, 0.05] : COL.navy, uvScale: 8 });
    // gold sleeve stripes
    kin.add('rubber', box(0.13, 0.012, 0.02).translate(0, -0.62, 0), T(x + 0.01 * i, 1.49, zr + 0.21, 0, Math.PI / 2 + (i - 1) * 0.06, 0), { color: [0.75, 0.55, 0.15] });
  }
  hanger.dispose();
  // crew bag on the floor
  kin.add('fabric', rbox(0.36, 0.42, 0.22, 0.04, 3), T(1.15, 0.22, zr + 0.05, 0, 0.1, 0), { color: [0.06, 0.06, 0.07], uvScale: 6 });
  kin.add('chrome', box(0.2, 0.02, 0.03), T(1.15, 0.445, zr + 0.05, 0, 0.1, 0));
  // label on the door frame
  k.add('placard', plane(0.12, 0.026), T((dx0 + dx1) / 2, 1.85, zF - 0.0205, 0, Math.PI, 0), { uvRect: R('coats') });
  // magazine rack on the aisle-facing side panel
  const rx = x0 - 0.001;
  k.add('plastic', rbox(0.04, 0.42, 0.36, 0.01, 2), T(rx - 0.02, 1.0, (zF + zB) / 2), { color: [0.6, 0.61, 0.62] });
  for (const [i, n] of ['mag1', 'mag2', 'mag3'].entries()) {
    const z = (zF + zB) / 2 - 0.11 + i * 0.11;
    k.add('placard', plane(0.1, 0.133), T(rx - 0.03 + i * 0.002, 1.09, z, -0.12, -Math.PI / 2, 0), { uvRect: R(n) });
  }
  k.add('chrome', box(0.008, 0.012, 0.34), T(rx - 0.045, 0.98, (zF + zB) / 2));
  staticKit.merge(k).merge(kin);
  // door (instanced part with hinge on the aisle edge)
  const door = parts.closetDoor.add(T(dx0 + 0.003, dy0, zF - 0.012), false);
  return {
    door, dw: dx1 - dx0 - 0.006, dh: dy1 - dy0 - 0.006,
    lamp: { pos: new THREE.Vector3(0.95, 1.9, zr), min: new THREE.Vector3(x0 + 0.02, -0.05, zF + 0.0), max: new THREE.Vector3(1.7, 2.0, zB) },
    collider: [new THREE.Vector3(x0, 0, zF - 0.02), new THREE.Vector3(1.7, 2.2, zB)],
    proxy: { c: new THREE.Vector3((dx0 + dx1) / 2, 1.0, zF - 0.03), s: new THREE.Vector3(dx1 - dx0, 1.7, 0.04) },
    soundPos: new THREE.Vector3(0.9, 1.0, zF),
  };
}

/** Closet door geometry: hinge at local x = 0 (door extends along +x), outer face at -z. Built x-centred is not needed (not mirrored). */
export function closetDoorGeometry(tex, w = 0.474, h = 1.724) {
  const k = new Kit(() => 1);
  k.add('plastic', worldUV(rbox(w, h, 0.02, 0.006, 2).translate(w / 2, h / 2, 0), 1.2), null, { color: [0.83, 0.83, 0.82] });
  k.add('plastic', worldUV(box(w - 0.08, h - 0.2, 0.004).translate(w / 2, h / 2 + 0.03, -0.0115), 1.2), null, { color: [0.86, 0.86, 0.85] });
  k.add('chrome', rbox(0.025, 0.14, 0.03, 0.008).translate(w - 0.05, 1.0, -0.022));
  k.add('rubber', rbox(0.04, 0.04, 0.01, 0.006).translate(w - 0.05, 1.12, -0.013), null, { color: [0.12, 0.12, 0.13] });
  return k;
}

/** Simple coat silhouette (front view) extruded and bevelled. Origin at the hanger hook height. */
function coatGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.02);
  s.quadraticCurveTo(0.12, 0.0, 0.2, -0.04);           // shoulder
  s.quadraticCurveTo(0.235, -0.1, 0.24, -0.25);        // sleeve
  s.lineTo(0.245, -0.66); s.lineTo(0.185, -0.67);
  s.lineTo(0.18, -0.3); s.lineTo(0.175, -0.85);       // hem
  s.quadraticCurveTo(0, -0.88, -0.175, -0.85);
  s.lineTo(-0.18, -0.3); s.lineTo(-0.185, -0.67); s.lineTo(-0.245, -0.66);
  s.lineTo(-0.24, -0.25);
  s.quadraticCurveTo(-0.235, -0.1, -0.2, -0.04);
  s.quadraticCurveTo(-0.12, 0.0, 0, 0.02);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -0.03);
  g.computeVertexNormals();
  return g;
}

/** Curtain geometry: pleated sheet 1 m wide (x 0..1), hanging from y = 0 down to -h; gathered by scaling x. */
export function curtainGeometry(h = 2.0) {
  const nx = 48, ny = 12, pos = [], nor = [], uv = [], idx = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const x = i / nx, y = -h * j / ny;
    const ph = x * Math.PI * 2 * 9;
    const z = 0.035 * Math.sin(ph) * (1 - 0.15 * j / ny);
    pos.push(x, y, z);
    const dz = 0.035 * Math.PI * 2 * 9 * Math.cos(ph);
    const n = new THREE.Vector3(-dz, 0, 1).normalize();
    nor.push(n.x, n.y, n.z);
    uv.push(x * 6, y * 6);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array((nx + 1) * (ny + 1)).fill(0).flatMap((_, k) => { const j = Math.floor(k / (nx + 1)); const v = 0.8 + 0.2 * Math.sin((k % (nx + 1)) / nx * Math.PI * 18) ; const c = [0.05, 0.09, 0.16].map((q) => q * v * (0.85 + 0.15 * (1 - j / ny))); return c; }), 3));
  g.setIndex(idx);
  return g;
}
