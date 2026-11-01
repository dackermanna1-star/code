import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HALF_D, HALF_W } from './arena';
import type { Arena } from './arena';
import type { BloodAtlas } from './bloodAtlas';
import { SPLAT } from './bloodAtlas';
import type { Dressing } from './dressing';
import { rainTexture } from './dressing';
import { addFire, canvas, makeNoise, MapKit, MapParts, normalFromHeight, tex } from './mapKit';
import { buildCity, buildStreet, skyTexture } from './city';
import { brickTex } from './alley';
import { paintQuad } from './arena';
import { radialTexture } from './textures';
import { RNG } from '../core/math';

const CEIL = 4.4;

// ============================================================================ textures
/** Wide oak planks, stained warm, with grain, knots and the odd darker board. 2.4 m tile. */
function oakTex(seed: number) {
  const S = 1024;
  const rng = new RNG(seed);
  const [c, x] = canvas(S, S);
  const [hc, hx] = canvas(S, S);
  hx.fillStyle = '#c0c0c0';
  hx.fillRect(0, 0, S, S);
  const pw = S / 13; // ~18.5 cm boards
  for (let i = 0; i < 13; i++) {
    let y = 0;
    while (y < S) {
      const len = S * (0.35 + rng.next() * 0.5);
      const tone = 0.85 + rng.next() * 0.3 - (rng.next() < 0.1 ? 0.25 : 0);
      const base = new THREE.Color().setHSL(0.07 + rng.next() * 0.015, 0.32 + rng.next() * 0.1, 0.24 * tone);
      x.fillStyle = '#' + base.getHexString();
      x.fillRect(i * pw, y, pw, len);
      // grain: long wavy lines along the board
      for (let k = 0; k < 16; k++) {
        x.strokeStyle = `rgba(${rng.next() < 0.5 ? '40,22,10' : '150,100,60'},${0.08 + rng.next() * 0.12})`;
        x.lineWidth = 0.8 + rng.next() * 1.4;
        x.beginPath();
        const gx = i * pw + rng.next() * pw;
        x.moveTo(gx, y);
        for (let t = 0; t <= len; t += 24) x.lineTo(gx + Math.sin((y + t) * 0.02 + k) * 2.5, y + t);
        x.stroke();
      }
      if (rng.next() < 0.3) {
        // a knot
        const kx = i * pw + pw * (0.3 + rng.next() * 0.4), ky = y + rng.next() * len;
        x.fillStyle = 'rgba(40,20,8,0.6)';
        x.beginPath();
        x.ellipse(kx, ky, 3 + rng.next() * 3, 6 + rng.next() * 6, 0, 0, Math.PI * 2);
        x.fill();
      }
      // the joints, recessed
      x.fillStyle = 'rgba(20,10,4,0.75)';
      x.fillRect(i * pw, y, pw, 2);
      x.fillRect(i * pw, y, 2, len);
      hx.fillStyle = '#404040';
      hx.fillRect(i * pw, y, pw, 2);
      hx.fillRect(i * pw, y, 2, len);
      y += len;
    }
  }
  return { map: tex(c), normal: normalFromHeight(hc, 2.5) };
}

/** Smooth painted plaster: a faint trowel texture. */
function plasterTex(seed: number, color: string) {
  const S = 256;
  const n = makeNoise(seed, 8);
  const [c, x] = canvas(S, S);
  x.fillStyle = color;
  x.fillRect(0, 0, S, S);
  const img = x.getImageData(0, 0, S, S);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const k = 0.93 + n((i / S) * 8, (j / S) * 8) * 0.1;
      const o = (j * S + i) * 4;
      img.data[o] *= k;
      img.data[o + 1] *= k;
      img.data[o + 2] *= k;
    }
  x.putImageData(img, 0, 0);
  return tex(c);
}

/** An abstract painting, the kind that costs a fortune: fields, a gesture, a signature. */
function paintingTex(rng: RNG) {
  const W = 256, H = 320;
  const [c, x] = canvas(W, H);
  const pals = [['#e8e0d0', '#c83a2a', '#1a1a1a', '#e8b030'], ['#1a2a4a', '#e8e0d0', '#d0602a', '#3a8aa0'], ['#f0ece4', '#2a2a2a', '#3a5ad0', '#e83a6a'], ['#2a1a1a', '#d8a040', '#8a2a1a', '#f0e8d8']];
  const p = rng.pick(pals);
  x.fillStyle = p[0];
  x.fillRect(0, 0, W, H);
  const style = rng.next();
  if (style < 0.35) {
    // colour fields
    for (let i = 0; i < 3; i++) {
      x.fillStyle = p[1 + i];
      x.globalAlpha = 0.85;
      x.fillRect(20, 20 + i * 95, W - 40, 80 + rng.next() * 10);
    }
  } else if (style < 0.7) {
    // circles and lines
    for (let i = 0; i < 6; i++) {
      x.fillStyle = p[1 + (i % 3)];
      x.globalAlpha = 0.8;
      x.beginPath();
      x.arc(rng.next() * W, rng.next() * H, 15 + rng.next() * 70, 0, Math.PI * 2);
      x.fill();
    }
    x.globalAlpha = 1;
    x.strokeStyle = p[3];
    x.lineWidth = 4;
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.moveTo(rng.next() * W, rng.next() * H);
      x.lineTo(rng.next() * W, rng.next() * H);
      x.stroke();
    }
  } else {
    // gesture: big brush strokes
    for (let i = 0; i < 9; i++) {
      x.strokeStyle = p[1 + (i % 3)];
      x.globalAlpha = 0.7;
      x.lineWidth = 8 + rng.next() * 26;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(rng.next() * W, rng.next() * H);
      x.bezierCurveTo(rng.next() * W, rng.next() * H, rng.next() * W, rng.next() * H, rng.next() * W, rng.next() * H);
      x.stroke();
    }
  }
  x.globalAlpha = 1;
  x.fillStyle = 'rgba(0,0,0,0.5)';
  x.font = "italic 600 12px 'Barlow Condensed', sans-serif";
  x.fillText('A. VOSS', W - 52, H - 12);
  return tex(c, true, false);
}

