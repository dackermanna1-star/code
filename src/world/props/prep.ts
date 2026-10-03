// Prep station props: cutting board, tool caddy + hand tools, mixing bowl and whisk.
// Tools are built lying flat with the working end along +X; root origin = handle end, bottom y = 0.

import * as THREE from 'three';
import type { CuttingBoardProp, ToolProp, ToolCaddyProp, MixingBowlProp, WhiskProp } from './types';
import { PALETTE } from '../palette';
import {
  part, rbox, rboxB, lathe, fillet, puck, cylB, tube, softExtrude, roundedRectShape, mergeGeo, planarUV,
  lacquer, enamel, chrome, steel, textured, ceramic, mergeStatic, dynamic, canvasTex, FONT_STACK, roundRectPath, type P2, type V3,
} from './util';
import { woodTex } from './textures';

// ---------------------------------------------------------------------------------------------
// Cutting board

export function buildCuttingBoard(size: [number, number] = [0.5, 0.34]): CuttingBoardProp {
  const root = new THREE.Group();
  root.name = 'cuttingBoard';
  const [L, D] = size;
  const T = 0.026;
  const handleL = 0.075;
  // outline: rounded rect + paddle handle on the left (-X) with a hang hole
  const s = new THREE.Shape();
  const r = 0.035;
  const x0 = -L / 2, x1 = L / 2, y0 = -D / 2, y1 = D / 2;
  const hw = 0.055; // half width of handle
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - r);
  s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y1);
  s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, hw + 0.02);
  s.quadraticCurveTo(x0, hw, x0 - 0.02, hw);
  s.lineTo(x0 - handleL + hw, hw);
  s.absarc(x0 - handleL + hw, 0, hw, Math.PI / 2, (Math.PI * 3) / 2, false);
  s.lineTo(x0 - 0.02, -hw);
  s.quadraticCurveTo(x0, -hw, x0, -hw - 0.02);
  s.lineTo(x0, y0 + r);
  s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  const hole = new THREE.Path();
  hole.absarc(x0 - handleL + hw, 0, 0.018, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = softExtrude(s, T, 0.006, { curveSegs: 10, bevelSegs: 3 }).rotateX(-Math.PI / 2);
  // planar uv over the whole board (top view)
  const totalL = L + handleL;
  planarUV(g, 'xz', 1, [0, 0]);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - (x0 - handleL)) / totalL, (uv.getY(i) + D / 2) / D);
  const tex = canvasTex(
    'boardTop',
    512,
    256,
    (ctx, w, h) => {
      const src = woodTex('board', { w: 512, h: 256, rings: 5, base: '#f4dcb8', contrast: 0.8 }).image as HTMLCanvasElement;
      ctx.drawImage(src, 0, 0, w, h);
      // juice groove around the usable area
      const px = (x: number) => ((x - (x0 - handleL)) / totalL) * w;
      const gx0 = px(x0 + 0.022), gx1 = px(x1 - 0.022);
      const gy0 = h * (0.022 / D), gy1 = h * (1 - 0.022 / D);
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(150,100,60,0.35)';
      roundRectPath(ctx, gx0, gy0, gx1 - gx0, gy1 - gy0, 16);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,240,220,0.5)';
      roundRectPath(ctx, gx0 + 2, gy0 + 2, gx1 - gx0, gy1 - gy0, 16);
      ctx.stroke();
      // a few faint knife marks
      ctx.strokeStyle = 'rgba(140,95,60,0.12)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 26; i++) {
        const cx = px(x0 + 0.06) + Math.random() * (gx1 - gx0 - 60), cy = gy0 + 20 + Math.random() * (gy1 - gy0 - 40);
        const a = -0.4 + Math.random() * 0.8;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30);
        ctx.stroke();
      }
    },
    { aniso: 8 },
  );
  part(root, g, textured('boardTop', tex, { roughness: 0.55, color: '#f6e2c6' }));
  mergeStatic(root);
  return { root, surfaceY: T, size: [L - 0.03, D - 0.03] };
}

// ---------------------------------------------------------------------------------------------
// Tools

function grip(len: number, r: number, mat: THREE.Material): THREE.BufferGeometry {
  void mat;
  const prof: P2[] = fillet(
    [
      [0, 0],
      [r * 0.92, 0, r * 0.8],
      [r, len * 0.3],
      [r * 0.86, len * 0.75],
      [r * 0.95, len, r * 0.4],
      [0, len],
    ],
    5,
  );
  return lathe(prof, 24).rotateZ(-Math.PI / 2);
}

