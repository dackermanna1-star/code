import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HALF_D, HALF_W } from './arena';
import type { Arena } from './arena';
import type { BloodAtlas } from './bloodAtlas';
import { SPLAT } from './bloodAtlas';
import type { Dressing } from './dressing';
import { canvas, makeNoise, MapKit, MapParts, normalFromHeight, tex } from './mapKit';
import { buildCity, neonTexture, skyTexture } from './city';
import { paintWall, tag, throwUp } from './graffiti';
import { radialTexture } from './textures';
import { RNG } from '../core/math';

// ============================================================================ textures
/** Old tenement brick: every brick its own colour, some burnt dark, chipped arrises, recessed mortar. */
export function brickTex(seed: number, pal: 'red' | 'brown' | 'yellow') {
  const S = 512; // 2 m
  const rng = new RNG(seed);
  const [c, x] = canvas(S, S);
  const [hc, hx] = canvas(S, S);
  const mortar = pal === 'yellow' ? '#8a8270' : '#6e665e';
  x.fillStyle = mortar;
  x.fillRect(0, 0, S, S);
  hx.fillStyle = '#202020';
  hx.fillRect(0, 0, S, S);
  const bw = 55, bh = 17, gap = 3;
  const hue = pal === 'red' ? 0.02 : pal === 'brown' ? 0.055 : 0.1;
  for (let row = 0; row * (bh + gap) < S; row++) {
    const off = row % 2 ? (bw + gap) / 2 : 0;
    for (let col = -1; col * (bw + gap) < S + bw; col++) {
      const bx = col * (bw + gap) + off, by = row * (bh + gap);
      const dark = rng.next() < 0.08;
      const col3 = new THREE.Color().setHSL(hue + (rng.next() - 0.5) * 0.03, 0.35 + rng.next() * 0.25, dark ? 0.1 + rng.next() * 0.06 : 0.2 + rng.next() * 0.14);
      x.fillStyle = '#' + col3.getHexString();
      // chipped corners: an irregular polygon
      const ch = () => rng.next() * 2.5;
      x.beginPath();
      x.moveTo(bx + ch(), by + ch());
      x.lineTo(bx + bw - ch(), by + ch());
      x.lineTo(bx + bw - ch(), by + bh - ch());
      x.lineTo(bx + ch(), by + bh - ch());
      x.closePath();
      x.fill();
      const g = x.createLinearGradient(0, by, 0, by + bh);
      g.addColorStop(0, 'rgba(255,240,220,0.08)');
      g.addColorStop(1, 'rgba(0,0,0,0.22)');
      x.fillStyle = g;
      x.fill();
      // height: the brick face, a little uneven
      hx.fillStyle = `rgb(${190 + rng.next() * 50},0,0)`;
      hx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
      for (let k = 0; k < 6; k++) {
        hx.fillStyle = `rgba(${rng.next() < 0.5 ? 255 : 120},0,0,0.25)`;
        hx.fillRect(bx + rng.next() * bw, by + rng.next() * bh, 2 + rng.next() * 6, 1 + rng.next() * 3);
      }
    }
  }
  // pitting and grit
  for (let i = 0; i < 14000; i++) {
    const v = rng.next();
    x.fillStyle = v < 0.5 ? `rgba(20,14,10,${0.2 + rng.next() * 0.3})` : `rgba(200,180,160,${0.08 + rng.next() * 0.12})`;
    const px = rng.next() * S, py = rng.next() * S, s = 1 + rng.next() * 1.5;
    x.fillRect(px, py, s, s);
    if (v < 0.5) {
      hx.fillStyle = 'rgba(0,0,0,0.5)';
      hx.fillRect(px, py, s, s);
    }
  }
  // soot and efflorescence
  const n = makeNoise(seed, 8);
  const img = x.getImageData(0, 0, S, S);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const o = (j * S + i) * 4;
      const soot = n((i / S) * 8, (j / S) * 8);
      const salt = Math.max(0, n((i / S) * 8 + 3.7, (j / S) * 8 + 1.3) - 0.72) * 2.2;
      const k = 0.75 + soot * 0.4;
      img.data[o] = Math.min(255, img.data[o] * k + salt * 90);
      img.data[o + 1] = Math.min(255, img.data[o + 1] * k + salt * 90);
      img.data[o + 2] = Math.min(255, img.data[o + 2] * k + salt * 85);
    }
  x.putImageData(img, 0, 0);
  return { map: tex(c), normal: normalFromHeight(hc, 3.5) };
}

/** Cinder block, painted long ago (two-tone: dark below, pale above), flaking back to concrete. */
export function blockTex(seed: number, upper: string, lower: string) {
  const S = 512; // 2 m (blocks 0.4 x 0.2)
  const rng = new RNG(seed);
  const [c, x] = canvas(S, S);
  const [hc, hx] = canvas(S, S);
  const bw = 102, bh = 51;
  hx.fillStyle = '#303030';
  hx.fillRect(0, 0, S, S);
  for (let row = 0; row * bh < S; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col * bw < S + bw; col++) {
      const bx = col * bw + off, by = row * bh;
      hx.fillStyle = `rgb(${200 + rng.next() * 30},0,0)`;
      hx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
    }
  }
  x.fillStyle = upper;
  x.fillRect(0, 0, S, S);
  // the paint line at 1.2 m (row 0..) handled by the material colour split: here, flakes and stains
  for (let i = 0; i < 260; i++) {
    x.fillStyle = `rgba(150,146,140,${0.4 + rng.next() * 0.5})`;
    const px = rng.next() * S, py = rng.next() * S;
    x.beginPath();
    x.ellipse(px, py, 2 + rng.next() * 10, 1 + rng.next() * 6, rng.next() * 3, 0, Math.PI * 2);
    x.fill();
  }
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = `rgba(0,0,0,${0.05 + rng.next() * 0.12})`;
    x.fillRect(rng.next() * S, rng.next() * S, 1.5, 1.5);
  }
  // mortar joints
  x.strokeStyle = 'rgba(0,0,0,0.35)';
  x.lineWidth = 3;
  for (let row = 0; row * bh <= S; row++) {
    x.beginPath();
    x.moveTo(0, row * bh);
    x.lineTo(S, row * bh);
    x.stroke();
    const off = row % 2 ? bw / 2 : 0;
    for (let col = 0; col * bw <= S + bw; col++) {
      x.beginPath();
      x.moveTo(col * bw + off, row * bh);
      x.lineTo(col * bw + off, row * bh + bh);
      x.stroke();
    }
  }
  void lower;
  return { map: tex(c), normal: normalFromHeight(hc, 2.2) };
}

/** Tired asphalt: aggregate, binder, a few old patches (4 m tile). */
export function asphaltTex(seed: number) {
  const S = 512;
  const rng = new RNG(seed);
  const [c, x] = canvas(S, S);
  const [hc, hx] = canvas(S, S);
  x.fillStyle = '#3a3a3c';
  x.fillRect(0, 0, S, S);
  hx.fillStyle = '#808080';
  hx.fillRect(0, 0, S, S);
  const n = makeNoise(seed, 8);
  const img = x.getImageData(0, 0, S, S);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const o = (j * S + i) * 4;
      const k = 0.75 + n((i / S) * 8, (j / S) * 8) * 0.45;
      img.data[o] *= k;
      img.data[o + 1] *= k;
      img.data[o + 2] *= k;
    }
  x.putImageData(img, 0, 0);
  // aggregate stones
  for (let i = 0; i < 22000; i++) {
    const v = 60 + rng.next() * 110;
    const s = 0.8 + rng.next() * 2.2;
    const px = rng.next() * S, py = rng.next() * S;
    x.fillStyle = `rgba(${v},${v},${v * 1.02},${0.35 + rng.next() * 0.45})`;
    x.fillRect(px, py, s, s);
    hx.fillStyle = `rgba(255,255,255,${0.4 + rng.next() * 0.5})`;
    hx.fillRect(px, py, s, s);
  }
  return { map: tex(c), normal: normalFromHeight(hc, 1.4) };
}

