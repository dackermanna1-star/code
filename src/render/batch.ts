// Island batching: concatenates the parts' RenderGeoms of one rigid island into ONE opaque mesh
// (shared world material → one draw call) plus one glass mesh for transparent surfaces, both
// parented to the island's TransformNode (island frame = node-local space).
//
// ============================================================================================
// WORLD VERTEX LAYOUT  (world material + glass material; reused by VFX micro-debris instances)
// ============================================================================================
//   attribute   size  meaning
//   position    3     island-frame position (m)
//   normal      3     unit normal
//   uv          2     texture REPEATS (= RenderGeom uv metres / surface worldSize)
//   color       4     LINEAR rgba tint = srgbToLinear(surface tint) × srgbToLinear(face tint);
//                     a = 1 for opaque, = glass opacity for transparent surfaces
//   surf        4     x = albedo layer index (integer)
//                     y = normal layer index (integer)
//                     z = round(roughness·255) + 256·round(metallic·255)   (exact integer)
//                     w = emissive HDR strength: > 0 mains-powered (scaled by the material's
//                         power uniform, Render.setPower), < 0 always-on (|w|), 0 = none
//
// Batched meshes store all five in ONE interleaved Float32 buffer (16 floats = 64 B/vertex).
// Thin instances (VFX micro-debris) may supply `surf` per instance with
//   mesh.thinInstanceSetBuffer("surf", data, 4)
// and the tint with mesh.thinInstanceSetBuffer("color", data, 4) (Babylon maps it to
// instanceColor). Never pack these by hand: use `surfAttrib()` / `colorAttrib()` below — they
// read the active surface table registered by the RenderSystem.
//
// Printed surfaces (book covers, posters, labels, panels, clock face, display digits) are
// drawn as one full tile: give the face's part `uvOffset = [faceWidth/2, faceHeight/2]` and a
// surface whose worldSize equals the face size (registerSurface with the same tex) so the
// face shows exactly the whole artwork.
// ============================================================================================

import { Mesh, VertexBuffer, Buffer, SubMesh, BoundingInfo, Vector3, type Scene, type TransformNode, type Material, type AbstractMesh } from "@babylonjs/core";
import type { RenderGeom } from "../geom/meshgen.ts";
import type { IslandMeshes } from "../core/context.ts";
import { SURFACES } from "./surfaces.ts";
import type { TextureLibrary } from "./textures.ts";

/** Floats per vertex in batched island buffers. */
export const WORLD_STRIDE = 16;
const OFF_NORMAL = 3,
  OFF_UV = 6,
  OFF_COLOR = 8,
  OFF_SURF = 12;

/** Emissive surfaces that keep glowing when the apartment loses mains power. */
const ALWAYS_ON_EMISSIVE = new Set<string>(["city_windows"]);

/** sRGB 8-bit → linear float. */
export const SRGB_TO_LINEAR: Float32Array = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();

// ------------------------------------------------------------------ surface table

/** Per-surface packed vertex constants, rebuilt/extended as surfaces are registered. */
export class SurfaceTable {
  /** Stride 10: albedoL, normalL, packedRM, emissive, invWorldSize, tintR, tintG, tintB, alpha, transparent. */
  static readonly STRIDE = 10;
  data = new Float32Array(0);
  count = 0;
  readonly textures: TextureLibrary;
  private warnedBad = false;

  constructor(textures: TextureLibrary) {
    this.textures = textures;
    this.sync();
  }

