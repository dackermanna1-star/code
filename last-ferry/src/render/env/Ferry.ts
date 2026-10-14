// The last ferry, moored broadside at the pier head (hull side from x ≈ 23.6,
// bow swung out a few degrees toward the back so it shows at the top right):
// a chunky old car/passenger ferry — navy hull with a white sheer stripe and
// rust streaks, its name on the bow, lit portholes, festoon lights along the
// rail, a white superstructure with bridge, red funnel, lifeboats, foremast
// with the steam whistle, and the deck gun on the bow (cannon strike).
// The gangway rises from the pier (z ≈ 0) to a shell door; a queue of
// survivors waits on the pier head and boards one by one.
import * as THREE from 'three';
import { FERRY, PIER } from '../../config/world';
import { GeoBuilder, box, cone, cyl, rod, sphere, torus, type EnvMaterials } from './geo';
import type { Glows } from './Lamps';
import { mulberry32 } from './noise';
import { signMesh } from './Pier';
import { SoftSprites } from './Sprites';

/** Pivot (world) the ferry's local frame is placed at: the port hull side at the pier's far corner. */
const PIVOT = new THREE.Vector3(FERRY.hullX + 0.1, 0, -6);
const YAW = (8 * Math.PI) / 180;
const DECK_Y = 2.4;
/** Hull length: local z from BOW_Z (stem) to STERN_Z, beam 13 m. */
const BOW_Z = -15;
const STERN_Z = 38;
const BEAM = 13;
/** Shell door (local) the gangway leads to. */
const DOOR_LOCAL = new THREE.Vector3(0, 1.35, 6.1);
/** Gangway foot on the pier. */
const GANGWAY_FOOT = new THREE.Vector3(21.85, 0.02, FERRY.gangwayZ);
/** Deck gun mount (local). */
const GUN_LOCAL = new THREE.Vector3(2.4, DECK_Y + 1.75, -8.6);
/** Whistle (local) on the foremast. */
const WHISTLE_LOCAL = new THREE.Vector3(1.9, 6.6, -6.4);

const MAX_SURVIVORS = 14;

/** A vertical plate between two plan points (x, z) from y0 up by h. */
function beamBetween(x0: number, z0: number, x1: number, z1: number, y0: number, h: number, t: number): { geo: THREE.BufferGeometry; m: THREE.Matrix4 } {
  const len = Math.hypot(x1 - x0, z1 - z0) + 0.04;
  const geo = new THREE.BoxGeometry(t, h, len);
  const ang = Math.atan2(x1 - x0, z1 - z0);
  const m = new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(1, 1, 1));
  return { geo, m };
}

// -------------------------------------------------------------------- steam

interface Puff {
  p: THREE.Vector3;
  v: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  seed: number;
}

class Steam {
  readonly sprites = new SoftSprites(48, new THREE.Color(0.9, 0.9, 0.92), 0.9);
  private puffs: Puff[] = [];
  constructor() {
    this.sprites.mesh.renderOrder = 18;
  }
  emit(p: THREE.Vector3, v: THREE.Vector3, size: number, life: number): void {
    if (this.puffs.length >= this.sprites.max) this.puffs.shift();
    this.puffs.push({ p: p.clone(), v: v.clone(), age: 0, life, size, seed: Math.random() });
  }
  update(dt: number): void {
    this.puffs = this.puffs.filter((q) => (q.age += dt) < q.life);
    this.sprites.begin();
    for (const q of this.puffs) {
      q.v.multiplyScalar(Math.exp(-dt * 1.6));
      q.v.y += dt * 1.2;
      q.v.x += dt * 0.4;
      q.p.addScaledVector(q.v, dt);
      const k = q.age / q.life;
      this.sprites.push(q.p.x, q.p.y, q.p.z, q.size * (0.4 + 1.6 * Math.sqrt(k)), Math.min(1, q.age * 8) * (1 - k) * (1 - k) * 0.85, q.seed);
    }
    this.sprites.end();
  }
  get color(): THREE.Color {
    return this.sprites.material.uniforms.uColor.value as THREE.Color;
  }
}

// -------------------------------------------------------------------- survivors

interface Survivor {
  idx: number;
  seed: number;
  /** Queue slot (0 = at the gangway foot), -1 = boarding / hidden. */
  slot: number;
  pos: THREE.Vector3;
  yaw: number;
  /** Walking up the gangway: 0..1, -1 = not boarding. */
  board: number;
  /** Appear (scale-in) 0..1. */
  appear: number;
  visible: boolean;
  walkPhase: number;
  moving: number;
  scale: number;
  kid: boolean;
  cheer: number;
}

const COAT_COLS = [0xc23b22, 0x2d5f8b, 0xe0b130, 0x3f6e3a, 0x7a3f8f, 0xd96c2b, 0x2a2f38, 0xb5b0a4, 0x8a2a3a, 0x3a8a8a, 0xe8d6b0, 0x5a4a3a];
const SKIN_COLS = [0xf1c8a8, 0xd8a582, 0xb07a55, 0x8a5a3c, 0x5e3b26, 0xf5d5bc];
const HAT_COLS = [0x1a1a1a, 0xc23b22, 0xe0b130, 0x2d5f8b, 0x6a4a2a, 0xe8e2d0];

