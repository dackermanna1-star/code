// Butter-yellow retro fridge: rounded top, chrome lever handle, magnets & a kid's drawing on the
// door, a lit interior with shelves, and a frosty freezer drawer at the bottom.

import * as THREE from 'three';
import type { FridgeProp } from './types';
import { PALETTE } from '../palette';
import {
  part, grp, rbox, rboxB, lathe, fillet, puck, cylB, softExtrude, roundedRectShape, roundedRectPath,
  lacquer, enamel, chrome, glass, glowMat, mergeStatic, dynamic, canvasTex, textured, FONT_STACK, roundRectPath,
} from './util';
import { drawingTex, speckleTex } from './textures';

/** Rounded rect shape with separate top / bottom corner radii (centred x, bottom at y=0). */
function doorShape(w: number, h: number, rTop: number, rBot: number): THREE.Shape {
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2;
  s.moveTo(x0 + rBot, 0);
  s.lineTo(x1 - rBot, 0);
  s.absarc(x1 - rBot, rBot, rBot, -Math.PI / 2, 0, false);
  s.lineTo(x1, h - rTop);
  s.absarc(x1 - rTop, h - rTop, rTop, 0, Math.PI / 2, false);
  s.lineTo(x0 + rTop, h);
  s.absarc(x0 + rTop, h - rTop, rTop, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, rBot);
  s.absarc(x0 + rBot, rBot, rBot, Math.PI, Math.PI * 1.5, false);
  return s;
}

