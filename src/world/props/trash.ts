// Coral pedal bin with a chrome dome lid (hinged at the back) and a foot pedal.

import * as THREE from 'three';
import type { TrashProp } from './types';
import { PALETTE } from '../palette';
import { part, grp, rbox, lathe, fillet, cylB, lacquer, enamel, chrome, rubber, mergeStatic, dynamic, canvasTex } from './util';

function stickerTex(): THREE.Texture {
  return canvasTex(
    'binSticker',
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#fff7ea';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      // apple core
      ctx.fillStyle = '#f6edc4';
      ctx.beginPath();
      ctx.moveTo(w * 0.36, h * 0.3);
      ctx.quadraticCurveTo(w * 0.5, h * 0.5, w * 0.36, h * 0.72);
      ctx.lineTo(w * 0.64, h * 0.72);
      ctx.quadraticCurveTo(w * 0.5, h * 0.5, w * 0.64, h * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e8434f';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.28, w * 0.17, h * 0.07, 0, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.74, w * 0.17, h * 0.07, 0, 0, Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#8a5a3a';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.22);
      ctx.lineTo(w * 0.53, h * 0.12);
      ctx.stroke();
      ctx.fillStyle = '#3d2c2a';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.45, 3, 5, 0, 0, Math.PI * 2);
      ctx.ellipse(w * 0.5, h * 0.57, 3, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    },
    {},
  );
}

export function buildTrash(): TrashProp {
  const root = new THREE.Group();
  root.name = 'trash';
  const H = 0.47, R0 = 0.142, R1 = 0.156;
  const body = lacquer(PALETTE.coral, 0.4);
  // body shell (outside) + inside wall + floor
  part(root, lathe(fillet([[0, 0.028], [R0 - 0.01, 0.028, 0.01], [R0, 0.05, 0.02], [R1, H, 0.004], [R1 - 0.006, H + 0.004]], 6), 64), body);
  part(root, lathe(fillet([[R1 - 0.006, H + 0.004], [R1 - 0.01, H - 0.01, 0.004], [R0 - 0.01, 0.1, 0.02], [0, 0.1]], 5), 48), enamel('#6b6870', 0.7), { cast: false });
  // chrome base ring + top rim
  part(root, lathe(fillet([[0, 0], [R0 + 0.006, 0, 0.006], [R0 + 0.008, 0.034, 0.006], [R0 - 0.004, 0.036], [0, 0.036]], 4), 64), chrome());
  part(root, new THREE.TorusGeometry(R1 + 0.002, 0.008, 10, 72).rotateX(Math.PI / 2), chrome(), { pos: [0, H + 0.004, 0] });
  // sticker on the front
  const st = new THREE.CircleGeometry(0.05, 32);
  const sm = new THREE.MeshStandardMaterial({ map: stickerTex(), roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 });
  const sticker = part(root, st, sm, { cast: false });
  const sy = H * 0.58;
  const rAt = R0 + (R1 - R0) * ((sy - 0.05) / (H - 0.05));
  sticker.position.set(0, sy, rAt + 0.0015);
  sticker.rotation.x = -Math.atan((R1 - R0) / (H - 0.05));
  // lid: hinge at the back
  const hingeZ = -(R1 + 0.006);
  const lid = dynamic(grp(root, [0, H + 0.012, hingeZ], 'trashLid'));
  part(lid, lathe(fillet([[0, 0.07], [0.06, 0.064, 0.05], [R1 + 0.01, 0.008, 0.012], [R1 + 0.012, 0], [R1 - 0.01, -0.004], [0, -0.004]], 8), 64), chrome(), { pos: [0, 0, -hingeZ] });
  part(lid, rbox(0.12, 0.022, 0.03, 0.01, 2), chrome(), { pos: [0, 0.004, -0.004] });
  part(lid, cylB(0.012, 0.012, 0.14, 12).rotateZ(Math.PI / 2).translate(0.07, 0, 0), chrome(), { pos: [0, 0, -0.008] });
  // pedal (pivot at its back end, near the base)
  const pedal = dynamic(grp(root, [0, 0.03, R0 - 0.01], 'trashPedal'));
  part(pedal, rbox(0.12, 0.014, 0.1, 0.006, 2), chrome(), { pos: [0, 0, 0.05] });
  part(pedal, rbox(0.104, 0.006, 0.07, 0.004, 2), rubber('#3b3534'), { pos: [0, 0.009, 0.058] });
  mergeStatic(root);
  return { root, lid, openAngle: 1.2, openingY: H + 0.004, radius: R1 - 0.014, pedal };
}