class SurvivorQueue {
  readonly group = new THREE.Group();
  private people: Survivor[] = [];
  private slots: THREE.Vector3[] = [];
  private legs: THREE.InstancedMesh;
  private torso: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private armL: THREE.InstancedMesh;
  private armR: THREE.InstancedMesh;
  private hat: THREE.InstancedMesh;
  private bag: THREE.InstancedMesh;
  private boarded = 0;
  private total = 0;
  private pendingBoard = 0;
  private boardCooldown = 0;
  private rnd = mulberry32(5150);
  /** Gangway path (world): foot → door. */
  doorWorld = new THREE.Vector3();
  hidden = false;

  constructor(mat: THREE.Material) {
    this.group.name = 'Survivors';
    // Queue slots: from the gangway foot along the pier head toward the far corner, then back.
    const foot = GANGWAY_FOOT;
    this.slots.push(new THREE.Vector3(foot.x + 0.05, 0, foot.z - 0.15));
    for (let i = 1; i < 8; i++) this.slots.push(new THREE.Vector3(22.15 + i * 0.16, 0, -0.55 - i * 0.68));
    for (let i = 0; i < 6; i++) this.slots.push(new THREE.Vector3(22.25 - (i % 2) * 0.25, 0, -5.35 + i * 0.66 + 0.2));
    const mk = (g: THREE.BufferGeometry, name: string) => {
      const m = new THREE.InstancedMesh(g, mat, MAX_SURVIVORS);
      m.name = name;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      return m;
    };
    const white = (g: THREE.BufferGeometry) => {
      const c = new Float32Array(g.attributes.position.count * 3).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      return g;
    };
    this.legs = mk(white(new THREE.BoxGeometry(0.3, 0.8, 0.2).translate(0, 0.4, 0)), 'SurvivorLegs');
    this.torso = mk(white(new THREE.CapsuleGeometry(0.21, 0.42, 4, 8).translate(0, 1.08, 0)), 'SurvivorTorso');
    this.head = mk(white(new THREE.SphereGeometry(0.13, 10, 8).translate(0, 1.55, 0)), 'SurvivorHead');
    this.armL = mk(white(new THREE.CapsuleGeometry(0.06, 0.48, 3, 6).translate(0, -0.27, 0)), 'SurvivorArmL');
    this.armR = mk(white(new THREE.CapsuleGeometry(0.06, 0.48, 3, 6).translate(0, -0.27, 0)), 'SurvivorArmR');
    this.hat = mk(white(new THREE.CylinderGeometry(0.1, 0.17, 0.12, 10).translate(0, 1.7, 0)), 'SurvivorHat');
    this.bag = mk(white(new THREE.BoxGeometry(0.42, 0.3, 0.14).translate(0, 0.15, 0)), 'SurvivorBag');
    for (let i = 0; i < MAX_SURVIVORS; i++) {
      this.people.push({ idx: i, seed: this.rnd(), slot: -1, pos: new THREE.Vector3(), yaw: 0, board: -1, appear: 1, visible: false, walkPhase: 0, moving: 0, scale: 1, kid: false, cheer: 0 });
      this.dress(this.people[i]);
    }
  }

