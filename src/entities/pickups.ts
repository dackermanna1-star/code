// Pickups lying in the world: wands, spells, flasks, gold nuggets, hearts, chests, Holy Mountain wares.
import * as THREE from 'three';
import { GRAVITY } from '../config';
import { VoxelWorld } from '../world/world';
import { Body, makeBody, moveBody } from './physics';
import { extrudeGrid, gridFromImage, voxelBox } from '../render/spriteMesh';
import { wandSprite } from '../render/art/wandSprite';
import { spellIcon } from '../render/art/spellIcons';
import { potionIcon, heartIcon, chestIcon, refresherIcon, perkIcon, orbIcon } from '../render/art/itemIcons';
import { Wand } from '../magic/casting';
import { SPELLS } from '../magic/spells';
import { Potion, potionMain, potionTotal } from '../game/inventory';
import { MATERIALS } from '../world/materials';

export type PickupKind = 'wand' | 'spell' | 'potion' | 'gold' | 'heart' | 'heart_full' | 'chest' | 'refresher' | 'perk' | 'sampo' | 'orb' | 'reroll';

export interface Pickup {
  id: number;
  kind: PickupKind;
  body: Body;
  mesh: THREE.Object3D;
  wand?: Wand;
  spell?: { id: string; uses: number };
  potion?: Potion;
  gold?: number;
  /** loot tier (chests) */
  tier?: number;
  perk?: string;
  /** Holy Mountain shop price (0 = free) */
  price: number;
  /** seconds until despawn (gold), -1 = never */
  life: number;
  /** floats in place (no gravity) */
  floating: boolean;
  spin: number;
  baseY: number;
  layer: number; // holy mountain index for shop/perk items, -1 otherwise
  label: string;
  dead: boolean;
  age: number;
}

let nextId = 1;
const GOLD_GEO = voxelBox(2, 2, 2, 0.32, (x, y, z) => ((x + y + z) % 2 ? '#f0c840' : '#c89a20'));

export class PickupSystem {
  readonly list: Pickup[] = [];
  readonly group = new THREE.Group();
  private mat: THREE.Material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private glowMat: THREE.Material = new THREE.MeshBasicMaterial({ vertexColors: true });
  private geoCache = new Map<string, THREE.BufferGeometry>();
  goldIsForever = false;

  constructor(private world: VoxelWorld, mats?: { lit: THREE.Material; glow: THREE.Material }) {
    if (mats) {
      this.mat = mats.lit;
      this.glowMat = mats.glow;
    }
  }