export function buildKnife(): ToolProp {
  const root = new THREE.Group();
  root.name = 'knife';
  const handleL = 0.115, bladeL = 0.195, bladeH = 0.052, t = 0.0035;
  const hr = 0.014;
  // handle (coral, slightly flattened) along +X from x=0, lying flat: axis at y = hr
  const hg = grip(handleL, hr, enamel(PALETTE.coral)).scale(1, 0.82, 1.15);
  const ax = hr * 0.82;
  part(root, hg, lacquer(PALETTE.coral, 0.38), { pos: [0, ax, 0] });
  for (const x of [0.03, 0.065, 0.095]) part(root, new THREE.CylinderGeometry(0.0042, 0.0042, hr * 1.7, 14), chrome(), { pos: [x, ax, 0] });
  // bolster
  part(root, puck(0.016, 0.012, 0.004, 20).rotateZ(-Math.PI / 2), chrome(), { pos: [handleL, ax, 0], scale: [1, 0.8, 1.1] });
  // blade: shape in x (length) / y (spine up), extruded thickness along z, then laid flat
  const bs = new THREE.Shape();
  bs.moveTo(0, -bladeH * 0.35);
  bs.lineTo(bladeL * 0.6, -bladeH * 0.38);
  bs.quadraticCurveTo(bladeL * 0.92, -bladeH * 0.3, bladeL, bladeH * 0.45);
  bs.quadraticCurveTo(bladeL * 0.7, bladeH * 0.62, bladeL * 0.3, bladeH * 0.62);
  bs.lineTo(0, bladeH * 0.62);
  bs.lineTo(0, -bladeH * 0.35);
  const blade = softExtrude(bs, t, 0.0012, { curveSegs: 12, bevelSegs: 2 });
  blade.translate(0, 0, -t / 2);
  // lay flat: shape y -> -z (spine to the back), thickness -> y
  blade.rotateX(-Math.PI / 2);
  part(root, blade, steel(), { pos: [handleL + 0.008, ax, 0] });
  // edge highlight strip
  part(root, rbox(bladeL * 0.55, t * 0.5, 0.004, 0.0012, 1), chrome(), { pos: [handleL + 0.008 + bladeL * 0.3, ax, bladeH * 0.36] });
  mergeStatic(root);
  const length = handleL + 0.008 + bladeL;
  return { root, grip: new THREE.Vector3(handleL * 0.5, ax, 0), tip: new THREE.Vector3(handleL + 0.008 + bladeL * 0.5, ax, bladeH * 0.37), length };
}

export function buildPeeler(): ToolProp {
  const root = new THREE.Group();
  root.name = 'peeler';
  const handleL = 0.11, hr = 0.014;
  const ax = hr;
  part(root, grip(handleL, hr, enamel(PALETTE.butter)), lacquer(PALETTE.butter, 0.38), { pos: [0, ax, 0] });
  part(root, new THREE.TorusGeometry(0.008, 0.0025, 8, 20), chrome(), { pos: [0.012, ax, 0], rot: [Math.PI / 2, 0, 0] });
  // Y frame (flat in XZ)
  const fy = ax;
  const frame: V3[][] = [
    [[handleL - 0.004, fy, 0], [handleL + 0.025, fy, 0.012], [handleL + 0.05, fy, 0.036], [handleL + 0.068, fy, 0.038]],
    [[handleL - 0.004, fy, 0], [handleL + 0.025, fy, -0.012], [handleL + 0.05, fy, -0.036], [handleL + 0.068, fy, -0.038]],
  ];
  part(root, mergeGeo(frame.map((p) => tube(p, 0.0032, 20, 8))), chrome());
  // blade across the arms (along z)
  part(root, rbox(0.012, 0.0025, 0.07, 0.001, 1), steel(), { pos: [handleL + 0.066, fy, 0] });
  part(root, rbox(0.003, 0.004, 0.064, 0.001, 1), chrome(), { pos: [handleL + 0.06, fy, 0] });
  for (const z of [-0.038, 0.038]) part(root, new THREE.SphereGeometry(0.0045, 10, 8), chrome(), { pos: [handleL + 0.068, fy, z] });
  mergeStatic(root);
  return { root, grip: new THREE.Vector3(handleL * 0.5, ax, 0), tip: new THREE.Vector3(handleL + 0.066, fy, 0), length: handleL + 0.075 };
}

