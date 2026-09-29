import * as THREE from 'three';
import { G } from '../core/G';
import { clamp } from '../core/math';
import { ARENA } from '../world/config';
import { DEFENSE_MAP } from './defs';
import type { Structure } from './Structures';

export interface InvItem {
  key: string;
  defId: string;
  weaponId?: string;
  count: number;
  hp: number[];
}

/** Parses inventory keys: 'woodBarrier' or 'turret:glock17'. */
export function parseKey(key: string) {
  const [defId, weaponId] = key.split(':');
  return { defId, weaponId };
}

/**
 * Build mode: select an owned defense, preview it as a hologram at the aim
 * point, rotate and place. Structures can be picked back up during prep
 * (keeping their current damage — there is no repair).
 */
export class Placement {
  active = false;
  selected = 0;
  yaw = 0;
  private preview: THREE.Object3D | null = null;
  private previewKey = '';
  valid = false;
  readonly pos = new THREE.Vector3();
  reason = '';
  pickTarget: Structure | null = null;
  pickT = 0;
  onChange: (() => void) | null = null;

  items(): InvItem[] {
    const inv = G.progress.data.inventory as Record<string, number[]>;
    return Object.keys(inv)
      .filter((k) => inv[k].length > 0 && DEFENSE_MAP[parseKey(k).defId])
      .sort((a, b) => DEFENSE_MAP[parseKey(a).defId].cost - DEFENSE_MAP[parseKey(b).defId].cost)
      .map((k) => ({ key: k, ...parseKey(k), count: inv[k].length, hp: inv[k] }));
  }

  canBuild() {
    const ph = G.waves.phase;
    return ph === 'prep' || ph === 'wave';
  }

  toggle() {
    if (this.active) this.exit();
    else this.enter();
  }

  enter(index?: number) {
    if (!this.canBuild()) return;
    const items = this.items();
    if (items.length === 0) {
      G.hud?.toast('No defenses in inventory — buy some in the shop (B)');
      return;
    }
    this.active = true;
    if (index !== undefined) this.selected = index;
    this.selected = clamp(this.selected, 0, items.length - 1);
    this.onChange?.();
  }

  exit() {
    this.active = false;
    this.clearPreview();
    this.onChange?.();
  }

  private clearPreview() {
    if (this.preview) G.scene.remove(this.preview);
    this.preview = null;
    this.previewKey = '';
  }

  select(i: number) {
    const items = this.items();
    if (i < 0 || i >= items.length) return;
    this.selected = i;
    this.onChange?.();
  }

