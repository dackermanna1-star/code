import * as THREE from 'three';
import type { Arena } from '../arena';
import type { BloodAtlas } from '../bloodAtlas';
import type { MapParts } from '../mapKit';
import { canvas, tex } from '../mapKit';
import { softGlowTexture } from '../textures';
import { LevelKit } from './kit';
import { Materials } from './materials';
import { RNG } from '../../core/math';
import { skyTexture } from '../city';
import { Road, RoadPoint } from '../../vehicle/car';

/**
 * THE RIVER EXPRESSWAY, before dawn: chapter five's level. Out of Meridian's garage ramp onto the
 * elevated road along the river - three lanes north, a concrete barrier either side, sodium lamps
 * every forty metres, the city's towers on the land side and the water on the other, a bridge, a
 * long tunnel, and at the end the slip road down to Palewater's gates. The sky goes from black to
 * the grey before sunrise as the chase goes on.
 *
 * The road is a spline; everything is laid along it. x east, z south; the road runs north (-z).
 */
export const CONVOY = {
  half: 7.6,
  lanes: [-3.9, 0, 3.9],
  /** Where the tunnel runs (s along the road). */
  tunnel: [3100, 3600] as [number, number],
  /** The slip road to Palewater leaves here; the gates are at its end. */
  exit: 5350,
  road: null as Road | null,
  /** The sky's progress toward dawn (0 night .. 1 first light), set by the chapter. */
  dawn: 0,
};

const CTRL: [number, number][] = [
  [0, 60], [0, -100], [30, -320], [70, -560], [40, -820], [-40, -1060], [-90, -1320], [-60, -1600], [20, -1860], [90, -2120],
  [110, -2420], [60, -2700], [-10, -2980], [-40, -3300], [-20, -3620], [40, -3900], [90, -4200], [70, -4520], [10, -4820], [-30, -5100], [-20, -5360], [10, -5600],
];

function buildRoad(): Road {
  const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.round(curve.getLength() / 2);
  const pts: RoadPoint[] = [];
  let s = 0;
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n);
    const t = curve.getTangentAt(i / n);
    if (prev) s += p.distanceTo(prev);
    pts.push({ x: p.x, z: p.z, tx: t.x, tz: t.z, s });
    prev = p;
  }
  return new Road(pts, CONVOY.half);
}

