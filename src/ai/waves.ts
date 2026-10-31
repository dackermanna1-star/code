import type { Game } from '../game';
import { Enemy } from './enemy';
import { ARCHETYPES } from './archetypes';
import { pick, rand } from '../core/math';
import { Archetype } from '../character/variants';

type Comp = [string, number][];
interface WaveDef {
  comp: Comp;
  boss?: string;
  hint?: string;
  title?: string;
}

const WAVES: WaveDef[] = [
  { comp: [['brawler', 3]], hint: 'LMB strike · RMB counter when ⚡ appears · SPACE dodge/vault' },
  { comp: [['brawler', 5]], hint: 'Chain strikes between enemies — direction + LMB picks a target' },
  { comp: [['brawler', 4], ['knife', 1]], hint: 'Counter armed thugs to DISARM them · E picks up weapons' },
  { comp: [['brawler', 4], ['knife', 2], ['club', 1]], hint: 'RED ! attacks cannot be countered — DODGE them' },
  { comp: [['brawler', 3]], boss: 'butcher', title: 'THE BUTCHER', hint: 'Q stuns brutes · strike them while dazed · F finishers at combo charge' },
  { comp: [['brawler', 4], ['agile', 2]], hint: 'Runners dodge strikes — stun or counter them' },
  { comp: [['brawler', 3], ['bruiser', 1], ['knife', 2]], hint: 'Vault over brutes (SPACE toward them) to daze them' },
  { comp: [['brawler', 3], ['defender', 2], ['club', 1]], hint: 'Guards block punches — kicks, stuns and throws (E) break guard' },
  { comp: [['brawler', 2], ['agile', 2], ['bruiser', 1], ['sword', 2]] },
  { comp: [['agile', 2], ['knife', 2]], boss: 'viper', title: 'VIPER' },
  { comp: [['elite', 2], ['brawler', 3], ['defender', 1]], hint: 'Fighters chain combos and feint — watch the telegraph' },
  { comp: [['bruiser', 2], ['elite', 2], ['sword', 2], ['brawler', 2]] },
  { comp: [['elite', 3], ['defender', 2], ['agile', 2], ['club', 1]] },
  { comp: [['bruiser', 2], ['elite', 3], ['sword', 2], ['knife', 2]] },
  { comp: [['elite', 2]], boss: 'master', title: 'GRANDMASTER KAEL', hint: 'Perfect counters stagger the Grandmaster · punish him when exhausted' },
];

export class WaveManager {
  wave = 0;
  betweenWaves = true;
  timer = 3;
  queue: string[] = [];
  spawnTimer = 0;
  remaining = 0;
  maxActive = 8;
  started = false;
  endless = false;
  onWaveStart: ((w: number, def: WaveDef) => void) | null = null;
  onWaveClear: ((w: number) => void) | null = null;
  private doorIdx = 0;
  bossAlive: Enemy | null = null;

  constructor(public game: Game) {}

  start(fromWave = 1) {
    this.wave = fromWave - 1;
    this.betweenWaves = true;
    this.timer = 2.5;
    this.started = true;
  }

  get def(): WaveDef {
    return this.waveDef(this.wave);
  }

  waveDef(w: number): WaveDef {
    if (w <= WAVES.length) return WAVES[w - 1];
    // endless scaling
    const n = w - WAVES.length;
    const pool = ['brawler', 'brawler', 'knife', 'club', 'sword', 'agile', 'defender', 'elite', 'bruiser'];
    const count = Math.min(14, 6 + Math.floor(n * 0.7));
    const comp: Record<string, number> = {};
    for (let i = 0; i < count; i++) {
      const k = pick(pool);
      comp[k] = (comp[k] ?? 0) + 1;
    }
    const def: WaveDef = { comp: Object.entries(comp) };
    if (n % 5 === 0) {
      def.boss = pick(['butcher', 'viper', 'master']);
      def.title = ARCHETYPES[def.boss].label;
    }
    return def;
  }

  update(dt: number) {
    const g = this.game;
    if (!this.started || !g.player.alive) return;
    if (this.betweenWaves) {
      this.timer -= dt;
      if (this.timer <= 0) this.beginWave();
      return;
    }
    // spawn queued enemies
    const active = g.enemies().filter((e) => e.alive).length;
    this.spawnTimer -= dt;
    if (this.queue.length > 0 && active < this.maxActive && this.spawnTimer <= 0) {
      const n = Math.min(this.queue.length, this.maxActive - active, Math.random() < 0.5 ? 2 : 1);
      const door = g.arena.doors[this.doorIdx++ % g.arena.doors.length];
      for (let i = 0; i < n; i++) this.spawn(this.queue.shift()!, door, i);
      this.spawnTimer = rand(0.8, 1.8);
    }
    this.remaining = this.queue.length + active;
    if (this.queue.length === 0 && active === 0) this.completeWave();
  }

  private beginWave() {
    const g = this.game;
    this.wave++;
    this.betweenWaves = false;
    const def = this.def;
    g.director.setWave(this.wave);
    this.queue = [];
    for (const [k, n] of def.comp) for (let i = 0; i < n; i++) this.queue.push(k);
    // shuffle (keep harder types later)
    this.queue.sort(() => Math.random() - 0.5);
    this.maxActive = Math.min(10, 6 + Math.floor(this.wave / 4));
    if (def.boss) {
      const door = g.arena.doors[0];
      this.bossAlive = this.spawn(def.boss, door, 0);
      g.bosses.register(this.bossAlive);
    }
    this.spawnTimer = def.boss ? 2.5 : 0.3;
    this.onWaveStart?.(this.wave, def);
  }

  private completeWave() {
    this.betweenWaves = true;
    this.timer = 6;
    const p = this.game.player;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3);
    this.onWaveClear?.(this.wave);
  }

  spawn(key: string, door: { x: number; z: number; ix: number; iz: number; yaw: number; width: number }, i: number): Enemy {
    const g = this.game;
    const cfg = ARCHETYPES[key];
    const names = g.archetypes[key as Archetype] ?? g.archetypes.brawler;
    const v = g.lib.get(pick(names));
    const e = new Enemy(g, g.lib, v, cfg);
    const off = (i - 0.5) * 0.9;
    const px = door.x + Math.cos(door.yaw) * off, pz = door.z - Math.sin(door.yaw) * off;
    e.spawn(px, pz, door.yaw);
    e.enterX = door.ix + Math.cos(door.yaw) * off * 1.5 + rand(-0.5, 0.5);
    e.enterZ = door.iz - Math.sin(door.yaw) * off * 1.5 + rand(-0.5, 0.5);
    e.ghostWalls = true;
    // difficulty scaling: tougher & faster later, not just more HP
    const w = this.wave;
    e.speedMul = 1 + Math.min(0.25, w * 0.012);
    e.maxHp = e.hp = Math.round(cfg.hp * (1 + Math.min(0.6, Math.max(0, w - 6) * 0.03)));
    g.addFighter(e);
    return e;
  }
}