  /** Map surfaces added since the last call (also syncs the texture library). */
  sync(): void {
    if (this.count >= SURFACES.length) return;
    this.textures.sync();
    const n = SURFACES.length;
    const grown = new Float32Array(n * SurfaceTable.STRIDE);
    grown.set(this.data);
    for (let i = this.count; i < n; i++) {
      const s = SURFACES[i];
      const o = i * SurfaceTable.STRIDE;
      const rough = clamp(s.roughness, 0, 1),
        metal = clamp(s.metallic, 0, 1);
      grown[o] = this.textures.albedoLayerOf(i);
      grown[o + 1] = this.textures.normalLayerOf(i);
      grown[o + 2] = Math.round(rough * 255) + 256 * Math.round(metal * 255);
      const em = Math.max(0, s.emissive ?? 0);
      grown[o + 3] = em > 0 && ALWAYS_ON_EMISSIVE.has(s.name) ? -em : em;
      grown[o + 4] = 1 / (s.worldSize > 1e-6 ? s.worldSize : 1);
      grown[o + 5] = SRGB_TO_LINEAR[(s.tint >> 16) & 255];
      grown[o + 6] = SRGB_TO_LINEAR[(s.tint >> 8) & 255];
      grown[o + 7] = SRGB_TO_LINEAR[s.tint & 255];
      grown[o + 8] = s.transparent ? glassOpacity(s.tint, rough) : 1;
      grown[o + 9] = s.transparent ? 1 : 0;
    }
    this.data = grown;
    this.count = n;
  }

  /** Index into `data` for a surface (sanitised: bad indices map to surface 0, warned once). */
  base(surf: number): number {
    if (surf >= 0 && surf < this.count) return surf * SurfaceTable.STRIDE;
    if (surf >= this.count && surf < SURFACES.length) {
      this.sync();
      if (surf < this.count) return surf * SurfaceTable.STRIDE;
    }
    if (!this.warnedBad) {
      this.warnedBad = true;
      console.warn(`render/batch: invalid surface index ${surf} (have ${this.count}); using surface 0`);
    }
    return 0;
  }
}

