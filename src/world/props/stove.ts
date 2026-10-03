// Retro coral gas range: cooktop flush with the counter, 4 burners with cast-iron grates and
// flame rings, chunky knobs, an oven with a drop-down door, chrome rack + tray, interior glow.

import * as THREE from 'three';
import type { BurnerParts, OvenParts, StoveProp } from './types';
import { PALETTE } from '../palette';
import {
  part, grp, rbox, rboxB, lathe, fillet, puck, cylB, tube, softExtrude, roundedRectShape, roundedRectPath, mergeGeo, xf,
  lacquer, enamel, chrome, steel, castIron, glowMat, lampMat, mergeStatic, dynamic, FONT_STACK, roundRectPath, textured, canvasTex,
} from './util';
import { speckleTex, hotRingTex } from './textures';

/** Height of the grate top above the cooktop: pans / pots rest at this local y. */
export const GRATE_TOP = 0.042;

export interface StoveOpts {
  width?: number;
  depth?: number;
  topY?: number;
  /** Burner centres in stove-local space (cooktop level). */
  burners: THREE.Vector3[];
}

const STOVE_COL = PALETTE.coral;

/** Flame ring: a crown of little gas flames (vertex coloured, additive). Origin at burner head. */
function buildFlameRing(radius: number): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'flame';
  const n = 18;
  const outer: THREE.BufferGeometry[] = [];
  const inner: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const len = 0.026 + (i % 3) * 0.003;
    // cone pointing +Y, base at y=0
    const c = new THREE.ConeGeometry(0.0075, len, 8, 1, true).translate(0, len / 2, 0);
    const tilt = 0.75;
    const geo = xf(c, [Math.cos(a) * radius, 0, Math.sin(a) * radius], [0, 0, 0]);
    // tilt outward: rotate around the tangent axis
    const m = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), -tilt);
    const t1 = new THREE.Matrix4().makeTranslation(-Math.cos(a) * radius, 0, -Math.sin(a) * radius);
    const t2 = new THREE.Matrix4().makeTranslation(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    geo.applyMatrix4(t1).applyMatrix4(m).applyMatrix4(t2);
    outer.push(geo);
    const ci = new THREE.ConeGeometry(0.0042, len * 0.55, 6, 1, true).translate(0, (len * 0.55) / 2, 0);
    const gi = xf(ci, [Math.cos(a) * radius, 0.001, Math.sin(a) * radius]);
    gi.applyMatrix4(t1).applyMatrix4(m).applyMatrix4(t2);
    inner.push(gi);
  }
  const paint = (geo: THREE.BufferGeometry, base: THREE.Color, tip: THREE.Color, h: number) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, Math.max(0, pos.getY(i) / h));
      const c = base.clone().lerp(tip, t);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  };
  const og = paint(mergeGeo(outer), new THREE.Color('#2f6dff'), new THREE.Color('#ff9a3c'), 0.02);
  const ig = paint(mergeGeo(inner), new THREE.Color('#9fd0ff'), new THREE.Color('#e9f6ff'), 0.012);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const o = new THREE.Mesh(og, mat);
  const i = new THREE.Mesh(ig, mat);
  for (const m of [o, i]) {
    m.castShadow = false;
    m.receiveShadow = false;
    m.renderOrder = 3;
    g.add(m);
  }
  return g;
}

/** Cast-iron grate: ring + 5 arms with legs. Top of the arms at y = GRATE_TOP (local). */
function grateGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const r = 0.0062;
  const top = GRATE_TOP - r;
  parts.push(new THREE.TorusGeometry(0.088, r * 0.95, 8, 48).rotateX(Math.PI / 2).translate(0, top - 0.004, 0));
  const arms = 5;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + Math.PI / 2;
    const c = Math.cos(a), s = Math.sin(a);
    parts.push(
      tube(
        [
          [c * 0.034, top, s * 0.034],
          [c * 0.1, top, s * 0.1],
          [c * 0.122, top - 0.006, s * 0.122],
          [c * 0.126, 0.004, s * 0.126],
        ],
        r,
        16,
        8,
        false,
        0.2,
      ),
    );
    parts.push(new THREE.SphereGeometry(r, 8, 6).translate(c * 0.034, top, s * 0.034));
    parts.push(new THREE.CylinderGeometry(r * 1.6, r * 1.9, 0.006, 10).translate(c * 0.126, 0.003, s * 0.126));
  }
  return mergeGeo(parts);
}