/** Book spines on a shelf, row after row. */
function booksTex(rng: RNG) {
  const W = 256, H = 512;
  const [c, x] = canvas(W, H);
  x.fillStyle = '#2a1a10';
  x.fillRect(0, 0, W, H);
  for (let row = 0; row < 5; row++) {
    const y0 = row * (H / 5);
    x.fillStyle = '#4a3020';
    x.fillRect(0, y0 + H / 5 - 8, W, 8);
    let bx = 4;
    while (bx < W - 8) {
      const bw = 6 + rng.next() * 12, bh = H / 5 - 18 - rng.next() * 30;
      x.fillStyle = rng.pick(['#7a1a1a', '#1a3a6a', '#2a5a2a', '#c8b080', '#3a3a3a', '#8a5a2a', '#5a2a5a', '#d0d0c0']);
      x.fillRect(bx, y0 + H / 5 - 8 - bh, bw, bh);
      x.fillStyle = 'rgba(255,230,160,0.35)';
      x.fillRect(bx + 1, y0 + H / 5 - 8 - bh + 6, bw - 2, 2);
      bx += bw + 1;
      if (rng.next() < 0.06) bx += 14;
    }
  }
  return tex(c, true, false);
}

/** Kitchen cabinet fronts: doors and drawers with handles. */
function cabinetTex() {
  const W = 256, H = 256;
  const [c, x] = canvas(W, H);
  x.fillStyle = '#e8e4dc';
  x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(0,0,0,0.35)';
  x.lineWidth = 3;
  x.strokeRect(4, 4, W / 2 - 6, H - 8);
  x.strokeRect(W / 2 + 2, 4, W / 2 - 6, H - 8);
  x.fillStyle = '#8a8e92';
  x.fillRect(W / 2 - 18, 30, 6, 60);
  x.fillRect(W / 2 + 12, 30, 6, 60);
  return tex(c);
}

// ============================================================================ build
/**
 * THE PENTHOUSE: a rich man's loft forty floors up, the city behind a wall of glass in the rain:
 * oak and brick, a fire burning, a grand piano, a kitchen island, art on the walls - and every
 * chair, lamp, vase, bottle, screen and glass table in it knocked flying or smashed.
 */
