// CDLOD terrain renderer: one instanced grid mesh (GRID x GRID quads) drawn once per pass for all selected
// quadtree nodes. LOD0 nodes are 64 m (2 m quads = the heightfield resolution), each level doubles.
// Node selection runs on the CPU every frame (lateUpdate, after the camera moved).
import * as THREE from 'three';
import { CELL, N, WORLD_SIZE } from './TerrainData';
import { createTerrainMaterial, GRID, type TerrainUniforms } from './TerrainMaterial';

const LOD0_SIZE = GRID * CELL; // 64 m
const ROOT_LOD = 4; // 1024 m roots (3 x 3)
const MAX_NODES = 2048;
/** Distance (m) at which LOD L hands over to L+1. Must be >= ~2.83 x node size(L) for crack-free morphing. */
const BASE_RANGE = 3 * LOD0_SIZE;

export class TerrainRenderer {
  readonly mesh: THREE.Mesh;
  readonly geometry: THREE.InstancedBufferGeometry;
  readonly uniforms: TerrainUniforms;
  private nodeAttr: THREE.InstancedBufferAttribute;
  private nodeData: Float32Array;
  private ranges: number[] = [];
  /** min/max heights per node per LOD (flattened grids). */
  private minH: Float32Array[] = [];
  private maxH: Float32Array[] = [];
  private frustum = new THREE.Frustum();
  private projView = new THREE.Matrix4();
  private box = new THREE.Box3();
  private camPos = new THREE.Vector3();
  /** Nodes within this distance are kept even outside the view frustum (they can cast shadows into view). */
  shadowKeepDistance = 250;
  /** LOD range multiplier (quality preset). */
  detail = 1;
  nodeCount = 0;
  lodCounts = [0, 0, 0, 0, 0];
  private savedCount = 0;
  private nodeDist = new Float32Array(MAX_NODES);
  private order: number[] = [];
  private sorted = new Float32Array(MAX_NODES * 4);
  /** Cascade cameras and their far split distances, provided by the world (see setShadowCascades). */
  private cascadeCams: THREE.Camera[] = [];
  private cascadeFar: number[] = [];

  /** Register the sun shadow cascade cameras with the distance each one covers. */
  setShadowCascades(cams: THREE.Camera[], far: number[]): void {
    this.cascadeCams = cams;
    this.cascadeFar = far;
  }

