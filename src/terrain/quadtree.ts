/**
 * Cube-sphere chunked LOD with asynchronous worker generation.
 *
 * - A node splits when the camera is within lodK × its edge length.
 * - Children replace their parent only when all four meshes are ready, so the
 *   surface never shows holes; vertices geomorph toward the parent surface
 *   with distance, so LOD changes blend instead of popping.
 * - Requests are prioritised coarse-first, then by distance; meshes are
 *   evicted LRU beyond a GPU budget.
 */
import * as THREE from 'three';
import { TerrainWorkerPool } from './workerpool';
import { buildIndices, type NodeMeshData, GRID } from './meshbuilder';
import { faceToDir, nodeArc, nodeBounds } from './cubesphere';
import type { SurfaceParams } from './surface';

let sharedIndex: THREE.BufferAttribute | null = null;
function indexAttr() {
  if (!sharedIndex) sharedIndex = new THREE.BufferAttribute(buildIndices(), 1);
  return sharedIndex;
}

class QNode {
  children: QNode[] | null = null;
  mesh: THREE.Mesh | null = null;
  state: 0 | 1 | 2 = 0; // none, pending, ready
  center = new THREE.Vector3();
  radius = 0;
  minH = 0;
  maxH = 0;
  lastUsed = 0;
  priority = 0;
  heights: Float32Array | null = null;
  parent: QNode | null = null;
  arc: number;
  constructor(readonly face: number, readonly level: number, readonly ix: number, readonly iy: number, R: number) {
    this.arc = nodeArc(level, R);
    const b = nodeBounds(level, ix, iy);
    const d = [0, 0, 0];
    faceToDir(face, b.a0 + b.size / 2, b.b0 + b.size / 2, d);
    this.center.set(d[0] * R, d[1] * R, d[2] * R);
    this.radius = this.arc * 0.75;
  }
}

export interface QuadtreeStats {
  nodes: number;
  drawn: number;
  pending: number;
  maxLevel: number;
}

export class TerrainQuadtree {
  readonly group = new THREE.Group();
  private roots: QNode[] = [];
  private frame = 0;
  private meshCount = 0;
  private queue: QNode[] = [];
  private inFlight = 0;
  readonly maxLevel: number;
  lodK = 3.5;
  budget = 1800;
  maxInFlight = 12;
  stats: QuadtreeStats = { nodes: 0, drawn: 0, pending: 0, maxLevel: 0 };
  private disposed = false;
  private camLocal = new THREE.Vector3();
  private camDist = 0;
  private tmp = new THREE.Vector3();

  constructor(
    readonly id: string,
    readonly params: SurfaceParams,
    readonly pool: TerrainWorkerPool,
    readonly material: THREE.Material,
  ) {
    const R = params.radius;
    // deepest level: vertex spacing ≥ ~0.12 m
    this.maxLevel = Math.max(4, Math.min(24, Math.floor(Math.log2((Math.PI / 2) * R / GRID / 0.12))));
    for (let f = 0; f < 6; f++) this.roots.push(new QNode(f, 0, 0, 0, R));
    pool.ensurePlanet(id, params);
    this.group.matrixAutoUpdate = true;
  }

  get ready(): boolean {
    return this.roots.every((r) => r.state === 2);
  }

  /**
   * camLocal: camera position in the planet-fixed frame (metres, float64).
   * Returns true when everything needed for this view is resident.
   */
  private camDir = new THREE.Vector3(0, 0, -1);

  update(camLocal: THREE.Vector3, camDirLocal?: THREE.Vector3): boolean {
    if (this.disposed) return false;
    this.frame++;
    this.camLocal.copy(camLocal);
    if (camDirLocal) this.camDir.copy(camDirLocal).normalize();
    this.camDist = camLocal.length();
    for (const c of this.group.children) c.visible = false;
    let drawn = 0;
    let deepest = 0;
    let complete = true;
    const visit = (n: QNode): void => {
      n.lastUsed = this.frame;
      if (n.state !== 2) {
        this.request(n);
        complete = false;
        return;
      }
      if (this.horizonCulled(n)) return;
      const d = Math.max(0, this.tmp.copy(n.center).sub(camLocal).length() - n.radius * 0.5);
      if (n.level < this.maxLevel && d < this.lodK * n.arc) {
        if (!n.children) n.children = this.makeChildren(n);
        let allReady = true;
        for (const c of n.children) {
          c.lastUsed = this.frame;
          if (c.state !== 2) {
            allReady = false;
            this.request(c);
          }
        }
        if (allReady) {
          for (const c of n.children) visit(c);
          return;
        }
        complete = false;
      }
      if (n.mesh) {
        n.mesh.visible = true;
        drawn++;
        if (n.level > deepest) deepest = n.level;
      }
    };
    for (const r of this.roots) visit(r);
    this.pump();
    this.evict();
    this.stats = { nodes: this.meshCount, drawn, pending: this.inFlight + this.queue.length, maxLevel: deepest };
    return complete && this.queue.length === 0;
  }

  private makeChildren(n: QNode): QNode[] {
    const R = this.params.radius;
    const L = n.level + 1;
    const c = [
      new QNode(n.face, L, n.ix * 2, n.iy * 2, R),
      new QNode(n.face, L, n.ix * 2 + 1, n.iy * 2, R),
      new QNode(n.face, L, n.ix * 2, n.iy * 2 + 1, R),
      new QNode(n.face, L, n.ix * 2 + 1, n.iy * 2 + 1, R),
    ];
    for (const k of c) k.parent = n;
    return c;
  }