/** A ribbon along the road from s0 to s1 between offsets d0 and d1 (right +), at height y. */
function ribbon(road: Road, s0: number, s1: number, d0: number, d1: number, y: number, step = 4, uvScale = 8) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let k = 0;
  for (let s = s0; s <= s1 + 0.01; s += step, k++) {
    const a = road.pos(s, d0), b = road.pos(s, d1);
    pos.push(a.x, y, a.z, b.x, y, b.z);
    uv.push(d0 / uvScale, s / uvScale, d1 / uvScale, s / uvScale);
    if (k > 0) {
      const i = (k - 1) * 2;
      idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // (a ribbon wound the other way faces down: flip it up)
  const nrm = g.attributes.normal.array as Float32Array;
  if (nrm[1] < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}
/** A wall along the road (the barrier, the tunnel's sides) between heights y0 and y1 at offset d. */
function wallAlong(road: Road, s0: number, s1: number, d: number, y0: number, y1: number, step = 4) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let k = 0;
  for (let s = s0; s <= s1 + 0.01; s += step, k++) {
    const a = road.pos(s, d);
    pos.push(a.x, y0, a.z, a.x, y1, a.z);
    uv.push(s / 4, 0, s / 4, (y1 - y0) / 4);
    if (k > 0) {
      const i = (k - 1) * 2;
      // facing the road
      if (d > 0) idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
      else idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function laneTexture() {
  const [c, x] = canvas(256, 512);
  x.fillStyle = '#2a2a2e';
  x.fillRect(0, 0, 256, 512);
  const rng = new RNG(12);
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = `rgba(${rng.next() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rng.next() * 0.05})`;
    x.fillRect(rng.next() * 256, rng.next() * 512, 2, 2);
  }
  return tex(c, true, true);
}

export function buildConvoy(a: Arena, blood: BloodAtlas, pointLights: number, shadowMapSize: number): MapParts {
  const road = buildRoad();
  CONVOY.road = road;
  CONVOY.dawn = 0;
  const L = road.length;
  const k = new LevelKit(a, blood, pointLights, shadowMapSize, { bounds: { minX: -400, maxX: 400, minZ: -5800, maxZ: 200 }, density: 0.2 });
  // (no one fights on foot here: no traversal, no ways round, no floors that take blood)
  a.traversal = false;
  a.propSpots = { drums: [], crates: [] };
  a.drains = [];
  k.ambientLight = 0.2;
  const M = new Materials(blood, true);
  const rng = new RNG(5151);
  a.fog = { color: 0x14161e, density: 0.0045 };
  const sky = skyTexture(29);
  a.background = sky;
  a.farPlane = 900;
  a.camBounds = { out: 6, maxY: 40, walls: false };
  const H = CONVOY.half;

  // ---------------------------------------------------------------------- the road
  const asphalt = new THREE.MeshStandardMaterial({ map: laneTexture(), color: 0x6a6a70, roughness: 0.55, metalness: 0.05, envMapIntensity: 1.2 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8d4c8 });
  const yellow = new THREE.MeshBasicMaterial({ color: 0xd8a830 });
  const barrierMat = M.concrete(0x9a968e);
  const CH = 240;
  for (let s0 = 0; s0 < L; s0 += CH) {
    const s1 = Math.min(L, s0 + CH);
    k.geo(ribbon(road, s0, s1, -H - 0.6, H + 0.6, 0, 4, 8), asphalt, false);
    // lane lines (dashes), the edge lines
    for (const d of [-1.95, 1.95]) {
      for (let s = s0; s < s1; s += 12) k.geo(ribbon(road, s, Math.min(s1, s + 5), d - 0.08, d + 0.08, 0.02, 5, 1), lineMat, false);
    }
    k.geo(ribbon(road, s0, s1, -H + 0.3, -H + 0.45, 0.02, 8, 1), yellow, false);
    k.geo(ribbon(road, s0, s1, H - 0.45, H - 0.3, 0.02, 8, 1), lineMat, false);
    // the barriers (in the tunnel the walls are the barriers)
    const inT = s0 >= CONVOY.tunnel[0] && s1 <= CONVOY.tunnel[1];
    if (!inT) {
      for (const d of [-H - 0.3, H + 0.3]) {
        k.geo(wallAlong(road, s0, s1, d, 0, 1.0, 4), barrierMat, true);
        k.geo(ribbon(road, s0, s1, d - 0.3, d + 0.3, 1.0, 4, 1), barrierMat, false);
      }
    }
    // the deck's underside and its pillars (the road is up on a viaduct over the riverside)
    k.geo(ribbon(road, s0, s1, -H - 0.8, H + 0.8, -1.2, 8, 8), M.concrete(0x5a5854), false);
    for (let s = s0; s < s1; s += 40) {
      const p = road.pos(s, 0);
      const pil = new THREE.CylinderGeometry(1.4, 1.6, 22, 10);
      pil.translate(p.x, -12.6, p.z);
      k.geo(pil, M.concrete(0x6a6662), false);
    }
  }

  // ---------------------------------------------------------------------- the lamps
  const lampGlow = new THREE.SpriteMaterial({ map: softGlowTexture(), color: 0xffb060, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let s = 20; s < L; s += 40) {
    if (s > CONVOY.tunnel[0] - 10 && s < CONVOY.tunnel[1] + 10) continue;
    const side = (Math.floor(s / 40) % 2 ? 1 : -1) * (H + 0.5);
    const p = road.pos(s, side);
    const pole = new THREE.CylinderGeometry(0.08, 0.12, 9, 6);
    pole.translate(p.x, 4.5, p.z);
    k.geo(pole, M.iron(), false);
    const arm = road.pos(s, side * 0.62);
    const head = new THREE.BoxGeometry(0.5, 0.15, 0.9);
    head.translate(arm.x, 9.0, arm.z);
    k.geo(head, M.iron(), false);
    const glow = new THREE.Sprite(lampGlow);
    glow.scale.set(3.4, 3.4, 1);
    glow.position.set(arm.x, 8.8, arm.z);
    k.g.add(glow);
    if (Math.floor(s / 40) % 2 === 0) k.spot([arm.x, 8.6, arm.z], 0xffa858, 70, 22);
  }

  // ---------------------------------------------------------------------- the tunnel
  {
    const [t0, t1] = CONVOY.tunnel;
    const tile = M.paint(0xb8b4a8, 0.45, 0.1);
    for (let s0 = t0; s0 < t1; s0 += 60) {
      const s1 = Math.min(t1, s0 + 60);
      for (const d of [-H - 0.3, H + 0.3]) k.geo(wallAlong(road, s0, s1, d, 0, 6.2, 4), tile, false);
      const roof = ribbon(road, s0, s1, H + 0.3, -H - 0.3, 6.2, 4, 8);
      k.geo(roof, M.concrete(0x4a4844), false);
    }
    for (let s = t0 + 15; s < t1; s += 30) {
      for (const d of [-4, 4]) {
        const p = road.pos(s, d);
        const strip = new THREE.BoxGeometry(0.4, 0.08, 3.0);
        strip.rotateY(Math.atan2(p.tx, p.tz));
        strip.translate(p.x, 6.1, p.z);
        k.geo(strip, M.glow(0xffe8c0, 1.6), false);
      }
      const p = road.pos(s, 0);
      k.spot([p.x, 5.6, p.z], 0xffe0b0, 60, 18);
    }
    // the mouths: a portal frame, the name
    for (const s of [t0, t1]) {
      const p = road.pos(s, 0);
      const ry = Math.atan2(p.tx, p.tz);
      const beam = new THREE.BoxGeometry(2 * H + 3, 2.0, 1.5);
      beam.rotateY(ry);
      beam.translate(p.x, 7.2, p.z);
      k.geo(beam, M.concrete(0x7a7670), true);
    }
  }

  // ---------------------------------------------------------------------- the river, the city, the far bank
  {
    // the river: on the road's left all the way, a dark sheet with the city's lights on it
    const water = new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.12, metalness: 0.6, envMapIntensity: 2.0 });
    for (let s0 = 0; s0 < L; s0 += 400) {
      k.geo(ribbon(road, s0, Math.min(L, s0 + 400), -420, -14, -22, 20, 40), water, false);
    }
    // towers on the land side, low and close then tall and far; and the far bank's across the water
    const facade = (seed: number) => {
      const [c, x] = canvas(128, 256);
      x.fillStyle = '#0c0e14';
      x.fillRect(0, 0, 128, 256);
      const r = new RNG(seed);
      for (let j = 0; j < 32; j++)
        for (let i = 0; i < 8; i++) {
          if (r.next() < 0.3) {
            x.fillStyle = r.pick(['#ffd8a0', '#c8d8ff', '#ffe8c8', '#8ab0ff']);
            x.fillRect(i * 16 + 3, j * 8 + 2, 10, 5);
          }
        }
      const t = tex(c, true, true);
      return new THREE.MeshBasicMaterial({ map: t, color: 0xb8b0c0, fog: true });
    };
    const mats = [facade(1), facade(2), facade(3), facade(4)];
    for (let s = 0; s < L; s += 26 + rng.next() * 20) {
      const near = rng.next() < 0.55;
      const off = near ? 30 + rng.next() * 40 : 90 + rng.next() * 160;
      const w = 14 + rng.next() * 22, d = 14 + rng.next() * 20, h = near ? 10 + rng.next() * 30 : 30 + rng.next() * 110;
      const p = road.pos(s, off);
      const b = new THREE.BoxGeometry(w, h, d);
      const uv = b.attributes.uv.array as Float32Array;
      for (let i = 0; i < uv.length; i += 2) {
        uv[i] *= w / 18;
        uv[i + 1] *= h / 36;
      }
      b.rotateY(Math.atan2(p.tx, p.tz) + (rng.next() - 0.5) * 0.3);
      b.translate(p.x, -22 + h / 2, p.z);
      k.geo(b, mats[Math.floor(rng.next() * mats.length)], false);
    }
    for (let s = 0; s < L; s += 40 + rng.next() * 40) {
      const off = -(420 + rng.next() * 120);
      const w = 20 + rng.next() * 30, h = 20 + rng.next() * 120;
      const p = road.pos(s, off);
      const b = new THREE.BoxGeometry(w, h, w);
      const uv = b.attributes.uv.array as Float32Array;
      for (let i = 0; i < uv.length; i += 2) {
        uv[i] *= w / 18;
        uv[i + 1] *= h / 36;
      }
      b.translate(p.x, -22 + h / 2, p.z);
      k.geo(b, mats[Math.floor(rng.next() * mats.length)], false);
    }
  }

  // ---------------------------------------------------------------------- the slip road to Palewater, and its gates
  {
    const e = road.pos(CONVOY.exit, 0);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.6), new THREE.MeshBasicMaterial({ map: (() => {
      const [c, x] = canvas(512, 136);
      x.fillStyle = '#1a5a2a';
      x.fillRect(0, 0, 512, 136);
      x.strokeStyle = '#e8e8e0';
      x.lineWidth = 5;
      x.strokeRect(6, 6, 500, 124);
      x.fillStyle = '#f0f0e8';
      x.font = 'bold 48px "Oswald", sans-serif';
      x.fillText('PALEWATER  →', 30, 70);
      x.font = '28px "Oswald", sans-serif';
      x.fillText('Bio-Research Park · next exit', 30, 112);
      return tex(c, true, false);
    })() }));
    const sp = road.pos(CONVOY.exit - 400, H + 0.2);
    sign.position.set(sp.x, 6.4, sp.z);
    sign.rotation.y = Math.atan2(sp.tx, sp.tz) + Math.PI;
    k.g.add(sign);
    const sp2 = road.pos(CONVOY.exit - 400, H + 0.4);
    const gantry = new THREE.BoxGeometry(0.3, 6, 0.3);
    gantry.translate(sp2.x, 3, sp2.z);
    k.geo(gantry, M.iron(), false);
    void e;
  }

  // ---------------------------------------------------------------------- light
  const hemi = new THREE.HemisphereLight(0x5a6a9a, 0x1a1a22, 1.4);
  k.g.add(hemi);
  const key = k.keyLight(0x9aa8d8, 0.8, new THREE.Vector3(0.5, 1, 0.8), 40);
  const night = new THREE.Color(0x14161e), dawnFog = new THREE.Color(0x5a5a6a);
  const parts = k.finish({
    hemi,
    probe: new THREE.Vector3(0, 3, -200),
    update: () => {
      // toward dawn: the fog lifts to grey, the sky light comes up
      const d = CONVOY.dawn;
      hemi.intensity = 1.4 + d * 1.6;
      key.intensity = 0.8 + d * 0.8;
      if (a.fog) {
        const c = night.clone().lerp(dawnFog, d);
        a.fog.color = c.getHex();
      }
    },
  });
  return parts;
}
