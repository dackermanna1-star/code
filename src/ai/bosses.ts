import * as THREE from 'three';
import type { Game } from '../game';
import type { Enemy } from './enemy';
import { Weapon } from '../combat/weapons';
import { rand } from '../core/math';

/** Boss phase logic: enrage, minions, weapon pickup, exhaustion windows. */
export class BossManager {
  bosses: Enemy[] = [];
  constructor(public game: Game) {}

  register(e: Enemy) {
    this.bosses.push(e);
    e.phase = 1;
    this.game.music.boss = true;
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
      g.hud?.toast(`${e.cfg.label} — PHASE ${next}`, '#ff4030', 1.6);
      g.cam.addTrauma(0.5);
      g.audio.play('death', { pos: new THREE.Vector3(e.x, 1.6, e.z), vol: 0.6, pitch: 0.7 });
      e.speedMul = 1 + (next - 1) * 0.15;
      e.cfg = { ...e.cfg, aggression: Math.min(1, e.cfg.aggression + 0.15), attackSpeed: e.cfg.attackSpeed * 1.08, feint: e.cfg.feint + 0.1 };
      if (e.cfg.key === 'butcher') {
        this.minions(['brawler', 'brawler']);
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
    for (const b of this.bosses) {
      if (!b.alive) continue;
      // exhaustion after long combos in phase 3: exploitable weakness
      if (b.cfg.key === 'master' && b.phase === 3 && b.state === 'circle' && b.stateTime < dt * 1.5 && Math.random() < 0.5) {
        b.stunNow(rand(1.8, 2.6));
        g.hud?.toast('KAEL IS EXHAUSTED — PUNISH HIM', '#ffd24a', 1.0);
      }
    }
    if (!this.active) g.music.boss = false;
  }
}
