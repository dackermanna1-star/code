// The room shell of the dollhouse kitchen: wooden plinth + warm checker floor, cream wallpapered
// back wall with a rounded cottage window (sunny garden outside, drifting clouds, a round tree),
// gingham curtains, mint bead-board wainscot in the dining nook and partial cut-away side walls.

import * as THREE from 'three';
import { PALETTE } from '../palette';
import { BACK_WALL_Z, LEFT_WALL_X, RIGHT_WALL_X } from '../layout';
import {
  part, grp, rbox, rboxB, softExtrude, roundedRectShape, roundedRectPath, planarUV, mergeStatic,
  lacquer, enamel, chrome, matte, textured, canvasTex, Rand,
} from '../props/util';
import { floorTex, wallpaperTex, plankTex, woodTex, ginghamTex, cloudTex, treeTex } from '../props/textures';

export const WALL_TOP = 3.3;
/** Window opening on the back wall (behind Mochi's table). */
export const WINDOW = { x0: -2.9, x1: -1.7, y0: 1.08, y1: 2.18, r: 0.16 };
export const WAINSCOT_Y = 0.92;
/** The dining nook gets wainscot up to here (the counter run starts at COUNTER.x0). */
const NOOK_X1 = -1.25;
const FLOOR_FRONT_Z = 2.3;
const TILE = 0.38; // floor checker tile size (m)

export interface Room {
  root: THREE.Group;
  update(dt: number, time: number): void;
}

// ---------------------------------------------------------------------------------------------
// Outside view

