import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HALF_D, HALF_W } from './arena';
import type { Arena, Door } from './arena';
import type { BloodAtlas } from './bloodAtlas';
import { SPLAT } from './bloodAtlas';
import type { Dressing } from './dressing';
import { canvas, makeNoise, MapKit, MapParts, normalFromHeight, tex } from './mapKit';
import { radialTexture } from './textures';
import { RNG } from '../core/math';

const CEIL = 5.6;
const TANK = { x: 0, z: -3.6, r: 1.35 };

// ============================================================================ textures
/** Clinical wall panels: large white sheets, seams, rivets, a faint sheen. 2.4 m tile. */
function panelTex(seed: number) {
  const S = 512;
  const rng = new RNG(seed);
  const [c, x] = canvas(S, S);
  const [hc, hx] = canvas(S, S);
  x.fillStyle = '#d8dce0';
  x.fillRect(0, 0, S, S);
  hx.fillStyle = '#c0c0c0';
  hx.fillRect(0, 0, S, S);
  const pw = S / 2, ph = S / 2;
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 2; i++) {
      const v = 210 + rng.next() * 18;
      x.fillStyle = `rgb(${v},${v + 3},${v + 6})`;
      x.fillRect(i * pw + 2, j * ph + 2, pw - 4, ph - 4);
      for (const [rx, ry] of [[10, 10], [pw - 10, 10], [10, ph - 10], [pw - 10, ph - 10]]) {
        x.fillStyle = '#9aa0a6';
        x.beginPath();
        x.arc(i * pw + rx, j * ph + ry, 3, 0, Math.PI * 2);
        x.fill();
        hx.fillStyle = '#ffffff';
        hx.beginPath();
        hx.arc(i * pw + rx, j * ph + ry, 3, 0, Math.PI * 2);
        hx.fill();
      }
    }
  hx.fillStyle = '#303030';
  for (const k of [0, pw, S - 2]) {
    hx.fillRect(k, 0, 3, S);
    hx.fillRect(0, k, S, 3);
  }
  x.fillStyle = 'rgba(40,46,52,0.55)';
  for (const k of [0, pw]) {
    x.fillRect(k, 0, 2, S);
    x.fillRect(0, k, S, 2);
  }
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = `rgba(0,0,0,${0.02 + rng.next() * 0.04})`;
    x.fillRect(rng.next() * S, rng.next() * S, 1.5, 1.5);
  }
  return { map: tex(c), normal: normalFromHeight(hc, 2.5) };
}

/** Grey epoxy floor in metre squares (the seams of the screed), lightly mottled. 2 m tile. */
function epoxyTex(seed: number) {
  const S = 512;
  const n = makeNoise(seed, 8);
  const [c, x] = canvas(S, S);
  const [hc, hx] = canvas(S, S);
  const img = x.createImageData(S, S);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const v = 128 + (n((i / S) * 8, (j / S) * 8) - 0.5) * 22;
      const o = (j * S + i) * 4;
      img.data[o] = v;
      img.data[o + 1] = v + 3;
      img.data[o + 2] = v + 6;
      img.data[o + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  hx.fillStyle = '#c0c0c0';
  hx.fillRect(0, 0, S, S);
  x.fillStyle = 'rgba(30,34,38,0.45)';
  hx.fillStyle = '#404040';
  for (const k of [0, S / 2]) {
    x.fillRect(k, 0, 2, S);
    x.fillRect(0, k, S, 2);
    hx.fillRect(k, 0, 2, S);
    hx.fillRect(0, k, S, 2);
  }
  return { map: tex(c), normal: normalFromHeight(hc, 1.5) };
}

/** A hazard sign: biohazard trefoil or a warning triangle, with words. */
function biohazard(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, color = '#e8b020') {
  x.save();
  x.translate(cx, cy);
  x.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    x.rotate((Math.PI * 2) / 3);
    x.beginPath();
    x.arc(0, -s * 0.42, s * 0.36, 0, Math.PI * 2);
    x.fill();
  }
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 3; i++) {
    x.rotate((Math.PI * 2) / 3);
    x.beginPath();
    x.arc(0, -s * 0.5, s * 0.24, 0, Math.PI * 2);
    x.fill();
  }
  x.beginPath();
  x.arc(0, 0, s * 0.14, 0, Math.PI * 2);
  x.fill();
  x.globalCompositeOperation = 'source-over';
  x.strokeStyle = color;
  x.lineWidth = s * 0.08;
  x.beginPath();
  x.arc(0, 0, s * 0.55, 0, Math.PI * 2);
  x.stroke();
  x.restore();
}

/** Diagonal yellow-and-black hazard stripes in a rectangle. */
function stripes(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, step: number) {
  x.save();
  x.beginPath();
  x.rect(px, py, w, h);
  x.clip();
  x.fillStyle = '#e8b818';
  x.fillRect(px, py, w, h);
  x.fillStyle = '#141414';
  for (let k = -h; k < w + h; k += step * 2) {
    x.beginPath();
    x.moveTo(px + k, py + h);
    x.lineTo(px + k + step, py + h);
    x.lineTo(px + k + step + h, py);
    x.lineTo(px + k + h, py);
    x.closePath();
    x.fill();
  }
  x.restore();
}

// ============================================================================ build
/**
 * THE LAB: Argent Biosystems' containment level four, under the city. White panels, epoxy and
 * fluorescent light; server racks blinking, things floating in tanks along the wall, benches of
 * glassware; a blast door, and in the middle a tank with something very big asleep in it.
 */
