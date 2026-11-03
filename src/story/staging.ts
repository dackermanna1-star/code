import * as THREE from 'three';
import type { Arena, Obstacle } from '../world/arena';
import { HALF_D } from '../world/arena';
import { Fighter } from '../combat/fighter';
import type { CharacterLibrary } from '../character/library';
import type { Game } from '../game';
import type { ClipEvent } from '../anim/clip';
import type { HitInfo, HitResult } from '../combat/types';
import { angleDiff, clamp, damp, wrapAngle, yawFromDir } from '../core/math';
import { radialTexture } from '../world/textures';

/**
 * The story's set dressing on the endless mode's maps, and its non-combatants:
 *  - the alley: the Lantern's back door (shut, a neon sign over it, the club's bass behind it), the
 *    lanyard Ivy dropped on her way out;
 *  - the warehouse: the crew's chain-link pen and the people in it, a folding table with a crate of
 *    everybody's phones and the Butcher's clipboard.
 */
export const stage: {
  lantern: { pivot: THREE.Object3D; open: number; want: number; spill: THREE.Sprite; floor: THREE.Mesh; sign: THREE.MeshBasicMaterial; lanyard: THREE.Object3D } | null;
  pen: { gate: THREE.Object3D; gateObs: Obstacle; open: number; want: number; phone: THREE.MeshBasicMaterial; phoneT: number; bulb: THREE.Sprite; table: THREE.Vector3; key: THREE.Object3D | null } | null;
} = { lantern: null, pen: null };

const canvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
};
const tex = (c: HTMLCanvasElement, srgb = true) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

// ====================================================================== the alley
/** The Lantern's neon: its name in warm amber tube and a little lantern drawn in red beside it. */
function lanternSign() {
  const [c, x] = canvas(1024, 320);
  x.fillStyle = '#07050a';
  x.fillRect(0, 0, 1024, 320);
  x.strokeStyle = 'rgba(90,60,40,0.7)';
  x.lineWidth = 8;
  x.strokeRect(10, 10, 1004, 300);
  const glow = (col: string, blur: number, draw: () => void) => {
    x.save();
    x.shadowColor = col;
    x.shadowBlur = blur;
    x.strokeStyle = col;
    x.fillStyle = col;
    draw();
    x.restore();
  };
  // the lantern: a cage, a flame
  const lx = 150, ly = 165;
  for (const [col, b, w] of [['#ff3a2a', 30, 9], ['#ffd0b8', 4, 3]] as [string, number, number][]) {
    glow(col, b, () => {
      x.lineWidth = w;
      x.beginPath();
      x.moveTo(lx - 40, ly - 60);
      x.lineTo(lx + 40, ly - 60);
      x.lineTo(lx + 52, ly + 70);
      x.lineTo(lx - 52, ly + 70);
      x.closePath();
      x.stroke();
      x.beginPath();
      x.arc(lx, ly - 82, 18, Math.PI, 0);
      x.stroke();
      x.beginPath();
      x.moveTo(lx, ly - 60);
      x.lineTo(lx, ly + 70);
      x.stroke();
    });
  }
  glow('#ffb040', 26, () => {
    x.beginPath();
    x.moveTo(lx, ly - 28);
    x.quadraticCurveTo(lx + 22, ly + 10, lx, ly + 38);
    x.quadraticCurveTo(lx - 22, ly + 10, lx, ly - 28);
    x.fill();
  });
  // the name
  x.textAlign = 'left';
  x.textBaseline = 'middle';
  x.font = '800 150px "Arial Black", Impact, sans-serif';
  for (const [col, b, a] of [['#ff9a2a', 34, 1], ['#ffe8c8', 6, 0.7]] as [string, number, number][]) {
    x.save();
    x.globalAlpha = a;
    x.shadowColor = col;
    x.shadowBlur = b;
    x.fillStyle = col;
    x.fillText('LANTERN', 250, 172);
    x.restore();
  }
  x.font = '700 40px "Arial Black", Impact, sans-serif';
  x.fillStyle = '#ff5a3a';
  x.globalAlpha = 0.85;
  x.fillText('THE', 258, 70);
  return tex(c);
}