/** Opacity of a transparent surface: clear glass ≈ 0.18, frosted ≈ 0.55, smoked ≈ 0.8. */
function glassOpacity(tint: number, rough: number): number {
  const r = ((tint >> 16) & 255) / 255,
    g = ((tint >> 8) & 255) / 255,
    b = (tint & 255) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return clamp(0.06 + (1 - lum) * 0.9 + rough * 1.1, 0.08, 0.95);
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

let activeTable: SurfaceTable | null = null;

/** Register the table used by surfAttrib/colorAttrib (done by the RenderSystem). */
export function setActiveSurfaceTable(t: SurfaceTable | null): void {
  activeTable = t;
}

export function getActiveSurfaceTable(): SurfaceTable | null {
  return activeTable;
}

/**
 * The world-material `surf` attribute (4 floats) for a surface index, written into `out` at
 * `offset`. Use for per-instance buffers (VFX micro-debris). Requires an initialised
 * RenderSystem; before that it writes layer 0 / nominal values.
 */
export function surfAttrib(surf: number, out: Float32Array | number[], offset = 0): void {
  const t = activeTable;
  if (!t) {
    out[offset] = 0;
    out[offset + 1] = 0;
    out[offset + 2] = 128;
    out[offset + 3] = 0;
    return;
  }
  const b = t.base(surf);
  out[offset] = t.data[b];
  out[offset + 1] = t.data[b + 1];
  out[offset + 2] = t.data[b + 2];
  out[offset + 3] = t.data[b + 3];
}

/** The world-material linear `color` attribute (rgba) for a surface + 0xRRGGBB tint. */
export function colorAttrib(surf: number, tint: number, out: Float32Array | number[], offset = 0): void {
  const t = activeTable;
  const r = SRGB_TO_LINEAR[(tint >> 16) & 255],
    g = SRGB_TO_LINEAR[(tint >> 8) & 255],
    b = SRGB_TO_LINEAR[tint & 255];
  if (!t) {
    out[offset] = r;
    out[offset + 1] = g;
    out[offset + 2] = b;
    out[offset + 3] = 1;
    return;
  }
  const o = t.base(surf);
  out[offset] = r * t.data[o + 5];
  out[offset + 1] = g * t.data[o + 6];
  out[offset + 2] = b * t.data[o + 7];
  out[offset + 3] = t.data[o + 8];
}

/** Texture repeats per metre for a surface (uv metres × this = attribute uv). */
export function uvScaleOf(surf: number): number {
  const t = activeTable;
  if (!t) return 1;
  return t.data[t.base(surf) + 4];
}

// ------------------------------------------------------------------ batcher

/** Lighting integration (implemented by render-env's Lighting; optional in probes). */
export interface BatchHooks {
  registerReceiver?(mesh: AbstractMesh): void;
  unregisterReceiver?(mesh: AbstractMesh): void;
  setShadowCaster?(mesh: AbstractMesh, cast: boolean, large?: boolean): void;
}

/** GPU/CPU buffers behind one batched mesh. */
interface BatchRecord {
  cpu: Float32Array;
  idx: Uint32Array;
  buffer: Buffer;
  capV: number;
  capI: number;
  usedV: number;
  usedI: number;
  sub: SubMesh;
  glass: boolean;
  large: boolean;
  castsShadow: boolean;
}

export interface BatchStats {
  builds: number;
  meshesCreated: number;
  meshesReused: number;
  vertices: number;
  ms: number;
  lastMs: number;
  lastVertices: number;
}

/** Diagonal (m) above which a mesh also renders into the far shadow cascades. */
const LARGE_DIAGONAL = 1.5;

export class IslandBatcher {
  readonly stats: BatchStats = { builds: 0, meshesCreated: 0, meshesReused: 0, vertices: 0, ms: 0, lastMs: 0, lastVertices: 0 };
  private records = new WeakMap<Mesh, BatchRecord>();
  // scratch
  private vclass = new Uint8Array(1024);
  private remap = new Int32Array(1024);
  private readonly tmpMin = new Vector3();
  private readonly tmpMax = new Vector3();
  private warnedGeom = false;
  /** Glass meshes cast no shadows (sunlight passes through windows). */
  glassCastsShadows = false;
  readonly scene: Scene;
  readonly table: SurfaceTable;
  worldMaterial: Material;
  glassMaterial: Material;
  hooks: BatchHooks;

  constructor(scene: Scene, worldMaterial: Material, glassMaterial: Material, table: SurfaceTable, hooks: BatchHooks = {}) {
    this.scene = scene;
    this.worldMaterial = worldMaterial;
    this.glassMaterial = glassMaterial;
    this.table = table;
    this.hooks = hooks;
  }

  /**
   * Build/replace the batched meshes of an island. Reuses `prev`'s GPU buffers when they have
   * enough capacity, otherwise recreates them. Meshes are parented to `node`.
   */
  build(node: TransformNode, geoms: readonly RenderGeom[], prev: IslandMeshes | null, name: string): IslandMeshes {
    const t0 = performance.now();
    this.table.sync();
    const tab = this.table.data;
    const S = SurfaceTable.STRIDE;
    // ---- pass 1: count vertices / indices per class (0 = opaque, 1 = glass)
    let nv0 = 0,
      nv1 = 0,
      ni0 = 0,
      ni1 = 0;
    for (const g of geoms) {
      if (!this.validGeom(g)) continue;
      const vc = g.vertexCount;
      if (this.vclass.length < vc) this.vclass = new Uint8Array(vc * 2);
      const cls = this.vclass;
      const surf = g.surf;
      let any = 0;
      for (let v = 0; v < vc; v++) {
        const c = tab[this.table.base(surf[v]) + 9] > 0.5 ? 1 : 0;
        cls[v] = c;
        any |= c;
      }
      if (!any) {
        nv0 += vc;
        ni0 += g.indices.length - (g.indices.length % 3);
        continue;
      }
      for (let v = 0; v < vc; v++) {
        if (cls[v]) nv1++;
        else nv0++;
      }
      const ind = g.indices;
      for (let t = 0; t + 2 < ind.length; t += 3) {
        const i0 = ind[t];
        if (i0 < vc && cls[i0]) ni1 += 3;
        else ni0 += 3;
      }
    }
    // ---- target meshes
    const opaque = this.target(prev?.opaque ?? null, node, name, false, nv0, ni0);
    const glass = this.target(prev?.glass ?? null, node, name + "_glass", true, nv1, ni1);
    const ro = opaque ? (this.records.get(opaque) as BatchRecord) : null;
    const rg = glass ? (this.records.get(glass) as BatchRecord) : null;
    // ---- pass 2: fill
    let vo = 0,
      vg = 0,
      io = 0,
      ig = 0;
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    let gminX = Infinity,
      gminY = Infinity,
      gminZ = Infinity,
      gmaxX = -Infinity,
      gmaxY = -Infinity,
      gmaxZ = -Infinity;
    for (const g of geoms) {
      if (!this.validGeom(g)) continue;
      const vc = g.vertexCount;
      if (this.remap.length < vc) this.remap = new Int32Array(vc * 2);
      if (this.vclass.length < vc) this.vclass = new Uint8Array(vc * 2);
      const remap = this.remap,
        cls = this.vclass;
      const P = g.positions,
        N = g.normals,
        UV = g.uvs,
        SF = g.surf,
        TN = g.tint;
      for (let v = 0; v < vc; v++) {
        const b = this.table.base(SF[v]);
        const isGlass = tab[b + 9] > 0.5;
        cls[v] = isGlass ? 1 : 0;
        const rec = isGlass ? rg : ro;
        if (!rec) {
          remap[v] = -1;
          continue;
        }
        const vi = isGlass ? vg++ : vo++;
        remap[v] = vi;
        const out = rec.cpu;
        const o = vi * WORLD_STRIDE;
        let px = P[v * 3],
          py = P[v * 3 + 1],
          pz = P[v * 3 + 2];
        if (!(px === px && py === py && pz === pz)) {
          // NaN guard (should never happen): collapse to origin rather than poison bounds
          px = py = pz = 0;
          this.warnGeom("NaN position");
        }
        out[o] = px;
        out[o + 1] = py;
        out[o + 2] = pz;
        out[o + OFF_NORMAL] = N[v * 3];
        out[o + OFF_NORMAL + 1] = N[v * 3 + 1];
        out[o + OFF_NORMAL + 2] = N[v * 3 + 2];
        const inv = tab[b + 4];
        out[o + OFF_UV] = UV[v * 2] * inv;
        out[o + OFF_UV + 1] = UV[v * 2 + 1] * inv;
        const tint = TN[v];
        out[o + OFF_COLOR] = SRGB_TO_LINEAR[(tint >> 16) & 255] * tab[b + 5];
        out[o + OFF_COLOR + 1] = SRGB_TO_LINEAR[(tint >> 8) & 255] * tab[b + 6];
        out[o + OFF_COLOR + 2] = SRGB_TO_LINEAR[tint & 255] * tab[b + 7];
        out[o + OFF_COLOR + 3] = tab[b + 8];
        out[o + OFF_SURF] = tab[b];
        out[o + OFF_SURF + 1] = tab[b + 1];
        out[o + OFF_SURF + 2] = tab[b + 2];
        out[o + OFF_SURF + 3] = tab[b + 3];
        if (isGlass) {
          if (px < gminX) gminX = px;
          if (py < gminY) gminY = py;
          if (pz < gminZ) gminZ = pz;
          if (px > gmaxX) gmaxX = px;
          if (py > gmaxY) gmaxY = py;
          if (pz > gmaxZ) gmaxZ = pz;
        } else {
          if (px < minX) minX = px;
          if (py < minY) minY = py;
          if (pz < minZ) minZ = pz;
          if (px > maxX) maxX = px;
          if (py > maxY) maxY = py;
          if (pz > maxZ) maxZ = pz;
        }
      }
      const ind = g.indices;
      for (let t = 0; t + 2 < ind.length; t += 3) {
        const a = ind[t],
          b = ind[t + 1],
          c = ind[t + 2];
        if (a >= vc || b >= vc || c >= vc) {
          this.warnGeom("index out of range");
          continue;
        }
        const ra = remap[a],
          rb = remap[b],
          rc = remap[c];
        if (ra < 0 || rb < 0 || rc < 0) continue;
        if (cls[a]) {
          if (!rg || cls[b] !== 1 || cls[c] !== 1) continue;
          rg.idx[ig++] = ra;
          rg.idx[ig++] = rb;
          rg.idx[ig++] = rc;
        } else {
          if (!ro || cls[b] !== 0 || cls[c] !== 0) continue;
          ro.idx[io++] = ra;
          ro.idx[io++] = rb;
          ro.idx[io++] = rc;
        }
      }
    }
    // ---- upload + draw ranges + bounds + lighting registration
    if (opaque && ro) this.commit(opaque, ro, vo, io, minX, minY, minZ, maxX, maxY, maxZ);
    if (glass && rg) this.commit(glass, rg, vg, ig, gminX, gminY, gminZ, gmaxX, gmaxY, gmaxZ);
    const ms = performance.now() - t0;
    this.stats.builds++;
    this.stats.ms += ms;
    this.stats.lastMs = ms;
    this.stats.lastVertices = vo + vg;
    this.stats.vertices += vo + vg;
    return { opaque, glass };
  }

  /** Dispose an island's meshes (unregisters lighting, frees GPU buffers; materials are shared). */
  dispose(m: IslandMeshes | null): void {
    if (!m) return;
    if (m.opaque) this.disposeMesh(m.opaque);
    if (m.glass) this.disposeMesh(m.glass);
  }

  /** CPU-side world-layout data of a batched mesh (debug/consolidation tools). */
  dataOf(mesh: Mesh): { vertices: Float32Array; indices: Uint32Array } | null {
    const r = this.records.get(mesh);
    if (!r) return null;
    return { vertices: r.cpu.subarray(0, r.usedV * WORLD_STRIDE), indices: r.idx.subarray(0, r.usedI) };
  }

  // ---------------------------------------------------------------- internals

  private validGeom(g: RenderGeom): boolean {
    const vc = g.vertexCount;
    if (!(vc > 0)) return false;
    if (g.positions.length < vc * 3 || g.normals.length < vc * 3 || g.uvs.length < vc * 2 || g.surf.length < vc || g.tint.length < vc) {
      this.warnGeom("arrays shorter than vertexCount");
      return false;
    }
    return true;
  }

  private warnGeom(what: string): void {
    if (this.warnedGeom) return;
    this.warnedGeom = true;
    console.warn(`render/batch: malformed RenderGeom (${what}); offending data skipped`);
  }

  /** Reuse `prev` if it has capacity, else create a fresh mesh (disposing prev). null when empty. */
  private target(prev: Mesh | null, node: TransformNode, name: string, glass: boolean, nv: number, ni: number): Mesh | null {
    if (nv === 0 || ni === 0) {
      if (prev) this.disposeMesh(prev);
      return null;
    }
    if (prev && !prev.isDisposed()) {
      const r = this.records.get(prev);
      // reuse when it fits and is not grossly oversized
      if (r && r.glass === glass && r.capV >= nv && r.capI >= ni && !(r.capV > 2048 && nv < r.capV / 4)) {
        if (prev.parent !== node) prev.parent = node;
        this.stats.meshesReused++;
        return prev;
      }
      this.disposeMesh(prev);
    }
    return this.create(node, name, glass, nv, ni);
  }

  private create(node: TransformNode, name: string, glass: boolean, nv: number, ni: number): Mesh {
    const scene = this.scene;
    const capV = Math.ceil(nv * 1.25) + 16;
    const capI = Math.ceil(ni * 1.25) + 48;
    const cpu = new Float32Array(capV * WORLD_STRIDE);
    const idx = new Uint32Array(capI);
    const mesh = new Mesh(name, scene);
    mesh.parent = node;
    const buffer = new Buffer(scene.getEngine(), cpu, true, WORLD_STRIDE, false, false, false, undefined, name + "_vb");
    mesh.setVerticesBuffer(buffer.createVertexBuffer(VertexBuffer.PositionKind, 0, 3));
    mesh.setVerticesBuffer(buffer.createVertexBuffer(VertexBuffer.NormalKind, OFF_NORMAL, 3));
    mesh.setVerticesBuffer(buffer.createVertexBuffer(VertexBuffer.UVKind, OFF_UV, 2));
    mesh.setVerticesBuffer(buffer.createVertexBuffer(VertexBuffer.ColorKind, OFF_COLOR, 4));
    mesh.setVerticesBuffer(buffer.createVertexBuffer("surf", OFF_SURF, 4));
    mesh.setIndices(idx, capV, true);
    mesh.releaseSubMeshes();
    // explicit draw range (only the used part of the capacity is drawn); give it a bounding box
    // up front so Babylon never tries to compute one from the (partially stale) vertex data
    const sub = new SubMesh(0, 0, 0, 0, 0, mesh, undefined, false, true);
    sub.setBoundingInfo(new BoundingInfo(Vector3.Zero(), Vector3.Zero()));
    mesh.material = glass ? this.glassMaterial : this.worldMaterial;
    mesh.hasVertexAlpha = glass;
    mesh.useVertexColors = true;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.checkCollisions = false;
    const rec: BatchRecord = { cpu, idx, buffer, capV, capI, usedV: 0, usedI: 0, sub, glass, large: false, castsShadow: false };
    this.records.set(mesh, rec);
    this.stats.meshesCreated++;
    this.hooks.registerReceiver?.(mesh);
    return mesh;
  }

  private commit(mesh: Mesh, r: BatchRecord, nv: number, ni: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    // upload only the used vertex range; keep the FULL CPU array as the buffer's data so
    // context restore and Babylon's own readers see a consistent, capacity-sized array
    // (Buffer.updateDirectly with a count clears _data, so it is restored right after)
    r.buffer.updateDirectly(r.cpu, 0, Math.max(1, nv));
    (r.buffer as unknown as { _data: Float32Array | null })._data = r.cpu;
    const ib = mesh.geometry?.getIndexBuffer();
    if (ib) this.scene.getEngine().updateDynamicIndexBuffer(ib, r.idx.subarray(0, Math.max(3, ni)), 0);
    r.usedV = nv;
    r.usedI = ni;
    r.sub.verticesStart = 0;
    r.sub.verticesCount = nv;
    r.sub.indexStart = 0;
    r.sub.indexCount = ni;
    if (!(x0 <= x1)) {
      x0 = y0 = z0 = 0;
      x1 = y1 = z1 = 0;
    }
    const mn = this.tmpMin.set(x0, y0, z0),
      mx = this.tmpMax.set(x1, y1, z1);
    const world = mesh.computeWorldMatrix(true);
    if (mesh.hasBoundingInfo) mesh.getBoundingInfo().reConstruct(mn, mx, world);
    else mesh.setBoundingInfo(new BoundingInfo(mn, mx, world));
    const sbi = r.sub.getBoundingInfo();
    if (sbi && sbi !== mesh.getBoundingInfo()) sbi.reConstruct(mn, mx, world);
    else if (!sbi) r.sub.setBoundingInfo(new BoundingInfo(mn, mx, world));
    // shadow casting: opaque always (glass optional); large meshes also into far cascades
    const dx = x1 - x0,
      dy = y1 - y0,
      dz = z1 - z0;
    const large = Math.sqrt(dx * dx + dy * dy + dz * dz) > LARGE_DIAGONAL;
    const cast = !r.glass || this.glassCastsShadows;
    if (cast && (!r.castsShadow || r.large !== large)) {
      this.hooks.setShadowCaster?.(mesh, true, large);
      r.castsShadow = true;
      r.large = large;
    }
  }

  private disposeMesh(mesh: Mesh): void {
    const r = this.records.get(mesh);
    if (r?.castsShadow) this.hooks.setShadowCaster?.(mesh, false);
    this.hooks.unregisterReceiver?.(mesh);
    if (!mesh.isDisposed()) mesh.dispose(false, false);
    if (r) {
      r.buffer.dispose();
      this.records.delete(mesh);
    }
  }
}
