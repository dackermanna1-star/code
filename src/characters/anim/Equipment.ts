// Equipment visuals: helmet / vest / backpack by level (GLB from public/assets/gear when present, fitted
// to procedural proxies otherwise), slung primaries on the back, pistol in a thigh holster, melee at the
// hip. Attachments are parented to bones with transforms defined in the rig's rest pose (root space).
import * as THREE from 'three';
import { ctx } from '../../core/GameContext';
import { Assets } from '../../core/Assets';
import type { EquipmentSlot, WeaponSlot } from '../../core/types';
import type { Character } from '../Character';
import type { Rig, BoneKey } from './Rig';
import { createWeaponVisual, mergeStatic, type WeaponVisual } from './WeaponModels';
import { quatFromBasis } from './IK';

const _m = new THREE.Matrix4();
const _ma = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _s = new THREE.Vector3();

/** Shadow casting on for every mesh of a loaded gear model. */
function prepGear(o: THREE.Object3D): THREE.Object3D {
  o.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = true;
  });
  return o;
}

const HELMET_COLORS = [0x6b6a4a, 0x4a5233, 0x2c2e2b];
const VEST_COLORS = [0x6e6650, 0x4b5435, 0x262826];
const PACK_COLORS = [0x5a5440, 0x4e5838, 0x34362f];

function levelOf(itemId: string): number {
  try {
    const l = ctx.items?.get(itemId)?.level;
    if (l) return Math.max(1, Math.min(3, l));
  } catch {
    /* unknown item */
  }
  const m = /(\d)\s*$/.exec(itemId);
  return m ? Math.max(1, Math.min(3, +m[1])) : 1;
}

function mat(color: number, rough = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
}

/** Procedural gear proxies (root-space sized, centered at origin). */
function proceduralGear(slot: EquipmentSlot, level: number, s: number): THREE.Object3D {
  const g = new THREE.Group();
  if (slot === 'helmet') {
    const r = (0.128 + level * 0.004) * s;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), mat(HELMET_COLORS[level - 1], level === 3 ? 0.5 : 0.8));
    shell.scale.set(1, 0.92, 1.08);
    g.add(shell);
    if (level >= 2) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, 0.012 * s, 6, 24), mat(HELMET_COLORS[level - 1]));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = r * 0.12;
      rim.scale.set(1, 1.1, 1);
      g.add(rim);
    }
    if (level === 3) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.025 * s, 0.03 * s), mat(0x1c1d1c, 0.4));
      bar.position.set(0, r * 0.05, r * 1.02);
      g.add(bar);
    }
  } else if (slot === 'vest') {
    const w = 0.37 * s, h = (0.36 + level * 0.03) * s, d = (0.27 + level * 0.015) * s;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 2, 2, 2), mat(VEST_COLORS[level - 1]));
    g.add(body);
    if (level >= 2) {
      for (let i = -1; i <= 1; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.075 * s, 0.1 * s, 0.045 * s), mat(VEST_COLORS[level - 1] - 0x050505));
        p.position.set(i * 0.1 * s, -h * 0.22, d / 2 + 0.02 * s);
        g.add(p);
      }
    }
  } else {
    const w = (0.28 + level * 0.03) * s, h = (0.34 + level * 0.07) * s, d = (0.14 + level * 0.035) * s;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 2, 2, 2), mat(PACK_COLORS[level - 1]));
    g.add(body);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.5, d * 0.5, w, 10).rotateZ(Math.PI / 2), mat(PACK_COLORS[level - 1]));
    top.position.y = h / 2;
    g.add(top);
  }
  const merged = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: slot === 'helmet' && level === 3 ? 0.5 : 0.85, metalness: 0.05 });
  return mergeStatic(g, merged);
}

/**
 * Authored gear attachment (public/assets/gear/README.md): each GLB is attached rigidly to a bone with a bone-local
 * offset and identity rotation, fitted to the male survivor rig (rest height GEAR_REF_RIG_HEIGHT). Other rigs (the
 * shorter female variants) scale offset + model by their rest height ratio (≈0.94, as the README recommends).
 */
const GEAR_ATTACH: Record<EquipmentSlot, { bone: BoneKey; fallback: BoneKey; offset: [number, number, number] }> = {
  helmet: { bone: 'head', fallback: 'head', offset: [0, 0.1, 0.008] },
  vest: { bone: 'upperChest', fallback: 'spine', offset: [0, -0.021, 0.02] },
  backpack: { bone: 'upperChest', fallback: 'spine', offset: [0, 0.079, -0.165] },
};
const GEAR_REF_RIG_HEIGHT = 1.765;
/** Gear switches to its `_lod1` GLB beyond this camera distance (README: ~25 m). */
export const GEAR_LOD_DISTANCE = 25;

