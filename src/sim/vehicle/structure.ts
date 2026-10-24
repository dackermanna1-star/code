// Generates the node-beam lattice of a vehicle from its parametric shape.
//
// The body is a tube of stations (cross-section rings) along the length.
// Each ring has 11 nodes: sills, mid-sides, shoulders, roof/hood edges,
// top center and two floor rails. Doors, hood, trunk lid and bumpers are
// separate parts made of ring nodes in their region, tied to the body with
// hinge/latch/support beams so they can bend, swing open or tear off.

import {
  SoftBodyBuilder,
  SoftBody,
  BEAM_ATTACH,
  BEAM_SUPPORT,
  BEAM_NODEFORM,
  Mat,
  type BeamOptions,
} from '../softbody.ts';
import { BodyShape, type Section } from './shape.ts';
import type { VehicleDef, SuspensionDef } from './defs.ts';

export const RING = 11;
export const L0 = 0, L1 = 1, L2 = 2, L3 = 3, T = 4, R3 = 5, R2 = 6, R1 = 7, R0 = 8, FR = 9, FL = 10;

export const Zone = {
  NONE: 0,
  FRONT: 1,
  REAR: 2,
  LEFT: 3,
  RIGHT: 4,
  ROOF: 5,
  FLOOR: 6,
  ENGINE: 7,
} as const;

export interface StationInfo {
  z: number;
  door: number; // door index for door columns, -1 otherwise
  kind: string;
  section: Section;
  nodes: Int32Array; // RING node ids
}

export interface WheelMountDef {
  name: string;
  side: number; // +1 left, -1 right
  front: boolean;
  nodes: Int32Array;
  mountW: Float64Array;
  forceW: Float64Array;
  restMount: Float64Array;
  restCenter: Float64Array;
  susp: SuspensionDef;
  /** Beams around the mount: when most break, the wheel tears off. */
  mountBeams: Int32Array;
}

export interface WindowDef {
  name: string;
  /** Corner nodes (impact proximity). */
  nodes: number[];
  /** Frame beams: plastic strain here breaks the glass. */
  beams: number[];
  laminated: boolean;
}

export interface LightDef {
  name: string;
  nodes: number[];
  beams: number[];
  kind: 'head' | 'tail';
  side: number;
}

export interface VehicleStructure {
  body: SoftBody;
  shape: BodyShape;
  stations: StationInfo[];
  engineNodes: number[];
  partIds: Record<string, number>;
  wheels: WheelMountDef[];
  refNodes: number[];
  windows: WindowDef[];
  lights: LightDef[];
  /** Node used to track radiator/front intrusion vs engine. */
  radiatorNodes: number[];
  firewallNodes: number[];
  fuelTankNodes: number[];
}

interface StationCand {
  z: number;
  door: number;
  kind: string;
}

// Beam categories ------------------------------------------------------------

interface Cat {
  k: number;
  c: number;
  yieldC: number;
  yieldT: number;
  strength?: number;
  flags?: number;
}

function cats(def: VehicleDef) {
  const s = def.structure;
  const st = s.stiffness;
  const y = s.strength * 1.0;
  const massScale = def.mass / 1500;
  const cr = s.crumple;
  return {
    frame: { k: 1.7e6 * st * massScale, c: 320, yieldC: 62000 * y * massScale, yieldT: 90000 * y * massScale } as Cat,
    frameCrumple: { k: 1.4e6 * st * massScale, c: 280, yieldC: 30000 * y * cr * massScale, yieldT: 60000 * y * massScale } as Cat,
    body: { k: 1.0e6 * st * massScale, c: 220, yieldC: 30000 * y * massScale, yieldT: 45000 * y * massScale } as Cat,
    bodyCrumple: { k: 8.0e5 * st * massScale, c: 200, yieldC: 15000 * y * cr * massScale, yieldT: 30000 * y * massScale } as Cat,
    roof: { k: 8.0e5 * st * massScale, c: 180, yieldC: 22000 * y * s.roof * massScale, yieldT: 32000 * y * massScale } as Cat,
    pillar: { k: 1.0e6 * st * massScale, c: 220, yieldC: 34000 * y * s.roof * massScale, yieldT: 50000 * y * massScale } as Cat,
    diag: { k: 6.0e5 * st * massScale, c: 160, yieldC: 18000 * y * massScale, yieldT: 26000 * y * massScale } as Cat,
    diagCrumple: { k: 5.0e5 * st * massScale, c: 150, yieldC: 10000 * y * cr * massScale, yieldT: 20000 * y * massScale } as Cat,
    panel: { k: 3.5e5 * st, c: 90, yieldC: 7000 * y * s.panels, yieldT: 12000 * y * s.panels } as Cat,
    doorPanel: { k: 4.5e5 * st, c: 110, yieldC: 15000 * y * s.panels, yieldT: 22000 * y * s.panels } as Cat,
    bumper: { k: 3.5e5 * st, c: 90, yieldC: 6000 * y, yieldT: 9000 * y } as Cat,
    bumperAttach: { k: 4.0e5 * st, c: 100, yieldC: 9000 * y, yieldT: 9000 * y, strength: 24000 * y, flags: BEAM_ATTACH } as Cat,
    hinge: { k: 4.5e5 * st, c: 110, yieldC: 20000 * y, yieldT: 20000 * y, strength: 30000 * y, flags: BEAM_ATTACH } as Cat,
    latch: { k: 4.0e5 * st, c: 100, yieldC: 14000 * y, yieldT: Infinity, strength: 15000 * y, flags: BEAM_ATTACH } as Cat,
    support: { k: 2.5e5 * st, c: 70, yieldC: 9000 * y, yieldT: Infinity, flags: BEAM_SUPPORT } as Cat,
    softSupport: { k: 8.0e4 * st, c: 40, yieldC: 4000 * y, yieldT: Infinity, flags: BEAM_SUPPORT } as Cat,
    engine: { k: 2.5e6, c: 400, yieldC: Infinity, yieldT: Infinity, flags: BEAM_NODEFORM } as Cat,
    engineMount: { k: 3.5e5 * massScale, c: 140, yieldC: 40000 * massScale, yieldT: 40000 * massScale, strength: 110000 * massScale } as Cat,
  };
}

