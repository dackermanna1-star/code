import * as THREE from 'three';
import type { Arena } from '../arena';
import type { BloodAtlas } from '../bloodAtlas';
import type { MapParts } from '../mapKit';
import { canvas, tex } from '../mapKit';
import { LevelKit } from './kit';
import { Materials } from './materials';
import { put, signBoard } from './blocks';
import { RNG } from '../../core/math';

/**
 * PALEWATER, LEVEL B3 — CONTAINMENT: chapter seven's level. Out of the freight lift into the
 * decontamination corridor, and through into the hall: two long rows of glass tanks lit green,
 * a person floating in each, a catwalk round the walls and the observation booth up on it with the
 * console that drains them. Subject Zero's chamber in the middle of the floor, its glass cracked;
 * Ivy's tank at the far end. A service stair up to the river at the south.
 *
 * x east, z south.
 */
export const TANKS = {
  start: { x: 0, z: -40, yaw: 0 },
  hall: { x0: -14, x1: 14, z0: -30, z1: 22 },
  catwalkY: 3.6,
  booth: { x0: 8, x1: 14, z0: 4, z1: 10 },
  console: { x: 10.4, z: 7 },
  ivyTank: { x: 0, z: 16 },
  zero: { x: 0, z: -14 },
  rows: [-8.5, 8.5],
  rowZ: [-24, -18, -8, -2, 4, 10],
  stairs: { x0: -2, x1: 2, z0: 22, z1: 30 },
};

/** The tanks' moving parts, for the script. */
export const tankStage = {
  /** Ivy's tank: its liquid level (1 full .. 0 drained), and the glass broken out. */
  ivyLevel: 1,
  ivyWant: 1,
  ivyLiquid: null as THREE.Mesh | null,
  ivyGlass: null as THREE.Mesh | null,
  zeroGlass: null as THREE.Mesh | null,
  zeroBroken: false,
  alarm: false,
  beacons: [] as THREE.Mesh[],
};

function liquidMaterial(color = 0x3aff8a, opacity = 0.32) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
}
function glassMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x9ac8b8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
}
function labelTexture(text: string) {
  const [c, x] = canvas(256, 64);
  x.fillStyle = '#0a1410';
  x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#7affb0';
  x.font = 'bold 30px monospace';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 128, 34);
  return tex(c, true, false);
}

