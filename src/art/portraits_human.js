// Shared human bust builder. A character module supplies a definition (palette, face profile, feature styles,
// hair / clothing / accessory layers and expressions); this file assembles them in a fixed layer order so
// every character follows identical proportions, outline weight and shading logic.
import { Rig, Face3D, PW, PH, lerp, clamp, material } from './portraits_core.js';
import { drawEye, drawBrow, drawNose, drawMouth, drawFreckles, drawBlush, drawTears, drawSweat, drawUnderEye } from './portraits_face.js';
import { rng } from './util.js';

const G = (x, s) => Math.exp(-(x * x) / (s * s));

/** Rasterise the face surface + bumps. Returns the face surface id. */
export function fillFace(rig, face, F, E) {
  const bb = [face.cx - 30, face.y0 - 1, face.cx + 32, face.y1 + 1];
  const corners = rig.ptsC([[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of corners) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const inside = (cx, cy) => { const [hx, hy] = rig.toH(cx, cy); return face.frontZ(hx, hy) !== null; };
  const zf = (cx, cy) => { const [hx, hy] = rig.toH(cx, cy); return face.frontZ(hx, hy) ?? 0; };
  const sid = rig.fillC([Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1)], inside, zf,
    { mat: F.skinMat || 'skin', rim: F.rim ?? 2.5, rimDepth: F.rimDepth ?? 3, edgeOpen: 0 });
  const N = F.nose, ey = F.eye.y, my = F.mouth.y, ue = F.eye.uc;
  const jaw = E.mouth.open > 0.3 && E.mouth.shape !== 'grimace' ? E.mouth.open : 0;
  rig.bump(sid, (hx, hy) => {
    const L = face.local(hx, hy); if (!L) return 0;
    const u = L.u;
    let dz = 0;
    // nose: ridge growing to the tip, steeper on the far side (3/4 view)
    if (hy > N.y - 13 && hy < N.y + 4) {
      const k = clamp((hy - (N.y - 12)) / 12, 0, 1);
      const e = (hy <= N.y ? lerp(0.8, N.e, k * k) : N.e * Math.max(0, 1 - (hy - N.y) / 2.6));
      const nx = face.proj(0, hy, e * 0.85)[0];
      const xs = hx - nx;
      const w = lerp(1.5, N.tipW || 2.4, k);
      dz += e * G(xs, xs < 0 ? w * 1.25 : w * 0.8);
      const ala = face.proj(0.12, N.y + 1.2, 1)[0], alaN = face.proj(-0.12, N.y + 1.2, 1)[0];
      dz += 1.5 * G(hx - ala, 1.4) * G(hy - (N.y + 1.2), 1.4) + 1.2 * G(hx - alaN, 1.4) * G(hy - (N.y + 1.2), 1.4);
    }
    // brow ridge, eye sockets, eyeballs, cheekbones
    dz += (F.browRidge ?? 1.0) * G(hy - (ey - 6), 2.6) * (Math.abs(u) < 0.85 ? 1 : 0.4);
    for (const sg of [-1, 1]) {
      dz -= (F.socket ?? 1.3) * G(u - sg * ue, 0.2) * G(hy - (ey - 1), 3.4);
      dz += 0.5 * G(u - sg * ue, 0.12) * G(hy - ey, 2.2);
      dz += (F.cheekbone ?? 0.45) * G(u - sg * 0.5, 0.22) * G(hy - (ey + 7 - (E.cheek || 0) - Math.max(0, E.mouth.smile) * 1.2), 3.6);
    }
    // mouth: lips, philtrum, corners
    const mo = my + (E.mouth.dy || 0);
    dz += 0.5 * G(u, 0.22) * G(hy - (mo - 1.3), 1.3);
    dz += (0.6 + (E.mouth.pout || 0)) * G(u, 0.2) * G(hy - (mo + 1.8 + jaw * 2.5), 1.4);
    dz -= 0.4 * G(u, 0.12) * G(hy - (N.y + 3), 1.3);
    
    // chin
    dz += (F.chin ?? 0.8) * G(u, 0.26) * G(hy - (face.y1 - 3.5 + jaw * 2), 2.4);
    return dz;
  });
  return sid;
}

/** Simple ear: C-shape with inner fold. side 'near' | 'far'. */
export function drawEar(rig, face, F, side, sids) {
  const near = side === 'near';
  const S = F.ear; if (!S) return null;
  const sg = near ? -1 : 1;
  const [a, , zc] = face.slice(S.y);
  // ear root sits on the side of the head (u = ±1), projected; the far ear pokes past the cheek contour
  const yaw = face.yaw;
  let ex, ez;
  if (near) {
    const xl = sg * (a - 0.5), zl = zc - S.back;
    ex = face.cx + xl * Math.cos(yaw) + zl * Math.sin(yaw);
    ez = -xl * Math.sin(yaw) + zl * Math.cos(yaw);
  } else {
    let sil = face.cx; for (let x = face.cx + 34; x > face.cx; x -= 0.25) if (face.frontZ(x, S.y) !== null) { sil = x; break; }
    ex = sil - 2.5; ez = 2;
  }
  const w = near ? S.w : (S.farPoke || 2.5) + 2.5, h = S.h;
  const out = near ? -1 : 1;
  const pts = [
    [ex, S.y - h * 0.5], [ex + out * w * 0.7, S.y - h * 0.55], [ex + out * w, S.y - h * 0.25],
    [ex + out * w * 0.9, S.y + h * 0.15], [ex + out * w * 0.55, S.y + h * 0.42], [ex + out * w * 0.2, S.y + h * 0.5], [ex - out * 0.5, S.y + h * 0.3],
  ];
  const sid = rig.poly(pts, { mat: F.skinMat || 'skin', smooth: true, rim: 1.6, rimDepth: 1.5, z: ez + 2 });
  sids.add(sid);
  if (!near) {
    rig.strokeH([[ex + 1.6, S.y - h * 0.3], [ex + 2.4, S.y + h * 0.1], [ex + 1.6, S.y + h * 0.3]], [F.skinMat || 'skin', -2], { requireMat: true });
  }
  if (near) {
    // inner fold (concha) shadow + helix rim
    rig.strokeH([[ex + out * w * 0.6, S.y - h * 0.3], [ex + out * w * 0.35, S.y - h * 0.05], [ex + out * w * 0.45, S.y + h * 0.25]], [F.skinMat || 'skin', -1], { requireMat: true });
    rig.dotH(ex + out * w * 0.25, S.y + h * 0.05, F.skinMat || 'skin', -2);
  }
  return sid;
}

/** Neck: tapered tube, head pose (rotates with tilt). */
export function drawNeck(rig, face, F, E) {
  const N = F.neck;
  const sh = (E.shoulder || 0);
  const pts = [
    [N.x - N.wTop, N.yTop], [N.x + N.wTop + N.lean, N.yTop],
    [N.x + N.wBot + N.lean * 1.4, N.yBot + 6], [N.x - N.wBot, N.yBot + 6],
  ];
  const cxn = N.x + N.lean * 0.6;
  return rig.poly(pts, {
    mat: F.skinMat || 'skin', rim: 4, rimDepth: 5,
    z: (cx, cy) => { const [hx] = rig.toH(cx, cy); const r = N.wBot + 2; const d = clamp((hx - cxn) / r, -1, 1); return N.z + 6 * Math.sqrt(1 - d * d) - sh * 0; },
  });
}

/** Expression-dependent material tweaks (pallor). */
export function paleRamp(ramp, k, target = '#c9c6c2') {
  if (k <= 0) return ramp;
  return ramp.map((c, i) => {
    const t = k * (i === 0 ? 0.25 : 0.55);
    const A = parseInt(c.slice(1), 16), B = parseInt(target.slice(1), 16);
    const ch = (s) => Math.round(((A >> s) & 255) + ((((B >> s) & 255) - ((A >> s) & 255)) * t));
    return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
  });
}

/**
 * Build a human portrait rig.
 * C: character definition; E: merged expression; o: { grime, enrolled, seed }.
 * Returns the populated Rig (call prepare + shade afterwards).
 */
export function buildHuman(C, E, o) {
  const mats = C.materials(E, o);
  const rig = new Rig(mats);
  const pitch = E.pitch || 0;
  const F = C.features(E, o); // feature styles (may depend on expression)
  // pitch: features slide down (chin down) / up; chin row follows
  const face = new Face3D({ cx: C.face.cx, yaw: C.face.yaw + (E.yaw || 0), rows: C.face.rows.map(([y, a, b, zc], k, arr) => [y + (k > arr.length - 4 ? pitch * 1.2 : 0), a, b, zc]), z0: C.face.z0 || 0 });
  const ctx = { rig, face, E, o, F, C, sids: { face: 0, ears: new Set(), hair: new Set() }, r: rng(C.seed || 7) };
  const sh = C.shift || [0, 0];
  const headPose = () => rig.pose(E.tilt || 0, (E.hx || 0) + sh[0], (E.hy || 0) + sh[1], C.pivot?.[0] ?? 48, C.pivot?.[1] ?? 96);
  const bodyPose = () => rig.pose(0, sh[0], sh[1]);

  headPose(); C.hairBack?.(ctx);
  bodyPose(); C.bodyBack?.(ctx);
  if (C.neckPose === 'body') bodyPose(); else headPose();
  ctx.sids.neck = drawNeck(rig, face, F, E); C.neckDetail?.(ctx);
  bodyPose(); C.bodyFront?.(ctx);
  headPose();
  C.behindHead?.(ctx);
  if (F.ear?.far) drawEar(rig, face, F, 'far', ctx.sids.ears);
  ctx.sids.face = fillFace(rig, face, F, E);
  if (F.ear?.near) drawEar(rig, face, F, 'near', ctx.sids.ears);
  C.afterFace?.(ctx);
  // ---- face details
  const on = [F.skinMat || 'skin', ...(F.detailOn || [])];
  const fy = pitch * 1.5;
  const eyeS = { ...F.eye, y: F.eye.y + fy, on };
  ctx.eyes = {
    near: drawEye(rig, face, 'near', eyeS, E.eye),
    far: drawEye(rig, face, 'far', eyeS, E.eye),
  };
  if (F.freckles) drawFreckles(rig, face, { ...F.freckles, y0: F.freckles.y0 + fy, y1: F.freckles.y1 + fy, on }, C.seed || 3);
  drawBlush(rig, face, { ...F.blush, y: F.blush.y + fy, on }, E.blush || 0);
  drawUnderEye(rig, ctx.eyes.near, { mat: F.underMat || 'bruise', on }, E.darkCircles || 0, 'near');
  drawUnderEye(rig, ctx.eyes.far, { mat: F.underMat || 'bruise', on }, E.darkCircles || 0, 'far');
  drawBrow(rig, face, 'near', { ...F.brow, y: F.brow.y + fy, on: [...on, ...(F.browOn || [])] }, E.brow);
  drawBrow(rig, face, 'far', { ...F.brow, y: F.brow.y + fy, on: [...on, ...(F.browOn || [])] }, E.brow);
  drawNose(rig, face, { ...F.nose, y: F.nose.y + fy, on }, E);
  ctx.mouth = drawMouth(rig, face, { ...F.mouth, y: F.mouth.y + fy * 1.1, on }, E.mouth, C.seed || 5);
  C.faceExtra?.(ctx);
  if (E.tears > 0) {
    drawTears(rig, ctx.eyes.near, { mat: 'tear', on }, E.tears, 'near');
    if (E.tears > 0.4) drawTears(rig, ctx.eyes.far, { mat: 'tear', on }, E.tears * 0.7, 'far');
  }
  // grime on skin
  if (o.grime > 0) C.grimeFace?.(ctx, o.grime);
  // ---- front hair & accessories
  C.hairFront?.(ctx);
  C.accessories?.(ctx);
  if (E.sweat > 0) {
    const sw = F.sweat || [[64, 38], [26, 46]];
    for (let k = 0; k < Math.min(sw.length, Math.ceil(E.sweat)); k++) drawSweat(rig, sw[k][0], sw[k][1], { mat: 'sweat', on: [F.skinMat || 'skin', ...(F.detailOn || [])] });
  }
  bodyPose(); C.foreground?.(ctx);
  if (o.grime > 0) C.grimeBody?.(ctx, o.grime);
  return rig;
}

// ---- standard shared materials -------------------------------------------------------------------------
export function stdMats(k = {}) {
  return [
    material('sclera', k.sclera || ['#3a3036', '#6e6266', '#a49a98', '#d2c9c0', '#e9e2d6', '#f7f2e8'], { tone: [0.18, 0.36, 0.6, 0.98], dither: 0, line: false, inner: false, flat: 0.5 }),
    material('pupil', ['#050508', '#0b0c10', '#14151b', '#1d1e26', '#2a2b35', '#3a3c48'], { line: false, inner: false, dither: 0 }),
    material('glint', ['#7d7c78', '#a7a6a0', '#cbc9c2', '#e6e3da', '#f5f2ea', '#ffffff'], { line: false, inner: false, dither: 0 }),
    material('mouth', ['#1a080a', '#2e0e10', '#46191a', '#5e2724', '#783630', '#8e463c'], { tone: [0.15, 0.4, 0.9, 1.4], line: false, inner: false, dither: 0, flat: 0.6 }),
    material('teeth', ['#4c4440', '#7c726a', '#ab9f93', '#d6cbbd', '#ebe4d8', '#f7f2ea'], { tone: [0.16, 0.34, 0.58, 0.98], line: false, inner: false, dither: 0, flat: 0.5 }),
    material('tongue', ['#360e10', '#5a1a1b', '#80302c', '#9c4239', '#b4584b', '#c8705f'], { line: false, inner: false, dither: 0, flat: 0.5 }),
    material('tear', ['#2c3a4c', '#56708c', '#8aa6c4', '#bccfe2', '#dde8f3', '#ffffff'], { line: false, inner: false, dither: 0, flat: 0.6 }),
    material('sweat', k.sweat || ['#6a4a48', '#a07a72', '#c8a49a', '#e0c6bc', '#f0e2da', '#ffffff'], { line: false, inner: false, dither: 0, flat: 0.6 }),
  ];
}
export { PW, PH };
