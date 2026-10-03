import * as THREE from 'three';
import { clearLenses } from '../../gojo/GojoFX';
import { SD } from '../core/SD';
import { HUD } from '../ui/HUD';
import { Boss, DIFFICULTY, Difficulty } from './Boss';
import { Timing } from './Combat';
import { Director } from './Director';
import { Player } from './Player';

const CALL: Record<string, [string, string, string]> = {
  red: ['術式反転「赫」', 'Cursed Technique Reversal: Red', 'red'],
  blue: ['術式順転「蒼」', 'Cursed Technique Lapse: Blue', 'blue'],
  purpleFire: ['虚式「茈」', 'Hollow Technique: Purple', 'purple'],
  purple200: ['虚式「茈」　200%', 'Hollow Technique: Purple — 200%', 'purple'],
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
  readonly director: Director;
  over: 'win' | 'lose' | null = null;
  /** decided, ending cutscene still playing */
  private ending: 'win' | 'lose' | null = null;
  stats = { time: 0, bf: 0, bfBest: 0, dmgTaken: 0, techniques: 0 };
  onOver: ((r: 'win' | 'lose') => void) | null = null;
  /** manga rendering held on (setting) */
  mangaBase = 0;
  t = 0;
  /** title: the face-off behind the menu; intro: the opening cutscene; fight: the duel */
  mode: 'title' | 'intro' | 'fight' = 'fight';
  private sceneBefore: Set<THREE.Object3D>;
  private vmBefore: Set<THREE.Object3D>;

  constructor(uiRoot: HTMLElement, diff: Difficulty = DIFFICULTY.hard, mode: 'title' | 'fight' = 'fight') {
    this.sceneBefore = new Set(SD.scene.children);
    this.vmBefore = new Set(SD.vmScene.children);
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
    this.director = new Director(this);
    SD.director = this.director;
    this.mode = mode;
    if (mode === 'title') this.director.attract();
  }

  /** From the title: set the difficulty and roll the intro (short on a rematch). */
  begin(diff: Difficulty, short: boolean) {
    this.boss.setDifficulty(diff);
    this.mode = 'intro';
    this.director.intro(short, () => {
      this.mode = 'fight';
      this.hud.shown = true;
    });
  }

  /** Tears the duel down: bodies, models, effects, HUD and post state. */
  dispose() {
    this.director.dispose();
    this.player.f.dispose();
    this.boss.f.dispose();
    for (const o of [...SD.scene.children]) if (!this.sceneBefore.has(o)) SD.scene.remove(o);
    for (const o of [...SD.vmScene.children]) if (!this.vmBefore.has(o)) SD.vmScene.remove(o);
    this.hud.dispose();
    SD.fx.clear();
    SD.audio?.stopLoops();
    SD.timeScale = 1;
    SD.hideVM = false;
    SD.renderer.resetPost();
    SD.enemies = [];
    for (const k of ['player', 'boss', 'director', 'hud', 'onomato', 'subtitle', 'timing']) SD[k] = null;
  }

  private onPlayer(name: string, data?: any) {
    const c = CALL[name];
    if (c) this.hud.callout(c[0], c[1], c[2]);
    if (c) this.stats.techniques++;
    if (name === 'blackFlash') {
      this.hud.blackFlash(data as number);
      this.stats.bf++;
      this.stats.bfBest = Math.max(this.stats.bfBest, data as number);
    }
    if (name === 'bfRelease' && data !== 'perfect') this.hud.ono(data === 'early' ? '早い' : '遅い', null, 0.6);
    if (name === 'domainOpen') {
      this.hud.callout('領域展開「無量空処」', 'Domain Expansion: Infinite Void', 'void', 2.6);
      this.director.playerDomain();
    }
    if (name === 'dead') this.end('lose');
  }

  private end(r: 'win' | 'lose') {
    if (this.over || this.ending) return;
    this.ending = r;
    const done = () => {
      this.over = r;
      this.director.cine(false);
      this.onOver?.(r);
    };
    // let a running cutscene finish first
    this.director.seq = null;
    if (r === 'win') this.director.victory(done);
    else this.director.defeat(done);
  }

  /** Real-time dt in, scaled sim inside. */
  update(dt: number) {
    this.t += dt;
    if (this.mode === 'intro' && (SD.input.pressed('Space') || SD.input.pressed('Enter') || SD.input.mousePress(0))) this.director.skipIntro();
    this.timing.update(dt);
    const sdt = dt * SD.timeScale;
    this.postFrame(dt);
    if (!this.ending && this.mode === 'fight') this.stats.time += sdt;
    const hp0 = this.player.hp;
    this.player.update(sdt);
    this.boss.phase = this.director.phase;
    this.boss.update(sdt);
    this.director.update(sdt, dt);
    if (this.player.hp < hp0) this.stats.dmgTaken += hp0 - this.player.hp;
    // the fallen leave the enemy list
    for (let i = SD.enemies.length - 1; i >= 0; i--) if (!SD.enemies[i].alive && SD.enemies[i] !== this.boss) SD.enemies.splice(i, 1);
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