/** Windows of the upper floors: lit kitchens, televisions, curtains, boarded and broken ones. */
export function windowAtlas(seed: number) {
  const CW = 128, CH = 160, N = 8;
  const rng = new RNG(seed);
  const [c, x] = canvas(CW * N, CH);
  const [ec, ex] = canvas(CW * N, CH);
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, CW * N, CH);
  for (let i = 0; i < N; i++) {
    const ox = i * CW;
    x.fillStyle = '#0c0d10';
    x.fillRect(ox, 0, CW, CH);
    const kind = i;
    if (kind === 0 || kind === 1) {
      // warm lit room behind blinds
      const col = kind === 0 ? '#ffc070' : '#ffe0a0';
      x.fillStyle = col;
      x.fillRect(ox + 8, 8, CW - 16, CH - 16);
      ex.fillStyle = col;
      ex.fillRect(ox + 8, 8, CW - 16, CH - 16);
      for (let y = 10; y < CH - 10; y += 7) {
        x.fillStyle = 'rgba(60,40,20,0.45)';
        x.fillRect(ox + 8, y, CW - 16, 3);
        ex.fillStyle = 'rgba(0,0,0,0.45)';
        ex.fillRect(ox + 8, y, CW - 16, 3);
      }
      if (kind === 1) {
        // a silhouette
        x.fillStyle = 'rgba(20,10,5,0.85)';
        ex.fillStyle = 'rgba(0,0,0,0.85)';
        for (const cx2 of [x, ex]) {
          cx2.beginPath();
          cx2.arc(ox + CW * 0.62, CH * 0.42, 13, 0, Math.PI * 2);
          cx2.fill();
          cx2.fillRect(ox + CW * 0.62 - 20, CH * 0.5, 40, 60);
        }
      }
    } else if (kind === 2) {
      // television blue
      x.fillStyle = '#5a7ac8';
      x.fillRect(ox + 8, 8, CW - 16, CH - 16);
      ex.fillStyle = '#4a6ab8';
      ex.fillRect(ox + 8, 8, CW - 16, CH - 16);
      x.fillStyle = 'rgba(10,10,20,0.6)';
      x.fillRect(ox + 8, CH * 0.6, CW - 16, CH * 0.4 - 8);
    } else if (kind === 3) {
      // dark, curtains
      x.fillStyle = '#1a1414';
      x.fillRect(ox + 8, 8, CW - 16, CH - 16);
      x.fillStyle = '#4a2020';
      x.fillRect(ox + 8, 8, 30, CH - 16);
      x.fillRect(ox + CW - 38, 8, 30, CH - 16);
    } else if (kind === 4) {
      // boarded up, tagged
      x.fillStyle = '#7a6448';
      x.fillRect(ox + 4, 4, CW - 8, CH - 8);
      for (let k = 0; k < 7; k++) {
        x.fillStyle = `rgba(0,0,0,${0.15 + rng.next() * 0.2})`;
        x.fillRect(ox + 4 + rng.next() * (CW - 8), 4, 2, CH - 8);
      }
      tag(x, rng, ox + 18, CH * 0.55, 28, '#0a0a0a');
    } else if (kind === 5) {
      // broken glass
      x.fillStyle = '#050608';
      x.fillRect(ox + 8, 8, CW - 16, CH - 16);
      x.strokeStyle = 'rgba(180,200,220,0.5)';
      x.lineWidth = 1.5;
      for (let k = 0; k < 9; k++) {
        x.beginPath();
        x.moveTo(ox + CW / 2, CH / 2);
        x.lineTo(ox + 8 + rng.next() * (CW - 16), 8 + rng.next() * (CH - 16));
        x.stroke();
      }
    } else if (kind === 6) {
      // dark, reflecting
      const g = x.createLinearGradient(ox, 0, ox + CW, CH);
      g.addColorStop(0, '#1a2030');
      g.addColorStop(0.5, '#0a0c12');
      g.addColorStop(1, '#141a24');
      x.fillStyle = g;
      x.fillRect(ox + 8, 8, CW - 16, CH - 16);
    } else {
      // lit, a plant on the sill
      x.fillStyle = '#ffd890';
      x.fillRect(ox + 8, 8, CW - 16, CH - 16);
      ex.fillStyle = '#ffd890';
      ex.fillRect(ox + 8, 8, CW - 16, CH - 16);
      x.fillStyle = '#1a2a10';
      ex.fillStyle = '#000';
      for (const cx2 of [x, ex]) {
        cx2.beginPath();
        cx2.ellipse(ox + CW * 0.35, CH * 0.75, 22, 28, 0, 0, Math.PI * 2);
        cx2.fill();
      }
    }
    // frame and mullion
    x.fillStyle = '#2a2622';
    x.fillRect(ox, 0, CW, 8);
    x.fillRect(ox, CH - 8, CW, 8);
    x.fillRect(ox, 0, 8, CH);
    x.fillRect(ox + CW - 8, 0, 8, CH);
    x.fillRect(ox, CH / 2 - 3, CW, 6);
    ex.fillStyle = '#000';
    ex.fillRect(ox, CH / 2 - 3, CW, 6);
  }
  return { map: tex(c, true, false), emissive: tex(ec, true, false), n: N };
}

/** A lit shop window: shelves of bottles, a counter, a poster or two, the glass's own reflection. */
export function shopTexture(rng: RNG) {
  const W = 256, H = 128;
  const [c, x] = canvas(W, H);
  x.fillStyle = '#e8d8b0';
  x.fillRect(0, 0, W, H);
  for (let row = 0; row < 4; row++) {
    const y = 14 + row * 24;
    x.fillStyle = '#5a4a3a';
    x.fillRect(0, y + 18, W, 3);
    for (let i = 4; i < W - 6; i += 6 + rng.next() * 4) {
      x.fillStyle = rng.pick(['#3a6a2a', '#8a3a1a', '#c8a040', '#2a2a6a', '#e8e8e8', '#6a1a3a']);
      x.fillRect(i, y + 18 - 8 - rng.next() * 8, 4, 18);
    }
  }
  x.fillStyle = '#3a2a1a';
  x.fillRect(0, H - 18, W, 18);
  const gl = x.createLinearGradient(0, 0, W, H);
  gl.addColorStop(0, 'rgba(255,255,255,0.18)');
  gl.addColorStop(0.4, 'rgba(255,255,255,0)');
  gl.addColorStop(1, 'rgba(255,255,255,0.08)');
  x.fillStyle = gl;
  x.fillRect(0, 0, W, H);
  return tex(c, true, false);
}

/** A roll-up shutter: corrugated steel, rust at the foot, a throw-up and tags across it. */
export function shutterTex(seed: number) {
  const W = 512, H = 480;
  const rng = new RNG(seed);
  const [c, x] = canvas(W, H);
  for (let y = 0; y < H; y += 12) {
    const g = x.createLinearGradient(0, y, 0, y + 12);
    g.addColorStop(0, '#8a8e92');
    g.addColorStop(0.5, '#5a5e62');
    g.addColorStop(1, '#3a3e42');
    x.fillStyle = g;
    x.fillRect(0, y, W, 12);
  }
  const rg = x.createLinearGradient(0, H, 0, H * 0.6);
  rg.addColorStop(0, 'rgba(110,50,20,0.7)');
  rg.addColorStop(1, 'rgba(110,50,20,0)');
  x.fillStyle = rg;
  x.fillRect(0, 0, W, H);
  throwUp(x, rng, 'GBK', W * 0.5, H * 0.5, H * 0.32);
  for (let i = 0; i < 9; i++) tag(x, rng, rng.next() * W * 0.8, H * (0.15 + rng.next() * 0.75), 18 + rng.next() * 22);
  return tex(c, true, false);
}

/** Chain-link mesh (alpha-tested), with rust. */
export function chainLinkTex() {
  const S = 128;
  const [c, x] = canvas(S, S);
  x.clearRect(0, 0, S, S);
  x.strokeStyle = '#a8acb0';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(0, 0);
  x.lineTo(S, S);
  x.moveTo(S, 0);
  x.lineTo(0, S);
  x.moveTo(-S / 2, S / 2);
  x.lineTo(S / 2, S * 1.5);
  x.moveTo(S / 2, -S / 2);
  x.lineTo(S * 1.5, S / 2);
  x.moveTo(S / 2, -S / 2);
  x.lineTo(-S / 2, S / 2);
  x.moveTo(S * 1.5, S / 2);
  x.lineTo(S / 2, S * 1.5);
  x.stroke();
  return tex(c);
}

// ============================================================================ build
/**
 * THE ALLEY: a back-lot where three alleys meet behind tenements - every wall layered with
 * graffiti, dumpsters, a burnt-out car, garbage, power lines sagging overhead, a fire in an oil drum,
 * steam from the sewer, a sodium streetlight at the mouth onto the street.
 */