export function dressAlley(a: Arena) {
  const g = a.group;
  const z0 = -HALF_D;
  // the sign under the fire escape's first landing, over the door
  const signMat = new THREE.MeshBasicMaterial({ map: lanternSign(), toneMapped: false });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.78), signMat);
  sign.position.set(6, 3.5, z0 + 0.07);
  g.add(sign);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.9, 0.08), new THREE.MeshStandardMaterial({ color: 0x141016, roughness: 0.6, metalness: 0.4 }));
  back.position.set(6, 3.5, z0 + 0.02);
  g.add(back);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(64, 'rgba(255,150,60,0.9)', 'rgba(255,120,40,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
  halo.scale.set(4.2, 2.0, 1);
  halo.position.set(6, 3.5, z0 + 0.3);
  g.add(halo);
  // the door: steel, shut, hinged on its left
  const pivot = new THREE.Object3D();
  pivot.position.set(6 - 0.74, 0, z0 + 0.04);
  const steel = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.45, metalness: 0.7 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.46, 2.36, 0.06), steel);
  door.position.set(0.73, 1.18, 0);
  door.castShadow = true;
  pivot.add(door);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.14), new THREE.MeshStandardMaterial({ map: plateTex('STAFF ONLY'), roughness: 0.5 }));
  plate.position.set(0.73, 1.62, 0.035);
  pivot.add(plate);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.06), new THREE.MeshStandardMaterial({ color: 0x8a8c90, metalness: 0.9, roughness: 0.3 }));
  bar.position.set(0.8, 1.05, 0.06);
  pivot.add(bar);
  g.add(pivot);
  // what's behind it when it opens: the club's light spilling out, red and violet
  const spill = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(64, 'rgba(255,60,120,1)', 'rgba(120,40,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  spill.scale.set(3.4, 3.2, 1);
  spill.position.set(6, 1.3, z0 - 0.4);
  g.add(spill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTexture(64, 'rgba(255,70,140,0.8)', 'rgba(150,40,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  floor.position.set(6, 0.015, z0 + 1.5);
  g.add(floor);
  // her lanyard on the ground by the door: a red strap, a staff card
  const lan = new THREE.Group();
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.008, 4, 24), new THREE.MeshStandardMaterial({ color: 0xb01a22, roughness: 0.7 }));
  strap.rotation.x = Math.PI / 2;
  strap.scale.set(1, 1.6, 1);
  lan.add(strap);
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.004, 0.085), new THREE.MeshStandardMaterial({ map: plateTex('IVY'), roughness: 0.4 }));
  card.position.set(0.02, 0.004, 0.27);
  card.rotation.y = 0.4;
  lan.add(card);
  lan.position.set(6.7, 0.012, z0 + 1.35);
  lan.rotation.y = 0.7;
  g.add(lan);
  stage.lantern = { pivot, open: 0, want: 0, spill, floor, sign: signMat, lanyard: lan };
}

function plateTex(text: string) {
  const [c, x] = canvas(256, 84);
  x.fillStyle = '#d8d2c4';
  x.fillRect(0, 0, 256, 84);
  x.fillStyle = '#2a1a14';
  x.font = '800 40px "Arial Black", Impact, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 128, 44);
  return tex(c);
}

/** Per frame: the door swings, the light spills, the neon buzzes. */
export function animateAlley(dt: number, t: number) {
  const L = stage.lantern;
  if (!L) return;
  L.open = damp(L.open, L.want, L.want > L.open ? 7 : 3, dt);
  L.pivot.rotation.y = -L.open * 1.85;
  (L.spill.material as THREE.SpriteMaterial).opacity = L.open * (0.75 + Math.sin(t * 9.1) * 0.12 + Math.sin(t * 2.3) * 0.1);
  (L.floor.material as THREE.MeshBasicMaterial).opacity = L.open * 0.6;
  // the neon: steady, with a stutter now and then
  const st = Math.sin(t * 1.7) * Math.sin(t * 6.3) > 0.9 ? (Math.sin(t * 70) > 0 ? 0.35 : 1) : 1;
  L.sign.color.setScalar(st);
}