export function buildApartment(a: Arena, blood: BloodAtlas, pointLights: number, shadowMapSize: number): MapParts {
  const k = new MapKit(a, blood, pointLights, shadowMapSize);
  const g = k.g;
  const rng = new RNG(4040);
  const hi = blood.size >= 4096;
  const up = k.up;

  a.fog = { color: 0x0a0c14, density: 0.008 };
  const sky = skyTexture(23);
  a.background = sky;
  a.farPlane = 320;
  a.camBounds = { out: -0.35, maxY: CEIL - 0.55, walls: false };
  a.drains = [[-8.5, 0.5], [0.5, -1.5], [7.5, 6]];
  a.propSpots = { drums: [], crates: [] };

  // ---------------------------------------------------------------------- floor: oak, rugs, the kitchen's tiles
  const oak = oakTex(41);
  {
    const ppm = hi ? 64 : 44;
    const W = Math.round(HALF_W * 2 * ppm), H = Math.round(HALF_D * 2 * ppm);
    const [oc, ox] = canvas(W, H);
    const [rc, rx] = canvas(W, H);
    paintApartmentFloor(ox, rx, rng, W, H, ppm);
    const mat = new THREE.MeshStandardMaterial({ map: oak.map, normalMap: oak.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: tex(rc, false, false), roughness: 1, color: 0xa8968a, envMapIntensity: 0.55 });
    mat.roughnessMap!.channel = 1;
    oak.map.repeat.set(1, 1);
    blood.patchMaterial(mat, { overlay: tex(oc, true, false) });
    const floor = k.floor(mat, [2.4, 2.4], true);
    floor.geometry.setAttribute('uv1', (floor.geometry.attributes.ovUv as THREE.BufferAttribute).clone());
  }

  // ---------------------------------------------------------------------- walls
  const plaster = plasterTex(43, '#b0aaa0');
  const brick = brickTex(47, 'red');
  const ppmW = hi ? 70 : 48;
  const OVH = 3.0;
  type WallDef = { name: 'e' | 's' | 'w'; origin: THREE.Vector3; u: THREE.Vector3; len: number; map: THREE.Texture; normal?: THREE.Texture; color: number; tile: [number, number]; doors: { at: number; w: number; h: number }[]; paint: (x: CanvasRenderingContext2D, W: number, H: number, ppm: number) => void };
  const walls: WallDef[] = [
    {
      name: 'e', origin: new THREE.Vector3(HALF_W, 0, -HALF_D), u: new THREE.Vector3(0, 0, 1), len: HALF_D * 2, map: plaster, color: 0xffffff, tile: [3, 3],
      doors: [{ at: 18.5, w: 1.1, h: 2.3 }],
      paint: (x, W, H, ppm) => {
        baseboard(x, W, H, ppm);
        // the backsplash behind the counters: white tile, grey grout
        const u0 = 6 * ppm, u1 = 15.2 * ppm, v0 = H - 1.62 * ppm, v1 = H - 0.92 * ppm;
        x.fillStyle = '#ece8e0';
        x.fillRect(u0, v0, u1 - u0, v1 - v0);
        x.strokeStyle = 'rgba(120,115,105,0.7)';
        x.lineWidth = 1.5;
        const tw = 0.15 * ppm, th = 0.075 * ppm;
        for (let y = v0, r = 0; y < v1; y += th, r++) {
          x.beginPath();
          x.moveTo(u0, y);
          x.lineTo(u1, y);
          x.stroke();
          for (let xx = u0 + (r % 2 ? tw / 2 : 0); xx < u1; xx += tw) {
            x.beginPath();
            x.moveTo(xx, y);
            x.lineTo(xx, y + th);
            x.stroke();
          }
        }
      },
    },
    {
      name: 's', origin: new THREE.Vector3(HALF_W, 0, HALF_D), u: new THREE.Vector3(-1, 0, 0), len: HALF_W * 2, map: plaster, color: 0xffffff, tile: [3, 3],
      doors: [{ at: HALF_W - 4.5, w: 1.7, h: 2.5 }, { at: HALF_W + 4.5, w: 2.1, h: 2.7 }],
      paint: (x, W, H, ppm) => {
        baseboard(x, W, H, ppm);
        // wainscot panels below the chair rail
        x.strokeStyle = 'rgba(80,72,64,0.45)';
        x.lineWidth = 2;
        x.fillStyle = 'rgba(60,52,44,0.25)';
        x.fillRect(0, H - 0.95 * ppm, W, 3);
        for (let u = 0.2; u < 26 - 0.8; u += 1.1) x.strokeRect(u * ppm, H - 0.85 * ppm, 0.9 * ppm, 0.6 * ppm);
      },
    },
    {
      name: 'w', origin: new THREE.Vector3(-HALF_W, 0, HALF_D), u: new THREE.Vector3(0, 0, -1), len: HALF_D * 2, map: brick.map, normal: brick.normal, color: 0xd8c4b8, tile: [2, 2],
      doors: [{ at: 19.5, w: 1.1, h: 2.3 }],
      paint: () => {},
    },
  ];
  const plainBy: [THREE.MeshStandardMaterial, THREE.BufferGeometry[]][] = [];
  for (const w of walls) {
    const [ac, ax] = canvas(Math.round(w.len * ppmW), Math.round(OVH * ppmW));
    w.paint(ax, ac.width, ac.height, ppmW);
    ax.clearRect(0, 0, ac.width, 2);
    ax.clearRect(0, 0, 2, ac.height);
    ax.clearRect(ac.width - 2, 0, 2, ac.height);
    const mat = new THREE.MeshStandardMaterial({ map: w.map, normalMap: w.normal ?? null, roughness: w.normal ? 0.88 : 0.7, color: w.color });
    blood.patchMaterial(mat, { overlay: tex(ac, true, false) });
    const res = k.wall({ origin: w.origin, u: w.u, len: w.len, height: CEIL, paintH: OVH, tile: w.tile, doors: w.doors, ov: { h: OVH } });
    const m = new THREE.Mesh(mergeGeometries(res.paint, false)!, mat);
    m.receiveShadow = true;
    g.add(m);
    plainBy.push([new THREE.MeshStandardMaterial({ map: w.map, normalMap: w.normal ?? null, roughness: 0.75, color: w.color }), res.plain]);
  }
  for (const [mat, geos] of plainBy) {
    if (!geos.length) continue;
    const m = new THREE.Mesh(mergeGeometries(geos, false)!, mat);
    m.receiveShadow = true;
    g.add(m);
  }
  // the glass wall (north): clear, but it takes blood; mullions; rain running down it
  {
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x8aa0b8, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.1, depthWrite: false, envMapIntensity: 1.6 });
    blood.patchMaterial(glassMat, { glass: true });
    const o = new THREE.Vector3(-HALF_W, 0, -HALF_D), u = new THREE.Vector3(1, 0, 0);
    const geo = paintQuad(blood, o, u, up, HALF_W * 2, CEIL, [3, 3], 'wall', k.wallDensity, 8, 2);
    const glass = new THREE.Mesh(geo, glassMat);
    glass.renderOrder = 2;
    g.add(glass);
    const frame = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, metalness: 0.7, roughness: 0.35 });
    for (let i = 0; i <= 12; i++) k.box(0.08, CEIL, 0.12, frame, -HALF_W + (i / 12) * HALF_W * 2, CEIL / 2, -HALF_D - 0.02);
    k.box(HALF_W * 2, 0.08, 0.12, frame, 0, 2.7, -HALF_D - 0.02, 0, false);
    k.box(HALF_W * 2, 0.12, 0.18, frame, 0, 0.06, -HALF_D - 0.04, 0, false);
    const rt = rainTexture();
    const rainGeo = new THREE.PlaneGeometry(HALF_W * 2, CEIL);
    const ruv = rainGeo.attributes.uv.array as Float32Array;
    for (let i = 0; i < ruv.length; i += 2) {
      ruv[i] *= 10;
      ruv[i + 1] *= 2;
    }
    const rain = new THREE.Mesh(rainGeo, new THREE.MeshBasicMaterial({ map: rt, transparent: true, depthWrite: false, opacity: 0.35, blending: THREE.AdditiveBlending, fog: false }));
    rain.position.set(0, CEIL / 2, -HALF_D - 0.05);
    g.add(rain);
    windowRain = rt;
  }
  // doors: the front door, the private elevator, the service door, the bedroom wing
  const darkBox = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1, side: THREE.BackSide });
  const doorway = (mid: THREE.Vector3, inward: THREE.Vector3, w: number, h: number, lit = false) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, h + 0.1, 3), lit ? new THREE.MeshStandardMaterial({ color: 0xb8b0a0, metalness: 0.6, roughness: 0.3, side: THREE.BackSide }) : darkBox);
    b.position.copy(mid).addScaledVector(inward, -1.5).setY(h / 2);
    b.rotation.y = Math.atan2(inward.x, inward.z);
    g.add(b);
    const trim = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.5 });
    const side = new THREE.Vector3(-inward.z, 0, inward.x);
    for (const s of [-1, 1]) {
      const post = k.box(0.1, h + 0.1, 0.1, trim, 0, (h + 0.1) / 2, 0);
      post.position.copy(mid).addScaledVector(side, (s * (w + 0.1)) / 2).addScaledVector(inward, 0.04).setY((h + 0.1) / 2);
    }
    const lintel = k.box(w + 0.3, 0.1, 0.1, trim, 0, 0, 0);
    lintel.position.copy(mid).addScaledVector(inward, 0.04).setY(h + 0.05);
    lintel.rotation.y = Math.atan2(-side.z, side.x);
  };
  doorway(new THREE.Vector3(-4.5, 0, HALF_D), new THREE.Vector3(0, 0, -1), 2.1, 2.7);
  doorway(new THREE.Vector3(4.5, 0, HALF_D), new THREE.Vector3(0, 0, -1), 1.7, 2.5, true);
  doorway(new THREE.Vector3(HALF_W, 0, 7.5), new THREE.Vector3(-1, 0, 0), 1.1, 2.3);
  doorway(new THREE.Vector3(-HALF_W, 0, -8.5), new THREE.Vector3(1, 0, 0), 1.1, 2.3);
  k.door(new THREE.Vector3(-4.5, 0, HALF_D), new THREE.Vector3(0, 0, -1), 2.1, 2.4);
  k.door(new THREE.Vector3(4.5, 0, HALF_D), new THREE.Vector3(0, 0, -1), 1.7, 2.4);
  k.door(new THREE.Vector3(HALF_W, 0, 7.5), new THREE.Vector3(-1, 0, 0), 1.1, 2.4);
  k.door(new THREE.Vector3(-HALF_W, 0, -8.5), new THREE.Vector3(1, 0, 0), 1.1, 2.4);
  k.roomWalls(CEIL, [
    { side: 's', at: -4.5, w: 2.1 },
    { side: 's', at: 4.5, w: 1.7 },
    { side: 'e', at: 7.5, w: 1.1 },
    { side: 'w', at: -8.5, w: 1.1 },
  ]);
  k.light({ p: new THREE.Vector3(4.5, 2.3, HALF_D + 1.2), color: 0xfff0e0, intensity: 14, distance: 6, priority: 3 });

  // ---------------------------------------------------------------------- ceiling: walnut, beams, downlights
  {
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, HALF_D * 2), new THREE.MeshStandardMaterial({ color: 0x2a1e16, roughness: 0.8 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = CEIL;
    g.add(ceil);
    const beam = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.7 });
    for (const z of [-5.5, 0, 5.5]) k.box(HALF_W * 2, 0.32, 0.3, beam, 0, CEIL - 0.16, z, 0, false);
    const dl = new THREE.MeshBasicMaterial({ color: 0xfff0d8 });
    const dGeos: THREE.BufferGeometry[] = [];
    for (let x = -11; x <= 11; x += 2.75) for (const z of [-8.2, -2.7, 2.7, 8.2]) {
      const d = new THREE.CircleGeometry(0.09, 12);
      d.rotateX(Math.PI / 2);
      d.translate(x, CEIL - 0.01, z);
      dGeos.push(d);
    }
    g.add(new THREE.Mesh(mergeGeometries(dGeos, false)!, dl));
  }

  // ---------------------------------------------------------------------- the west wall: fireplace, TV, books, bedroom door
  let fireUpdate: (dt: number) => void = () => {};
  {
    // chimney breast in stone, paintable
    const stone = new THREE.MeshStandardMaterial({ map: plasterTex(53, '#8a8680'), roughness: 0.9, color: 0x9a948c });
    blood.patchMaterial(stone);
    const geos = a.boxFaces(blood, -HALF_W + 0.3, 7.0, 0.6, 2.8, CEIL, k.propDensity * 0.7, [1.4, 1.4], false, 2.6);
    k.add(new THREE.Mesh(mergeGeometries(geos, false)!, stone));
    k.block(-HALF_W + 0.3, 7.0, 0.6, 2.8, CEIL, 'pillar', 'fireplace');
    // the firebox: a dark mouth, logs, the fire
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.85), new THREE.MeshBasicMaterial({ color: 0x090605 }));
    mouth.position.set(-HALF_W + 0.61, 0.5, 7.0);
    mouth.rotation.y = Math.PI / 2;
    g.add(mouth);
    const logMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 1, emissive: 0x401006, emissiveIntensity: 0.6 });
    for (const [dz, ry] of [[-0.15, 0.3], [0.18, -0.25]] as [number, number][]) {
      const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 8), logMat);
      lg.rotation.set(Math.PI / 2, 0, ry);
      lg.position.set(-HALF_W + 0.66, 0.16, 7.0 + dz);
      g.add(lg);
    }
    const mantel = k.box(0.3, 0.1, 2.0, new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.6 }), -HALF_W + 0.72, 1.25, 7.0);
    void mantel;
    fireUpdate = addFire(k, new THREE.Vector3(-HALF_W + 0.68, 0.22, 7.0), { size: 0.62, light: 26, priority: 10, width: 0.55 });
    // TV console (the screen on it is a prop), bookshelves
    const wood = new THREE.MeshStandardMaterial({ color: 0x2e2018, roughness: 0.55 });
    k.box(0.55, 0.55, 4.0, wood, -HALF_W + 0.28, 0.275, 0.5);
    k.block(-HALF_W + 0.28, 0.5, 0.56, 4.0, 0.55, 'crate', 'media console');
    const books = booksTex(rng);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 3.0), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: books, roughness: 0.8 }), wood]);
    shelf.rotation.y = Math.PI / 2;
    shelf.position.set(-HALF_W + 0.2, 1.3, -5.0);
    k.add(shelf);
    k.block(-HALF_W + 0.2, -5.0, 0.42, 3.0, 2.6, 'crate', 'bookshelf');
  }

  // ---------------------------------------------------------------------- living room
  const fabric = new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: 0.95 });
  const cushion = new THREE.MeshStandardMaterial({ color: 0x4a4e58, roughness: 0.95 });
  {
    // L-sofa: back to the dining room, facing the screen; the chaise toward the fire
    k.box(0.95, 0.42, 5.2, fabric, -5.75, 0.21, 0.4);
    k.box(0.25, 0.8, 5.2, fabric, -5.35, 0.4, 0.4);
    for (let i = 0; i < 3; i++) k.box(0.62, 0.14, 1.6, cushion, -5.9, 0.49, -1.35 + i * 1.72);
    k.box(1.9, 0.42, 0.95, fabric, -7.15, 0.21, 2.55);
    k.box(1.9, 0.14, 0.8, cushion, -7.15, 0.49, 2.55);
    k.box(0.95, 0.6, 0.25, fabric, -5.75, 0.3, -2.3);
    const sofa1 = k.block(-5.75, 0.4, 1.0, 5.3, 0.85, 'crate', 'sofa');
    sofa1.material = 'flesh';
    const sofa2 = k.block(-7.15, 2.55, 1.9, 0.95, 0.6, 'crate', 'sofa');
    sofa2.material = 'flesh';
  }

  // ---------------------------------------------------------------------- dining, kitchen, study, piano, bar
  const walnut = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.45 });
  {
    // dining table
    k.box(2.6, 0.06, 1.1, walnut, 0.5, 0.73, -1.5);
    for (const [dx, dz] of [[-1.15, -0.45], [1.15, -0.45], [-1.15, 0.45], [1.15, 0.45]]) k.box(0.07, 0.7, 0.07, walnut, 0.5 + dx, 0.35, -1.5 + dz);
    k.block(0.5, -1.5, 2.6, 1.1, 0.76, 'crate', 'dining table');
    // the chandelier
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.02, 6, 24), new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.9, roughness: 0.3 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0.5, 3.2, -1.5);
    g.add(ring);
    const bulb = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), bulb);
      b.position.set(0.5 + Math.cos((i / 8) * Math.PI * 2) * 0.55, 3.25, -1.5 + Math.sin((i / 8) * Math.PI * 2) * 0.55);
      g.add(b);
    }
    k.cyl(0.006, 0.006, 1.2, 4, new THREE.MeshBasicMaterial({ color: 0x111111 }), 0.5, 3.8, -1.5, false);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(64, 'rgba(255,230,180,0.9)', 'rgba(255,210,150,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
    glow.scale.set(1.3, 1.3, 1);
    (glow.material as THREE.SpriteMaterial).opacity = 0.3;
    glow.position.set(0.5, 3.25, -1.5);
    g.add(glow);
    k.light({ p: new THREE.Vector3(0.5, 3.0, -1.5), color: 0xffcf98, intensity: 28, distance: 12, priority: 8 });

    // kitchen: island, counters, fridge, hood, upper cabinets
    const stoneTop = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.15, metalness: 0.1, envMapIntensity: 1.5 });
    const cab = new THREE.MeshStandardMaterial({ map: cabinetTex(), roughness: 0.5 });
    k.box(1.0, 0.88, 3.1, cab, 7.5, 0.44, 0.5);
    k.box(1.15, 0.05, 3.25, stoneTop, 7.5, 0.915, 0.5);
    k.block(7.5, 0.5, 1.15, 3.25, 0.94, 'crate', 'island');
    k.box(0.62, 0.86, 9.2, cab, HALF_W - 0.31, 0.43, -0.4);
    k.box(0.66, 0.05, 9.2, stoneTop, HALF_W - 0.33, 0.895, -0.4);
    k.block(HALF_W - 0.33, -0.4, 0.66, 9.2, 0.92, 'crate', 'counter');
    k.box(0.4, 0.75, 9.2, cab, HALF_W - 0.2, 2.05, -0.4);
    const steel = new THREE.MeshStandardMaterial({ color: 0xa8acb0, metalness: 0.85, roughness: 0.25, envMapIntensity: 1.4 });
    k.box(0.75, 2.1, 1.0, steel, HALF_W - 0.38, 1.05, -5.6);
    k.box(0.04, 0.9, 0.04, new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6 }), HALF_W - 0.78, 1.35, -5.25);
    k.block(HALF_W - 0.38, -5.6, 0.76, 1.0, 2.1, 'crate', 'fridge').material = 'metal';
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.55, 0.5, 4), steel);
    hood.rotation.y = Math.PI / 4;
    hood.position.set(HALF_W - 0.45, 1.9, -1.2);
    k.add(hood);
    k.box(0.5, 0.02, 0.7, new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2 }), HALF_W - 0.36, 0.925, -1.2, 0, false);
    // pendants over the island
    const shade = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide });
    const lit = new THREE.MeshBasicMaterial({ color: 0xffe8c0 });
    for (const dz of [-0.9, 0.5, 1.9]) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.25, 14, 1, true), shade);
      s.position.set(7.5, 2.75, dz);
      g.add(s);
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.19, 14), lit);
      b.rotation.x = Math.PI / 2;
      b.position.set(7.5, 2.63, dz);
      g.add(b);
      k.cyl(0.005, 0.005, 1.5, 4, new THREE.MeshBasicMaterial({ color: 0x111111 }), 7.5, 3.6, dz, false);
    }
    k.light({ p: new THREE.Vector3(7.5, 2.5, 0.5), color: 0xffd8a8, intensity: 26, distance: 11, priority: 9 });

    // study by the glass: desk, shelf
    k.box(1.8, 0.05, 0.8, walnut, 8.0, 0.73, -9.3);
    for (const [dx, dz] of [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]]) k.box(0.05, 0.71, 0.05, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.7 }), 8.0 + dx, 0.355, -9.3 + dz);
    k.block(8.0, -9.3, 1.8, 0.8, 0.75, 'crate', 'desk');
    const shelf2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 0.38), [walnut, walnut, walnut, walnut, walnut, new THREE.MeshStandardMaterial({ map: booksTex(rng), roughness: 0.8 })]);
    shelf2.rotation.y = -Math.PI / 2;
    shelf2.position.set(HALF_W - 0.19, 1.1, -9.0);
    k.add(shelf2);
    k.block(HALF_W - 0.19, -9.0, 0.4, 2.6, 2.2, 'crate', 'bookshelf');

    // the grand piano
    const black = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.08, metalness: 0.3, envMapIntensity: 1.8 });
    const pg = new THREE.Group();
    pg.position.set(-7.6, 0, -8.2);
    pg.rotation.y = 0.35;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.35, 24, 1, false, 0, Math.PI), black);
    body.scale.set(1, 1, 1.6);
    body.position.set(0, 0.85, 0.05);
    body.rotation.y = Math.PI / 2;
    pg.add(body);
    const keybed = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.35, 0.55), black);
    keybed.position.set(0, 0.85, 0.45);
    pg.add(keybed);
    const keys = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.18), new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.3 }));
    keys.position.set(0, 0.98, 0.66);
    pg.add(keys);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 1.3), black);
    lid.position.set(-0.35, 1.45, -0.35);
    lid.rotation.z = 0.7;
    pg.add(lid);
    for (const [x, z] of [[-0.6, 0.45], [0.6, 0.45], [0, -1.1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.7, 8), black);
      leg.position.set(x, 0.35, z);
      pg.add(leg);
    }
    k.add(pg);
    k.block(-7.6, -8.4, 1.7, 2.0, 1.05, 'crate', 'piano').material = 'piano';
    // a sculpture on a plinth
    k.box(0.5, 1.0, 0.5, new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.4 }), 2.5, 0.5, -9.7);
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.2, 0.06, 64, 8, 2, 3), new THREE.MeshStandardMaterial({ color: 0xc8902a, metalness: 0.95, roughness: 0.2 }));
    knot.position.set(2.5, 1.35, -9.7);
    k.add(knot);
    k.block(2.5, -9.7, 0.52, 0.52, 1.6, 'pillar', 'plinth');
    // the entrance console
    k.box(1.4, 0.06, 0.4, walnut, -1.2, 0.83, HALF_D - 0.25);
    for (const dx of [-0.65, 0.65]) k.box(0.05, 0.8, 0.35, walnut, -1.2 + dx, 0.4, HALF_D - 0.25);
    k.block(-1.2, HALF_D - 0.25, 1.4, 0.42, 0.86, 'crate', 'console');
  }

  // ---------------------------------------------------------------------- columns (paintable)
  {
    const conc = new THREE.MeshStandardMaterial({ map: plasterTex(57, '#7a7670'), roughness: 0.85 });
    blood.patchMaterial(conc);
    const geos: THREE.BufferGeometry[] = [];
    for (const [x, z] of [[-3.0, -5.2], [4.0, -5.2], [-3.0, 5.4], [4.0, 5.4]] as [number, number][]) {
      geos.push(...a.boxFaces(blood, x, z, 0.5, 0.5, CEIL, k.propDensity, [0.5, CEIL], false, 2.8));
      k.block(x, z, 0.5, 0.5, CEIL, 'pillar', 'column');
    }
    k.add(new THREE.Mesh(mergeGeometries(geos, false)!, conc));
  }

  // ---------------------------------------------------------------------- art on the walls
  {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.4 });
    const hang = (x: number, y: number, z: number, ry: number, w: number, h: number) => {
      const n = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
      const f = k.box(w + 0.1, h + 0.1, 0.04, frameMat, x, y, z, ry, false);
      f.position.addScaledVector(n, 0.03);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: paintingTex(rng), roughness: 0.7 }));
      p.position.set(x, y, z).addScaledVector(n, 0.056);
      p.rotation.y = ry;
      g.add(p);
    };
    hang(0.3, 1.8, HALF_D, Math.PI, 1.6, 2.0);
    hang(9.5, 1.7, HALF_D, Math.PI, 1.2, 1.5);
    hang(HALF_W, 1.75, 9.6, -Math.PI / 2, 0.9, 1.1);
    hang(-HALF_W, 2.6, 0.5, Math.PI / 2, 2.6, 1.3);
  }

  // ---------------------------------------------------------------------- the city below the glass
  const city = buildCity(g, rng, [
    { n: 18, r0: 40, r1: 58, top0: -40, top1: -6 },
    { n: 24, r0: 62, r1: 95, top0: -14, top1: 26 },
    { n: 26, r0: 100, r1: 150, top0: 8, top1: 70 },
  ], { bottom: -140 });
  buildStreet(g, rng, -130, 400);
  const beaconSprites: THREE.Sprite[] = [];
  for (const b of city.beacons) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(32, 'rgba(255,60,40,1)', 'rgba(255,30,20,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.scale.set(2.6, 2.6, 1);
    sp.position.copy(b);
    g.add(sp);
    beaconSprites.push(sp);
  }

  // ---------------------------------------------------------------------- everything that moves (and breaks)
  const Y_TABLE = 0.76, Y_ISLAND = 0.94, Y_DESK = 0.755, Y_CONSOLE = 0.86, Y_TV = 0.55, Y_SIDE = 0.56;
  a.propList = [
    // living
    { kind: 'tv', x: -HALF_W + 0.32, z: 0.5, y: Y_TV, ry: Math.PI / 2 },
    { kind: 'speaker', x: -HALF_W + 0.3, z: -2.4 }, { kind: 'speaker', x: -HALF_W + 0.3, z: 3.4 },
    { kind: 'coffeetable', x: -8.4, z: 0.5, ry: Math.PI / 2 },
    { kind: 'armchair', x: -9.6, z: -2.9, ry: 0.6 }, { kind: 'armchair', x: -10.1, z: 3.9, ry: 2.6 },
    { kind: 'floorlamp', x: -4.85, z: -2.75 }, { kind: 'floorlamp', x: -11.5, z: 5.0 },
    { kind: 'sidetable', x: -4.9, z: 3.6 }, { kind: 'vase', x: -4.9, z: 3.6, y: Y_SIDE },
    { kind: 'sidetable', x: -11.0, z: -1.9 }, { kind: 'bottle', x: -11.05, z: -1.85, y: Y_SIDE }, { kind: 'bottle', x: -10.9, z: -1.95, y: Y_SIDE },
    { kind: 'plant', x: -12.2, z: -10.2 }, { kind: 'plant', x: -12.2, z: 10.1 }, { kind: 'plant', x: -0.6, z: -10.2 }, { kind: 'plant', x: 6.0, z: 10.2 }, { kind: 'plant', x: 12.2, z: 10.2 },
    // dining
    ...[-0.4, 0.5, 1.4].flatMap((dx) => [
      { kind: 'chair', x: 0.5 + dx - 0.5, z: -2.45, ry: 0 },
      { kind: 'chair', x: 0.5 + dx - 0.5, z: -0.55, ry: Math.PI },
    ]),
    { kind: 'vase', x: 0.45, z: -1.5, y: Y_TABLE }, { kind: 'bottle', x: -0.3, z: -1.35, y: Y_TABLE }, { kind: 'bottle', x: 1.25, z: -1.7, y: Y_TABLE }, { kind: 'bottle', x: 1.4, z: -1.55, y: Y_TABLE },
    // kitchen
    { kind: 'stool', x: 6.55, z: -0.6 }, { kind: 'stool', x: 6.55, z: 0.5 }, { kind: 'stool', x: 6.55, z: 1.6 },
    { kind: 'bottle', x: 7.4, z: -0.4, y: Y_ISLAND }, { kind: 'bottle', x: 7.65, z: 1.2, y: Y_ISLAND }, { kind: 'vase', x: 7.5, z: 1.7, y: Y_ISLAND }, { kind: 'bottle', x: 7.3, z: 0.2, y: Y_ISLAND },
    { kind: 'bottle', x: HALF_W - 0.35, z: 2.2, y: 0.92 }, { kind: 'bottle', x: HALF_W - 0.3, z: 2.5, y: 0.92 }, { kind: 'vase', x: HALF_W - 0.35, z: -3.4, y: 0.92 },
    // study
    { kind: 'monitor', x: 8.0, z: -9.45, y: Y_DESK }, { kind: 'officechair', x: 8.0, z: -8.35, ry: Math.PI }, { kind: 'bottle', x: 8.75, z: -9.3, y: Y_DESK },
    { kind: 'box', x: 11.0, z: -6.9, ry: 0.2 }, { kind: 'box', x: 11.2, z: -7.4, y: 0.4, ry: -0.3 }, { kind: 'box', x: 10.5, z: -6.6, ry: 0.9 }, { kind: 'box', x: 5.3, z: -9.9, ry: 0.4 },
    // the bar cart and its bottles
    { kind: 'cart', x: -3.6, z: -9.6 }, { kind: 'bottle', x: -3.85, z: -9.65, y: 0.87 }, { kind: 'bottle', x: -3.6, z: -9.5, y: 0.87 }, { kind: 'bottle', x: -3.35, z: -9.7, y: 0.87 },
    // the entrance
    { kind: 'vase', x: -1.6, z: HALF_D - 0.25, y: Y_CONSOLE }, { kind: 'plant', x: -7.4, z: 10.2 },
    { kind: 'chair', x: 10.2, z: 6.2, ry: 2.2 },
  ];

  // ---------------------------------------------------------------------- light
  const hemi = k.hemi(0xb8b0b8, 0x2a221c, 0.55);
  // the city's cold light through the glass: the window frames cast across the floor
  const moon = k.key(0x9ab4e8, 0.7, new THREE.Vector3(-6, 9, -22), { x: 17, z: 15, far: 70 });
  k.light({ p: new THREE.Vector3(-4.85, 1.75, -2.75), color: 0xffd8a0, intensity: 12, distance: 7, priority: 7 });
  let tvLight: THREE.PointLight | null = null;
  k.light({ p: new THREE.Vector3(-HALF_W + 1.2, 1.1, 0.5), color: 0x8aa8ff, intensity: 10, distance: 6, priority: 5, use: (l) => (tvLight = l) });
  k.commitLights();

  // contact shadows under the furniture, darker along the walls
  {
    const p = new THREE.Vector3();
    for (const o of a.obstacles) {
      if (o.ghost || o.kind === 'wall') continue;
      p.set((o.minX + o.maxX) / 2, 0.01, (o.minZ + o.maxZ) / 2);
      blood.splat(p, Math.max(o.maxX - o.minX, o.maxZ - o.minZ) * 0.7, SPLAT.ao, 0.32, up, null, 0, p.x);
    }
  }
  k.probe(sky, new THREE.Vector3(0, 1.4, 0));

  let time = 0;
  let windowRain2: THREE.Texture | null = null;
  windowRain2 = windowRain;
  const update = (dt: number) => {
    time += dt;
    fireUpdate(dt);
    if (windowRain2) windowRain2.offset.y += dt * 0.25;
    const tl = tvLight as THREE.PointLight | null;
    if (tl) tl.intensity = 10 * (0.75 + Math.random() * 0.25 + Math.sin(time * 1.7) * 0.2);
    for (let i = 0; i < beaconSprites.length; i++) (beaconSprites[i].material as THREE.SpriteMaterial).opacity = Math.max(0, Math.sin(time * 2.2 + i * 1.3)) ** 6;
  };
  const dressing = { rain: new THREE.Texture(), beacon: new THREE.Sprite(), beams: new THREE.Mesh(), sparkLamp: null } as Dressing;
  return { moon, hemi, dust: k.motes(260, 0xffe0c0, 3.6, 0.3), dressing, update };
}
let windowRain: THREE.Texture | null = null;