interface GearEntry {
  id: string;
  /** Holder parented to the bone (proxy placement first, authored placement once the GLB loads). */
  obj: THREE.Group;
  lod0: THREE.Object3D | null;
  lod1: THREE.Object3D | null;
  lod1Requested: boolean;
}

export class Equipment {
  private readonly gear: Partial<Record<EquipmentSlot, GearEntry>> = {};
  private gearLod = 0;
  /** Called after gear changed (the visual hides hair / built-in helmets under a worn helmet). */
  onGearChanged: (() => void) | null = null;
  private readonly slung: Partial<Record<WeaponSlot, { uid: number; v: WeaponVisual }>> = {};

  constructor(
    private readonly c: Character,
    private readonly rig: Rig,
    private readonly root: THREE.Object3D,
  ) {}

  /** Attach `obj` to a bone so that it sits at `restRootMatrix` (root space) in the rest pose. */
  private attach(bone: BoneKey, obj: THREE.Object3D, restRootMatrix: THREE.Matrix4): boolean {
    const b = this.rig.bones[bone];
    const rest = this.rig.restMatrix[bone];
    if (!b || !rest) return false;
    _ma.copy(rest).invert().multiply(restRootMatrix);
    _ma.decompose(obj.position, obj.quaternion, obj.scale);
    b.add(obj);
    return true;
  }

  private restCenter(a: BoneKey, b: BoneKey, t: number, out: THREE.Vector3): THREE.Vector3 {
    const pa = this.rig.restPos[a], pb = this.rig.restPos[b];
    if (!pa) return out.set(0, 1.4, 0);
    if (!pb) return out.copy(pa);
    return out.copy(pa).lerp(pb, t);
  }

  refresh(): void {
    const eq = this.c.inventory.equipment;
    const s = this.rig.height / 1.8;
    for (const slot of ['helmet', 'vest', 'backpack'] as const) {
      const e = eq[slot];
      const id = e?.itemId ?? '';
      const cur = this.gear[slot];
      if (cur && cur.id === id) continue;
      if (cur) {
        cur.obj.removeFromParent();
        delete this.gear[slot];
      }
      if (!e) continue;
      const level = levelOf(id);
      const proxy = proceduralGear(slot, level, s);
      const holder = new THREE.Group();
      holder.name = `gear_${slot}`;
      holder.add(proxy);
      // Root-space rest placement.
      const p = _v;
      let bone: BoneKey;
      if (slot === 'helmet') {
        bone = 'head';
        this.restCenter('head', 'headTop', 0.5, p);
        p.z += 0.005 * s;
      } else if (slot === 'vest') {
        bone = this.rig.bones.upperChest ? 'upperChest' : 'spine';
        this.restCenter('chest', 'upperChest', 0.6, p);
        p.z += 0.015 * s;
      } else {
        bone = this.rig.bones.upperChest ? 'upperChest' : 'spine';
        this.restCenter('chest', 'upperChest', 0.7, p);
        p.z -= (0.2 + level * 0.02) * s;
        p.y -= 0.03 * s;
      }
      _m.compose(p, _q.identity(), _one);
      if (!this.attach(bone, holder, _m)) continue;
      const entry: GearEntry = { id, obj: holder, lod0: null, lod1: null, lod1Requested: false };
      this.gear[slot] = entry;
      // Upgrade to the authored model when available (stays on the proxy if the asset is missing).
      void ctx.assets.tryGltf(`assets/gear/${id}.glb`).then((g) => {
        if (!g || this.gear[slot] !== entry) return;
        if (!this.placeAuthored(slot, holder)) return;
        holder.remove(proxy);
        entry.lod0 = prepGear(Assets.cloneScene(g.scene));
        holder.add(entry.lod0);
        this.applyGearLod(entry);
        this.onGearChanged?.();
      });
    }
    this.onGearChanged?.();
  }