export function buildVehicleStructure(def: VehicleDef): VehicleStructure {
  const shape = new BodyShape(def.shape);
  const P = def.shape;
  const zF = shape.zFront, zR = shape.zRear;
  const C = cats(def);

  // ---------------------------------------------------------------- stations
  const cands: StationCand[] = [];
  const tryAdd = (z: number, kind: string, door = -1, tol = 0.12) => {
    if (z > zF + 1e-6 || z < zR - 1e-6) return;
    for (const c of cands) if (Math.abs(c.z - z) < tol) return;
    cands.push({ z, door, kind });
  };
  tryAdd(zF, 'faceF', -1, 0);
  tryAdd(zR, 'faceR', -1, 0);
  // door edges are pillars; door columns sit just inside the edges
  P.doors.forEach(([df, dr]) => {
    tryAdd(df, 'pillar', -1, 0.02);
    tryAdd(dr, 'pillar', -1, 0.02);
  });
  P.doors.forEach(([df, dr], i) => {
    const inset = 0.08;
    const len = df - dr - 2 * inset;
    const cols = Math.max(2, Math.ceil(len / 0.5) + 1);
    for (let c = 0; c < cols; c++) {
      const t = c / (cols - 1);
      tryAdd(df - inset - t * len, 'door', i, 0.04);
    }
  });
  for (const za of [P.zFrontAxle, P.zRearAxle]) {
    tryAdd(za, 'axle');
    tryAdd(za + P.archRadius + 0.03, 'arch');
    tryAdd(za - P.archRadius - 0.03, 'arch');
  }
  tryAdd(zF - P.bumperLen, 'bumperMount');
  tryAdd(zR + P.bumperLen, 'bumperMount');
  tryAdd(P.zWindshieldBase, 'cowl');
  tryAdd(P.zRoofFront, 'roofFront');
  tryAdd(P.zRoofRear, 'roofRear');
  tryAdd(P.zRearWindowBase, 'rearWindow');
  if (P.zCabRear !== undefined) {
    tryAdd(P.zCabRear, 'cabRear');
    tryAdd(P.zCabRear - 0.12, 'bedFront');
  }
  tryAdd(zF - P.bumperLen * 0.5, 'bumperMid');
  tryAdd(zR + P.bumperLen * 0.5, 'bumperMid');
  cands.sort((a, b) => b.z - a.z);
  // fill gaps
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < cands.length - 1; i++) {
      const gap = cands[i].z - cands[i + 1].z;
      if (gap > 0.5) {
        cands.splice(i + 1, 0, { z: (cands[i].z + cands[i + 1].z) / 2, door: -1, kind: 'fill' });
      }
    }
  }
  // make sure door columns that ended up outside any door get cleared
  for (const c of cands) {
    if (c.door >= 0) {
      const [df, dr] = P.doors[c.door];
      if (c.z > df - 0.02 || c.z < dr + 0.02) c.door = -1;
    } else {
      // fill stations inside a door span become door columns
      const d = shape.doorAt(c.z);
      if (d >= 0) {
        const [df, dr] = P.doors[d];
        if (c.z < df - 0.03 && c.z > dr + 0.03) c.door = d;
      }
    }
  }

  // ---------------------------------------------------------------- parts
  const b = new SoftBodyBuilder();
  const partIds: Record<string, number> = {};
  partIds.body = b.addPart('body', 'body', 1);
  partIds.hood = b.addPart('hood', 'hood', 0.75);
  const hasTrunk = cands.some((c) => shape.isDeck(c.z) && c.door < 0);
  partIds.trunk = hasTrunk ? b.addPart('trunk', 'trunk', 0.75) : -1;
  partIds.bumperF = b.addPart('bumperF', 'bumper', 0.6);
  partIds.bumperR = b.addPart('bumperR', 'bumper', 0.6);
  const doorPart: number[][] = []; // [doorIndex][side 0=left,1=right]
  P.doors.forEach((_, i) => {
    const front = i === 0;
    const l = b.addPart(`door${front ? 'F' : 'R'}L`, 'door', 0.75);
    const r = b.addPart(`door${front ? 'F' : 'R'}R`, 'door', 0.75);
    partIds[`door${front ? 'F' : 'R'}L`] = l;
    partIds[`door${front ? 'F' : 'R'}R`] = r;
    doorPart.push([l, r]);
  });
  partIds.engine = b.addPart('engine', 'engine', 0.7);

  // ---------------------------------------------------------------- nodes
  const stations: StationInfo[] = [];
  const zHoodRear = P.zWindshieldBase + 0.04;
  const zHoodFront = zF - 0.05;
  const isHoodZ = (z: number) => z > zHoodRear && z < zHoodFront && shape.greenhouse(z) < 0.05;
  const isTrunkZ = (z: number) => hasTrunk && shape.isDeck(z) && z > zR + 0.05 && z < P.zRearWindowBase - 0.04;
  const isBumperFZ = (z: number) => z > zF - P.bumperLen + 0.02;
  const isBumperRZ = (z: number) => z < zR + P.bumperLen - 0.02;

  const nodeRole: string[] = []; // per node, for mass distribution
  const nodeStation: number[] = [];
  const nodeRingIdx: number[] = [];

  for (let si = 0; si < cands.length; si++) {
    const cd = cands[si];
    const z = cd.z;
    const sec = shape.section(z, shape.newSection());
    const hw = shape.halfWidth(z);
    const ids = new Int32Array(RING).fill(-1);
    const floorY = shape.sillY(z) + 0.035;
    const railX = Math.min(0.46, hw * 0.52);
    const pos: [number, number][] = [];
    pos[L0] = [sec.x[0], sec.y[0]];
    pos[L1] = [sec.x[1], sec.y[1]];
    pos[L2] = [sec.x[3], sec.y[3]];
    pos[L3] = [sec.x[4], sec.y[4]];
    pos[T] = [0, sec.y[5]];
    pos[FL] = [railX, floorY];
    if (shape.inBed(z)) {
      // open bed: inner bottom corner and floor center
      const bf = P.bedFloorY ?? 0.9;
      pos[L3] = [hw - 0.1, bf + 0.04];
      pos[T] = [0, bf];
    }
    // mirrored
    pos[R0] = [-pos[L0][0], pos[L0][1]];
    pos[R1] = [-pos[L1][0], pos[L1][1]];
    pos[R2] = [-pos[L2][0], pos[L2][1]];
    pos[R3] = [-pos[L3][0], pos[L3][1]];
    pos[FR] = [-pos[FL][0], pos[FL][1]];

    for (let k = 0; k < RING; k++) {
      let part = partIds.body;
      let role = 'body';
      const isTop = k === L3 || k === T || k === R3;
      const isLower = k === L0 || k === L1 || k === R0 || k === R1 || k === FL || k === FR;
      if (cd.door >= 0 && (k === L1 || k === L2)) {
        part = doorPart[cd.door][0];
        role = 'door';
      } else if (cd.door >= 0 && (k === R1 || k === R2)) {
        part = doorPart[cd.door][1];
        role = 'door';
      } else if (isTop && isHoodZ(z)) {
        part = partIds.hood;
        role = 'hood';
      } else if (isTop && isTrunkZ(z)) {
        part = partIds.trunk;
        role = 'trunk';
      } else if (isLower && isBumperFZ(z) && pos[k][1] < P.bumperTopFront) {
        part = partIds.bumperF;
        role = 'bumper';
      } else if (isLower && isBumperRZ(z) && pos[k][1] < P.bumperTopRear) {
        part = partIds.bumperR;
        role = 'bumper';
      } else {
        if (k === FL || k === FR) role = 'floor';
        else if (k === L0 || k === R0) role = 'sill';
        else if (k === T || k === L3 || k === R3) role = 'top';
        else role = 'side';
      }
      const material = role === 'bumper' ? Mat.PLASTIC : Mat.METAL;
      const id = b.addNode(pos[k][0], pos[k][1], z, {
        mass: 1,
        part,
        material,
        friction: role === 'bumper' ? 0.45 : 0.5,
      });
      ids[k] = id;
      nodeRole[id] = role;
      nodeStation[id] = si;
      nodeRingIdx[id] = k;
    }
    stations.push({ z, door: cd.door, kind: cd.kind, section: sec, nodes: ids });
  }
  const NS = stations.length;
  const partOf = (id: number) => b.nodes[id].o.part ?? 0;

  // ---------------------------------------------------------------- engine
  const engineNodes: number[] = [];
  {
    const za = P.zFrontAxle;
    const zc = za + 0.05;
    const hw = 0.27;
    const floorY = shape.sillY(za) + 0.07;
    const topY = Math.min(shape.shoulderY(za) - 0.08, floorY + 0.55);
    const len = 0.32;
    for (const x of [hw, -hw]) {
      for (const y of [floorY, topY]) {
        for (const z of [zc + len, zc - len]) {
          const id = b.addNode(x, y, z, { mass: def.engine.mass / 8, part: partIds.engine, material: Mat.METAL, friction: 0.5 });
          engineNodes.push(id);
          nodeRole[id] = 'engine';
        }
      }
    }
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) b.addBeam(engineNodes[i], engineNodes[j], { ...C.engine, part: partIds.engine, zone: Zone.ENGINE });
  }

  // ---------------------------------------------------------------- masses
  const doorMass = 20 * (def.mass / 1500);
  const hoodMass = 15 * (def.mass / 1500);
  const trunkMass = 11 * (def.mass / 1500);
  const bumperMass = 7 * (def.mass / 1500);
  const partMass = new Map<number, number>();
  for (const dp of doorPart) {
    partMass.set(dp[0], doorMass);
    partMass.set(dp[1], doorMass);
  }
  partMass.set(partIds.hood, hoodMass);
  if (partIds.trunk >= 0) partMass.set(partIds.trunk, trunkMass);
  partMass.set(partIds.bumperF, bumperMass);
  partMass.set(partIds.bumperR, bumperMass);
  let partsTotal = def.engine.mass;
  for (const [pid, m] of partMass) if (b.parts[pid].nodes.length > 0) partsTotal += m;
  const bodyTarget = def.mass - partsTotal - 2 * def.unsprungMass;
  const roleWeight: Record<string, number> = { floor: 3.4, sill: 3.0, side: 1.5, top: 1.0, body: 1.5 };
  let wsum = 0;
  for (const id of b.parts[partIds.body].nodes) wsum += roleWeight[nodeRole[id]] ?? 1.5;
  for (const id of b.parts[partIds.body].nodes) {
    b.nodes[id].o.mass = Math.max(2.5, (bodyTarget * (roleWeight[nodeRole[id]] ?? 1.5)) / wsum);
  }
  for (const [pid, m] of partMass) {
    const ns = b.parts[pid].nodes;
    for (const id of ns) b.nodes[id].o.mass = Math.max(1.5, m / ns.length);
  }

  // ---------------------------------------------------------------- beams
  const zFirewall = P.zWindshieldBase;
  const zRearBulk = Math.max(P.zRearWindowBase, P.zRearAxle + P.archRadius + 0.05);
  const isCrumpleZ = (z: number) => z > zFirewall + 0.15 || z < Math.min(zRearBulk, P.zRearAxle) - 0.1;
  const zoneFor = (a: number, c: number): number => {
    const za = b.nodes[a].z, zc = b.nodes[c].z;
    const zm = (za + zc) / 2;
    const ka = nodeRingIdx[a], kc = nodeRingIdx[c];
    const xm = (b.nodes[a].x + b.nodes[c].x) / 2;
    if (zm > zFirewall) return Zone.FRONT;
    if (zm < zRearBulk) return Zone.REAR;
    const top = (k: number) => k === L3 || k === T || k === R3;
    if (top(ka) && top(kc)) return Zone.ROOF;
    if (xm > 0.3) return Zone.LEFT;
    if (xm < -0.3) return Zone.RIGHT;
    return Zone.FLOOR;
  };

  const hingeStationOf = new Map<number, { hinge: Set<number>; latch: Set<number> }>();
  const partStations = (pid: number) => {
    const set = new Set<number>();
    for (const id of b.parts[pid].nodes) set.add(nodeStation[id]);
    return [...set].sort((x, y) => x - y);
  };
  // stations are sorted front (index 0) to rear
  const registerHinges = (pid: number, hingeAtFront: boolean) => {
    if (pid < 0) return;
    const ss = partStations(pid);
    if (!ss.length) return;
    const first = ss[0], last = ss[ss.length - 1];
    const frontS = first - 1, rearS = last + 1;
    const hinge = new Set<number>(), latch = new Set<number>();
    if (hingeAtFront) {
      if (frontS >= 0) hinge.add(frontS);
      if (rearS < NS) latch.add(rearS);
    } else {
      if (rearS < NS) hinge.add(rearS);
      if (frontS >= 0) latch.add(frontS);
    }
    hingeStationOf.set(pid, { hinge, latch });
  };
  for (const dp of doorPart) {
    registerHinges(dp[0], true);
    registerHinges(dp[1], true);
  }
  registerHinges(partIds.hood, false); // hood hinges at the cowl (rear)
  registerHinges(partIds.trunk, true); // trunk hinges at the rear window (front)

  const isSurfaceDiag = new Set<string>();
  const key = (a: number, c: number) => (a < c ? a + ',' + c : c + ',' + a);

  const addClassified = (a: number, c: number, diag: boolean, extraFlags = 0) => {
    if (a < 0 || c < 0 || a === c) return;
    const pa = partOf(a), pc = partOf(c);
    const body = partIds.body;
    const za = b.nodes[a].z, zc = b.nodes[c].z;
    const crumple = isCrumpleZ((za + zc) / 2);
    let cat: Cat;
    let part = pa;
    if (pa === pc) {
      if (pa === body) {
        const ra = nodeRole[a], rc = nodeRole[c];
        const frameish = (r: string) => r === 'floor' || r === 'sill';
        const ka = nodeRingIdx[a], kc = nodeRingIdx[c];
        const top = (k: number) => k === L3 || k === T || k === R3;
        const sa = nodeStation[a], sc = nodeStation[c];
        const g = shape.greenhouse((za + zc) / 2);
        if (diag) cat = crumple ? C.diagCrumple : C.diag;
        else if (frameish(ra) && frameish(rc)) cat = crumple ? C.frameCrumple : C.frame;
        else if (top(ka) && top(kc) && g > 0.3) {
          // along the windshield and rear window edges these are the A- and C-pillars
          const zm = (za + zc) / 2;
          const aPillar = zm < P.zWindshieldBase && zm > P.zRoofFront;
          const cPillar = zm < P.zRoofRear && zm > P.zRearWindowBase;
          cat = ka !== T && kc !== T && (aPillar || cPillar) ? C.pillar : C.roof;
        }
        else if (sa === sc && g > 0.3 && ((ka === L2 && kc === L3) || (ka === L3 && kc === L2) || (ka === R2 && kc === R3) || (ka === R3 && kc === R2))) {
          // pillars only at pillar-ish stations
          const kind = stations[sa].kind;
          cat = kind === 'pillar' || kind === 'cowl' || kind === 'roofFront' || kind === 'roofRear' || kind === 'rearWindow' ? C.pillar : C.roof;
        } else cat = crumple ? C.bodyCrumple : C.body;
      } else if (pa === partIds.engine) {
        cat = C.engine;
      } else if (pa === partIds.bumperF || pa === partIds.bumperR) {
        cat = C.bumper;
      } else {
        cat = b.parts[pa].role === 'door' ? C.doorPanel : C.panel;
      }
    } else {
      // cross-part beam
      const other = pa === body ? pc : pc === body ? pa : -1;
      const bodyNode = pa === body ? a : pc === body ? c : -1;
      if (other >= 0 && bodyNode >= 0) {
        part = other;
        const role = b.parts[other].role;
        if (role === 'bumper') {
          cat = C.bumperAttach;
        } else if (role === 'engine') {
          cat = C.engineMount;
        } else {
          const hs = hingeStationOf.get(other);
          const st = nodeStation[bodyNode];
          if (hs && hs.hinge.has(st)) cat = C.hinge;
          else if (hs && hs.latch.has(st)) cat = C.latch;
          else cat = role === 'door' ? C.support : C.support;
        }
      } else {
        // part to part (door to door across cabin, etc.)
        cat = C.softSupport;
        part = pa;
      }
    }
    const o: BeamOptions = {
      k: cat.k,
      c: cat.c,
      yieldC: cat.yieldC,
      yieldT: cat.yieldT,
      strength: cat.strength,
      flags: (cat.flags ?? 0) | extraFlags,
      part,
      zone: zoneFor(a, c),
      maxStretch: 1.45,
      minRatio: 0.22,
    };
    const id = b.addBeam(a, c, o);
    if (id >= 0 && diag) isSurfaceDiag.add(key(a, c));
  };

  const ringEdges: [number, number][] = [];
  for (let k = 0; k < RING; k++) ringEdges.push([k, (k + 1) % RING]);

  for (let s = 0; s < NS; s++) {
    const st = stations[s];
    const n = st.nodes;
    // ring
    for (const [p, q] of ringEdges) addClassified(n[p], n[q], false);
    // cross members
    addClassified(n[L1], n[R1], false);
    addClassified(n[L2], n[R2], false);
    addClassified(n[L3], n[R3], false);
    addClassified(n[L0], n[R0], false);
    const bulk = st.kind === 'faceF' || st.kind === 'faceR' || st.kind === 'bumperMount' || st.kind === 'axle' || st.kind === 'cowl' || st.kind === 'pillar' || st.kind === 'rearWindow' || st.kind === 'cabRear' || st.kind === 'bedFront' || st.kind === 'arch';
    // floor/side bracing present everywhere (seats, tunnel)
    addClassified(n[FL], n[L1], false);
    addClassified(n[FR], n[R1], false);
    addClassified(n[FL], n[R0], false);
    addClassified(n[FR], n[L0], false);
    if (bulk) {
      addClassified(n[FL], n[L2], false);
      addClassified(n[FR], n[R2], false);
      addClassified(n[L0], n[L2], false);
      addClassified(n[R0], n[R2], false);
      addClassified(n[L1], n[L3], false);
      addClassified(n[R1], n[R3], false);
      if (st.kind !== 'axle' && st.kind !== 'arch' || shape.greenhouse(st.z) > 0.3) {
        addClassified(n[FL], n[T], false);
        addClassified(n[FR], n[T], false);
        addClassified(n[L2], n[T], false);
        addClassified(n[R2], n[T], false);
      }
    } else {
      addClassified(n[L1], n[L3], false);
      addClassified(n[R1], n[R3], false);
    }
  }
  for (let s = 0; s < NS - 1; s++) {
    const a = stations[s].nodes, c = stations[s + 1].nodes;
    for (let k = 0; k < RING; k++) addClassified(a[k], c[k], false);
    for (const [p, q] of ringEdges) {
      addClassified(a[p], c[q], true);
      addClassified(a[q], c[p], true);
    }
    // through-section diagonals between stations for torsion stiffness
    addClassified(a[L0], c[R1], true);
    addClassified(a[R0], c[L1], true);
    addClassified(a[FL], c[L2], true);
    addClassified(a[FR], c[R2], true);
    // full-height side shear webs (sill to roof rail): keep the cabin stiff
    // in bending where doors and windows interrupt the side panels
    addClassified(a[L0], c[L3], true);
    addClassified(a[L3], c[L0], true);
    addClassified(a[R0], c[R3], true);
    addClassified(a[R3], c[R0], true);
  }
  for (let s = 0; s < NS - 2; s++) {
    const a = stations[s].nodes, c = stations[s + 2].nodes;
    for (const k of [L0, R0, FL, FR, L2, R2, L3, R3, T]) {
      // skip-beams only within the same part
      if (partOf(a[k]) === partOf(c[k])) addClassified(a[k], c[k], false);
    }
  }

  // engine mounts: connect each engine node to nearest body nodes
  for (const en of engineNodes) {
    const e = b.nodes[en];
    const near: { id: number; d: number }[] = [];
    for (const id of b.parts[partIds.body].nodes) {
      const r = nodeRole[id];
      if (r !== 'floor' && r !== 'sill' && r !== 'side') continue;
      const nd = b.nodes[id];
      const d = Math.hypot(nd.x - e.x, nd.y - e.y, nd.z - e.z);
      near.push({ id, d });
    }
    near.sort((x, y) => x.d - y.d);
    for (let i = 0; i < 3 && i < near.length; i++) addClassified(en, near[i].id, false);
  }

  // ---------------------------------------------------------------- collision triangles
  for (let s = 0; s < NS - 1; s++) {
    const a = stations[s].nodes, c = stations[s + 1].nodes;
    for (const [p, q] of ringEdges) {
      const ids = [a[p], a[q], c[q], c[p]];
      const parts = ids.map(partOf);
      const nonBody = parts.find((x) => x !== partIds.body) ?? partIds.body;
      b.addQuad(a[p], a[q], c[q], c[p], nonBody);
    }
  }
  for (const s of [0, NS - 1]) {
    const n = stations[s].nodes;
    for (const [p, q] of ringEdges) {
      if (p === T || q === T) continue;
      const parts = [n[T], n[p], n[q]].map(partOf);
      const nonBody = parts.find((x) => x !== partIds.body) ?? partIds.body;
      b.addTri(n[T], n[p], n[q], nonBody);
    }
  }
  // engine block faces for collisions with other bodies
  {
    const e = engineNodes;
    const f = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
    for (const q of f) b.addQuad(e[q[0]], e[q[1]], e[q[2]], e[q[3]], partIds.engine);
  }

  const body = b.build(true);
  // fix triangle orientation for bed (concave): orient by the station's ring centroid instead
  orientTrianglesByRing(body, stations);
  body.kind = 'vehicle';
  calibrateCrush(body, stations, def, partIds.body);

  // ---------------------------------------------------------------- wheels
  const wheels: WheelMountDef[] = [];
  const wdefs: [string, number, boolean][] = [['FL', 1, true], ['FR', -1, true], ['RL', 1, false], ['RR', -1, false]];
  for (const [name, side, front] of wdefs) {
    const susp = front ? def.suspFront : def.suspRear;
    const za = front ? P.zFrontAxle : P.zRearAxle;
    const cx = side * P.track / 2;
    const cy = P.wheelY;
    const mount = new Float64Array([cx - side * 0.13, cy + susp.mountHeight, za]);
    const center = new Float64Array([cx - side * 0.04, cy + 0.02, za]);
    const cand: { id: number; d: number }[] = [];
    for (let s = 0; s < NS; s++) {
      const st = stations[s];
      if (Math.abs(st.z - za) > 0.75) continue;
      const ks = side > 0 ? [L0, L1, L2, FL] : [R0, R1, R2, FR];
      for (const k of ks) {
        const id = st.nodes[k];
        if (partOf(id) !== partIds.body) continue;
        const r = body.rest;
        const d = Math.hypot(r[id * 3] - mount[0], r[id * 3 + 1] - mount[1], r[id * 3 + 2] - mount[2]);
        cand.push({ id, d });
      }
    }
    cand.sort((x, y) => x.d - y.d);
    const sel = cand.slice(0, 10).map((c) => c.id);
    const nodes = new Int32Array(sel);
    const mountW = affineWeights(body.rest, nodes, mount);
    const forceW = affineWeights(body.rest, nodes, center);
    // beams among/around mount nodes
    const selSet = new Set(sel);
    const mb: number[] = [];
    for (let bi = 0; bi < body.m; bi++) {
      if (selSet.has(body.bA[bi]) && selSet.has(body.bB[bi])) mb.push(bi);
    }
    wheels.push({ name, side, front, nodes, mountW, forceW, restMount: mount, restCenter: center, susp, mountBeams: new Int32Array(mb) });
  }

  // ---------------------------------------------------------------- reference nodes (cabin floor)
  const refNodes: number[] = [];
  for (const st of stations) {
    if (st.z < P.zFrontAxle - 0.2 && st.z > P.zRearAxle + 0.2) {
      refNodes.push(st.nodes[FL], st.nodes[FR], st.nodes[L0], st.nodes[R0]);
    }
  }

  // ---------------------------------------------------------------- windows & lights
  const nearestStation = (z: number) => {
    let best = 0;
    for (let s = 1; s < NS; s++) if (Math.abs(stations[s].z - z) < Math.abs(stations[best].z - z)) best = s;
    return best;
  };
  const beamsAmong = (ns: Set<number>) => {
    const out: number[] = [];
    for (let bi = 0; bi < body.m; bi++) if (ns.has(body.bA[bi]) && ns.has(body.bB[bi])) out.push(bi);
    return out;
  };
  const frameSet = (s0: number, s1: number, ks: number[]) => {
    const set = new Set<number>();
    for (let s = Math.min(s0, s1); s <= Math.max(s0, s1); s++) for (const k of ks) set.add(stations[s].nodes[k]);
    return set;
  };
  const windows: WindowDef[] = [];
  {
    const sb = nearestStation(P.zWindshieldBase), st = nearestStation(P.zRoofFront);
    windows.push({
      name: 'windshield',
      nodes: [stations[sb].nodes[L2], stations[sb].nodes[R2], stations[st].nodes[L3], stations[st].nodes[R3], stations[st].nodes[T]],
      beams: beamsAmong(frameSet(sb, st, [L2, L3, T, R3, R2])),
      laminated: true,
    });
    if (P.zRoofRear - P.zRearWindowBase > 0.05 || P.style === 'van' || P.style === 'suv' || P.style === 'hatch') {
      const rt = nearestStation(P.zRoofRear), rb = nearestStation(P.zRearWindowBase);
      if (rt !== rb) {
        windows.push({
          name: 'rear',
          nodes: [stations[rt].nodes[L3], stations[rt].nodes[R3], stations[rb].nodes[L2], stations[rb].nodes[R2]],
          beams: beamsAmong(frameSet(rt, rb, [L2, L3, T, R3, R2])),
          laminated: false,
        });
      }
    }
    P.doors.forEach((_, di) => {
      const cols = stations.map((s, i) => (s.door === di ? i : -1)).filter((i) => i >= 0);
      if (cols.length < 2) return;
      const a = cols[0], c = cols[cols.length - 1];
      for (const side of [1, -1]) {
        const k2 = side > 0 ? L2 : R2, k3 = side > 0 ? L3 : R3;
        windows.push({
          name: `side${di === 0 ? 'F' : 'R'}${side > 0 ? 'L' : 'R'}`,
          nodes: [stations[a].nodes[k2], stations[a].nodes[k3], stations[c].nodes[k2], stations[c].nodes[k3]],
          // the door's own window frame; the cowl ahead and pillar behind are not part of it
          beams: beamsAmong(frameSet(a, c, [k2, k3])),
          laminated: false,
        });
      }
    });
  }
  const lights: LightDef[] = [];
  for (const [kind, s] of [['head', 0], ['tail', NS - 1]] as ['head' | 'tail', number][]) {
    const s2 = kind === 'head' ? 1 : NS - 2;
    for (const side of [1, -1]) {
      const ks = side > 0 ? [L1, L2, L3] : [R1, R2, R3];
      const ns = new Set<number>();
      for (const k of ks) {
        ns.add(stations[s].nodes[k]);
        ns.add(stations[s2].nodes[k]);
      }
      lights.push({ name: `${kind}${side > 0 ? 'L' : 'R'}`, kind, side, nodes: [...ns], beams: beamsAmong(ns) });
    }
  }

  // radiator/firewall tracking
  const frontMount = stations.findIndex((s) => s.kind === 'bumperMount');
  const radiatorNodes = frontMount >= 0 ? [stations[frontMount].nodes[FL], stations[frontMount].nodes[FR], stations[frontMount].nodes[L1], stations[frontMount].nodes[R1]] : [];
  let fwIdx = 0;
  for (let s = 0; s < NS; s++) if (stations[s].z >= P.zWindshieldBase - 0.01) fwIdx = s;
  const firewallNodes = [stations[fwIdx].nodes[FL], stations[fwIdx].nodes[FR], stations[fwIdx].nodes[L2], stations[fwIdx].nodes[R2]];
  const tankS = stations.findIndex((s) => s.z < P.zRearAxle + 0.1);
  const fuelTankNodes = tankS >= 0 ? [stations[tankS].nodes[FL], stations[tankS].nodes[FR]] : [];

  return {
    body,
    shape,
    stations,
    engineNodes,
    partIds,
    wheels,
    refNodes,
    windows,
    lights,
    radiatorNodes,
    firewallNodes,
    fuelTankNodes,
  };
}

