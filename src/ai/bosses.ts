import * as THREE from 'three';
import type { Game } from '../game';
import type { Enemy } from './enemy';
import { Weapon } from '../combat/weapons';
import { brainFor } from './bossKits';

/** Boss phase logic: enrage, minions, weapon pickup, exhaustion windows. */
export class BossManager {
  bosses: Enemy[] = [];
  constructor(public game: Game) {}

  register(e: Enemy) {
    this.bosses.push(e);
    e.phase = 1;
    e.brain = brainFor(e, this.game);
    this.game.music.boss = true;
    // (tests: ?bosshp=0.3 starts the boss that far down, in its later phases)
    const hp0 = Number(this.game.params.get('bosshp') ?? 1);
    if (hp0 < 1) {
      e.hp = e.maxHp * hp0;
      this.onBossDamaged(e);
    }
    // an entrance: the camera finds the boss coming through the door
    const g = this.game;
    g.later(0.6, () => {
      if (!e.alive) return;
      const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
      const focus = new THREE.Vector3(e.x + fx * 1.2, 1.35, e.z + fz * 1.2);
      const pos = focus.clone().add(new THREE.Vector3(fx * 3.2 - fz * 1.2, 0.25, fz * 3.2 + fx * 1.2));
      g.cam.playShot({ focus, pos, fov: 40, duration: 1.5, blendIn: 0.45, blendOut: 0.7, orbit: 0.12 });
    });
  }

  get active(): Enemy | null {
    return this.bosses.find((b) => b.alive) ?? null;
  }

  onBossDamaged(e: Enemy) {
    const g = this.game;
    const f = e.hp / e.maxHp;
    const phases = e.cfg.phases ?? 2;
    const next = phases === 3 ? (f < 0.33 ? 3 : f < 0.66 ? 2 : 1) : f < 0.5 ? 2 : 1;
    if (next > e.phase) {
      e.phase = next;
      if (e.brain) e.brain.phaseChange(next);
      else g.hud?.toast(`${e.cfg.label} — PHASE ${next}`, '#ff4030', 1.6);
      // the turn of the fight: time stretches, the boss roars, everyone near is pushed back
      g.slowMo(0.35, 1.1);
      g.cam.addTrauma(0.6);
      g.renderer.fx.chroma = Math.max(g.renderer.fx.chroma, 0.9);
      g.audio.play('death', { pos: new THREE.Vector3(e.x, 1.6, e.z), vol: 0.75, pitch: 0.6 });
      g.audio.thump(1.2, new THREE.Vector3(e.x, 0.5, e.z));
      g.fx.dust(new THREE.Vector3(e.x, 0.2, e.z), 6);
      const p = g.player;
      const dp = Math.hypot(p.x - e.x, p.z - e.z);
      if (dp < 3 && p.alive && !p.isLocked()) {
        p.vx += ((p.x - e.x) / (dp || 1)) * 5;
        p.vz += ((p.z - e.z) / (dp || 1)) * 5;
      }
      g.director.cancel(e);
      e.comboQueue = [];
      e.speedMul = 1 + (next - 1) * 0.15;
      e.cfg = { ...e.cfg, aggression: Math.min(1, e.cfg.aggression + 0.15), attackSpeed: e.cfg.attackSpeed * 1.08, feint: e.cfg.feint + 0.1 };
      if (e.cfg.key === 'butcher') {
        this.minions(['brawler', 'brawler']);
      } else if (e.cfg.key === 'warden') {
        // (the Warden's brain radios his own men in)
      } else if (e.cfg.key === 'subject') {
        this.minions(next === 2 ? ['agile'] : ['brawler', 'agile']);
      } else if (e.cfg.key === 'viper') {
        this.minions(['agile', 'knife']);
        // vanish and reappear behind the player
        g.fx.dust(new THREE.Vector3(e.x, 0, e.z), 3);
        const p = g.player;
        e.x = p.x - Math.sin(p.yaw) * 3.5;
        e.z = p.z - Math.cos(p.yaw) * 3.5;
        e.anim.initAt(e.x, e.z, e.yaw);
        g.fx.dust(new THREE.Vector3(e.x, 0, e.z), 3);
      } else if (e.cfg.key === 'master') {
        if (next === 2) {
          // takes up a blade
          if (!e.weapon) {
            const w = new Weapon(g, 'sword');
            w.attach(e);
            g.weapons.push(w);
          }
          e.cfg = { ...e.cfg, attacks: [...e.cfg.attacks, 'sword_slash', 'sword_slash', 'sword_spin'] };
          this.minions(['elite', 'defender']);
        } else {
          e.cfg = { ...e.cfg, attacks: ['elite_spin', 'elite_fly', 'elite_round', 'sword_spin', 'elite_cross'], comboHits: [3, 4] };
          this.minions(['elite', 'agile', 'bruiser']);
        }
      }
    }
  }

  private minions(keys: string[]) {
    const g = this.game;
    keys.forEach((k, i) => {
      const door = g.arena.doors[(i + 1) % g.arena.doors.length];
      g.waves.spawn(k, door, i);
    });
  }

  update(dt: number) {
    const g = this.game;
    void dt;
    // (Kael's exhaustion is earned now - after his shockwave or a full fury string - see KaelBrain)
    if (!this.active) g.music.boss = false;
  }
}