  /** Re-parent a gear holder at the README attachment (bone + offset, identity rotation, rig-height scale). */
  private placeAuthored(slot: EquipmentSlot, holder: THREE.Object3D): boolean {
    const a = GEAR_ATTACH[slot];
    const bone: BoneKey = this.rig.bones[a.bone] ? a.bone : a.fallback;
    const base = this.rig.restPos[bone];
    if (!base || !this.rig.bones[bone] || !this.rig.restMatrix[bone]) return false;
    const k = THREE.MathUtils.clamp(this.rig.height / GEAR_REF_RIG_HEIGHT, 0.85, 1.15);
    _v.set(a.offset[0], a.offset[1], a.offset[2]).multiplyScalar(k).add(base);
    _m.compose(_v, _q.identity(), _s.setScalar(k));
    holder.removeFromParent();
    return this.attach(bone, holder, _m);
  }

  /** Gear LOD (0 near, 1 far): swaps to `<id>_lod1.glb` (loaded on first use) when it exists. */
  setGearLod(level: number): void {
    if (level === this.gearLod) return;
    this.gearLod = level;
    for (const e of Object.values(this.gear)) if (e) this.applyGearLod(e);
  }

  private applyGearLod(e: GearEntry): void {
    if (!e.lod0) return;
    const far = this.gearLod === 1;
    if (far && !e.lod1 && !e.lod1Requested) {
      e.lod1Requested = true;
      void ctx.assets.tryGltf(`assets/gear/${e.id}_lod1.glb`).then((g) => {
        if (!g || !e.obj.parent) return;
        e.lod1 = prepGear(Assets.cloneScene(g.scene));
        e.obj.add(e.lod1);
        this.applyGearLod(e);
        this.onGearChanged?.();
      });
    }
    const useLod1 = far && !!e.lod1;
    e.lod0.visible = !useLod1;
    if (e.lod1) e.lod1.visible = useLod1;
  }

  /** True when a helmet is worn (hair and built-in headgear of the character model get hidden). */
  get wearsHelmet(): boolean {
    return !!this.gear.helmet;
  }

  refreshWeapons(): void {
    const inv = this.c.inventory;
    const s = this.rig.height / 1.8;
    for (const slot of ['primary1', 'primary2', 'pistol', 'melee'] as const) {
      const w = inv.weapons[slot];
      const show = w && this.c.activeSlot !== slot && this.c.lifeState !== 'dead';
      const cur = this.slung[slot];
      if (cur && (!show || cur.uid !== w!.uid)) {
        cur.v.object.removeFromParent();
        delete this.slung[slot];
      }
      if (!show || this.slung[slot]) continue;
      const v = createWeaponVisual(w!);
      if (!v) continue;
      const p = new THREE.Vector3();
      const fwd = new THREE.Vector3();
      const up = new THREE.Vector3();
      let bone: BoneKey;
      if (slot === 'primary1' || slot === 'primary2') {
        bone = this.rig.bones.upperChest ? 'upperChest' : 'spine';
        this.restCenter('chest', 'upperChest', 0.5, p);
        p.z -= 0.19 * s;
        const side = slot === 'primary1' ? -1 : 1; // root +X = left
        p.x += side * 0.03 * s;
        // Diagonal across the back, muzzle up over the shoulder.
        fwd.set(side * 0.45, 0.89, 0).normalize();
        up.set(0, 0, slot === 'primary1' ? -1 : -1);
        p.addScaledVector(fwd, -0.12 * s);
        if (slot === 'primary2') p.z -= 0.05 * s;
      } else if (slot === 'pistol') {
        bone = 'upperLegR';
        this.restCenter('upperLegR', 'lowerLegR', 0.3, p);
        p.x -= 0.12 * s;
        fwd.set(0, -1, 0.1).normalize();
        up.set(0, 0, -1);
      } else {
        bone = 'hips';
        this.restCenter('hips', 'upperLegL', 0.6, p);
        p.x += 0.17 * s;
        p.z -= 0.05 * s;
        fwd.set(0, -1, 0.15).normalize();
        up.set(1, 0, 0);
      }
      quatFromBasis(fwd, up, _q);
      _m.compose(p, _q, _one);
      if (!this.attach(bone, v.object, _m)) continue;
      this.slung[slot] = { uid: w!.uid, v };
    }
  }

  clearWeapons(): void {
    for (const k of Object.keys(this.slung) as WeaponSlot[]) {
      this.slung[k]!.v.object.removeFromParent();
      delete this.slung[k];
    }
  }

  update(): void {
    /* attachments follow their bones */
  }

  dispose(): void {
    this.clearWeapons();
    for (const k of Object.keys(this.gear) as EquipmentSlot[]) this.gear[k]!.obj.removeFromParent();
    this.onGearChanged = null;
    void this.root;
  }
}
