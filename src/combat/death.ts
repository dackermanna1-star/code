import * as THREE from 'three';
import type { RagdollLike } from '../world/ragdollTypes';
import { ActiveRagdoll, DeathStyle } from '../world/euphoria/bridge';
import type { Fighter } from './fighter';
import type { Game } from '../game';
import { B } from '../anim/skeleton';
import { SPLAT } from '../world/bloodAtlas';

interface Dying {
  f: Fighter;
  rag: RagdollLike;
  cause: string;
  bleedT: number;
  /** Next pained groan / bleed-out puddle while writhing. */
  groanT: number;
  puddleT: number;
  /** Last smear points of the head and chest (a bleeding body sliding on the floor smears it). */
  smear: [THREE.Vector3, THREE.Vector3] | null;
}

/** At most this many bodies writhe at once (each keeps an active ragdoll busy). */
const MAX_AGONY = 3;

/** Manages ragdolls of dying fighters until they settle and are baked into permanent corpses. */
export class DeathSystem {
  dying: Dying[] = [];
  private _v = new THREE.Vector3();
  constructor(public game: Game) {}

  /**
   * How a body dies: finishers / executions / ground kills go instantly limp; a fighter
   * beaten to death on their feet gets the dying stagger (knees go, tone drains away).
   */
  static styleFor(cause: string): DeathStyle {
    return cause === 'beaten' || cause === 'bled' ? 'collapse' : 'limp';
  }

  /**
   * A slow death fits: the killing blow wasn't to the head, nothing launched the body, and the
   * body has wounds to clutch. Head trauma, executions and big launches stay instantly limp.
   */
  private wantsAgony(f: Fighter, cause: string, region: string | undefined, violent: boolean) {
    if (f === this.game.player || !region || region === 'head' || violent) return false;
    if (this.dying.filter((d) => d.rag instanceof ActiveRagdoll && d.rag.inAgony).length >= MAX_AGONY) return false;
    const wounds = f.model.wounds.filter((w) => w.type !== 2).length;
    const p = (cause === 'finisher' ? 0.35 : 0.72) + Math.min(0.2, wounds * 0.04);
    return Math.random() < p;
  }

  /** Convert a fighter into a ragdoll. impulse: world N*s applied at point. */
  kill(f: Fighter, cause: string, impulse?: THREE.Vector3, at?: THREE.Vector3, launch?: THREE.Vector3, region?: string) {
    if (f.dead) return null;
    f.alive = false;
    f.dead = true;
    f.solid = false;
    f.hp = 0;
    const g = this.game;
    const rag = g.makeRagdoll(f, 0.6);
    let imp = impulse;
    if (rag instanceof ActiveRagdoll) {
      rag.setWounds(f.model.wounds);
      // the active body is fully coupled through its joints: it needs about half the kick a loose ragdoll does
      imp = impulse?.clone().multiplyScalar(0.5);
      // a big launch or blow doesn't leave time for a dying stagger
      const violent = !!((launch && launch.length() > 3) || (imp && imp.length() > 110));
      if (this.wantsAgony(f, cause, region, violent)) {
        rag.dieSlowly(3.5 + Math.random() * 3.5, cause);
        g.euphoria.count('agony');
      } else rag.kill(violent ? 'limp' : DeathSystem.styleFor(cause), cause);
    }
    if (launch) rag.launch(rag instanceof ActiveRagdoll ? launch.clone().multiplyScalar(0.75) : launch, 3);
    if (imp) rag.impulse(imp, at);
    f.anim.toExternal(rag, 0.03);
    f.ragdoll = rag;
    this.dying.push({ f, rag, cause, bleedT: 0, groanT: 0.5 + Math.random() * 0.6, puddleT: 0.8, smear: null });
    return rag;
  }

