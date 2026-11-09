/**
 * One streamed 50 m slice of the level: terrain + road meshes, the static
 * collider (one PhysicsBody with a mesh shape for ground/ramps plus boxes for
 * walls and wrecks), merged prop layers, landmarks and breakable debris.
 */
import {
  Mesh, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeContainer, PhysicsShapeMesh, Quaternion,
  TransformNode, Vector3, VertexData, type PhysicsShape, type Scene, type Texture,
} from "@babylonjs/core";
import type { LevelDef } from "../data/levels";
import { outline } from "../fx/Materials";
import { Shadows } from "../fx/Shadows";
import { CollideWith, Layer } from "../physics/Layers";
import { decorateChunk, groundColor, type BoxCol, type Deco, type Templates } from "./Biomes";
import type { Debris } from "./Debris";
import { buildBreakables, buildIce, buildLip, buildRamp, buildWreck } from "./Features";
import { ColGeo, Geo, Xf } from "./Geo";
import {
  buildCheckpoint, buildDistanceSign, buildEndWall, buildEvac, buildForkSign, buildOverpass, buildStart, type Extras,
} from "./Landmarks";
import { chevron, jersey, type Colors } from "./Props";
import { Rng } from "./rng";
import { ROAD_TILE, type WorldMaterials } from "./Surface";
import { CHUNK, HW, SHOULDER, TERRAIN_COLLIDE, TERRAIN_D, type Track } from "./Track";

const ROW = 2; // m between terrain/road rows

export interface LevelKit {
  scene: Scene;
  track: Track;
  def: LevelDef;
  colors: Colors;
  tpl: Templates;
  mats: WorldMaterials;
  debris: Debris;
  quality: number;
  softTexture: () => Texture;
}

export class Chunk {
  readonly z0: number;
  readonly z1: number;
  readonly meshes: Mesh[] = [];
  readonly extras: Extras;
  private node: TransformNode | null = null;
  private body: PhysicsBody | null = null;
  private shapes: PhysicsShape[] = [];

  constructor(private kit: LevelKit, readonly index: number) {
    this.z0 = index * CHUNK;
    this.z1 = this.z0 + CHUNK;
    this.extras = { scene: kit.scene, nodes: [], animators: [], softTexture: kit.softTexture };
    this.build();
  }

  private build(): void {
    const { track: t, colors: c, def, scene } = this.kit;
    const lit = new Geo();
    const glow = new Geo();
    glow.jitter = 0;
    const hero = new Geo();
    const decal = new Geo();
    decal.jitter = 0;
    const far = new Geo();
    const terrain = new Geo();
    terrain.jitter = 0;
    const col = new ColGeo();
    const boxes: BoxCol[] = [];
    const pools: number[] = [];
    const deco: Deco = {
      track: t, def, c, tpl: this.kit.tpl, rng: new Rng(t.seed * 7 + this.index * 7919 + 17),
      index: this.index, z0: this.z0, z1: this.z1, lit, glow, hero, col, boxes, q: this.kit.quality, decal, far, pools,
    };

    const road = this.buildGround(terrain, col);
    this.buildWalls(boxes);
    this.buildIsland(deco);
    decorateChunk(deco);
    this.buildFeatures(deco);
    this.buildLandmarks(deco);

    // ---- meshes
    const m = this.kit.mats;
    const add = (mesh: Mesh | null, opts: { cast?: boolean; receive?: boolean } = {}) => {
      if (!mesh) return null;
      mesh.receiveShadows = opts.receive ?? true;
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
      mesh.doNotSyncBoundingInfo = true;
      if (opts.cast) Shadows.cast(mesh, false);
      this.meshes.push(mesh);
      return mesh;
    };
    add(terrain.toMesh(`terrain${this.index}`, scene, m.lit));
    add(road);
    add(decal.toMesh(`decal${this.index}`, scene, m.decal));
    add(lit.toMesh(`props${this.index}`, scene, m.lit), { cast: true });
    add(far.toMesh(`far${this.index}`, scene, m.lit), { receive: false });
    add(glow.toMesh(`glow${this.index}`, scene, m.glow), { receive: false });
    const heroMesh = add(hero.toMesh(`hero${this.index}`, scene, m.lit), { cast: true });
    if (heroMesh) outline(heroMesh, 0.03);

    if (pools.length) add(this.buildPools(pools), { receive: false });

    // ---- physics
    this.buildPhysics(col, boxes);
  }