function badgeTex(): THREE.Texture {
  return canvasTex(
    'fridgeBadge',
    256,
    80,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#cfd8df');
      g.addColorStop(1, '#f4f7f9');
      ctx.fillStyle = g;
      roundRectPath(ctx, 2, 2, w - 4, h - 4, 34);
      ctx.fill();
      ctx.fillStyle = PALETTE.coralDark;
      ctx.font = `italic bold 46px ${FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Munch', w / 2, h / 2 + 3);
    },
    {},
  );
}

/** Little fridge magnets: [colour, shape]. */
function magnet(parent: THREE.Object3D, kind: 'strawberry' | 'lemon' | 'star' | 'flower' | 'dot', pos: [number, number, number], rot = 0) {
  const g = grp(parent, pos, 'magnet', [0, 0, rot]);
  if (kind === 'dot') {
    part(g, puck(0.016, 0.01, 0.004, 20).rotateX(Math.PI / 2), lacquer(PALETTE.coral, 0.3));
    return;
  }
  if (kind === 'lemon') {
    part(g, puck(0.024, 0.01, 0.004, 28).rotateX(Math.PI / 2), lacquer('#fff3b0', 0.3));
    part(g, puck(0.02, 0.012, 0.004, 28).rotateX(Math.PI / 2), lacquer('#ffe14d', 0.3));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      part(g, rbox(0.002, 0.016, 0.002, 0.001, 1), enamel('#fff8d0'), { pos: [Math.cos(a) * 0.008, Math.sin(a) * 0.008, 0.012], rot: [0, 0, a + Math.PI / 2] });
    }
    return;
  }
  if (kind === 'star') {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 ? 0.011 : 0.026;
      i === 0 ? s.moveTo(Math.cos(a) * r, Math.sin(a) * r) : s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    part(g, softExtrude(s, 0.01, 0.003, { curveSegs: 2 }), lacquer(PALETTE.butterDark, 0.3));
    return;
  }
  if (kind === 'flower') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      part(g, puck(0.011, 0.008, 0.003, 16).rotateX(Math.PI / 2), lacquer('#ffffff', 0.3), { pos: [Math.cos(a) * 0.013, Math.sin(a) * 0.013, 0] });
    }
    part(g, puck(0.009, 0.011, 0.003, 16).rotateX(Math.PI / 2), lacquer(PALETTE.butterDark, 0.3));
    return;
  }
  // strawberry
  const s = new THREE.Shape();
  s.moveTo(0, -0.026);
  s.bezierCurveTo(0.03, -0.006, 0.024, 0.018, 0, 0.016);
  s.bezierCurveTo(-0.024, 0.018, -0.03, -0.006, 0, -0.026);
  part(g, softExtrude(s, 0.011, 0.004, { curveSegs: 10 }), lacquer('#e8434f', 0.3));
  const leaf = new THREE.Shape();
  leaf.moveTo(-0.014, 0.014);
  leaf.quadraticCurveTo(0, 0.03, 0.014, 0.014);
  leaf.quadraticCurveTo(0, 0.02, -0.014, 0.014);
  part(g, softExtrude(leaf, 0.006, 0.002, { curveSegs: 6 }), lacquer(PALETTE.leaf, 0.35), { pos: [0, 0, 0.006] });
}

export function buildFridge(w = 0.72, d = 0.66, h = 1.9): FridgeProp {
  const root = new THREE.Group();
  root.name = 'fridge';
  const body = lacquer(PALETTE.butter, 0.4);
  const liner = enamel('#f7f9fb', 0.35);
  const hw = w / 2, hd = d / 2;
  const wall = 0.035;
  const doorT = 0.07;
  const zFront = hd - doorT; // carcass front plane
  const plinthH = 0.06;
  const drawerY0 = plinthH + 0.012, drawerY1 = 0.565;
  const doorY0 = 0.585, doorY1 = h - 0.012;
  const rTop = 0.13;

  // plinth + chrome feet
  part(root, rboxB(w - 0.06, plinthH, d - 0.14, 0.01, 2), enamel('#5c4744', 0.6), { pos: [0, 0, -0.05] });
  for (const x of [-1, 1]) part(root, cylB(0.02, 0.026, 0.05, 16), chrome(), { pos: [x * (hw - 0.07), 0, zFront - 0.06] });

  // carcass: side walls, back, top (rounded), divider, bottom
  const carcH = h - plinthH;
  for (const s of [-1, 1]) part(root, rboxB(wall, carcH - rTop + 0.02, d - doorT, 0.012, 3), body, { pos: [s * (hw - wall / 2), plinthH, -doorT / 2] });
  // top: rounded profile extruded along z
  const topShape = doorShape(w, rTop + 0.04, rTop, 0.001);
  const top = softExtrude(topShape, d - doorT, 0.012, { curveSegs: 14 });
  top.translate(0, 0, -(d - doorT) / 2);
  part(root, top, body, { pos: [0, h - rTop - 0.04, -doorT / 2] });
  part(root, rboxB(w - 0.01, carcH, 0.03, 0.01, 2), body, { pos: [0, plinthH, -hd + 0.015] });
  // interior liner of the fridge compartment (visible when the door opens)
  const ix = hw - wall, iy0 = doorY0 + 0.02, iy1 = h - 0.07, iz0 = -hd + 0.03, iz1 = zFront;
  const iw = ix * 2, ih = iy1 - iy0, idp = iz1 - iz0;
  part(root, new THREE.PlaneGeometry(iw, ih), liner, { pos: [0, (iy0 + iy1) / 2, iz0 + 0.001], cast: false });
  part(root, new THREE.PlaneGeometry(idp, ih).rotateY(Math.PI / 2), liner, { pos: [-ix + 0.001, (iy0 + iy1) / 2, (iz0 + iz1) / 2], cast: false });
  part(root, new THREE.PlaneGeometry(idp, ih).rotateY(-Math.PI / 2), liner, { pos: [ix - 0.001, (iy0 + iy1) / 2, (iz0 + iz1) / 2], cast: false });
  part(root, new THREE.PlaneGeometry(iw, idp).rotateX(Math.PI / 2), liner, { pos: [0, iy1, (iz0 + iz1) / 2], cast: false });
  // divider slab between fridge & freezer (also the fridge floor)
  part(root, rboxB(w, iy0 - drawerY1, d - doorT, 0.008, 2), body, { pos: [0, drawerY1, -doorT / 2] });
  part(root, new THREE.PlaneGeometry(iw, idp).rotateX(-Math.PI / 2), liner, { pos: [0, iy0 + 0.001, (iz0 + iz1) / 2], cast: false });
  // glass shelves + a crisper
  const shelfMat = glass('#e6f6ff', 0.35);
  for (const y of [iy0 + ih * 0.36, iy0 + ih * 0.66]) {
    part(root, rbox(iw - 0.01, 0.008, idp - 0.03, 0.003, 1), shelfMat, { pos: [0, y, (iz0 + iz1) / 2 - 0.01], cast: false });
    part(root, rbox(iw - 0.01, 0.012, 0.012, 0.004, 2), chrome(), { pos: [0, y, iz1 - 0.02] });
  }
  part(root, rboxB(iw - 0.03, 0.14, idp - 0.06, 0.02, 3), glass('#dff2ea', 0.4), { pos: [0, iy0 + 0.004, (iz0 + iz1) / 2 - 0.02], cast: false });
  // a few things inside
  const milk = grp(root, [-0.17, iy0 + ih * 0.36 + 0.004, -0.05]);
  part(milk, lathe(fillet([[0, 0], [0.04, 0, 0.01], [0.042, 0.12, 0.03], [0.022, 0.17, 0.01], [0.02, 0.19], [0, 0.19]], 5), 28), enamel('#ffffff', 0.25));
  part(milk, puck(0.022, 0.02, 0.006, 20), enamel('#4aa3df', 0.35), { pos: [0, 0.185, 0] });
  part(milk, cylB(0.0425, 0.0425, 0.04, 28, true), enamel('#4aa3df', 0.4), { pos: [0, 0.06, 0] });
  const jam = grp(root, [0.08, iy0 + ih * 0.36 + 0.004, -0.08]);
  part(jam, cylB(0.04, 0.04, 0.08, 24), glass('#e3263a', 0.85));
  part(jam, puck(0.043, 0.02, 0.005, 24), lacquer('#ffffff', 0.4), { pos: [0, 0.08, 0] });
  const cake = grp(root, [0.12, iy0 + ih * 0.66 + 0.004, -0.05]);
  part(cake, lathe(fillet([[0, 0], [0.11, 0, 0.004], [0.11, 0.004], [0, 0.004]], 2), 32), enamel('#ffffff', 0.25));
  part(cake, cylB(0.075, 0.075, 0.07, 32, false), enamel('#f7c6d0', 0.5), { pos: [0, 0.004, 0] });
  part(cake, cylB(0.077, 0.077, 0.016, 32, false), enamel('#fff7ea', 0.4), { pos: [0, 0.066, 0] });
  part(cake, new THREE.SphereGeometry(0.015, 16, 12), enamel('#e8434f', 0.3), { pos: [0, 0.095, 0] });
  // interior light bulb cover
  part(root, rboxB(0.12, 0.025, 0.06, 0.012, 3), lacquer('#fffaf0', 0.3), { pos: [0, iy1 - 0.025, iz0 + 0.06], cast: false });

  // freezer cavity
  const fy0 = drawerY0 + 0.01, fy1 = drawerY1 - 0.005;
  const frost = textured('frost', speckleTex('frost', '#e3f3fb', '#ffffff', 700, [0.5, 1.6]), { roughness: 0.4 });
  part(root, new THREE.PlaneGeometry(iw, fy1 - fy0), frost, { pos: [0, (fy0 + fy1) / 2, iz0 + 0.001], cast: false });
  part(root, new THREE.PlaneGeometry(idp, fy1 - fy0).rotateY(Math.PI / 2), frost, { pos: [-ix + 0.001, (fy0 + fy1) / 2, (iz0 + iz1) / 2], cast: false });
  part(root, new THREE.PlaneGeometry(idp, fy1 - fy0).rotateY(-Math.PI / 2), frost, { pos: [ix - 0.001, (fy0 + fy1) / 2, (iz0 + iz1) / 2], cast: false });
  part(root, rboxB(w, drawerY0 - plinthH + 0.01, d - doorT, 0.008, 2), body, { pos: [0, plinthH - 0.005, -doorT / 2] });

  // interior light / cold mist (both compartments, opacity animated)
  const glowGeo = new THREE.BoxGeometry(iw - 0.01, ih - 0.01, idp - 0.01).translate(0, (iy0 + iy1) / 2, (iz0 + iz1) / 2);
  const interiorLight = new THREE.Mesh(glowGeo, glowMat('#cfeaff', { side: THREE.BackSide }));
  interiorLight.name = 'fridgeLight';
  interiorLight.renderOrder = 2;
  root.add(dynamic(interiorLight));

  // ---- main door (hinge on the right edge) ----
  const door = dynamic(grp(root, [hw, doorY0, zFront], 'fridgeDoor'));
  const dH = doorY1 - doorY0;
  const dShape = doorShape(w, dH, rTop - 0.005, 0.03);
  part(door, softExtrude(dShape, doorT, 0.018, { curveSegs: 14, bevelSegs: 4 }), body, { pos: [-hw, 0, 0] });
  // inner liner + door bins
  part(door, rbox(w - 0.08, dH - 0.16, 0.012, 0.03, 3), liner, { pos: [-hw, dH / 2 - 0.02, -0.004] });
  for (const y of [0.25, 0.62, 0.98]) {
    const bin = rboxB(w - 0.12, 0.07, 0.07, 0.012, 3);
    part(door, bin, glass('#e8f6ff', 0.5), { pos: [-hw, y, -0.045], cast: false });
    part(door, rbox(w - 0.12, 0.01, 0.012, 0.004, 2), chrome(), { pos: [-hw, y + 0.07, -0.08] });
  }
  // bottles in the door
  const bottleCols = ['#ffd978', '#ff8a74', '#8fd5c3', '#ffffff'];
  for (let i = 0; i < 4; i++) {
    const b = grp(door, [-hw - 0.2 + i * 0.13, 0.255, -0.045]);
    part(b, lathe(fillet([[0, 0], [0.026, 0, 0.006], [0.027, 0.12, 0.02], [0.012, 0.16], [0.011, 0.18], [0, 0.18]], 4), 18), glass(bottleCols[i], 0.75));
    part(b, cylB(0.012, 0.012, 0.016, 12), lacquer(PALETTE.coral, 0.4), { pos: [0, 0.178, 0] });
  }
  // lever handle (chrome) near the left edge
  const hx = -w + 0.06;
  part(door, new THREE.CapsuleGeometry(0.014, 0.34, 8, 16), chrome(), { pos: [hx, dH * 0.6, doorT + 0.05] });
  for (const y of [-0.15, 0.15]) part(door, rbox(0.026, 0.04, 0.06, 0.012, 3), chrome(), { pos: [hx, dH * 0.6 + y, doorT + 0.022] });
  // chrome hinge caps on the right
  for (const y of [0.0, dH]) part(door, cylB(0.016, 0.016, 0.03, 16), chrome(), { pos: [-0.03, y - 0.015, doorT * 0.5] });
  // badge
  part(door, rbox(0.17, 0.052, 0.008, 0.024, 3), textured('fridgeBadge', badgeTex(), { roughness: 0.3, metalness: 0.3 }), { pos: [-hw, dH - 0.17, doorT + 0.002] });
  // drawing + magnets
  const dz = doorT + 0.002;
  part(door, new THREE.PlaneGeometry(0.2, 0.156), new THREE.MeshStandardMaterial({ map: drawingTex(), roughness: 0.8 }), { pos: [-hw + 0.06, dH * 0.52, dz + 0.001], rot: [0, 0, -0.06], cast: false });
  magnet(door, 'dot', [-hw - 0.02, dH * 0.52 + 0.07, dz + 0.004]);
  magnet(door, 'star', [-hw + 0.145, dH * 0.52 + 0.062, dz + 0.002], 0.2);
  magnet(door, 'strawberry', [-hw - 0.17, dH * 0.75, dz + 0.002], -0.2);
  magnet(door, 'lemon', [-hw + 0.17, dH * 0.33, dz + 0.002]);
  magnet(door, 'flower', [-hw - 0.14, dH * 0.3, dz + 0.002]);
  // a little shopping list note
  const note = canvasTex(
    'fridgeNote',
    128,
    160,
    (ctx, cw, ch) => {
      ctx.fillStyle = '#fffbe6';
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = '#bfe6ff';
      ctx.lineWidth = 2;
      for (let y = 40; y < ch; y += 22) {
        ctx.beginPath();
        ctx.moveTo(8, y);
        ctx.lineTo(cw - 8, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#5a6a8a';
      ctx.font = `bold 20px ${FONT_STACK}`;
      ctx.fillText('to buy:', 10, 26);
      ctx.font = `16px ${FONT_STACK}`;
      ['eggs', 'milk', 'sprinkles!!', 'more cheese'].forEach((t, i) => ctx.fillText('• ' + t, 10, 55 + i * 22));
    },
    {},
  );
  part(door, new THREE.PlaneGeometry(0.09, 0.112), new THREE.MeshStandardMaterial({ map: note, roughness: 0.85 }), { pos: [-hw - 0.17, dH * 0.75 - 0.075, dz + 0.0008], rot: [0, 0, 0.08], cast: false });

  // ---- freezer drawer (slides along +Z) ----
  const drawer = dynamic(grp(root, [0, 0, 0], 'freezerDrawer'));
  const fH = drawerY1 - drawerY0;
  part(drawer, softExtrude(doorShape(w, fH, 0.03, 0.03), doorT, 0.016, { curveSegs: 8, bevelSegs: 4 }), body, { pos: [0, drawerY0, zFront] });
  // drawer handle (wide chrome bar on top edge)
  part(drawer, new THREE.CapsuleGeometry(0.012, 0.36, 8, 16).rotateZ(Math.PI / 2), chrome(), { pos: [0, drawerY1 - 0.07, zFront + doorT + 0.045] });
  for (const x of [-0.17, 0.17]) part(drawer, rbox(0.03, 0.024, 0.05, 0.01, 3), chrome(), { pos: [x, drawerY1 - 0.07, zFront + doorT + 0.02] });
  // little snowflake label
  const snow = canvasTex(
    'snowLabel',
    128,
    64,
    (ctx, cw, ch) => {
      ctx.fillStyle = '#ffffff';
      roundRectPath(ctx, 2, 2, cw - 4, ch - 4, 26);
      ctx.fill();
      ctx.strokeStyle = '#5fb0e8';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      const cx = 34, cy = ch / 2;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(a) * 18, cy - Math.sin(a) * 18);
        ctx.lineTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18);
        ctx.stroke();
      }
      ctx.fillStyle = '#5fb0e8';
      ctx.font = `bold 24px ${FONT_STACK}`;
      ctx.textBaseline = 'middle';
      ctx.fillText('ICE', 62, cy + 2);
    },
    {},
  );
  part(drawer, rbox(0.11, 0.055, 0.006, 0.026, 3), textured('snowLabel', snow, { roughness: 0.35 }), { pos: [0, drawerY0 + fH * 0.42, zFront + doorT + 0.002] });
  // bin (frosty, open top) extending back into the cavity
  const binW = iw - 0.03, binD = idp - 0.06, binH = fy1 - fy0 - 0.06;
  const binZ = zFront - binD / 2;
  const binRing = roundedRectShape(binW, binD, 0.03);
  binRing.holes.push(roundedRectPath(binW - 0.016, binD - 0.016, 0.022));
  const binMat = lacquer('#dcefff', 0.25);
  part(drawer, softExtrude(binRing, binH, 0.004, { curveSegs: 6 }).rotateX(-Math.PI / 2), binMat, { pos: [0, fy0 + 0.01, binZ] });
  const binFloorY = fy0 + 0.018;
  part(drawer, new THREE.ShapeGeometry(roundedRectShape(binW - 0.01, binD - 0.01, 0.024), 6).rotateX(-Math.PI / 2), frost, { pos: [0, binFloorY, binZ], cast: false });
  // ice cube tray in the back corner
  const tray = grp(drawer, [binW / 2 - 0.1, binFloorY, binZ - binD / 2 + 0.08]);
  part(tray, rboxB(0.16, 0.025, 0.1, 0.008, 2), lacquer('#9fd3f0', 0.3));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) part(tray, rbox(0.026, 0.024, 0.026, 0.007, 2), glass('#ffffff', 0.7), { pos: [-0.054 + i * 0.036, 0.034, -0.02 + j * 0.04], rot: [0.1 * i, 0.3 * j, 0.05] });

  mergeStatic(root);
  mergeStatic(door);
  mergeStatic(drawer);
  return {
    root,
    door,
    openAngle: 1.9,
    drawer,
    drawerTravel: 0.45,
    drawerFloorY: binFloorY + 0.002,
    drawerSize: [binW - 0.06, 0.3],
    interiorLight,
  };
}
