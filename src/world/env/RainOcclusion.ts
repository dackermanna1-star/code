// Rain occlusion ("no rain indoors"): a small top-down roof-height map around the camera, rasterised on the CPU
// from the buildings' lot footprints and their roof heights (IBuildings.buildings: lot + bounds). The rain vertex
// shader hides drops that are below a roof inside a footprint, so it never rains inside houses while rain stays
// visible through windows and doorways. Rebuilt only when the camera moved a few meters or buildings changed.
import * as THREE from 'three';
import { BUILDING_FOOTPRINTS, type BuildingInfo } from '../../core/contracts';

const RES = 64;
/** Side of the covered square (m): larger than the rain box (46 m) so drops at its edge are covered. */
const SIZE = 64;
const SNAP = 4;
const OPEN = -1e4;

export class RainOcclusion {
  readonly texture: THREE.DataTexture;
  /** (x0, z0, size) of the covered square, for the shader. */
  readonly origin = new THREE.Vector3(0, 0, SIZE);
  private data = new Float32Array(RES * RES).fill(OPEN);
  private cx = NaN;
  private cz = NaN;
  private lastCount = -1;

  constructor() {
    this.texture = new THREE.DataTexture(this.data, RES, RES, THREE.RedFormat, THREE.FloatType);
    this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }

  /** Re-rasterise when the camera left the snapped cell or the building list changed. Returns true if rebuilt. */
  update(camX: number, camZ: number, buildings: readonly BuildingInfo[] | undefined): boolean {
    const list = buildings ?? [];
    const sx = Math.round(camX / SNAP) * SNAP, sz = Math.round(camZ / SNAP) * SNAP;
    if (sx === this.cx && sz === this.cz && list.length === this.lastCount) return false;
    this.cx = sx;
    this.cz = sz;
    this.lastCount = list.length;
    const x0 = sx - SIZE / 2, z0 = sz - SIZE / 2, texel = SIZE / RES;
    this.origin.set(x0, z0, SIZE);
    const d = this.data;
    d.fill(OPEN);
    for (const b of list) {
      const lot = b.lot;
      const f = BUILDING_FOOTPRINTS[lot.type];
      if (!f) continue;
      const hw = f.w / 2 + 0.35, hd = f.d / 2 + 0.35; // walls + eaves
      const r = Math.hypot(hw, hd);
      if (lot.x + r < x0 || lot.x - r > x0 + SIZE || lot.z + r < z0 || lot.z - r > z0 + SIZE) continue;
      const roof = b.bounds.max.y;
      const c = Math.cos(lot.rotationY), s = Math.sin(lot.rotationY);
      const i0 = Math.max(0, Math.floor((lot.x - r - x0) / texel)), i1 = Math.min(RES - 1, Math.ceil((lot.x + r - x0) / texel));
      const j0 = Math.max(0, Math.floor((lot.z - r - z0) / texel)), j1 = Math.min(RES - 1, Math.ceil((lot.z + r - z0) / texel));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const dx = x0 + (i + 0.5) * texel - lot.x, dz = z0 + (j + 0.5) * texel - lot.z;
          // world → lot local (inverse rotation about +Y)
          const lx = dx * c - dz * s, lz = dx * s + dz * c;
          if (Math.abs(lx) > hw || Math.abs(lz) > hd) continue;
          const k = j * RES + i;
          if (roof > d[k]) d[k] = roof;
        }
    }
    this.texture.needsUpdate = true;
    return true;
  }
}