function outsideTex(): THREE.Texture {
  return canvasTex(
    'outsideView',
    512,
    512,
    (c, w, h) => {
      // sky
      const g = c.createLinearGradient(0, 0, 0, h * 0.72);
      g.addColorStop(0, '#79c3ef');
      g.addColorStop(0.55, '#b8e3fb');
      g.addColorStop(1, '#f2f9f6');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // sun with a soft halo (upper right)
      const sx = w * 0.7, sy = h * 0.26;
      const sg = c.createRadialGradient(sx, sy, 0, sx, sy, w * 0.3);
      sg.addColorStop(0, 'rgba(255,250,225,0.95)');
      sg.addColorStop(0.18, 'rgba(255,244,200,0.55)');
      sg.addColorStop(1, 'rgba(255,244,200,0)');
      c.fillStyle = sg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fffbe8';
      c.beginPath();
      c.arc(sx, sy, w * 0.045, 0, Math.PI * 2);
      c.fill();
      const hill = (base: number, amp: number, freq: number, phase: number, top: string, bot: string) => {
        c.beginPath();
        c.moveTo(0, h);
        for (let x = 0; x <= w; x += 4) c.lineTo(x, base - Math.sin(x * freq + phase) * amp - Math.sin(x * freq * 2.3 + phase * 1.7) * amp * 0.35);
        c.lineTo(w, h);
        c.closePath();
        const gg = c.createLinearGradient(0, base - amp, 0, base + h * 0.2);
        gg.addColorStop(0, top);
        gg.addColorStop(1, bot);
        c.fillStyle = gg;
        c.fill();
      };
      // canvas y for a world height (plane spans y 0.35..2.95)
      const Y = (y: number) => ((2.95 - y) / 2.6) * h;
      const r = new Rand(21);
      // round bushes sitting on the far hill line (drawn first, half hidden by the hill)
      for (let i = 0; i < 12; i++) {
        c.fillStyle = r.next() < 0.5 ? '#93cc94' : '#a3d6a0';
        c.beginPath();
        c.arc(r.range(0, w), Y(1.42) + r.range(2, 8), r.range(9, 15), 0, Math.PI * 2);
        c.fill();
      }
      hill(Y(1.42), h * 0.03, 0.014, 0.4, '#b3deb4', '#a2d4a4');
      hill(Y(1.3), h * 0.035, 0.01, 2.1, '#9fd987', '#8ccd74');
      hill(Y(1.17), h * 0.025, 0.008, 4.3, '#86cc6d', '#76bf5e');
      // picket fence along the bottom of the view
      const fy = Y(1.1);
      c.fillStyle = '#fffaf0';
      for (let x = -6; x < w; x += 20) {
        c.beginPath();
        c.moveTo(x, fy);
        c.lineTo(x + 6, fy - 9);
        c.lineTo(x + 12, fy);
        c.lineTo(x + 12, h);
        c.lineTo(x, h);
        c.closePath();
        c.fill();
      }
      c.fillRect(0, fy + 10, w, 5);
      c.fillRect(0, fy + 26, w, 5);
      // flowers in front of the fence
      const cols = ['#ff8a74', '#ffd978', '#ffffff', '#f7a8c8'];
      for (let i = 0; i < 40; i++) {
        const x = r.range(0, w), y = fy + r.range(24, 56);
        c.fillStyle = '#5fae4e';
        c.beginPath();
        c.arc(x, y + 6, 5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = r.pick(cols);
        c.beginPath();
        c.arc(x, y, r.range(3, 5), 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#6cba58';
      c.fillRect(0, fy + 52, w, h);
    },
    {},
  );
}

function glassStreakTex(): THREE.Texture {
  return canvasTex(
    'windowStreaks',
    256,
    256,
    (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.save();
      c.translate(w / 2, h / 2);
      c.rotate(-0.6);
      for (const [x, wd, a] of [[-60, 46, 0.35], [10, 16, 0.28], [52, 8, 0.22]] as [number, number, number][]) {
        const g = c.createLinearGradient(x - wd / 2, 0, x + wd / 2, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, `rgba(255,255,255,${a})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.fillRect(x - wd / 2, -h, wd, h * 2);
      }
      c.restore();
    },
    {},
  );
}

// ---------------------------------------------------------------------------------------------
// Curtains

/** Gathered curtain panel (grid mesh). Origin = top inner corner; hangs down -Y, spans +X*side. */
function curtainGeo(width: number, height: number, side: 1 | -1, tieY: number): THREE.BufferGeometry {
  const nx = 18, ny = 20;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ny; j++) {
    const v = j / ny;
    const y = -v * height;
    // gathered towards the outer edge at the tie-back, flaring out below it
    const dy = Math.abs(y - tieY) / height;
    const pinch = 0.42 + 0.58 * Math.min(1, Math.pow(dy * 2.4, 1.3));
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const xw = (1 - (1 - u) * pinch) * width; // u=1 outer edge stays put
      const amp = 0.022 * (0.6 + 0.4 * pinch);
      const z = Math.sin(u * Math.PI * 7) * amp + 0.012 * (1 - u);
      pos.push(side * (width - xw), y, z);
      uv.push(u * 3, (1 - v) * 3.6);
    }
  }
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      if (side > 0) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Scalloped valance across the top of the window. */
function valanceGeo(width: number, height: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const n = 7;
  const sw = width / n;
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, -height + 0.04);
  for (let i = n - 1; i >= 0; i--) {
    const x0 = -width / 2 + i * sw;
    s.quadraticCurveTo(x0 + sw / 2, -height - 0.035, x0, -height + 0.04);
  }
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 10);
  // gentle pleats
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / width) * Math.PI * 14) * 0.008);
  g.computeVertexNormals();
  planarUV(g, 'xy', 3.2);
  return g;
}

// ---------------------------------------------------------------------------------------------

export function buildRoom(): Room {
  const root = new THREE.Group();
  root.name = 'room';
  const W0 = LEFT_WALL_X, W1 = RIGHT_WALL_X, BZ = BACK_WALL_Z;

  // --- floor: checker top on a rounded wooden plinth (dollhouse base)
  const fw = W1 - W0, fd = FLOOR_FRONT_Z - BZ;
  const fcx = (W0 + W1) / 2, fcz = (BZ + FLOOR_FRONT_Z) / 2;
  const ft = floorTex();
  const floorGeo = planarUV(new THREE.PlaneGeometry(fw, fd).rotateX(-Math.PI / 2).translate(fcx, 0, fcz), 'xz', 1 / (TILE * 2), [0.5, 0.25]);
  const floor = part(root, floorGeo, textured('roomFloor', ft, { roughness: 0.62, metalness: 0 }), { cast: false });
  floor.name = 'floor';
  const plinthWood = textured('plinthWood', woodTex('plinth', { w: 512, h: 128, rings: 5, base: '#e7c194', contrast: 0.8 }), { color: '#d9a46f', roughness: 0.55 });
  part(root, rboxB(fw + 0.16, 0.18, fd + 0.08, 0.05, 4), plinthWood, { pos: [fcx, -0.182, fcz + 0.02], cast: false });
  // a slim cream trim band where floor meets plinth (front)
  part(root, rbox(fw + 0.17, 0.022, 0.03, 0.011, 3), lacquer(PALETTE.cream, 0.4), { pos: [fcx, -0.012, FLOOR_FRONT_Z + 0.05], cast: false });

  // --- rug under the dining table
  const rugGeo = new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2);
  const rug = part(root, rugGeo, new THREE.MeshStandardMaterial({ map: rugTexOval(), roughness: 0.95, alphaTest: 0.5 }), { pos: [-2.16, 0.004, -0.06], scale: [0.86, 1, 0.72], cast: false });
  rug.name = 'rug';

  // --- back wall with the window hole
  const wallShape = new THREE.Shape();
  wallShape.moveTo(W0 - 0.06, 0);
  wallShape.lineTo(W1 + 0.06, 0);
  wallShape.lineTo(W1 + 0.06, WALL_TOP);
  wallShape.lineTo(W0 - 0.06, WALL_TOP);
  wallShape.closePath();
  const wcx = (WINDOW.x0 + WINDOW.x1) / 2, wcy = (WINDOW.y0 + WINDOW.y1) / 2;
  const ww = WINDOW.x1 - WINDOW.x0, wh = WINDOW.y1 - WINDOW.y0;
  wallShape.holes.push(roundedRectPath(ww, wh, WINDOW.r, wcx, wcy));
  const wp = wallpaperTex();
  const wallMat = textured('roomWallpaper', wp, { roughness: 0.92 });
  const wallGeo = planarUV(new THREE.ShapeGeometry(wallShape, 12), 'xy', 1 / 0.62);
  part(root, wallGeo, wallMat, { pos: [0, 0, BZ], cast: false });

  // --- window: chunky rounded frame, mullions, glass, sill
  const frameMat = lacquer('#fffaf1', 0.34);
  const win = grp(root, [wcx, wcy, BZ], 'window');
  const ring = roundedRectShape(ww + 0.13, wh + 0.13, WINDOW.r + 0.065);
  ring.holes.push(roundedRectPath(ww - 0.01, wh - 0.01, WINDOW.r - 0.005));
  part(win, softExtrude(ring, 0.07, 0.018, { curveSegs: 8, bevelSegs: 3 }), frameMat, { pos: [0, 0, -0.035] });
  // reveal (tunnel through the wall)
  const reveal = roundedRectShape(ww + 0.02, wh + 0.02, WINDOW.r + 0.01);
  reveal.holes.push(roundedRectPath(ww - 0.004, wh - 0.004, WINDOW.r - 0.002));
  part(win, softExtrude(reveal, 0.16, 0.002, { curveSegs: 8, bevelSegs: 1 }), enamel('#f6ead6', 0.8), { pos: [0, 0, -0.2], cast: false });
  // mullions (cross) set back in the opening
  const mz = -0.09;
  part(win, rbox(0.045, wh, 0.04, 0.012, 3), frameMat, { pos: [0, 0, mz] });
  part(win, rbox(ww, 0.045, 0.04, 0.012, 3), frameMat, { pos: [0, 0.06, mz] });
  // glass with soft reflection streaks
  const glassMat = new THREE.MeshBasicMaterial({ map: glassStreakTex(), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
  part(win, new THREE.ShapeGeometry(roundedRectShape(ww, wh, WINDOW.r), 10), glassMat, { pos: [0, 0, mz - 0.025], cast: false, receive: false, order: 2 });
  // sill
  part(win, rbox(ww + 0.26, 0.045, 0.17, 0.018, 4), frameMat, { pos: [0, -wh / 2 - 0.05, 0.05] });
  part(win, rbox(ww + 0.12, 0.05, 0.03, 0.012, 3), frameMat, { pos: [0, -wh / 2 - 0.095, 0.015] });

  // --- the garden outside
  const outside = grp(root, [wcx, 0, BZ], 'outside');
  part(outside, new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: outsideTex(), toneMapped: true }), { pos: [-0.05, 1.65, -0.95], cast: false, receive: false });
  const treeMat = new THREE.MeshBasicMaterial({ map: treeTex(), transparent: true, alphaTest: 0.4, toneMapped: true });
  part(outside, new THREE.PlaneGeometry(1.15, 1.15), treeMat, { pos: [-0.62, 1.38, -0.62], cast: false, receive: false });
  part(outside, new THREE.PlaneGeometry(0.7, 0.7), treeMat, { pos: [0.66, 1.18, -0.78], cast: false, receive: false });
  const clouds: { m: THREE.Mesh; speed: number; x0: number; span: number }[] = [];
  const cloudDefs: [number, number, number, number, number][] = [
    // seed, x, y, z, scale
    [1, -0.45, 2.0, -0.85, 0.6],
    [2, 0.35, 2.22, -0.88, 0.48],
    [3, 0.95, 1.86, -0.86, 0.42],
  ];
  for (const [seed, x, y, z, s] of cloudDefs) {
    const m = part(outside, new THREE.PlaneGeometry(1, 0.5), new THREE.MeshBasicMaterial({ map: cloudTex(seed), transparent: true, depthWrite: false, toneMapped: true }), { pos: [x, y, z], scale: s, cast: false, receive: false, order: 1 });
    clouds.push({ m, speed: 0.012 + seed * 0.004, x0: x, span: 2.2 });
  }

  // --- curtains: rod, two gathered gingham panels, a scalloped valance
  const gt = ginghamTex(PALETTE.coral, 'curtain');
  const curtainMat = new THREE.MeshStandardMaterial({ map: gt, roughness: 0.9, side: THREE.DoubleSide });
  const rodY = WINDOW.y1 + 0.12;
  const rodZ = BZ + 0.09;
  part(root, new THREE.CapsuleGeometry(0.012, ww + 0.62, 6, 14).rotateZ(Math.PI / 2), chrome(), { pos: [wcx, rodY, rodZ] });
  for (const s of [-1, 1]) {
    part(root, new THREE.SphereGeometry(0.03, 20, 14), lacquer(PALETTE.coral, 0.3), { pos: [wcx + s * (ww / 2 + 0.34), rodY, rodZ] });
    part(root, rbox(0.03, 0.05, 0.1, 0.012, 2), chrome(), { pos: [wcx + s * (ww / 2 + 0.2), rodY, rodZ - 0.045] });
  }
  const curtainH = rodY - 0.86;
  const panels: THREE.Group[] = [];
  for (const s of [-1, 1] as (1 | -1)[]) {
    const pivot = grp(root, [wcx + s * (ww / 2 + 0.3), rodY - 0.015, rodZ + 0.025], 'curtain');
    // origin = outer top corner; panel extends towards the window centre
    const g = curtainGeo(0.46, curtainH, s === -1 ? 1 : -1, -(rodY - 1.42));
    part(pivot, g, curtainMat, { cast: false });
    // tie-back band
    part(pivot, new THREE.TorusGeometry(0.1, 0.013, 8, 28).rotateX(Math.PI / 2).scale(1, 1, 0.42), lacquer(PALETTE.butter, 0.4), { pos: [s === -1 ? 0.1 : -0.1, -(rodY - 1.42), 0.014], cast: false });
    panels.push(pivot);
  }
  const val = grp(root, [wcx, rodY + 0.04, rodZ + 0.05], 'valance');
  part(val, valanceGeo(ww + 0.5, 0.2), curtainMat, { cast: false });
  part(val, rbox(ww + 0.52, 0.03, 0.02, 0.01, 2), lacquer(PALETTE.coral, 0.4), { pos: [0, -0.005, 0.004], cast: false });

  // --- wainscot (mint bead-board) + chair rail + skirting in the dining nook, on the back & left walls
  const bead = plankTex('beadboard', 8, '#e6f6ef');
  const beadMat = textured('beadboard', bead, { color: '#bfe7d9', roughness: 0.55 });
  const backW = NOOK_X1 - W0;
  part(root, planarUV(new THREE.PlaneGeometry(backW, WAINSCOT_Y).translate(W0 + backW / 2, WAINSCOT_Y / 2, 0), 'xy', 1 / 0.5), beadMat, { pos: [0, 0, BZ + 0.012], cast: false });
  const leftD = 1.35;
  part(root, planarUV(new THREE.PlaneGeometry(leftD, WAINSCOT_Y).rotateY(Math.PI / 2).translate(0, WAINSCOT_Y / 2, BZ + leftD / 2), 'zy', 1 / 0.5), beadMat, { pos: [W0 + 0.012, 0, 0], cast: false });
  const railMat = lacquer('#fff6e6', 0.4);
  part(root, rbox(backW + 0.02, 0.04, 0.035, 0.014, 3), railMat, { pos: [W0 + backW / 2, WAINSCOT_Y, BZ + 0.022] });
  part(root, rbox(0.035, 0.04, leftD, 0.014, 3), railMat, { pos: [W0 + 0.022, WAINSCOT_Y, BZ + leftD / 2] });
  part(root, rbox(backW + 0.02, 0.09, 0.025, 0.01, 3), railMat, { pos: [W0 + backW / 2, 0.045, BZ + 0.024], cast: false });
  part(root, rbox(0.025, 0.09, leftD, 0.01, 3), railMat, { pos: [W0 + 0.024, 0.045, BZ + leftD / 2], cast: false });

  // --- side walls (cut-away dollhouse edges)
  const sideMat = textured('roomWallpaperSide', wp, { roughness: 0.92 });
  const rightD = 1.1;
  part(root, planarUV(new THREE.PlaneGeometry(leftD, WALL_TOP).rotateY(Math.PI / 2).translate(W0, WALL_TOP / 2, BZ + leftD / 2), 'zy', 1 / 0.62), sideMat, { cast: false });
  part(root, planarUV(new THREE.PlaneGeometry(rightD, WALL_TOP).rotateY(-Math.PI / 2).translate(W1, WALL_TOP / 2, BZ + rightD / 2), 'zy', 1 / 0.62), sideMat, { cast: false });
  const capMat = plinthWood;
  part(root, rboxB(0.16, WALL_TOP + 0.02, 0.12, 0.045, 4), capMat, { pos: [W0 - 0.05, -0.01, BZ + leftD], cast: false });
  part(root, rboxB(0.16, WALL_TOP + 0.02, 0.12, 0.045, 4), capMat, { pos: [W1 + 0.05, -0.01, BZ + rightD], cast: false });
  // outer skins so the walls have thickness when seen from the front
  part(root, rboxB(0.1, WALL_TOP, leftD, 0.02, 2), matte('#efe2cc', 0.9), { pos: [W0 - 0.06, 0, BZ + leftD / 2], cast: false });
  part(root, rboxB(0.1, WALL_TOP, rightD, 0.02, 2), matte('#efe2cc', 0.9), { pos: [W1 + 0.06, 0, BZ + rightD / 2], cast: false });
  part(root, rbox(0.03, 0.09, rightD, 0.01, 3), railMat, { pos: [W1 - 0.016, 0.045, BZ + rightD / 2], cast: false });

  // merge static parts (keep animated groups)
  const keep: THREE.Object3D[] = [...panels, outside];
  mergeStatic(root, keep);

  return {
    root,
    update(dt: number, time: number) {
      for (const c of clouds) {
        c.m.position.x += c.speed * dt;
        if (c.m.position.x > c.x0 + c.span * 0.5) c.m.position.x -= c.span;
      }
      panels.forEach((p, i) => {
        const ph = i * 1.7;
        p.rotation.x = Math.sin(time * 0.9 + ph) * 0.018 + Math.sin(time * 2.3 + ph) * 0.006;
        p.rotation.z = Math.sin(time * 0.7 + ph) * 0.01;
      });
    },
  };
}

/** Oval braided rug (pastel rings) with a transparent outside. */
function rugTexOval(): THREE.Texture {
  const cols = [PALETTE.coral, PALETTE.cream, '#9fdccd', PALETTE.cream, PALETTE.butter, PALETTE.cream, '#f6b4a6', PALETTE.cream, '#9fdccd'];
  return canvasTex(
    'rugOval',
    512,
    512,
    (c, w, h) => {
      c.clearRect(0, 0, w, h);
      const n = cols.length;
      for (let i = 0; i < n; i++) {
        const r = (w / 2) * (1 - i / n);
        c.beginPath();
        c.arc(w / 2, h / 2, r - 1, 0, Math.PI * 2);
        c.fillStyle = cols[i];
        c.fill();
        // braid stitches on each ring
        c.save();
        c.strokeStyle = 'rgba(120,80,60,0.12)';
        c.lineWidth = 2;
        const rr = r - (w / 2 / n) * 0.5;
        const k = Math.max(12, Math.round(rr * 0.55));
        for (let j = 0; j < k; j++) {
          const a = (j / k) * Math.PI * 2 + i;
          c.beginPath();
          c.moveTo(w / 2 + Math.cos(a) * (rr - 6), h / 2 + Math.sin(a) * (rr - 6));
          c.lineTo(w / 2 + Math.cos(a + 0.05) * (rr + 6), h / 2 + Math.sin(a + 0.05) * (rr + 6));
          c.stroke();
        }
        c.restore();
      }
      // scalloped edge accent
      c.strokeStyle = 'rgba(236,106,87,0.5)';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(w / 2, h / 2, w / 2 - 10, 0, Math.PI * 2);
      c.setLineDash([10, 10]);
      c.stroke();
      c.setLineDash([]);
    },
    {},
  );
}
