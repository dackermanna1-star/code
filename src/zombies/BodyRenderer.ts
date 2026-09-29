import * as THREE from 'three';
import { BODY_LIST, BodyDef, PART_TYPE_COUNT, PartDef, SKIN_H, SKIN_W } from './skeleton';
import { ATLAS_COLS, ATLAS_ROWS, SkinAtlas, faceRect, makeBloodMask } from './Skins';

/** Box geometry with Minecraft-style skin unwrap (UVs local to one skin cell). */
function skinBox(size: [number, number, number], center: [number, number, number], px: [number, number, number], origin: [number, number]) {
  const [w, h, d] = size;
  const [cx, cy, cz] = center;
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const U = (x: number) => x / SKIN_W;
  const V = (y: number) => 1 - y / SKIN_H;
  // face helper: 4 corners (bl, br, tr, tl) in world, rect in px (uv of bl..tl)
  const face = (
    corners: [number, number, number][],
    n: [number, number, number],
    rect: { x: number; y: number; w: number; h: number },
    flipX = false,
    flipY = false,
  ) => {
    const base = pos.length / 3;
    for (const c of corners) pos.push(c[0] + cx, c[1] + cy, c[2] + cz);
    for (let i = 0; i < 4; i++) nrm.push(n[0], n[1], n[2]);
    let x0 = rect.x, x1 = rect.x + rect.w;
    let yTop = rect.y, yBot = rect.y + rect.h;
    if (flipX) [x0, x1] = [x1, x0];
    if (flipY) [yTop, yBot] = [yBot, yTop];
    // bl, br, tr, tl
    uv.push(U(x0), V(yBot), U(x1), V(yBot), U(x1), V(yTop), U(x0), V(yTop));
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // front (+Z): viewer's left = -X
  face([[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], [0, 0, 1], faceRect(px, origin, 'front'));
  // back (-Z): viewer's left = +X
  face([[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], [0, 0, -1], faceRect(px, origin, 'back'));
  // right (-X): viewer's left = -Z
  face([[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], [-1, 0, 0], faceRect(px, origin, 'right'));
  // left (+X): viewer's left = +Z
  face([[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], [1, 0, 0], faceRect(px, origin, 'left'));
  // top (+Y): front edge (+Z) at the bottom of the rect
  face([[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], [0, 1, 0], faceRect(px, origin, 'top'));
  // bottom (-Y)
  face([[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], [0, -1, 0], faceRect(px, origin, 'bottom'));
  return { pos, nrm, uv, idx };
}

function partGeometry(def: PartDef, side: number) {
  const origin = def.uv[Math.min(side, def.uv.length - 1)];
  const main = skinBox(def.size, def.center, def.px, origin);
  const parts = [main];
  if (def.extra) parts.push(skinBox(def.extra.size, def.extra.center, def.extra.px, def.extra.uv));
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const p of parts) {
    const base = pos.length / 3;
    pos.push(...p.pos);
    nrm.push(...p.nrm);
    uv.push(...p.uv);
    idx.push(...p.idx.map((i) => i + base));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Accessory meshes (armor etc.) attached to a part. */
export const ACCESSORIES = ['helmet', 'vest', 'plate'] as const;
export type AccessoryId = (typeof ACCESSORIES)[number];

function accessoryGeometry(id: AccessoryId) {
  const parts: { size: [number, number, number]; pos: [number, number, number]; color: number }[] = [];
  if (id === 'helmet') {
    parts.push({ size: [0.35, 0.19, 0.35], pos: [0, 0.235, -0.005], color: 0x1c2233 });
    parts.push({ size: [0.33, 0.1, 0.03], pos: [0, 0.16, 0.165], color: 0x7fa8c8 });
    parts.push({ size: [0.36, 0.04, 0.37], pos: [0, 0.14, 0], color: 0x151a26 });
  } else if (id === 'vest') {
    parts.push({ size: [0.45, 0.38, 0.27], pos: [0, 0.29, 0], color: 0x2a2f3a });
    parts.push({ size: [0.16, 0.08, 0.02], pos: [-0.1, 0.36, 0.14], color: 0x3c4352 });
    parts.push({ size: [0.16, 0.08, 0.02], pos: [0.1, 0.36, 0.14], color: 0x3c4352 });
    parts.push({ size: [0.3, 0.06, 0.02], pos: [0, 0.22, 0.14], color: 0xd8d8d8 });
  } else {
    parts.push({ size: [0.2, 0.08, 0.2], pos: [0, 0.02, 0], color: 0x4a4a4e });
    parts.push({ size: [0.04, 0.1, 0.04], pos: [0.03, 0.1, 0.02], color: 0xb0b0b0 });
    parts.push({ size: [0.04, 0.1, 0.04], pos: [-0.05, 0.1, -0.03], color: 0xb0b0b0 });
  }
  const geos: THREE.BufferGeometry[] = [];
  for (const p of parts) {
    const g = new THREE.BoxGeometry(...p.size);
    g.translate(...p.pos);
    const c = new THREE.Color(p.color);
    const cols = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < cols.length; i += 3) {
      cols[i] = c.r;
      cols[i + 1] = c.g;
      cols[i + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.deleteAttribute('uv');
    geos.push(g);
  }
  // merge
  let total = 0;
  for (const g of geos) total += g.getAttribute('position').count;
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const idx: number[] = [];
  let off = 0;
  for (const g of geos) {
    pos.set(g.getAttribute('position').array as Float32Array, off * 3);
    nrm.set(g.getAttribute('normal').array as Float32Array, off * 3);
    col.set(g.getAttribute('color').array as Float32Array, off * 3);
    for (const i of g.getIndex()!.array) idx.push(i + off);
    off += g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}

export interface FxState {
  blood: number;
  flash: number;
  burn: number;
  eyes: number;
  fire: number;
}

/** Writes a TRS matrix (column-major) into arr at offset o. */
export function writeTRS(arr: Float32Array, o: number, px: number, py: number, pz: number, qx: number, qy: number, qz: number, qw: number, sx: number, sy: number, sz: number) {
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  arr[o] = (1 - (yy + zz)) * sx;
  arr[o + 1] = (xy + wz) * sx;
  arr[o + 2] = (xz - wy) * sx;
  arr[o + 3] = 0;
  arr[o + 4] = (xy - wz) * sy;
  arr[o + 5] = (1 - (xx + zz)) * sy;
  arr[o + 6] = (yz + wx) * sy;
  arr[o + 7] = 0;
  arr[o + 8] = (xz + wy) * sz;
  arr[o + 9] = (yz - wx) * sz;
  arr[o + 10] = (1 - (xx + yy)) * sz;
  arr[o + 11] = 0;
  arr[o + 12] = px;
  arr[o + 13] = py;
  arr[o + 14] = pz;
  arr[o + 15] = 1;
}

class InstBatch {
  readonly mesh: THREE.InstancedMesh;
  readonly mat: Float32Array;
  readonly skin: Float32Array;
  readonly fx: Float32Array;
  readonly fire: Float32Array;
  private skinAttr: THREE.InstancedBufferAttribute;
  private fxAttr: THREE.InstancedBufferAttribute;
  private fireAttr: THREE.InstancedBufferAttribute;
  count = 0;
  /** For compact (static) batches: slot -> owner record for swap-remove. */
  owners: ({ slots: number[]; key: number } | null)[] = [];
  dirtyMin = Infinity;
  dirtyMax = -1;

  constructor(geo: THREE.BufferGeometry, material: THREE.Material, readonly capacity: number, dynamic: boolean) {
    const g = geo.clone();
    this.skin = new Float32Array(capacity);
    this.fx = new Float32Array(capacity * 4);
    this.fire = new Float32Array(capacity);
    this.skinAttr = new THREE.InstancedBufferAttribute(this.skin, 1);
    this.fxAttr = new THREE.InstancedBufferAttribute(this.fx, 4);
    this.fireAttr = new THREE.InstancedBufferAttribute(this.fire, 1);
    const usage = dynamic ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage;
    this.skinAttr.setUsage(usage);
    this.fxAttr.setUsage(usage);
    this.fireAttr.setUsage(usage);
    g.setAttribute('aSkin', this.skinAttr);
    g.setAttribute('aFx', this.fxAttr);
    g.setAttribute('aFire', this.fireAttr);
    this.mesh = new THREE.InstancedMesh(g, material, capacity);
    this.mesh.instanceMatrix.setUsage(usage);
    this.mat = this.mesh.instanceMatrix.array as Float32Array;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  write(slot: number, m: Float32Array | null, mo: number, skin: number, fx: FxState) {
    if (m) for (let i = 0; i < 16; i++) this.mat[slot * 16 + i] = m[mo + i];
    this.skin[slot] = skin;
    const f = slot * 4;
    this.fx[f] = fx.blood;
    this.fx[f + 1] = fx.flash;
    this.fx[f + 2] = fx.burn;
    this.fx[f + 3] = fx.eyes;
    this.fire[slot] = fx.fire;
    if (slot < this.dirtyMin) this.dirtyMin = slot;
    if (slot > this.dirtyMax) this.dirtyMax = slot;
  }

  /** Upload changed range. */
  flush() {
    this.mesh.count = this.count;
    if (this.dirtyMax < this.dirtyMin) return;
    const a = this.dirtyMin;
    const n = this.dirtyMax - this.dirtyMin + 1;
    const im = this.mesh.instanceMatrix;
    im.clearUpdateRanges();
    im.addUpdateRange(a * 16, n * 16);
    im.needsUpdate = true;
    this.skinAttr.clearUpdateRanges();
    this.skinAttr.addUpdateRange(a, n);
    this.skinAttr.needsUpdate = true;
    this.fxAttr.clearUpdateRanges();
    this.fxAttr.addUpdateRange(a * 4, n * 4);
    this.fxAttr.needsUpdate = true;
    this.fireAttr.clearUpdateRanges();
    this.fireAttr.addUpdateRange(a, n);
    this.fireAttr.needsUpdate = true;
    this.dirtyMin = Infinity;
    this.dirtyMax = -1;
  }

  // ---- compact allocation (static corpses)
  alloc(owner: { slots: number[] }, key: number) {
    if (this.count >= this.capacity) return -1;
    const s = this.count++;
    this.owners[s] = { slots: owner.slots, key };
    return s;
  }
  free(slot: number) {
    const last = this.count - 1;
    if (slot < 0 || slot > last) return;
    if (slot !== last) {
      this.mat.copyWithin(slot * 16, last * 16, last * 16 + 16);
      this.skin[slot] = this.skin[last];
      this.fx.copyWithin(slot * 4, last * 4, last * 4 + 4);
      this.fire[slot] = this.fire[last];
      const o = this.owners[last];
      this.owners[slot] = o;
      if (o) o.slots[o.key] = slot;
      if (slot < this.dirtyMin) this.dirtyMin = slot;
      if (slot > this.dirtyMax) this.dirtyMax = slot;
    }
    this.owners[last] = null;
    this.count--;
  }
}

/**
 * All zombie/corpse body rendering. Dynamic batches are refilled every frame
 * (living zombies + active ragdolls); static batches hold frozen corpses.
 */
export class BodyRenderer {
  readonly material: THREE.MeshLambertMaterial;
  readonly accMaterial: THREE.MeshLambertMaterial;
  /** [bodyIndex][partType] */
  readonly dyn: InstBatch[][] = [];
  readonly stat: InstBatch[][] = [];
  readonly dynAcc: Record<AccessoryId, InstBatch>;
  readonly statAcc: Record<AccessoryId, InstBatch>;
  readonly group = new THREE.Group();
  readonly uniforms = { bloodMask: { value: null as THREE.Texture | null }, time: { value: 0 } };

  constructor(atlas: SkinAtlas, dynCapacity: number, statCapacity: number) {
    this.uniforms.bloodMask.value = makeBloodMask();
    this.material = new THREE.MeshLambertMaterial({ map: atlas.map, emissiveMap: atlas.emissive, emissive: new THREE.Color(2.2, 2.2, 2.2) });
    this.accMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.patch(this.material, true);
    this.patch(this.accMaterial, false);

    for (let b = 0; b < BODY_LIST.length; b++) {
      const body = BODY_LIST[b];
      const dRow: InstBatch[] = [];
      const sRow: InstBatch[] = [];
      const bodyCapScale = body.id === 'dog' ? 0.25 : 1;
      for (let t = 0; t < PART_TYPE_COUNT; t++) {
        const def = body.parts[t];
        const geo = partGeometry(def, 0);
        const dcap = Math.ceil(dynCapacity * bodyCapScale);
        const scap = Math.ceil(statCapacity * bodyCapScale);
        const d = new InstBatch(geo, this.material, dcap, true);
        const s = new InstBatch(geo, this.material, scap, false);
        dRow.push(d);
        sRow.push(s);
        this.group.add(d.mesh, s.mesh);
      }
      this.dyn.push(dRow);
      this.stat.push(sRow);
    }
    // Right-side variants: separate batches with right-side UVs (so L/R limbs can differ)
    for (let b = 0; b < BODY_LIST.length; b++) {
      const body = BODY_LIST[b];
      for (let t = 0; t < PART_TYPE_COUNT; t++) {
        const def = body.parts[t];
        if (def.uv.length < 2) continue;
        const geo = partGeometry(def, 1);
        const bodyCapScale = body.id === 'dog' ? 0.25 : 1;
        const d = new InstBatch(geo, this.material, Math.ceil(dynCapacity * bodyCapScale), true);
        const s = new InstBatch(geo, this.material, Math.ceil(statCapacity * bodyCapScale), false);
        // right-side limbs get their own batch (own UV unwrap, so L/R can differ)
        this.rightDyn[b * PART_TYPE_COUNT + t] = d;
        this.rightStat[b * PART_TYPE_COUNT + t] = s;
        this.group.add(d.mesh, s.mesh);
      }
    }
    const mk = (dynamic: boolean) => {
      const rec = {} as Record<AccessoryId, InstBatch>;
      for (const a of ACCESSORIES) {
        const b = new InstBatch(accessoryGeometry(a), this.accMaterial, dynamic ? Math.ceil(dynCapacity * 0.3) : Math.ceil(statCapacity * 0.3), dynamic);
        rec[a] = b;
        this.group.add(b.mesh);
      }
      return rec;
    };
    this.dynAcc = mk(true);
    this.statAcc = mk(false);
  }
  readonly rightDyn: InstBatch[] = [];
  readonly rightStat: InstBatch[] = [];

  /** Batch for a given body/part-type/side. */
  batch(dynamic: boolean, bodyIndex: number, pt: number, side: number): InstBatch {
    if (side === 1) {
      const r = (dynamic ? this.rightDyn : this.rightStat)[bodyIndex * PART_TYPE_COUNT + pt];
      if (r) return r;
    }
    return (dynamic ? this.dyn : this.stat)[bodyIndex][pt];
  }

  private patch(mat: THREE.MeshLambertMaterial, skinned: boolean) {
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.bloodMask = u.bloodMask;
      shader.uniforms.uTime = u.time;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float aSkin; attribute vec4 aFx; attribute float aFire;
          varying vec4 vFx; varying float vFire; varying vec2 vLocalUv; varying vec3 vObjPos;`,
        )
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
          vFx = aFx; vFire = aFire; vObjPos = position;
          #ifdef USE_UV
          vLocalUv = uv;
          #else
          vLocalUv = position.xy * 3.0 + position.z * 2.0;
          #endif
          ${
            skinned
              ? `vec2 cell = vec2(mod(aSkin, ${ATLAS_COLS}.0), floor(aSkin / ${ATLAS_COLS}.0 + 0.001));
          vec2 atlasUv = vec2((cell.x + uv.x) / ${ATLAS_COLS}.0, (${ATLAS_ROWS - 1}.0 - cell.y + uv.y) / ${ATLAS_ROWS}.0);
          vMapUv = atlasUv;
          vEmissiveMapUv = atlasUv;`
              : ''
          }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D bloodMask; uniform float uTime;
          varying vec4 vFx; varying float vFire; varying vec2 vLocalUv; varying vec3 vObjPos;`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          {
            float bm = texture2D(bloodMask, vLocalUv * vec2(${skinned ? '5.0, 2.5' : '1.0, 1.0'})).r;
            float th = 1.0 - clamp(vFx.x, 0.0, 1.0) * 0.92;
            if (vFx.x > 0.01 && bm > th) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.012, 0.012), 0.88);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.028, 0.024), clamp(vFx.z, 0.0, 1.0));
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          ${skinned ? 'totalEmissiveRadiance *= vFx.w;' : ''}
          totalEmissiveRadiance += vec3(1.0, 0.22, 0.12) * vFx.y * 1.6;
          if (vFire > 0.01) {
            float fl = 0.6 + 0.4 * sin(uTime * 23.0 + vObjPos.y * 40.0 + vObjPos.x * 17.0);
            totalEmissiveRadiance += vec3(1.6, 0.55, 0.12) * vFire * fl;
          }`,
        );
    };
    mat.customProgramCacheKey = () => (skinned ? 'zbody' : 'zacc');
  }

  beginDynamic() {
    for (const row of this.dyn) for (const b of row) b.count = 0;
    for (const b of this.rightDyn) if (b) b.count = 0;
    for (const a of ACCESSORIES) this.dynAcc[a].count = 0;
  }

  endDynamic() {
    for (const row of this.dyn)
      for (const b of row) {
        if (b.count > 0) {
          b.dirtyMin = 0;
          b.dirtyMax = b.count - 1;
        }
        b.flush();
      }
    for (const b of this.rightDyn) {
      if (!b) continue;
      if (b.count > 0) {
        b.dirtyMin = 0;
        b.dirtyMax = b.count - 1;
      }
      b.flush();
    }
    for (const a of ACCESSORIES) {
      const b = this.dynAcc[a];
      if (b.count > 0) {
        b.dirtyMin = 0;
        b.dirtyMax = b.count - 1;
      }
      b.flush();
    }
  }

  flushStatic() {
    for (const row of this.stat) for (const b of row) b.flush();
    for (const b of this.rightStat) if (b) b.flush();
    for (const a of ACCESSORIES) this.statAcc[a].flush();
  }

  clearStatic() {
    for (const row of this.stat) for (const b of row) (b.count = 0), (b.owners = []), b.flush();
    for (const b of this.rightStat) if (b) (b.count = 0), (b.owners = []), b.flush();
    for (const a of ACCESSORIES) (this.statAcc[a].count = 0), (this.statAcc[a].owners = []), this.statAcc[a].flush();
  }

  staticCount() {
    return this.stat[0][1].count;
  }
}

export type { InstBatch };
export function bodyIndex(b: BodyDef) {
  return BODY_LIST.indexOf(b);
}