  private geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geoCache.get(key);
    if (!g) {
      g = make();
      this.geoCache.set(key, g);
    }
    return g;
  }

  add(kind: PickupKind, x: number, y: number, z: number, opts: Partial<Pickup> = {}): Pickup {
    let mesh: THREE.Object3D;
    let label = '';
    let floating = opts.floating ?? false;
    switch (kind) {
      case 'wand': {
        const st = opts.wand!.stats;
        mesh = new THREE.Mesh(extrudeGrid(gridFromImage(wandSprite(st.spriteSeed, st)), 0.16, 2), this.mat);
        label = st.name;
        break;
      }
      case 'spell': {
        const def = SPELLS[opts.spell!.id];
        mesh = new THREE.Mesh(this.geo('s' + def.id, () => extrudeGrid(gridFromImage(spellIcon(def.id, def.type)), 0.13, 1)), this.glowMat);
        label = def.name;
        floating = true;
        break;
      }
      case 'potion': {
        const m = potionMain(opts.potion!);
        const hex = m !== null ? MATERIALS[m].colors[0] : null;
        const fill = potionTotal(opts.potion!) / opts.potion!.capacity;
        mesh = new THREE.Mesh(extrudeGrid(gridFromImage(potionIcon(hex, fill)), 0.14, 3), this.mat);
        label = m !== null ? `Flask of ${MATERIALS[m].display}` : 'Empty flask';
        break;
      }
      case 'gold':
        mesh = new THREE.Mesh(GOLD_GEO, this.glowMat);
        label = `${opts.gold ?? 10} gold`;
        break;
      case 'heart':
      case 'heart_full':
        mesh = new THREE.Mesh(this.geo(kind, () => extrudeGrid(gridFromImage(heartIcon(kind === 'heart' ? 'max' : 'full')), 0.16, 2)), this.glowMat);
        label = kind === 'heart' ? 'Extra Max Health' : 'Full Health Regeneration';
        floating = true;
        break;
      case 'chest':
        mesh = new THREE.Mesh(this.geo('chest', () => extrudeGrid(gridFromImage(chestIcon()), 0.2, 6)), this.mat);
        label = 'Treasure chest';
        break;
      case 'refresher':
        mesh = new THREE.Mesh(this.geo('ref', () => extrudeGrid(gridFromImage(refresherIcon()), 0.2, 2)), this.glowMat);
        label = 'Spell Refresher';
        floating = true;
        break;
      case 'reroll':
        mesh = new THREE.Mesh(this.geo('reroll', () => extrudeGrid(gridFromImage(perkIcon('EXTRA_PERK')), 0.2, 3)), this.glowMat);
        label = 'Perk reroll';
        floating = true;
        break;
      case 'perk':
        mesh = new THREE.Mesh(this.geo('perk' + opts.perk, () => extrudeGrid(gridFromImage(perkIcon(opts.perk!)), 0.16, 1)), this.glowMat);
        label = opts.label ?? opts.perk!;
        floating = true;
        break;
      case 'orb':
      case 'sampo':
        mesh = new THREE.Mesh(this.geo('orb', () => extrudeGrid(gridFromImage(orbIcon()), 0.3, 3)), this.glowMat);
        label = kind === 'sampo' ? 'The Sampo' : 'Orb of True Knowledge';
        floating = true;
        break;
    }
    const hw = kind === 'chest' ? 1.4 : 0.6;
    const p: Pickup = {
      id: nextId++, kind, body: makeBody(x, y, z, hw, kind === 'chest' ? 2.4 : 1.0, 0), mesh,
      price: 0, life: kind === 'gold' && !this.goldIsForever ? 15 : -1, floating, spin: Math.random() * 6, baseY: y,
      layer: -1, label, dead: false, age: 0, ...opts,
    };
    p.label = opts.label ?? label;
    p.floating = floating;
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    this.list.push(p);
    return p;
  }

  remove(p: Pickup): void {
    p.dead = true;
    this.group.remove(p.mesh);
    this.disposeMesh(p.mesh);
  }

  /** Dispose geometry that is unique to this pickup (cached geometries are shared). */
  private disposeMesh(o: THREE.Object3D): void {
    const m = o as THREE.Mesh;
    if (!m.geometry) return;
    for (const g of this.geoCache.values()) if (g === m.geometry) return;
    if (m.geometry !== GOLD_GEO) m.geometry.dispose();
  }

  update(dt: number, time: number): void {
    for (const p of this.list) {
      if (p.dead) continue;
      p.age += dt;
      if (p.life > 0) {
        p.life -= dt;
        if (p.life <= 0) {
          this.remove(p);
          continue;
        }
      }
      if (!p.floating && this.world.chunkAt(Math.floor(p.body.x), Math.floor(p.body.y), Math.floor(p.body.z))) {
        // (pickups in unloaded chunks stay frozen)
        p.body.vy -= GRAVITY * dt;
        if (p.body.vy < -60) p.body.vy = -60;
        const k = Math.exp(-2 * dt);
        if (p.body.onGround) {
          p.body.vx *= k;
          p.body.vz *= k;
        }
        moveBody(this.world, p.body, dt);
      } else if (p.floating) {
        p.body.y = p.baseY + Math.sin(time * 2 + p.id) * 0.25;
      }
      p.spin += dt * (p.kind === 'gold' ? 2.5 : 0.9);
      const b = p.body;
      const lift = p.kind === 'chest' ? 1.2 : p.floating ? 0.6 : 0.55;
      p.mesh.position.set(b.x, b.y + lift, b.z);
      p.mesh.rotation.y = p.kind === 'chest' ? 0 : p.spin;
      // gold blinks white faster and faster before it vanishes
      if (p.life > 0 && p.life < 5) p.mesh.visible = Math.sin(time * (8 + (5 - p.life) * 6)) > -0.3;
    }
    let w = 0;
    for (const p of this.list) if (!p.dead) this.list[w++] = p;
    this.list.length = w;
  }

  /** Nearest interactable pickup roughly under the crosshair. */
  pick(ex: number, ey: number, ez: number, dx: number, dy: number, dz: number, maxDist: number): Pickup | null {
    let best: Pickup | null = null;
    let bs = Infinity;
    for (const p of this.list) {
      if (p.dead || p.kind === 'gold') continue;
      const px = p.mesh.position.x - ex, py = p.mesh.position.y - ey, pz = p.mesh.position.z - ez;
      const t = px * dx + py * dy + pz * dz;
      if (t < 0 || t > maxDist) continue;
      const perp = Math.hypot(px - dx * t, py - dy * t, pz - dz * t);
      const allowed = 1.5 + t * 0.12;
      if (perp > allowed) continue;
      const score = perp / allowed + t * 0.02;
      if (score < bs && this.world.lineOfSight(ex, ey, ez, p.mesh.position.x, p.mesh.position.y, p.mesh.position.z)) {
        bs = score;
        best = p;
      }
    }
    return best;
  }

  clear(): void {
    for (const p of this.list) {
      this.group.remove(p.mesh);
      this.disposeMesh(p.mesh);
    }
    this.list.length = 0;
  }
}
