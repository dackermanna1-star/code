import * as THREE from 'three';
import { ctx } from '../game/ctx';
import type { Prop } from '../world/Props';
import type { Character } from '../characters/Character';
import type { Player } from './Player';
import type { WeaponSystem } from '../weapons/Weapons';
import type { RCollider } from '../physics/Physics';
import { QG } from '../physics/Physics';

export interface Interactable {
  label: string;
  /** returns false if not usable right now */
  use(player: Player): boolean | void;
  enabled?: () => boolean;
}

export type Focus =
  | { kind: 'prop'; prop: Prop; label: string }
  | { kind: 'char'; char: Character; label: string }
  | { kind: 'body'; char: Character; label: string }
  | { kind: 'use'; item: Interactable; label: string }
  | null;

const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** Registry of static interactive objects (jukebox, taps, toilets...). */
export class Interactables {
  private byCollider = new Map<number, Interactable>();
  private propHandlers = new Map<string, (p: Prop, player: Player) => void>();
  add(c: RCollider, it: Interactable): void {
    this.byCollider.set(c.handle, it);
  }
  get(c: RCollider | null | undefined): Interactable | undefined {
    return c ? this.byCollider.get(c.handle) : undefined;
  }
  onProp(kind: string, fn: (p: Prop, player: Player) => void): void {
    this.propHandlers.set(kind, fn);
  }
  propHandler(kind: string): ((p: Prop, player: Player) => void) | undefined {
    return this.propHandlers.get(kind);
  }
  clear(): void {
    this.byCollider.clear();
  }
}

/** Handles E / F / G for the player. */
export class PlayerInteraction {
  focus: Focus = null;
  private scanTimer = 0;
  readonly interactables = new Interactables();

  constructor(
    private player: Player,
    private weapons: WeaponSystem,
  ) {
    ctx.services.interactables = this.interactables;
  }

  update(dt: number): void {
    const p = this.player;
    const input = ctx.input;
    if (!p.alive) {
      this.focus = null;
      return;
    }
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = 0.06;
      this.focus = this.scan();
    }

    // ---- E: interact / pick up / drink / grab
    if (input.wasPressed('interact') && !p.grabbed && !p.carryingBody) {
      const f = this.focus;
      const w = p.weapon;
      let done = false;
      if (f && f.kind === 'prop') {
        const prop = f.prop;
        if (prop.def.interact && prop.def.interact !== 'drink' && !prop.def.weapon && !prop.def.carry) {
          this.interactables.propHandler(prop.def.interact)?.(prop, p);
          done = true;
        } else if (prop.def.weapon || prop.def.carry) {
          if (w) this.weapons.playerRelease(p, 'drop');
          done = this.weapons.playerPickUp(p, prop);
        }
      } else if (f && f.kind === 'use') {
        f.item.use(p);
        done = true;
      }
      if (!done && w && this.weapons.playerDrink(p)) done = true;
      if (!done && f && f.kind === 'char' && !w) done = p.tryGrab(f.char);
      if (!done && f && f.kind === 'body' && !w) done = p.pickUpBody(f.char);
    }
    // ---- F: throw held weapon
    if (input.wasPressed('throw') && p.weapon && !p.grabbed && !p.carryingBody && p.drinkTimer <= 0) {
      this.weapons.playerRelease(p, 'throw');
    }
    // ---- G: drop
    if (input.wasPressed('drop') && p.weapon && p.drinkTimer <= 0) {
      this.weapons.playerRelease(p, 'drop');
    }
  }

  private scan(): Focus {
    const p = this.player;
    const eye = p.eye(_eye);
    const dir = p.aimDir(_dir);
    const reach = 2.3;
    // static interactables first (only if nothing closer)
    const wh = ctx.physics.raycast(eye, dir, reach, QG.WORLD);
    const staticDist = wh ? wh.toi : Infinity;
    const it = wh ? this.interactables.get(wh.collider) : undefined;
    // characters (grab) / bodies
    const th = ctx.combat.rayHit(eye, dir, Math.min(reach, staticDist), 0.08, (c) => c === p);
    const prop = ctx.props.findPickup(eye, dir, Math.min(reach, staticDist + 0.1), (q) => !!(q.def.weapon || q.def.carry || q.def.interact));
    let propDist = Infinity;
    if (prop) propDist = prop.position(new THREE.Vector3()).distanceTo(eye);
    const charDist = th ? th.hit.dist : Infinity;
    if (th && charDist < propDist + 0.2) {
      const c = th.target as Character;
      if (!c.isPlayer && (c as Character).model) {
        if (c.upright && c.alive) {
          if (charDist < 1.7 && !p.weapon) return { kind: 'char', char: c, label: `Grab ${c.name}` };
        } else if (charDist < 2.2 && !p.weapon && c.ragdoll) {
          return { kind: 'body', char: c, label: c.alive ? `Pick up ${c.name}` : 'Pick up body' };
        }
      }
    }
    if (prop) {
      const d = prop.def;
      if (d.interact && d.interact !== 'drink' && !d.weapon && !d.carry) return { kind: 'prop', prop, label: useLabel(d.interact, d.name) };
      const verb = p.weapon ? 'Swap for' : d.carry && !d.weapon ? 'Carry' : 'Pick up';
      return { kind: 'prop', prop, label: `${verb} ${d.weapon ? (prop.weapon?.name ?? d.name) : d.name}` };
    }
    if (it && (!it.enabled || it.enabled())) return { kind: 'use', item: it, label: it.label };
    return null;
  }
}

function useLabel(kind: string, name: string): string {
  switch (kind) {
    case 'arcade':
      return 'Play ' + name;
    case 'pinball':
      return 'Play Pinball';
    case 'register':
      return 'Open Register';
    case 'phone':
      return 'Use Phone';
    default:
      return 'Use ' + name;
  }
}