// ====================================================================== the warehouse
function chainLink(): THREE.CanvasTexture {
  const [c, x] = canvas(128, 128);
  x.clearRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(200,205,210,1)';
  x.lineWidth = 5;
  x.beginPath();
  x.moveTo(0, 64);
  x.lineTo(64, 0);
  x.lineTo(128, 64);
  x.lineTo(64, 128);
  x.closePath();
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** The pen's box (x0..x1 along the south wall, z0 out to the wall) and its gate. */
export const PEN = { x0: 5.9, x1: 9.9, z0: 7.4, z1: HALF_D, gateX0: 7.25, gateX1: 8.45 };

export function dressWarehouse(a: Arena) {
  const g = a.group;
  const iron = new THREE.MeshStandardMaterial({ color: 0x55585c, metalness: 0.75, roughness: 0.45 });
  const link = chainLink();
  const H = 2.55;
  const panel = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const t = link.clone();
    t.needsUpdate = true;
    t.repeat.set(len / 0.11, H / 0.11);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.45, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5, color: 0xb8bcc0 }));
    m.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2);
    m.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
    m.castShadow = true;
    g.add(m);
    // posts and the top rail
    const n = Math.max(1, Math.round(len / 1.3));
    for (let i = 0; i <= n; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, H + 0.05, 8), iron);
      p.position.set(x0 + ((x1 - x0) * i) / n, H / 2, z0 + ((z1 - z0) * i) / n);
      p.castShadow = true;
      g.add(p);
    }
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 6), iron);
    r.rotation.z = Math.PI / 2;
    r.rotation.y = m.rotation.y;
    r.position.set((x0 + x1) / 2, H, (z0 + z1) / 2);
    g.add(r);
  };
  const P = PEN;
  panel(P.x0, P.z0, P.gateX0, P.z0);
  panel(P.gateX1, P.z0, P.x1, P.z0);
  panel(P.x0, P.z0, P.x0, P.z1 - 0.02);
  panel(P.x1, P.z0, P.x1, P.z1 - 0.02);
  const obs = (minX: number, maxX: number, minZ: number, maxZ: number, ghost = false): Obstacle => {
    const o: Obstacle = { minX, maxX, minZ, maxZ, h: H, kind: 'wall', name: 'pen', ...(ghost ? { ghost: true } : {}), material: 'metal' };
    a.obstacles.push(o);
    return o;
  };
  obs(P.x0 - 0.05, P.gateX0, P.z0 - 0.05, P.z0 + 0.05);
  obs(P.gateX1, P.x1 + 0.05, P.z0 - 0.05, P.z0 + 0.05);
  obs(P.x0 - 0.05, P.x0 + 0.05, P.z0, P.z1);
  obs(P.x1 - 0.05, P.x1 + 0.05, P.z0, P.z1);
  // the gate: hinged at its west post, chained shut with a padlock
  const gate = new THREE.Object3D();
  gate.position.set(P.gateX0, 0, P.z0);
  {
    const len = P.gateX1 - P.gateX0;
    const t = link.clone();
    t.needsUpdate = true;
    t.repeat.set(len / 0.11, (H - 0.1) / 0.11);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.04, H - 0.1), new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.45, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5, color: 0xb8bcc0 }));
    m.position.set(len / 2, H / 2, 0);
    gate.add(m);
    for (const y of [0.08, H - 0.08]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(len - 0.02, 0.04, 0.04), iron);
      r.position.set(len / 2, y, 0);
      gate.add(r);
    }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.035), new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.9, roughness: 0.3 }));
    lock.position.set(len - 0.08, 1.05, -0.06);
    gate.add(lock);
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.01, 4, 12), iron);
    chain.position.set(len - 0.06, 1.12, -0.03);
    chain.rotation.y = Math.PI / 2;
    gate.add(chain);
  }
  g.add(gate);
  const gateObs = obs(P.gateX0, P.gateX1, P.z0 - 0.05, P.z0 + 0.05, true);
  // inside: a stained mattress, a bucket, a blanket, a bare bulb on its flex
  const matt = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 1.9), new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 0.95 }));
  matt.position.set(8.9, 0.08, 9.8);
  matt.rotation.y = 0.12;
  matt.receiveShadow = true;
  g.add(matt);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.3, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x4a5a6a, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }));
  bucket.position.set(6.25, 0.15, 10.6);
  g.add(bucket);
  const blanket = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 1 }));
  blanket.position.set(6.9, 0.012, 9.9);
  blanket.rotation.y = -0.3;
  g.add(blanket);
  const flex = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 3.0, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  flex.position.set(7.9, 5.5, 9.2);
  g.add(flex);
  const bulbM = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe6b0 }));
  bulbM.position.set(7.9, 3.95, 9.2);
  g.add(bulbM);
  const bulb = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(64, 'rgba(255,220,160,1)', 'rgba(255,200,120,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
  bulb.scale.set(1.3, 1.3, 1);
  bulb.position.copy(bulbM.position);
  g.add(bulb);
  // (the one light the pen gets: warm, falling off before the walls)
  const bl = new THREE.PointLight(0xffd6a0, 9, 6.5, 1.8);
  bl.position.set(7.9, 3.7, 9.0);
  g.add(bl);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTexture(64, 'rgba(255,215,150,0.32)', 'rgba(255,200,120,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.position.set(7.9, 0.014, 9.2);
  g.add(pool);
  // the table outside the pen: everybody's phones in a crate, the Butcher's clipboard, a chair
  const T = new THREE.Vector3(4.15, 0, 6.35);
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.8 });
  const legM = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, metalness: 0.6, roughness: 0.5 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.04, 0.66), wood);
  top.position.set(T.x, 0.74, T.z);
  top.castShadow = true;
  g.add(top);
  for (const sx of [-0.56, 0.56]) for (const sz of [-0.27, 0.27]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.74, 6), legM);
    l.position.set(T.x + sx, 0.37, T.z + sz);
    g.add(l);
  }
  a.obstacles.push({ minX: T.x - 0.64, maxX: T.x + 0.64, minZ: T.z - 0.34, maxZ: T.z + 0.34, h: 0.76, kind: 'prop', name: 'table' });
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.34), new THREE.MeshStandardMaterial({ color: 0x22344e, roughness: 0.75 }));
  crate.position.set(T.x - 0.25, 0.86, T.z + 0.02);
  g.add(crate);
  const phoneMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.3, metalness: 0.5 });
  for (let i = 0; i < 9; i++) {
    const ph = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.009, 0.15), phoneMat);
    ph.position.set(T.x - 0.4 + (i % 3) * 0.13 + Math.sin(i * 7) * 0.02, 0.965 + Math.floor(i / 3) * 0.006, T.z - 0.08 + Math.floor(i / 3) * 0.08);
    ph.rotation.set(Math.sin(i * 3) * 0.3, i * 0.7, Math.cos(i * 5) * 0.25);
    g.add(ph);
  }
  // one of them is hers: its screen lights when she calls it
  const scrMat = new THREE.MeshBasicMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0, toneMapped: false });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.065, 0.13).rotateX(-Math.PI / 2), scrMat);
  scr.position.set(T.x - 0.2, 0.978, T.z + 0.05);
  scr.rotation.y = 0.3;
  g.add(scr);
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.012, 0.33), new THREE.MeshStandardMaterial({ map: ledgerTex(), roughness: 0.6 }));
  clip.position.set(T.x + 0.32, 0.766, T.z);
  // (the right way up to whoever stands at the table's near side)
  clip.rotation.y = Math.PI - 0.15;
  g.add(clip);
  const chair = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.4), legM);
  seat.position.y = 0.45;
  chair.add(seat);
  const backr = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.03), legM);
  backr.position.set(0, 0.68, -0.19);
  backr.rotation.x = -0.1;
  chair.add(backr);
  for (const sx of [-0.19, 0.19]) for (const sz of [-0.17, 0.17]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.45, 5), legM);
    l.position.set(sx, 0.225, sz);
    chair.add(l);
  }
  chair.position.set(T.x + 0.1, 0, T.z - 0.62);
  chair.rotation.y = 0.35;
  g.add(chair);
  stage.pen = { gate, gateObs, open: 0, want: 0, phone: scrMat, phoneT: 0, bulb, table: T, key: null };
}

