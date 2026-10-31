import * as THREE from 'three';
import { Ragdoll } from '../world/ragdoll';
import type { Fighter } from './fighter';
import type { Game } from '../game';
import { B } from '../anim/skeleton';
import { SPLAT } from '../world/bloodAtlas';

interface Dying {
  f: Fighter;
  rag: Ragdoll;
  cause: string;
  bleedT: number;
}

/** Manages ragdolls of dying fighters until they settle and are baked into permanent corpses. */
export class DeathSystem {
  dying: Dying[] = [];
  private _v = new THREE.Vector3();
  constructor(public game: Game) {}

  /** Convert a fighter into a ragdoll. impulse: world N*s applied at point. */
  kill(f: Fighter, cause: string, impulse?: THREE.Vector3, at?: THREE.Vector3, launch?: THREE.Vector3) {
    if (f.dead) return null;
    f.alive = false;
    f.dead = true;
    f.solid = false;
    f.hp = 0;
    const g = this.game;
    const rag = new Ragdoll(g.physics, {
      def: f.def,
      fk: f.anim.fk,
      prevFk: f.anim.prevFk,
      dt: Math.max(1 / 120, f.anim['lastDt' as keyof typeof f.anim] as unknown as number),
      rootX: f.x,
      rootZ: f.z,
      rootYaw: f.yaw,
      vel: new THREE.Vector3(f.vx, 0, f.vz).multiplyScalar(0.6),
      scale: f.scale,
    });
    if (launch) rag.launch(launch, 3);
    if (impulse) rag.impulse(impulse, at);
    f.anim.toExternal(rag, 0.03);
    f.ragdoll = rag;
    this.dying.push({ f, rag, cause, bleedT: 0 });
    return rag;
  }

  /** Take over an existing (knockdown) ragdoll as a death ragdoll. */
  adopt(f: Fighter, rag: Ragdoll, cause: string, impulse?: THREE.Vector3, at?: THREE.Vector3) {
    if (f.dead) return rag;
    f.alive = false;
    f.dead = true;
    f.solid = false;
    f.hp = 0;
    if (impulse) rag.impulse(impulse, at);
    rag.settled = false;
    rag.calmTime = 0;
    rag.time = Math.min(rag.time, 3);
    f.anim.toExternal(rag, 0.03);
    f.ragdoll = rag;
    this.dying.push({ f, rag, cause, bleedT: 0 });
    return rag;
  }

  update(dt: number) {
    const g = this.game;
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.rag.update(dt);
      const p = d.rag.rootPos(this._v);
      d.f.x = p.x;
      d.f.z = p.z;
      // fresh bleeding from wounds while falling
      d.bleedT += dt;
      if (d.f.bleedRate > 0 && Math.random() < dt * d.f.bleedRate * 2) {
        d.f.anim.boneWorld(Math.random() < 0.5 ? B.head : B.chest, this._v);
        g.fx?.bloodDrip(this._v, 1);
      }
      if (d.rag.settled) {
        this.finalize(d);
        this.dying.splice(i, 1);
      }
    }
  }

  private finalize(d: Dying) {
    const g = this.game;
    const f = d.f;
    // final pose -> bones
    f.anim.update(0, f.x, f.z, f.yaw);
    f.model.group.position.set(f.x, 0, f.z);
    f.model.group.rotation.y = f.yaw;
    f.model.syncWounds();
    const rec = g.corpses.bake(f.model, d.rag, d.cause, g.time);
    // blood pool from head/chest depending on wounds
    const bloodWounds = f.model.wounds.filter((w) => w.type === 0);
    const severity = Math.min(1, bloodWounds.reduce((a, w) => a + w.intensity * w.radius * 8, 0) + f.bleedRate * 0.15 + 0.25);
    const head = new THREE.Vector3();
    f.anim.boneWorld(B.head, head);
    const chest = new THREE.Vector3();
    f.anim.boneWorld(B.chest, chest);
    const src = bloodWounds.some((w) => w.pos.y > f.def.rest[B.neck].y) ? head : chest;
    if (src.y < 0.6) {
      g.blood.addPool(src.x, src.z, (0.32 + severity * 0.6) * f.scale, 9 + severity * 14, 0.4);
      if (severity > 0.6) g.blood.addPool(chest.x + (Math.random() - 0.5) * 0.3, chest.z + (Math.random() - 0.5) * 0.3, 0.3 * f.scale, 16, 2.5);
    }
    void SPLAT;
    d.rag.dispose();
    f.ragdoll = null;
    f.model.dispose();
    g.removeFighter(f);
    g.onCorpse?.(rec);
  }
}
