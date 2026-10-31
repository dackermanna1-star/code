import { ASPECT_PALETTES } from '../core/ids';
import { clamp, lerp } from '../core/math';
import { codeToSeed, freshSeed, seedToCode } from '../core/rng';
import { AudioEngine } from '../audio/AudioEngine';
import { Camera } from '../render/Camera';
import { ArenaRenderer } from '../render/ArenaRenderer';
import { createPostFX } from '../render/postfx/PostFX';
import { defaultPostFXParams, type IPostFX, type PostFXParams } from '../render/postfx/types';
import type { HazardView } from '../render/types';
import { Vfx } from '../render/vfx/Vfx';
import { Animator } from '../render/fighter/Animator';
import { FighterRenderer } from '../render/fighter/FighterRenderer';
import { Hud } from '../ui/Hud';
import { Screens } from '../ui/Screens';
import { Controls } from '../ui/Controls';
import type { FighterCard, HudAbility, HudFighter, ResultsSummary, ScreenSide } from '../ui/types';
import { Director } from '../present/Director';
import { createSimulation } from './battle';
import { createBattle, PERSONALITY_INFO, type BattleSetup } from '../sim/generator';
import type { Simulation } from '../sim/simulation';
import type { Fighter } from '../sim/fighter';
import type { Brain } from '../ai/brain';
import { ABILITIES } from '../sim/abilities';
import { THEMES, type HazardKind } from '../sim/arena';
import type { AbilityId, AbilitySlot, FighterDef, Side, WinMethod } from '../sim/types';
import { WEAPONS } from '../sim/weapons';
import { C } from '../sim/constants';

const SLOTS: AbilitySlot[] = ['mobility', 'ranged', 'special', 'defense', 'ultimate'];

export const ABILITY_GLYPH: Record<AbilityId, string> = {
  phantomStep: '⟿', flashCut: '⚡', voidGate: '◎', galeAscent: '⇑', mirage: '◈',
  barrage: '✶', crescentWave: '☾', seekerOrbs: '✺', starfall: '☄', thunderJudgment: 'ϟ', spikeEruption: '▲', gravityOrb: '●',
  annihilationBeam: '═', bindingChains: '⛓', dimensionRend: '✕', titanSlam: '⤓', bladeStorm: '✢', chronoStop: '⧗',
  aegis: '⬡', mirrorWard: '◇', counterStance: '⚔', phaseShift: '◌', chronoRewind: '↺', secondWind: '✚',
  ascension: '♛', thousandCuts: '✧', supernova: '✹', heavensLance: '↓', blackHole: '◉', colossus: '⚒', cataclysm: '☀',
};

const METHOD_LABEL: Record<WinMethod, string> = {
  combo: 'Combo', counter: 'Counter', beam: 'Beam', ultimate: 'Ultimate', ability: 'Divine Ability', projectile: 'Projectile',
  clash: 'Clash', hazard: 'Arena Hazard', throw: 'Throw', finalClash: 'Final Clash', guardBreak: 'Guard Break', environment: 'Environment',
};

interface FighterView {
  anim: Animator;
  renderer: FighterRenderer;
  prevX: number;
  prevY: number;
}

interface Battle {
  setup: BattleSetup;
  sim: Simulation;
  brains: [Brain, Brain];
  arena: ArenaRenderer;
  director: Director;
  views: [FighterView, FighterView];
  screenSide: [ScreenSide, ScreenSide];
  accum: number;
  started: boolean;
  finished: boolean;
  resultsShown: boolean;
}

/**
 * Top-level game shell: owns the canvases, render pipeline, audio, UI and the battle lifecycle
 * (title → versus → fight → results → next battle), and drives the fixed-step simulation with
 * cinematic time scaling and smooth interpolation.
 */
export class Game {
  private output: HTMLCanvasElement;
  private scene: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private post: IPostFX;
  private params: PostFXParams = defaultPostFXParams();
  private cam = new Camera();
  private vfx = new Vfx();
  private audio = new AudioEngine();
  private hud = new Hud();
  private screens = new Screens();
  private controls = new Controls();
  private battle: Battle | null = null;
  private last = 0;
  private paused = false;
  private speed = 1;
  private muted = false;
  private volume = 0.8;
  private autoContinue = true;
  private hudVisible = true;
  private feedVisible = true;
  private battleNumber = 0;
  private seed = 0;
  private dpr = 1;
  private running = false;
  private lastHazards: HazardView[] = [];
  /** Adaptive internal resolution (keeps 60fps on weaker GPUs). */
  private renderScale = 1;
  private frameEma = 16;
  private lastScaleChange = 0;