function ledgerTex() {
  const [c, x] = canvas(256, 352);
  x.fillStyle = '#e8e2d2';
  x.fillRect(0, 0, 256, 352);
  x.fillStyle = '#7a5a2a';
  x.fillRect(96, 0, 64, 22);
  x.fillStyle = '#2a2420';
  x.font = '700 22px "Barlow Condensed", Arial, sans-serif';
  x.fillText('LOTS — DOCK 4', 18, 52);
  x.font = '500 17px "Barlow Condensed", Arial, sans-serif';
  const rows = ['1  M  32  DEBT', '2  M  19  DEBT', '3  F  24  CLUB', '4  M  51  DEBT', '5  F  27  CLUB', '6  F  21  RESERVED — V.'];
  rows.forEach((r, i) => {
    x.fillText(r, 18, 92 + i * 34);
    x.strokeStyle = 'rgba(40,30,20,0.25)';
    x.beginPath();
    x.moveTo(14, 100 + i * 34);
    x.lineTo(242, 100 + i * 34);
    x.stroke();
  });
  x.strokeStyle = '#a01818';
  x.lineWidth = 3;
  x.beginPath();
  x.ellipse(120, 256, 112, 18, 0, 0, Math.PI * 2);
  x.stroke();
  x.fillStyle = '#a01818';
  x.font = 'italic 700 19px "Barlow Condensed", Arial, sans-serif';
  x.fillText('→ MERIDIAN TWR · PH', 70, 296);
  x.fillText('NO DAMAGE', 70, 322);
  return tex(c);
}