export function buildLab(a: Arena, blood: BloodAtlas, pointLights: number, shadowMapSize: number): MapParts {
  const k = new MapKit(a, blood, pointLights, shadowMapSize);
  const g = k.g;
  const rng = new RNG(5151);
  const hi = blood.size >= 4096;
  const up = k.up;

  a.fog = { color: 0x0a0e12, density: 0.012 };
  a.background = new THREE.Color(0x05070a);
  a.farPlane = 120;
  a.camBounds = { out: -0.35, maxY: CEIL - 0.8, walls: false };
  a.drains = [[TANK.x + 2.4, TANK.z + 1.4], [-6, 7], [7, 7]];
  a.propSpots = { drums: [[-11.6, 10.2], [-10.9, 10.4]], crates: [] };
  a.roster = 'lab';
  a.bossMap = { butcher: 'warden', viper: 'subject' };

  // ---------------------------------------------------------------------- floor
  const epoxy = epoxyTex(61);
  {
    const ppm = hi ? 64 : 44;
    const W = Math.round(HALF_W * 2 * ppm), H = Math.round(HALF_D * 2 * ppm);
    const [oc, ox] = canvas(W, H);
    const [rc, rx] = canvas(W, H);
    paintLabFloor(ox, rx, rng, W, H, ppm);
    const mat = new THREE.MeshStandardMaterial({ map: epoxy.map, normalMap: epoxy.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughnessMap: tex(rc, false, false), roughness: 1, color: 0xc8ccd0, envMapIntensity: 1.1 });
    mat.roughnessMap!.channel = 1;
    blood.patchMaterial(mat, { overlay: tex(oc, true, false) });
    const floor = k.floor(mat, [2, 2], true);
    floor.geometry.setAttribute('uv1', (floor.geometry.attributes.ovUv as THREE.BufferAttribute).clone());
  }

  // ---------------------------------------------------------------------- walls
  const panel = panelTex(63);
  const ppmW = hi ? 70 : 48;
  const OVH = 4.2;
  type WallDef = { origin: THREE.Vector3; u: THREE.Vector3; len: number; doors: { at: number; w: number; h: number }[]; paint: (x: CanvasRenderingContext2D, W: number, H: number, ppm: number) => void };
  const walls: WallDef[] = [
    {
      // north: the blast door; observation windows either side; the company's name over it all
      origin: new THREE.Vector3(-HALF_W, 0, -HALF_D), u: new THREE.Vector3(1, 0, 0), len: HALF_W * 2,
      doors: [{ at: HALF_W, w: 3.4, h: 3.6 }],
      paint: (x, W, H, ppm) => {
        bumper(x, W, H, ppm);
        stripes(x, (HALF_W - 2.05) * ppm, H - 3.95 * ppm, 4.1 * ppm, 0.3 * ppm, 0.15 * ppm);
        for (const s of [-1, 1]) stripes(x, (HALF_W + s * 1.85) * ppm - (s < 0 ? 0.3 * ppm : 0), H - 3.65 * ppm, 0.3 * ppm, 3.65 * ppm, 0.15 * ppm);
        sign(x, (HALF_W - 6.5) * ppm, H - 3.2 * ppm, 2.6 * ppm, 0.5 * ppm, 'CONTAINMENT LEVEL 4', '#c81e1e', '#ffffff');
        biohazard(x, (HALF_W + 5.4) * ppm, H - 2.95 * ppm, 0.32 * ppm, '#e8b020');
        label(x, (HALF_W + 6.1) * ppm, H - 2.85 * ppm, 0.22 * ppm, 'BIOHAZARD', '#1a1a1a');
        label(x, 1.2 * ppm, H - 1.6 * ppm, 0.16 * ppm, 'OBSERVATION 4A', '#2a3a4a');
        label(x, (W / ppm - 4.8) * ppm, H - 1.6 * ppm, 0.16 * ppm, 'OBSERVATION 4B', '#2a3a4a');
      },
    },
    {
      // south: two sliding doors, the monitor wall between them
      origin: new THREE.Vector3(HALF_W, 0, HALF_D), u: new THREE.Vector3(-1, 0, 0), len: HALF_W * 2,
      doors: [{ at: HALF_W - 7, w: 1.8, h: 2.6 }, { at: HALF_W + 7, w: 1.8, h: 2.6 }],
      paint: (x, W, H, ppm) => {
        bumper(x, W, H, ppm);
        for (const at of [HALF_W - 7, HALF_W + 7]) {
          stripes(x, (at - 1.05) * ppm, H - 2.75 * ppm, 2.1 * ppm, 0.12 * ppm, 0.1 * ppm);
          label(x, (at - 0.5) * ppm, H - 2.95 * ppm, 0.17 * ppm, at < HALF_W ? 'SECURITY' : 'LAB 4 · EXIT', '#2a3a4a');
        }
        sign(x, (HALF_W - 2.6) * ppm, H - 3.75 * ppm, 5.2 * ppm, 0.42 * ppm, 'ARGENT BIOSYSTEMS — RESEARCH DIVISION', '#e8ecf0', '#1a2a3a');
      },
    },
    {
      // east: the server room side, a door through
      origin: new THREE.Vector3(HALF_W, 0, -HALF_D), u: new THREE.Vector3(0, 0, 1), len: HALF_D * 2,
      doors: [{ at: HALF_D, w: 1.6, h: 2.5 }],
      paint: (x, W, H, ppm) => {
        bumper(x, W, H, ppm);
        label(x, (HALF_D - 0.6) * ppm, H - 2.75 * ppm, 0.17 * ppm, 'DATA CENTRE', '#2a3a4a');
        sign(x, 2 * ppm, H - 3.2 * ppm, 2.2 * ppm, 0.35 * ppm, 'NO OPEN FLAME', '#1a2a3a', '#ffffff');
      },
    },
    {
      // west: the specimen tanks, a door to the cold store
      origin: new THREE.Vector3(-HALF_W, 0, HALF_D), u: new THREE.Vector3(0, 0, -1), len: HALF_D * 2,
      doors: [{ at: HALF_D - 4, w: 1.6, h: 2.5 }],
      paint: (x, W, H, ppm) => {
        bumper(x, W, H, ppm);
        label(x, (HALF_D - 4.6) * ppm, H - 2.75 * ppm, 0.17 * ppm, 'COLD STORE', '#2a3a4a');
        for (const at of [2.5, 7.4, 18.6]) label(x, (at - 0.5) * ppm, H - 3.0 * ppm, 0.16 * ppm, `SPECIMEN ${String.fromCharCode(65 + Math.floor(at / 6))}-${Math.floor(at * 7) % 90 + 10}`, '#2a3a4a');
        biohazard(x, 12.0 * ppm, H - 3.2 * ppm, 0.3 * ppm, '#e8b020');
      },
    },
  ];
  const plain: THREE.BufferGeometry[] = [];
  for (const w of walls) {
    const [ac, ax] = canvas(Math.round(w.len * ppmW), Math.round(OVH * ppmW));
    w.paint(ax, ac.width, ac.height, ppmW);
    ax.clearRect(0, 0, ac.width, 2);
    ax.clearRect(0, 0, 2, ac.height);
    ax.clearRect(ac.width - 2, 0, 2, ac.height);
    const mat = new THREE.MeshStandardMaterial({ map: panel.map, normalMap: panel.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.45, color: 0xe8ecf0, envMapIntensity: 0.9 });
    blood.patchMaterial(mat, { overlay: tex(ac, true, false) });
    const res = k.wall({ origin: w.origin, u: w.u, len: w.len, height: CEIL, paintH: OVH, tile: [2.4, 2.4], doors: w.doors, ov: { h: OVH } });
    const m = new THREE.Mesh(mergeGeometries(res.paint, false)!, mat);
    m.receiveShadow = true;
    g.add(m);
    plain.push(...res.plain);
  }
  {
    const m = new THREE.Mesh(mergeGeometries(plain, false)!, new THREE.MeshStandardMaterial({ map: panel.map, normalMap: panel.normal, roughness: 0.5, color: 0xc8ccd0 }));
    m.receiveShadow = true;
    g.add(m);
  }

  // ---------------------------------------------------------------------- doors
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.75, roughness: 0.35 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x2a2e34, metalness: 0.7, roughness: 0.45 });
  const darkBox = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 1, side: THREE.BackSide });
  const corridor = (mid: THREE.Vector3, inward: THREE.Vector3, w: number, h: number, red = false) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, h + 0.1, 4), red ? new THREE.MeshStandardMaterial({ color: 0x2a0806, roughness: 1, side: THREE.BackSide, emissive: 0x200402 }) : darkBox);
    b.position.copy(mid).addScaledVector(inward, -2).setY(h / 2);
    b.rotation.y = Math.atan2(inward.x, inward.z);
    g.add(b);
    // the door leaves, slid back into the wall
    const side = new THREE.Vector3(-inward.z, 0, inward.x);
    for (const s of [-1, 1]) {
      const leaf = k.box(w * 0.5, h, 0.08, steel, 0, h / 2, 0);
      leaf.position.copy(mid).addScaledVector(side, s * w * 0.85).addScaledVector(inward, -0.06).setY(h / 2);
      leaf.rotation.y = Math.atan2(-side.z, side.x);
    }
  };
  // the blast door first: the doors list's first entry is where bosses walk in
  corridor(new THREE.Vector3(0, 0, -HALF_D), new THREE.Vector3(0, 0, 1), 3.4, 3.6, true);
  {
    const blast = k.box(3.6, 0.6, 0.5, darkSteel, 0, 3.9, -HALF_D - 0.1);
    void blast;
    const teeth = new THREE.MeshStandardMaterial({ color: 0xe8b818, metalness: 0.4, roughness: 0.5 });
    for (let i = -6; i <= 6; i++) k.box(0.14, 0.12, 0.3, teeth, i * 0.26, 3.55, -HALF_D - 0.05, 0, false);
  }
  k.door(new THREE.Vector3(0, 0, -HALF_D), new THREE.Vector3(0, 0, 1), 3.4, 3.2);
  corridor(new THREE.Vector3(-7, 0, HALF_D), new THREE.Vector3(0, 0, -1), 1.8, 2.6);
  corridor(new THREE.Vector3(7, 0, HALF_D), new THREE.Vector3(0, 0, -1), 1.8, 2.6);
  corridor(new THREE.Vector3(HALF_W, 0, 0), new THREE.Vector3(-1, 0, 0), 1.6, 2.5);
  corridor(new THREE.Vector3(-HALF_W, 0, 4), new THREE.Vector3(1, 0, 0), 1.6, 2.5);
  k.door(new THREE.Vector3(-7, 0, HALF_D), new THREE.Vector3(0, 0, -1), 1.8, 3.0);
  k.door(new THREE.Vector3(7, 0, HALF_D), new THREE.Vector3(0, 0, -1), 1.8, 3.0);
  k.door(new THREE.Vector3(HALF_W, 0, 0), new THREE.Vector3(-1, 0, 0), 1.6, 3.0);
  k.door(new THREE.Vector3(-HALF_W, 0, 4), new THREE.Vector3(1, 0, 0), 1.6, 3.0);
  k.roomWalls(CEIL, [
    { side: 'n', at: 0, w: 3.4 },
    { side: 's', at: -7, w: 1.8 },
    { side: 's', at: 7, w: 1.8 },
    { side: 'e', at: 0, w: 1.6 },
    { side: 'w', at: 4, w: 1.6 },
  ]);
  // red light down the blast-door corridor
  k.light({ p: new THREE.Vector3(0, 2.8, -HALF_D - 1.6), color: 0xff3020, intensity: 30, distance: 9, priority: 5 });

  // observation windows (north): dark rooms beyond, green screens glowing
  {
    const [c, x] = canvas(512, 256);
    x.fillStyle = '#05080a';
    x.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 5; i++) {
      x.fillStyle = `rgba(60,255,140,${0.25 + rng.next() * 0.4})`;
      x.fillRect(30 + i * 95, 120 + rng.next() * 30, 50, 34);
    }
    x.fillStyle = 'rgba(255,255,255,0.05)';
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(200, 0);
    x.lineTo(80, 256);
    x.lineTo(0, 256);
    x.fill();
    const wm = new THREE.MeshBasicMaterial({ map: tex(c, true, false), color: 0x9ab0a8 });
    for (const cx of [-8.2, 8.2]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.6), wm);
      w.position.set(cx, 2.2, -HALF_D + 0.025);
      g.add(w);
      k.box(4.4, 0.1, 0.12, darkSteel, cx, 1.36, -HALF_D + 0.06, 0, false);
      k.box(4.4, 0.1, 0.12, darkSteel, cx, 3.04, -HALF_D + 0.06, 0, false);
    }
  }

  // ---------------------------------------------------------------------- ceiling: light panels in a grid, ducts
  const ceilPanels: THREE.Mesh[] = [];
  {
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, HALF_D * 2), new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.8 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = CEIL;
    g.add(ceil);
    const lp = new THREE.MeshBasicMaterial({ color: 0xeef4ff });
    const geos: THREE.BufferGeometry[] = [];
    for (let x = -10.5; x <= 10.5; x += 3.5) for (let z = -8; z <= 8; z += 4) {
      const p = new THREE.PlaneGeometry(1.8, 0.6);
      p.rotateX(Math.PI / 2);
      p.translate(x, CEIL - 0.02, z);
      geos.push(p);
    }
    const panels = new THREE.Mesh(mergeGeometries(geos, false)!, lp);
    g.add(panels);
    ceilPanels.push(panels);
    for (const z of [-6, 6]) {
      const duct = k.cyl(0.35, 0.35, HALF_W * 2, 14, steel, 0, CEIL - 0.6, z, false);
      duct.rotation.z = Math.PI / 2;
    }
  }

  // ---------------------------------------------------------------------- the containment tank (Subject Zero's)
  const tankGroup = new THREE.Group();
  const tankGlass = new THREE.MeshStandardMaterial({ color: 0x9ae8c0, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 2 });
  const fluidMat = new THREE.MeshStandardMaterial({ color: 0x1a6a3a, emissive: 0x2aff7a, emissiveIntensity: 0.45, roughness: 0.2, transparent: true, opacity: 0.55, depthWrite: false });
  let tankFluid: THREE.Mesh, tankShell: THREE.Mesh, sleeper: THREE.Group;
  {
    tankGroup.position.set(TANK.x, 0, TANK.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(TANK.r + 0.25, TANK.r + 0.35, 0.5, 32), darkSteel);
    base.position.y = 0.25;
    tankGroup.add(base);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(TANK.r + 0.3, TANK.r + 0.2, 0.7, 32), darkSteel);
    cap.position.y = 4.65;
    tankGroup.add(cap);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.2, 0.12), steel);
      strut.position.set(Math.cos(ang) * (TANK.r + 0.05), 2.5, Math.sin(ang) * (TANK.r + 0.05));
      tankGroup.add(strut);
    }
    tankShell = new THREE.Mesh(new THREE.CylinderGeometry(TANK.r, TANK.r, 3.8, 32, 1, true), tankGlass);
    tankShell.position.y = 2.4;
    tankShell.renderOrder = 3;
    tankGroup.add(tankShell);
    tankFluid = new THREE.Mesh(new THREE.CylinderGeometry(TANK.r - 0.04, TANK.r - 0.04, 3.6, 32), fluidMat);
    tankFluid.position.y = 2.3;
    tankFluid.renderOrder = 2;
    tankGroup.add(tankFluid);
    // the sleeper: a huge dark shape hanging in the fluid, tubes into his back
    sleeper = new THREE.Group();
    const flesh = new THREE.MeshStandardMaterial({ color: 0x2a3a30, roughness: 0.6, emissive: 0x0a2a14, emissiveIntensity: 0.4 });
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), flesh);
    torso.scale.set(1.2, 1.5, 0.8);
    torso.position.y = 2.6;
    sleeper.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), flesh);
    head.position.set(0, 3.45, 0.08);
    sleeper.add(head);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 1.3, 8), flesh);
      arm.position.set(s * 0.72, 2.3, 0);
      arm.rotation.z = s * 0.25;
      sleeper.add(arm);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 1.4, 8), flesh);
      leg.position.set(s * 0.28, 1.25, 0);
      sleeper.add(leg);
    }
    for (let i = 0; i < 4; i++) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 }));
      tube.position.set(-0.3 + i * 0.2, 3.9, -0.4);
      tube.rotation.x = -0.3;
      sleeper.add(tube);
    }
    tankGroup.add(sleeper);
    k.add(tankGroup);
    // obstacles: a circle as three overlapping boxes
    const r = TANK.r + 0.3;
    for (const [w, d] of [[r * 2, r * 1.15], [r * 1.15, r * 2], [r * 1.7, r * 1.7]] as [number, number][]) k.block(TANK.x, TANK.z, w, d, 4.9, 'pillar', 'tank').material = 'metal';
    k.light({ p: new THREE.Vector3(TANK.x, 2.4, TANK.z + TANK.r + 0.4), color: 0x3aff8a, intensity: 26, distance: 9, priority: 10 });
  }
  // bubbles in all the tanks
  const bubbleTex = radialTexture(16, 'rgba(200,255,220,0.9)', 'rgba(160,255,200,0)');
  const bubbles: { s: THREE.Sprite; x: number; z: number; r: number; y0: number; y1: number; t: number; sp: number }[] = [];
  const addBubbles = (x: number, z: number, r: number, y0: number, y1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
      s.scale.setScalar(0.05 + Math.random() * 0.06);
      g.add(s);
      bubbles.push({ s, x, z, r, y0, y1, t: Math.random(), sp: 0.15 + Math.random() * 0.25 });
    }
  };
  addBubbles(TANK.x, TANK.z, TANK.r * 0.8, 0.6, 4.1, 26);

  // ---------------------------------------------------------------------- specimen tanks (west wall)
  {
    const glass = new THREE.MeshStandardMaterial({ color: 0xa8e8ff, roughness: 0.05, transparent: true, opacity: 0.2, depthWrite: false, envMapIntensity: 2 });
    const cols = [0x2affb0, 0x3ac8ff, 0xb8ff3a];
    let li = 0;
    for (const z of [-8.6, -4.9, 8.7]) {
      const x = -HALF_W + 0.85;
      const col = cols[li % 3];
      k.cyl(0.62, 0.68, 0.4, 20, darkSteel, x, 0.2, z);
      k.cyl(0.66, 0.6, 0.35, 20, darkSteel, x, 2.95, z);
      const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 2.3, 20), new THREE.MeshStandardMaterial({ color: new THREE.Color(col).multiplyScalar(0.3), emissive: col, emissiveIntensity: 0.4, transparent: true, opacity: 0.6, depthWrite: false }));
      fl.position.set(x, 1.6, z);
      fl.renderOrder = 2;
      g.add(fl);
      const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 2.4, 20, 1, true), glass);
      gl.position.set(x, 1.6, z);
      gl.renderOrder = 3;
      g.add(gl);
      // what's in it: a curled shape, too many limbs
      const thing = new THREE.Mesh(new THREE.TorusKnotGeometry(0.18, 0.07, 48, 6, 2, 3), new THREE.MeshStandardMaterial({ color: 0x3a2a2a, roughness: 0.5, emissive: 0x100804 }));
      thing.position.set(x, 1.6, z);
      thing.rotation.set(rng.next() * 3, rng.next() * 3, rng.next() * 3);
      g.add(thing);
      specimens.push(thing);
      k.block(x, z, 1.36, 1.36, 3.1, 'pillar', 'specimen tank');
      addBubbles(x, z, 0.4, 0.5, 2.7, 8);
      if (li < 2) k.light({ p: new THREE.Vector3(x + 0.9, 1.6, z), color: col, intensity: 10, distance: 5, priority: 4 - li });
      li++;
    }
  }

  // ---------------------------------------------------------------------- server racks (east wall)
  const ledCanvas = canvas(64, 256);
  const ledTex = tex(ledCanvas[0], true, true);
  const drawLeds = (all: boolean) => {
    const x = ledCanvas[1];
    if (all) {
      x.fillStyle = '#000';
      x.fillRect(0, 0, 64, 256);
    }
    for (let i = 0; i < (all ? 400 : 40); i++) {
      const lx = 4 + Math.floor(Math.random() * 14) * 4, ly = 4 + Math.floor(Math.random() * 62) * 4;
      x.fillStyle = Math.random() < 0.5 ? '#000' : Math.random() < 0.6 ? '#3aff6a' : Math.random() < 0.7 ? '#3ab8ff' : '#ffb020';
      x.fillRect(lx, ly, 2, 2);
    }
    ledTex.needsUpdate = true;
  };
  drawLeds(true);
  {
    const rackFace = (() => {
      const [c, x] = canvas(64, 256);
      x.fillStyle = '#121418';
      x.fillRect(0, 0, 64, 256);
      for (let y = 0; y < 256; y += 16) {
        x.fillStyle = '#1e2228';
        x.fillRect(2, y + 1, 60, 13);
        x.fillStyle = '#0a0b0d';
        for (let k2 = 6; k2 < 58; k2 += 4) x.fillRect(k2, y + 4, 2, 7);
      }
      return tex(c, true, true);
    })();
    const rackMat = new THREE.MeshStandardMaterial({ map: rackFace, emissiveMap: ledTex, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.5, metalness: 0.4 });
    const side = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.5 });
    for (const zs of [[-9.6, -2.0], [2.0, 9.6]] as [number, number][]) {
      for (let z = zs[0]; z <= zs[1] + 0.01; z += (zs[1] - zs[0]) / 5) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.3, 0.62), [side, side, side, side, side, rackMat]);
        r.position.set(HALF_W - 0.5, 1.15, z);
        r.rotation.y = Math.PI / 2;
        k.add(r);
      }
      k.obstacle(HALF_W - 0.95, HALF_W, zs[0] - 0.33, zs[1] + 0.33, 2.3, 'crate', 'server racks').material = 'metal';
    }
  }

  // ---------------------------------------------------------------------- benches, the security desk, a fume hood, shelves
  const benchTop = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.25, metalness: 0.1, envMapIntensity: 1.3 });
  const benchBody = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.5, metalness: 0.2 });
  const micro = new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.4 });
  const bench = (x: number, z: number, w: number, d: number) => {
    k.box(w, 0.86, d, benchBody, x, 0.43, z);
    k.box(w + 0.06, 0.05, d + 0.06, benchTop, x, 0.885, z);
    k.block(x, z, w + 0.06, d + 0.06, 0.92, 'crate', 'bench').material = 'metal';
  };
  bench(-6.2, 4.6, 1.1, 3.6);
  bench(6.2, 4.6, 1.1, 3.6);
  // fixed equipment on them
  for (const [x, z] of [[-6.2, 3.3], [6.2, 5.9]] as [number, number][]) {
    k.box(0.22, 0.08, 0.3, micro, x, 0.95, z);
    k.cyl(0.03, 0.03, 0.35, 8, micro, x, 1.1, z - 0.08);
    k.box(0.12, 0.08, 0.2, micro, x, 1.28, z - 0.04);
  }
  {
    // the security desk facing the doors, monitors on it (props)
    k.box(2.6, 0.08, 0.9, benchTop, 0, 0.76, 8.4);
    k.box(2.6, 0.72, 0.1, benchBody, 0, 0.36, 8.85);
    for (const dx of [-1.25, 1.25]) k.box(0.08, 0.72, 0.9, benchBody, dx, 0.36, 8.4);
    k.block(0, 8.4, 2.6, 0.92, 0.8, 'crate', 'desk').material = 'metal';
    // a fume hood against the west wall near the cold store
    k.box(1.6, 2.3, 0.9, benchBody, -HALF_W + 0.45, 1.15, 0.6, Math.PI / 2);
    const sash = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshStandardMaterial({ color: 0x9ab8c8, transparent: true, opacity: 0.35, roughness: 0.05 }));
    sash.position.set(-HALF_W + 0.91, 1.45, 0.6);
    sash.rotation.y = Math.PI / 2;
    g.add(sash);
    k.block(-HALF_W + 0.45, 0.6, 0.92, 1.62, 2.3, 'crate', 'fume hood').material = 'metal';
    // chemical shelving (north-east corner)
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 });
    for (let i = 0; i < 4; i++) k.box(2.4, 0.04, 0.5, shelfMat, 9.6, 0.3 + i * 0.55, -HALF_D + 0.3, 0, false);
    for (const dx of [-1.18, 1.18]) k.box(0.04, 2.0, 0.5, shelfMat, 9.6 + dx, 1.0, -HALF_D + 0.3, 0, false);
    const jarCols = [0xe8c020, 0x3a8ae8, 0xe83a3a, 0xe8e8e8, 0x3ae87a];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 8), new THREE.MeshStandardMaterial({ color: jarCols[(i + j) % 5], roughness: 0.4 }));
      jar.position.set(8.7 + j * 0.28, 0.42 + i * 0.55, -HALF_D + 0.3);
      k.add(jar, false);
    }
    k.obstacle(8.35, 10.85, -HALF_D, -HALF_D + 0.56, 2.0, 'crate', 'shelves');
  }

  // ---------------------------------------------------------------------- the monitor wall (south, between the doors)
  const monCanvas = canvas(1024, 256);
  const monTex = tex(monCanvas[0], true, false);
  let ecgX = 0;
  const drawMonitors = (t: number) => {
    const x = monCanvas[1];
    x.fillStyle = '#04080a';
    x.fillRect(0, 0, 1024, 256);
    const panelW = 1024 / 4;
    for (let i = 0; i < 4; i++) {
      x.strokeStyle = '#1a3a4a';
      x.lineWidth = 3;
      x.strokeRect(i * panelW + 6, 6, panelW - 12, 244);
    }
    // 1: the subject's vitals
    x.strokeStyle = '#3aff7a';
    x.lineWidth = 2;
    x.beginPath();
    for (let px = 0; px < panelW - 30; px += 2) {
      const ph = (px + ecgX) % 120;
      const y = 120 + (ph > 50 && ph < 56 ? -60 : ph > 56 && ph < 62 ? 30 : Math.sin(px * 0.15) * 2);
      if (px === 0) x.moveTo(15 + px, y);
      else x.lineTo(15 + px, y);
    }
    x.stroke();
    x.fillStyle = '#3aff7a';
    x.font = "700 20px 'Barlow Condensed', monospace";
    x.fillText('SUBJECT 0 · HR ' + (38 + Math.round(Math.sin(t) * 3)), 20, 40);
    x.fillText('SEDATION 92%', 20, 225);
    // 2: a helix turning
    for (let i = 0; i < 26; i++) {
      const yy = 20 + i * 8.6, ph = t * 2 + i * 0.45;
      const a1 = Math.sin(ph), a2 = Math.sin(ph + Math.PI);
      x.fillStyle = '#3ab8ff';
      x.fillRect(panelW + 128 + a1 * 70, yy, 6, 6);
      x.fillStyle = '#ff5a8a';
      x.fillRect(panelW + 128 + a2 * 70, yy, 6, 6);
      x.fillStyle = 'rgba(200,220,255,0.25)';
      x.fillRect(panelW + 128 + Math.min(a1, a2) * 70, yy + 2, Math.abs(a1 - a2) * 70, 2);
    }
    // 3: security cameras
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const cx = panelW * 2 + 14 + i * 118, cy = 14 + j * 116;
      x.fillStyle = '#0c1210';
      x.fillRect(cx, cy, 110, 108);
      x.fillStyle = 'rgba(120,160,140,0.35)';
      x.fillRect(cx + 20, cy + 40 + Math.sin(t + i + j) * 5, 22, 40);
      x.fillStyle = '#c8ffd8';
      x.font = "600 12px 'Barlow Condensed', monospace";
      x.fillText(`CAM ${j * 2 + i + 1} · ${String(Math.floor(t * 10) % 60).padStart(2, '0')}`, cx + 5, cy + 14);
    }
    // 4: readouts
    for (let i = 0; i < 9; i++) {
      x.fillStyle = i % 3 === 0 ? '#ffb020' : '#3ab8ff';
      const w = 40 + ((Math.sin(t * 1.3 + i) + 1) * 0.5) * 160;
      x.fillRect(panelW * 3 + 20, 24 + i * 24, w, 12);
    }
    monTex.needsUpdate = true;
  };
  drawMonitors(0);
  {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: monTex, toneMapped: false, color: 0xb8c8c8 }));
    m.position.set(0, 2.5, HALF_D - 0.04);
    m.rotation.y = Math.PI;
    g.add(m);
    k.box(8.2, 2.2, 0.06, darkSteel, 0, 2.5, HALF_D - 0.01, 0, false);
  }

  // ---------------------------------------------------------------------- alarm beacons
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0x400808 });
  const beams: THREE.Mesh[] = [];
  {
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    for (const [x, z, ry] of [[-HALF_W + 0.15, -6, Math.PI / 2], [HALF_W - 0.15, 5, -Math.PI / 2], [-4.5, -HALF_D + 0.15, 0], [4.5, HALF_D - 0.15, Math.PI]] as [number, number, number][]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 12), beaconMat);
      b.position.set(x, 4.45, z);
      g.add(b);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 16, 1, true), beamMat);
      beam.geometry.translate(0, -1.6, 0);
      beam.geometry.rotateZ(Math.PI / 2);
      beam.position.set(x, 4.45, z);
      beam.rotation.y = ry;
      g.add(beam);
      beams.push(beam);
    }
  }
  let alarmOn = false;
  let alarmLight: THREE.PointLight | null = null;
  k.light({ p: new THREE.Vector3(0, 4.6, 3), color: 0xff2010, intensity: 0, distance: 30, priority: 7.5, use: (l) => (alarmLight = l) });
  a.alarm = (on: boolean) => {
    if (on === alarmOn) return;
    alarmOn = on;
    a.onAlarmSound?.(on);
  };

  // ---------------------------------------------------------------------- props
  const Y_BENCH = 0.91, Y_DESK = 0.8;
  a.propList = [
    { kind: 'beaker', x: -6.35, z: 4.0, y: Y_BENCH }, { kind: 'beaker', x: -6.0, z: 4.3, y: Y_BENCH }, { kind: 'beaker', x: -6.3, z: 5.4, y: Y_BENCH }, { kind: 'beaker', x: -6.05, z: 5.9, y: Y_BENCH },
    { kind: 'beaker', x: 6.3, z: 3.5, y: Y_BENCH }, { kind: 'beaker', x: 6.05, z: 3.9, y: Y_BENCH }, { kind: 'beaker', x: 6.35, z: 4.8, y: Y_BENCH },
    { kind: 'monitor', x: -6.2, z: 6.0, y: Y_BENCH, ry: Math.PI / 2 }, { kind: 'monitor', x: 6.2, z: 3.2, y: Y_BENCH, ry: -Math.PI / 2 },
    { kind: 'monitor', x: -0.7, z: 8.6, y: Y_DESK, ry: Math.PI }, { kind: 'monitor', x: 0.7, z: 8.6, y: Y_DESK, ry: Math.PI },
    { kind: 'officechair', x: -0.6, z: 7.6 }, { kind: 'officechair', x: 0.8, z: 7.5, ry: 0.4 }, { kind: 'officechair', x: -4.8, z: 4.6, ry: -Math.PI / 2 },
    { kind: 'cart', x: 3.2, z: 6.8, ry: 0.3 }, { kind: 'cart', x: -9.0, z: -9.6, ry: 1.2 }, { kind: 'beaker', x: 3.1, z: 6.8, y: 0.86 }, { kind: 'beaker', x: 3.35, z: 6.7, y: 0.86 },
    { kind: 'gascan', x: -11.2, z: -10.4 }, { kind: 'gascan', x: -10.8, z: -10.5 }, { kind: 'gascan', x: 11.9, z: 10.3 }, { kind: 'gascan', x: 11.5, z: 10.4 }, { kind: 'gascan', x: -3.6, z: -10.5 },
    { kind: 'canister', x: 4.4, z: -10.3 }, { kind: 'canister', x: 4.9, z: -10.0 }, { kind: 'canister', x: -9.6, z: 10.3 }, { kind: 'canister', x: 10.6, z: -6.0 },
    { kind: 'box', x: 11.0, z: 7.0 + 3.4, ry: 0.3 }, { kind: 'box', x: -11.4, z: 6.6, ry: 1.1 }, { kind: 'box', x: -11.3, z: 6.6, y: 0.4, ry: 0.6 },
  ];

  // ---------------------------------------------------------------------- lights
  const hemi = k.hemi(0xdce4f0, 0x3a4048, 1.35);
  // the ceiling's banks, as a key light from almost straight overhead
  const moon = k.key(0xeef4ff, 1.15, new THREE.Vector3(3, 20, 5), { x: 17, z: 15, far: 50 });
  k.commitLights();

  // contact shadows under the furniture
  {
    const p = new THREE.Vector3();
    for (const o of a.obstacles) {
      if (o.ghost || o.kind === 'wall') continue;
      p.set((o.minX + o.maxX) / 2, 0.01, (o.minZ + o.maxZ) / 2);
      blood.splat(p, Math.max(o.maxX - o.minX, o.maxZ - o.minZ) * 0.7, SPLAT.ao, 0.3, up, null, 0, p.x);
    }
  }
  k.probe(new THREE.Color(0x1a1e24), new THREE.Vector3(0, 1.6, 3));

  // ---------------------------------------------------------------------- Subject Zero's entrance
  let burst = false;
  let gush = 0;
  a.bossEntrance = (key: string): Door | null => {
    if (key !== 'subject' || burst) return null;
    burst = true;
    // the glass goes, the fluid floods out, he steps down
    tankShell.visible = false;
    tankFluid.visible = false;
    sleeper.visible = false;
    gush = 1.6;
    a.onTankBurst?.(new THREE.Vector3(TANK.x, 1.6, TANK.z + TANK.r * 0.6));
    a.alarm?.(true);
    // jagged remains of the glass
    const shards: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 22; i++) {
      const ang = (i / 22) * Math.PI * 2;
      if (Math.abs(ang - Math.PI / 2) < 0.6) continue;
      const h = 0.3 + Math.random() * 1.6;
      const sh = new THREE.BufferGeometry();
      const x0 = Math.cos(ang) * TANK.r, z0 = Math.sin(ang) * TANK.r;
      const x1 = Math.cos(ang + 0.3) * TANK.r, z1 = Math.sin(ang + 0.3) * TANK.r;
      sh.setAttribute('position', new THREE.Float32BufferAttribute([x0, 0.5, z0, x1, 0.5, z1, (x0 + x1) / 2, 0.5 + h, (z0 + z1) / 2], 3));
      sh.computeVertexNormals();
      shards.push(sh);
    }
    const m = new THREE.Mesh(mergeGeometries(shards, false)!, new THREE.MeshStandardMaterial({ color: 0x9ae8c0, roughness: 0.05, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    tankGroup.add(m);
    // (the jagged ring still stands: walk round it)
    for (const o of a.obstacles) if (o.name === 'tank') o.h = 1.4;
    // he steps out over the broken front of it
    const front = TANK.z + TANK.r + 0.75;
    return { x: TANK.x, z: front, ix: TANK.x, iz: front + 2.2, yaw: 0, width: 2.4 };
  };

  // ---------------------------------------------------------------------- life
  let time = 0, monT = 0, ledT = 0;
  const _c = new THREE.Color();
  const baseHemi = hemi.color.clone();
  const update = (dt: number) => {
    time += dt;
    for (const b of bubbles) {
      if (!b.s.visible) continue;
      b.t += dt * b.sp;
      if (b.t > 1) b.t -= 1;
      const ang = b.t * 9 + b.x * 3 + b.z;
      b.s.position.set(b.x + Math.cos(ang) * b.r * 0.6, b.y0 + (b.y1 - b.y0) * b.t, b.z + Math.sin(ang) * b.r * 0.6);
    }
    if (burst) for (const b of bubbles) if (Math.hypot(b.x - TANK.x, b.z - TANK.z) < 0.1) b.s.visible = false;
    if (!burst) {
      sleeper.position.y = Math.sin(time * 0.7) * 0.05;
      sleeper.rotation.y = Math.sin(time * 0.23) * 0.15;
    }
    for (const s of specimens) s.rotation.y += dt * 0.1;
    monT += dt;
    ecgX += dt * 140;
    if (monT > 0.12) {
      monT = 0;
      drawMonitors(time);
    }
    ledT += dt;
    if (ledT > 0.15) {
      ledT = 0;
      drawLeds(false);
    }
    // the alarm: beacons sweep, the room pulses red
    const pulse = alarmOn ? 0.5 + 0.5 * Math.sin(time * 6) : 0;
    beaconMat.color.setHex(alarmOn ? (pulse > 0.5 ? 0xff2010 : 0x801008) : 0x400808);
    for (const [i, b] of beams.entries()) {
      b.rotation.y += dt * (alarmOn ? 4 : 0) * (i % 2 ? 1 : -1);
      (b.material as THREE.MeshBasicMaterial).opacity = alarmOn ? 0.1 : 0;
    }
    const al = alarmLight as THREE.PointLight | null;
    if (al) al.intensity = alarmOn ? 60 * pulse : 0;
    hemi.color.copy(baseHemi).lerp(_c.setHex(0xff3a2a), alarmOn ? pulse * 0.35 : 0);
    if (gush > 0) gush -= dt;
  };
  const dressing = { rain: new THREE.Texture(), beacon: new THREE.Sprite(), beams: new THREE.Mesh(), sparkLamp: null } as Dressing;
  return { moon, hemi, dust: k.noDust(), dressing, update };
}
const specimens: THREE.Mesh[] = [];

/** A dark-grey bumper band along the foot of the walls, a pinstripe over it. */
function bumper(x: CanvasRenderingContext2D, W: number, H: number, ppm: number) {
  x.fillStyle = '#3a4048';
  x.fillRect(0, H - 1.0 * ppm, W, 1.0 * ppm);
  x.fillStyle = '#e8b818';
  x.fillRect(0, H - 1.06 * ppm, W, 0.04 * ppm);
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.fillRect(0, H - 0.12 * ppm, W, 0.12 * ppm);
}
function sign(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, text: string, bg: string, fg: string) {
  x.fillStyle = bg;
  x.fillRect(px, py, w, h);
  x.fillStyle = fg;
  x.font = `700 ${h * 0.62}px 'Barlow Condensed', sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const tw = x.measureText(text).width;
  x.save();
  x.translate(px + w / 2, py + h / 2);
  x.scale(Math.min(1, (w * 0.92) / tw), 1);
  x.fillText(text, 0, 0);
  x.restore();
  x.textAlign = 'left';
  x.textBaseline = 'alphabetic';
}
function label(x: CanvasRenderingContext2D, px: number, py: number, h: number, text: string, color: string) {
  x.fillStyle = color;
  x.font = `700 ${h}px 'Barlow Condensed', sans-serif`;
  x.fillText(text, px, py);
}

/** The floor: hazard rings round the tank, walkway lines, stencilled words, drains, scuffs; glossy epoxy. */
function paintLabFloor(x: CanvasRenderingContext2D, r: CanvasRenderingContext2D, rng: RNG, W: number, H: number, ppm: number) {
  const px = (wx: number) => (wx + HALF_W) * ppm;
  const pz = (wz: number) => (wz + HALF_D) * ppm;
  r.fillStyle = 'rgb(60,60,60)';
  r.fillRect(0, 0, W, H);
  // the hazard ring round the tank
  {
    const cx = px(TANK.x), cy = pz(TANK.z), r0 = (TANK.r + 0.6) * ppm, r1 = (TANK.r + 1.05) * ppm;
    x.save();
    x.beginPath();
    x.arc(cx, cy, r1, 0, Math.PI * 2);
    x.arc(cx, cy, r0, 0, Math.PI * 2, true);
    x.clip();
    stripes(x, cx - r1, cy - r1, r1 * 2, r1 * 2, 0.22 * ppm);
    x.restore();
    x.fillStyle = 'rgba(200,40,30,0.85)';
    x.font = `700 ${0.32 * ppm}px 'Barlow Condensed', sans-serif`;
    x.textAlign = 'center';
    x.fillText('DO NOT CROSS — CONTAINMENT', cx, cy + r1 + 0.5 * ppm);
  }
  // walkways: yellow lines from the doors
  x.strokeStyle = 'rgba(232,184,24,0.75)';
  x.lineWidth = 0.08 * ppm;
  x.setLineDash([0.5 * ppm, 0.3 * ppm]);
  for (const [x0, z0, x1, z1] of [[-7, 10.6, -7, 6.5], [7, 10.6, 7, 6.5], [-7, 6.5, 7, 6.5], [12.6, 0, 3, 0], [-12.6, 4, -3, 4], [0, -10.6, 0, -6.5]]) {
    x.beginPath();
    x.moveTo(px(x0), pz(z0));
    x.lineTo(px(x1), pz(z1));
    x.stroke();
  }
  x.setLineDash([]);
  // stencilled zone names and arrows
  x.fillStyle = 'rgba(30,40,50,0.55)';
  x.font = `700 ${0.6 * ppm}px 'Barlow Condensed', sans-serif`;
  x.textAlign = 'center';
  x.fillText('LAB 4', px(-9), pz(-1));
  x.fillText('ZONE C', px(9), pz(-2));
  x.font = `700 ${0.28 * ppm}px 'Barlow Condensed', sans-serif`;
  x.fillText('EXIT →', px(10.4), pz(1.2));
  // drains
  for (const [dx, dz] of [[TANK.x + 2.4, TANK.z + 1.4], [-6, 7], [7, 7]]) {
    x.fillStyle = '#1a1c1e';
    x.fillRect(px(dx) - 0.25 * ppm, pz(dz) - 0.25 * ppm, 0.5 * ppm, 0.5 * ppm);
    x.fillStyle = '#5a5e62';
    for (let i = 0; i < 6; i++) x.fillRect(px(dx) - 0.22 * ppm + i * 0.08 * ppm, pz(dz) - 0.22 * ppm, 0.03 * ppm, 0.44 * ppm);
  }
  // scuffs and wheel marks
  for (let i = 0; i < 120; i++) {
    x.strokeStyle = `rgba(20,22,24,${0.05 + rng.next() * 0.08})`;
    x.lineWidth = 1 + rng.next() * 3;
    x.beginPath();
    const sx = rng.next() * W, sy = rng.next() * H;
    x.moveTo(sx, sy);
    x.quadraticCurveTo(sx + (rng.next() - 0.5) * 80, sy + (rng.next() - 0.5) * 80, sx + (rng.next() - 0.5) * 160, sy + (rng.next() - 0.5) * 160);
    x.stroke();
  }
  // under the benches it's a little duller
  r.fillStyle = 'rgb(110,110,110)';
  for (const [cx, cz, w, d] of [[-6.2, 4.6, 1.6, 4.2], [6.2, 4.6, 1.6, 4.2]]) r.fillRect(px(cx - w / 2), pz(cz - d / 2), w * ppm, d * ppm);
  x.textAlign = 'left';
  x.clearRect(0, 0, W, 2);
  x.clearRect(0, H - 2, W, 2);
  x.clearRect(0, 0, 2, H);
  x.clearRect(W - 2, 0, 2, H);
}