  private dress(p: Survivor): void {
    const r = mulberry32(Math.floor(p.seed * 1e9));
    p.kid = r() < 0.15;
    p.scale = p.kid ? 0.62 : 0.92 + r() * 0.16;
    const coat = new THREE.Color(COAT_COLS[Math.floor(r() * COAT_COLS.length)]);
    const legs = new THREE.Color([0x24262c, 0x2a3348, 0x3a3026, 0x55504a][Math.floor(r() * 4)]);
    const skin = new THREE.Color(SKIN_COLS[Math.floor(r() * SKIN_COLS.length)]);
    const hasHat = r() < 0.6;
    const hat = new THREE.Color(HAT_COLS[Math.floor(r() * HAT_COLS.length)]);
    const bag = new THREE.Color([0x7a2b2b, 0x2b4a6a, 0xc7a25a, 0x3a3a3a, 0x5a6b3a][Math.floor(r() * 5)]);
    const i = p.idx;
    this.torso.setColorAt(i, coat);
    this.armL.setColorAt(i, coat);
    this.armR.setColorAt(i, coat);
    this.legs.setColorAt(i, legs);
    this.head.setColorAt(i, skin);
    this.hat.setColorAt(i, hasHat ? hat : skin);
    this.bag.setColorAt(i, bag);
    (p as Survivor & { hasHat?: boolean; hasBag?: boolean }).hasHat = hasHat;
    (p as Survivor & { hasHat?: boolean; hasBag?: boolean }).hasBag = !p.kid && r() < 0.55;
    for (const m of [this.torso, this.armL, this.armR, this.legs, this.head, this.hat, this.bag]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  /** Reset the queue for a chapter: `remaining` people waiting. */
  private fill(remaining: number): void {
    const n = Math.min(MAX_SURVIVORS, this.slots.length, remaining);
    this.pendingBoard = 0;
    for (const p of this.people) {
      p.visible = false;
      p.slot = -1;
      p.board = -1;
    }
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      p.seed = this.rnd();
      this.dress(p);
      p.slot = i;
      p.visible = true;
      p.appear = 1;
      p.pos.copy(this.slots[i]);
      p.yaw = -Math.PI / 2 + (this.rnd() - 0.5) * 1.2;
    }
  }

  setBoarding(boarded: number, total: number): void {
    if (total !== this.total || boarded < this.boarded) {
      this.total = total;
      this.boarded = boarded;
      this.fill(total - boarded);
      return;
    }
    if (boarded > this.boarded) {
      this.pendingBoard += boarded - this.boarded;
      this.boarded = boarded;
    }
  }

  cheer(): void {
    for (const p of this.people) p.cheer = 2.4 + p.seed * 0.4;
  }

  private startBoarding(): void {
    const front = this.people.find((p) => p.visible && p.slot === 0);
    if (!front) {
      this.pendingBoard = 0;
      return;
    }
    front.slot = -1;
    front.board = 0;
    // Everyone shuffles forward.
    for (const p of this.people) if (p.visible && p.slot > 0) p.slot--;
    // Someone new joins the back if more passengers remain than are shown.
    const waiting = this.people.filter((p) => p.visible && p.slot >= 0).length;
    const remaining = this.total - this.boarded;
    if (remaining - this.pendingBoard + 1 > waiting && waiting < this.slots.length) {
      const spare = this.people.find((p) => !p.visible);
      if (spare) {
        spare.seed = this.rnd();
        this.dress(spare);
        spare.visible = true;
        spare.slot = waiting;
        spare.appear = 0;
        spare.board = -1;
        spare.pos.copy(this.slots[waiting]).add(new THREE.Vector3(0.4, 0, -0.8));
        spare.yaw = Math.PI;
      }
    }
  }

  update(dt: number, time: number): void {
    if (this.pendingBoard > 0) {
      this.boardCooldown -= dt;
      if (this.boardCooldown <= 0) {
        this.boardCooldown = 0.55;
        this.pendingBoard--;
        this.startBoarding();
      }
    }
    const m = new THREE.Matrix4();
    const root = new THREE.Matrix4();
    const tmp = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const p of this.people) {
      const i = p.idx;
      if (!p.visible || this.hidden) {
        for (const mesh of [this.legs, this.torso, this.head, this.armL, this.armR, this.hat, this.bag]) mesh.setMatrixAt(i, zero);
        continue;
      }
      let target: THREE.Vector3;
      let y = 0;
      let speed = 1.3;
      if (p.board >= 0) {
        // Up the gangway to the door, then gone.
        p.board += dt / 2.2;
        const k = Math.min(1, p.board);
        target = GANGWAY_FOOT.clone().lerp(this.doorWorld, k);
        y = target.y;
        speed = 99;
        p.pos.copy(target);
        p.moving = 1;
        p.yaw = Math.atan2(this.doorWorld.x - GANGWAY_FOOT.x, this.doorWorld.z - GANGWAY_FOOT.z);
        if (p.board >= 1) {
          p.visible = false;
          p.board = -1;
          continue;
        }
      } else {
        target = this.slots[Math.max(0, p.slot)];
        const d = target.clone().sub(p.pos);
        d.y = 0;
        const len = d.length();
        if (len > 0.03) {
          const step = Math.min(len, speed * dt);
          p.pos.addScaledVector(d.normalize(), step);
          p.moving = Math.min(1, p.moving + dt * 5);
          p.yaw = Math.atan2(d.x, d.z);
        } else {
          p.moving = Math.max(0, p.moving - dt * 3);
          // Idle: look toward the action now and then.
          const look = -Math.PI / 2 + Math.sin(time * 0.3 + p.seed * 20) * 0.7;
          p.yaw += (look - p.yaw) * Math.min(1, dt * 1.5);
        }
      }
      p.appear = Math.min(1, p.appear + dt * 2.5);
      p.cheer = Math.max(0, p.cheer - dt);
      p.walkPhase += dt * (4 + 6 * p.moving);
      const cheer = Math.min(1, p.cheer * 2);
      const jump = cheer * Math.max(0, Math.sin(time * 9 + p.seed * 10)) * 0.25;
      const bob = p.moving * Math.abs(Math.sin(p.walkPhase)) * 0.05;
      const sway = Math.sin(time * 1.3 + p.seed * 30) * 0.04 * (1 - p.moving);
      const sc = p.scale * p.appear;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
      root.compose(new THREE.Vector3(p.pos.x, y + bob + jump, p.pos.z), q, s.set(sc, sc, sc));
      root.multiply(tmp.makeRotationZ(sway));
      // Legs (one box; a walking shimmy).
      m.copy(root).multiply(tmp.makeRotationX(Math.sin(p.walkPhase) * 0.15 * p.moving));
      this.legs.setMatrixAt(i, m);
      this.torso.setMatrixAt(i, root);
      m.copy(root).multiply(tmp.makeRotationY(Math.sin(time * 0.7 + p.seed * 9) * 0.5));
      this.head.setMatrixAt(i, m);
      const ext = p as Survivor & { hasHat?: boolean; hasBag?: boolean };
      this.hat.setMatrixAt(i, ext.hasHat ? m : zero);
      // Arms: swing when walking, up when cheering (waving).
      const swing = Math.sin(p.walkPhase) * 0.5 * p.moving;
      const up = cheer * (2.6 + Math.sin(time * 12 + p.seed * 5) * 0.35);
      for (const [mesh, side] of [
        [this.armL, -1],
        [this.armR, 1],
      ] as Array<[THREE.InstancedMesh, number]>) {
        m.copy(root)
          .multiply(tmp.makeTranslation(side * 0.27, 1.32, 0))
          .multiply(tmp.makeRotationZ(side * (0.12 + up)))
          .multiply(tmp.makeRotationX(swing * side));
        mesh.setMatrixAt(i, m);
      }
      // Bag in the right hand.
      if (ext.hasBag && cheer < 0.1) {
        m.copy(root).multiply(tmp.makeTranslation(0.33, 0.25, 0));
        this.bag.setMatrixAt(i, m);
      } else this.bag.setMatrixAt(i, zero);
    }
    for (const mesh of [this.legs, this.torso, this.head, this.armL, this.armR, this.hat, this.bag]) mesh.instanceMatrix.needsUpdate = true;
  }
}