/** The pen's gate (open or shut, for the fighters too) and the phone in the crate ringing. */
export function setPenOpen(a: Arena, open: boolean) {
  const P = stage.pen;
  if (!P) return;
  P.want = open ? 1 : 0;
  const i = a.obstacles.indexOf(P.gateObs);
  if (open && i >= 0) a.obstacles.splice(i, 1);
  else if (!open && i < 0) a.obstacles.push(P.gateObs);
  // (the lookups by place, and the ways round, catch up)
  a.heightsChanged();
}
export function animateWarehouse(dt: number, t: number) {
  const P = stage.pen;
  if (!P) return;
  P.open = damp(P.open, P.want, 4, dt);
  P.gate.rotation.y = P.open * 1.75;
  if (P.phoneT > 0) {
    P.phoneT -= dt;
    // the screen lights and pulses as it rings
    P.phone.opacity = 0.55 + 0.45 * Math.max(0, Math.sin(t * 9));
  } else P.phone.opacity = damp(P.phone.opacity, 0, 3, dt);
  (P.bulb.material as THREE.SpriteMaterial).opacity = 0.7 + Math.sin(t * 13) * Math.sin(t * 3.1) * 0.12;
}

// ====================================================================== people who aren't in the fight
/**
 * A non-combatant: holds a pose (kneeling, sitting against the wall, cowering) or walks a path. The
 * player's strikes and the crew's ignore them; bodies flying about still collide with them.
 */