export function buildAlley(a: Arena, blood: BloodAtlas, pointLights: number, shadowMapSize: number): MapParts {
  const k = new MapKit(a, blood, pointLights, shadowMapSize);
  const g = k.g;
  const rng = new RNG(1313);
  const hi = blood.size >= 4096;
  const up = k.up;

  // ---------------------------------------------------------------------- the look
  a.fog = { color: 0x0b0d13, density: 0.026 };
  const sky = skyTexture(11);
  a.background = sky;
  a.farPlane = 240;
  a.camBounds = { out: -0.35, maxY: 8.5, walls: false };
  a.drains = [[2.2, 0.6], [-8.5, 9.6], [9.6, -9.7]];
  a.propSpots = { drums: [[-11.3, 6.2], [-10.6, 7.0]], crates: [] };

  // ---------------------------------------------------------------------- materials
  const brickA = brickTex(71, 'red');
  const brickB = brickTex(73, 'brown');
  const block = blockTex(75, '#8a948a', '#3a4a40');
  const asphalt = asphaltTex(77);
  const iron = new THREE.MeshStandardMaterial({ color: 0x1e2022, metalness: 0.65, roughness: 0.5 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x5a3020, metalness: 0.3, roughness: 0.8 });
  const darkBox = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1, side: THREE.BackSide });

  // ---------------------------------------------------------------------- floor
  {
    const ppm = hi ? 80 : 56;
    const W = Math.round(HALF_W * 2 * ppm), H = Math.round(HALF_D * 2 * ppm);
    const [oc, ox] = canvas(W, H);
    const [rc, rx] = canvas(W, H);
    paintAlleyFloor(ox, rx, rng, W, H, ppm, a.drains);
    const mat = new THREE.MeshStandardMaterial({ map: asphalt.map, normalMap: asphalt.normal, normalScale: new THREE.Vector2(0.4, 0.4), roughnessMap: tex(rc, false, false), roughness: 1, color: 0xb8b6b4, envMapIntensity: 0.85 });
    mat.roughnessMap!.channel = 1;
    blood.patchMaterial(mat, { overlay: tex(oc, true, false) });
    const floor = k.floor(mat, [4, 4], true);
    floor.geometry.setAttribute('uv1', (floor.geometry.attributes.ovUv as THREE.BufferAttribute).clone());
  }

  // ---------------------------------------------------------------------- walls
  const ppmW = hi ? 110 : 76;
  type WallDef = { origin: THREE.Vector3; u: THREE.Vector3; len: number; height: number; tex: { map: THREE.Texture; normal: THREE.Texture }; color: number; doors: { at: number; w: number; h: number }[]; avoid?: [number, number, number, number][]; pieces?: number; buff: string };
  const OVH = 4.6;
  const walls: WallDef[] = [
    // north: the tenement with the fire escape; two back doors
    { origin: new THREE.Vector3(-HALF_W, 0, -HALF_D), u: new THREE.Vector3(1, 0, 0), len: HALF_W * 2, height: 13, tex: brickA, color: 0xc8b8ac, doors: [{ at: 8, w: 1.3, h: 2.3 }, { at: 19, w: 1.5, h: 2.4 }], avoid: [[3.5, 0.9, 4.3, 2.0]], pieces: 6, buff: '#6e5a50' },
    // south: painted block, a roll-up shutter, a steel door
    { origin: new THREE.Vector3(HALF_W, 0, HALF_D), u: new THREE.Vector3(-1, 0, 0), len: HALF_W * 2, height: 9.5, tex: block, color: 0xffffff, doors: [{ at: 17, w: 1.3, h: 2.3 }], avoid: [[4.4, 0, 7.8, 3.2]], pieces: 5, buff: '#7a8478' },
    // east: two building corners either side of the mouth onto the street
    { origin: new THREE.Vector3(HALF_W, 0, -HALF_D), u: new THREE.Vector3(0, 0, 1), len: HALF_D * 2, height: 11, tex: brickB, color: 0xb8a89c, doors: [{ at: HALF_D, w: 5, h: 99 }], pieces: 3, buff: '#5a4a44' },
  ];
  const paintGeos: { geo: THREE.BufferGeometry[]; mat: THREE.MeshStandardMaterial }[] = [];
  const plainBy = new Map<THREE.MeshStandardMaterial, THREE.BufferGeometry[]>();
  for (const [wi, w] of walls.entries()) {
    // the street art on this wall
    const [ac, ax] = canvas(Math.round(w.len * ppmW), Math.round(OVH * ppmW));
    const avoid: [number, number, number, number][] = [...(w.avoid ?? [])];
    for (const d of w.doors) avoid.push([d.at - d.w / 2 - 0.15, 0, d.at + d.w / 2 + 0.15, Math.min(d.h + 0.4, OVH)]);
    paintWall(ax, new RNG(900 + wi * 31), w.len, OVH, ppmW, { avoid, pieces: w.pieces, buffColor: w.buff });
    // (a transparent border: the overlay is clamped, everything outside it must be clear)
    ax.clearRect(0, 0, ac.width, 2);
    ax.clearRect(0, 0, 2, ac.height);
    ax.clearRect(ac.width - 2, 0, 2, ac.height);
    const ovTex = tex(ac, true, false);
    ovTex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: w.tex.map, normalMap: w.tex.normal, roughness: 0.9, color: w.color });
    blood.patchMaterial(mat, { overlay: ovTex });
    const res = k.wall({ origin: w.origin, u: w.u, len: w.len, height: w.height, paintH: OVH, tile: [2, 2], doors: w.doors, ov: { h: OVH } });
    paintGeos.push({ geo: res.paint, mat });
    const plainMat = new THREE.MeshStandardMaterial({ map: w.tex.map, normalMap: w.tex.normal, roughness: 0.92, color: w.color });
    plainBy.set(plainMat, res.plain);
  }
  for (const { geo, mat } of paintGeos) {
    const m = new THREE.Mesh(mergeGeometries(geo, false)!, mat);
    m.receiveShadow = true;
    g.add(m);
  }
  for (const [mat, geos] of plainBy) {
    if (!geos.length) continue;
    const m = new THREE.Mesh(mergeGeometries(geos, false)!, mat);
    m.receiveShadow = true;
    g.add(m);
  }
  // dark doorways the enemies come out of
  const doorway = (x: number, z: number, ry: number, w: number, h: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, h + 0.1, 3), darkBox);
    b.position.set(x, h / 2, z);
    b.rotation.y = ry;
    g.add(b);
    // a steel door swung open against the wall inside
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.12, 0.2), iron);
    frame.position.set(x, h + 0.06, z);
    frame.rotation.y = ry;
    k.add(frame);
  };
  doorway(-5, -HALF_D - 1.5, 0, 1.3, 2.3);
  doorway(6, -HALF_D - 1.5, 0, 1.5, 2.4);
  doorway(-4, HALF_D + 1.5, 0, 1.3, 2.3);
  k.door(new THREE.Vector3(-5, 0, -HALF_D), new THREE.Vector3(0, 0, 1), 1.3, 2.2);
  k.door(new THREE.Vector3(6, 0, -HALF_D), new THREE.Vector3(0, 0, 1), 1.5, 2.2);
  k.door(new THREE.Vector3(-4, 0, HALF_D), new THREE.Vector3(0, 0, -1), 1.3, 2.2);
  k.door(new THREE.Vector3(HALF_W, 0, 0), new THREE.Vector3(-1, 0, 0), 4.6, 4.0);
  k.door(new THREE.Vector3(-HALF_W, 0, 0), new THREE.Vector3(1, 0, 0), 2.2, 4.0);
  k.roomWalls(13, [
    { side: 'n', at: -5, w: 1.3 },
    { side: 'n', at: 6, w: 1.5 },
    { side: 's', at: -4, w: 1.3 },
    { side: 'e', at: 0, w: 5 },
    { side: 'w', at: 0, w: 2.4 },
  ]);

  // ---------------------------------------------------------------------- the tenement's face
  const wins = windowAtlas(81);
  const winMat = new THREE.MeshStandardMaterial({ map: wins.map, emissiveMap: wins.emissive, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.1 });
  const winGeos: THREE.BufferGeometry[] = [];
  const addWindow = (cx: number, cy: number, cz: number, ry: number, w: number, h: number, variant: number) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv.array as Float32Array;
    for (let i = 0; i < uv.length; i += 2) uv[i] = (variant + uv[i]) / wins.n;
    geo.rotateY(ry);
    geo.translate(cx, cy, cz);
    winGeos.push(geo);
    // sill and lintel
    const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.08, 0.16), rust);
    sill.position.set(cx, cy - h / 2 - 0.04, cz);
    sill.rotation.y = ry;
    sill.position.addScaledVector(new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)), 0.06);
    k.add(sill);
  };
  for (let fl = 0; fl < 3; fl++) {
    const y = 5.6 + fl * 3;
    for (let i = 0; i < 8; i++) {
      const x = -11.4 + i * 3.25;
      addWindow(x, y, -HALF_D + 0.03, 0, 1.2, 1.55, Math.floor(rng.next() * wins.n));
    }
    for (let i = 0; i < 7; i++) {
      const x = 10.8 - i * 3.6;
      if (fl === 2) continue;
      addWindow(x, y, HALF_D - 0.03, Math.PI, 1.3, 1.5, Math.floor(rng.next() * wins.n));
    }
  }
  for (const [z, ry] of [[-6.5, -Math.PI / 2], [6.8, -Math.PI / 2]] as [number, number][]) for (let fl = 0; fl < 3; fl++) addWindow(HALF_W - 0.03, 5.6 + fl * 3, z, ry, 1.2, 1.5, Math.floor(rng.next() * wins.n));
  {
    const m = new THREE.Mesh(mergeGeometries(winGeos, false)!, winMat);
    g.add(m);
  }
  // ground-floor windows on the south side, barred
  for (const x of [9.6, -9.4]) {
    addWindowBars(k, iron, x, 1.6, HALF_D - 0.03, Math.PI, 1.1, 1.0);
  }
  // fire escape on the north wall
  fireEscape(k, iron, 0.2, 7.8, -HALF_D);
  // AC boxes, downpipes, meters, a satellite dish, a dangling wire
  const ac = new THREE.MeshStandardMaterial({ color: 0x9a9890, roughness: 0.6, metalness: 0.3 });
  for (const [x, y] of [[-8.15, 4.95], [1.6, 7.95], [8.1, 10.95], [-1.65, 10.95]] as [number, number][]) k.box(0.7, 0.45, 0.55, ac, x, y, -HALF_D + 0.3);
  for (const [x, y] of [[9.6, 4.9], [-2.4, 7.9]] as [number, number][]) k.box(0.7, 0.45, 0.55, ac, x, y, HALF_D - 0.3);
  for (const x of [-12.2, 4.6]) k.cyl(0.07, 0.07, 13, 8, rust, x, 6.5, -HALF_D + 0.12);
  for (const x of [-12.3, 2.0]) k.cyl(0.07, 0.07, 9.5, 8, iron, x, 4.75, HALF_D - 0.12);
  k.box(0.6, 0.85, 0.22, new THREE.MeshStandardMaterial({ color: 0x4a5a4a, roughness: 0.6, metalness: 0.4 }), -9.2, 1.45, -HALF_D + 0.12);
  k.block(-9.2, -HALF_D + 0.12, 0.6, 0.24, 1.9, 'prop', 'meter box');
  // an awning over the shutter, and the shutter itself
  {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 3.1), new THREE.MeshStandardMaterial({ map: shutterTex(83), roughness: 0.5, metalness: 0.55 }));
    sh.position.set(6.95, 1.55, HALF_D - 0.025);
    sh.rotation.y = Math.PI;
    k.add(sh, false);
    k.box(3.6, 0.35, 0.3, iron, 6.95, 3.3, HALF_D - 0.15);
  }

  // ---------------------------------------------------------------------- the fence (west) and the alley beyond it
  {
    const link = chainLinkTex();
    link.repeat.set(9, 1.4);
    const fenceMat = new THREE.MeshStandardMaterial({ map: link, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5, color: 0xb0b4b8 });
    for (const [z0, z1] of [[-HALF_D, -1.2], [1.2, HALF_D]] as [number, number][]) {
      const len = z1 - z0;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.2), fenceMat.clone());
      (f.material as THREE.MeshStandardMaterial).map = link.clone();
      (f.material as THREE.MeshStandardMaterial).map!.repeat.set(len / 1.2, 3.2 / 1.2);
      (f.material as THREE.MeshStandardMaterial).map!.needsUpdate = true;
      f.position.set(-HALF_W, 1.6, (z0 + z1) / 2);
      f.rotation.y = Math.PI / 2;
      k.add(f, true, false);
      for (let z = z0; z <= z1 + 0.01; z += len / Math.max(1, Math.round(len / 2.5))) k.cyl(0.04, 0.04, 3.3, 8, iron, -HALF_W, 1.65, z);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), iron);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(-HALF_W, 3.25, (z0 + z1) / 2);
      k.add(rail);
    }
    // the gate, swung open outward
    const gate = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.0), fenceMat);
    gate.position.set(-HALF_W - 0.9, 1.5, -1.1 - 0.75);
    gate.rotation.y = Math.PI / 2 + 0.95;
    k.add(gate, true, false);
    // razor wire along the top
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 4, 10), iron);
    const coils: THREE.BufferGeometry[] = [];
    for (let z = -HALF_D; z < HALF_D; z += 0.18) {
      if (Math.abs(z) < 1.3) continue;
      const cg = coil.geometry.clone();
      cg.rotateY(Math.PI / 2 + 0.3);
      cg.translate(-HALF_W, 3.45, z);
      coils.push(cg);
    }
    k.add(new THREE.Mesh(mergeGeometries(coils, false)!, iron));
    // beyond: the alley runs on into the dark between two blank walls, a streetlight far down it
    const beyondMat = new THREE.MeshStandardMaterial({ map: asphalt.map, roughness: 0.75, color: 0x6a6866 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 22).rotateX(-Math.PI / 2), beyondMat);
    (ground.material as THREE.MeshStandardMaterial).map = asphalt.map.clone();
    (ground.material as THREE.MeshStandardMaterial).map!.repeat.set(7, 5);
    (ground.material as THREE.MeshStandardMaterial).map!.needsUpdate = true;
    ground.position.set(-HALF_W - 15, -0.005, 0);
    g.add(ground);
    const sideMat = new THREE.MeshStandardMaterial({ map: brickB.map, color: 0x4a4440, roughness: 0.95 });
    for (const zs of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 7), sideMat);
      b.position.set(-HALF_W - 15.5, 6, zs * 7.6);
      g.add(b);
    }
    const far = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(64, 'rgba(255,190,110,1)', 'rgba(255,150,60,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    far.scale.set(3.2, 3.2, 1);
    far.position.set(-HALF_W - 22, 5.5, 2.6);
    g.add(far);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTexture(64, 'rgba(255,170,90,0.55)', 'rgba(255,150,60,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.position.set(-HALF_W - 22, 0.01, 1.5);
    g.add(pool);
  }

  // ---------------------------------------------------------------------- the street (east)
  let neonMats: THREE.MeshBasicMaterial[] = [];
  {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(14, 60).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: asphalt.map.clone(), roughness: 0.6, color: 0x7a7876 }));
    (road.material as THREE.MeshStandardMaterial).map!.repeat.set(3.5, 15);
    (road.material as THREE.MeshStandardMaterial).map!.needsUpdate = true;
    road.position.set(HALF_W + 8.5, -0.02, 0);
    g.add(road);
    // the centre line and the kerb
    for (let z = -28; z < 28; z += 4) k.box(0.15, 0.01, 2, new THREE.MeshBasicMaterial({ color: 0xc8a040 }), HALF_W + 8.5, 0.0, z, 0, false);
    k.box(1.5, 0.15, 60, new THREE.MeshStandardMaterial({ color: 0x6a6a68, roughness: 0.9 }), HALF_W + 0.75, -0.075, 0, 0, false);
    // the building across the street: shop fronts, a liquor store's neon
    const across = new THREE.Mesh(new THREE.BoxGeometry(4, 16, 60), new THREE.MeshStandardMaterial({ map: brickA.map.clone(), color: 0x6a5a54, roughness: 0.9 }));
    (across.material as THREE.MeshStandardMaterial).map!.repeat.set(2, 8);
    (across.material as THREE.MeshStandardMaterial).map!.needsUpdate = true;
    across.position.set(HALF_W + 17.5, 8, 0);
    g.add(across);
    const shopMat = new THREE.MeshBasicMaterial({ map: shopTexture(rng), color: 0xb8aa98 });
    for (const z of [-9, 3, 11]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.4), shopMat);
      s.position.set(HALF_W + 15.48, 1.6, z);
      s.rotation.y = -Math.PI / 2;
      g.add(s);
    }
    const n1 = new THREE.MeshBasicMaterial({ map: neonTexture(['LIQUOR'], '#ff2a5a', 512, 160), toneMapped: false });
    const n2 = new THREE.MeshBasicMaterial({ map: neonTexture(['OPEN 24 HRS'], '#3ac8ff', 512, 128), toneMapped: false });
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), n1);
    s1.position.set(HALF_W + 15.45, 3.8, 3);
    s1.rotation.y = -Math.PI / 2;
    g.add(s1);
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), n2);
    s2.position.set(HALF_W + 15.45, 2.95, -9);
    s2.rotation.y = -Math.PI / 2;
    g.add(s2);
    neonMats = [n1, n2];
    // a parked car under the light
    car(k, HALF_W + 4.2, 6.5, Math.PI / 2, 0x2a3a5a, false);
    // the streetlight
    const pole = k.cyl(0.08, 0.11, 7, 10, iron, HALF_W + 1.8, 3.5, -3.2);
    void pole;
    const arm = k.box(1.6, 0.08, 0.08, iron, HALF_W + 1.1, 6.95, -3.2);
    void arm;
    const head = k.box(0.6, 0.12, 0.3, iron, HALF_W + 0.4, 6.9, -3.2);
    void head;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.22), new THREE.MeshBasicMaterial({ color: 0xffd090 }));
    lamp.position.set(HALF_W + 0.4, 6.83, -3.2);
    g.add(lamp);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(64, 'rgba(255,200,120,1)', 'rgba(255,170,80,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    glow.scale.set(2.6, 2.6, 1);
    glow.position.set(HALF_W + 0.4, 6.75, -3.2);
    g.add(glow);
    k.light({ p: new THREE.Vector3(HALF_W + 0.4, 6.4, -3.2), color: 0xffb860, intensity: 75, distance: 22, priority: 9 });
  }

  // ---------------------------------------------------------------------- the lot: dumpsters, the wreck, junk
  dumpster(k, 2.6, -HALF_D + 0.7, 0, 0x2a5a3a, true, rng);
  dumpster(k, -9.0, HALF_D - 0.7, Math.PI, 0x24406a, false, rng);
  car(k, 7.6, 7.4, 0.08, 0x1a1210, true);
  k.block(7.6, 7.4, 4.4, 2.0, 1.3, 'crate', 'burnt car');
  // a pallet stack and a mattress against the wall
  {
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 });
    for (let i = 0; i < 6; i++) {
      for (const z of [-0.4, 0, 0.4]) k.box(1.2, 0.025, 0.14, wood, -11.2, 0.13 + i * 0.14, -8.5 + z, 0);
      for (const x of [-0.5, 0, 0.5]) k.box(0.1, 0.1, 1.0, wood, -11.2 + x, 0.06 + i * 0.14, -8.5, 0);
    }
    k.block(-11.2, -8.5, 1.25, 1.05, 0.85, 'crate', 'pallets');
    const mat = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 0.95 });
    const mt = k.box(1.4, 1.9, 0.22, mat, -1.4, 0.95, HALF_D - 0.35, 0);
    mt.rotation.x = -0.18;
    k.block(-1.4, HALF_D - 0.3, 1.4, 0.5, 1.8, 'prop', 'mattress');
    // stains on it
    const st = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 1, transparent: true, opacity: 0.6 }));
    st.position.set(-1.2, 1.1, HALF_D - 0.47);
    st.rotation.set(-0.18, Math.PI, 0);
    g.add(st);
  }

  // ---------------------------------------------------------------------- utility poles and power lines
  const wireGeos: THREE.BufferGeometry[] = [];
  const wire = (p0: THREE.Vector3, p1: THREE.Vector3, sag: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const p = p0.clone().lerp(p1, t);
      p.y -= Math.sin(t * Math.PI) * sag;
      pts.push(p);
    }
    wireGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.013, 4, false));
  };
  const poles: [number, number][] = [[-11.9, -10.3], [11.7, 10.2]];
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 });
  for (const [px, pz] of poles) {
    k.cyl(0.13, 0.17, 10.5, 10, wood, px, 5.25, pz);
    k.box(2.2, 0.12, 0.12, wood, px, 9.6, pz, Math.PI / 4);
    k.box(1.6, 0.1, 0.1, wood, px, 8.9, pz, Math.PI / 4);
    k.block(px, pz, 0.34, 0.34, 10.5, 'pillar', 'pole');
  }
  // a transformer drum on the first pole
  k.cyl(0.32, 0.32, 0.9, 14, new THREE.MeshStandardMaterial({ color: 0x6a7068, metalness: 0.5, roughness: 0.5 }), -11.55, 8.2, -9.95);
  const arms = (px: number, pz: number, y: number) => [-0.75, 0, 0.75].map((o) => new THREE.Vector3(px + o * Math.SQRT1_2, y, pz + o * Math.SQRT1_2));
  const aTop = arms(-11.9, -10.3, 9.68), bTop = arms(11.7, 10.2, 9.68);
  for (let i = 0; i < 3; i++) wire(aTop[i], bTop[i], 1.6 + i * 0.15);
  const aLow = arms(-11.9, -10.3, 8.95), bLow = arms(11.7, 10.2, 8.95);
  wire(aLow[0], new THREE.Vector3(-4, 8.2, HALF_D - 0.1), 1.0);
  wire(aLow[2], new THREE.Vector3(1.5, 8.0, HALF_D - 0.1), 1.2);
  wire(bLow[0], new THREE.Vector3(4.5, 10.5, -HALF_D + 0.1), 1.1);
  wire(bLow[2], new THREE.Vector3(-3, 9.8, -HALF_D + 0.1), 1.4);
  wire(new THREE.Vector3(-HALF_W + 0.1, 7.5, -4), new THREE.Vector3(HALF_W - 0.1, 8.8, 4.5), 1.8);
  wire(new THREE.Vector3(-HALF_W + 0.1, 10, 6), new THREE.Vector3(HALF_W - 0.1, 7.2, -7), 1.3);
  {
    const m = new THREE.Mesh(mergeGeometries(wireGeos, false)!, new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6 }));
    m.castShadow = true;
    g.add(m);
  }
  // a pair of sneakers thrown over the line
  {
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.7 });
    for (const dx of [-0.12, 0.12]) {
      const s = k.box(0.1, 0.1, 0.28, shoeMat, 0.6 + dx, 7.1, 0.35);
      s.rotation.z = dx * 2;
      k.cyl(0.003, 0.003, 0.9, 3, iron, 0.6 + dx * 0.5, 7.6, 0.35, false);
    }
  }

  // ---------------------------------------------------------------------- the fire in the drum
  const fireAt = new THREE.Vector3(-5.6, 0, 2.4);
  {
    const drum = k.cyl(0.3, 0.3, 0.9, 14, new THREE.MeshStandardMaterial({ color: 0x3a2418, metalness: 0.4, roughness: 0.85 }), fireAt.x, 0.45, fireAt.z);
    void drum;
    k.block(fireAt.x, fireAt.z, 0.62, 0.62, 0.9, 'pillar', 'fire drum');
    // holes punched in it glow
    const holeMat = new THREE.MeshBasicMaterial({ color: 0xff8a30 });
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const h = new THREE.Mesh(new THREE.CircleGeometry(0.035, 8), holeMat);
      h.position.set(fireAt.x + Math.sin(ang) * 0.302, 0.25 + (i % 2) * 0.12, fireAt.z + Math.cos(ang) * 0.302);
      h.rotation.y = ang;
      g.add(h);
    }
  }
  const flameTex = (() => {
    const [c, x] = canvas(64, 128);
    const gr = x.createRadialGradient(32, 96, 2, 32, 80, 60);
    gr.addColorStop(0, 'rgba(255,240,180,1)');
    gr.addColorStop(0.25, 'rgba(255,170,60,0.9)');
    gr.addColorStop(0.6, 'rgba(220,60,10,0.45)');
    gr.addColorStop(1, 'rgba(120,20,0,0)');
    x.fillStyle = gr;
    x.beginPath();
    x.moveTo(32, 2);
    x.quadraticCurveTo(60, 70, 50, 110);
    x.quadraticCurveTo(32, 128, 14, 110);
    x.quadraticCurveTo(4, 70, 32, 2);
    x.fill();
    return tex(c, true, false);
  })();
  const flames: { s: THREE.Sprite; ph: number; ox: number; oz: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    g.add(s);
    flames.push({ s, ph: rng.next() * 10, ox: (rng.next() - 0.5) * 0.3, oz: (rng.next() - 0.5) * 0.3 });
  }
  const EMB = 40;
  const embers = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xffa040, size: 0.04, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: radialTexture(16) }));
  const embP = new Float32Array(EMB * 3), embV = new Float32Array(EMB * 3), embT = new Float32Array(EMB);
  embers.geometry.setAttribute('position', new THREE.BufferAttribute(embP, 3));
  embers.frustumCulled = false;
  g.add(embers);
  let fireLight: THREE.PointLight | null = null;
  k.light({ p: new THREE.Vector3(fireAt.x, 1.3, fireAt.z), color: 0xff7a2a, intensity: 32, distance: 11, decay: 1.6, priority: 10, use: (l) => (fireLight = l) });

  // ---------------------------------------------------------------------- the doors' lights
  {
    const cage = new THREE.MeshBasicMaterial({ color: 0xffd8a0 });
    for (const [x, z, nz] of [[-5, -HALF_D + 0.18, 1], [6, -HALF_D + 0.18, 1]] as [number, number, number][]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), cage);
      b.position.set(x, 2.75, z);
      g.add(b);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(64, 'rgba(255,210,150,1)', 'rgba(255,190,120,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.65 }));
      gl.scale.set(1.1, 1.1, 1);
      gl.position.copy(b.position);
      g.add(gl);
      k.box(0.24, 0.05, 0.2, iron, x, 2.88, z + nz * 0.02);
    }
    k.light({ p: new THREE.Vector3(-5, 2.6, -HALF_D + 0.5), color: 0xffcf90, intensity: 20, distance: 8.5, priority: 7 });
    k.light({ p: new THREE.Vector3(6, 2.6, -HALF_D + 0.5), color: 0xffc080, intensity: 14, distance: 7, priority: 4 });
  }
  // security floodlights high on the walls: the lot's real light, and the paint's
  {
    const housing = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, metalness: 0.6, roughness: 0.4 });
    const lens = new THREE.MeshBasicMaterial({ color: 0xfff4e0 });
    for (const [x, y, z, nz] of [[-3.6, 6.4, -HALF_D, 1], [-7.5, 5.2, HALF_D, -1]] as [number, number, number, number][]) {
      const b = k.box(0.5, 0.32, 0.3, housing, x, y, z + nz * 0.2);
      b.rotation.x = nz * 0.5;
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.24), lens);
      l.position.set(x, y - 0.1, z + nz * 0.36);
      l.rotation.x = nz > 0 ? 0.5 - Math.PI / 2 + Math.PI / 2 : -0.5;
      l.rotation.y = nz > 0 ? 0 : Math.PI;
      g.add(l);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(64, 'rgba(255,246,225,1)', 'rgba(255,236,200,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
      gl.scale.set(1.6, 1.6, 1);
      gl.position.set(x, y - 0.1, z + nz * 0.42);
      g.add(gl);
    }
    k.light({ p: new THREE.Vector3(-3.6, 6.0, -HALF_D + 1.2), color: 0xfff0d8, intensity: 64, distance: 21, priority: 8 });
    k.light({ p: new THREE.Vector3(-7.5, 4.9, HALF_D - 1.2), color: 0xffe8c8, intensity: 42, distance: 16, priority: 7.5 });
  }
  // a fluorescent tube over the south door, on its way out
  const tubeMat = new THREE.MeshBasicMaterial({ color: 0xe0fff4 });
  {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8), tubeMat);
    t.rotation.z = Math.PI / 2;
    t.position.set(-4, 2.75, HALF_D - 0.14);
    g.add(t);
    k.box(1.1, 0.06, 0.1, iron, -4, 2.8, HALF_D - 0.08);
  }
  let tubeLight: THREE.PointLight | null = null;
  k.light({ p: new THREE.Vector3(-4, 2.5, HALF_D - 0.6), color: 0xc8fff0, intensity: 16, distance: 8, priority: 6, use: (l) => (tubeLight = l) });
  k.light({ p: new THREE.Vector3(HALF_W + 14.5, 3.6, 3), color: 0xff3a6a, intensity: 40, distance: 16, priority: 5 });

  // ---------------------------------------------------------------------- steam from the sewer
  const steamTex = radialTexture(64, 'rgba(210,215,225,0.55)', 'rgba(200,205,215,0)');
  const steam: { s: THREE.Sprite; t: number; x: number; z: number }[] = [];
  const steamAt = new THREE.Vector3(-1.6, 0, -2.2);
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, color: 0x8a94a8, transparent: true, depthWrite: false, opacity: 0 }));
    g.add(s);
    steam.push({ s, t: i / 9, x: steamAt.x, z: steamAt.z });
  }

  // ---------------------------------------------------------------------- the city above the rooftops
  const city = buildCity(g, rng, [{ n: 26, r0: 46, r1: 70, top0: 18, top1: 42 }, { n: 22, r0: 75, r1: 110, top0: 30, top1: 70 }], { bottom: -2, tint: 0x9a94a8 });
  const beaconSprites: THREE.Sprite[] = [];
  for (const b of city.beacons) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(32, 'rgba(255,60,40,1)', 'rgba(255,30,20,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.scale.set(2.2, 2.2, 1);
    sp.position.copy(b);
    g.add(sp);
    beaconSprites.push(sp);
  }

  // ---------------------------------------------------------------------- loose junk (dynamic)
  a.propList = [
    { kind: 'trashcan', x: -10.4, z: -9.7 }, { kind: 'trashcan', x: 4.3, z: 10.3 }, { kind: 'trashcan', x: 11.6, z: -5.4 }, { kind: 'trashcan', x: -2.9, z: -10.3 },
    { kind: 'trashbag', x: 1.0, z: -9.7, ry: 0.4 }, { kind: 'trashbag', x: 1.3, z: -9.0, ry: 1.3 }, { kind: 'trashbag', x: 4.2, z: -9.6, ry: 2.2 }, { kind: 'trashbag', x: 4.6, z: -8.9 }, { kind: 'trashbag', x: 3.0, z: -8.85, ry: 0.9 },
    { kind: 'trashbag', x: -10.6, z: 9.4 }, { kind: 'trashbag', x: -7.5, z: 9.7, ry: 1.7 }, { kind: 'trashbag', x: -7.9, z: 9.0, ry: 0.3 }, { kind: 'trashbag', x: 9.2, z: -9.9, ry: 2.6 },
    { kind: 'box', x: 11.5, z: 3.3, ry: 0.1 }, { kind: 'box', x: 11.0, z: 4.0, ry: 0.5 }, { kind: 'box', x: 11.45, z: 3.4, y: 0.4, ry: -0.2 }, { kind: 'box', x: -11.4, z: 3.0, ry: 0.8 }, { kind: 'box', x: 9.4, z: 10.4, ry: 0.2 },
    { kind: 'tire', x: 10.9, z: -8.6 }, { kind: 'tire', x: 10.9, z: -8.6, y: 0.22 }, { kind: 'tire', x: -3.6, z: 9.9, ry: 1 },
    { kind: 'pallet', x: -11.6, z: -6.4, ry: Math.PI / 2 }, { kind: 'pallet', x: 0.6, z: 10.1, ry: 0.15 },
    { kind: 'cone', x: 12.2, z: -2.0 }, { kind: 'cone', x: 12.3, z: 2.2 },
    { kind: 'milkcrate', x: -11.5, z: 1.1 }, { kind: 'milkcrate', x: -11.45, z: 1.15, y: 0.3, ry: 0.3 }, { kind: 'milkcrate', x: 5.0, z: -10.1 }, { kind: 'milkcrate', x: -6.3, z: 3.1, ry: 0.7 },
    { kind: 'bottle', x: -4.9, z: 3.2 }, { kind: 'bottle', x: -5.1, z: 3.5, ry: 1 }, { kind: 'bottle', x: -6.9, z: 1.8 }, { kind: 'bottle', x: -11.0, z: -8.3, y: 0.85 }, { kind: 'bottle', x: -11.3, z: -8.7, y: 0.85 }, { kind: 'bottle', x: -6.3, z: 3.1, y: 0.3 },
    { kind: 'chair', x: -7.2, z: 3.6, ry: 2.4 },
  ];

  // ---------------------------------------------------------------------- lights
  const hemi = k.hemi(0x5e6a88, 0x3c3228, 1.8);
  // the moon from across the rooftops washes the tenement's wall
  const moon = k.key(0x9ab0e0, 1.3, new THREE.Vector3(5, 13, 16), { x: 17, z: 15, far: 60 });
  k.commitLights();

  // ---------------------------------------------------------------------- floor paint (into the blood atlas: AO under things)
  {
    const p = new THREE.Vector3();
    for (const o of a.obstacles) {
      if (o.ghost || o.kind === 'wall') continue;
      const cx = (o.minX + o.maxX) / 2, cz = (o.minZ + o.maxZ) / 2;
      p.set(cx, 0.01, cz);
      blood.splat(p, Math.max(o.maxX - o.minX, o.maxZ - o.minZ) * 0.75, SPLAT.ao, 0.4, up, null, 0, cx);
    }
    for (let x = -HALF_W; x <= HALF_W; x += 0.8)
      for (const z of [-HALF_D + 0.12, HALF_D - 0.12]) {
        p.set(x, 0.01, z);
        blood.splat(p, 0.7, SPLAT.ao, 0.28, up, null, 0, x * z);
      }
  }

  // reflections: the lot, its lights and the city
  k.probe(sky, new THREE.Vector3(0, 1.2, 0));

  // ---------------------------------------------------------------------- life
  let time = 0;
  const _v = new THREE.Vector3();
  const update = (dt: number) => {
    time += dt;
    // fire: flames lick and lean, embers rise, the light breathes
    for (const [i, f] of flames.entries()) {
      const t = time * (3 + i * 0.4) + f.ph;
      const h = 0.55 + Math.sin(t) * 0.18 + Math.sin(t * 2.3) * 0.08;
      f.s.scale.set(0.35 + Math.sin(t * 1.7) * 0.06, h, 1);
      f.s.position.set(fireAt.x + f.ox + Math.sin(t * 0.9) * 0.05, 0.9 + h * 0.42, fireAt.z + f.oz + Math.cos(t * 1.1) * 0.05);
      (f.s.material as THREE.SpriteMaterial).opacity = 0.75 + Math.sin(t * 3.1) * 0.2;
    }
    for (let i = 0; i < EMB; i++) {
      embT[i] -= dt;
      if (embT[i] <= 0) {
        embT[i] = 1 + Math.random() * 1.5;
        embP.set([fireAt.x + (Math.random() - 0.5) * 0.4, 0.95, fireAt.z + (Math.random() - 0.5) * 0.4], i * 3);
        embV.set([(Math.random() - 0.5) * 0.4, 1.0 + Math.random() * 1.2, (Math.random() - 0.5) * 0.4], i * 3);
      }
      embP[i * 3] += (embV[i * 3] + Math.sin(time * 3 + i) * 0.3) * dt;
      embP[i * 3 + 1] += embV[i * 3 + 1] * dt;
      embP[i * 3 + 2] += embV[i * 3 + 2] * dt;
    }
    (embers.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    const fl = fireLight as THREE.PointLight | null;
    if (fl) fl.intensity = 32 * (0.8 + Math.sin(time * 11) * 0.08 + Math.sin(time * 23.7) * 0.07 + Math.sin(time * 5.3) * 0.08);
    // the tube stutters
    const flick = Math.sin(time * 1.3) * Math.sin(time * 7.7) > 0.82 ? (Math.sin(time * 90) > 0 ? 0.15 : 1) : 1;
    tubeMat.color.setScalar(flick).multiply(_tube);
    const tl = tubeLight as THREE.PointLight | null;
    if (tl) tl.intensity = 16 * flick;
    for (const [i, m] of neonMats.entries()) m.color.setScalar(Math.sin(time * 13 + i * 4) * Math.sin(time * 2.1 + i) > 0.9 ? 0.3 : 1);
    // steam
    for (const s of steam) {
      s.t += dt * 0.28;
      if (s.t > 1) s.t -= 1;
      const k2 = s.t;
      s.s.position.set(s.x + Math.sin(time * 0.6 + k2 * 4) * 0.3 * k2, 0.1 + k2 * 3.2, s.z + k2 * 0.6);
      const sc = 0.6 + k2 * 2.4;
      s.s.scale.set(sc, sc, 1);
      (s.s.material as THREE.SpriteMaterial).opacity = Math.sin(k2 * Math.PI) * 0.09;
    }
    for (let i = 0; i < beaconSprites.length; i++) (beaconSprites[i].material as THREE.SpriteMaterial).opacity = Math.max(0, Math.sin(time * 2.2 + i * 1.3)) ** 6;
    void _v;
  };
  const _tube = new THREE.Color(0xe0fff4);

  const dressing = { rain: new THREE.Texture(), beacon: new THREE.Sprite(), beams: new THREE.Mesh(), sparkLamp: null } as Dressing;
  return { moon, hemi, dust: k.noDust(), dressing, update };
}