  constructor(private root: HTMLElement) {
    this.output = document.createElement('canvas');
    this.output.className = 'gl-output';
    this.scene = document.createElement('canvas');
    const ctx = this.scene.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
    root.appendChild(this.output);
    const ui = document.createElement('div');
    ui.className = 'ui-root';
    root.appendChild(ui);
    this.post = createPostFX(this.output);
    this.hud.mount(ui);
    this.screens.mount(ui);
    this.controls.mount(ui, {
      onPauseToggle: () => this.setPaused(!this.paused),
      onSpeed: (s) => (this.speed = s),
      onNewBattle: () => void this.startBattle(freshSeed()),
      onReplay: () => void this.startBattle(this.seed),
      onRematch: () => void this.rematch(),
      onMuteToggle: () => {
        this.muted = !this.muted;
        this.audio.setMuted(this.muted);
      },
      onVolume: (v) => {
        this.volume = v;
        this.audio.setMasterVolume(v);
      },
      onToggleHud: () => {
        this.hudVisible = !this.hudVisible;
        this.hud.setVisible(this.hudVisible);
      },
      onToggleFeed: () => {
        this.feedVisible = !this.feedVisible;
        this.hud.setFeedVisible(this.feedVisible);
      },
      onFullscreen: () => {
        try {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else this.root.requestFullscreen?.().catch(() => this.screens.toast('Fullscreen is not available here'));
        } catch {
          /* fullscreen unsupported */
        }
      },
      onAutoContinue: (v) => (this.autoContinue = v),
      onLoadSeed: (code) => {
        const s = codeToSeed(code);
        if (s !== null) void this.startBattle(s);
        else this.screens.toast('Invalid seed');
      },
      onCopyLink: () => {
        const url = `${location.origin}${location.pathname}#seed=${seedToCode(this.seed)}`;
        const code = seedToCode(this.seed);
        try {
          navigator.clipboard.writeText(url).then(() => this.screens.toast('Battle link copied'), () => this.screens.toast(`Seed ${code}`));
        } catch {
          this.screens.toast(`Seed ${code}`);
        }
      },
    });
    this.audio.setMasterVolume(this.volume);
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.last = 0;
    });
    this.resize();
  }

  async start(): Promise<void> {
    this.running = true;
    requestAnimationFrame((t) => this.frame(t));
    await this.screens.showTitle();
    await this.audio.resume();
    const fromHash = codeToSeed((location.hash.match(/seed=([0-9A-Fa-f-]+)/) ?? [])[1] ?? '');
    await this.startBattle(fromHash ?? freshSeed());
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5) * this.renderScale;
    let cw = Math.round(w * this.dpr), ch = Math.round(h * this.dpr);
    // Cap the internal resolution for performance (keeps aspect).
    const maxPixels = 1920 * 1080;
    if (cw * ch > maxPixels) {
      const k = Math.sqrt(maxPixels / (cw * ch));
      cw = Math.round(cw * k);
      ch = Math.round(ch * k);
    }
    this.output.width = cw;
    this.output.height = ch;
    this.output.style.width = `${w}px`;
    this.output.style.height = `${h}px`;
    this.scene.width = cw;
    this.scene.height = ch;
    this.post.resize(cw, ch);
    this.cam.resize(cw, ch);
  }

  private setPaused(p: boolean): void {
    this.paused = p;
  }

  /* ================================================================== */
  /* Battle lifecycle                                                   */
  /* ================================================================== */

  private async rematch(): Promise<void> {
    if (!this.battle) return this.startBattle(freshSeed());
    const defs = this.battle.setup.fighters;
    return this.startBattle(freshSeed(), defs);
  }

  private async startBattle(seed: number, keepFighters?: [FighterDef, FighterDef]): Promise<void> {
    this.battle?.director.dispose();
    this.battle = null;
    this.screens.hideAll();
    this.hud.clearFeed();
    this.vfx.clear();
    this.seed = seed;
    this.battleNumber++;
    try {
      history.replaceState(null, '', `#seed=${seedToCode(seed)}`);
    } catch {
      /* sandboxed iframes may forbid it */
    }
    const setup = createBattle(seed, keepFighters ? { fighters: keepFighters } : undefined);
    const { sim, brains } = createSimulation(setup, { timeline: true });
    const screenSide: [ScreenSide, ScreenSide] = setup.startSide[0] < 0 ? ['left', 'right'] : ['right', 'left'];
    const arena = new ArenaRenderer(setup.arena);
    const views = sim.fighters.map((f) => {
      const anim = new Animator(f.weapon.clipSet, f.weapon.length, f.def.accessory, f.def.styleSeed);
      return { anim, renderer: new FighterRenderer(f, anim), prevX: f.x, prevY: f.y };
    }) as [FighterView, FighterView];
    const director = new Director(sim, this.cam, this.vfx, arena, this.audio, this.hud, this.params, screenSide, brains);
    const battle: Battle = { setup, sim, brains, arena, director, views, screenSide, accum: 0, started: false, finished: false, resultsShown: false };
    this.battle = battle;
    this.cam.snap(0, -320, 0.5);
    this.hud.setVisible(false);
    this.audio.play('ui_vs', { intensity: 1 });
    await this.screens.showVersus(this.versusInfo(setup, screenSide), 5200);
    if (this.battle !== battle) return;
    this.hud.setVisible(this.hudVisible);
    this.hud.setFeedVisible(this.feedVisible);
    director.begin();
    battle.started = true;
  }

  private cardFor(def: FighterDef): FighterCard {
    const pal = ASPECT_PALETTES[def.aspect];
    const w = WEAPONS[def.weapon];
    const p = PERSONALITY_INFO[def.personality];
    return {
      name: def.name, title: def.title, color: pal.primary, colorLight: pal.secondary, aspectName: pal.name, aspectBlurb: pal.blurb,
      weaponName: w.name, weaponBlurb: w.description, personalityName: p.name, personalityBlurb: p.blurb,
      abilities: SLOTS.map((slot) => {
        const ab = ABILITIES[def.abilities[slot]].def;
        return { name: ab.name, slot, description: ab.description ?? '', glyph: ABILITY_GLYPH[def.abilities[slot]] };
      }),
      accessory: def.accessory, weaponId: def.weapon,
    };
  }

  private versusInfo(setup: BattleSetup, screenSide: [ScreenSide, ScreenSide]) {
    const leftIdx = screenSide[0] === 'left' ? 0 : 1;
    const theme = THEMES[setup.arena.theme];
    return {
      left: this.cardFor(setup.fighters[leftIdx]),
      right: this.cardFor(setup.fighters[leftIdx === 0 ? 1 : 0]),
      arenaName: theme.name, arenaSubtitle: theme.subtitle, seedCode: seedToCode(setup.seed), battleNumber: this.battleNumber,
    };
  }

  /* ================================================================== */
  /* Main loop                                                          */
  /* ================================================================== */

  private frame(t: number): void {
    if (!this.running) return;
    requestAnimationFrame((tt) => this.frame(tt));
    const rawDt = this.last === 0 ? 1 / 60 : (t - this.last) / 1000;
    const realDt = clamp(rawDt, 0, 0.05);
    this.last = t;
    this.adaptResolution(rawDt, t);
    const b = this.battle;
    try {
      if (b && b.started) this.tickBattle(b, realDt);
      this.render(realDt);
    } catch (err) {
      console.error(err);
    }
    this.controls.update({
      paused: this.paused, speed: this.speed, muted: this.muted, volume: this.volume, autoContinue: this.autoContinue,
      hudVisible: this.hudVisible, feedVisible: this.feedVisible, seedCode: seedToCode(this.seed),
    });
  }

  private adaptResolution(rawDt: number, t: number): void {
    if (rawDt <= 0 || rawDt > 0.25) return;
    this.frameEma = this.frameEma * 0.95 + rawDt * 1000 * 0.05;
    if (t - this.lastScaleChange < 2500) return;
    let next = this.renderScale;
    if (this.frameEma > 24 && this.renderScale > 0.55) next = Math.max(0.55, this.renderScale * 0.85);
    else if (this.frameEma < 13 && this.renderScale < 1) next = Math.min(1, this.renderScale * 1.1);
    if (next !== this.renderScale) {
      this.renderScale = next;
      this.lastScaleChange = t;
      this.resize();
    }
  }

  private tickBattle(b: Battle, realDt: number): void {
    const sim = b.sim;
    const d = b.director;
    const scale = this.paused ? 0 : d.timeScale * this.speed;
    b.accum += realDt * scale * 60;
    let steps = 0;
    while (b.accum >= 1 && steps < 6 && !sim.over) {
      for (let i = 0; i < 2; i++) {
        b.views[i].prevX = sim.fighters[i].x;
        b.views[i].prevY = sim.fighters[i].y;
      }
      sim.step();
      d.handle(sim.takeEvents());
      b.accum -= 1;
      steps++;
      if (d.timeScale === 0) {
        // Hit-stop began mid-frame: stop stepping.
        b.accum = Math.min(b.accum, 0.999);
        break;
      }
    }
    if (steps >= 6) b.accum = Math.min(b.accum, 1);
    d.update(this.paused ? 0 : realDt, realDt * scale, realDt);
    if (sim.over && !b.finished) {
      b.finished = true;
      d.end();
      window.setTimeout(() => this.showResults(b), 900);
    }
  }

  private render(realDt: number): void {
    const ctx = this.ctx;
    const cam = this.cam;
    const b = this.battle;
    const W = this.scene.width, H = this.scene.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!b) {
      ctx.fillStyle = '#05050a';
      ctx.fillRect(0, 0, W, H);
      cam.update(realDt);
      this.post.render(this.scene, this.params);
      return;
    }
    const sim = b.sim;
    const scale = this.paused ? 0 : b.director.timeScale * this.speed;
    const sdt = realDt * scale;
    const frac = clamp(b.accum, 0, 1);
    const hazards = this.hazardViews(sim);
    b.arena.update(sdt, cam, sim.props, hazards);
    this.vfx.update(sdt, realDt, sim);

    // Fighter animation (interpolated positions).
    for (let i = 0; i < 2; i++) {
      const f = sim.fighters[i];
      const v = b.views[i];
      let rx = lerp(v.prevX, f.x, frac), ry = lerp(v.prevY, f.y, frac);
      if (Math.hypot(f.x - v.prevX, f.y - v.prevY) > 260) {
        rx = f.x;
        ry = f.y;
      }
      const ov = b.director.introOverride(i as Side);
      let override: { clip: string; t: number } | null = null;
      if (ov) {
        rx += ov.dx;
        ry += ov.dy;
        if (ov.clip) override = { clip: ov.clip, t: sim.tick };
      }
      v.anim.update(f, sim, sdt, rx, ry, frac, override);
      if (ov) v.anim.opacity *= ov.opacity;
    }

    // Draw.
    b.arena.drawBackground(ctx, cam);
    b.arena.drawGround(ctx, cam);
    b.arena.drawProps(ctx, cam, sim.props);
    cam.applyTransform(ctx);
    this.vfx.drawBack(ctx, cam, sim);
    cam.applyTransform(ctx);
    for (const v of b.views) v.renderer.drawShadow(ctx, sim.fighters[b.views.indexOf(v)]);
    // Draw the more "active" fighter last so strikes read on top.
    const order = this.drawOrder(sim);
    for (const i of order) b.views[i].renderer.drawGhosts(ctx);
    for (const i of order) b.views[i].renderer.draw(ctx, sim.fighters[i], sim, b.director.timeScale >= 0 ? performance.now() / 1000 : 0);
    cam.applyTransform(ctx);
    this.vfx.drawMid(ctx, cam, sim);
    cam.applyTransform(ctx);
    b.arena.drawHazards(ctx, cam, hazards);
    cam.applyTransform(ctx);
    this.vfx.drawFront(ctx, cam, sim);
    b.arena.drawForeground(ctx, cam);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.vfx.drawScreen(ctx, W, H);
    this.post.render(this.scene, this.params);

    if (b.started) this.hud.update(this.hudState(b));
  }

  private drawOrder(sim: Simulation): [number, number] {
    const [a, c] = sim.fighters;
    const aAct = a.state === 'action' && a.actionPhase !== 'recovery' ? 1 : 0;
    const cAct = c.state === 'action' && c.actionPhase !== 'recovery' ? 1 : 0;
    return aAct > cAct ? [1, 0] : [0, 1];
  }

  private hazardViews(sim: Simulation): HazardView[] {
    const out = this.lastHazards;
    out.length = 0;
    for (const z of sim.zones) {
      if (!z.kind.startsWith('hazard_')) continue;
      out.push({
        id: z.id, kind: z.kind.slice(7) as HazardKind, x: z.x, radius: z.r, warn: clamp(z.age / Math.max(1, z.warn), 0, 1),
        striking: z.age >= z.warn, strikeAge: Math.max(0, z.age - z.warn) / 60,
      });
    }
    return out;
  }

  /* ================================================================== */
  /* HUD                                                                */
  /* ================================================================== */

  private hudFighter(b: Battle, i: Side): HudFighter {
    const f = b.sim.fighters[i];
    const opp = b.sim.opponentOf(f);
    const pal = ASPECT_PALETTES[f.def.aspect];
    const abilities: HudAbility[] = SLOTS.map((slot) => {
      const id = f.def.abilities[slot];
      const def = ABILITIES[id].def;
      const cd = f.cooldowns.get(def.id) ?? 0;
      const total = (def.cooldown ?? 1) * (f.def.aspect === 'chrono' ? 0.85 : 1);
      return { name: def.name, slot, cooldown: clamp(cd / Math.max(1, total), 0, 1), ready: cd <= 0 && f.canAfford(def), glyph: ABILITY_GLYPH[id] };
    });
    return {
      name: f.name, title: f.def.title, color: pal.primary, colorLight: pal.secondary, aspectName: pal.name,
      weaponName: f.weapon.name, personalityName: PERSONALITY_INFO[f.def.personality].name,
      hp: Math.max(0, f.hp), maxHp: f.maxHp, energy: f.energy, maxEnergy: C.ENERGY, guard: f.guard, maxGuard: C.GUARD,
      wrath: f.wrath, maxWrath: C.WRATH, abilities, status: this.statusTags(f), intent: b.director.intentLabel(i),
      combo: opp.comboHits >= 2 ? opp.comboHits : 0, comboDamage: opp.comboDamage,
      ultimateReady: f.wrath >= C.WRATH, lastStandAvailable: !f.lastStandUsed,
    };
  }

  private statusTags(f: Fighter): string[] {
    const t: string[] = [];
    if (f.hasBuff('ascended')) t.push('ASCENDED');
    if (f.hasBuff('lastStand')) t.push('LAST STAND');
    if (f.hasBuff('burn')) t.push('BURNING');
    if (f.hasBuff('chill')) t.push('CHILLED');
    if (f.hasBuff('shield')) t.push('AEGIS');
    if (f.hasBuff('reflect')) t.push('WARD');
    if (f.hasBuff('counter')) t.push('COUNTER');
    if (f.hasBuff('phase')) t.push('PHASED');
    if (f.hasBuff('blind')) t.push('BLINDED');
    if (f.hasBuff('empowered')) t.push('EMPOWERED');
    if (f.state === 'bound') t.push('BOUND');
    if (f.state === 'guardbreak') t.push('GUARD BROKEN');
    if (f.timeFrozen) t.push('FROZEN IN TIME');
    if (f.state === 'charge') t.push('CHARGING');
    return t;
  }

  private hudState(b: Battle) {
    const leftIdx: Side = b.screenSide[0] === 'left' ? 0 : 1;
    const rightIdx: Side = leftIdx === 0 ? 1 : 0;
    const sim = b.sim;
    const phaseLabel: Record<string, string> = { intro: 'PREPARE', opening: 'OPENING', escalation: 'ESCALATION', climax: 'CLIMAX', collapse: 'DIVINE COLLAPSE', judgment: 'JUDGMENT', finale: 'FINALE', over: 'FINALE' };
    const p0 = sim.winProb0;
    return {
      left: this.hudFighter(b, leftIdx),
      right: this.hudFighter(b, rightIdx),
      time: sim.time,
      phase: sim.decided ? 'FINALE' : phaseLabel[sim.phase] ?? sim.phase.toUpperCase(),
      winProbLeft: leftIdx === 0 ? p0 : 1 - p0,
      seedCode: seedToCode(b.setup.seed),
      arenaName: THEMES[b.setup.arena.theme].name,
      paused: this.paused,
      speed: this.speed,
    };
  }

  /* ================================================================== */
  /* Debug helpers (console: godline.debugUntil('seq:bladeLock'))        */
  /* ================================================================== */

  /** Fast-forward the current battle until an event matches (e.g. 'ko', 'seq:blitz', 'ultimate'). */
  debugUntil(match: string, maxTicks = 60 * 200): boolean {
    const b = this.battle;
    if (!b || !b.started) return false;
    for (let i = 0; i < maxTicks && !b.sim.over; i++) {
      for (let k = 0; k < 2; k++) {
        b.views[k].prevX = b.sim.fighters[k].x;
        b.views[k].prevY = b.sim.fighters[k].y;
      }
      b.sim.step();
      const evs = b.sim.takeEvents();
      if (evs.some((e) => e.type === match || (e.type === 'seq' && `seq:${e.kind}` === match) || (e.type === 'seq' && `seq:${e.kind}:${e.beat}` === match))) {
        b.director.handle(evs);
        return true;
      }
    }
    return false;
  }

  debugSkip(ticks: number): void {
    const b = this.battle;
    if (!b) return;
    for (let i = 0; i < ticks && !b.sim.over; i++) {
      b.sim.step();
      b.sim.takeEvents();
    }
  }

  /* ================================================================== */
  /* Results                                                            */
  /* ================================================================== */

  private showResults(b: Battle): void {
    if (this.battle !== b || b.resultsShown) return;
    b.resultsShown = true;
    const sim = b.sim;
    const w = sim.winner as Side;
    const l: Side = w === 0 ? 1 : 0;
    const leftIdx: Side = b.screenSide[0] === 'left' ? 0 : 1;
    const rightIdx: Side = leftIdx === 0 ? 1 : 0;
    const L = sim.fighters[leftIdx].stats, R = sim.fighters[rightIdx].stats;
    const n = (v: number) => Math.round(v).toString();
    const stats: [string, string, string][] = [
      ['Damage dealt', n(L.damageDealt), n(R.damageDealt)],
      ['Hits landed', n(L.hitsLanded), n(R.hitsLanded)],
      ['Longest combo', n(L.longestCombo), n(R.longestCombo)],
      ['Biggest combo', n(L.biggestCombo), n(R.biggestCombo)],
      ['Blocks', n(L.blocks), n(R.blocks)],
      ['Parries (perfect)', `${L.parries} (${L.perfectParries})`, `${R.parries} (${R.perfectParries})`],
      ['Dodges', n(L.dodges), n(R.dodges)],
      ['Reads', n(L.reads), n(R.reads)],
      ['Whiff punishes', n(L.whiffPunishes), n(R.whiffPunishes)],
      ['Clashes won', n(L.clashesWon), n(R.clashesWon)],
      ['Guard breaks', n(L.guardBreaks), n(R.guardBreaks)],
      ['Teleports', n(L.teleports), n(R.teleports)],
      ['Abilities used', n(L.abilitiesUsed), n(R.abilitiesUsed)],
      ['Ultimates', n(L.ultimatesUsed), n(R.ultimatesUsed)],
      ['Healing', n(L.healing), n(R.healing)],
      ['Lowest HP', n(L.lowestHp), n(R.lowestHp)],
    ];
    const timeline = sim.timeline.map((p) => ({ t: p.t, p: leftIdx === 0 ? p.p0 : 1 - p.p0 }));
    if (timeline.length === 0 || timeline[0].t > 0.5) timeline.unshift({ t: 0, p: 0.5 });
    timeline.push({ t: sim.koTick > 0 ? Math.max(0, sim.koTick - sim.introTicks) / 60 : sim.time, p: w === leftIdx ? 1 : 0 });
    const moments = b.director.moments.map((m) => ({ t: m.t, text: m.text, side: m.side === undefined ? undefined : b.screenSide[m.side] }));
    const Wf = sim.fighters[w], Lf = sim.fighters[l];
    const dur = Math.max(0, sim.koTick - sim.introTicks) / 60;
    let headline: string;
    if (Wf.stats.minWinProb < 0.25) headline = `Comeback! ${Wf.name} won from ${Math.round(Wf.stats.minWinProb * 100)}% win probability.`;
    else if (Wf.hp < Wf.maxHp * 0.15 || Wf.stats.lowestHp < 80) headline = `A razor-thin victory — ${Wf.name} survived on the brink.`;
    else if (Wf.stats.lowestHp > Wf.maxHp * 0.75) headline = `Dominant. ${Wf.name} barely took a scratch.`;
    else headline = `${Wf.name} outfought ${Lf.name} in ${dur.toFixed(0)} seconds.`;
    const summary: ResultsSummary = {
      winnerSide: b.screenSide[w], winner: this.cardFor(Wf.def), loser: this.cardFor(Lf.def), finisherName: sim.finisherName || 'Decisive Blow',
      methodLabel: METHOD_LABEL[sim.winMethod ?? 'combo'], durationSec: dur, stats, timeline, moments, headline,
      seedCode: seedToCode(b.setup.seed), arenaName: THEMES[b.setup.arena.theme].name,
    };
    this.screens.showResults(summary, {
      onNext: () => void this.startBattle(freshSeed()),
      onReplay: () => void this.startBattle(b.setup.seed),
      onRematch: () => void this.rematch(),
    }, this.autoContinue ? 14 : null);
  }
}