export class Npc extends Fighter {
  team = 'neutral' as const;
  pose: string | null = null;
  path: { x: number; z: number; speed: number }[] = [];
  faceYaw: number | null = null;
  hunch = 0.4;
  /** Gone (walked out of the building). */
  gone = false;
  onArrive: (() => void) | null = null;
  /** Chatting (no voice): the lips move now and then, the hands talk. */
  chatter = 0;
  private chatT = Math.random() * 20;
  /** Walk this loop for ever (a passer-by): the points in turn, back to the first. */
  loop: [number, number][] | null = null;
  private loopI = 0;
  private lodAcc = 0;
  private lodN = Math.floor(Math.random() * 4);

  constructor(game: Game, lib: CharacterLibrary, variant: string) {
    super(game, lib, lib.get(variant));
    this.state = 'idle';
  }
  hold(pose: string | null, hl = 0.3) {
    this.pose = pose;
    if (pose) this.play(pose, { halflife: hl, originYaw: this.yaw });
    else this.anim.toLoco(hl);
  }
  walk(points: [number, number][], speed = 1.6, then: (() => void) | null = null) {
    this.path = points.map(([x, z]) => ({ x, z, speed }));
    this.onArrive = then;
    if (this.anim.mode === 'clip') this.anim.toLoco(0.35);
  }
  think(dt: number) {
    const li = this.anim.locoIn;
    li.style = 'relaxed';
    li.guard = 0;
    li.hunch = this.hunch;
    li.breath = 0.8;
    li.look = 0;
    // (talking among themselves: a word, a pause, a laugh - the hands and the jaw)
    if (this.chatter > 0) {
      this.chatT += dt;
      const on = Math.sin(this.chatT * 0.7) + Math.sin(this.chatT * 1.9) * 0.5 > 0.2;
      this.talking = on ? this.chatter : 0;
      this.model.face.speak = on ? Math.max(0, Math.sin(this.chatT * 11) * Math.sin(this.chatT * 3.3)) * 0.45 : 0;
    }
    this.sceneInputs();
    // (a passer-by: on to the next point when the last is reached)
    if (this.loop && this.path.length === 0) {
      const [x, z] = this.loop[this.loopI++ % this.loop.length];
      this.path = [{ x, z, speed: 1.25 }];
    }
    const w = this.path[0];
    if (w) {
      const dx = w.x - this.x, dz = w.z - this.z;
      const d = Math.hypot(dx, dz);
      const k = Math.min(1, d / 0.4);
      this.vx = damp(this.vx, d > 0.05 ? (dx / d) * w.speed * k : 0, 6, dt);
      this.vz = damp(this.vz, d > 0.05 ? (dz / d) * w.speed * k : 0, 6, dt);
      if (d > 0.2) this.yaw = wrapAngle(this.yaw + clamp(angleDiff(this.yaw, yawFromDir(dx, dz)), -6 * dt, 6 * dt));
      if (d < 0.25 && this.path.length > 1) this.path.shift();
      else if (d < 0.08) {
        this.path.shift();
        const cb = this.onArrive;
        this.onArrive = null;
        cb?.();
        if (this.pose) this.play(this.pose, { halflife: 0.4, originYaw: this.yaw });
      }
    } else {
      this.vx = damp(this.vx, 0, 8, dt);
      this.vz = damp(this.vz, 0, 8, dt);
      if (this.faceYaw !== null && this.anim.mode === 'loco') this.yaw = wrapAngle(this.yaw + clamp(angleDiff(this.yaw, this.faceYaw), -3 * dt, 3 * dt));
    }
  }
  move(dt: number) {
    // (sat on a sofa, leant on the bar, dancing on a spot: nothing moves them - the furniture
    // they're in doesn't push them off it)
    if (this.pose && this.path.length === 0 && !this.loop) {
      this.vx = this.vz = 0;
      if (this.anim.mode === 'clip' && this.anim.clip) {
        this.anim.advanceClip(dt);
        this.anim.events.length = 0;
      }
      return;
    }
    // (they walk through the gate and out of the doors: no walls for them)
    this.ghostWalls = true;
    super.move(dt);
  }
  onEvent(ev: ClipEvent) {
    void ev;
  }
  takeHit(h: HitInfo): HitResult {
    void h;
    return 'ignored';
  }
  /**
   * A crowd's cost: far from the camera a body's pose is worked out less often (every second or
   * fourth frame, the time it missed made up) - nobody can see the difference over there.
   */
  animate(dt: number) {
    const cam = this.game.cam.camera.position;
    const d = Math.hypot(cam.x - this.x, cam.z - this.z);
    const every = d > 38 ? 4 : d > 20 ? 2 : 1;
    this.lodAcc += dt;
    if (++this.lodN % every !== 0) return;
    const step = this.lodAcc;
    this.lodAcc = 0;
    super.animate(step);
  }
  /** Out of sight: off the stage for good. */
  vanish() {
    this.gone = true;
    this.alive = false;
    this.solid = false;
    this.game.scene.remove(this.model.group);
    this.game.removeFighter(this);
  }
}