  /** Terrain (flat-shaded, vertex colored) + road strip + ground collider. */
  private buildGround(terrain: Geo, col: ColGeo): Mesh {
    const { track: t, colors: c, def } = this.kit;
    const rows = Math.round(CHUNK / ROW);
    const fork = t.forks.some((f) => f.z1 > this.z0 && f.z0 < this.z1);
    const ISL = [0, 1e-4, 0.12, 0.3, 0.5, 0.7, 0.88, 1 - 1e-4, 1];
    const nT = TERRAIN_D.length;

    // Sample all rows: per row, x/y for each column group.
    type Row = { z: number; lt: number[]; rt: number[]; lr: number[]; rr: number[]; is: number[]; base: number; f: number };
    const R: Row[] = [];
    for (let r = 0; r <= rows; r++) {
      const z = this.z0 + r * ROW;
      const base = t.baseCenter(z);
      const f = t.forkOffset(z);
      const le = base - f - HW, re = base + f + HW;
      const li = base - f + Math.min(HW, f), ri = base + f - Math.min(HW, f);
      const hl = t.roadHeight(z, -1), hr = t.roadHeight(z, 1);
      const row: Row = { z, lt: [], rt: [], lr: [], rr: [], is: [], base, f };
      for (let i = nT - 1; i >= 0; i--) {
        const x = le - TERRAIN_D[i];
        row.lt.push(x, t.terrainHeight(TERRAIN_D[i], z, -1, x));
      }
      for (let i = 0; i < nT; i++) {
        const x = re + TERRAIN_D[i];
        row.rt.push(x, t.terrainHeight(TERRAIN_D[i], z, 1, x));
      }
      for (let i = 0; i <= 2; i++) row.lr.push(le + ((li - le) * i) / 2, hl);
      for (let i = 0; i <= 2; i++) row.rr.push(ri + ((re - ri) * i) / 2, hr);
      if (fork) {
        const w = Math.max(0, ri - li);
        for (const s of ISL) row.is.push(li + s * w, t.islandHeight(z, s, w));
      }
      R.push(row);
    }

    // ---- flat-shaded terrain triangles
    const seed = t.seed;
    const biome = def.biome;
    const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, d: number, island: boolean) => {
      // face normal y component for slope-based coloring
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const slope = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
      const mx = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3, my = (ay + by + cy) / 3;
      const color = island ? (slope < 0.5 ? c.concrete : groundColor(biome, c, 5, slope, mx, mz, my, seed)) : groundColor(biome, c, d, slope, mx, mz, my, seed);
      terrain.poly([ax, ay, az, bx, by, bz, cx, cy, cz], color, 0);
    };
    const grid = (key: "lt" | "rt" | "is", dOf: (col: number) => number, island = false) => {
      const n = R[0][key].length / 2;
      for (let r = 0; r < rows; r++) {
        const A = R[r][key], B = R[r + 1][key];
        const za = R[r].z, zb = R[r + 1].z;
        for (let k = 0; k < n - 1; k++) {
          const d = dOf(k);
          const p00 = [A[k * 2], A[k * 2 + 1], za], p01 = [A[k * 2 + 2], A[k * 2 + 3], za];
          const p10 = [B[k * 2], B[k * 2 + 1], zb], p11 = [B[k * 2 + 2], B[k * 2 + 3], zb];
          if ((r + k) % 2 === 0) {
            tri(p00[0], p00[1], p00[2], p10[0], p10[1], p10[2], p11[0], p11[1], p11[2], d, island);
            tri(p00[0], p00[1], p00[2], p11[0], p11[1], p11[2], p01[0], p01[1], p01[2], d, island);
          } else {
            tri(p00[0], p00[1], p00[2], p10[0], p10[1], p10[2], p01[0], p01[1], p01[2], d, island);
            tri(p01[0], p01[1], p01[2], p10[0], p10[1], p10[2], p11[0], p11[1], p11[2], d, island);
          }
        }
      }
    };
    grid("lt", (k) => (TERRAIN_D[nT - 1 - k] + TERRAIN_D[nT - 2 - k]) / 2);
    grid("rt", (k) => (TERRAIN_D[k] + TERRAIN_D[k + 1]) / 2);
    if (fork) grid("is", () => 5, true);