  /** Take over an existing (knockdown / stagger) ragdoll as a death ragdoll. */
  adopt(f: Fighter, rag: RagdollLike, cause: string, impulse?: THREE.Vector3, at?: THREE.Vector3, region?: string) {
    if (f.dead) return rag;
    f.alive = false;
    f.dead = true;
    f.solid = false;
    f.hp = 0;
    if (rag instanceof ActiveRagdoll) {
      if (this.wantsAgony(f, cause, region, false)) {
        rag.setWounds(f.model.wounds);
        rag.dieSlowly(3 + Math.random() * 3, cause);
        this.game.euphoria.count('agony');
      } else rag.kill(rag.grounded ? 'limp' : 'collapse', cause);
    }
    if (impulse) rag.impulse(impulse, at);
    rag.settled = false;
    rag.calmTime = 0;
    rag.time = Math.min(rag.time, 3);
    f.anim.toExternal(rag, 0.03);
    f.ragdoll = rag;
    this.dying.push({ f, rag, cause, bleedT: 0, groanT: 0.4 + Math.random() * 0.5, puddleT: 0.6, smear: null });
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
      if (d.rag instanceof ActiveRagdoll && d.rag.inAgony) this.agony(d, d.rag, dt);
      this.smears(d);
      if (d.rag.settled) {
        this.finalize(d);
        this.dying.splice(i, 1);
      }
    }
  }

  /** A bleeding body sliding or rolling along the floor smears its blood behind it. */
  private smears(d: Dying) {
    const f = d.f;
    const bloody = f.bleedRate > 0.25 || f.model.wounds.some((w) => w.type === 0 && w.intensity * w.radius > 0.02);
    if (!bloody) return;
    if (!d.smear) {
      d.smear = [d.rag.headPos(new THREE.Vector3()), d.rag.chestPos(new THREE.Vector3())];
      return;
    }
    const low = 0.3 * f.scale;
    for (let k = 0; k < 2; k++) {
      const p = k === 0 ? d.rag.headPos(this._v) : d.rag.chestPos(this._v);
      const last = d.smear[k];
      const dist = Math.hypot(p.x - last.x, p.z - last.z);
      if (p.y > low || last.y > low) {
        if (p.y > low) last.copy(p);
        continue;
      }
      if (dist < 0.05) continue;
      if (dist < 0.8) {
        const r = (k === 0 ? 0.06 : 0.09) * f.scale;
        const mid = new THREE.Vector3((p.x + last.x) / 2, 0.01, (p.z + last.z) / 2);
        const dir = new THREE.Vector3(p.x - last.x, 0, p.z - last.z).normalize();
        this.game.blood.splat(mid, r, SPLAT.smear, 0.75, new THREE.Vector3(0, 1, 0), dir, Math.max(0, dist / (2 * r) - 0.5));
      }
      last.copy(p);
    }
  }

  /** A slow death: groans that weaken, and blood welling out under the wounds as the body writhes. */
  private agony(d: Dying, rag: ActiveRagdoll, dt: number) {
    const g = this.game;
    const k = rag.agonyProgress;
    d.groanT -= dt;
    if (d.groanT <= 0) {
      d.groanT = 0.9 + Math.random() * 1.4 + k * 1.2;
      rag.headPos(this._v);
      g.audio.play('grunt_pain', { pos: this._v, vol: 0.55 * (1 - 0.6 * k), pitch: 0.82 - 0.12 * k, pitchVar: 0.06 });
    }
    d.puddleT -= dt;
    if (d.puddleT <= 0 && rag.grounded) {
      d.puddleT = 0.45 + Math.random() * 0.5;
      // bleed from the worst wound's body part
      const w = d.f.model.wounds.filter((x) => x.type === 0).sort((a, b) => b.intensity * b.radius - a.intensity * a.radius)[0];
      const fromHead = w ? w.pos.y > d.f.def.rest[B.neck].y : false;
      if (fromHead) rag.headPos(this._v);
      else rag.chestPos(this._v);
      if (this._v.y < 0.45) {
        this._v.y = 0.01;
        g.blood.splat(this._v.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.12, 0, (Math.random() - 0.5) * 0.12)), (0.06 + Math.random() * 0.07) * d.f.scale, SPLAT.pool, 0.85, new THREE.Vector3(0, 1, 0));
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
    f.model.syncWounds(g.time);
    const shapes = d.rag.corpseShapes();
    const rec = g.corpses.bake(f.model, shapes, d.cause, g.time);
    // later active ragdolls land on (and stumble over) this body
    g.euphoria.addStaticShapes(shapes);
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
    d.rag.dispose();
    f.ragdoll = null;
    f.model.dispose();
    g.removeFighter(f);
    g.onCorpse?.(rec);
  }
}