/**
 * Scale the compressive yield of body beams crossing each station gap so the
 * summed axial crush force follows a target profile: soft progressive
 * crumple zones front and rear, a much stronger passenger cell. This keeps
 * crash behavior consistent across vehicles regardless of lattice density.
 */
function calibrateCrush(body: SoftBody, stations: StationInfo[], def: VehicleDef, bodyPart: number): void {
  const P = def.shape;
  const s = def.structure;
  const base = 240000 * (def.mass / 1500) * s.strength;
  const zFw = P.zWindshieldBase;
  // the passenger cell runs back to the rear seatback (about the rear axle) or
  // the rear window base, whichever is further back; the crumple zone is behind
  const zRb = Math.max(P.zRearWindowBase, P.zRearAxle - 0.1);
  const zF = P.length / 2, zR = -P.length / 2;
  const target = (z: number): number => {
    if (z > zFw) {
      const t = clamp01((zF - z) / Math.max(0.3, zF - zFw));
      return base * s.crumple * (0.45 + 0.6 * t);
    }
    if (z < zRb) {
      const t = clamp01((z - zR) / Math.max(0.3, zRb - zR));
      return base * 0.95 * s.crumple * (0.45 + 0.55 * t);
    }
    return base * 2.6;
  };
  const rest = body.rest;
  const scale = new Float64Array(body.m).fill(Infinity);
  for (let g = 0; g < stations.length - 1; g++) {
    const zp = (stations[g].z + stations[g + 1].z) / 2;
    let S = 0;
    const list: number[] = [];
    for (let b = 0; b < body.m; b++) {
      if (body.bPart[b] !== bodyPart) continue;
      if (body.bFlags0[b] & (BEAM_ATTACH | BEAM_SUPPORT | BEAM_NODEFORM)) continue;
      const za = rest[body.bA[b] * 3 + 2], zb = rest[body.bB[b] * 3 + 2];
      if ((za - zp) * (zb - zp) >= 0) continue;
      const cz = Math.abs(za - zb) / body.bL0[b];
      if (!isFinite(body.bYC0[b])) continue;
      S += body.bYC0[b] * cz;
      list.push(b);
    }
    if (S <= 0) continue;
    let f = target(zp) / S;
    // the passenger cell's target is a floor: strengthen it if needed, never
    // weaken it (a softened A-pillar buckles and breaks glass in slow crashes)
    if (zp <= zFw && zp >= zRb) f = Math.max(f, 1);
    for (const b of list) scale[b] = Math.min(scale[b], f);
  }
  for (let b = 0; b < body.m; b++) {
    if (!isFinite(scale[b])) continue;
    body.bYC0[b] *= scale[b];
    body.bYT0[b] *= Math.max(scale[b], 0.6);
  }
  body.resetStructure();
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Orient collision triangles outward relative to each station's ring
 * centroid (handles concave shapes like open pickup beds better than the
 * global centroid).
 */
function orientTrianglesByRing(body: SoftBody, stations: StationInfo[]): void {
  const r = body.rest;
  const nodeSt = new Int32Array(body.n).fill(-1);
  stations.forEach((s, i) => s.nodes.forEach((id) => (nodeSt[id] = i)));
  const cent = stations.map((s) => {
    let x = 0, y = 0;
    for (const id of s.nodes) {
      x += r[id * 3];
      y += r[id * 3 + 1];
    }
    return [x / s.nodes.length, y / s.nodes.length, s.z];
  });
  for (let t = 0; t < body.t; t++) {
    const a = body.tA[t], bb = body.tB[t], c = body.tC[t];
    const sts = [nodeSt[a], nodeSt[bb], nodeSt[c]].filter((x) => x >= 0);
    if (sts.length < 3) continue;
    let ox = 0, oy = 0, oz = 0;
    for (const s of sts) {
      ox += cent[s][0];
      oy += cent[s][1];
      oz += cent[s][2];
    }
    ox /= sts.length; oy /= sts.length; oz /= sts.length;
    const ux = r[bb * 3] - r[a * 3], uy = r[bb * 3 + 1] - r[a * 3 + 1], uz = r[bb * 3 + 2] - r[a * 3 + 2];
    const vx = r[c * 3] - r[a * 3], vy = r[c * 3 + 1] - r[a * 3 + 1], vz = r[c * 3 + 2] - r[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (r[a * 3] + r[bb * 3] + r[c * 3]) / 3 - ox;
    const my = (r[a * 3 + 1] + r[bb * 3 + 1] + r[c * 3 + 1]) / 3 - oy;
    const mz = (r[a * 3 + 2] + r[bb * 3 + 2] + r[c * 3 + 2]) / 3 - oz;
    // end caps: use the longitudinal direction
    const capFront = sts.every((s) => s === 0);
    const capRear = sts.every((s) => s === stations.length - 1);
    let dotv = nx * mx + ny * my + nz * mz;
    if (capFront) dotv = nz;
    else if (capRear) dotv = -nz;
    if (dotv < 0) {
      body.tB[t] = c;
      body.tC[t] = bb;
    }
  }
}

/**
 * Weights w (sum 1) such that sum w_i X_i = p, minimizing sum w_i^2 / s_i where
 * s_i favors nearby nodes.
 */
export function affineWeights(rest: Float64Array, nodes: Int32Array, p: ArrayLike<number>): Float64Array {
  const n = nodes.length;
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const id = nodes[i];
    const d = Math.hypot(rest[id * 3] - p[0], rest[id * 3 + 1] - p[1], rest[id * 3 + 2] - p[2]);
    s[i] = 1 / (d + 0.25) ** 2;
  }
  // Solve with centered coordinates: w = s_i (lambda0 + lambda . (X_i - p))
  // constraints: sum w = 1, sum w (X - p) = 0
  // Build 4x4 system M lambda = [1,0,0,0]
  const M = new Float64Array(16);
  for (let i = 0; i < n; i++) {
    const id = nodes[i];
    const v = [1, rest[id * 3] - p[0], rest[id * 3 + 1] - p[1], rest[id * 3 + 2] - p[2]];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) M[r * 4 + c] += s[i] * v[r] * v[c];
  }
  const lam = solve4(M, [1, 0, 0, 0]);
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const id = nodes[i];
    const v = [1, rest[id * 3] - p[0], rest[id * 3 + 1] - p[1], rest[id * 3 + 2] - p[2]];
    w[i] = s[i] * (lam[0] * v[0] + lam[1] * v[1] + lam[2] * v[2] + lam[3] * v[3]);
  }
  return w;
}

function solve4(M: Float64Array, rhs: number[]): number[] {
  // Gaussian elimination with partial pivoting
  const A = Array.from({ length: 4 }, (_, r) => [M[r * 4], M[r * 4 + 1], M[r * 4 + 2], M[r * 4 + 3], rhs[r]]);
  for (let c = 0; c < 4; c++) {
    let piv = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c] || 1e-12;
    for (let k = c; k < 5; k++) A[c][k] /= d;
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = A[r][c];
      for (let k = c; k < 5; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [A[0][4], A[1][4], A[2][4], A[3][4]];
}

