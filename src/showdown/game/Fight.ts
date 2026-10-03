import * as THREE from 'three';
import { clearLenses } from '../../gojo/GojoFX';
import { SD } from '../core/SD';
import { HUD } from '../ui/HUD';
import { Boss, DIFFICULTY, Difficulty } from './Boss';
import { Timing } from './Combat';
import { Player } from './Player';

const CALL: Record<string, [string, string, string]> = {
  red: ['術式反転「赫」', 'Cursed Technique Reversal: Red', 'red'],
  blue: ['術式順転「蒼」', 'Cursed Technique Lapse: Blue', 'blue'],
  purpleFire: ['虚式「茈」', 'Hollow Technique: Purple', 'purple'],
  rct: ['反転術式', 'Reverse Cursed Technique', ''],
};

/**
 * The duel: Gojo against Sukuna in the Shinjuku intersection. Owns both
 * fighters, the HUD, the post-effect decay and the outcome.
 */
export class Fight {
  readonly player: Player;
  readonly boss: Boss;
  readonly hud: HUD;
  readonly timing = new Timing();
  over: 'win' | 'lose' | null = null;
  onOver: ((r: 'win' | 'lose') => void) | null = null;
  /** manga rendering held on (setting) */
  mangaBase = 0;
  t = 0;

  constructor(uiRoot: HTMLElement, diff: Difficulty = DIFFICULTY.hard) {
    SD.timing = this.timing;
    this.player = new Player(0, 24);
    this.player.yaw = 0;
    SD.player = this.player;
    this.boss = new Boss(0, -18, this.player, diff);
    SD.boss = this.boss;
    SD.enemies = [this.boss];
    this.hud = new HUD(uiRoot);
    SD.hud = this.hud;
    SD.onomato = (text: string, pos: THREE.Vector3 | null, scale = 1, kind = '') => this.hud.ono(text, pos, scale, kind);
    SD.subtitle = (jp: string, en: string, who = '') => this.hud.subtitle(jp, en, who);
    this.player.onEvent = (name, data) => this.onPlayer(name, data);
    this.boss.onEvent = (name) => {
      if (name === 'dead') this.end('win');
    };
  }

  private onPlayer(name: string, data?: any) {
    const c = CALL[name];
    if (c) this.hud.callout(c[0], c[1], c[2]);
    if (name === 'blackFlash') this.hud.blackFlash(data as number);
    if (name === 'bfRelease' && data !== 'perfect') this.hud.ono(data === 'early' ? '早い' : '遅い', null, 0.6);
    if (name === 'domainOpen') this.hud.callout('領域展開「無量空処」', 'Domain Expansion: Infinite Void', 'void', 2.6);
    if (name === 'dead') this.end('lose');
  }

  private end(r: 'win' | 'lose') {
    if (this.over) return;
    this.over = r;
    this.onOver?.(r);
  }

  /** Real-time dt in, scaled sim inside. */
  update(dt: number) {
    this.t += dt;
    this.timing.update(dt);
    const sdt = dt * SD.timeScale;
    this.postFrame(dt);
    this.player.update(sdt);
    this.boss.update(sdt);
    this.hud.update(dt, this.player, this.boss.alive || this.over ? this.boss : null);
    return sdt;
  }

  /** Post effects decay toward their resting values every frame. */
  private postFrame(dt: number) {
    const p = SD.renderer.post;
    p.impact = Math.max(0, p.impact - dt * 7);
    p.bloomBoost += (0 - p.bloomBoost) * (1 - Math.exp(-3.5 * dt));
    p.speed = Math.max(0, p.speed - dt * 2.4);
    p.manga = Math.max(this.mangaBase, p.manga - dt * 5);
    p.flash = Math.max(0, p.flash - dt * 3);
    p.damage = Math.max(0, p.damage - dt * 0.9);
    p.heal = Math.max(0, p.heal - dt * 2);
    p.aberration = Math.max(0, p.aberration - dt * 6);
    p.zoomBlur = Math.max(0, p.zoomBlur - dt * 4);
    clearLenses();
  }
}
