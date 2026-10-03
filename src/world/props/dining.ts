// Dining nook props: plate, service bell, round diner table and a retro chair.

import * as THREE from 'three';
import type { PlateProp, BellProp } from './types';
import { PALETTE } from '../palette';
import {
  part, grp, rbox, rboxB, lathe, fillet, puck, cylB, tube, mergeGeo,
  lacquer, enamel, chrome, textured, canvasTex, mergeStatic, dynamic, type P2,
} from './util';
import { laminateTex, woodTex } from './textures';

export function buildPlate(): PlateProp {
  const root = new THREE.Group();
  root.name = 'plate';
  const R = 0.172;
  const prof: P2[] = fillet(
    [
      [0, 0.004],
      [0.085, 0.004],
      [0.09, 0, 0.002],
      [0.098, 0.0, 0.002],
      [0.11, 0.008, 0.01],
      [0.13, 0.016, 0.03],
      [R, 0.026, 0.006],
      [R - 0.004, 0.03, 0.003],
      [0.13, 0.022, 0.03],
      [0.112, 0.014, 0.02],
      [0.1, 0.0105, 0.02],
      [0, 0.0105],
    ],
    6,
  );
  // rim band texture along the profile (v = arc length from the underside centre)
  const tex = canvasTex(
    'plateGlaze',
    32,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#fffaf1';
      ctx.fillRect(0, 0, w, h);
      // locate the top rim band: profile arc length fractions (approx)
      ctx.fillStyle = PALETTE.coral;
      ctx.fillRect(0, h * 0.46, w, h * 0.035);
      ctx.fillStyle = PALETTE.cabinet;
      ctx.fillRect(0, h * 0.515, w, h * 0.012);
    },
    {},
  );
  part(root, lathe(prof, 72), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.2 }));
  mergeStatic(root);
  return { root, surfaceY: 0.0105, radius: 0.125 };
}

export function buildBell(): BellProp {
  const root = new THREE.Group();
  root.name = 'bell';
  const wood = textured('bellWood', woodTex('bell', { w: 256, h: 64, rings: 3, base: '#e2b07a', contrast: 0.6 }), { roughness: 0.45, color: '#c98e5a' });
  part(root, puck(0.062, 0.02, 0.007, 40), wood);
  part(root, lathe(fillet([[0, 0.02], [0.05, 0.02], [0.054, 0.024, 0.004], [0.05, 0.05, 0.03], [0.02, 0.07, 0.02], [0.008, 0.072], [0, 0.072]], 8), 48), chrome());
  const plunger = dynamic(grp(root, [0, 0.072, 0], 'bellPlunger'));
  part(plunger, cylB(0.0035, 0.0035, 0.018, 10), chrome());
  part(plunger, puck(0.011, 0.008, 0.004, 20), chrome(), { pos: [0, 0.016, 0] });
  mergeStatic(root);
  return { root, plunger };
}

/** Round diner table: laminate top with a chrome band on a pedestal. */
export function buildTable(radius = 0.46, topY = 0.74): THREE.Group {
  const root = new THREE.Group();
  root.name = 'table';
  const lam = laminateTex();
  const topMat = new THREE.MeshStandardMaterial({ map: lam, roughness: 0.3 });
  const t = 0.035;
  const top = new THREE.CylinderGeometry(radius - 0.004, radius - 0.004, t, 72);
  // planar uv for the top face
  const pos = top.attributes.position as THREE.BufferAttribute;
  const uv = top.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / (radius * 2.2), 0.5 + pos.getZ(i) / (radius * 2.2));
  part(root, top, topMat, { pos: [0, topY - t / 2, 0] });
  // chrome ribbed edge band
  part(root, lathe(fillet([[radius - 0.006, topY - t - 0.002], [radius + 0.004, topY - t, 0.004], [radius + 0.006, topY - t / 2, 0.006], [radius + 0.004, topY + 0.001, 0.003], [radius - 0.008, topY + 0.002]], 4), 80), chrome());
  part(root, new THREE.TorusGeometry(radius + 0.006, 0.0025, 6, 80).rotateX(Math.PI / 2), enamel(PALETTE.coral, 0.35), { pos: [0, topY - t / 2, 0] });
  // under-structure
  part(root, cylB(0.12, 0.12, 0.02, 32), enamel('#d9d3cb', 0.5), { pos: [0, topY - t - 0.02, 0] });
  // pedestal
  part(root, lathe(fillet([[0, 0], [0.3, 0, 0.004], [0.3, 0.012, 0.006], [0.2, 0.03, 0.06], [0.05, 0.06, 0.04], [0.04, 0.1], [0.04, topY - t - 0.03], [0.07, topY - t - 0.015, 0.01], [0.07, topY - t - 0.005], [0, topY - t - 0.005]], 6), 48), chrome());
  mergeStatic(root);
  return root;
}