// ============================================================================ pieces of the set
/** The floor: cracks, tar seams, oil, a drain, a manhole, faded paint, litter, a chalk outline; puddles (roughness). */
function paintAlleyFloor(x: CanvasRenderingContext2D, r2: CanvasRenderingContext2D, rng: RNG, W: number, H: number, ppm: number, drains: [number, number][]) {
  const px = (wx: number) => (wx + HALF_W) * ppm;
  const pz = (wz: number) => (wz + HALF_D) * ppm;
  x.clearRect(0, 0, W, H);
  // ---- roughness base: dry asphalt, damp along the walls, puddles at the drains and in the dips
  r2.fillStyle = 'rgb(205,205,205)';
  r2.fillRect(0, 0, W, H);
  const wet = (wx: number, wz: number, rad: number, v: number) => {
    const gr = r2.createRadialGradient(px(wx), pz(wz), 0, px(wx), pz(wz), rad * ppm);
    gr.addColorStop(0, `rgba(${v},${v},${v},0.95)`);
    gr.addColorStop(0.6, `rgba(${v},${v},${v},0.7)`);
    gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    r2.fillStyle = gr;
    r2.beginPath();
    r2.ellipse(px(wx), pz(wz), rad * ppm, rad * ppm * (0.5 + rng.next() * 0.4), rng.next() * 3, 0, Math.PI * 2);
    r2.fill();
    // standing water is darker
    const gc = x.createRadialGradient(px(wx), pz(wz), 0, px(wx), pz(wz), rad * ppm);
    gc.addColorStop(0, 'rgba(8,10,14,0.35)');
    gc.addColorStop(1, 'rgba(8,10,14,0)');
    x.fillStyle = gc;
    x.fillRect(px(wx) - rad * ppm, pz(wz) - rad * ppm, rad * ppm * 2, rad * ppm * 2);
  };
  for (const [dx, dz] of drains) for (let i = 0; i < 4; i++) wet(dx + (rng.next() - 0.5) * 2, dz + (rng.next() - 0.5) * 1.4, 0.9 + rng.next() * 1.3, 32);
  for (let i = 0; i < 9; i++) wet((rng.next() - 0.5) * 22, (rng.next() - 0.5) * 18, 0.5 + rng.next() * 1.1, 30 + rng.next() * 40);
  r2.strokeStyle = 'rgba(90,90,90,0.6)';
  r2.lineWidth = ppm * 0.6;
  r2.strokeRect(0, 0, W, H);
  // ---- patches of newer asphalt
  for (let i = 0; i < 7; i++) {
    const w = (1 + rng.next() * 3) * ppm, h = (0.8 + rng.next() * 2.4) * ppm;
    const cx = rng.next() * W, cy = rng.next() * H;
    x.fillStyle = `rgba(${rng.next() < 0.5 ? '18,18,20' : '60,60,62'},0.35)`;
    x.fillRect(cx, cy, w, h);
    x.strokeStyle = 'rgba(5,5,5,0.55)';
    x.lineWidth = 3;
    x.strokeRect(cx, cy, w, h);
  }
  // ---- cracks: wandering, branching, some sealed with tar
  const crack = (sx: number, sy: number, ang: number, len: number, w: number, depth: number) => {
    x.strokeStyle = `rgba(6,6,6,${0.55 + rng.next() * 0.3})`;
    x.lineWidth = w;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(sx, sy);
    let cx = sx, cy = sy;
    for (let i = 0; i < len; i++) {
      ang += (rng.next() - 0.5) * 0.9;
      cx += Math.cos(ang) * 6;
      cy += Math.sin(ang) * 6;
      x.lineTo(cx, cy);
      if (depth > 0 && rng.next() < 0.06) {
        x.stroke();
        crack(cx, cy, ang + (rng.next() < 0.5 ? 1 : -1) * (0.6 + rng.next()), len * 0.4, w * 0.6, depth - 1);
        x.strokeStyle = `rgba(6,6,6,${0.55 + rng.next() * 0.3})`;
        x.lineWidth = w;
        x.beginPath();
        x.moveTo(cx, cy);
      }
    }
    x.stroke();
  };
  for (let i = 0; i < 26; i++) crack(rng.next() * W, rng.next() * H, rng.next() * Math.PI * 2, 30 + rng.next() * 60, 1.5 + rng.next() * 1.5, 2);
  for (let i = 0; i < 6; i++) {
    // tar-sealed: a fat glossy black squiggle
    x.strokeStyle = 'rgba(4,4,4,0.85)';
    x.lineWidth = 6 + rng.next() * 4;
    x.beginPath();
    let cx = rng.next() * W, cy = rng.next() * H, ang = rng.next() * 6;
    x.moveTo(cx, cy);
    for (let k = 0; k < 40; k++) {
      ang += (rng.next() - 0.5) * 0.6;
      cx += Math.cos(ang) * 8;
      cy += Math.sin(ang) * 8;
      x.lineTo(cx, cy);
    }
    x.stroke();
  }
  // ---- oil: dark blots, a faint sheen at the rims
  for (let i = 0; i < 18; i++) {
    const cx = rng.next() * W, cy = rng.next() * H, rad = (0.2 + rng.next() * 0.7) * ppm;
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    gr.addColorStop(0, 'rgba(6,6,8,0.7)');
    gr.addColorStop(0.7, 'rgba(10,10,14,0.45)');
    gr.addColorStop(0.85, 'rgba(60,40,80,0.15)');
    gr.addColorStop(1, 'rgba(10,10,14,0)');
    x.fillStyle = gr;
    x.beginPath();
    x.ellipse(cx, cy, rad, rad * (0.5 + rng.next() * 0.5), rng.next() * 3, 0, Math.PI * 2);
    x.fill();
  }
  // ---- the storm drain (the first drain) and a manhole
  {
    const [dx, dz] = drains[0];
    const cx = px(dx), cy = pz(dz);
    x.fillStyle = '#0a0a0a';
    x.fillRect(cx - 0.45 * ppm, cy - 0.3 * ppm, 0.9 * ppm, 0.6 * ppm);
    x.fillStyle = '#4a4a4a';
    for (let i = 0; i < 9; i++) x.fillRect(cx - 0.42 * ppm + i * 0.1 * ppm, cy - 0.27 * ppm, 0.04 * ppm, 0.54 * ppm);
    x.strokeStyle = '#2a2a2a';
    x.lineWidth = 3;
    x.strokeRect(cx - 0.45 * ppm, cy - 0.3 * ppm, 0.9 * ppm, 0.6 * ppm);
    const mx = px(-1.6), my = pz(-2.2), mr = 0.42 * ppm;
    x.fillStyle = '#2a2a2a';
    x.beginPath();
    x.arc(mx, my, mr, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#4e4e4e';
    x.lineWidth = 2;
    for (let rr = mr * 0.25; rr < mr; rr += mr * 0.18) {
      x.beginPath();
      x.arc(mx, my, rr, 0, Math.PI * 2);
      x.stroke();
    }
    for (let i = 0; i < 12; i++) {
      x.beginPath();
      x.moveTo(mx, my);
      x.lineTo(mx + Math.cos((i / 12) * Math.PI * 2) * mr, my + Math.sin((i / 12) * Math.PI * 2) * mr);
      x.stroke();
    }
    x.fillStyle = '#5a5a5a';
    x.font = `700 ${mr * 0.32}px 'Barlow Condensed', sans-serif`;
    x.textAlign = 'center';
    x.fillText('SEWER', mx, my + mr * 0.12);
  }
  // ---- faded paint: a fire lane stripe, NO PARKING at the mouth
  x.fillStyle = 'rgba(200,170,60,0.35)';
  x.fillRect(px(HALF_W - 4.2), pz(-HALF_D + 1.0), 0.12 * ppm, (HALF_D * 2 - 2) * ppm);
  x.save();
  x.translate(px(HALF_W - 2.6), pz(0));
  x.rotate(-Math.PI / 2);
  x.fillStyle = 'rgba(230,230,220,0.4)';
  x.font = `400 ${0.7 * ppm}px 'Anton', Impact, sans-serif`;
  x.textAlign = 'center';
  x.fillText('NO PARKING', 0, 0);
  x.restore();
  // a few tags on the ground
  for (let i = 0; i < 5; i++) tag(x, rng, rng.next() * W, rng.next() * H, (0.18 + rng.next() * 0.2) * ppm, 'rgba(230,230,230,0.5)');
  // ---- a chalk outline, from something that happened here before
  {
    x.save();
    x.translate(px(-3.0), pz(5.6));
    x.rotate(0.6);
    x.strokeStyle = 'rgba(235,235,230,0.32)';
    x.lineWidth = 5;
    x.lineJoin = 'round';
    const s = ppm * 0.9;
    x.beginPath();
    x.arc(0, -0.95 * s, 0.13 * s, 0, Math.PI * 2);
    x.moveTo(-0.1 * s, -0.8 * s);
    x.lineTo(-0.55 * s, -0.55 * s);
    x.lineTo(-0.62 * s, -0.2 * s);
    x.lineTo(-0.48 * s, -0.18 * s);
    x.lineTo(-0.38 * s, -0.48 * s);
    x.lineTo(-0.18 * s, -0.55 * s);
    x.lineTo(-0.2 * s, 0.05 * s);
    x.lineTo(-0.42 * s, 0.75 * s);
    x.lineTo(-0.25 * s, 0.8 * s);
    x.lineTo(0, 0.15 * s);
    x.lineTo(0.18 * s, 0.82 * s);
    x.lineTo(0.36 * s, 0.76 * s);
    x.lineTo(0.2 * s, 0.05 * s);
    x.lineTo(0.2 * s, -0.55 * s);
    x.lineTo(0.55 * s, -0.75 * s);
    x.lineTo(0.62 * s, -0.95 * s);
    x.lineTo(0.48 * s, -1.0 * s);
    x.lineTo(0.1 * s, -0.8 * s);
    x.stroke();
    x.restore();
  }
  // ---- litter: paper, butts, caps, leaves, glass
  for (let i = 0; i < 650; i++) {
    const cx = rng.next() * W, cy = rng.next() * H;
    const k = rng.next();
    if (k < 0.3) {
      x.fillStyle = `rgba(${150 + rng.next() * 40},${140 + rng.next() * 40},${120 + rng.next() * 40},0.6)`;
      x.save();
      x.translate(cx, cy);
      x.rotate(rng.next() * 6);
      x.fillRect(-3, -2, 4 + rng.next() * 6, 3 + rng.next() * 4);
      x.restore();
    } else if (k < 0.55) {
      x.fillStyle = 'rgba(220,210,190,0.8)';
      x.fillRect(cx, cy, 3, 1.2);
      x.fillStyle = 'rgba(190,110,40,0.8)';
      x.fillRect(cx + 3, cy, 1.4, 1.2);
    } else if (k < 0.75) {
      x.fillStyle = `rgba(${90 + rng.next() * 50},${60 + rng.next() * 30},${30},0.6)`;
      x.beginPath();
      x.ellipse(cx, cy, 2 + rng.next() * 3, 1 + rng.next() * 2, rng.next() * 3, 0, Math.PI * 2);
      x.fill();
    } else if (k < 0.9) {
      x.fillStyle = 'rgba(150,160,170,0.45)';
      x.fillRect(cx, cy, 1.2, 1.2);
    } else {
      x.fillStyle = rng.pick(['rgba(200,40,30,0.8)', 'rgba(220,200,60,0.8)', 'rgba(60,120,200,0.8)']);
      x.beginPath();
      x.arc(cx, cy, 1.6, 0, Math.PI * 2);
      x.fill();
    }
  }
  // ---- the margins are wet and dark
  const edge = x.createLinearGradient(0, 0, 0, 0.6 * ppm);
  edge.addColorStop(0, 'rgba(10,10,12,0.45)');
  edge.addColorStop(1, 'rgba(10,10,12,0)');
  x.fillStyle = edge;
  x.fillRect(0, 0, W, 0.6 * ppm);
  const edge2 = x.createLinearGradient(0, H, 0, H - 0.6 * ppm);
  edge2.addColorStop(0, 'rgba(10,10,12,0.45)');
  edge2.addColorStop(1, 'rgba(10,10,12,0)');
  x.fillStyle = edge2;
  x.fillRect(0, H - 0.6 * ppm, W, 0.6 * ppm);
  x.clearRect(0, 0, W, 2);
  x.clearRect(0, H - 2, W, 2);
  x.clearRect(0, 0, 2, H);
  x.clearRect(W - 2, 0, 2, H);
}

/** Security bars on a ground-floor window. */
export function addWindowBars(k: MapKit, iron: THREE.Material, cx: number, cy: number, cz: number, ry: number, w: number, h: number) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.2, metalness: 0.3 }));
  g.position.set(cx, cy, cz);
  g.rotation.y = ry;
  k.g.add(g);
  const n = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
  for (let i = 0; i <= 6; i++) {
    const off = -w / 2 + (i / 6) * w;
    const side = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h + 0.1, 6), iron);
    b.position.set(cx, cy, cz).addScaledVector(side, off).addScaledVector(n, 0.08);
    k.add(b);
  }
  for (const dy of [-h / 2, 0, h / 2]) {
    const b = k.box(w + 0.1, 0.03, 0.03, iron, cx, cy + dy, cz, ry);
    b.position.addScaledVector(n, 0.08);
  }
}