/** A dark baseboard along the foot of a painted wall. */
function baseboard(x: CanvasRenderingContext2D, W: number, H: number, ppm: number) {
  x.fillStyle = '#2a221c';
  x.fillRect(0, H - 0.14 * ppm, W, 0.14 * ppm);
  x.fillStyle = 'rgba(255,255,255,0.12)';
  x.fillRect(0, H - 0.14 * ppm, W, 2);
}

/** The floor's overlay (rugs, the kitchen's porcelain, wear) and roughness (oil finish, matte rugs, glossy tile). */
function paintApartmentFloor(x: CanvasRenderingContext2D, r: CanvasRenderingContext2D, rng: RNG, W: number, H: number, ppm: number) {
  const px = (wx: number) => (wx + HALF_W) * ppm;
  const pz = (wz: number) => (wz + HALF_D) * ppm;
  r.fillStyle = 'rgb(95,95,95)';
  r.fillRect(0, 0, W, H);
  // the kitchen: big porcelain tiles
  {
    const x0 = px(5.2), x1 = W, z0 = pz(-6.4), z1 = pz(5.2);
    x.fillStyle = '#d8d4cc';
    x.fillRect(x0, z0, x1 - x0, z1 - z0);
    x.strokeStyle = 'rgba(90,86,80,0.6)';
    x.lineWidth = 2;
    for (let xx = x0; xx < x1; xx += 0.6 * ppm) {
      x.beginPath();
      x.moveTo(xx, z0);
      x.lineTo(xx, z1);
      x.stroke();
    }
    for (let zz = z0; zz < z1; zz += 0.6 * ppm) {
      x.beginPath();
      x.moveTo(x0, zz);
      x.lineTo(x1, zz);
      x.stroke();
    }
    for (let i = 0; i < 400; i++) {
      x.fillStyle = `rgba(${rng.next() < 0.5 ? '255,255,255' : '120,110,100'},0.06)`;
      x.fillRect(x0 + rng.next() * (x1 - x0), z0 + rng.next() * (z1 - z0), 6 + rng.next() * 30, 2 + rng.next() * 8);
    }
    r.fillStyle = 'rgb(40,40,40)';
    r.fillRect(x0, z0, x1 - x0, z1 - z0);
  }
  // rugs: a medallion carpet in the living room, a flat-weave under the table, a runner at the door
  const rug = (cx: number, cz: number, w: number, h: number, field: string, border: string, motif: string) => {
    const x0 = px(cx - w / 2), z0 = pz(cz - h / 2), RW = w * ppm, RH = h * ppm;
    x.fillStyle = field;
    x.fillRect(x0, z0, RW, RH);
    x.strokeStyle = border;
    x.lineWidth = 0.25 * ppm;
    x.strokeRect(x0 + 0.2 * ppm, z0 + 0.2 * ppm, RW - 0.4 * ppm, RH - 0.4 * ppm);
    x.strokeStyle = motif;
    x.lineWidth = 3;
    x.strokeRect(x0 + 0.38 * ppm, z0 + 0.38 * ppm, RW - 0.76 * ppm, RH - 0.76 * ppm);
    // a medallion and a field of small motifs
    x.fillStyle = border;
    x.beginPath();
    x.ellipse(x0 + RW / 2, z0 + RH / 2, RW * 0.18, RH * 0.22, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = motif;
    x.beginPath();
    x.ellipse(x0 + RW / 2, z0 + RH / 2, RW * 0.1, RH * 0.13, 0, 0, Math.PI * 2);
    x.fill();
    for (let i = 0; i < 40; i++) {
      const mx = x0 + 0.5 * ppm + rng.next() * (RW - ppm), mz = z0 + 0.5 * ppm + rng.next() * (RH - ppm);
      x.fillStyle = rng.next() < 0.5 ? motif : border;
      x.beginPath();
      x.moveTo(mx, mz - 6);
      x.lineTo(mx + 6, mz);
      x.lineTo(mx, mz + 6);
      x.lineTo(mx - 6, mz);
      x.fill();
    }
    // fringe and a soft weave
    x.fillStyle = 'rgba(230,220,200,0.8)';
    for (let i = 0; i < RW; i += 4) {
      x.fillRect(x0 + i, z0 - 0.06 * ppm, 1.5, 0.06 * ppm);
      x.fillRect(x0 + i, z0 + RH, 1.5, 0.06 * ppm);
    }
    for (let i = 0; i < RW * RH * 0.004; i++) {
      x.fillStyle = `rgba(0,0,0,${0.04 + rng.next() * 0.05})`;
      x.fillRect(x0 + rng.next() * RW, z0 + rng.next() * RH, 2, 1);
    }
    r.fillStyle = 'rgb(240,240,240)';
    r.fillRect(x0, z0, RW, RH);
  };
  rug(-8.6, 0.5, 5.4, 4.4, '#7a1e1a', '#1a2a4a', '#d8b860');
  rug(0.5, -1.5, 4.2, 2.8, '#c8bca0', '#5a4a3a', '#8a3a2a');
  rug(-4.5, 8.4, 1.4, 3.6, '#2a3a5a', '#c8a040', '#8a2a2a');
  // wear on the oak: scuffs along the paths
  for (let i = 0; i < 160; i++) {
    x.fillStyle = `rgba(${rng.next() < 0.5 ? '255,240,220' : '20,12,6'},0.05)`;
    x.save();
    x.translate(rng.next() * W, rng.next() * H);
    x.rotate(rng.next() * 3);
    x.fillRect(0, 0, 10 + rng.next() * 40, 2 + rng.next() * 4);
    x.restore();
  }
  x.clearRect(0, 0, W, 2);
  x.clearRect(0, H - 2, W, 2);
  x.clearRect(0, 0, 2, H);
  x.clearRect(W - 2, 0, 2, H);
}