export function buildTanks(a: Arena, blood: BloodAtlas, pointLights: number, shadowMapSize: number): MapParts {
  tankStage.ivyLevel = tankStage.ivyWant = 1;
  tankStage.zeroBroken = false;
  tankStage.alarm = false;
  tankStage.beacons = [];
  const k = new LevelKit(a, blood, pointLights, shadowMapSize, { bounds: { minX: -20, maxX: 20, minZ: -46, maxZ: 34 }, density: 0.85 });
  k.ambientLight = 0.16;
  const M = new Materials(blood, false);
  const rng = new RNG(9191);
  a.fog = { color: 0x06100c, density: 0.02 };
  a.background = new THREE.Color(0x020403);
  a.farPlane = 120;
  a.camBounds = { out: 0, maxY: 6.4, walls: true };
  a.propSpots = { drums: [], crates: [] };
  a.drains = [[0, -14], [0, 16]];
  a.roster = 'lab';
  const H = TANKS.hall;
  const CY = TANKS.catwalkY;
  const wall = M.paint(0x5a6660, 0.6, 0.2);
  const steel = M.steel();
  const iron = M.iron();
  const CEIL = 7.4;

  // ---------------------------------------------------------------------- the decon corridor and the lift
  k.floor(-2.2, 2.2, -44, H.z0, M.concreteFloor(), { tile: 3 });
  k.solid([-2.4, -2.2, 0, 3.2, -44, H.z0], wall, { kind: 'wall' });
  k.solid([2.2, 2.4, 0, 3.2, -44, H.z0], wall, { kind: 'wall' });
  k.solid([-2.4, 2.4, 0, 3.2, -44.2, -44], steel, { kind: 'wall', name: 'lift doors' });
  k.solid([-2.4, 2.4, 3.2, 3.4, -44, H.z0], wall, { kind: false });
  for (const z of [-41, -36, -32]) {
    k.spot([0, 3.0, z], 0xc8ffd8, 8, 5);
    put(k, new THREE.BoxGeometry(1.4, 0.04, 0.2), M.glow(0xc8ffd8, 1.4), 0, 3.18, z, 0, false);
  }
  signBoard(k, 'DECONTAMINATION · B3 · CONTAINMENT', 0, 2.6, H.z0 - 0.02, Math.PI, 3.2, 0.36, { bg: '#d8a020', fg: '#141414' });
  // spray nozzles along the corridor walls
  for (let z = -42; z < -31; z += 1.5) for (const x of [-2.18, 2.18]) put(k, new THREE.CylinderGeometry(0.05, 0.05, 0.12, 6).rotateZ(Math.PI / 2), steel, x, 2.4, z, 0, false);

  // ---------------------------------------------------------------------- the hall's shell
  k.floor(H.x0, H.x1, H.z0, H.z1, M.concreteFloor(), { tile: 3, dense: true });
  k.solid([H.x0 - 0.4, H.x0, 0, CEIL, H.z0, H.z1], wall, { kind: 'wall' });
  k.solid([H.x1, H.x1 + 0.4, 0, CEIL, H.z0, H.z1], wall, { kind: 'wall' });
  k.solid([H.x0 - 0.4, -2.2, 0, CEIL, H.z0 - 0.4, H.z0], wall, { kind: 'wall' });
  k.solid([2.2, H.x1 + 0.4, 0, CEIL, H.z0 - 0.4, H.z0], wall, { kind: 'wall' });
  k.solid([-2.2, 2.2, 3.2, CEIL, H.z0 - 0.4, H.z0], wall, { kind: 'wall' });
  k.solid([H.x0 - 0.4, TANKS.stairs.x0, 0, CEIL, H.z1, H.z1 + 0.4], wall, { kind: 'wall' });
  k.solid([TANKS.stairs.x1, H.x1 + 0.4, 0, CEIL, H.z1, H.z1 + 0.4], wall, { kind: 'wall' });
  k.solid([H.x0, H.x1, CEIL, CEIL + 0.3, H.z0, H.z1], M.concrete(0x2a302c), { kind: false });
  // the floor's drainage channel down the middle, grates
  put(k, new THREE.BoxGeometry(0.6, 0.02, H.z1 - H.z0), M.deckPlate(), 0, 0.011, (H.z0 + H.z1) / 2, 0, false);

  // ---------------------------------------------------------------------- the catwalk round the walls, its stairs, the booth
  {
    for (const [x0, x1] of [[H.x0, H.x0 + 1.6], [H.x1 - 1.6, H.x1]] as [number, number][]) {
      k.deck(x0, x1, H.z0, H.z1, CY, M.deckPlate(), iron, { thick: 0.2, name: 'catwalk' });
      const inner = x0 < 0 ? x1 : x0;
      // (its rail open at the north end, where the stairs' landing joins it)
      const r0 = H.z0 + 2;
      k.solid([inner - 0.05, inner + 0.05, CY, CY + 1.0, r0, H.z1], null, { kind: 'wall', name: 'catwalk rail', hidden: true });
      put(k, new THREE.BoxGeometry(0.05, 0.05, H.z1 - r0), iron, inner, CY + 1.0, (r0 + H.z1) / 2, 0, false);
      for (let z = r0; z <= H.z1; z += 2.5) put(k, new THREE.BoxGeometry(0.05, 1.0, 0.05), iron, inner, CY + 0.5, z, 0, false);
    }
    // stairs up to each side's catwalk (at the north end)
    k.stairs(H.x0 + 1.6, H.x0 + 3.0, H.z0 + 2, H.z0 + 8, 'z', 0, CY, iron, { dir: -1 });
    k.stairs(H.x1 - 3.0, H.x1 - 1.6, H.z0 + 2, H.z0 + 8, 'z', 0, CY, iron, { dir: -1 });
    // (the stair's inner side and the catwalk's gap over them)
    k.solid([H.x0 + 3.0, H.x0 + 3.1, 0, CY + 1, H.z0 + 2, H.z0 + 8], null, { kind: 'wall', name: 'stair rail', hidden: true });
    k.solid([H.x1 - 3.1, H.x1 - 3.0, 0, CY + 1, H.z0 + 2, H.z0 + 8], null, { kind: 'wall', name: 'stair rail', hidden: true });
    k.deck(H.x0 + 1.6, H.x0 + 3.0, H.z0, H.z0 + 2, CY, M.deckPlate(), iron, { thick: 0.2, name: 'landing' });
    k.deck(H.x1 - 3.0, H.x1 - 1.6, H.z0, H.z0 + 2, CY, M.deckPlate(), iron, { thick: 0.2, name: 'landing' });
    // (the landings' open sides over the hall: railed)
    for (const x of [H.x0 + 3.05, H.x1 - 3.05]) {
      k.solid([x - 0.05, x + 0.05, CY, CY + 1.0, H.z0, H.z0 + 2], null, { kind: 'wall', name: 'landing rail', hidden: true });
      put(k, new THREE.BoxGeometry(0.05, 0.05, 2), iron, x, CY + 1.0, H.z0 + 1, 0, false);
      put(k, new THREE.BoxGeometry(0.05, 1.0, 0.05), iron, x, CY + 0.5, H.z0 + 0.05, 0, false);
    }
    // the observation booth (east catwalk): glass front, the console
    const B = TANKS.booth;
    k.deck(B.x0, H.x1 - 1.6, B.z0, B.z1, CY, M.deckPlate(), iron, { thick: 0.2, name: 'booth floor' });
    k.solid([B.x0, B.x0 + 0.1, CY, CY + 2.6, B.z0, B.z1], null, { kind: 'wall', name: 'booth glass', hidden: true });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(B.z1 - B.z0, 2.6), glassMaterial());
    g.position.set(B.x0 + 0.05, CY + 1.3, (B.z0 + B.z1) / 2);
    g.rotation.y = Math.PI / 2;
    k.g.add(g);
    // its end walls, each with a doorway where the catwalk runs through the booth (in from the
    // north stairs, out the south end), a lintel over it
    for (const [za, zb] of [[B.z0 - 0.1, B.z0], [B.z1, B.z1 + 0.1]] as [number, number][]) {
      k.solid([B.x0, H.x1 - 1.7, CY, CY + 2.6, za, zb], wall, { kind: 'wall', name: 'booth wall' });
      k.solid([H.x1 - 1.7, H.x1, CY + 2.2, CY + 2.6, za, zb], wall, { kind: false });
    }
    k.solid([B.x0, H.x1, CY + 2.6, CY + 2.8, B.z0, B.z1], wall, { kind: false });
    const Cn = TANKS.console;
    k.solid([Cn.x - 0.5, Cn.x + 0.5, CY, CY + 1.0, Cn.z - 1.2, Cn.z + 1.2], M.paint(0x2a3a34, 0.4, 0.4), { kind: 'crate', name: 'console' });
    put(k, new THREE.BoxGeometry(0.6, 0.02, 2.2), M.glow(0x3aff8a, 0.9), Cn.x - 0.1, CY + 1.02, Cn.z, 0, false);
    k.spot([Cn.x, CY + 2.2, Cn.z], 0x9affc8, 10, 6);
  }

  // ---------------------------------------------------------------------- the tanks
  const tankAt = (x: number, z: number, r: number, h: number, label: string, liquid = 0x3aff8a, lit = 1) => {
    // base and cap (steel), the glass, the liquid inside, the label, a green light from it
    put(k, new THREE.CylinderGeometry(r + 0.18, r + 0.25, 0.5, 20), steel, x, 0.25, z, 0, true);
    put(k, new THREE.CylinderGeometry(r + 0.18, r + 0.18, 0.4, 20), steel, x, 0.5 + h + 0.2, z, 0, true);
    for (let i = 0; i < 3; i++) put(k, new THREE.CylinderGeometry(0.06, 0.06, CEIL - h - 0.9, 6), iron, x + Math.cos(i * 2.1) * r * 0.6, h + 0.9 + (CEIL - h - 0.9) / 2, z + Math.sin(i * 2.1) * r * 0.6, 0, false);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24, 1, true), glassMaterial());
    glass.position.set(x, 0.5 + h / 2, z);
    k.g.add(glass);
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.03, r - 0.03, h - 0.1, 20), liquidMaterial(liquid, 0.22 * lit));
    liq.position.set(x, 0.5 + h / 2, z);
    k.g.add(liq);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.18), new THREE.MeshBasicMaterial({ map: labelTexture(label) }));
    lab.position.set(x, 0.38, z + (x < 0 ? 0 : 0) + r + 0.27);
    k.g.add(lab);
    k.block([x - r - 0.2, x + r + 0.2, 0, 0.5 + h + 0.4, z - r - 0.2, z + r + 0.2], 'pillar', 'tank');
    k.spot([x, 1.6, z], liquid, 8 * lit, 5);
    return { glass, liq };
  };
  let n = 1;
  for (const x of TANKS.rows) for (const z of TANKS.rowZ) tankAt(x, z, 0.85, 2.6, `SUBJECT ${String(n++).padStart(2, '0')}`);
  // Ivy's, at the far end, bigger, lit warmer; Subject Zero's in the middle of the floor, cracked
  const ivy = tankAt(TANKS.ivyTank.x, TANKS.ivyTank.z, 1.05, 2.8, 'LOT 6 · PRIORITY', 0x7affc8, 1.3);
  tankStage.ivyGlass = ivy.glass;
  tankStage.ivyLiquid = ivy.liq;
  const zero = tankAt(TANKS.zero.x, TANKS.zero.z, 1.5, 3.4, 'SUBJECT ZERO', 0xa8ff3a, 1.2);
  tankStage.zeroGlass = zero.glass;
  // the cracks on his glass
  {
    const [c, x] = canvas(256, 256);
    x.strokeStyle = 'rgba(220,255,220,0.8)';
    x.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      x.beginPath();
      let px = 128, py = 128;
      x.moveTo(px, py);
      for (let j = 0; j < 6; j++) {
        px += (rng.next() - 0.5) * 70;
        py += (rng.next() - 0.5) * 70;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    const cr = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: tex(c, true, false), transparent: true, depthWrite: false }));
    cr.position.set(TANKS.zero.x, 2.4, TANKS.zero.z + 1.52);
    k.g.add(cr);
  }
  // hoses and cables over the floor, the hum of the pumps
  for (let i = 0; i < 10; i++) {
    const z0 = -26 + i * 5;
    put(k, new THREE.CylinderGeometry(0.08, 0.08, 6.5, 6).rotateZ(Math.PI / 2), M.paint(0x1a1a1a, 0.8, 0), 0, 0.09, z0 + rng.next(), 0, false);
  }
  signBoard(k, 'PALEWATER · CONTAINMENT · AUTHORISED PERSONNEL', 0, 6.2, H.z0 + 0.42, 0, 6.4, 0.5, { bg: '#0e1a14', fg: '#7affb0', lit: true });

  // ---------------------------------------------------------------------- the service stairs (south) up toward the river
  {
    const S = TANKS.stairs;
    k.stairs(S.x0, S.x1, H.z1, S.z1, 'z', 0, 4.2, iron, { walls: true });
    k.deck(S.x0 - 0.5, S.x1 + 0.5, S.z1, S.z1 + 3, 4.2, M.deckPlate(), iron, { thick: 0.3, name: 'stair top' });
    k.solid([S.x0 - 0.7, S.x1 + 0.7, 0, 8, S.z1 + 3, S.z1 + 3.2], wall, { kind: 'wall' });
    k.solid([S.x0 - 0.7, S.x0 - 0.5, 0, 8, H.z1, S.z1 + 3], wall, { kind: 'wall' });
    k.solid([S.x1 + 0.5, S.x1 + 0.7, 0, 8, H.z1, S.z1 + 3], wall, { kind: 'wall' });
    // daylight at the top: the door out, grey and cold
    const day = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6), new THREE.MeshBasicMaterial({ color: 0xd8dce4 }));
    day.position.set(0, 4.2 + 1.3, S.z1 + 2.98);
    day.rotation.y = Math.PI;
    k.g.add(day);
    k.spot([0, 6.4, S.z1 + 1.5], 0xd8e0f0, 30, 10);
    signBoard(k, 'EXIT · RIVER DOCK', 0, 7.0, S.z1 + 2.96, Math.PI, 1.8, 0.3, { bg: '#1a6a3a', fg: '#e8f0e8' });
  }

  // ---------------------------------------------------------------------- the alarm: red beacons along the walls
  for (const [x, z] of [[H.x0 + 0.2, -20], [H.x1 - 0.2, -20], [H.x0 + 0.2, 6], [H.x1 - 0.2, 6]] as [number, number][]) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3.6, 12, 1, true).translate(0, -1.8, 0).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff1a10, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    b.position.set(x, 5.6, z);
    k.g.add(b);
    tankStage.beacons.push(b);
    const s = k.spot([x, 5.4, z], 0xff2010, 30, 12, { mod: () => (tankStage.alarm ? 0.5 + 0.5 * Math.abs(Math.sin(performance.now() / 250)) : 0) });
    void s;
  }
  // the hall's own light: cold strips overhead, the tanks' green below
  for (let z = H.z0 + 4; z < H.z1; z += 8) for (const x of [-4, 4]) {
    k.spot([x, CEIL - 0.4, z], 0xc8e8d8, 26, 11, { flicker: z === H.z0 + 20 && x === 4 ? 0.3 : 0 });
    put(k, new THREE.BoxGeometry(0.3, 0.06, 2.4), M.glow(0xd8f0e0, 1.4), x, CEIL - 0.05, z, 0, false);
  }
  // doors for whoever comes running (minions): the corridor's mouth, the stairs' foot
  a.doors.push({ x: 0, z: H.z0 - 6, ix: 0, iz: H.z0 + 3, yaw: 0, width: 2.4 });
  a.doors.push({ x: 0, z: H.z1 + 6, ix: 0, iz: H.z1 - 3, yaw: Math.PI, width: 2.4 });

  const hemi = new THREE.HemisphereLight(0x9ad8b8, 0x1a2420, 1.4);
  k.g.add(hemi);
  k.keyLight(0xc8f0d8, 0.5, new THREE.Vector3(0.2, 1, 0.3), 30);
  // bubbles rising in the tanks
  const bub = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 900 }, (_, i) => {
      const t = Math.floor(i / 3);
      const ti = t % 14;
      const tx = ti < 12 ? TANKS.rows[ti % 2] : 0, tz = ti < 12 ? TANKS.rowZ[Math.floor(ti / 2)] : ti === 12 ? TANKS.ivyTank.z : TANKS.zero.z;
      return i % 3 === 0 ? tx + (rng.next() - 0.5) * 1.2 : i % 3 === 1 ? 0.6 + rng.next() * 2.4 : tz + (rng.next() - 0.5) * 1.2;
    }), 3)),
    new THREE.PointsMaterial({ color: 0xc8ffd8, size: 0.05, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  k.g.add(bub);
  const parts = k.finish({
    hemi,
    probe: new THREE.Vector3(0, 2, -6),
    update: (dt) => {
      const pos = bub.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * (0.3 + (i % 5) * 0.08);
        if (y > 3.0) y = 0.6;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      // Ivy's tank drains
      tankStage.ivyLevel += (tankStage.ivyWant - tankStage.ivyLevel) * Math.min(1, dt * 0.6);
      const lq = tankStage.ivyLiquid;
      if (lq) {
        lq.scale.y = Math.max(0.02, tankStage.ivyLevel);
        lq.position.y = 0.5 + (2.7 * lq.scale.y) / 2 + 0.05;
      }
      if (tankStage.zeroBroken && tankStage.zeroGlass) tankStage.zeroGlass.visible = false;
      for (const b of tankStage.beacons) {
        (b.material as THREE.MeshBasicMaterial).opacity = tankStage.alarm ? 0.15 : 0;
        b.rotation.y += dt * 5;
      }
    },
  });
  return parts;
}