/** Retro diner chair facing +Z, seat cushion top at seatY. */
export function buildChair(seatY = 0.5, cushion = PALETTE.cabinet): THREE.Group {
  const root = new THREE.Group();
  root.name = 'chair';
  const vinyl = lacquer(cushion, 0.5);
  const piping = enamel('#fff7ea', 0.4);
  const SW = 0.46, SD = 0.44;
  const legR = 0.013;
  // chrome tube frame: two side "sled" loops + back posts
  const frame: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const x = s * (SW / 2 - 0.04);
    frame.push(
      tube(
        [
          [x, seatY - 0.075, SD / 2 - 0.04],
          [x, 0.15, SD / 2 - 0.02],
          [x, 0.02, SD / 2 + 0.005],
          [x, 0.012, 0.0],
          [x, 0.02, -SD / 2 - 0.005],
          [x, 0.2, -SD / 2 + 0.01],
          [x, seatY - 0.075, -SD / 2 + 0.04],
        ],
        legR,
        60,
        10,
        false,
        0.4,
      ),
    );
    // back post
    frame.push(tube([[x * 0.9, seatY - 0.06, -SD / 2 + 0.03], [x * 0.88, seatY + 0.12, -SD / 2 - 0.02], [x * 0.84, seatY + 0.38, -SD / 2 - 0.05]], legR * 0.9, 20, 8));
  }
  frame.push(new THREE.CylinderGeometry(legR * 0.8, legR * 0.8, SW - 0.08, 10).rotateZ(Math.PI / 2).translate(0, seatY - 0.075, 0));
  part(root, mergeGeo(frame), chrome());
  // seat: cushion + piping + chrome skirt
  part(root, rboxB(SW, 0.035, SD, 0.016, 3), chrome(), { pos: [0, seatY - 0.09, 0] });
  part(root, rboxB(SW - 0.01, 0.075, SD - 0.01, 0.035, 5), vinyl, { pos: [0, seatY - 0.075, 0] });
  const pip = roundedLoop(SW - 0.02, SD - 0.02, 0.04, 0.0055, seatY - 0.012);
  part(root, pip, piping);
  // backrest: padded oval on the posts
  const back = grp(root, [0, seatY + 0.3, -SD / 2 - 0.045], undefined, [-0.12, 0, 0]);
  part(back, rbox(SW * 0.86, 0.22, 0.06, 0.05, 5), vinyl);
  part(back, rbox(SW * 0.86 + 0.014, 0.2, 0.03, 0.04, 3), chrome(), { pos: [0, 0, -0.022] });
  // tufting buttons
  for (const x of [-0.11, 0, 0.11]) part(back, new THREE.SphereGeometry(0.008, 10, 8), piping, { pos: [x, 0.005, 0.031] });
  mergeStatic(root);
  return root;
}

/** Rounded rectangular loop tube (for piping), lying in the XZ plane at height y. */
function roundedLoop(w: number, d: number, r: number, tubeR: number, y: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const corners: [number, number, number][] = [
    [w / 2 - r, d / 2 - r, 0],
    [-w / 2 + r, d / 2 - r, Math.PI / 2],
    [-w / 2 + r, -d / 2 + r, Math.PI],
    [w / 2 - r, -d / 2 + r, Math.PI * 1.5],
  ];
  for (const [cx, cz, a0] of corners) for (let i = 0; i <= 6; i++) {
    const a = a0 + (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  return new THREE.TubeGeometry(curve, 96, tubeR, 6, true);
}
