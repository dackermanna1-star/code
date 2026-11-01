import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HALF_D, HALF_W, paintQuad } from './arena';
import type { Arena } from './arena';
import { BloodAtlas, SPLAT } from './bloodAtlas';
import type { Dressing } from './dressing';
import { concreteTexture, radialTexture } from './textures';
import { RNG } from '../core/math';

// ============================================================================ textures
function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}
function tex(c: HTMLCanvasElement, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Grey PVC roof membrane: overlapping sheets, welded seams, patches, grit. Tiles every few metres. */
function roofTexture(seed: number) {
  const S = 1024;
  const rng = new RNG(seed);
  const [c, x] = canvas(S, S);
  x.fillStyle = '#6c6e75';
  x.fillRect(0, 0, S, S);
  // sheet tones
  for (let i = 0; i < 6; i++) {
    const v = 98 + rng.next() * 22;
    x.fillStyle = `rgba(${v},${v + 1},${v + 6},0.45)`;
    x.fillRect(0, (i / 6) * S, S, S / 6 + 2);
  }
  // welded seams: a dark lap line with a lighter bead
  for (let i = 0; i <= 6; i++) {
    const y = (i / 6) * S + (rng.next() - 0.5) * 4;
    x.strokeStyle = 'rgba(40,40,46,0.55)';
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(0, y);
    for (let px = 0; px <= S; px += 64) x.lineTo(px, y + Math.sin(px * 0.02 + i) * 1.5);
    x.stroke();
    x.strokeStyle = 'rgba(150,150,158,0.35)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, y + 4);
    for (let px = 0; px <= S; px += 64) x.lineTo(px, y + 4 + Math.sin(px * 0.02 + i) * 1.5);
    x.stroke();
  }
  // patches (squares of newer membrane) and streaky grime
  for (let i = 0; i < 10; i++) {
    const v = 80 + rng.next() * 40;
    x.fillStyle = `rgba(${v},${v},${v + 5},0.55)`;
    const w = 50 + rng.next() * 150, h = 40 + rng.next() * 110, px = rng.next() * S, py = rng.next() * S;
    x.fillRect(px, py, w, h);
    x.strokeStyle = 'rgba(50,50,56,0.5)';
    x.lineWidth = 2;
    x.strokeRect(px, py, w, h);
  }
  for (let i = 0; i < 70; i++) {
    x.fillStyle = `rgba(30,28,30,${0.04 + rng.next() * 0.08})`;
    x.beginPath();
    x.ellipse(rng.next() * S, rng.next() * S, 20 + rng.next() * 90, 6 + rng.next() * 20, rng.next() * 3, 0, Math.PI * 2);
    x.fill();
  }
  // grit
  for (let i = 0; i < 16000; i++) {
    const v = 50 + rng.next() * 120;
    x.fillStyle = `rgba(${v},${v},${v + 4},${0.12 + rng.next() * 0.3})`;
    const s = 1 + rng.next() * 2;
    x.fillRect(rng.next() * S, rng.next() * S, s, s);
  }
  return tex(c);
}

/**
 * Where the rain stands, over the whole roof (uv1): a slick film everywhere, broad pools at the
 * drains and the low spots, wet margins along the parapet. Green channel = roughness.
 */
function puddleTexture(seed: number, drains: [number, number][]) {
  const W = 1024, H = Math.round((1024 * HALF_D) / HALF_W);
  const rng = new RNG(seed);
  const [c, r] = canvas(W, H);
  const px = (x: number) => ((x + HALF_W) / (2 * HALF_W)) * W;
  const pz = (z: number) => ((z + HALF_D) / (2 * HALF_D)) * H;
  const m = W / (2 * HALF_W); // pixels per metre
  r.fillStyle = 'rgb(96,96,96)';
  r.fillRect(0, 0, W, H);
  const blob = (x: number, z: number, rad: number, v: number, a: number) => {
    const g = r.createRadialGradient(px(x), pz(z), 0, px(x), pz(z), rad * m);
    g.addColorStop(0, `rgba(${v},${v},${v},${a})`);
    g.addColorStop(0.6, `rgba(${v},${v},${v},${a * 0.8})`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    r.fillStyle = g;
    r.beginPath();
    r.ellipse(px(x), pz(z), rad * m, rad * m * (0.55 + rng.next() * 0.4), rng.next() * 3, 0, Math.PI * 2);
    r.fill();
  };
  // drier crowns
  for (let i = 0; i < 26; i++) blob((rng.next() - 0.5) * HALF_W * 2, (rng.next() - 0.5) * HALF_D * 2, 1 + rng.next() * 2.4, 140, 0.45);
  // margins along the parapet
  r.strokeStyle = 'rgba(40,40,40,0.65)';
  r.lineWidth = 0.5 * m;
  r.strokeRect(0.15 * m, 0.15 * m, W - 0.3 * m, H - 0.3 * m);
  const pools: [number, number, number][] = [];
  const pool = (x: number, z: number, rad: number) => {
    pools.push([x, z, rad]);
    const n = 4 + Math.floor(rng.next() * 4);
    for (let b = 0; b < n; b++) blob(x + (rng.next() - 0.5) * rad * 1.2, z + (rng.next() - 0.5) * rad * 0.9, rad * (0.45 + rng.next() * 0.45), 18, 0.95);
  };
  for (const [x, z] of drains) pool(x * 0.93, z * 0.93, 2.0 + rng.next() * 0.8);
  for (const [x, z, rad] of [[-4.2, 2.8, 1.4], [5.4, -1.6, 1.1], [-7.4, -1.2, 1.0], [1.2, -6.6, 1.2], [8.6, 1.4, 0.8], [-1.6, 8.0, 1.0]] as [number, number, number][]) pool(x, z, rad);
  const t = tex(c, false, false);
  t.channel = 1;
  return { map: t, pools };
}
/** A city block face at night: a grid of windows, some lit (warm, cold, television blue). */
function facadeTexture(seed: number, tone: string) {
  const W = 256, H = 512;
  const rng = new RNG(seed);
  const [c, x] = canvas(W, H);
  x.fillStyle = tone;
  x.fillRect(0, 0, W, H);
  const cols = 6 + Math.floor(rng.next() * 4), rows = 16 + Math.floor(rng.next() * 8);
  const cw = W / cols, rh = H / rows;
  const lit = 0.1 + rng.next() * 0.2;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const on = rng.next() < lit;
      const k = rng.next();
      x.fillStyle = on ? (k < 0.6 ? `rgba(255,${190 + rng.next() * 40},${110 + rng.next() * 50},${0.7 + rng.next() * 0.3})` : k < 0.85 ? 'rgba(200,225,255,0.85)' : 'rgba(110,150,255,0.9)') : `rgba(10,12,18,${0.85})`;
      x.fillRect(i * cw + cw * 0.18, j * rh + rh * 0.2, cw * 0.64, rh * 0.55);
    }
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Glowing tube lettering on black (the bloom pass does the halo). */
function neonTexture(lines: string[], color: string, w = 1024, h = 320) {
  const [c, x] = canvas(w, h);
  x.fillStyle = '#05040a';
  x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(80,70,90,0.6)';
  x.lineWidth = 6;
  x.strokeRect(10, 10, w - 20, h - 20);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const fs0 = Math.floor((h * 0.72) / lines.length);
  lines.forEach((l, i) => {
    // a smaller second line, every line fitted to the frame
    let fs = i === 0 ? fs0 * 1.15 : fs0 * 0.7;
    x.font = `800 ${fs}px "Arial Black", Impact, sans-serif`;
    const tw = x.measureText(l).width;
    if (tw > w * 0.88) fs *= (w * 0.88) / tw;
    x.font = `800 ${fs}px "Arial Black", Impact, sans-serif`;
    const y = h * (lines.length === 1 ? 0.5 : i === 0 ? 0.36 : 0.76);
    x.shadowColor = color;
    x.shadowBlur = 28;
    x.fillStyle = color;
    x.fillText(l, w / 2, y);
    x.shadowBlur = 6;
    x.fillStyle = '#ffffff';
    x.globalAlpha = 0.65;
    x.fillText(l, w / 2, y);
    x.globalAlpha = 1;
  });
  return tex(c, true, false);
}

/**
 * Night sky over a city in the rain: a low overcast lit from below - dull violet overhead, a hot
 * magenta-amber glow at the horizon - with torn cloud base drifting through it.
 */
function skyTexture(seed: number) {
  const W = 1024, H = 512;
  const rng = new RNG(seed);
  const [c, x] = canvas(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b0913');
  g.addColorStop(0.3, '#151022');
  g.addColorStop(0.44, '#2a1732');
  g.addColorStop(0.495, '#56283e');
  g.addColorStop(0.51, '#3e1e2c');
  g.addColorStop(0.56, '#150c12');
  g.addColorStop(1, '#060407');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  // cloud base: soft lumps, brighter (city-lit) toward the horizon
  for (let i = 0; i < 260; i++) {
    const y = H * (0.08 + Math.pow(rng.next(), 0.6) * 0.4);
    const k = y / (H * 0.5);
    const cx = rng.next() * W, rw = 30 + rng.next() * 140, rh = 6 + rng.next() * 18 * k;
    const lum = 16 + k * k * 46;
    for (const ox of [0, W, -W]) {
      const cg = x.createRadialGradient(cx + ox, y, 0, cx + ox, y, rw);
      cg.addColorStop(0, `rgba(${lum * 1.15},${lum * 0.8},${lum * 1.25},${0.08 + rng.next() * 0.1})`);
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = cg;
      x.beginPath();
      x.ellipse(cx + ox, y, rw, rh, 0, 0, Math.PI * 2);
      x.fill();
    }
  }
  const t = tex(c, true, false);
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

// ============================================================================ build
export interface RooftopParts {
  moon: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  dust: THREE.Points;
  dressing: Dressing;
  update: (dt: number) => void;
}

/**
 * THE ROOFTOP: a tarred roof in the rain, high over a neon city. Same footprint as the warehouse
 * floor (the blood atlas, the AI and the camera all keep their bearings), but its edge is a knee-high
 * parapet - and beyond it, nothing: a body sent over it is gone for good.
 */
export function buildRooftop(a: Arena, blood: BloodAtlas, pointLights: number, shadowMapSize: number): RooftopParts {
  const g = a.group;
  const rng = new RNG(7311);
  const S = blood.size;
  const floorDensity = S >= 4096 ? 96 : 52;
  const up = new THREE.Vector3(0, 1, 0);
  const add = <T extends THREE.Object3D>(o: T, cast = true, recv = true) => {
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.castShadow = cast;
        m.receiveShadow = recv;
      }
    });
    g.add(o);
    return o;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0, cast = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    return add(m, cast);
  };

  // ---------------------------------------------------------------------- the look
  a.fog = { color: 0x120d18, density: 0.022 };
  const sky = skyTexture(3);
  a.background = sky;
  a.groundRect = { minX: -HALF_W - 0.4, maxX: HALF_W + 0.4, minZ: -HALF_D - 0.4, maxZ: HALF_D + 0.4 };
  a.drains = [[-11.6, -9.4], [11.6, 9.3], [-11.4, 9.2], [11.4, -9.2]];
  a.propSpots = {
    drums: [[-11.0, -3.6], [-10.3, -4.4], [10.9, 7.9], [3.7, -9.9], [-4.3, 9.7], [11.6, -4.4]],
    crates: [[11.1, -8.4, 0], [10.3, -9.2, 0], [10.7, -8.8, 0.75], [-11.4, 3.7, 0], [-3.2, -10.1, 0]],
  };

  // ---------------------------------------------------------------------- roof
  const roofMap = roofTexture(91);
  roofMap.repeat.set(3, 3);
  const wet = puddleTexture(57, a.drains);
  const roofMat = new THREE.MeshStandardMaterial({ map: roofMap, roughnessMap: wet.map, roughness: 1, metalness: 0.0, color: 0xc4c2cc, envMapIntensity: 1.5 });
  blood.patchMaterial(roofMat);
  const floorGeo = paintQuad(blood, new THREE.Vector3(-HALF_W, 0, HALF_D), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), HALF_W * 2, HALF_D * 2, [8.7, 7.3], 'floor', floorDensity, 8, 8);
  {
    // whole-roof uv for the standing water (canvas x = world x, canvas y = world z)
    const pos = floorGeo.attributes.position as THREE.BufferAttribute;
    const uv1 = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv1[i * 2] = (pos.getX(i) + HALF_W) / (2 * HALF_W);
      uv1[i * 2 + 1] = 1 - (pos.getZ(i) + HALF_D) / (2 * HALF_D);
    }
    floorGeo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  }
  const floor = new THREE.Mesh(floorGeo, roofMat);
  floor.receiveShadow = true;
  floor.name = 'floor';
  g.add(floor);

  // ---------------------------------------------------------------------- parapet (knee high, with entrances)
  const PH = 0.95, PT = 0.38;
  const conc = concreteTexture(17);
  const parMat = new THREE.MeshStandardMaterial({ map: conc, roughness: 0.75, color: 0x8d8a92, envMapIntensity: 1.2 });
  blood.patchMaterial(parMat);
  const copeMat = new THREE.MeshStandardMaterial({ color: 0x9a979e, roughness: 0.45, metalness: 0.1, envMapIntensity: 1.4 });
  const parGeos: THREE.BufferGeometry[] = [];
  const doorLights: THREE.Vector3[] = [];
  type Side = { name: string; o: THREE.Vector3; u: THREE.Vector3; len: number; gap: [number, number]; out: THREE.Vector3 };
  const sides: Side[] = [
    { name: 'north', o: new THREE.Vector3(HALF_W, 0, -HALF_D), u: new THREE.Vector3(-1, 0, 0), len: HALF_W * 2, gap: [HALF_W - 1.3, HALF_W + 1.3], out: new THREE.Vector3(0, 0, -1) },
    { name: 'south', o: new THREE.Vector3(-HALF_W, 0, HALF_D), u: new THREE.Vector3(1, 0, 0), len: HALF_W * 2, gap: [HALF_W - 1.3, HALF_W + 1.3], out: new THREE.Vector3(0, 0, 1) },
    { name: 'east', o: new THREE.Vector3(HALF_W, 0, HALF_D), u: new THREE.Vector3(0, 0, -1), len: HALF_D * 2, gap: [HALF_D - 1.1, HALF_D + 1.1], out: new THREE.Vector3(1, 0, 0) },
    { name: 'west', o: new THREE.Vector3(-HALF_W, 0, -HALF_D), u: new THREE.Vector3(0, 0, 1), len: HALF_D * 2, gap: [HALF_D - 1.1, HALF_D + 1.1], out: new THREE.Vector3(-1, 0, 0) },
  ];
  for (const sd of sides) {
    for (const [u0, u1] of [[0, sd.gap[0]], [sd.gap[1], sd.len]] as [number, number][]) {
      const len = u1 - u0;
      const o = sd.o.clone().addScaledVector(sd.u, u0);
      // inner face (paintable: blood sprays and smears up the parapet)
      parGeos.push(paintQuad(blood, o, sd.u, up, len, PH, [3, 3], 'wall', floorDensity * 0.45, Math.max(1, Math.round(len / 3)), 1));
      // body and coping
      const mid = o.clone().addScaledVector(sd.u, len / 2).addScaledVector(sd.out, PT / 2);
      const ry = Math.atan2(-sd.u.z, sd.u.x);
      const body = new THREE.Mesh(new THREE.BoxGeometry(len, PH, PT - 0.02), parMat);
      body.position.copy(mid).setY(PH / 2);
      body.position.addScaledVector(sd.out, 0.01);
      body.rotation.y = ry;
      add(body);
      const cope = new THREE.Mesh(new THREE.BoxGeometry(len + 0.04, 0.07, PT + 0.12), copeMat);
      cope.position.copy(mid).setY(PH + 0.035);
      cope.rotation.y = ry;
      add(cope);
      // collision: a ledge (the AI and the camera treat it as a wall; bodies can go over it)
      const p0 = o.clone(), p1 = o.clone().addScaledVector(sd.u, len).addScaledVector(sd.out, PT);
      a.obstacles.push({ minX: Math.min(p0.x, p1.x), maxX: Math.max(p0.x, p1.x), minZ: Math.min(p0.z, p1.z), maxZ: Math.max(p0.z, p1.z), h: PH, kind: 'ledge', name: 'parapet-' + sd.name });
    }
    // the way in through this gap
    const mid = sd.o.clone().addScaledVector(sd.u, (sd.gap[0] + sd.gap[1]) / 2);
    const inward = sd.out.clone().negate();
    const stairs = sd.name === 'east' || sd.name === 'west';
    // through the stair hut's door, or up the fire escape's last flight onto its landing
    const outP = mid.clone().addScaledVector(sd.out, stairs ? 3.0 : 2.3);
    const inP = mid.clone().addScaledVector(inward, 1.6);
    a.doors.push({ x: outP.x, z: outP.z, ix: inP.x, iz: inP.z, yaw: Math.atan2(inward.x, inward.z), width: sd.gap[1] - sd.gap[0], climb: stairs ? 0 : 1.5 });
    // a gate nobody sees across the gap: fighters stay on the roof (entrants walk through it,
    // bodies and blood fly through it)
    const g0 = sd.o.clone().addScaledVector(sd.u, sd.gap[0]), g1 = sd.o.clone().addScaledVector(sd.u, sd.gap[1]).addScaledVector(sd.out, PT);
    a.obstacles.push({ minX: Math.min(g0.x, g1.x), maxX: Math.max(g0.x, g1.x), minZ: Math.min(g0.z, g1.z), maxZ: Math.max(g0.z, g1.z), h: 0.9, kind: 'wall', name: 'gate', ghost: true });
    if (stairs) stairHousing(mid, sd.out, sd.u);
    else fireEscape(mid, sd.out, sd.u);
  }
  const parapet = new THREE.Mesh(mergeGeometries(parGeos, false)!, parMat);
  parapet.receiveShadow = true;
  g.add(parapet);

  // ---------------------------------------------------------------------- entrances
  function stairHousing(mid: THREE.Vector3, out: THREE.Vector3, u: THREE.Vector3) {
    // a brick hut over the stairwell, its lit doorway facing the roof
    const W = 3.6, D = 3.4, H = 3.1;
    const c = mid.clone().addScaledVector(out, PT + D / 2);
    const ry = Math.atan2(out.x, out.z);
    const hut = new THREE.Group();
    hut.position.copy(c);
    hut.rotation.y = ry;
    const brickMat = new THREE.MeshStandardMaterial({ map: concreteTexture(23), color: 0x6e5a52, roughness: 0.85, envMapIntensity: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 1 });
    // walls (local: +z = out, door on -z)
    const wall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), brickMat);
      m.position.set(x, y, z);
      hut.add(m);
    };
    wall(W, H, 0.25, 0, H / 2, D / 2);
    wall(0.25, H, D, -W / 2, H / 2, 0);
    wall(0.25, H, D, W / 2, H / 2, 0);
    wall((W - 2.3) / 2, H, 0.25, -W / 2 + (W - 2.3) / 4, H / 2, -D / 2);
    wall((W - 2.3) / 2, H, 0.25, W / 2 - (W - 2.3) / 4, H / 2, -D / 2);
    wall(2.3, H - 2.4, 0.25, 0, 2.4 + (H - 2.4) / 2, -D / 2);
    const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.18, D + 0.3), new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.7 }));
    roofSlab.position.set(0, H + 0.09, 0);
    hut.add(roofSlab);
    const inside = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, H - 0.1, D - 0.5), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1, side: THREE.BackSide }));
    inside.position.set(0, H / 2, 0);
    hut.add(inside);
    // a caged bulb over the door
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    bulb.position.set(0, 2.62, -D / 2 - 0.2);
    hut.add(bulb);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(64, 'rgba(255,210,150,1)', 'rgba(255,190,120,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
    glow.scale.set(1.2, 1.2, 1);
    glow.position.copy(bulb.position);
    hut.add(glow);
    add(hut);
    void dark;
    // collision: the hut's walls (kind 'wall': entering enemies pass through its doorway)
    const half = new THREE.Vector3(W / 2, 0, D / 2);
    const ax = Math.abs(out.x) > 0.5;
    const hx = ax ? half.z : half.x, hz = ax ? half.x : half.z;
    a.obstacles.push({ minX: c.x - hx, maxX: c.x + hx, minZ: c.z - hz, maxZ: c.z + hz, h: H, kind: 'wall', name: 'stairs' });
    void u;
    doorLights.push(c.clone().addScaledVector(out, -D / 2 - 0.6).setY(2.4));
  }
  function fireEscape(mid: THREE.Vector3, out: THREE.Vector3, u: THREE.Vector3) {
    // a steel grate landing over the drop, railings, the stair going down
    const iron = new THREE.MeshStandardMaterial({ color: 0x24262a, metalness: 0.7, roughness: 0.45, envMapIntensity: 1.3 });
    const ry = Math.atan2(out.x, out.z);
    const grp = new THREE.Group();
    grp.position.copy(mid).addScaledVector(out, PT);
    grp.rotation.y = ry;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.06, 2.0), iron);
    deck.position.set(0, -0.03, 1.0);
    grp.add(deck);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 2.0), iron);
      rail.position.set(s * 1.45, 1.0, 1.0);
      grp.add(rail);
      for (const z of [0.05, 1.0, 1.95]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), iron);
        post.position.set(s * 1.45, 0.5, z);
        grp.add(post);
      }
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.05, 0.05), iron);
    back.position.set(0, 1.0, 2.0);
    grp.add(back);
    // the first flight down
    for (let i = 0; i < 7; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.28), iron);
      st.position.set(-0.85, -0.2 - i * 0.2, 1.75 - i * 0.24);
      grp.add(st);
    }
    add(grp);
    void u;
    // the landing and its railings hold bodies too (local box -> world, the group only yaws)
    const slab = (lx: number, ly: number, lz: number, hx: number, hy: number, hz: number) => {
      const c = new THREE.Vector3(lx, ly, lz).applyAxisAngle(up, ry).add(grp.position);
      const side = Math.abs(out.x) > 0.5;
      a.physicsSlabs.push({ c, half: side ? new THREE.Vector3(hz, hy, hx) : new THREE.Vector3(hx, hy, hz) });
    };
    slab(0, -0.25, 1.0, 1.45, 0.25, 1.0);
    slab(-1.45, 0.5, 1.0, 0.03, 0.5, 1.0);
    slab(1.45, 0.5, 1.0, 0.03, 0.5, 1.0);
    slab(0, 0.5, 2.0, 1.45, 0.5, 0.03);
  }
  // ---------------------------------------------------------------------- roof furniture (obstacles)
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.65, roughness: 0.38, envMapIntensity: 1.5 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2d32, metalness: 0.6, roughness: 0.5, envMapIntensity: 1.2 });
  const fans: THREE.Object3D[] = [];
  const acUnit = (x: number, z: number, rot: number) => {
    const w = rot ? 1.5 : 2.4, d = rot ? 2.4 : 1.5;
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);
    grp.rotation.y = rot ? Math.PI / 2 : 0;
    const bodyM = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 1.5), metal);
    bodyM.position.y = 0.75;
    grp.add(bodyM);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 1.6), darkMetal);
    plinth.position.y = 0.05;
    grp.add(plinth);
    // louvres
    for (let i = 0; i < 7; i++) {
      for (const s of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.035, 0.03), darkMetal);
        l.position.set(0, 0.32 + i * 0.13, s * 0.77);
        grp.add(l);
      }
    }
    // fan shroud + spinning blades on top
    const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 24, 1, true), darkMetal);
    shroud.position.set(0.35, 1.46, 0);
    grp.add(shroud);
    const fan = new THREE.Group();
    fan.position.set(0.35, 1.44, 0);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.015, 0.14), darkMetal);
      b.position.x = 0.23;
      const arm = new THREE.Group();
      arm.rotation.y = (i / 4) * Math.PI * 2;
      b.rotation.x = 0.35;
      arm.add(b);
      fan.add(arm);
    }
    grp.add(fan);
    fans.push(fan);
    add(grp);
    a.obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: 1.45, kind: 'crate', name: 'ac unit' });
  };
  acUnit(-6.4, -4.9, 0);
  acUnit(7.3, 4.7, 1);

  // brick vent stack
  {
    const x = 6.9, z = -5.6, w = 0.85;
    const stackMat = new THREE.MeshStandardMaterial({ map: concreteTexture(29), color: 0x7a4e40, roughness: 0.85 });
    blood.patchMaterial(stackMat);
    const geos = a.boxFaces(blood, x, z, w, w, 2.6, floorDensity * 0.6, [w, 2.6], false, 2.2);
    const stack = new THREE.Mesh(mergeGeometries(geos, false)!, stackMat);
    add(stack);
    box(w + 0.12, 0.12, w + 0.12, darkMetal, x, 2.66, z);
    a.obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - w / 2, maxZ: z + w / 2, h: 2.6, kind: 'pillar', name: 'vent stack' });
  }

  // water tower on its steel legs (north-west corner)
  {
    const cx = -9.9, cz = -7.6;
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.85 });
    for (const [lx, lz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
      box(0.2, 3.4, 0.2, darkMetal, cx + lx, 1.7, cz + lz);
      a.obstacles.push({ minX: cx + lx - 0.13, maxX: cx + lx + 0.13, minZ: cz + lz - 0.13, maxZ: cz + lz + 0.13, h: 3.4, kind: 'pillar', name: 'tower leg' });
    }
    for (const y of [1.2, 2.4]) {
      box(2.4, 0.08, 0.08, darkMetal, cx, y, cz - 1.1, 0, false);
      box(2.4, 0.08, 0.08, darkMetal, cx, y, cz + 1.1, 0, false);
      box(0.08, 0.08, 2.4, darkMetal, cx - 1.1, y, cz, 0, false);
      box(0.08, 0.08, 2.4, darkMetal, cx + 1.1, y, cz, 0, false);
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 3.0, 20), wood);
    tank.position.set(cx, 4.9, cz);
    add(tank);
    for (const y of [3.8, 4.9, 6.0]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.57, 0.035, 6, 24), darkMetal);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.set(cx, y, cz);
      add(hoop, false);
    }
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.0, 20), darkMetal);
    cone.position.set(cx, 6.9, cz);
    add(cone);
  }

  // skylight: a pitched glass lantern, a warm room glowing dimly below it
  {
    const x = 2.6, z = 6.9;
    box(2.3, 0.45, 1.5, darkMetal, x, 0.225, z);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.3), new THREE.MeshBasicMaterial({ color: 0x9a6438 }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x, 0.46, z);
    g.add(glow);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x2a3644, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.6, envMapIntensity: 2.2, side: THREE.DoubleSide });
    for (const sgn of [-1, 1]) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.86), glassMat);
      pane.position.set(x, 0.66, z + sgn * 0.36);
      pane.rotation.x = -Math.PI / 2 + sgn * 0.55;
      g.add(pane);
    }
    box(2.26, 0.05, 0.05, darkMetal, x, 0.88, z, 0, false);
    for (const dx of [-1.1, 0, 1.1]) {
      for (const sgn of [-1, 1]) {
        const m = box(0.04, 0.04, 0.86, darkMetal, x + dx, 0.66, z + sgn * 0.36, 0, false);
        m.rotation.x = sgn * 0.55;
      }
    }
    a.obstacles.push({ minX: x - 1.15, maxX: x + 1.15, minZ: z - 0.75, maxZ: z + 0.75, h: 0.9, kind: 'prop', name: 'skylight' });
  }

  // small things: mushroom vents, pipes along the parapet, a satellite dish, cable trays
  {
    for (const [x, z] of [[-2.8, -8.9], [9.9, -1.9], [-11.6, 0.2], [4.9, 9.8], [-7.6, 9.6]] as [number, number][]) {
      box(0.18, 0.6, 0.18, darkMetal, x, 0.3, z);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.18, 12), metal);
      cap.position.set(x, 0.66, z);
      add(cap);
    }
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x5a3c30, metalness: 0.5, roughness: 0.55 });
    for (const [z, x0, x1] of [[-HALF_D + 0.35, -11, -2.2], [HALF_D - 0.35, 2.2, 11]] as [number, number, number][]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, x1 - x0, 10), pipeMat);
      p.rotation.z = Math.PI / 2;
      p.position.set((x0 + x1) / 2, 0.14, z);
      add(p);
    }
    const dish = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.75, 18, 8, 0, Math.PI * 2, 0, 0.9), new THREE.MeshStandardMaterial({ color: 0xc8c8cc, roughness: 0.4, side: THREE.DoubleSide }));
    bowl.rotation.x = -1.0;
    bowl.position.y = 1.5;
    dish.add(bowl);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 8), darkMetal);
    pole.position.y = 0.75;
    dish.add(pole);
    dish.position.set(11.9, 0, 9.6);
    dish.rotation.y = -2.3;
    add(dish);
    a.obstacles.push({ minX: 11.5, maxX: HALF_W, minZ: 9.2, maxZ: 10.1, h: 1.6, kind: 'prop', name: 'dish' });
  }

  // ---------------------------------------------------------------------- the neon billboard (north)
  /** What the wet roof mirrors (copied into the reflection probe's scene). */
  const reflected: THREE.Mesh[] = [];
  const neon: { mat: THREE.MeshBasicMaterial; base: THREE.Color; phase: number; flicker: number; k: number }[] = [];
  {
    const bz = -HALF_D - 3.6;
    const frame = new THREE.Group();
    for (const x of [-5.5, -1.8, 1.8, 5.5]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 7.4, 0.22), darkMetal);
      leg.position.set(x, -0.5, bz + 0.4);
      frame.add(leg);
    }
    const cat = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.08, 0.8), darkMetal);
    cat.position.set(0, 2.85, bz + 0.6);
    frame.add(cat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(12.4, 4.4, 0.2), darkMetal);
    back.position.set(0, 5.2, bz + 0.15);
    frame.add(back);
    add(frame);
    const signMat = new THREE.MeshBasicMaterial({ map: neonTexture(['NEON DRAGON', '24 HR · PACHINKO · NOODLES'], '#ff2a9a'), toneMapped: false });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.9), signMat);
    sign.position.set(0, 5.2, bz + 0.27);
    g.add(sign);
    reflected.push(sign);
    neon.push({ mat: signMat, base: new THREE.Color(1, 1, 1), phase: 0, flicker: 0.1, k: 1 });
    // a blue sign on the east stair hut
    const s2Mat = new THREE.MeshBasicMaterial({ map: neonTexture(['HOTEL'], '#2ad8ff', 512, 160), toneMapped: false });
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.75), s2Mat);
    s2.position.set(HALF_W + PT + 0.02, 3.55, 0);
    s2.rotation.y = -Math.PI / 2;
    g.add(s2);
    reflected.push(s2);
    neon.push({ mat: s2Mat, base: new THREE.Color(1, 1, 1), phase: 1.7, flicker: 0.6, k: 1 });
    // a red one high on the far west block
    const s3Mat = new THREE.MeshBasicMaterial({ map: neonTexture(['酒  BAR'], '#ff3a2a', 512, 160), toneMapped: false });
    const s3 = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), s3Mat);
    s3.position.set(-HALF_W - 9.5, 7.5, 3);
    s3.rotation.y = Math.PI / 2;
    g.add(s3);
    reflected.push(s3);
    neon.push({ mat: s3Mat, base: new THREE.Color(1, 1, 1), phase: 3.1, flicker: 0.3, k: 1 });
  }

  // ---------------------------------------------------------------------- the city
  const beacons: THREE.Vector3[] = [];
  {
    const tones = ['#0e1016', '#12141a', '#16131a', '#0c0f14'];
    const mats = tones.map((tn, i) => new THREE.MeshBasicMaterial({ map: facadeTexture(500 + i * 7, tn), color: 0xb8b0c0, fog: true }));
    const geosBy: THREE.BufferGeometry[][] = mats.map(() => []);
    for (let i = 0; i < 90; i++) {
      const ang = (i / 90) * Math.PI * 2 + rng.next() * 0.06;
      const ring = i % 3;
      const r = ring === 0 ? 30 + rng.next() * 12 : ring === 1 ? 46 + rng.next() * 18 : 68 + rng.next() * 30;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r * 0.9;
      // we're high up: the near blocks sit below the roof (you look down on them), the far ones
      // climb into a skyline
      const top = ring === 0 ? -16 + rng.next() * 15 : ring === 1 ? -8 + rng.next() * 22 : 4 + rng.next() * 42;
      const w = 7 + rng.next() * 11, d = 7 + rng.next() * 11;
      const bottom = -60;
      const h = top - bottom;
      const geo = new THREE.BoxGeometry(w, h, d);
      const uv = geo.attributes.uv.array as Float32Array;
      for (let k = 0; k < uv.length; k += 2) {
        uv[k] *= w / 8;
        uv[k + 1] *= h / 16;
      }
      geo.translate(x, bottom + h / 2, z);
      geosBy[i % mats.length].push(geo);
      // aircraft-warning beacons on the tall ones
      if (top > 18 && rng.next() < 0.5) beacons.push(new THREE.Vector3(x, top + 0.6, z));
    }
    mats.forEach((m, i) => {
      const merged = mergeGeometries(geosBy[i], false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, m);
        mesh.matrixAutoUpdate = false;
        g.add(mesh);
        reflected.push(mesh);
      }
    });
  }

  // the street, a long way down: sodium lamps along the blocks, headlights and tail-lights
  {
    const S = 1024;
    const [c, x] = canvas(S, S);
    x.fillStyle = '#050406';
    x.fillRect(0, 0, S, S);
    const cell = S / 24;
    for (let i = 0; i <= 24; i++) {
      for (const horiz of [true, false]) {
        const p0 = i * cell + (rng.next() - 0.5) * cell * 0.3;
        // the road's own glow, then a lamp every few metres
        x.fillStyle = 'rgba(120,70,30,0.35)';
        if (horiz) x.fillRect(0, p0 - 3, S, 6);
        else x.fillRect(p0 - 3, 0, 6, S);
        for (let t = 0; t < S; t += 9 + rng.next() * 6) {
          x.fillStyle = `rgba(255,${150 + rng.next() * 40},70,${0.5 + rng.next() * 0.4})`;
          if (horiz) x.fillRect(t, p0 - 4, 2, 2);
          else x.fillRect(p0 - 4, t, 2, 2);
        }
        // traffic: white heading one way, red the other
        for (let k = 0; k < 6; k++) {
          const t = rng.next() * S, len = 4 + rng.next() * 10;
          x.fillStyle = rng.next() < 0.5 ? 'rgba(255,245,220,0.9)' : 'rgba(255,40,30,0.85)';
          if (horiz) x.fillRect(t, p0 + (rng.next() < 0.5 ? -1 : 1), len, 1.5);
          else x.fillRect(p0 + (rng.next() < 0.5 ? -1 : 1), t, 1.5, len);
        }
      }
    }
    const street = new THREE.Mesh(new THREE.PlaneGeometry(240, 240).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex(c, true, false), fog: false, color: 0x9a8a8a }));
    street.position.y = -58;
    street.matrixAutoUpdate = false;
    street.updateMatrix();
    g.add(street);
  }

  // moon
  const moonDir = new THREE.Vector3(0.5, 0.6, 0.62).normalize();
  {
    const moonSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(128, 'rgba(235,240,255,1)', 'rgba(140,160,220,0)'), fog: false, depthWrite: false, transparent: true }));
    moonSpr.scale.set(14, 14, 1);
    moonSpr.position.copy(moonDir).multiplyScalar(140);
    g.add(moonSpr);
  }

  // ---------------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(0x5a5482, 0x241a26, 1.45);
  g.add(hemi);
  const moon = new THREE.DirectionalLight(0x9fb4e8, 1.35);
  moon.position.copy(moonDir).multiplyScalar(30);
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  const sc = moon.shadow.camera as THREE.OrthographicCamera;
  sc.left = -18; sc.right = 18; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 70;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.03;
  g.add(moon, moon.target);
  // neon spill (magenta / cyan) and the stairwell bulbs, most important first (low presets get fewer)
  const lightSpecs: { p: THREE.Vector3; c: number; i: number; d: number; neon?: number }[] = [
    { p: new THREE.Vector3(-3.5, 3.4, -HALF_D - 1.2), c: 0xff2a90, i: 70, d: 22, neon: 0 },
    { p: new THREE.Vector3(HALF_W - 0.4, 3.0, 0), c: 0x2ad8ff, i: 30, d: 12, neon: 1 },
    { p: doorLights[1] ?? new THREE.Vector3(-HALF_W + 1, 2.4, 0), c: 0xffc890, i: 22, d: 9 },
    { p: new THREE.Vector3(4.5, 3.4, -HALF_D - 1.2), c: 0x6a3aff, i: 45, d: 18, neon: 0 },
  ];
  const neonLights: { l: THREE.PointLight; n: number; base: number }[] = [];
  for (const sp of lightSpecs.slice(0, Math.max(1, pointLights))) {
    const l = new THREE.PointLight(sp.c, sp.i, sp.d, 1.6);
    l.position.copy(sp.p);
    g.add(l);
    if (sp.neon !== undefined) neonLights.push({ l, n: sp.neon, base: sp.i });
  }
  const beaconSprites: THREE.Sprite[] = [];
  for (const b of beacons) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(32, 'rgba(255,60,40,1)', 'rgba(255,30,20,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.scale.set(2.2, 2.2, 1);
    sp.position.copy(b);
    g.add(sp);
    beaconSprites.push(sp);
  }

  // ---------------------------------------------------------------------- wet reflections
  // a small environment of the scene's brightest things (sky glow, neon, the moon) for the wet roof,
  // the steel and the fighters' skin to reflect
  if (blood.renderer) {
    const env = new THREE.Scene();
    env.background = sky;
    env.fog = new THREE.FogExp2(a.fog.color, a.fog.density * 0.8);
    for (const m of reflected) {
      const c = new THREE.Mesh(m.geometry, m.material);
      m.updateMatrix();
      c.applyMatrix4(m.matrix);
      env.add(c);
    }
    const moonP = new THREE.Mesh(new THREE.CircleGeometry(4, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8eeff).multiplyScalar(3), fog: false }));
    moonP.position.copy(moonDir).multiplyScalar(80);
    moonP.lookAt(0, 0, 0);
    env.add(moonP);
    const pm = new THREE.PMREMGenerator(blood.renderer);
    a.environment = pm.fromScene(env, 0.01, 0.1, 220, { position: new THREE.Vector3(0, 1.2, 0) }).texture;
    pm.dispose();
  }

  // ---------------------------------------------------------------------- rain
  const RAIN = 2600;
  const rainGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(RAIN * 2 * 3);
    const seed = new Float32Array(RAIN * 2);
    for (let i = 0; i < RAIN; i++) {
      const x = (rng.next() - 0.5) * 34, y = rng.next() * 14, z = (rng.next() - 0.5) * 30;
      const len = 0.35 + rng.next() * 0.35;
      pos.set([x, y, z, x - 0.05, y + len, z - 0.03], i * 6);
      seed[i * 2] = seed[i * 2 + 1] = rng.next();
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rainGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  }
  const rainMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFlash: { value: 0 } },
    vertexShader: `attribute float aSeed; uniform float uTime; varying float vA;
      void main() {
        vec3 p = position;
        float fall = mod(p.y - uTime * (13.0 + aSeed * 5.0), 14.0) - p.y;
        p.y += fall;
        p.x += fall * 0.06;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // streaks right at the lens are huge and distracting: fade them in from 1.5 m
        vA = (0.1 + aSeed * 0.16) * smoothstep(1.2, 3.5, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float uFlash; varying float vA;
      void main() { gl_FragColor = vec4(vec3(0.62, 0.7, 0.85) * (1.0 + uFlash * 0.6), vA * (1.0 + uFlash * 0.4)); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  g.add(rain);
  // splashes on the roof: little rings that open and fade
  const SPL = 140;
  const splashMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.5, blending: THREE.AdditiveBlending });
  {
    // ring texture
    const [c, x] = canvas(64, 64);
    x.strokeStyle = 'rgba(210,225,255,0.9)';
    x.lineWidth = 3;
    x.beginPath();
    x.arc(32, 32, 26, 0, Math.PI * 2);
    x.stroke();
    splashMat.map = tex(c, true, false);
  }
  const splashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), splashMat, SPL);
  splashes.frustumCulled = false;
  const splashT = new Float32Array(SPL).map(() => rng.next());
  // most drops that show are the ones landing in standing water
  const splashAt = (v: THREE.Vector3) => {
    if (Math.random() < 0.75) {
      const [px, pz, pr] = wet.pools[Math.floor(Math.random() * wet.pools.length)];
      const ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * pr * 0.8;
      return v.set(px + Math.cos(ang) * rr, 0.012, pz + Math.sin(ang) * rr * 0.75);
    }
    return v.set((Math.random() - 0.5) * HALF_W * 2, 0.012, (Math.random() - 0.5) * HALF_D * 2);
  };
  const splashP: THREE.Vector3[] = Array.from({ length: SPL }, () => splashAt(new THREE.Vector3()));
  splashes.setColorAt(0, new THREE.Color());
  g.add(splashes);

  // ---------------------------------------------------------------------- floor paint
  {
    const p = new THREE.Vector3();
    // the helipad: a ring and an H, the fight's centre
    for (let i = 0; i < 260; i++) {
      const ang = (i / 260) * Math.PI * 2;
      p.set(Math.cos(ang) * 5.0, 0.01, Math.sin(ang) * 5.0);
      blood.splat(p, 0.09, SPLAT.paint, 0.42, up, new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang)), 1.6, i * 0.31);
    }
    for (let t = -1.7; t <= 1.7; t += 0.06) {
      for (const sx of [-1.05, 1.05]) {
        p.set(sx, 0.01, t);
        blood.splat(p, 0.15, SPLAT.paint, 0.42, up, new THREE.Vector3(0, 0, 1), 1.4, t * 7 + sx);
      }
    }
    for (let t = -1.05; t <= 1.05; t += 0.06) {
      p.set(t, 0.01, 0);
      blood.splat(p, 0.15, SPLAT.paint, 0.42, up, new THREE.Vector3(1, 0, 0), 1.4, t * 5);
    }
    // grime, tar streaks and the dark around everything standing on the roof
    for (let i = 0; i < 80; i++) {
      p.set((rng.next() - 0.5) * HALF_W * 1.9, 0.01, (rng.next() - 0.5) * HALF_D * 1.9);
      blood.splat(p, 0.4 + rng.next() * 1.6, SPLAT.ao, 0.1 + rng.next() * 0.2, up, null, 0, i);
    }
    for (const o of a.obstacles) {
      if (o.ghost) continue;
      const cx = (o.minX + o.maxX) / 2, cz = (o.minZ + o.maxZ) / 2;
      if (o.kind === 'ledge') {
        for (let t = 0; t <= 1; t += 0.04) {
          p.set(o.minX + (o.maxX - o.minX) * t, 0.01, o.minZ + (o.maxZ - o.minZ) * t);
          blood.splat(p, 0.6, SPLAT.ao, 0.3, up, null, 0, t * 9);
        }
      } else {
        p.set(cx, 0.01, cz);
        blood.splat(p, Math.max(o.maxX - o.minX, o.maxZ - o.minZ) * 0.8, SPLAT.ao, 0.35, up, null, 0, cx);
      }
    }
  }

  // ---------------------------------------------------------------------- lightning bolts
  // a jagged, forking ribbon over the skyline, drawn fresh for each strike that shows one
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.5, 3.0), transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const boltMesh = new THREE.Mesh(new THREE.BufferGeometry(), boltMat);
  boltMesh.frustumCulled = false;
  boltMesh.visible = false;
  g.add(boltMesh);
  const _fwd = new THREE.Vector3();
  const makeBolt = () => {
    // mostly somewhere ahead of the camera, so it's seen
    let ang = Math.random() * Math.PI * 2;
    if (a.view && Math.random() < 0.8) {
      a.view.getWorldDirection(_fwd);
      ang = Math.atan2(_fwd.z, _fwd.x) + (Math.random() - 0.5) * 1.3;
    }
    const R = 120 + Math.random() * 40;
    const radial = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const side = new THREE.Vector3(-radial.z, 0, radial.x);
    const pos: number[] = [];
    const seg = (a: THREE.Vector3, b: THREE.Vector3, w: number) => {
      const h = w / 2;
      const a0 = a.clone().addScaledVector(side, -h), a1 = a.clone().addScaledVector(side, h);
      const b0 = b.clone().addScaledVector(side, -h * 0.8), b1 = b.clone().addScaledVector(side, h * 0.8);
      pos.push(a0.x, a0.y, a0.z, a1.x, a1.y, a1.z, b1.x, b1.y, b1.z, a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, b0.x, b0.y, b0.z);
    };
    const branch = (from: THREE.Vector3, drop: number, w: number, depth: number, lean: number) => {
      const p = from.clone();
      const steps = 9 + Math.floor(Math.random() * 6);
      for (let i = 0; i < steps; i++) {
        const q = p.clone().addScaledVector(side, (Math.random() - 0.5) * 9 + lean).addScaledVector(radial, (Math.random() - 0.5) * 5);
        q.y -= (drop / steps) * (0.6 + Math.random() * 0.8);
        seg(p, q, w);
        if (depth > 0 && Math.random() < 0.22) branch(q, drop * 0.35, w * 0.5, depth - 1, (Math.random() < 0.5 ? -1 : 1) * 3);
        p.copy(q);
        w *= 0.97;
      }
    };
    branch(radial.clone().multiplyScalar(R).setY(85 + Math.random() * 20), 95, 1.3, 2, 0);
    boltMesh.geometry.dispose();
    boltMesh.geometry = new THREE.BufferGeometry();
    boltMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  };

  // ---------------------------------------------------------------------- weather & life
  const dust = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
  dust.visible = false;
  let time = 0;
  let nextBolt = new URLSearchParams(location.search).has('bolt') ? 0.05 : 6 + rng.next() * 8;
  let bolt = -1;
  const baseHemi = hemi.intensity, baseMoon = moon.intensity;
  const _m = new THREE.Matrix4();
  const _s = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _col = new THREE.Color();
  const update = (dt: number) => {
    time += dt;
    rainMat.uniforms.uTime.value = time;
    for (const f of fans) f.rotation.y += dt * 9;
    // neon: a hum, the odd stutter
    for (const n of neon) {
      const t = time + n.phase;
      const stutter = Math.sin(t * 17.3) * Math.sin(t * 5.1) * Math.sin(t * 1.3) > 1 - n.flicker * 0.4 ? 0.25 : 1;
      const k = (0.92 + Math.sin(t * 60) * 0.03) * stutter;
      n.mat.color.copy(n.base).multiplyScalar(k);
      n.k = k;
    }
    for (const nl of neonLights) nl.l.intensity = nl.base * neon[nl.n].k;
    for (let i = 0; i < beaconSprites.length; i++) (beaconSprites[i].material as THREE.SpriteMaterial).opacity = Math.max(0, Math.sin(time * 2.2 + i * 1.3)) ** 6;
    // splashes
    for (let i = 0; i < SPL; i++) {
      splashT[i] += dt * 2.6;
      if (splashT[i] >= 1) {
        splashT[i] -= 1;
        splashAt(splashP[i]);
      }
      const k = splashT[i];
      _s.setScalar(0.04 + k * 0.22);
      _m.compose(splashP[i], _q, _s);
      splashes.setMatrixAt(i, _m);
      splashes.setColorAt(i, _col.setScalar((1 - k) * (1 - k)));
    }
    splashes.instanceMatrix.needsUpdate = true;
    splashes.instanceColor!.needsUpdate = true;
    // lightning: a few quick flashes, thunder a moment later
    nextBolt -= dt;
    if (nextBolt <= 0) {
      nextBolt = 11 + Math.random() * 16;
      bolt = 0;
      boltMesh.visible = Math.random() < 0.65;
      if (boltMesh.visible) makeBolt();
      const delay = 0.5 + Math.random() * 1.6;
      a.onThunder?.(delay, 0.5 + Math.random() * 0.5);
    }
    let flash = 0;
    if (bolt >= 0) {
      bolt += dt;
      flash = Math.max(0, 1 - Math.abs(bolt - 0.05) * 16) + 0.7 * Math.max(0, 1 - Math.abs(bolt - 0.22) * 14) + 0.45 * Math.max(0, 1 - Math.abs(bolt - 0.4) * 10);
      if (bolt > 0.7) {
        bolt = -1;
        boltMesh.visible = false;
      }
    }
    boltMat.opacity = Math.min(1, flash * 1.3);
    hemi.intensity = baseHemi * (1 + flash * 3.5);
    moon.intensity = baseMoon * (1 + flash * 2.5);
    rainMat.uniforms.uFlash.value = flash;
    a.flash = flash;
  };

  const dressing = { rain: new THREE.Texture(), beacon: new THREE.Sprite(), beams: new THREE.Mesh(), sparkLamp: null } as Dressing;
  return { moon, hemi, dust, dressing, update };
}