  update(dt: number) {
    const input = G.input;
    this.updatePickup(dt);
    if (!this.active) {
      if (input.pressed('KeyF') && G.player.alive) this.enter();
      return;
    }
    const items = this.items();
    if (items.length === 0 || !this.canBuild() || !G.player.alive) {
      this.exit();
      return;
    }
    if (this.selected >= items.length) this.selected = items.length - 1;
    for (let i = 0; i < 9; i++) if (input.pressed('Digit' + (i + 1)) && i < items.length) this.select(i);
    if (input.pressed('KeyF') || input.mousePress(2) || input.pressed('Escape')) {
      if (input.mousePress(2)) input.swallowMouse(2);
      this.exit();
      return;
    }
    const wheel = input.consumeWheel();
    if (wheel) this.yaw += wheel * (Math.PI / 12);
    if (input.pressed('KeyQ')) this.yaw -= Math.PI / 12;
    if (input.pressed('KeyE')) this.yaw += Math.PI / 12;
    if (input.pressed('KeyR')) this.yaw += Math.PI / 2;
    const item = items[this.selected];
    const def = DEFENSE_MAP[item.defId];
    if (this.previewKey !== item.key) {
      this.clearPreview();
      const pv: THREE.Object3D = G.structures.buildPreview(item.defId, item.weaponId);
      this.preview = pv;
      this.previewKey = item.key;
      G.scene.add(pv);
    }
    // aim point on the ground
    const cam = G.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    let t = dir.y < -0.03 ? -cam.position.y / dir.y : 8;
    t = clamp(t, 1.8, 13);
    const fx = cam.position.x + dir.x * t;
    const fz = cam.position.z + dir.z * t;
    const snap = 0.25;
    this.pos.set(Math.round(fx / snap) * snap, 0, Math.round(fz / snap) * snap);
    // validity
    this.valid = true;
    this.reason = '';
    const hw = def.hw;
    const hd = def.hd;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const ex = Math.abs(c) * hw + Math.abs(s) * hd;
    const ez = Math.abs(s) * hw + Math.abs(c) * hd;
    if (Math.abs(this.pos.x) + ex > ARENA.halfWidth - 0.1 || this.pos.z - ez < ARENA.zMin + 1.5 || this.pos.z + ez > ARENA.buildZMax) {
      this.valid = false;
      this.reason = 'Out of bounds';
    }
    if (this.valid) {
      for (const st of G.structures.list) {
        if (!st.alive) continue;
        // sample footprint corners of the new structure against existing footprints
        const blocking = def.kind !== 'trap' || st.def.kind !== 'trap';
        if (!blocking && st.def.id !== def.id) continue;
        for (let ix = -1; ix <= 1; ix++)
          for (let iz = -1; iz <= 1; iz++) {
            const lx = ix * hw * 0.95;
            const lz = iz * hd * 0.95;
            const wx = this.pos.x + lx * c + lz * s;
            const wz = this.pos.z - lx * s + lz * c;
            if (st.dist(wx, wz) < 0.05) {
              this.valid = false;
              this.reason = 'Overlaps ' + st.def.name;
            }
          }
      }
    }
    if (this.valid && def.kind !== 'trap') {
      const pl = G.player.pos;
      const lx = (pl.x - this.pos.x) * c - (pl.z - this.pos.z) * s;
      const lz = (pl.x - this.pos.x) * s + (pl.z - this.pos.z) * c;
      if (Math.abs(lx) < hw + 0.4 && Math.abs(lz) < hd + 0.4) {
        this.valid = false;
        this.reason = 'You are in the way';
      }
    }
    if (this.valid && G.waves.phase === 'wave') {
      const near: any[] = [];
      G.zombies.queryRadius(this.pos.x, this.pos.z, Math.max(hw, hd) + 0.8, near);
      for (const z of near) {
        const lx = (z.x - this.pos.x) * c - (z.z - this.pos.z) * s;
        const lz = (z.x - this.pos.x) * s + (z.z - this.pos.z) * c;
        if (Math.abs(lx) < hw + 0.4 && Math.abs(lz) < hd + 0.4) {
          this.valid = false;
          this.reason = 'Zombies in the way';
        }
      }
    }
    if (this.preview) {
      this.preview.position.copy(this.pos);
      this.preview.rotation.y = this.yaw;
      G.structures.holoMaterial(this.valid);
    }
    if (input.mousePress(0)) {
      // the click belongs to build mode, never to the weapon
      input.swallowMouse(0);
      if (!this.valid) {
        G.audio?.play('uiError', {});
        G.hud?.toast(this.reason || 'Cannot place here');
        return;
      }
      const hp = G.progress.takeItem(item.key);
      if (hp === null) return;
      const lvl = item.weaponId ? Math.max(0, G.progress.level(item.weaponId)) : 0;
      G.structures.place(item.defId, this.pos.x, this.pos.z, this.yaw, hp, item.weaponId, lvl);
      this.onChange?.();
      if (G.progress.itemCount(item.key) === 0) {
        const left = this.items();
        if (left.length === 0) this.exit();
        else this.selected = Math.min(this.selected, left.length - 1);
      }
    }
  }

  /** Hold E during prep to pack a structure back into the inventory. */
  private updatePickup(dt: number) {
    this.pickTarget = null;
    if (G.waves.phase !== 'prep' || this.active || !G.player.alive) {
      this.pickT = 0;
      return;
    }
    const cam = G.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const s = G.structures.lookedAt(cam.position.x, cam.position.y, cam.position.z, dir.x, dir.z, 4);
    this.pickTarget = s;
    if (s && G.input.down('KeyE')) {
      this.pickT += dt;
      if (this.pickT >= 0.6) {
        this.pickT = 0;
        const key = s.turret ? `${s.def.id}:${s.turret.weaponId}` : s.def.id;
        const hp = G.structures.remove(s);
        G.progress.addItem(key, hp);
        G.audio?.play('pickup', {});
        G.hud?.toast(`Packed up ${s.def.name}`);
        this.onChange?.();
      }
    } else this.pickT = 0;
  }
}