/** A zig-zag fire escape: landings with railings, stairs between them, the drop ladder pulled up. */
export function fireEscape(k: MapKit, iron: THREE.Material, x0: number, x1: number, z: number) {
  const w = x1 - x0, cx = (x0 + x1) / 2;
  const levels = [4.4, 7.4, 10.4];
  for (const y of levels) {
    k.box(w, 0.05, 1.15, iron, cx, y, z + 0.6, 0, true);
    for (const dz of [1.15]) k.box(w, 0.04, 0.04, iron, cx, y + 0.95, z + dz, 0, false);
    k.box(w, 0.03, 0.03, iron, cx, y + 0.5, z + 1.15, 0, false);
    for (let x = x0; x <= x1 + 0.01; x += w / 6) k.box(0.03, 0.95, 0.03, iron, x, y + 0.48, z + 1.15, 0, false);
    for (const x of [x0, x1]) {
      k.box(0.03, 0.95, 1.15, iron, x, y + 0.48, z + 0.6, 0, false);
      // brackets into the wall
      const br = k.box(0.05, 0.05, 1.3, iron, x, y - 0.4, z + 0.55, 0, false);
      br.rotation.x = 0.55;
    }
  }
  // stairs: diagonal stringers with treads
  for (let i = 0; i < levels.length - 1; i++) {
    const ya = levels[i], yb = levels[i + 1];
    const dir = i % 2 === 0 ? 1 : -1;
    const sx0 = dir > 0 ? x0 + 0.5 : x1 - 0.5, sx1 = dir > 0 ? x1 - 1.8 : x0 + 1.8;
    const len = Math.hypot(sx1 - sx0, yb - ya);
    const ang = Math.atan2(yb - ya, sx1 - sx0);
    for (const dz of [0.25, 0.95]) {
      const st = k.box(len, 0.05, 0.04, iron, (sx0 + sx1) / 2, (ya + yb) / 2, z + dz, 0, false);
      st.rotation.z = ang;
    }
    for (let t = 0.05; t < 1; t += 0.09) k.box(0.22, 0.025, 0.72, iron, sx0 + (sx1 - sx0) * t, ya + (yb - ya) * t, z + 0.6, 0, false);
  }
  // the drop ladder, pulled up under the first landing
  for (const dz of [0.4, 0.8]) k.box(0.04, 1.8, 0.04, iron, x1 - 0.6, 3.4, z + dz, 0, false);
  for (let y = 2.6; y < 4.3; y += 0.3) k.box(0.04, 0.03, 0.44, iron, x1 - 0.6, y, z + 0.6, 0, false);
}