function controlPanelTexture(knobXs: number[], dialX: number, width: number): THREE.Texture {
  return canvasTex(
    'stovePanel',
    1024,
    160,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#fff8ec');
      g.addColorStop(1, '#f3e6d2');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const toPx = (x: number) => ((x + width / 2) / width) * w;
      const cy = h * 0.5;
      ctx.lineCap = 'round';
      // knob tick rings
      for (const kx of knobXs) {
        const cx = toPx(kx);
        ctx.strokeStyle = '#cdb9a2';
        ctx.lineWidth = 3;
        for (let k = 0; k <= 6; k++) {
          const a = -Math.PI / 2 + (k / 6) * Math.PI * 1.25;
          const r0 = 52, r1 = k === 0 ? 66 : 60;
          ctx.strokeStyle = k === 0 ? '#9a8a7a' : k > 4 ? '#ff8a74' : '#d7a78a';
          ctx.lineWidth = k === 0 ? 5 : 4;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
          ctx.stroke();
        }
        // little flame icon
        ctx.fillStyle = '#ff8a74';
        ctx.beginPath();
        const fx = cx + 62, fy = cy + 50;
        ctx.moveTo(fx, fy - 12);
        ctx.quadraticCurveTo(fx + 9, fy - 2, fx + 5, fy + 6);
        ctx.quadraticCurveTo(fx, fy + 10, fx - 5, fy + 6);
        ctx.quadraticCurveTo(fx - 9, fy - 2, fx, fy - 12);
        ctx.fill();
      }
      // oven dial scale
      const dx = toPx(dialX);
      for (let k = 0; k <= 12; k++) {
        const a = Math.PI * 0.75 + (k / 12) * Math.PI * 1.5;
        ctx.strokeStyle = k % 3 === 0 ? '#8a6f5a' : '#cdb9a2';
        ctx.lineWidth = k % 3 === 0 ? 5 : 3;
        ctx.beginPath();
        ctx.moveTo(dx + Math.cos(a) * 60, cy + Math.sin(a) * 60);
        ctx.lineTo(dx + Math.cos(a) * (k % 3 === 0 ? 74 : 68), cy + Math.sin(a) * (k % 3 === 0 ? 74 : 68));
        ctx.stroke();
      }
      // pointer above the dial
      ctx.fillStyle = '#ec6a57';
      ctx.beginPath();
      ctx.moveTo(dx - 9, 4);
      ctx.lineTo(dx + 9, 4);
      ctx.lineTo(dx, 18);
      ctx.fill();
      ctx.fillStyle = '#8a6f5a';
      ctx.font = `bold 30px ${FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('OVEN', dx - 118, cy + 2);
      // separator grooves
      ctx.strokeStyle = 'rgba(160,130,110,0.25)';
      ctx.lineWidth = 2;
      roundRectPath(ctx, 6, 6, w - 12, h - 12, 26);
      ctx.stroke();
    },
    { aniso: 8 },
  );
}

/** Burner knob (rotates around local Z). Rest = pointer straight up (off). */
function buildKnob(r = 0.03): THREE.Object3D {
  const k = new THREE.Group();
  k.name = 'knob';
  // chrome skirt
  part(k, lathe(fillet([[0, 0], [r * 1.08, 0], [r * 1.08, 0.006, 0.003], [r * 0.9, 0.009], [0, 0.009]], 3), 40).rotateX(Math.PI / 2), chrome());
  // cream body
  part(k, puck(r * 0.86, 0.026, 0.009, 40).rotateX(Math.PI / 2), lacquer(PALETTE.cream, 0.35), { pos: [0, 0, 0.004] });
  // grip fin
  part(k, rbox(0.014, r * 1.62, 0.018, 0.006, 3), lacquer(PALETTE.cream, 0.35), { pos: [0, 0, 0.034] });
  // pointer
  part(k, rbox(0.006, 0.016, 0.006, 0.0028, 2), enamel(PALETTE.coralDark, 0.4), { pos: [0, r * 0.62, 0.044] });
  return k;
}

/** Oven timer dial (rotates around local Z). */
function buildDial(r = 0.038): THREE.Object3D {
  const d = new THREE.Group();
  d.name = 'dial';
  part(d, lathe(fillet([[0, 0], [r * 1.12, 0], [r * 1.12, 0.008, 0.004], [r * 0.92, 0.012], [0, 0.012]], 3), 44).rotateX(Math.PI / 2), chrome());
  const face = canvasTex(
    'ovenDialFace',
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#fff6e6';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = PALETTE.coral;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 7, 8);
      ctx.lineTo(w / 2 + 7, 8);
      ctx.lineTo(w / 2 + 3, 46);
      ctx.lineTo(w / 2 - 3, 46);
      ctx.fill();
      ctx.strokeStyle = '#e9d6bd';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 40, 0, Math.PI * 2);
      ctx.stroke();
    },
    {},
  );
  // body with a printed face on the cap
  const cap = puck(r * 0.88, 0.024, 0.009, 44);
  // planar uv on the cap from xz
  const pos = cap.attributes.position as THREE.BufferAttribute;
  const uv = cap.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / (r * 1.9), 0.5 - pos.getZ(i) / (r * 1.9));
  // after rotateX(PI/2) local -z (cap top towards viewer) maps up; make "up" of texture = +y
  part(d, cap.rotateX(Math.PI / 2), textured('ovenDial', face, { roughness: 0.35 }), { pos: [0, 0, 0.004] });
  part(d, rbox(0.012, r * 1.5, 0.014, 0.005, 3), lacquer(PALETTE.cream, 0.35), { pos: [0, 0, 0.034] });
  return d;
}

export function buildStove(o: StoveOpts): StoveProp {
  const W = o.width ?? 0.8, D = o.depth ?? 0.62, TOP = o.topY ?? 0.92;
  const root = new THREE.Group();
  root.name = 'stove';
  const body = lacquer(STOVE_COL, 0.4);
  const cream = lacquer(PALETTE.cream, 0.35);
  const zF = D / 2 - 0.025; // front face of the body
  const zB = -D / 2;
  const hw = W / 2;

  // --- feet & toe kick
  for (const x of [-hw + 0.05, hw - 0.05]) for (const z of [zB + 0.06, zF - 0.05]) part(root, cylB(0.018, 0.024, 0.04, 16), chrome(), { pos: [x, 0, z] });
  part(root, rboxB(W - 0.06, 0.06, D - 0.12, 0.01, 2), enamel('#5c4744', 0.6), { pos: [0, 0.02, -0.03] });

  // --- body shell: side pillars, bottom band, control block, back
  const shellH = TOP - 0.045 - 0.065; // from 0.065 to under the cooktop
  const y0 = 0.065;
  for (const s of [-1, 1]) part(root, rboxB(0.05, shellH, D - 0.025, 0.02, 3), body, { pos: [s * (hw - 0.025), y0, (zF + zB) / 2] });
  part(root, rboxB(W - 0.02, 0.075, D - 0.025, 0.018, 3), body, { pos: [0, y0, (zF + zB) / 2] });
  const ctrlY0 = 0.75;
  part(root, rboxB(W - 0.02, TOP - 0.045 - ctrlY0, D - 0.025, 0.02, 3), body, { pos: [0, ctrlY0, (zF + zB) / 2] });
  // chrome trims on the front edges of the pillars
  for (const s of [-1, 1]) part(root, rboxB(0.008, shellH - 0.02, 0.008, 0.003, 2), chrome(), { pos: [s * (hw - 0.05), y0 + 0.01, zF + 0.002] });
  // bottom chrome strip
  part(root, rbox(W - 0.1, 0.012, 0.01, 0.004, 2), chrome(), { pos: [0, y0 + 0.04, zF + 0.002] });

  // control panel decal + chrome trim
  const knobXs = [-0.31, -0.2, 0.2, 0.31];
  const panelW = W - 0.08, panelH = TOP - 0.045 - ctrlY0 - 0.02;
  const panelTex = controlPanelTexture(knobXs, 0, panelW);
  part(root, rbox(panelW, panelH, 0.01, 0.012, 3), textured('stovePanel', panelTex, { roughness: 0.4 }), { pos: [0, ctrlY0 + 0.01 + panelH / 2, zF + 0.002] });
  const ctrlCY = ctrlY0 + 0.01 + panelH / 2;
  const panelFront = zF + 0.007;

  // --- cooktop
  part(root, rboxB(W, 0.045, D, 0.016, 3), enamel(PALETTE.cream, 0.28), { pos: [0, TOP - 0.045, 0] });
  part(root, rbox(W - 0.004, 0.01, 0.012, 0.004, 2), chrome(), { pos: [0, TOP - 0.022, D / 2 - 0.004] });
  // backguard
  const bgH = 0.13;
  part(root, rboxB(W, bgH, 0.013, 0.006, 3), enamel(PALETTE.cream, 0.3), { pos: [0, TOP - 0.01, zB + 0.0065] });
  part(root, rbox(W - 0.01, 0.014, 0.018, 0.007, 3), chrome(), { pos: [0, TOP + bgH - 0.012, zB + 0.009] });
  part(root, rbox(W - 0.06, 0.03, 0.004, 0.015, 3), enamel(STOVE_COL, 0.35), { pos: [0, TOP + bgH * 0.5, zB + 0.014] });

  // --- burners
  const ringTex = hotRingTex();
  const burners: BurnerParts[] = [];
  const grateGeo = grateGeometry();
  const dripGeo = lathe(fillet([[0.045, 0.004], [0.06, 0.0015, 0.01], [0.112, 0.003, 0.006], [0.118, 0.007], [0.121, 0.006], [0.121, 0]], 4), 48);
  const knobMap = [1, 2, 0, 3]; // knob slot index for burner i (front-left -> inner left, etc.)
  for (let i = 0; i < o.burners.length; i++) {
    const c = o.burners[i];
    const b = grp(root, [c.x, TOP, c.z], 'burner' + i);
    part(b, dripGeo, steel(), { cast: false });
    part(b, cylB(0.05, 0.054, 0.012, 32), enamel('#4a4442', 0.5), { pos: [0, 0.001, 0] });
    part(b, puck(0.041, 0.009, 0.004, 32), enamel('#2f2a29', 0.35), { pos: [0, 0.012, 0] });
    part(b, grateGeo, castIron());
    const flame = buildFlameRing(0.047);
    flame.position.set(c.x, TOP + 0.016, c.z);
    flame.scale.setScalar(0);
    root.add(dynamic(flame));
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.125, 40).rotateX(-Math.PI / 2), glowMat('#ff4a1c', { map: ringTex }));
    glow.position.set(c.x, TOP + 0.0075, c.z);
    glow.renderOrder = 2;
    glow.name = 'burnerGlow';
    root.add(dynamic(glow));
    const knob = buildKnob(0.031);
    knob.position.set(knobXs[knobMap[i]], ctrlCY, panelFront);
    root.add(dynamic(knob));
    burners.push({ center: new THREE.Vector3(c.x, TOP, c.z), flame, glow, knob });
  }

  // --- oven
  const ovenX = hw - 0.05; // half width of the opening
  const ovenY0 = y0 + 0.075, ovenY1 = ctrlY0;
  const cavZ0 = zB + 0.03, cavZ1 = zF;
  const cav = grp(root, [0, 0, 0], 'ovenCavity');
  const cavMat = textured('ovenEnamel', speckleTex('ovenEnamel', '#2c3240', '#8aa0c8', 1400, [0.5, 1.2]), { roughness: 0.45 });
  const cw = ovenX * 2, ch = ovenY1 - ovenY0, cd = cavZ1 - cavZ0;
  part(cav, new THREE.PlaneGeometry(cw, ch), cavMat, { pos: [0, (ovenY0 + ovenY1) / 2, cavZ0], cast: false });
  part(cav, new THREE.PlaneGeometry(cw, cd).rotateX(-Math.PI / 2), cavMat, { pos: [0, ovenY0 + 0.001, (cavZ0 + cavZ1) / 2], cast: false });
  part(cav, new THREE.PlaneGeometry(cw, cd).rotateX(Math.PI / 2), cavMat, { pos: [0, ovenY1 - 0.001, (cavZ0 + cavZ1) / 2], cast: false });
  part(cav, new THREE.PlaneGeometry(cd, ch).rotateY(Math.PI / 2), cavMat, { pos: [-ovenX, (ovenY0 + ovenY1) / 2, (cavZ0 + cavZ1) / 2], cast: false });
  part(cav, new THREE.PlaneGeometry(cd, ch).rotateY(-Math.PI / 2), cavMat, { pos: [ovenX, (ovenY0 + ovenY1) / 2, (cavZ0 + cavZ1) / 2], cast: false });
  // fan cover on the back wall + oven light
  const fanY = (ovenY0 + ovenY1) / 2 + 0.03;
  part(cav, lathe(fillet([[0, 0.006], [0.07, 0.006, 0.01], [0.085, 0], [0.09, 0]], 3), 40).rotateX(Math.PI / 2), steel(), { pos: [0, fanY, cavZ0], cast: false });
  for (let k = 1; k <= 3; k++) part(cav, new THREE.TorusGeometry(0.02 * k, 0.0022, 6, 40), steel(), { pos: [0, fanY, cavZ0 + 0.008], cast: false });
  part(cav, new THREE.SphereGeometry(0.02, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI), lacquer('#fff3d0', 0.2), { pos: [ovenX - 0.08, ovenY1 - 0.002, cavZ0 + 0.08], cast: false });
  // rack rails on side walls
  for (const s of [-1, 1])
    for (const yy of [0.33, 0.5]) part(cav, new THREE.CylinderGeometry(0.004, 0.004, cd - 0.04, 8).rotateX(Math.PI / 2), chrome(), { pos: [s * (ovenX - 0.008), yy - 0.008, (cavZ0 + cavZ1) / 2], cast: false });

  // rack + tray (gameplay slides it along +Z)
  const rackY = 0.33;
  const rack = dynamic(grp(root, [0, rackY, (cavZ0 + cavZ1) / 2 - 0.01], 'ovenRack'));
  const rw = cw - 0.03, rd = cd - 0.06;
  const wires: THREE.BufferGeometry[] = [];
  const rr = 0.0035;
  // frame
  wires.push(new THREE.CylinderGeometry(rr, rr, rw, 8).rotateZ(Math.PI / 2).translate(0, 0, rd / 2));
  wires.push(new THREE.CylinderGeometry(rr, rr, rw, 8).rotateZ(Math.PI / 2).translate(0, 0, -rd / 2));
  wires.push(new THREE.CylinderGeometry(rr, rr, rd, 8).rotateX(Math.PI / 2).translate(rw / 2, 0, 0));
  wires.push(new THREE.CylinderGeometry(rr, rr, rd, 8).rotateX(Math.PI / 2).translate(-rw / 2, 0, 0));
  for (let k = 1; k < 14; k++) wires.push(new THREE.CylinderGeometry(rr * 0.7, rr * 0.7, rd, 6).rotateX(Math.PI / 2).translate(-rw / 2 + (rw * k) / 14, 0.002, 0));
  part(rack, mergeGeo(wires), chrome());
  // baking tray
  const trayW = rw - 0.06, trayD = rd - 0.05, trayH = 0.02;
  const trayShape = roundedRectShape(trayW, trayD, 0.03);
  const tray = softExtrude(trayShape, trayH, 0.006, { curveSegs: 6 }).rotateX(-Math.PI / 2);
  const trayMat = enamel('#e9e4dc', 0.35);
  part(rack, tray, trayMat, { pos: [0, 0.006, 0] });
  // tray lip (rim) - a thin rounded frame
  const lipShape = roundedRectShape(trayW, trayD, 0.03);
  lipShape.holes.push(roundedRectPath(trayW - 0.024, trayD - 0.024, 0.02));
  part(rack, softExtrude(lipShape, 0.014, 0.004, { curveSegs: 6 }).rotateX(-Math.PI / 2), trayMat, { pos: [0, 0.006 + trayH - 0.002, 0] });
  const rackSurfaceY = 0.006 + trayH; // tray floor top (rack-local)

  // interior glow (BackSide box => lights up the cavity walls from inside)
  const glow = new THREE.Mesh(new THREE.BoxGeometry(cw - 0.01, ch - 0.01, cd - 0.01), glowMat('#ff8a2a', { side: THREE.BackSide }));
  glow.position.set(0, (ovenY0 + ovenY1) / 2, (cavZ0 + cavZ1) / 2);
  glow.name = 'ovenGlow';
  glow.renderOrder = 2;
  root.add(dynamic(glow));

  // door (pivot at the bottom front edge)
  const doorH = ovenY1 - ovenY0 - 0.012, doorW = W - 0.06;
  const door = dynamic(grp(root, [0, ovenY0 + 0.004, zF], 'ovenDoor'));
  const doorShape = roundedRectShape(doorW, doorH, 0.035, 0, doorH / 2);
  const winW = 0.44, winH = 0.22, winY = doorH * 0.52;
  doorShape.holes.push(roundedRectPath(winW, winH, 0.03, 0, winY));
  part(door, softExtrude(doorShape, 0.032, 0.009, { curveSegs: 8 }), body);
  // window trim + glass
  const trimShape = roundedRectShape(winW + 0.03, winH + 0.03, 0.04, 0, winY);
  trimShape.holes.push(roundedRectPath(winW, winH, 0.03, 0, winY));
  part(door, softExtrude(trimShape, 0.008, 0.003, { curveSegs: 8 }), chrome(), { pos: [0, 0, 0.03] });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#2a2230', roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.42, depthWrite: false, envMapIntensity: 1.5, side: THREE.DoubleSide });
  part(door, new THREE.ShapeGeometry(roundedRectShape(winW + 0.004, winH + 0.004, 0.03, 0, winY), 8), glassMat, { pos: [0, 0, 0.022], cast: false, order: 4 });
  // handle bar
  const hy = doorH - 0.055;
  part(door, cappedTubeX(doorW * 0.74, 0.011), chrome(), { pos: [0, hy, 0.085] });
  for (const s of [-1, 1]) part(door, cylB(0.008, 0.01, 0.055, 12).rotateX(Math.PI / 2), chrome(), { pos: [s * doorW * 0.33, hy, 0.03] });
  // little chrome hinge knuckles
  for (const s of [-1, 1]) part(door, cylB(0.008, 0.008, 0.05, 12).rotateZ(Math.PI / 2).translate(-0.025, 0, 0), chrome(), { pos: [s * (doorW / 2 - 0.06), 0.004, 0.006] });

  // timer dial + lamp
  const dial = dynamic(buildDial(0.04));
  dial.position.set(0, ctrlCY, panelFront);
  root.add(dial);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.011, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), lampMat('#8a3a30', '#ff3b22'));
  lamp.position.set(0.1, ctrlCY, panelFront);
  lamp.name = 'ovenLamp';
  lamp.castShadow = false;
  root.add(dynamic(lamp));
  part(root, new THREE.TorusGeometry(0.012, 0.003, 8, 24), chrome(), { pos: [0.1, ctrlCY, panelFront + 0.001] });

  const oven: OvenParts = {
    door,
    openAngle: 1.45,
    rackCenter: new THREE.Vector3(0, rackY + rackSurfaceY, rack.position.z),
    rackSize: [trayW - 0.04, trayD - 0.04],
    rack,
    glow,
    dial,
    lamp,
  };

  mergeStatic(root);
  return { root, burners, oven, cooktopY: TOP };
}

/** Chrome bar along X with rounded ends. */
function cappedTubeX(len: number, r: number): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(r, len - 2 * r, 6, 16).rotateZ(Math.PI / 2);
}

export { buildKnob };