  private horizonCulled(n: QNode): boolean {
    if (n.level < 2) return false;
    const R = this.params.radius;
    const Rm = R + Math.min(0, n.minH);
    const dc = this.camDist;
    if (dc <= Rm) return false;
    const cl = n.center.length();
    const camAng = Math.acos(Math.min(1, Rm / dc));
    const nodeTop = cl + Math.max(0, n.maxH - (cl - R)) + n.radius * 0.2;
    const nodeAng = Math.acos(Math.min(1, Rm / Math.max(nodeTop, Rm)));
    const ang = this.camLocal.angleTo(n.center);
    const nodeHalf = n.arc / R; // angular half-extent (generous)
    return ang > camAng + nodeAng + nodeHalf;
  }

  private request(n: QNode) {
    // urgency: distance in units of node size (smaller = needed sooner); nodes
    // outside the view cone are deferred
    const to = this.tmp.copy(n.center).sub(this.camLocal);
    const d = to.length();
    let pr = Math.max(0, d - n.arc * 0.7) / n.arc;
    if (d > n.arc && to.dot(this.camDir) < d * 0.35) pr = pr * 4 + 2;
    n.priority = pr;
    if (n.state !== 0) return;
    n.state = 1;
    this.queue.push(n);
  }

  private pump() {
    if (this.queue.length === 0) return;
    // most urgent first (priority refreshed whenever the node is re-requested)
    this.queue.sort((a, b) => a.priority - b.priority);
    while (this.inFlight < this.maxInFlight && this.queue.length) {
      const n = this.queue.shift()!;
      // drop stale requests (not used recently)
      if (this.frame - n.lastUsed > 30) {
        n.state = 0;
        continue;
      }
      this.inFlight++;
      this.pool.build(this.id, n.face, n.level, n.ix, n.iy, this.parentQuadrant(n)).then(
        (d) => {
          this.inFlight--;
          if (this.disposed) return;
          this.attach(n, d);
        },
        (e) => {
          this.inFlight--;
          n.state = 0;
          console.warn('terrain build failed', e);
        },
      );
    }
  }

  /** The parent's displayed heights over this node's quadrant, for exact geomorph targets. */
  private parentQuadrant(n: QNode): Float32Array | undefined {
    const p = n.parent;
    if (!p || !p.heights) return undefined;
    const W = GRID + 1, H = GRID / 2;
    const qx = (n.ix & 1) * H, qy = (n.iy & 1) * H;
    const out = new Float32Array((H + 1) * (H + 1));
    for (let j = 0; j <= H; j++) for (let i = 0; i <= H; i++) out[j * (H + 1) + i] = p.heights[(qy + j) * W + qx + i];
    return out;
  }

  private attach(n: QNode, d: NodeMeshData) {
    const g = new THREE.BufferGeometry();
    g.setIndex(indexAttr());
    g.setAttribute('position', new THREE.BufferAttribute(d.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3));
    g.setAttribute('a0', new THREE.BufferAttribute(d.a0, 4));
    g.setAttribute('a1', new THREE.BufferAttribute(d.a1, 4));
    g.setAttribute('morph', new THREE.BufferAttribute(d.morph, 3));
    g.setAttribute('detail', new THREE.BufferAttribute(d.detail, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), d.radius);
    const m = new THREE.Mesh(g, this.material);
    m.position.set(d.center[0], d.center[1], d.center[2]);
    m.visible = false;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.group.add(m);
    n.mesh = m;
    n.center.set(d.center[0], d.center[1], d.center[2]);
    n.radius = d.radius;
    n.heights = d.heights;
    n.minH = d.minH;
    n.maxH = d.maxH;
    n.state = 2;
    this.meshCount++;
  }

  private evict() {
    if (this.meshCount <= this.budget) return;
    const list: QNode[] = [];
    const walk = (n: QNode) => {
      if (n.level > 0 && n.mesh && !n.mesh.visible && this.frame - n.lastUsed > 10) list.push(n);
      if (n.children) for (const c of n.children) walk(c);
    };
    for (const r of this.roots) walk(r);
    list.sort((a, b) => a.lastUsed - b.lastUsed);
    let excess = this.meshCount - this.budget + 64;
    for (const n of list) {
      if (excess-- <= 0) break;
      this.release(n);
    }
    // prune empty subtrees
    const prune = (n: QNode) => {
      if (!n.children) return;
      for (const c of n.children) prune(c);
      if (n.children.every((c) => c.state === 0 && !c.children)) n.children = null;
    };
    for (const r of this.roots) prune(r);
  }

  private release(n: QNode) {
    if (n.mesh) {
      this.group.remove(n.mesh);
      n.mesh.geometry.dispose();
      n.mesh = null;
      n.heights = null;
      this.meshCount--;
    }
    n.state = 0;
  }

  dispose() {
    this.disposed = true;
    const walk = (n: QNode) => {
      this.release(n);
      if (n.children) for (const c of n.children) walk(c);
    };
    for (const r of this.roots) walk(r);
    this.pool.dropPlanet(this.id);
  }
}