/** A dumpster: steel bin with ribs, a lid (open or shut), wheels, stencilled and tagged. */
export function dumpster(k: MapKit, x: number, z: number, ry: number, color: number, open: boolean, rng: RNG) {
  const [c, cx] = canvas(512, 256);
  cx.fillStyle = '#' + new THREE.Color(color).getHexString();
  cx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 600; i++) {
    cx.fillStyle = `rgba(${rng.next() < 0.5 ? '90,50,20' : '0,0,0'},${0.1 + rng.next() * 0.2})`;
    cx.fillRect(rng.next() * 512, rng.next() * 256, 2 + rng.next() * 8, 2 + rng.next() * 5);
  }
  cx.fillStyle = 'rgba(240,240,230,0.85)';
  cx.font = "400 46px 'Anton', Impact, sans-serif";
  cx.fillText('NO DUMPING', 120, 90);
  for (let i = 0; i < 6; i++) tag(cx, rng, 20 + rng.next() * 400, 140 + rng.next() * 100, 24 + rng.next() * 26);
  throwUp(cx, rng, 'OZ', 380, 150, 70);
  const side = new THREE.MeshStandardMaterial({ map: tex(c, true, false), roughness: 0.6, metalness: 0.35 });
  const plain = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.35 });
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = ry;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 1.15), [plain, plain, plain, plain, side, plain]);
  body.position.y = 0.67;
  grp.add(body);
  for (const dx of [-0.6, 0, 0.6]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 1.19), plain);
    rib.position.set(dx, 0.67, 0);
    grp.add(rib);
  }
  for (const [dx, dz] of [[-0.8, -0.45], [0.8, -0.45], [-0.8, 0.45], [0.8, 0.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }));
    w.rotation.x = Math.PI / 2;
    w.position.set(dx, 0.07, dz);
    grp.add(w);
  }
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.04, 1.2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 }));
  if (open) {
    lid.position.set(0, 1.25 + 0.55, -0.62);
    lid.rotation.x = -1.35;
  } else lid.position.set(0, 1.24, 0);
  grp.add(lid);
  if (open) {
    // garbage heaped inside
    const heap = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 6), new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.3 }));
    heap.scale.set(1.9, 0.6, 1.1);
    heap.position.set(0.1, 1.2, 0);
    grp.add(heap);
  }
  k.add(grp);
  const w = Math.abs(Math.cos(ry)) > 0.5 ? 1.95 : 1.2, d = Math.abs(Math.cos(ry)) > 0.5 ? 1.2 : 1.95;
  k.block(x, z, w, d, 1.25, 'crate', 'dumpster');
}