// -------------------------------------------------------------------- ferry

export class Ferry {
  readonly group = new THREE.Group();
  /** The ship (moves on departure); the gangway and queue stay with the pier. */
  readonly ship = new THREE.Group();
  readonly gangway = new THREE.Group();
  readonly queue: SurvivorQueue;
  private gun = new THREE.Group();
  private barrel = new THREE.Group();
  private gunYaw = 0;
  private gunPitch = 0.08;
  private aimYaw = 0;
  private aimPitch = 0.08;
  private recoilT = 9;
  private steam = new Steam();
  private hornT = 9;
  private hornEmit = 0;
  private windowsMat: THREE.MeshBasicMaterial;
  private festoon: number[] = [];
  private festoonCols: THREE.Color[] = [];
  private flood: THREE.PointLight;
  private floodGlow: number;
  private moorLine: THREE.Mesh;
  /** Festoon string from the whistle mast to the pier's last lamp (bulbs + flags). */
  private bunting: THREE.Mesh;
  private buntingBulbs: number[] = [];
  private departure = 0;
  private placedDeparture = -1;

  constructor(private mats: EnvMaterials, private glows: Glows, quality: 'low' | 'medium' | 'high') {
    this.group.name = 'Ferry';
    this.windowsMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.buildShip();
    this.ship.position.copy(PIVOT);
    this.ship.rotation.y = YAW;
    this.group.add(this.ship);
    this.ship.updateMatrixWorld(true);
    this.buildGangway();
    this.queue = new SurvivorQueue(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
    this.queue.doorWorld.copy(this.localToWorld(DOOR_LOCAL));
    this.group.add(this.queue.group);
    this.group.add(this.steam.sprites.mesh);
    // Floodlight over the gangway (warm), part of the ferry's lights.
    this.flood = new THREE.PointLight(0xffc488, 0, quality === 'low' ? 18 : 14, 2);
    this.flood.position.copy(this.localToWorld(new THREE.Vector3(-0.6, 4.3, 4.0)));
    this.group.add(this.flood);
    this.floodGlow = glows.add(this.flood.position.clone(), new THREE.Color(2.0, 1.5, 0.9), 1.4);
    // Bow mooring line to the pier bollard.
    {
      const a = this.localToWorld(new THREE.Vector3(0.4, DECK_Y + 0.9, -7));
      const b = new THREE.Vector3(19.6, 0.45, PIER.minZ + 0.32);
      const r = rod(a, b, 0.035, 5);
      const g = new GeoBuilder();
      g.add(r.geo, new THREE.Color(0xb7a37a), r.m);
      this.moorLine = g.mesh(mats.cloth, 'MooringLine');
      this.moorLine.castShadow = true;
      this.group.add(this.moorLine);
    }
    // Festoon of bulbs and flags from the whistle mast to the last far-side lamp post.
    {
      const a = this.localToWorld(new THREE.Vector3(WHISTLE_LOCAL.x, WHISTLE_LOCAL.y - 0.2, WHISTLE_LOCAL.z));
      const b = new THREE.Vector3(13.5, 4.55, PIER.minZ + 0.05);
      const g = new GeoBuilder();
      const N = 22;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * 1.6;
        pts.push(p);
      }
      const flagCols = [0xc23b22, 0xf0e8d8, 0x2d5f8b, 0xe0b130];
      for (let i = 0; i < N; i++) {
        const r = rod(pts[i], pts[i + 1], 0.012, 3);
        g.add(r.geo, new THREE.Color(0x111111), r.m);
        // A little triangular flag hanging under every segment.
        const mid = pts[i].clone().lerp(pts[i + 1], 0.5);
        const tri = new THREE.BufferGeometry();
        const d = pts[i + 1].clone().sub(pts[i]).multiplyScalar(0.35);
        tri.setAttribute('position', new THREE.Float32BufferAttribute([mid.x - d.x, mid.y - d.y, mid.z - d.z, mid.x + d.x, mid.y + d.y, mid.z + d.z, mid.x, mid.y - 0.32, mid.z], 3));
        tri.computeVertexNormals();
        g.add(tri, new THREE.Color(flagCols[i % flagCols.length]));
        if (i % 2 === 0) {
          const c = [new THREE.Color(2.4, 1.8, 1.0), new THREE.Color(2.4, 0.5, 0.35), new THREE.Color(0.5, 2.0, 0.8), new THREE.Color(0.7, 1.1, 2.6)][(i / 2) % 4];
          this.buntingBulbs.push(this.glows.add(pts[i].clone().add(new THREE.Vector3(0, -0.06, 0)), c, 0.5));
          this.festoonCols.push(c);
        }
      }
      this.bunting = g.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), 'Bunting');
      this.bunting.castShadow = true;
      this.group.add(this.bunting);
    }
    this.setBoarding(0, 48);
  }

  private localToWorld(p: THREE.Vector3): THREE.Vector3 {
    return p.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), YAW).add(PIVOT);
  }

  private buildShip(): void {
    const rnd = mulberry32(2024);
    const hull = new GeoBuilder();
    const white = new GeoBuilder();
    const red = new GeoBuilder();
    const steel = new GeoBuilder();
    const glass = new GeoBuilder();
    const orange = new GeoBuilder();
    // --- hull: plan-view outline extruded in colour bands (antifouling, boot top, navy, sheer stripe, navy).
    const plan = new THREE.Shape();
    const pts: Array<[number, number]> = [];
    pts.push([0, STERN_Z]);
    pts.push([0, -3]);
    for (let i = 1; i <= 10; i++) {
      const a = ((i / 10) * Math.PI) / 2;
      pts.push([(BEAM / 2) * (1 - Math.cos(a)), -3 + (BOW_Z + 3) * Math.sin(a)]);
    }
    for (let i = 9; i >= 0; i--) {
      const a = ((i / 10) * Math.PI) / 2;
      pts.push([BEAM - (BEAM / 2) * (1 - Math.cos(a)), -3 + (BOW_Z + 3) * Math.sin(a)]);
    }
    pts.push([BEAM, STERN_Z]);
    // Shape (x, -z): after the extrusion is rotated up, shape y maps back to +z.
    plan.moveTo(pts[0][0], -pts[0][1]);
    for (let i = 1; i < pts.length; i++) plan.lineTo(pts[i][0], -pts[i][1]);
    const bands: Array<[number, number, number]> = [
      [-3.4, -2.45, 0x7a2a1e],
      [-2.45, -2.15, 0x101010],
      [-2.15, 1.5, 0x1d2a40],
      [1.5, 1.82, 0xe9e4d8],
      [1.82, DECK_Y + 0.02, 0x1d2a40],
    ];
    for (const [y0, y1, col] of bands) {
      const g = new THREE.ExtrudeGeometry(plan, { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);
      g.translate(0, y0, 0);
      hull.add(g, col);
    }
    // Rust streaks running down the port side from scuppers and portholes.
    for (let z = -2.5; z < STERN_Z - 1; z += 0.6 + rnd() * 1.6) {
      const top = rnd() < 0.5 ? DECK_Y - 0.05 : 0.45;
      const len = 0.6 + rnd() * 1.8;
      const w = 0.06 + rnd() * 0.12;
      hull.add(box(0.02, len, w), new THREE.Color(0x6a3a1e).lerp(new THREE.Color(0x1d2a40), rnd() * 0.5), { p: [-0.012, top - len / 2, z] });
    }
    // Bow bulwark (solid white plating following the bow curve, both sides).
    for (const side of [0, 1]) {
      const curve: Array<[number, number]> = [];
      for (let i = 0; i <= 10; i++) {
        const a = ((i / 10) * Math.PI) / 2;
        const x = (BEAM / 2) * (1 - Math.cos(a));
        curve.push([side === 0 ? x : BEAM - x, -3 + (BOW_Z + 3) * Math.sin(a)]);
      }
      curve.unshift([side === 0 ? 0 : BEAM, 2]);
      for (let i = 0; i < curve.length - 1; i++) {
        const [x0, z0] = curve[i];
        const [x1, z1] = curve[i + 1];
        const b = beamBetween(x0, z0, x1, z1, DECK_Y + 0.1, 1.25, 0.1);
        white.add(b.geo, 0xe9e4d8, b.m);
      }
    }
    // Anchor + hawse pipe on the bow.
    steel.add(cyl(0.35, 0.35, 0.3, 12), 0x111111, { p: [-0.05, 1.2, -6.5], r: [0, 0, Math.PI / 2] });
    steel.add(box(0.15, 1.0, 0.25), 0x222222, { p: [-0.12, 0.6, -6.5] });
    steel.add(torus(0.35, 0.07, 4, 10, Math.PI), 0x222222, { p: [-0.12, 0.25, -6.5], r: [0, Math.PI / 2, Math.PI] });
    // Portholes along the port side (lit / dark).
    for (let z = -2; z < STERN_Z - 2; z += 1.7) {
      const lit = rnd() < 0.72;
      glass.add(cyl(0.2, 0.2, 0.06, 10), lit ? new THREE.Color(1.8, 1.25, 0.6) : new THREE.Color(0.04, 0.05, 0.06), { p: [-0.04, 0.55, z], r: [0, 0, Math.PI / 2] });
      steel.add(torus(0.21, 0.035, 4, 12), 0x9a9a9a, { p: [-0.05, 0.55, z], r: [0, Math.PI / 2, 0] });
    }
    // Shell door (open, warm light inside) the gangway leads to.
    glass.add(box(0.06, 1.7, 1.4), new THREE.Color(2.2, 1.5, 0.8), { p: [-0.02, DOOR_LOCAL.y + 0.85, DOOR_LOCAL.z] });
    steel.add(box(0.1, 0.1, 1.6), 0x777777, { p: [-0.06, DOOR_LOCAL.y + 1.75, DOOR_LOCAL.z] });
    // Main deck.
    steel.add(box(BEAM - 0.4, 0.1, STERN_Z + 2), 0x4a3a2e, { p: [BEAM / 2, DECK_Y, (STERN_Z - 2) / 2] });
    // Railing along the port side (white posts + rails).
    for (let z = -4; z < STERN_Z; z += 1.4) white.add(box(0.05, 1.0, 0.05), 0xe8e4da, { p: [0.12, DECK_Y + 0.5, z] });
    white.add(box(0.06, 0.06, STERN_Z + 4), 0xe8e4da, { p: [0.12, DECK_Y + 1.0, STERN_Z / 2 - 2] });
    white.add(box(0.04, 0.04, STERN_Z + 4), 0xe8e4da, { p: [0.12, DECK_Y + 0.55, STERN_Z / 2 - 2] });
    // --- superstructure
    const supCol = (p: THREE.Vector3, _n: THREE.Vector3, out: THREE.Color) => out.set(0xe6e1d4).multiplyScalar(0.92 + 0.08 * Math.sin(p.z * 0.7));
    white.add(box(9, 2.8, 30), supCol, { p: [6.5, DECK_Y + 1.4, 11] });
    white.add(box(8, 2.6, 24), supCol, { p: [6.5, DECK_Y + 4.1, 9] });
    white.add(box(9.6, 2.4, 5), supCol, { p: [6.5, DECK_Y + 6.6, -1.5] });
    // Bridge wings + windows.
    white.add(box(12.4, 0.2, 3), supCol, { p: [6.5, DECK_Y + 5.5, -1.5] });
    for (let k = 0; k < 7; k++) glass.add(box(1.1, 1.0, 0.06), k % 3 === 1 ? new THREE.Color(0.5, 0.75, 0.7) : new THREE.Color(0.06, 0.1, 0.12), { p: [2.6 + k * 1.3, DECK_Y + 6.9, -4.03] });
    // Window rows on the superstructure (port side faces -x).
    for (let z = -3.2; z < 25; z += 1.5) {
      for (const [y, x] of [
        [DECK_Y + 1.6, 1.98],
        [DECK_Y + 4.3, 2.48],
      ]) {
        const lit = rnd() < 0.8;
        glass.add(box(0.05, 0.85, 1.05), lit ? new THREE.Color(1.9, 1.35, 0.7).multiplyScalar(0.7 + rnd() * 0.5) : new THREE.Color(0.05, 0.06, 0.08), { p: [x, y, z] });
      }
    }
    // Funnel: red with a black top and a white band.
    red.add(cyl(1.5, 1.7, 5.6, 16), 0xb02a1c, { p: [7, DECK_Y + 8.2, 12], s: [1, 1, 1.35] });
    white.add(cyl(1.52, 1.52, 0.7, 16), 0xe8e4da, { p: [7, DECK_Y + 9.0, 12], s: [1, 1, 1.35] });
    steel.add(cyl(1.55, 1.55, 1.1, 16), 0x141414, { p: [7, DECK_Y + 11.3, 12], s: [1, 1, 1.35] });
    // Lifeboats on davits.
    for (const z of [3, 10, 17]) {
      orange.add(sphere(1, 10, 6), 0xe0601c, { p: [1.6, DECK_Y + 5.6, z], s: [0.75, 0.55, 2.6] });
      white.add(box(1.3, 0.25, 4.6), 0xe8e4da, { p: [1.6, DECK_Y + 5.95, z] });
      for (const dz of [-2, 2]) steel.add(box(0.1, 1.6, 0.1), 0x666666, { p: [2.2, DECK_Y + 5.6, z + dz], r: [0, 0, 0.4] });
    }
    // Foremast with the whistle, a yard and lights.
    steel.add(cyl(0.1, 0.14, WHISTLE_LOCAL.y - DECK_Y + 1.2, 8), 0xd8d2c4, { p: [WHISTLE_LOCAL.x, (WHISTLE_LOCAL.y + DECK_Y + 1.2) / 2, WHISTLE_LOCAL.z] });
    steel.add(box(3.2, 0.1, 0.1), 0xd8d2c4, { p: [WHISTLE_LOCAL.x, WHISTLE_LOCAL.y - 0.4, WHISTLE_LOCAL.z] });
    steel.add(cyl(0.12, 0.18, 0.7, 8), 0xc8a050, { p: [WHISTLE_LOCAL.x - 0.3, WHISTLE_LOCAL.y, WHISTLE_LOCAL.z], r: [0, 0, 0] });
    // --- deck gun on the bow (port side), trained over the pier.
    {
      const g = new GeoBuilder();
      // Pedestal up from the deck, then the training ring.
      g.add(cyl(0.55, 0.7, 1.3, 12), 0x4a5058, { p: [0, -1.1, 0] });
      g.add(cyl(0.75, 0.9, 0.3, 14), 0x5a6068, { p: [0, -0.5, 0] });
      // Gun shield: slanted plate box.
      g.add(box(1.4, 1.1, 1.6), 0x6a7078, { p: [0.15, 0.05, 0], r: [0, 0, 0] });
      g.add(box(0.2, 1.0, 1.7), 0x5a6068, { p: [-0.6, 0.0, 0], r: [0, 0, -0.35] });
      this.gun.add(g.mesh(this.mats.metal, 'GunMount'));
      const b = new GeoBuilder();
      b.add(cyl(0.11, 0.14, 2.6, 10), 0x3a3e44, { p: [-1.3, 0, 0], r: [0, 0, Math.PI / 2] });
      b.add(cyl(0.16, 0.16, 0.3, 10), 0x2a2e34, { p: [-2.55, 0, 0], r: [0, 0, Math.PI / 2] });
      b.add(cyl(0.2, 0.2, 0.5, 10), 0x3a3e44, { p: [0.0, 0, 0], r: [0, 0, Math.PI / 2] });
      this.barrel.add(b.mesh(this.mats.metal, 'GunBarrel'));
      this.barrel.position.set(-0.3, 0.15, 0);
      this.gun.add(this.barrel);
      this.gun.position.copy(GUN_LOCAL);
      this.gun.traverse((o) => {
        o.castShadow = true;
      });
      this.ship.add(this.gun);
    }
    // Fenders (tyres) hanging against the pier head.
    for (const z of [2.5, 9.5]) {
      steel.add(torus(0.42, 0.18, 6, 12), 0x141414, { p: [-0.3, -0.2, z], r: [0, Math.PI / 2, 0] });
      const r = rod({ x: -0.3, y: 0.22, z }, { x: 0.1, y: DECK_Y + 1.0, z }, 0.02, 4);
      steel.add(r.geo, 0xb7a37a, r.m);
    }
    const add = (b: GeoBuilder, mat: THREE.Material, name: string, shadow = true) => {
      const m = b.mesh(mat, name);
      m.castShadow = shadow;
      m.receiveShadow = true;
      this.ship.add(m);
    };
    add(hull, this.mats.paint, 'FerryHull');
    add(white, this.mats.paint, 'FerryWhite');
    add(red, this.mats.paint, 'FerryFunnel');
    add(steel, this.mats.metal, 'FerrySteel');
    add(orange, this.mats.plastic, 'FerryLifeboats');
    add(glass, this.windowsMat, 'FerryWindows', false);
    // Name on the bow.
    const name = signMesh('SECOND CHANCE', '#1d2a40', '#efe9da', 4.6, 0.62, new THREE.Vector3(-0.07, 0.85, -0.6), -Math.PI / 2);
    this.ship.add(name);
    const port = signMesh('PORT ELLEN', '#1d2a40', '#d8d0bc', 2.6, 0.38, new THREE.Vector3(-0.06, 1.2, 33), -Math.PI / 2, true);
    this.ship.add(port);
    // Festoon lights along the port rail (glows, world space).
    const cols = [new THREE.Color(2.2, 1.7, 1.0), new THREE.Color(2.4, 0.4, 0.3), new THREE.Color(0.5, 2.0, 0.7), new THREE.Color(0.6, 1.0, 2.4)];
    this.ship.updateMatrixWorld(true);
    for (let k = 0; k < 26; k++) {
      const z = -6 + k * 1.6;
      const sag = 0.25 * Math.sin(((z + 6) / 1.6) * Math.PI) ** 2;
      const lp = new THREE.Vector3(0.12, DECK_Y + 1.45 - sag, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), YAW).add(PIVOT);
      const c = cols[k % cols.length];
      this.festoon.push(this.glows.add(lp, c, 0.55));
      this.festoonCols.push(c);
    }
  }

  private buildGangway(): void {
    const g = new GeoBuilder();
    const al = new THREE.Color(0x9aa0a6);
    const door = this.localToWorld(DOOR_LOCAL);
    const foot = GANGWAY_FOOT;
    const len = foot.distanceTo(door);
    const ang = Math.atan2(door.y - foot.y, Math.hypot(door.x - foot.x, door.z - foot.z));
    const yaw = Math.atan2(door.z - foot.z, door.x - foot.x);
    // Built along +x from the foot (hinge) in a local frame, then rotated.
    const w = FERRY.gangwayHalfW * 0.85;
    g.add(box(len, 0.06, w * 2), new THREE.Color(0x6a6f74), { p: [len / 2, 0.03, 0] });
    for (let x = 0.2; x < len; x += 0.32) g.add(box(0.04, 0.03, w * 2), new THREE.Color(0x3a3d40), { p: [x, 0.075, 0] });
    for (const s of [-1, 1]) {
      g.add(box(len, 0.12, 0.05), al, { p: [len / 2, 0.08, s * w] });
      for (let x = 0.05; x <= len; x += len / 4) g.add(box(0.04, 1.0, 0.04), al, { p: [x, 0.55, s * w], r: [0, 0, -ang] });
      g.add(box(len, 0.04, 0.04), al, { p: [len / 2, 1.0, s * w] });
      g.add(box(len, 0.03, 0.03), al, { p: [len / 2, 0.55, s * w] });
    }
    const m = g.mesh(this.mats.metal, 'Gangway');
    m.castShadow = true;
    m.receiveShadow = true;
    const pivot = new THREE.Group();
    pivot.add(m);
    pivot.rotation.order = 'YZX';
    pivot.rotation.set(0, -yaw, ang);
    this.gangway.add(pivot);
    this.gangway.position.copy(foot);
    // Canvas side cloth.
    const sign = signMesh('MIND THE GAP', '#e8e2d2', '#1d2a40', len * 0.8, 0.4, new THREE.Vector3(len * 0.5, 0.75, w + 0.03), 0, true);
    pivot.add(sign);
    this.group.add(this.gangway);
  }

  // ------------------------------------------------------------------ API

  setBoarding(boarded: number, total: number): void {
    this.queue.setBoarding(boarded, total);
  }

  horn(): void {
    this.hornT = 0;
    this.hornEmit = 0.9;
    this.queue.cheer();
  }

  setDeparture(t: number): void {
    this.departure = Math.min(1, Math.max(0, t));
  }

  gunMuzzle(out = new THREE.Vector3()): THREE.Vector3 {
    this.ship.updateMatrixWorld(true);
    return this.barrel.localToWorld(out.set(-2.7, 0, 0));
  }

  aimGun(x: number, y: number, z: number): void {
    this.ship.updateMatrixWorld(true);
    const local = this.gun.parent!.worldToLocal(new THREE.Vector3(x, y, z)).sub(this.gun.position);
    // Barrel points along local -x at yaw 0.
    this.aimYaw = Math.atan2(local.z, -local.x);
    this.aimYaw = Math.max(-1.0, Math.min(1.0, this.aimYaw));
    const horiz = Math.hypot(local.x, local.z);
    // Ballistic-looking elevation (a little above the line of sight).
    this.aimPitch = Math.max(-0.05, Math.min(0.6, Math.atan2(local.y, horiz) + 0.06 + horiz * 0.004));
  }

  recoil(): void {
    this.recoilT = 0;
  }

  update(dt: number, time: number, windows: number, night: number): void {
    // Departure: pull away to the right, swing the bow out, gone from view by t ≈ 0.35.
    const k = Math.min(1, this.departure / 0.35);
    const e = k * k * (3 - 2 * k);
    this.ship.position.set(PIVOT.x + 26 * e, 0, PIVOT.z + 4 * e);
    this.ship.rotation.y = YAW - 0.3 * e;
    this.ship.visible = k < 1;
    this.moorLine.visible = this.departure <= 0;
    // The gangway drops off the pier end when the ship leaves.
    const gk = Math.min(1, this.departure / 0.08);
    this.gangway.rotation.z = -gk * gk * 0.95;
    this.queue.hidden = this.departure > 0;
    this.queue.update(dt, time);
    // Gun slew + recoil.
    this.gunYaw += (this.aimYaw - this.gunYaw) * Math.min(1, dt * 5);
    this.gunPitch += (this.aimPitch - this.gunPitch) * Math.min(1, dt * 5);
    this.gun.rotation.y = this.gunYaw;
    this.recoilT += dt;
    const rk = this.recoilT < 0.06 ? this.recoilT / 0.06 : Math.max(0, 1 - (this.recoilT - 0.06) / 0.45);
    this.barrel.position.x = -0.3 + 0.45 * rk;
    this.barrel.rotation.z = -this.gunPitch - rk * 0.05;
    // Horn: steam jet from the whistle, lights blink.
    this.hornT += dt;
    if (this.hornEmit > 0) {
      this.hornEmit -= dt;
      this.ship.updateMatrixWorld(true);
      const w = this.ship.localToWorld(WHISTLE_LOCAL.clone());
      for (let i = 0; i < 2; i++) {
        const v = new THREE.Vector3(-3.5 - Math.random() * 2.5, 3 + Math.random() * 3, 1 + (Math.random() - 0.5) * 2);
        this.steam.emit(w, v, 2.2 + Math.random() * 1.4, 2.4 + Math.random() * 1.2);
      }
    }
    this.steam.update(dt);
    this.steam.color.setRGB(0.75, 0.75, 0.78).multiplyScalar(0.35 + 0.65 * (1 - night * 0.6));
    const hornBlink = this.hornT < 2.2 ? (Math.sin(this.hornT * 18) > 0 ? 1.8 : 0.4) : 1;
    const level = windows * (this.departure > 0.3 ? 0 : 1);
    this.windowsMat.color.setScalar(level * (this.hornT < 2.2 ? 0.6 + 0.6 * hornBlink : 1));
    const movePositions = this.departure !== this.placedDeparture;
    this.placedDeparture = this.departure;
    if (movePositions) this.ship.updateMatrixWorld(true);
    for (let i = 0; i < this.festoon.length; i++) {
      const tw = 0.75 + 0.25 * Math.sin(time * 2 + i * 1.7);
      const chase = this.hornT < 2.2 ? (Math.floor(this.hornT * 12 + i) % 3 === 0 ? 2.5 : 0.3) : 1;
      this.glows.set(this.festoon[i], level * tw * chase * (0.3 + 0.7 * night));
      if (movePositions) this.glows.setPosition(this.festoon[i], this.festoonWorld(i));
    }
    this.bunting.visible = this.departure <= 0;
    for (let i = 0; i < this.buntingBulbs.length; i++) {
      const tw = 0.8 + 0.2 * Math.sin(time * 1.6 + i * 2.1);
      const chase = this.hornT < 2.2 ? (Math.floor(this.hornT * 10 + i) % 2 === 0 ? 2.4 : 0.2) : 1;
      this.glows.set(this.buntingBulbs[i], this.departure > 0 ? 0 : windows * tw * chase * (0.2 + 0.8 * night));
    }
    this.flood.intensity = 26 * (0.25 + 0.75 * night) * level * (this.hornT < 2.2 ? hornBlink : 1);
    this.glows.set(this.floodGlow, (0.3 + 0.7 * night) * level);
  }

  private festoonWorld(i: number): THREE.Vector3 {
    const z = -6 + i * 1.6;
    const sag = 0.25 * Math.sin(((z + 6) / 1.6) * Math.PI) ** 2;
    return this.ship.localToWorld(new THREE.Vector3(0.12, DECK_Y + 1.45 - sag, z));
  }

}

void cone;