export function buildRollingPin(): ToolProp {
  const root = new THREE.Group();
  root.name = 'rollingPin';
  const bodyL = 0.27, r = 0.033, hl = 0.058, hr = 0.0165;
  const L = bodyL + 2 * hl;
  const wood = textured('pinWood', woodTex('pin', { w: 256, h: 128, rings: 3, base: '#f5dcba', contrast: 0.6 }), { roughness: 0.5, color: '#efcc9f' });
  const body = lathe(fillet([[0, 0], [r * 0.8, 0], [r, 0.012, 0.01], [r, bodyL - 0.012, 0.01], [r * 0.8, bodyL], [0, bodyL]], 5), 32).rotateZ(-Math.PI / 2);
  part(root, body, wood, { pos: [hl, r, 0] });
  for (const s of [0, 1]) {
    const hg = lathe(
      fillet([[0, 0], [hr * 0.7, 0], [hr * 0.75, 0.01], [hr, hl * 0.55, 0.01], [hr * 1.05, hl - hr * 0.9, hr * 0.9], [0, hl]], 5),
      24,
    ).rotateZ(-Math.PI / 2);
    if (s === 0) {
      hg.rotateZ(Math.PI);
      part(root, hg, lacquer(PALETTE.coral, 0.38), { pos: [hl, r, 0] });
    } else part(root, hg, lacquer(PALETTE.coral, 0.38), { pos: [hl + bodyL, r, 0] });
  }
  mergeStatic(root);
  return { root, grip: new THREE.Vector3(hl * 0.5, r, 0), tip: new THREE.Vector3(L / 2, r, 0), length: L };
}

export function buildMasher(): ToolProp {
  const root = new THREE.Group();
  root.name = 'masher';
  const handleL = 0.125, hr = 0.016;
  const headR = 0.045;
  const ax = headR; // axis height so the head rests on the ground
  const wood = textured('masherWood', woodTex('masher', { w: 256, h: 128, rings: 3, base: '#f3d6b0', contrast: 0.6 }), { roughness: 0.5, color: '#e6bb88' });
  part(root, grip(handleL, hr, wood), wood, { pos: [0, ax, 0] });
  part(root, new THREE.TorusGeometry(0.009, 0.0028, 8, 20), chrome(), { pos: [0.013, ax, 0], rot: [Math.PI / 2, 0, 0] });
  // ferrule + shaft rods
  part(root, cylB(0.013, 0.015, 0.02, 20).rotateZ(-Math.PI / 2), chrome(), { pos: [handleL - 0.004, ax, 0] });
  const shaftEnd = handleL + 0.11;
  for (const s of [-1, 1])
    part(root, tube([[handleL + 0.014, ax, s * 0.005], [handleL + 0.06, ax, s * 0.012], [shaftEnd, ax, s * 0.03]], 0.0035, 16, 8), chrome());
  // zigzag wire head in the YZ plane at the end
  const pts: V3[] = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const z = -headR * 0.92 + (i / n) * headR * 1.84;
    const y = (i % 2 === 0 ? -1 : 1) * Math.sqrt(Math.max(0, headR * headR - z * z)) * 0.85;
    pts.push([shaftEnd + 0.004, ax + y, z]);
  }
  part(root, tube(pts, 0.0038, 64, 8, false, 0.15), chrome());
  // frame ring around the zigzag
  part(root, new THREE.TorusGeometry(headR, 0.0042, 8, 40), chrome(), { pos: [shaftEnd + 0.004, ax, 0], rot: [0, Math.PI / 2, 0] });
  mergeStatic(root);
  return { root, grip: new THREE.Vector3(handleL * 0.5, ax, 0), tip: new THREE.Vector3(shaftEnd + 0.004, ax, 0), length: shaftEnd + 0.01 };
}