// ====================================================================== the club behind the door
/**
 * The Lantern's sound system through a steel door: a four-on-the-floor kick and a bass line, all
 * low end - until the door opens and the top comes through. Synthesised once into a loop.
 */
export class ClubBass {
  private src: AudioBufferSourceNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;
  open = 0;
  constructor(private ctx: AudioContext, out: AudioNode) {
    const sr = ctx.sampleRate;
    const bpm = 122;
    const beat = 60 / bpm;
    const len = Math.round(beat * 8 * sr);
    const buf = ctx.createBuffer(2, len, sr);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const notes = [38, 38, 41, 36, 38, 38, 43, 41];
    for (let b = 0; b < 8; b++) {
      const t0 = Math.round(b * beat * sr);
      // kick
      for (let i = 0; i < 0.32 * sr && t0 + i < len; i++) {
        const t = i / sr;
        const f = 46 + 90 * Math.exp(-t * 28);
        const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 9) * 0.9;
        L[t0 + i] += v;
        R[t0 + i] += v;
      }
      // the off-beat bass
      const hz = 440 * Math.pow(2, (notes[b] - 69) / 12);
      const tb = Math.round((b + 0.5) * beat * sr);
      for (let i = 0; i < 0.26 * sr && tb + i < len; i++) {
        const t = i / sr;
        const ph = (hz * t) % 1;
        const saw = (ph * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * hz * t) * 0.5;
        const v = saw * Math.min(1, t * 200) * Math.exp(-t * 6) * 0.45;
        L[tb + i] += v;
        R[tb + i] += v * 0.96;
      }
      // hats (only heard with the door open)
      for (const off of [0.5]) {
        const th = Math.round((b + off) * beat * sr);
        for (let i = 0; i < 0.05 * sr && th + i < len; i++) {
          const v = (Math.random() * 2 - 1) * Math.exp((-i / sr) * 90) * 0.18;
          L[th + i] += v;
          R[th + i] += v;
        }
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 170;
    f.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start();
    this.src = src;
    this.filter = f;
    this.gain = g;
  }
  /** Loudness by her distance to the door; the door open lets the top end through. */
  update(dist: number, open: number, dt: number) {
    if (!this.gain || !this.filter) return;
    this.open = damp(this.open, open, 3, dt);
    const near = 1 / (1 + Math.max(0, dist - 1.5) * 0.22);
    const v = (0.22 + this.open * 0.35) * near;
    const t = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(v, t, 0.1);
    this.filter.frequency.setTargetAtTime(170 + this.open * 2600, t, 0.12);
  }
  stop(fade = 2) {
    if (!this.gain) return;
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
    const s = this.src;
    setTimeout(() => s?.stop(), fade * 1000 + 200);
  }
}