    // ---- collision grid (shared vertices)
    const colGrid = (key: "lt" | "rt" | "lr" | "rr" | "is", c0: number, c1: number) => {
      const n = c1 - c0;
      if (n < 2) return;
      const base = col.pos.length / 3;
      for (let r = 0; r <= rows; r++) for (let k = c0; k < c1; k++) col.vert(R[r][key][k * 2], R[r][key][k * 2 + 1], R[r].z);
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < n - 1; k++) {
          const a = base + r * n + k, b = a + 1, d = a + n, e = d + 1;
          col.tri(a, d, e);
          col.tri(a, e, b);
        }
      }
    };
    colGrid("lt", nT - TERRAIN_COLLIDE, nT);
    colGrid("rt", 0, TERRAIN_COLLIDE);
    colGrid("lr", 0, 3);
    colGrid("rr", 0, 3);
    if (fork) colGrid("is", 0, ISL.length);

    // ---- road mesh (textured, smooth normals)
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const strip = (key: "lr" | "rr", lane: number) => {
      const base = pos.length / 3;
      for (let r = 0; r <= rows; r++) {
        const row = R[r];
        const center = row.base + lane * row.f;
        for (let k = 0; k < 3; k++) {
          const x = row[key][k * 2];
          pos.push(x, row[key][k * 2 + 1], row.z);
          uv.push((x - center) / (2 * HW) + 0.5, row.z / ROAD_TILE);
        }
      }
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < 2; k++) {
          const a = base + r * 3 + k, b = a + 1, d = a + 3, e = d + 1;
          idx.push(a, e, d, a, b, e); // Babylon winding (reversed) of (a,d,e) & (a,e,b)
        }
      }
    };
    strip("lr", -1);
    strip("rr", 1);
    const mesh = new Mesh(`road${this.index}`, this.kit.scene);
    const vd = new VertexData();
    vd.positions = pos;
    vd.indices = idx;
    vd.uvs = uv;
    const normals: number[] = [];
    VertexData.ComputeNormals(pos, idx, normals);
    vd.normals = normals;
    vd.applyToMesh(mesh, false);
    mesh.material = this.kit.mats.road;
    return mesh;
  }

  /** Additive light pools (soft discs) draped on the ground. */
  private buildPools(p: number[]): Mesh {
    const t = this.kit.track;
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
    for (let i = 0; i < p.length; i += 6) {
      const [x, z, r, cr, cg, cb] = p.slice(i, i + 6);
      const base = pos.length / 3;
      const n = 4; // 4x4 grid so it follows the ground
      for (let a = 0; a <= n; a++) {
        for (let b = 0; b <= n; b++) {
          const px = x - r + (2 * r * b) / n, pz = z - r + (2 * r * a) / n;
          pos.push(px, t.heightAt(px, pz) + 0.08, pz);
          uv.push(b / n, a / n);
          col.push(cr * 0.55, cg * 0.5, cb * 0.4, 1);
        }
      }
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        const q = base + a * (n + 1) + b;
        idx.push(q, q + n + 2, q + 1, q, q + n + 1, q + n + 2);
      }
    }
    const mesh = new Mesh(`pools${this.index}`, this.kit.scene);
    const vd = new VertexData();
    vd.positions = pos;
    vd.uvs = uv;
    vd.colors = col;
    vd.indices = idx;
    vd.applyToMesh(mesh, false);
    mesh.material = this.kit.mats.pool;
    return mesh;
  }

  /** Invisible boundary walls (boxes) along both edges. */
  private buildWalls(boxes: BoxCol[]): void {
    const t = this.kit.track;
    const seg = 10;
    for (const side of [-1, 1]) {
      for (let z = this.z0; z < this.z1 - 1e-6; z += seg) {
        const za = z, zb = z + seg;
        const off = SHOULDER + 1.2;
        const xa = side < 0 ? t.leftEdge(za) - off : t.rightEdge(za) + off;
        const xb = side < 0 ? t.leftEdge(zb) - off : t.rightEdge(zb) + off;
        const ya = t.heightAt(xa, za), yb = t.heightAt(xb, zb);
        const y = Math.min(ya, yb);
        boxes.push({ x: (xa + xb) / 2, y: y + 4, z: (za + zb) / 2, sx: 1.6, sy: 16, sz: Math.hypot(xb - xa, zb - za) + 0.6, yaw: Math.atan2(xb - xa, zb - za) });
      }
    }
    // back wall behind the start compound
    if (this.index === -1) boxes.push({ x: 0, y: 4, z: -24, sx: 2 * (HW + SHOULDER + 4), sy: 16, sz: 2, yaw: 0 });
  }

  /** Fork divider dressing: nose sign, chevrons, barriers/plants along it. */
  private buildIsland(k: Deco): void {
    const t = this.kit.track;
    const c = this.kit.colors;
    for (const f of t.forks) {
      if (f.z1 <= this.z0 || f.z0 >= this.z1) continue;
      // find the noses (where the island becomes ~1m wide)
      let noseIn = f.z0, noseOut = f.z1;
      for (let z = f.z0; z < f.z1; z += 0.5) if (t.islandHalf(z) > 0.5) { noseIn = z; break; }
      for (let z = f.z1; z > f.z0; z -= 0.5) if (t.islandHalf(z) > 0.5) { noseOut = z; break; }
      if (noseIn >= this.z0 && noseIn < this.z1) {
        buildForkSign(k, this.extras, noseIn + 3, f.mainSide);
        for (const s of [-1, 1]) {
          const z = noseIn - 6;
          const x = t.baseCenter(z) + s * 1.6;
          k.hero.at(Xf.trs(x, t.heightAt(x, z), z, Math.PI), () => chevron(k.hero, c, -s));
        }
      }
      const rng = new Rng(this.index * 13 + 5);
      for (let z = Math.max(this.z0, noseIn + 8); z < Math.min(this.z1, noseOut - 4); z += 7) {
        const half = t.islandHalf(z);
        if (half < 1.2) continue;
        const x = t.baseCenter(z);
        const y = t.heightAt(x, z);
        const biome = this.kit.def.biome;
        if (biome === "city" || biome === "military") {
          k.lit.at(Xf.trs(x, y - 0.1, z, 0), () => jersey(k.lit, c, 6.4, true));
        } else if (half > 2.4 && rng.chance(0.6)) {
          const list = rng.chance(0.5) ? k.tpl.tall : k.tpl.small;
          k.lit.stamp(rng.pick(list), Xf.trs(x + rng.range(-1, 1), y - 0.1, z + rng.range(-2, 2), rng.range(0, 6), rng.range(0.7, 1.1)));
        } else {
          k.lit.stamp(rng.pick(k.tpl.small), Xf.trs(x, y - 0.1, z, rng.range(0, 6), rng.range(0.6, 1)));
        }
      }
    }
  }

  private buildFeatures(k: Deco): void {
    const t = this.kit.track;
    for (const f of t.features) {
      if (f.z < this.z0 || f.z >= this.z1) continue;
      switch (f.kind) {
        case "ramp": buildRamp(k, f); break;
        case "lip": buildLip(k, f); break;
        case "wreck": buildWreck(k, f); break;
        case "ice": buildIce(k, f); break;
        default: buildBreakables(k, f, this.kit.debris);
      }
    }
  }

  private buildLandmarks(k: Deco): void {
    const t = this.kit.track;
    const inside = (z: number) => z >= this.z0 && z < this.z1;
    if (this.index === 0) buildStart(k, this.extras);
    for (const z of t.signs) if (inside(z)) buildDistanceSign(k, this.extras, z);
    if (inside(this.kit.def.checkpointAt)) buildCheckpoint(k, this.extras, this.kit.def.checkpointAt);
    if (inside(t.length)) buildEvac(k, this.extras, t.length);
    for (const z of t.overpasses) if (inside(z)) buildOverpass(k, z);
    if (inside(t.endZ - 4)) buildEndWall(k, t.endZ - 4);
  }

  private buildPhysics(col: ColGeo, boxes: BoxCol[]): void {
    const scene = this.kit.scene;
    const container = new PhysicsShapeContainer(scene);
    const setup = (s: PhysicsShape) => {
      s.filterMembershipMask = Layer.WORLD;
      s.filterCollideMask = CollideWith.WORLD;
      s.material = { friction: 0.9, restitution: 0.05 };
    };
    setup(container);
    const colMesh = col.toMesh(`col${this.index}`, scene);
    if (colMesh) {
      const ms = new PhysicsShapeMesh(colMesh, scene);
      setup(ms);
      container.addChild(ms);
      this.shapes.push(ms);
      colMesh.dispose(); // shape data lives in Havok now
    }
    const q = new Quaternion();
    for (const b of boxes) {
      Quaternion.FromEulerAnglesToRef(0, b.yaw, 0, q);
      const bs = new PhysicsShapeBox(new Vector3(b.x, b.y, b.z), q.clone(), new Vector3(b.sx, b.sy, b.sz), scene);
      setup(bs);
      container.addChild(bs);
      this.shapes.push(bs);
    }
    this.shapes.push(container);
    this.node = new TransformNode(`chunkBody${this.index}`, scene);
    this.body = new PhysicsBody(this.node, PhysicsMotionType.STATIC, false, scene);
    this.body.shape = container;
  }

  animate(time: number, dt: number): void {
    for (const a of this.extras.animators) a(time, dt);
  }

  dispose(): void {
    this.kit.debris.disposeChunk(this.index);
    for (const m of this.meshes) {
      Shadows.remove(m);
      m.dispose(false, false);
    }
    this.meshes.length = 0;
    for (const n of this.extras.nodes) n.dispose();
    this.extras.nodes.length = 0;
    this.extras.animators.length = 0;
    this.body?.dispose();
    this.body = null;
    for (const s of this.shapes) s.dispose();
    this.shapes.length = 0;
    this.node?.dispose();
    this.node = null;
  }
}