  private shadowLimit(cam: THREE.Camera): number {
    const i = this.cascadeCams.indexOf(cam);
    if (i < 0) return this.nodeCount;
    const far = this.cascadeFar[i] ?? Infinity;
    // binary search on the sorted distances
    let lo = 0, hi = this.nodeCount;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.nodeDist[mid] <= far) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  constructor(heights: Float32Array, uniforms: TerrainUniforms) {
    this.uniforms = uniforms;
    this.geometry = new THREE.InstancedBufferGeometry();
    const verts = (GRID + 1) * (GRID + 1);
    const pos = new Float32Array(verts * 3);
    for (let j = 0; j <= GRID; j++)
      for (let i = 0; i <= GRID; i++) {
        const o = (j * (GRID + 1) + i) * 3;
        pos[o] = i;
        pos[o + 1] = 0;
        pos[o + 2] = j;
      }
    const idx: number[] = [];
    for (let j = 0; j < GRID; j++)
      for (let i = 0; i < GRID; i++) {
        const a = j * (GRID + 1) + i, b = a + 1, c = a + GRID + 1, d = c + 1;
        // same diagonal as the Rapier heightfield: (x0, z1)-(x1, z0)
        idx.push(a, c, b, b, c, d);
      }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3).fill(0), 3));
    this.geometry.setIndex(idx);
    this.nodeData = new Float32Array(MAX_NODES * 4);
    this.nodeAttr = new THREE.InstancedBufferAttribute(this.nodeData, 4);
    this.nodeAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('nodeInfo', this.nodeAttr);
    this.geometry.instanceCount = 0;
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(WORLD_SIZE / 2, 0, WORLD_SIZE / 2), WORLD_SIZE);

    const { material, depthMaterial } = createTerrainMaterial(uniforms);
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = 'terrain';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.customDepthMaterial = depthMaterial;
    this.mesh.matrixAutoUpdate = false;
    // Shadow cascades only need nodes up to their own far distance: nodes are sorted by distance, so each
    // cascade draws a prefix of the instance list.
    this.mesh.onBeforeShadow = (_r, _o, _c, shadowCamera) => {
      const limit = this.shadowLimit(shadowCamera as THREE.OrthographicCamera);
      this.savedCount = this.geometry.instanceCount;
      this.geometry.instanceCount = limit;
    };
    this.mesh.onAfterShadow = () => {
      this.geometry.instanceCount = this.savedCount;
    };
    this.buildMinMax(heights);
    this.setDetail(1);
  }

  /** LOD distance scale (0.6 low .. 1.3 ultra). */
  setDetail(d: number): void {
    this.detail = d;
    this.ranges = [];
    const morph: THREE.Vector2[] = [];
    for (let l = 0; l <= ROOT_LOD + 1; l++) {
      const r = BASE_RANGE * d * Math.pow(2, l);
      this.ranges.push(r);
      morph.push(new THREE.Vector2(r * 0.7, r));
    }
    while (morph.length < 8) morph.push(new THREE.Vector2(1e9, 1e9 + 1));
    this.uniforms.uMorph.value = morph;
  }

  private buildMinMax(h: Float32Array): void {
    for (let l = 0; l <= ROOT_LOD; l++) {
      const size = LOD0_SIZE << l;
      const n = Math.ceil(WORLD_SIZE / size);
      const mn = new Float32Array(n * n).fill(Infinity), mx = new Float32Array(n * n).fill(-Infinity);
      if (l === 0) {
        const per = size / CELL;
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n; i++) {
            let a = Infinity, b = -Infinity;
            for (let y = j * per; y <= Math.min(N - 1, (j + 1) * per); y++)
              for (let x = i * per; x <= Math.min(N - 1, (i + 1) * per); x++) {
                const v = h[y * N + x];
                if (v < a) a = v;
                if (v > b) b = v;
              }
            mn[j * n + i] = a;
            mx[j * n + i] = b;
          }
      } else {
        const pn = Math.ceil(WORLD_SIZE / (size / 2));
        const pmn = this.minH[l - 1], pmx = this.maxH[l - 1];
        for (let j = 0; j < pn; j++)
          for (let i = 0; i < pn; i++) {
            const k = (j >> 1) * n + (i >> 1);
            mn[k] = Math.min(mn[k], pmn[j * pn + i]);
            mx[k] = Math.max(mx[k], pmx[j * pn + i]);
          }
      }
      this.minH.push(mn);
      this.maxH.push(mx);
    }
  }

  /** Select quadtree nodes for this camera and upload instance data. */
  update(camera: THREE.PerspectiveCamera): void {
    camera.updateMatrixWorld();
    this.camPos.copy(camera.position);
    this.uniforms.uCamPos.value.copy(this.camPos);
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    this.nodeCount = 0;
    this.lodCounts.fill(0);
    const rootSize = LOD0_SIZE << ROOT_LOD;
    const n = Math.ceil(WORLD_SIZE / rootSize);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) this.select(i, j, ROOT_LOD);
    // sort nodes by distance (nearest first) so shadow cascades can draw a prefix
    const order = this.order;
    order.length = this.nodeCount;
    for (let k = 0; k < this.nodeCount; k++) order[k] = k;
    const dist = this.nodeDist;
    order.sort((a, b) => dist[a] - dist[b]);
    const src = this.nodeData, dst = this.sorted;
    for (let k = 0; k < this.nodeCount; k++) {
      const o = order[k] * 4;
      dst[k * 4] = src[o];
      dst[k * 4 + 1] = src[o + 1];
      dst[k * 4 + 2] = src[o + 2];
      dst[k * 4 + 3] = src[o + 3];
    }
    const sortedDist = order.map((k) => dist[k]);
    for (let k = 0; k < this.nodeCount; k++) dist[k] = sortedDist[k];
    src.set(dst.subarray(0, this.nodeCount * 4));
    this.geometry.instanceCount = this.nodeCount;
    this.nodeAttr.clearUpdateRanges();
    this.nodeAttr.addUpdateRange(0, this.nodeCount * 4);
    this.nodeAttr.needsUpdate = true;
  }

  private select(i: number, j: number, lod: number): void {
    const size = LOD0_SIZE << lod;
    const n = Math.ceil(WORLD_SIZE / size);
    const k = j * n + i;
    const x0 = i * size, z0 = j * size;
    this.box.min.set(x0, this.minH[lod][k] - 1, z0);
    this.box.max.set(x0 + size, this.maxH[lod][k] + 1, z0 + size);
    const d = this.box.distanceToPoint(this.camPos);
    if (d > this.shadowKeepDistance && !this.frustum.intersectsBox(this.box)) return;
    if (lod > 0 && d < this.ranges[lod - 1]) {
      for (let c = 0; c < 4; c++) this.select(i * 2 + (c & 1), j * 2 + (c >> 1), lod - 1);
      return;
    }
    if (this.nodeCount >= MAX_NODES) return;
    const o = this.nodeCount * 4;
    this.nodeDist[this.nodeCount] = d;
    this.nodeData[o] = x0;
    this.nodeData[o + 1] = z0;
    this.nodeData[o + 2] = size;
    this.nodeData[o + 3] = lod;
    this.nodeCount++;
    this.lodCounts[lod]++;
  }
}