export function buildWhisk(): WhiskProp {
  const root = new THREE.Group();
  root.name = 'whisk';
  const handleL = 0.12, hr = 0.0145;
  const headL = 0.17, headR = 0.05;
  const ax = headR;
  part(root, grip(handleL, hr, enamel(PALETTE.cabinet)), lacquer(PALETTE.cabinet, 0.36), { pos: [0, ax, 0] });
  part(root, new THREE.TorusGeometry(0.008, 0.0025, 8, 20), chrome(), { pos: [0.012, ax, 0], rot: [Math.PI / 2, 0, 0] });
  part(root, cylB(0.011, 0.0135, 0.022, 20).rotateZ(-Math.PI / 2), chrome(), { pos: [handleL - 0.004, ax, 0] });
  // balloon wires: loops in planes containing the X axis
  const loops = 5;
  const wires: THREE.BufferGeometry[] = [];
  const x0 = handleL + 0.016;
  for (let k = 0; k < loops; k++) {
    const a = (k / loops) * Math.PI;
    // explicit balloon outline: from the ferrule, out to the bulge, round the tip, back
    const outline: V3[] = [];
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const theta = t * Math.PI * 2; // full loop parameter
      // param: half loop on +side (0..PI) then -side (PI..2PI)
      const side = theta <= Math.PI ? 1 : -1;
      const s = theta <= Math.PI ? theta / Math.PI : (2 * Math.PI - theta) / Math.PI; // 0..1..0 along length
      const len = s; // 0 at ferrule, 1 at tip
      const rad = headR * Math.sin(Math.min(1, len * 1.05) * Math.PI * 0.55) * (len > 0.85 ? Math.cos(((len - 0.85) / 0.15) * Math.PI * 0.5) * 0.5 + 0.5 : 1);
      const x = x0 + len * headL;
      outline.push([x, Math.cos(a) * rad * side, Math.sin(a) * rad * side]);
    }
    wires.push(tube(outline, 0.0016, 80, 5, false, 0.5));
  }
  part(root, mergeGeo(wires), chrome(), { pos: [0, ax, 0] });
  mergeStatic(root);
  return { root, grip: new THREE.Vector3(handleL * 0.5, ax, 0), tip: new THREE.Vector3(x0 + headL * 0.6, ax, 0), length: x0 + headL };
}

// ---------------------------------------------------------------------------------------------
// Tool caddy

/** Euler that maps tool +X to `dir` and tool +Y to (approximately) `up`. */
export function toolRotation(dir: THREE.Vector3, up: THREE.Vector3): THREE.Euler {
  const x = dir.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, up).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return new THREE.Euler().setFromRotationMatrix(m);
}

