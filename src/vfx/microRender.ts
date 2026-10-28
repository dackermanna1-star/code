// Micro-debris renderer: one thin-instanced mesh per MicroSim bin (zone × chunk shape), drawn
// with the shared world material using per-instance `surf` + `color` (instanceColor) buffers —
// the same attribute names as the world vertex layout (src/render/batch.ts) — so each chip looks
// like the material it broke off (texture-array layer, tint, roughness/metallic).
//
// The simulation owns the instance arrays; this class binds them as thin-instance buffers and
// uploads only the dirty ranges each frame (moving pieces + scattered swaps). Settled debris
// costs nothing on the CPU. Each bin mesh gets its zone's bounding box so the Lighting system's
// room-based light assignment (registerMesh hook) gives it the right interior lights.

import { BoundingInfo, Color3, Mesh, PBRMaterial, Vector3, VertexData, type AbstractMesh, type Material, type Scene } from "@babylonjs/core";
import { buildChunk, SHAPE_COUNT, SHAPE_NAMES, type ChunkGeom } from "./chunks.ts";
import { zoneBounds, type MicroSim, type ShapeBuffers } from "./microSim.ts";

interface BinMesh {
  mesh: Mesh;
  version: number;
  count: number;
}

export interface MicroRenderOptions {
  /** Shared world material (render-core). A plain PBR fallback is used when absent. */
  material?: Material | null;
  /** Called once per created mesh (e.g. Lighting.registerReceiver). */
  registerMesh?: (mesh: AbstractMesh) => void;
  unregisterMesh?: (mesh: AbstractMesh) => void;
  /** Horizontal bounds of a zone (defaults to the sim's default grid). */
  zoneBounds?: (zone: number) => { x0: number; x1: number; z0: number; z1: number };
}

export class MicroRenderer {
  readonly material: Material;
  private readonly scene: Scene;
  private readonly sim: MicroSim;
  private readonly geoms: ChunkGeom[] = [];
  private readonly meshes = new Map<ShapeBuffers, BinMesh>();
  private readonly ownMaterial: boolean;
  private readonly opts: MicroRenderOptions;
  /** Floats uploaded last sync (stats). */
  uploadedFloats = 0;
  uploads = 0;

  constructor(scene: Scene, sim: MicroSim, opts: MicroRenderOptions = {}) {
    this.scene = scene;
    this.sim = sim;
    this.opts = opts;
    for (let s = 0; s < SHAPE_COUNT; s++) this.geoms.push(buildChunk(s));
    if (opts.material) {
      this.material = opts.material;
      this.ownMaterial = false;
    } else {
      // Fallback (no render-core): untextured PBR tinted by the linear instance colour.
      const m = new PBRMaterial("vfxMicroFallback", scene);
      m.metallic = 0;
      m.roughness = 0.75;
      m.albedoColor = Color3.White();
      this.material = m;
      this.ownMaterial = true;
    }
  }

  /** Number of instanced meshes (draw calls). */
  get meshCount(): number {
    let n = 0;
    for (const b of this.meshes.values()) if (b.mesh.isVisible) n++;
    return n;
  }

  private createMesh(sb: ShapeBuffers): BinMesh {
    const g = this.geoms[sb.shape];
    const mesh = new Mesh(`vfxMicro_${SHAPE_NAMES[sb.shape]}_z${sb.zone}`, this.scene);
    const vd = new VertexData();
    vd.positions = g.positions;
    vd.normals = g.normals;
    vd.uvs = g.uvs;
    vd.indices = g.indices;
    vd.applyToMesh(mesh, false); // own geometry: thin-instance buffers live on the geometry
    mesh.material = this.material;
    mesh.isPickable = false;
    mesh.doNotSyncBoundingInfo = true;
    mesh.alwaysSelectAsActiveMesh = true; // pieces can leave their zone (kicked, falling)
    mesh.receiveShadows = true;
    const zb = (this.opts.zoneBounds ?? zoneBounds)(sb.zone);
    mesh.setBoundingInfo(new BoundingInfo(new Vector3(zb.x0, -1, zb.z0), new Vector3(zb.x1, 3, zb.z1)));
    const rec: BinMesh = { mesh, version: -1, count: -1 };
    this.bind(rec, sb);
    try {
      this.opts.registerMesh?.(mesh);
    } catch (e) {
      console.warn("vfx: registerMesh failed", e);
    }
    return rec;
  }

  private bind(rec: BinMesh, sb: ShapeBuffers): void {
    const mesh = rec.mesh;
    mesh.thinInstanceSetBuffer("matrix", sb.mat, 16, false);
    mesh.thinInstanceSetBuffer("color", sb.color, 4, false);
    mesh.thinInstanceSetBuffer("surf", sb.surf, 4, false);
    rec.version = sb.version;
    rec.count = -1;
    // freshly created GPU buffers already hold the whole arrays
    sb.matDirty.clear();
    sb.attrDirty.clear();
    this.uploadedFloats += sb.cap * 24;
  }

  /** Upload this frame's changes (call once per frame, after the simulation steps). */
  sync(): void {
    this.uploadedFloats = 0;
    this.uploads = 0;
    for (const sb of this.sim.activeBins) {
      let rec = this.meshes.get(sb);
      if (!rec) {
        if (sb.count === 0) continue;
        rec = this.createMesh(sb);
        this.meshes.set(sb, rec);
      } else if (rec.version !== sb.version) this.bind(rec, sb);
      const mesh = rec.mesh;
      if (rec.count !== sb.count) {
        rec.count = sb.count;
        if (sb.count > 0) mesh.thinInstanceCount = sb.count;
        // a mesh with zero thin instances would render its base geometry at the origin
        mesh.isVisible = sb.count > 0;
      }
      if (sb.count === 0) {
        sb.matDirty.clear();
        sb.attrDirty.clear();
        continue;
      }
      const md = sb.matDirty;
      if (md.n) {
        md.normalize(sb.count);
        for (let r = 0; r < md.n; r++) {
          mesh.thinInstancePartialBufferUpdate("matrix", md.hi[r] - md.lo[r], md.lo[r]);
          this.uploadedFloats += (md.hi[r] - md.lo[r]) * 16;
          this.uploads++;
        }
        md.clear();
      }
      const ad = sb.attrDirty;
      if (ad.n) {
        ad.normalize(sb.count);
        for (let r = 0; r < ad.n; r++) {
          const n = ad.hi[r] - ad.lo[r];
          mesh.thinInstancePartialBufferUpdate("color", n, ad.lo[r]);
          mesh.thinInstancePartialBufferUpdate("surf", n, ad.lo[r]);
          this.uploadedFloats += n * 8;
          this.uploads += 2;
        }
        ad.clear();
      }
    }
  }

  dispose(): void {
    for (const rec of this.meshes.values()) {
      try {
        this.opts.unregisterMesh?.(rec.mesh);
      } catch {
        /* ignore */
      }
      rec.mesh.dispose();
    }
    this.meshes.clear();
    if (this.ownMaterial) this.material.dispose();
  }
}