/** A low-poly sedan: whole, or burnt out to the shell. */
export function car(k: MapKit, x: number, z: number, ry: number, color: number, burnt: boolean) {
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = ry;
  const paint = burnt ? new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.95, metalness: 0.2 }) : new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.6, envMapIntensity: 1.5 });
  const rustM = new THREE.MeshStandardMaterial({ color: 0x5a2a14, roughness: 1 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.05, metalness: 0.5 });
  const lower = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.62, 1.78), paint);
  lower.position.y = burnt ? 0.42 : 0.62;
  grp.add(lower);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 1.6), burnt ? paint : glass);
  cab.position.set(-0.25, lower.position.y + 0.58, 0);
  grp.add(cab);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 1.58), paint);
  roof.position.set(-0.25, lower.position.y + 0.88, 0);
  grp.add(roof);
  if (burnt) {
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.4 + Math.random() * 0.8, 0.02, 0.3 + Math.random() * 0.5), rustM);
      r.position.set(-1.8 + Math.random() * 3.6, lower.position.y + 0.32, -0.6 + Math.random() * 1.2);
      grp.add(r);
    }
  } else {
    for (const s of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: s > 0 ? 0xfff0d0 : 0x801010 }));
      hl.position.set(s * 2.16, 0.72, 0.55);
      grp.add(hl);
      const hl2 = hl.clone();
      hl2.position.z = -0.55;
      grp.add(hl2);
    }
  }
  for (const [dx, dz] of [[-1.35, -0.85], [1.35, -0.85], [-1.35, 0.85], [1.35, 0.85]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(burnt ? 0.28 : 0.33, burnt ? 0.28 : 0.33, 0.22, 14), new THREE.MeshStandardMaterial({ color: burnt ? 0x3a2a20 : 0x111111, roughness: 0.9 }));
    w.rotation.x = Math.PI / 2;
    w.position.set(dx, burnt ? 0.2 : 0.33, dz);
    grp.add(w);
  }
  k.add(grp);
}