export function buildToolCaddy(): ToolCaddyProp {
  const root = new THREE.Group();
  root.name = 'toolCaddy';
  const W = 0.2, D = 0.13, H = 0.105, T = 0.008;
  const body = lacquer(PALETTE.cream, 0.36);
  // shell: outer rounded box minus top (build as 4 walls + floor using an extruded ring)
  const ring = roundedRectShape(W, D, 0.03);
  const inner = new THREE.Path();
  const iw = W - 2 * T, idp = D - 2 * T, ir = 0.022;
  inner.moveTo(-iw / 2 + ir, -idp / 2);
  inner.absarc(-iw / 2 + ir, -idp / 2 + ir, ir, -Math.PI / 2, -Math.PI, true);
  inner.lineTo(-iw / 2, idp / 2 - ir);
  inner.absarc(-iw / 2 + ir, idp / 2 - ir, ir, Math.PI, Math.PI / 2, true);
  inner.lineTo(iw / 2 - ir, idp / 2);
  inner.absarc(iw / 2 - ir, idp / 2 - ir, ir, Math.PI / 2, 0, true);
  inner.lineTo(iw / 2, -idp / 2 + ir);
  inner.absarc(iw / 2 - ir, -idp / 2 + ir, ir, 0, -Math.PI / 2, true);
  ring.holes.push(inner);
  part(root, softExtrude(ring, H, 0.004, { curveSegs: 8 }).rotateX(-Math.PI / 2), body);
  part(root, softExtrude(roundedRectShape(W - 0.004, D - 0.004, 0.028), 0.012, 0.003).rotateX(-Math.PI / 2), body);
  // coral band + label
  const label = canvasTex(
    'caddyLabel',
    256,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = PALETTE.coral;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff7ea';
      ctx.font = `bold 40px ${FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TOOLS', w / 2, h / 2 + 2);
    },
    {},
  );
  part(root, rbox(W * 0.62, 0.03, 0.006, 0.006, 2), textured('caddyLabel', label, { roughness: 0.4 }), { pos: [0, H * 0.5, D / 2 + 0.001] });
  // chrome rim
  part(root, softExtrude(Object.assign(roundedRectShape(W + 0.006, D + 0.006, 0.032), { holes: [inner] }), 0.006, 0.0025).rotateX(-Math.PI / 2), chrome(), { pos: [0, H - 0.003, 0] });
  // dividers (cross)
  part(root, rboxB(0.006, H - 0.02, D - 2 * T, 0.002, 1), lacquer(PALETTE.coral, 0.4), { pos: [0, 0.012, 0] });
  part(root, rboxB(W - 2 * T, H - 0.02, 0.006, 0.002, 1), lacquer(PALETTE.coral, 0.4), { pos: [0, 0.012, 0] });
  mergeStatic(root);

  // slots: tools stand upright, fanned out a little. Positions/rotations of each tool root.
  const fan = (dx: number, dz: number) => new THREE.Vector3(dx, 1, dz).normalize();
  const slots: ToolCaddyProp['slots'] = {
    // knife: blade down in the back-left cell, handle up; root = handle end (top)
    knife: { pos: new THREE.Vector3(-0.048, 0.012 + 0.3, -0.03), rot: toolRotation(fan(0.06, 0.04).negate(), new THREE.Vector3(0, 0, 1)) },
    // peeler: head up, front-left cell
    peeler: { pos: new THREE.Vector3(-0.05, 0.014, 0.034), rot: toolRotation(fan(-0.2, 0.12), new THREE.Vector3(0, 0, 1)) },
    // rolling pin: back-right cell, leaning
    rollingPin: { pos: new THREE.Vector3(0.046, 0.014, -0.032), rot: toolRotation(fan(0.18, -0.08), new THREE.Vector3(0, 0, 1)) },
    // masher: front-right cell, head up
    masher: { pos: new THREE.Vector3(0.05, 0.014, 0.03), rot: toolRotation(fan(0.22, 0.14), new THREE.Vector3(0, 0, 1)) },
  };
  return { root, slots };
}

// ---------------------------------------------------------------------------------------------
// Mixing bowl

export function buildMixingBowl(): MixingBowlProp {
  const root = new THREE.Group();
  root.name = 'mixingBowl';
  const rimY = 0.13, rimR = 0.172, innerRim = 0.161, bottomY = 0.018;
  const outer: P2[] = fillet(
    [
      [0, 0.002],
      [0.075, 0.002],
      [0.082, 0, 0.003],
      [0.09, 0.012, 0.006],
      [0.13, 0.035, 0.05],
      [0.168, 0.1, 0.06],
      [rimR, rimY - 0.004, 0.006],
      [(rimR + innerRim) / 2, rimY + 0.002],
    ],
    7,
  );
  const inner: P2[] = fillet(
    [
      [(rimR + innerRim) / 2, rimY + 0.002],
      [innerRim, rimY - 0.006, 0.006],
      [0.15, 0.07, 0.07],
      [0.08, bottomY, 0.06],
      [0, bottomY],
    ],
    8,
  );
  // exterior: butter glaze with a white band
  const bandTex = canvasTex(
    'bowlGlaze',
    64,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = PALETTE.butter;
      ctx.fillRect(0, 0, w, h);
      // v=1 at top of canvas (rim). Profile v ~ arc length from the foot.
      ctx.fillStyle = '#fffaf0';
      ctx.fillRect(0, h * 0.1, w, h * 0.07);
      ctx.fillStyle = PALETTE.coral;
      ctx.fillRect(0, h * 0.19, w, h * 0.025);
      ctx.fillStyle = shadeFoot();
      ctx.fillRect(0, h * 0.94, w, h * 0.06);
    },
    {},
  );
  part(root, lathe(outer, 48), new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.24 }));
  part(root, lathe(inner, 48), ceramic('#fff9ee'));
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(innerRim, 56).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#f3dfae', roughness: 0.45, metalness: 0 }),
  );
  fill.position.y = bottomY + 0.03;
  fill.visible = false;
  fill.name = 'bowlFill';
  fill.receiveShadow = true;
  root.add(dynamic(fill));
  mergeStatic(root);
  return { root, innerRadius: innerRim - 0.006, bottomY, rimY, fill };
}

function shadeFoot() {
  return '#f2bf4f';
}

export { grip as toolGrip };
