import { ASPECT_PALETTES, hexToRgb } from '../core/ids';
import { clamp, damp, lerp } from '../core/math';
import { Rng } from '../core/rng';
import type { IAudioEngine, LoopHandle, LoopId, SfxId, SfxParams } from '../audio/types';
import type { PostFXParams } from '../render/postfx/types';
import type { Camera } from '../render/Camera';
import type { IArenaRenderer } from '../render/types';
import type { IVfx, ShatterStyle } from '../render/vfx/types';
import type { IHud, ScreenSide } from '../ui/types';
import type { SimEvent } from '../sim/events';
import type { Simulation } from '../sim/simulation';
import type { Side, ZoneKind } from '../sim/types';
import type { Brain } from '../ai/brain';
import { PLAN_NAMES, type PlanKind } from '../ai/context';
import { THEMES } from '../sim/arena';
import { C } from '../sim/constants';
import { Narrator } from './narrator';

/**
 * The cinematic director. It watches the simulation's event stream and turns it into
 * presentation: camera framing and dramatic focus, hit-stop and slow-motion, impact frames,
 * shockwave distortion, colour grading, VFX, procedural audio and adaptive music, HUD callouts
 * and the narrated story of the fight. It never influences the outcome.
 */

interface TimeFx {
  scale: number;
  t: number;
  hold: number;
  ramp: number;
}

interface Wave {
  x: number;
  y: number;
  t: number;
  dur: number;
  r: number;
  strength: number;
}

interface Focus {
  x: number;
  y: number;
  zoom: number;
  until: number;
  priority: number;
  rot: number;
}

export interface Moment {
  t: number;
  text: string;
  side?: Side;
}

export type IntroVariant = 'standoff' | 'descent' | 'walkin' | 'powerup' | 'teleport';

export interface IntroOverride {
  dx: number;
  dy: number;
  clip: string | null;
  opacity: number;
}

const LEVEL_HITSTOP = [0, 0.03, 0.055, 0.085, 0.13];

export class Director {
  readonly rng: Rng;
  readonly narrator: Narrator;
  readonly moments: Moment[] = [];
  readonly introVariant: IntroVariant;
  private now = 0;
  private timeFx: TimeFx[] = [];
  private waves: Wave[] = [];
  private focus: Focus | null = null;
  private letterbox = 0;
  private letterboxTarget = 0;
  private letterboxUntil = 0;
  private flash = 0;
  private flashColor: [number, number, number] = [1, 1, 1];
  private chroma = 0;
  private impactT = 0;
  private impactMode: 0 | 1 | 2 = 1;
  private impactTint: [number, number, number] = [1, 1, 1];
  private desat = 0;
  private desatTarget = 0;
  private darken = 0;
  private darkenUntil = 0;
  private radial = 0;
  private radialCenter: [number, number] = [0.5, 0.5];
  private bloomBoost = 0;
  private redPulse = 0;
  private loops = new Map<LoopId, LoopHandle>();
  private tension = 0.2;
  private actionHeat = 0;
  private lastFeedT = -99;
  private comboTrack: [{ max: number; dmg: number }, { max: number; dmg: number }] = [{ max: 0, dmg: 0 }, { max: 0, dmg: 0 }];
  private nearDeath: [boolean, boolean] = [false, false];
  private leader: Side | null = null;
  private lastLeadT = -99;
  private firstBlood = false;
  private struggleKind: string | null = null;
  private struggleV = 0;
  private struggleUntil = 0;
  private whipUntil = 0;
  private koTime = -1;
  private sideColor: [string, string];
  private sideLight: [string, string];
  private victoryPushed = false;
  private introCalloutDone = false;
  private sfxMuted = false;
  /** Bright arenas need a higher bloom threshold to stay readable. */
  private bright: boolean;

  constructor(
    private sim: Simulation,
    private cam: Camera,
    private vfx: IVfx,
    private arena: IArenaRenderer,
    private audio: IAudioEngine,
    private hud: IHud,
    private post: PostFXParams,
    private screenSide: [ScreenSide, ScreenSide],
    private brains: [Brain, Brain],
  ) {
    this.rng = new Rng((sim.setup.seed ^ 0x5eed) >>> 0);
    this.narrator = new Narrator(this.rng.fork('narration'), [sim.fighters[0].name, sim.fighters[1].name], THEMES[sim.arena.theme].name);
    this.introVariant = this.rng.pick(['standoff', 'descent', 'walkin', 'powerup', 'teleport'] as IntroVariant[]);
    this.sideColor = [ASPECT_PALETTES[sim.fighters[0].def.aspect].primary, ASPECT_PALETTES[sim.fighters[1].def.aspect].primary];
    this.sideLight = [ASPECT_PALETTES[sim.fighters[0].def.aspect].secondary, ASPECT_PALETTES[sim.fighters[1].def.aspect].secondary];
    this.bright = sim.arena.theme === 'celestial' || sim.arena.theme === 'sanctum' || sim.arena.theme === 'frostveil';
  }

  /* ================================================================== */
  /* Lifecycle                                                          */
  /* ================================================================== */

  begin(): void {
    const theme = THEMES[this.sim.arena.theme];
    this.audio.startMusic(this.sim.setup.seed, theme.musicMood);
    this.audio.setMusicIntensity(0.15);
    if (theme.ambientLoop) this.loop(theme.ambientLoop, { volume: 0.5 });
    const fl = this.narrator.line('opening', 0);
    if (fl) this.feed(fl, undefined, false);
    // Start wide for the intro.
    this.cam.snap(0, -320, 0.5);
    this.letterboxTarget = 1;
  }

  /** Called when the simulation has finished the whole battle. */
  end(): void {
    this.stopLoops(1.2);
  }

  dispose(): void {
    this.stopLoops(0.3);
    this.audio.stopMusic(0.8);
  }

  get timeScale(): number {
    let s = 1;
    for (const f of this.timeFx) {
      let v: number;
      if (f.t < f.hold) v = f.scale;
      else {
        const k = clamp((f.t - f.hold) / Math.max(0.001, f.ramp), 0, 1);
        v = lerp(f.scale, 1, k * k);
      }
      if (v < s) s = v;
    }
    return s;
  }

  hitStop(seconds: number): void {
    this.timeFx.push({ scale: 0, t: 0, hold: seconds, ramp: 0 });
  }

  slowmo(scale: number, hold: number, ramp = 0.25): void {
    this.timeFx.push({ scale, t: 0, hold, ramp });
  }

  /* ================================================================== */
  /* Intro choreography (presentation only)                             */
  /* ================================================================== */

  introOverride(side: Side): IntroOverride | null {
    const sim = this.sim;
    if (!sim.inIntro) return null;
    const t = sim.tick;
    const dirOut = sim.setup.startSide[side];
    const stagger = side === 0 ? 0 : 14;
    switch (this.introVariant) {
      case 'descent': {
        const t0 = 18 + stagger, t1 = t0 + 34;
        if (t < t0) return { dx: 0, dy: -1400, clip: 'blitz.vanish', opacity: 0 };
        if (t < t1) {
          const k = (t - t0) / (t1 - t0);
          return { dx: 0, dy: -1000 * (1 - k * k), clip: 'fin.slamDown', opacity: 1 };
        }
        if (t < t1 + 26) return { dx: 0, dy: 0, clip: 'fin.landCrouch', opacity: 1 };
        return { dx: 0, dy: 0, clip: null, opacity: 1 };
      }
      case 'walkin': {
        const k = clamp(t / 110, 0, 1);
        return { dx: dirOut * 420 * (1 - k), dy: 0, clip: k < 1 ? 'fin.walk' : null, opacity: 1 };
      }
      case 'powerup':
        if (t > 26 && t < 140) return { dx: 0, dy: 0, clip: 'final.charge', opacity: 1 };
        return { dx: 0, dy: 0, clip: null, opacity: 1 };
      case 'teleport': {
        const t0 = 40 + stagger * 2;
        if (t < t0) return { dx: 0, dy: 0, clip: 'appear', opacity: 0 };
        return { dx: 0, dy: 0, clip: t < t0 + 10 ? 'appear' : null, opacity: 1 };
      }
      default:
        return null;
    }
  }

  private updateIntro(): void {
    const sim = this.sim;
    if (!sim.inIntro) return;
    const t = sim.tick;
    const [a, b] = sim.fighters;
    // Camera: alternate close-ups, then frame both.
    if (t < 60) this.setFocus(a.x, -110, 1.35, 0.1, 5);
    else if (t < 115) this.setFocus(b.x, -110, 1.35, 0.1, 5);
    else this.focus = null;
    switch (this.introVariant) {
      case 'descent':
        for (const f of sim.fighters) {
          const land = 18 + (f.side === 0 ? 0 : 14) + 34;
          if (t === land) {
            this.vfx.dust(f.x, 0, 30);
            this.vfx.debris(f.x, -10, 14, '#6b6470', 1);
            this.vfx.shockRing(f.x, -10, 220, this.sideColor[f.side], 6);
            this.arena.addCrater(f.x, 80);
            this.wave(f.x, -40, 260, 0.06, 0.6);
            this.cam.addTrauma(0.5);
            this.sfx('land_heavy', { intensity: 1, pan: this.pan(f.x) });
          }
        }
        break;
      case 'powerup':
        if (t > 26 && t < 140) {
          for (const f of sim.fighters) {
            this.vfx.aura(f.x, f.y - 60, this.sideColor[f.side], 1);
            if (t % 3 === 0) this.vfx.chargeMotes(f.x, f.y - 60, this.sideColor[f.side], 1);
          }
          if (t === 30) this.loop('charge', { intensity: 0.8 });
          if (t % 20 === 0) this.cam.addTrauma(0.12);
        }
        if (t === 140) {
          this.stopLoop('charge');
          for (const f of sim.fighters) this.vfx.auraBurst(f.x, f.y - 60, this.sideColor[f.side], 1);
          this.sfx('aura_flare', { intensity: 1 });
          this.cam.addTrauma(0.4);
          this.flashOn([1, 1, 1], 0.4);
        }
        break;
      case 'teleport':
        for (const f of sim.fighters) {
          const t0 = 40 + (f.side === 0 ? 0 : 28);
          if (t === t0) {
            this.vfx.teleportFlash(f.x, f.y - 60, this.sideColor[f.side], false);
            this.sfx('teleport_in', { pan: this.pan(f.x) });
            this.wave(f.x, -60, 160, 0.04, 0.4);
          }
        }
        break;
      case 'walkin':
        if (t % 30 === 0 && t < 110) this.sfx('footstep', { volume: 0.5 });
        break;
      default:
        break;
    }
    if (t === sim.introTicks - 16 && !this.introCalloutDone) {
      this.introCalloutDone = true;
      this.hud.callout('FIGHT', { size: 'xl', side: 'center', color: '#ffffff', duration: 1.1 });
      this.sfx('ui_fight', { intensity: 1 });
      this.flashOn([1, 1, 1], 0.35);
      this.cam.addTrauma(0.3);
      const l = this.narrator.line('fight', 0);
      if (l) this.feed(l);
      this.letterboxTarget = 0;
    }
  }

  /* ================================================================== */
  /* Event handling                                                     */
  /* ================================================================== */

  handle(events: SimEvent[]): void {
    for (const e of events) {
      try {
        this.onEvent(e);
      } catch (err) {
        // Presentation must never break the battle.
        console.error('director event error', e.type, err);
      }
    }
  }

  private onEvent(e: SimEvent): void {
    const sim = this.sim;
    const F = sim.fighters;
    switch (e.type) {
      case 'actionStart': {
        if (e.abilityId) {
          const def = F[e.side].actions.get(e.id);
          if (def?.slot === 'ultimate') return; // handled by 'ultimate'
          this.sfx(abilitySfx(e.abilityId), { aspect: F[e.side].def.aspect, pan: this.pan(e.x), intensity: 0.6 });
        }
        break;
      }
      case 'swing':
        this.sfx(e.level >= 3 ? 'whoosh_heavy' : e.blade ? 'whoosh_blade' : 'whoosh_light', { pan: this.pan(e.x), intensity: e.level / 4, volume: 0.7 });
        break;
      case 'hit':
        this.onHit(e);
        break;
      case 'block': {
        const col = this.sideColor[e.defender];
        this.vfx.blockSpark(e.x, e.y, F[e.attacker].x < e.x ? 1 : -1, col, e.level >= 3);
        this.sfx(e.level >= 3 ? 'shield_hit' : 'block', { pan: this.pan(e.x), intensity: e.level / 4 });
        this.cam.addTrauma(0.04 * e.level);
        if (e.level >= 3) this.hitStop(0.05);
        this.actionHeat += 0.3;
        break;
      }
      case 'guardBreak': {
        this.vfx.guardShatter(e.x, e.y, this.sideColor[e.defender]);
        this.sfx('guard_break', { pan: this.pan(e.x), intensity: 1 });
        this.callout('GUARD BREAK', e.attacker, 'lg');
        this.slowmo(0.3, 0.35, 0.3);
        this.impact(0, e.attacker);
        this.wave(e.x, e.y, 220, 0.07, 0.5);
        this.cam.addTrauma(0.35);
        this.setFocus(e.x, e.y, 1.5, 0.6, 3);
        this.feedKey('guardBreak', e.attacker);
        this.moment(`${F[e.attacker].name} shatters ${F[e.defender].name}'s guard`, e.attacker);
        break;
      }
      case 'parry': {
        const col = this.sideColor[e.parrier];
        this.vfx.parryFlash(e.x, e.y, e.perfect, col);
        this.sfx(e.perfect ? 'perfect_parry' : 'parry', { pan: this.pan(e.x), intensity: e.perfect ? 1 : 0.6 });
        this.hitStop(e.perfect ? 0.11 : 0.06);
        if (e.perfect) {
          this.callout('PERFECT PARRY', e.parrier, 'lg');
          this.slowmo(0.25, 0.32, 0.35);
          this.desatPulse(0.6);
          this.setFocus(e.x, e.y, 1.55, 0.55, 3);
          this.cam.punchZoom(0.12);
          this.wave(e.x, e.y, 180, 0.05, 0.4);
          this.feedKey('perfectParry', e.parrier);
          this.moment(`${F[e.parrier].name} perfectly parries`, e.parrier);
        } else {
          this.callout('PARRY', e.parrier, 'sm');
          this.cam.punchZoom(0.05);
        }
        break;
      }
      case 'clash': {
        const [ca, cb] = [this.sideColor[e.a], this.sideColor[e.b]];
        this.vfx.clashBurst(e.x, e.y, e.heavy, ca, cb);
        this.sfx(e.heavy ? 'clash_heavy' : 'clash', { pan: this.pan(e.x), intensity: e.heavy ? 1 : 0.6 });
        this.hitStop(e.heavy ? 0.12 : 0.06);
        this.wave(e.x, e.y, e.heavy ? 320 : 160, e.heavy ? 0.1 : 0.05, 0.5);
        this.cam.addTrauma(e.heavy ? 0.45 : 0.18);
        this.cam.punchZoom(e.heavy ? 0.14 : 0.06);
        if (e.heavy) {
          this.impact(this.rng.chance(0.5) ? 1 : 2, e.a);
          this.callout('CLASH', null, 'lg');
          this.audio.musicStinger('clash');
          this.chroma = Math.max(this.chroma, 0.5);
        }
        this.actionHeat += 1;
        break;
      }
      case 'dodge':
        if (e.perfect) {
          this.slowmo(0.35, 0.18, 0.25);
          this.sfx('whoosh_light', { pan: this.pan(e.x), pitch: 1.3 });
        }
        break;
      case 'vanish':
        this.vfx.teleportFlash(e.x, e.y - 60, this.sideColor[e.side], true);
        this.sfx('teleport_out', { pan: this.pan(e.x) });
        this.radialPulse(e.x, e.y - 60, 0.25);
        break;
      case 'appear':
        this.vfx.teleportFlash(e.x, e.y - 60, this.sideColor[e.side], false);
        this.sfx('teleport_in', { pan: this.pan(e.x) });
        break;
      case 'dash':
        if (!e.air) this.vfx.dust(e.x, 0, 3, -e.dir);
        this.vfx.dashLines(e.x, e.y - 60, e.dir, this.sideColor[e.side]);
        this.sfx('dash', { pan: this.pan(e.x), volume: 0.6 });
        break;
      case 'jump':
        if (!e.double) this.vfx.dust(e.x, 0, 3);
        this.sfx('jump', { pan: this.pan(e.x), volume: 0.5 });
        break;
      case 'land':
        this.vfx.dust(e.x, 0, e.heavy ? 8 : 2);
        this.sfx(e.heavy ? 'land_heavy' : 'land', { pan: this.pan(e.x), volume: e.heavy ? 1 : 0.4 });
        if (e.heavy) this.cam.addTrauma(0.15);
        break;
      case 'launch':
        this.sfx('whoosh_heavy', { pan: this.pan(e.x), intensity: 0.7 });
        break;
      case 'wallSplat':
        this.vfx.debris(e.x, e.y, 12, '#5d5560', 1);
        this.vfx.shockRing(e.x, e.y, 120, '#ffffff', 4);
        this.wave(e.x, e.y, 200, 0.06, 0.45);
        this.sfx('wall_splat', { pan: this.pan(e.x), intensity: 1 });
        this.cam.addTrauma(0.35);
        this.hitStop(0.07);
        break;
      case 'groundBounce':
        this.vfx.dust(e.x, 0, 7);
        this.vfx.debris(e.x, -5, 6, '#5d5560', 0.8);
        this.sfx('land_heavy', { pan: this.pan(e.x), intensity: 0.8 });
        this.cam.addTrauma(0.25);
        break;
      case 'knockdown':
        this.vfx.dust(e.x, 0, 4);
        this.sfx('land', { pan: this.pan(e.x), volume: 0.6 });
        break;
      case 'tech':
        this.sfx('whoosh_light', { pan: this.pan(e.x), volume: 0.5 });
        break;
      case 'projectile':
        if (e.style !== 'blade' || e.source !== 'ab.bladeStorm') this.sfx(e.style === 'shockwave' ? 'earth_rumble' : 'projectile_fire', { aspect: e.aspect, pan: this.pan(e.x), volume: 0.55 });
        else this.sfx('blade_summon', { pan: this.pan(e.x), volume: 0.5 });
        break;
      case 'projectileHit':
        this.vfx.elementBurst(e.x, e.y, e.aspect, 0.5);
        this.sfx('projectile_hit', { aspect: e.aspect, pan: this.pan(e.x), volume: 0.6 });
        break;
      case 'projectileClash':
        this.vfx.elementalClash(e.x, e.y, e.aspectA, e.aspectB);
        this.sfx('explosion_small', { pan: this.pan(e.x), intensity: 0.5 });
        this.wave(e.x, e.y, 120, 0.04, 0.35);
        break;
      case 'projectileCut':
        this.vfx.slashLine(e.x, e.y, this.rng.range(-0.5, 0.5), 140, '#ffffff', 2);
        this.vfx.elementBurst(e.x, e.y, e.aspect, 0.6);
        this.sfx('slash_hit', { pan: this.pan(e.x), volume: 0.7 });
        this.hitStop(0.03);
        break;
      case 'reflect':
        this.vfx.parryFlash(e.x, e.y, true, this.sideColor[e.side]);
        this.sfx('reflect', { pan: this.pan(e.x) });
        this.callout('REFLECT', e.side, 'md');
        break;
      case 'explosion':
        this.onExplosion(e.x, e.y, e.r, e.aspect, e.power);
        break;
      case 'beamStart':
        this.sfx('beam_fire', { aspect: e.aspect, intensity: 1 });
        this.loop('beam', { aspect: e.aspect, intensity: 0.8 });
        this.arena.lightFlash(ASPECT_PALETTES[e.aspect].primary, 0.8, F[e.side].x);
        this.cam.addTrauma(0.3);
        this.bloomBoost = Math.max(this.bloomBoost, 0.25);
        break;
      case 'beamEnd':
        if (!sim.beams.some((b) => !b.dead && b.id !== e.id)) this.stopLoop('beam');
        break;
      case 'charge':
        if (e.on) this.loop('charge', { aspect: F[e.side].def.aspect, intensity: 0.5 });
        else if (!sim.fighters.some((f) => f.state === 'charge')) this.stopLoop('charge');
        break;
      case 'zoneWarn':
        this.onZoneWarn(e.kind, e.x, e.owner);
        break;
      case 'zoneStrike':
        this.onZoneStrike(e.kind, e.x, e.y, e.r, e.owner);
        break;
      case 'buff':
        if (e.on && e.id === 'shield') this.sfx('shield_up', { pan: this.pan(F[e.side].x) });
        if (!e.on && e.id === 'shield') this.sfx('shield_break', { pan: this.pan(F[e.side].x) });
        if (e.on && e.id === 'reflect') this.sfx('reflect', { pan: this.pan(F[e.side].x), volume: 0.6 });
        if (e.on && e.id === 'phase') this.sfx('void_pulse', { pan: this.pan(F[e.side].x), volume: 0.6 });
        break;
      case 'timeStop': {
        const f = F[e.side];
        if (e.on) {
          this.sfx('time_stop', { intensity: 1 });
          this.loop('timestop', { intensity: 0.8 });
          this.desatTarget = 0.82;
          this.arena.setTimeStop(true);
          this.vfx.timeStop(f.x, f.y - 60, this.sideColor[e.side], true);
          this.callout('TIME STOP', e.side, 'lg');
          this.audio.duckMusic(0.7, 1.4);
          this.impact(0, e.side);
          this.feedKey('timeStop', e.side);
          this.moment(`${f.name} stops time`, e.side);
        } else {
          this.sfx('time_resume', { intensity: 1 });
          this.stopLoop('timestop');
          this.desatTarget = 0;
          this.arena.setTimeStop(false);
          this.vfx.timeStop(f.x, f.y - 60, this.sideColor[e.side], false);
          this.wave(f.x, f.y - 60, 600, 0.06, 0.7);
        }
        break;
      }
      case 'rewind':
        this.vfx.rewindTrail(e.fromX, e.fromY - 60, e.toX, e.toY - 60, this.sideColor[e.side]);
        this.sfx('rewind', { pan: this.pan(e.toX) });
        this.desatPulse(0.5);
        this.feedKey('rewind', e.side);
        break;
      case 'heal':
        this.vfx.healGlow(F[e.side].x, F[e.side].y - 60, this.sideColor[e.side]);
        this.sfx('heal', { pan: this.pan(F[e.side].x) });
        this.feedKey('heal', e.side);
        break;
      case 'burst': {
        this.vfx.auraBurst(e.x, e.y, this.sideColor[e.side], 1);
        this.vfx.shockRing(e.x, e.y, 260, this.sideColor[e.side], 8);
        this.wave(e.x, e.y, 300, 0.08, 0.5);
        this.sfx('burst', { aspect: F[e.side].def.aspect, pan: this.pan(e.x), intensity: 1 });
        this.cam.addTrauma(0.3);
        this.hitStop(0.06);
        this.callout('BURST', e.side, 'md');
        if (this.rng.chance(0.5)) this.feedKey('burst', e.side);
        break;
      }
      case 'propHit': {
        const p = sim.props.find((pp) => pp.def.id === e.propId);
        if (p) this.arena.onPropHit(p, e.x, e.y, e.power);
        if (e.power > 20) this.sfx('debris', { pan: this.pan(e.x), volume: 0.5 });
        break;
      }
      case 'propBreak': {
        const p = sim.props.find((pp) => pp.def.id === e.propId);
        if (p) this.arena.onPropDestroyed(p, e.dir);
        this.sfx('pillar_break', { pan: this.pan(e.x), intensity: 1 });
        this.cam.addTrauma(0.4);
        this.vfx.debris(e.x, -120, 16, '#7a7280', 1.2);
        this.vfx.dust(e.x, 0, 24);
        break;
      }
      case 'crater':
        this.arena.addCrater(e.x, e.r);
        this.arena.addCrack(e.x, e.r * 1.6);
        this.vfx.debris(e.x, -5, Math.round(e.r / 8), '#5d5560', 1);
        this.sfx('rumble', { pan: this.pan(e.x), intensity: clamp(e.r / 200, 0.3, 1) });
        break;
      case 'seq':
        this.onSeq(e);
        break;
      case 'lastStand': {
        const f = F[e.side];
        this.callout('LAST STAND', e.side, 'xl', 'refuses to fall');
        this.sfx('last_stand', { intensity: 1 });
        this.audio.musicStinger('laststand');
        this.desatTarget = 0.7;
        this.darkenFor(0.8, 1.4);
        this.slowmo(0.2, 0.9, 0.5);
        this.setFocus(f.x, f.y - 70, 1.6, 1.4, 6);
        this.letterboxFor(1.6);
        this.feedKey('lastStand', e.side, true);
        this.moment(`${f.name} refuses to fall — LAST STAND`, e.side);
        break;
      }
      case 'ultimate': {
        const f = F[e.side];
        this.hud.ultimateCutIn(this.screenSide[e.side], f.name, e.name, this.sideColor[e.side]);
        this.sfx('ultimate_cutin', { aspect: f.def.aspect, intensity: 1 });
        this.audio.musicStinger('ultimate');
        this.slowmo(0.25, 0.55, 0.35);
        this.darkenFor(0.7, 1.2);
        this.setFocus(f.x, f.y - 70, 1.5, 0.9, 5);
        this.letterboxFor(1.4);
        this.feedKey('ultimate', e.side, true, { ult: e.name });
        this.moment(`${f.name} unleashes ${e.name}`, e.side);
        break;
      }
      case 'transform':
        if (e.on) this.loop('aura', { aspect: F[e.side].def.aspect, intensity: 0.7 });
        else if (!F.some((f) => f.hasBuff('ascended'))) this.stopLoop('aura');
        break;
      case 'ko':
        this.onKO(e.winner, e.loser, e.x, e.y);
        break;
      case 'finisher':
        this.hud.finisherTitle(e.name, this.sideColor[e.winner]);
        break;
      case 'phase':
        this.onPhase(e.phase);
        break;
      case 'intent': {
        const reason = e.reason.startsWith('failed:') ? 'failed' : e.reason.startsWith('winning:') ? 'winning' : e.reason;
        const prev = e.reason.includes(':') ? this.narrator.planName(e.reason.split(':')[1]) : '';
        const key = `intent:${reason}`;
        const line = this.narrator.line(key, e.side, { plan: this.narrator.planName(e.intent), prev });
        if (line && this.now - this.lastFeedT > 2.5) this.feed(line, e.side);
        break;
      }
      case 'read': {
        this.callout('READ', e.side, 'md', readSub(e.what));
        this.feedKey(`read:${e.what}`, e.side);
        if (e.what === 'teleport') this.moment(`${F[e.side].name} reads the teleport`, e.side);
        break;
      }
      case 'whiffPunish':
        if (this.rng.chance(0.35)) this.callout('PUNISH', e.side, 'sm');
        break;
      case 'victory':
        this.onVictory(e.winner);
        break;
      case 'hazard':
        this.sfx('rumble', { volume: 0.5 });
        if (this.rng.chance(0.25)) this.feedKey('hazard', null);
        break;
      case 'stun':
        if (e.what === 'bind') this.callout('BOUND', e.side === 0 ? 1 : 0, 'sm');
        break;
      case 'decoy':
        if (e.fooled) {
          this.feedKey('deceived', e.side);
          this.callout('DECEIVED', e.side, 'sm');
        }
        break;
      default:
        break;
    }
  }

  private onHit(e: Extract<SimEvent, { type: 'hit' }>): void {
    const sim = this.sim;
    const att = sim.fighters[e.attacker];
    const col = this.sideColor[e.attacker];
    const lvl = e.lethal ? 4 : e.level;
    const cut = e.tag === 'cut' || att.weapon.blade;
    this.vfx.hitSpark(e.x, e.y, e.dirX, lvl, col, { cut: e.tag === 'cut' || (cut && lvl >= 2), counter: e.counter });
    if (e.damage >= 6) this.vfx.damageNumber(e.x, e.y - 30, e.damage, e.counter ? '#ffd76a' : '#ffffff', e.damage >= 70);
    if (e.source.startsWith('ab.') || e.source === 'kiblast') this.vfx.elementBurst(e.x, e.y, e.aspect, lvl / 4);
    const sfx: SfxId = e.counter ? 'hit_crit' : cut && lvl <= 2 ? 'slash_hit' : lvl >= 4 ? 'hit_crit' : lvl === 3 ? 'hit_heavy' : lvl === 2 ? 'hit_medium' : 'hit_light';
    this.sfx(sfx, { pan: this.pan(e.x), intensity: lvl / 4 });
    this.hitStop(LEVEL_HITSTOP[lvl] + (e.counter ? 0.04 : 0));
    this.cam.addTrauma(0.03 * lvl * lvl);
    this.cam.kick(e.dirX * lvl * 2.5, -lvl);
    this.actionHeat += 0.4 * lvl;
    if (lvl >= 3) {
      this.cam.punchZoom(0.04 * lvl);
      this.wave(e.x, e.y, 90 * lvl, 0.025 * lvl, 0.4);
      this.chroma = Math.max(this.chroma, 0.12 * lvl);
      this.bloomBoost = Math.max(this.bloomBoost, 0.25);
    }
    if (lvl >= 4 || (e.counter && lvl >= 3)) this.impact(this.rng.chance(0.6) ? 1 : 0, e.attacker);
    if (e.counter) {
      this.callout('COUNTER', e.attacker, 'md');
      this.slowmo(0.4, 0.12, 0.2);
    }
    if (e.launch && lvl >= 2) this.vfx.focusLines(this.cam.worldToScreen(e.x, e.y).x, this.cam.worldToScreen(e.x, e.y).y, 0.5, 0.25);
    if (!this.firstBlood && e.damage > 0) {
      this.firstBlood = true;
      this.feedKey('firstBlood', e.attacker);
    }
    const ct = this.comboTrack[e.attacker];
    ct.max = Math.max(ct.max, e.combo);
    ct.dmg = Math.max(ct.dmg, e.comboDamage);
  }

  private onExplosion(x: number, y: number, r: number, aspect: Parameters<IVfx['explosion']>[3], power: number): void {
    if (power <= 0 && r < 80) return;
    this.vfx.explosion(x, y, r, aspect);
    const big = r >= 200;
    this.sfx(big ? 'explosion_big' : 'explosion_small', { pan: this.pan(x), intensity: clamp(r / 300, 0.3, 1), aspect: aspect ?? undefined });
    this.wave(x, y, r * 1.6, big ? 0.12 : 0.05, big ? 0.8 : 0.45);
    this.cam.addTrauma(big ? 0.6 : 0.2);
    this.flashOn(aspect ? rgb01(ASPECT_PALETTES[aspect].core) : [1, 0.9, 0.7], big ? 0.55 : 0.18);
    this.arena.lightFlash(aspect ? ASPECT_PALETTES[aspect].primary : '#ffb070', big ? 1 : 0.5, x);
    if (y > -140) this.arena.addScorch(x, r * 0.6, aspect ? ASPECT_PALETTES[aspect].primary : '#ff9040');
    if (big) {
      this.hitStop(0.1);
      this.impact(0, null);
      this.bloomBoost = Math.max(this.bloomBoost, 0.5);
    }
  }

  private onZoneWarn(kind: ZoneKind, x: number, owner: Side | null): void {
    const map: Partial<Record<ZoneKind, SfxId>> = {
      meteor: 'meteor_fall', cataclysm: 'meteor_fall', lightning: 'lightning_zap', lance: 'radiant_chime', blackhole: 'gravity',
      chains: 'chains', rend: 'spatial_cut', hazard_lightning: 'lightning_zap', hazard_starfall: 'meteor_fall', hazard_voidrift: 'void_pulse',
    };
    const s = map[kind];
    if (s) this.sfx(s, { pan: this.pan(x), volume: kind === 'cataclysm' ? 1 : 0.45, intensity: kind === 'cataclysm' ? 1 : 0.4 });
    if (kind === 'cataclysm' || kind === 'blackhole' || kind === 'lance') this.darkenFor(0.5, 1.5);
  }

  private onZoneStrike(kind: ZoneKind, x: number, y: number, r: number, owner: Side | null): void {
    const col = owner !== null ? this.sideColor[owner] : '#ff7040';
    switch (kind) {
      case 'lightning': case 'hazard_lightning':
        this.sfx('thunder', { pan: this.pan(x), intensity: 0.8 });
        this.flashOn([0.85, 0.9, 1], 0.25);
        this.arena.lightFlash(col, 0.9, x);
        this.cam.addTrauma(0.2);
        break;
      case 'meteor': case 'hazard_starfall':
        this.sfx('meteor_impact', { pan: this.pan(x), intensity: 0.6 });
        this.vfx.explosion(x, -20, r, owner !== null ? this.sim.fighters[owner].def.aspect : null);
        this.wave(x, -30, r * 2, 0.06, 0.5);
        this.cam.addTrauma(0.3);
        break;
      case 'cataclysm':
        this.sfx('meteor_impact', { pan: this.pan(x), intensity: 1 });
        this.sfx('explosion_big', { pan: this.pan(x), intensity: 1 });
        this.vfx.explosion(x, -40, r, owner !== null ? this.sim.fighters[owner].def.aspect : null);
        this.wave(x, -60, 900, 0.16, 1.1);
        this.cam.addTrauma(1);
        this.flashOn([1, 0.85, 0.6], 0.6);
        this.impact(0, owner);
        this.hitStop(0.16);
        this.arena.lightFlash(col, 1, x);
        break;
      case 'rend':
        this.sfx('spatial_cut', { pan: this.pan(x) });
        break;
      case 'chains':
        this.sfx('chains', { pan: this.pan(x) });
        break;
      case 'spike':
        this.sfx('earth_rumble', { pan: this.pan(x), volume: 0.5 });
        this.vfx.debris(x, -10, 3, '#6b6470', 0.6);
        break;
      case 'lance':
        this.sfx('radiant_chime', { pan: this.pan(x), intensity: 1 });
        this.sfx('explosion_big', { pan: this.pan(x), intensity: 0.8 });
        this.flashOn([1, 1, 0.9], 0.6);
        this.wave(x, -100, 500, 0.1, 0.8);
        this.cam.addTrauma(0.6);
        this.impact(1, owner);
        this.arena.lightFlash(col, 1, x);
        break;
      case 'blackhole':
        this.sfx('void_pulse', { pan: this.pan(x), intensity: 1 });
        this.sfx('explosion_big', { pan: this.pan(x), intensity: 0.9 });
        this.wave(x, y, 700, 0.14, 0.9);
        this.cam.addTrauma(0.7);
        this.impact(0, owner);
        break;
      case 'colossus':
        this.sfx('whoosh_heavy', { intensity: 1 });
        this.sfx('earth_rumble', { intensity: 1 });
        this.cam.addTrauma(0.5);
        break;
      case 'hazard_lava':
        this.sfx('fire_burst', { pan: this.pan(x), intensity: 0.7 });
        break;
      case 'hazard_icicles':
        this.sfx('ice_shatter', { pan: this.pan(x), intensity: 0.7 });
        break;
      case 'hazard_voidrift':
        this.sfx('void_pulse', { pan: this.pan(x), intensity: 0.7 });
        break;
      default:
        break;
    }
  }

  private onSeq(e: Extract<SimEvent, { type: 'seq' }>): void {
    const sim = this.sim;
    const F = sim.fighters;
    const ca = this.sideColor[e.a], cb = this.sideColor[e.b];
    switch (e.kind) {
      case 'bladeLock':
        if (e.beat === 'start') {
          this.loop('blade_lock', { intensity: 0.7 });
          this.letterboxFor(3);
          this.setFocus(e.x, e.y + 10, 1.75, 3, 4, 0.03);
          this.struggleKind = 'BLADE LOCK';
          this.struggleV = 0;
          this.callout('BLADE LOCK', null, 'md');
          this.feedKey('bladeLock:start', e.a);
          this.audio.musicStinger('clash');
        } else if (e.beat === 'spark') {
          this.vfx.grindSparks(e.x, e.y, ca, cb);
          this.cam.addTrauma(0.06);
          this.struggleV = this.toScreenStruggle(e.a, e.v ?? 0);
          this.struggleUntil = this.now + 0.4;
          this.setFocus(e.x, e.y + 10, 1.75, 0.5, 4, 0.03);
        } else if (e.beat === 'slipFail') {
          this.cam.addTrauma(0.1);
        } else {
          this.stopLoop('blade_lock');
          this.struggleKind = null;
          this.vfx.clashBurst(e.x, e.y, true, ca, cb);
          this.wave(e.x, e.y, 360, 0.11, 0.6);
          this.sfx('clash_heavy', { intensity: 1, pan: this.pan(e.x) });
          this.hitStop(0.12);
          this.cam.addTrauma(0.5);
          this.focus = null;
          if (e.beat === 'overpower') {
            this.callout('OVERPOWERED', e.a, 'lg');
            this.impact(1, e.a);
            this.feedKey('bladeLock:overpower', e.a);
            this.moment(`${F[e.a].name} wins the blade lock`, e.a);
          } else if (e.beat === 'slip') {
            this.callout('SLIP', e.a, 'md');
            this.feedKey('bladeLock:slip', e.a);
            this.moment(`${F[e.a].name} slips the blade lock`, e.a);
          } else {
            this.feedKey('bladeLock:repel', e.a);
          }
        }
        break;
      case 'beamStruggle':
        if (e.beat === 'start') {
          this.stopLoop('beam');
          this.loop('beam_struggle', { intensity: 0.8 });
          this.letterboxFor(5);
          this.struggleKind = 'BEAM STRUGGLE';
          this.struggleV = 0;
          this.callout('BEAM STRUGGLE', null, 'lg');
          this.audio.musicStinger('clash');
          this.feedKey('beamStruggle:start', 0);
          this.moment('Beams collide — a struggle of wills', undefined);
        } else if (e.beat === 'surge') {
          this.cam.addTrauma(0.12);
          const s = ((e.v ?? 0.5) - 0.5) * 2; // + favours fighter 0
          this.struggleV = this.toScreenStruggle(0, s);
          this.struggleUntil = this.now + 0.5;
          this.wave(e.x, e.y, 160, 0.05, 0.3);
        } else {
          this.stopLoop('beam_struggle');
          this.struggleKind = null;
          if (e.beat === 'overwhelm') {
            this.sfx('explosion_big', { intensity: 1, pan: this.pan(e.x) });
            this.vfx.explosion(e.x, e.y, 260, F[e.a].def.aspect);
            this.impact(0, e.a);
            this.hitStop(0.16);
            this.slowmo(0.3, 0.5, 0.4);
            this.wave(e.x, e.y, 700, 0.14, 0.9);
            this.cam.addTrauma(0.9);
            this.callout('OVERWHELMED', e.a, 'xl');
            this.feedKey('beamStruggle:overwhelm', e.a, true);
            this.moment(`${F[e.a].name} wins the beam struggle`, e.a);
          } else if (e.beat === 'mutual') {
            this.sfx('explosion_big', { intensity: 1 });
            this.vfx.explosion(e.x, e.y, 320, null);
            this.wave(e.x, e.y, 800, 0.15, 1);
            this.cam.addTrauma(1);
            this.impact(0, null);
            this.feedKey('beamStruggle:mutual', 0);
          } else if (e.beat === 'escape') {
            this.callout('ESCAPE', e.a, 'md');
            this.feedKey('beamStruggle:escape', e.a);
          }
        }
        break;
      case 'blitz':
        if (e.beat === 'start') {
          this.letterboxFor(3.2);
          this.callout('CLASH OF GODS', null, 'lg');
          this.feedKey('blitz:start', e.a);
          this.whipUntil = this.now + 3;
          this.sfx('teleport_out', { intensity: 1 });
          this.audio.musicStinger('clash');
        } else if (e.beat === 'exchange') {
          this.setFocus(e.x, e.y, 1.4, 0.3, 5, (this.rng.next() - 0.5) * 0.08);
          this.vfx.clashBurst(e.x, e.y, true, ca, cb);
          this.vfx.shockRing(e.x, e.y, 200, '#ffffff', 5);
          this.wave(e.x, e.y, 260, 0.08, 0.4);
          this.sfx('clash_heavy', { pan: this.pan(e.x), intensity: 0.8 });
          this.sfx('teleport_in', { pan: this.pan(e.x), volume: 0.5 });
          this.cam.addTrauma(0.3);
          this.hitStop(0.05);
          if ((e.v ?? 0) % 2 === 1) this.impact(this.rng.chance(0.5) ? 1 : 2, e.a);
          this.radialPulse(e.x, e.y, 0.3);
        } else if (e.beat === 'decisive') {
          this.vfx.hitSpark(e.x, e.y, 0, 4, ca, { counter: true });
          this.wave(e.x, e.y, 420, 0.12, 0.6);
          this.sfx('hit_crit', { intensity: 1, pan: this.pan(e.x) });
          this.impact(1, e.a);
          this.hitStop(0.12);
          this.slowmo(0.3, 0.35, 0.3);
          this.cam.addTrauma(0.7);
          this.callout('DECISIVE BLOW', e.a, 'lg');
          this.feedKey('blitz:decisive', e.a);
          this.moment(`${F[e.a].name} wins the clash of gods`, e.a);
          this.whipUntil = 0;
          this.focus = null;
        }
        break;
      case 'throw':
        if (e.beat === 'grab') this.sfx('grab', { pan: this.pan(e.x) });
        else if (e.beat === 'break') {
          this.callout('THROW BREAK', e.b, 'sm');
          this.sfx('parry', { pan: this.pan(e.x), pitch: 0.8 });
          this.feedKey('throwBreak', e.a);
        } else if (e.beat === 'impact') {
          this.sfx('throw_slam', { pan: this.pan(e.x), intensity: 1 });
          this.vfx.dust(e.x, 0, 20);
          this.cam.addTrauma(0.4);
          this.hitStop(0.08);
          if (this.rng.chance(0.4)) this.feedKey('throwSlam', e.a);
        }
        break;
      case 'counter':
        if (e.beat === 'trigger') {
          this.hitStop(0.18);
          this.desatPulse(0.8);
          this.callout('COUNTER', e.a, 'lg');
          this.sfx('perfect_parry', { intensity: 1, pan: this.pan(e.x) });
          this.setFocus(e.x, e.y, 1.6, 0.8, 5);
          this.letterboxFor(0.9);
        } else if (e.beat === 'slash') {
          this.vfx.slashLine(e.x, e.y, this.rng.range(-0.3, 0.3), 900, ca, 4);
          this.sfx('finisher_slash', { pan: this.pan(e.x), intensity: 1 });
          this.slowmo(0.25, 0.25, 0.25);
        } else if (e.beat === 'impact') {
          this.impact(1, e.a);
          this.wave(e.x, e.y, 300, 0.1, 0.5);
          this.cam.addTrauma(0.6);
          this.feedKey('counter', e.a);
          this.moment(`${F[e.a].name} lands an iai counter`, e.a);
        }
        break;
      case 'thousandCuts':
        if (e.beat === 'start') {
          this.letterboxFor(1.6);
          this.darkenFor(0.8, 1.6);
          this.setFocus(e.x, e.y, 1.45, 1.4, 6);
          this.feedKey('thousandCuts', e.a, true);
        } else if (e.beat === 'cut') {
          this.vfx.slashLine(e.x, e.y, e.v ?? 0, 520, this.rng.chance(0.5) ? '#ffffff' : ca, 2.5);
          this.sfx('slash_hit', { pan: this.pan(e.x), pitch: 0.9 + this.rng.next() * 0.3, volume: 0.6 });
          this.cam.addTrauma(0.08);
          if (this.rng.chance(0.3)) this.impact(1, e.a);
        } else if (e.beat === 'sheath') {
          this.sfx('chrono_tick', { pan: this.pan(e.x) });
          this.audio.musicSilence(0.6);
          this.slowmo(0.4, 0.2, 0.2);
        } else if (e.beat === 'release') {
          this.impact(2, e.a);
          this.flashOn([1, 1, 1], 0.6);
          this.wave(e.x, e.y, 600, 0.14, 0.8);
          this.cam.addTrauma(0.9);
          this.sfx('finish_boom', { intensity: 1, pan: this.pan(e.x) });
          this.hitStop(0.15);
          for (let i = 0; i < 6; i++) this.vfx.slashLine(e.x, e.y, (i / 6) * Math.PI, 700, i % 2 ? '#ffffff' : ca, 3);
        }
        break;
      case 'transform':
        if (e.beat === 'gather') {
          this.letterboxFor(1.2);
          this.setFocus(e.x, e.y, 1.6, 1.0, 5);
          this.loop('charge', { aspect: F[e.a].def.aspect, intensity: 1 });
          this.sfx('transform', { aspect: F[e.a].def.aspect, intensity: 1 });
          this.audio.musicStinger('transform');
          this.darkenFor(0.6, 1.0);
        } else if (e.beat === 'surge') {
          this.cam.addTrauma(0.4);
          for (let i = 0; i < 3; i++) this.vfx.lightning(e.x + this.rng.range(-160, 160), e.y - 400, e.x + this.rng.range(-30, 30), e.y, ca, 3);
          this.vfx.debris(e.x, -5, 10, '#6b6470', 0.6);
        } else if (e.beat === 'explode') {
          this.stopLoop('charge');
          this.vfx.auraBurst(e.x, e.y, ca, 1.5);
          this.vfx.shockRing(e.x, e.y, 320, ca, 10);
          this.wave(e.x, e.y, 500, 0.12, 0.7);
          this.flashOn(rgb01(ASPECT_PALETTES[F[e.a].def.aspect].core), 0.6);
          this.impact(2, e.a);
          this.cam.addTrauma(0.7);
          this.callout('ASCENSION', e.a, 'xl');
          this.sfx('aura_flare', { aspect: F[e.a].def.aspect, intensity: 1 });
          this.feedKey('transform', e.a, true);
          this.moment(`${F[e.a].name} ascends`, e.a);
        }
        break;
      case 'lastStand':
        if (e.beat === 'heartbeat') {
          this.sfx('heartbeat', { intensity: 1 });
          this.redPulse = 1;
        } else if (e.beat === 'rise') {
          this.vfx.auraBurst(e.x, e.y, ca, 0.8);
          this.sfx('aura_flare', { intensity: 0.8 });
        } else if (e.beat === 'burst') {
          this.desatTarget = 0;
          this.vfx.auraBurst(e.x, e.y, ca, 1.6);
          this.vfx.shockRing(e.x, e.y, 360, ca, 10);
          this.wave(e.x, e.y, 600, 0.14, 0.8);
          this.flashOn([1, 0.9, 0.8], 0.6);
          this.impact(2, e.a);
          this.cam.addTrauma(0.8);
          this.sfx('burst', { intensity: 1 });
        }
        break;
      case 'finalClash':
        if (e.beat === 'start') {
          this.callout('FINAL CLASH', null, 'xl', e.text === 'time' ? 'time has run out' : 'no draws among gods');
          this.feedKey('finalClash', null, true);
          this.letterboxFor(4);
          this.audio.musicStinger('phase');
          this.moment(e.text === 'time' ? 'Time runs out — FINAL CLASH' : 'Double knockout — FINAL CLASH', undefined);
          this.loop('charge', { intensity: 1 });
        } else if (e.beat === 'dash') {
          this.stopLoop('charge');
          this.radialPulse(0, -80, 0.5);
          this.sfx('dash', { intensity: 1 });
        } else if (e.beat === 'clash') {
          this.vfx.clashBurst(0, -80, true, this.sideColor[0], this.sideColor[1]);
          this.wave(0, -80, 700, 0.15, 0.9);
          this.impact(2, null);
          this.hitStop(0.2);
          this.cam.addTrauma(1);
          this.sfx('clash_heavy', { intensity: 1 });
          this.loop('blade_lock', { intensity: 1 });
          this.struggleKind = 'FINAL CLASH';
        } else if (e.beat === 'surge') {
          this.vfx.grindSparks(e.x, -80, this.sideColor[0], this.sideColor[1]);
          this.struggleV = this.toScreenStruggle(0, e.v ?? 0);
          this.struggleUntil = this.now + 0.5;
          this.cam.addTrauma(0.15);
        } else if (e.beat === 'resolve') {
          this.stopLoop('blade_lock');
          this.struggleKind = null;
        }
        break;
      case 'chronoStop':
        if (e.beat === 'windup') this.sfx('chrono_tick', { pan: this.pan(e.x), intensity: 1 });
        break;
      case 'voidGate':
        this.vfx.teleportFlash(e.x, e.y, this.sideColor[e.a], e.beat === 'open');
        this.sfx('void_pulse', { pan: this.pan(e.x), volume: 0.6 });
        break;
      case 'finisher':
        this.onFinisherBeat(e);
        break;
      default:
        break;
    }
  }

  private onFinisherBeat(e: Extract<SimEvent, { type: 'seq' }>): void {
    const sim = this.sim;
    const W = sim.fighters[e.a], L = sim.fighters[e.b];
    const col = this.sideColor[e.a];
    const v = e.v ?? 1;
    switch (e.beat) {
      case 'begin':
        this.letterboxFor(10);
        this.audio.duckMusic(0.5, 3);
        break;
      case 'silence':
        this.audio.musicSilence(v);
        this.stopLoops(0.3);
        break;
      case 'zoom':
        this.setFocus(e.x, e.y, v, 1.4, 8);
        break;
      case 'slowmo':
        this.slowmo(v, 0.8, 0.6);
        break;
      case 'teleport':
        this.vfx.teleportFlash(e.x, e.y, col, true);
        this.sfx('teleport_out', { intensity: 1 });
        break;
      case 'slash':
        this.vfx.slashLine(e.x, e.y, v, 1400, col, 5);
        this.vfx.slashLine(e.x, e.y, v, 1400, '#ffffff', 2);
        this.sfx('finisher_slash', { intensity: 1, pan: this.pan(e.x) });
        this.impact(1, e.a);
        this.hitStop(0.12);
        break;
      case 'impact':
        this.vfx.hitSpark(e.x, e.y, W.facing, 4, col, { counter: true, cut: W.weapon.blade });
        this.wave(e.x, e.y, 320 + v * 300, 0.06 + v * 0.08, 0.6);
        this.cam.addTrauma(0.4 + v * 0.5);
        this.sfx(v >= 1 ? 'finish_boom' : 'hit_crit', { intensity: v, pan: this.pan(e.x) });
        if (v >= 1) {
          this.impact(this.rng.chance(0.5) ? 1 : 2, e.a);
          this.hitStop(0.14);
          this.flashOn([1, 1, 1], 0.45);
        } else this.hitStop(0.06);
        break;
      case 'click':
        this.sfx('chrono_tick', { intensity: 1 });
        break;
      case 'letterbox':
        this.letterboxFor(6);
        break;
      case 'dash':
        this.radialPulse(e.x, e.y, 0.6);
        this.sfx('dash', { intensity: 1 });
        break;
      case 'flash':
        this.flashOn([1, 1, 1], v);
        this.impact(1, e.a);
        break;
      case 'launch':
        this.sfx('whoosh_heavy', { intensity: 1 });
        this.vfx.focusLines(this.cam.worldToScreen(e.x, e.y).x, this.cam.worldToScreen(e.x, e.y).y, 0.7, 0.5);
        break;
      case 'slam':
        this.vfx.dust(e.x, 0, 40);
        this.vfx.debris(e.x, -10, 24, '#5d5560', 1.6);
        this.vfx.shockRing(e.x, -10, 420, col, 10);
        this.arena.addCrater(e.x, 140 * v);
        this.arena.addCrack(e.x, 300 * v);
        this.wave(e.x, -20, 700, 0.14, 0.8);
        this.cam.addTrauma(1);
        this.sfx('meteor_impact', { intensity: 1, pan: this.pan(e.x) });
        break;
      case 'explosion':
        this.vfx.explosion(e.x, e.y, v, W.def.aspect);
        this.sfx('explosion_big', { intensity: 1, pan: this.pan(e.x) });
        this.flashOn(rgb01(ASPECT_PALETTES[W.def.aspect].core), 0.5);
        this.arena.lightFlash(col, 1, e.x);
        this.wave(e.x, e.y, v * 2, 0.12, 0.8);
        break;
      case 'shake':
        this.cam.addTrauma(v);
        break;
      case 'beam':
        this.vfx.finisherBeam(e.x, e.y, v, col, 0.7);
        this.sfx('beam_fire', { aspect: W.def.aspect, intensity: 1 });
        this.bloomBoost = Math.max(this.bloomBoost, 0.3);
        this.cam.addTrauma(0.5);
        break;
      case 'beamPulse':
        this.cam.addTrauma(0.1);
        break;
      case 'wallCrater':
        this.vfx.debris(e.x, e.y, 20, '#5d5560', 1.4);
        this.vfx.shockRing(e.x, e.y, 260, '#ffffff', 6);
        this.wave(e.x, e.y, 400, 0.12, 0.6);
        this.sfx('wall_splat', { intensity: 1, pan: this.pan(e.x) });
        this.cam.addTrauma(0.7);
        break;
      case 'beamEnd':
        break;
      case 'charge':
        this.vfx.chargeMotes(e.x, e.y, col, 1);
        this.loop('charge', { aspect: W.def.aspect, intensity: 1 });
        break;
      case 'blades':
        this.vfx.bladesConverge(e.x, e.y, col, v, false);
        this.sfx('blade_summon', { intensity: 1 });
        break;
      case 'bladesConverge':
        this.vfx.bladesConverge(e.x, e.y, col, v, true);
        this.sfx('slash_hit', { intensity: 1 });
        break;
      case 'meteor':
        this.vfx.meteorStrike(e.x, e.y, col);
        this.sfx('meteor_fall', { intensity: 1 });
        break;
      case 'clockFreeze':
        this.desatTarget = 0.85;
        this.vfx.timeStop(e.x, e.y, col, true);
        this.sfx('time_stop', { intensity: 1 });
        this.arena.setTimeStop(true);
        break;
      case 'frozenHit':
        this.vfx.hitSpark(e.x, e.y, W.facing, 2, '#c8d4e8', { cut: true });
        this.sfx('slash_hit', { volume: 0.5, pitch: 0.7 });
        break;
      case 'clockResume':
        this.desatTarget = 0;
        this.vfx.timeStop(e.x, e.y, col, false);
        this.arena.setTimeStop(false);
        this.sfx('time_resume', { intensity: 1 });
        break;
      case 'singularity':
        this.vfx.singularity(e.x, e.y, col, 1.6);
        this.sfx('gravity', { intensity: 1 });
        break;
      case 'darken':
        this.darkenFor(v, 2.5);
        break;
      case 'collapse':
        this.sfx('void_pulse', { intensity: 1 });
        this.wave(e.x, e.y, 600, 0.14, 0.7);
        this.impact(2, e.a);
        break;
      case 'pillarWarn':
        this.sfx('radiant_chime', { intensity: 0.6 });
        break;
      case 'pillar':
        this.vfx.lightPillar(e.x, col, 1.2);
        this.sfx('explosion_big', { intensity: 1 });
        this.flashOn([1, 1, 0.92], 0.7);
        this.impact(1, e.a);
        this.cam.addTrauma(0.8);
        break;
      case 'lightning':
        this.vfx.lightning(e.x + this.rng.range(-30, 30), e.y - 900, e.x, e.y, col, 4 * v);
        this.sfx('thunder', { intensity: v, pan: this.pan(e.x) });
        this.flashOn([0.9, 0.95, 1], 0.3 * v);
        this.cam.addTrauma(0.3 * v);
        break;
      case 'pyre':
        this.vfx.pyre(e.x, col);
        this.sfx('fire_burst', { intensity: 1 });
        break;
      case 'freezeSolid':
        this.vfx.freezeSolid(e.x, e.y);
        this.sfx('ice_shatter', { intensity: 0.6 });
        break;
      case 'thornsWarn':
        this.sfx('earth_rumble', { intensity: 0.6 });
        break;
      case 'thorns':
        this.vfx.thorns(e.x, col);
        this.sfx('nature_burst', { intensity: 1 });
        break;
      case 'shatter':
        this.vfx.shatter(e.x, e.y, (e.text ?? 'light') as ShatterStyle, this.sideColor[e.b]);
        this.sfx(e.text === 'ice' ? 'ice_shatter' : 'ko', { intensity: 1, pan: this.pan(e.x) });
        this.flashOn([1, 1, 1], 0.3);
        this.moment(`${L.name} falls`, e.a);
        break;
      case 'ultimateEcho':
        this.vfx.explosion(e.x, e.y, 200, W.def.aspect);
        this.sfx('explosion_big', { intensity: 1 });
        break;
      case 'pose':
        this.stopLoop('charge');
        this.setFocus(e.x, e.y - 10, 1.45, 3, 7);
        break;
      case 'end':
        this.focus = null;
        break;
      default:
        break;
    }
  }

  private onKO(winner: Side, loser: Side, x: number, y: number): void {
    const sim = this.sim;
    this.koTime = this.now;
    this.stopLoops(0.4);
    this.hitStop(0.32);
    this.slowmo(0.2, 1.0, 0.8);
    this.impact(1, winner);
    this.flashOn([1, 1, 1], 0.7);
    this.wave(x, y, 900, 0.16, 1.1);
    this.cam.addTrauma(0.9);
    this.callout('K.O.', null, 'xl');
    this.sfx('ko', { intensity: 1 });
    this.audio.musicStinger('ko');
    this.setFocus(x, y, 1.5, 1.2, 9);
    const W = sim.fighters[winner], L = sim.fighters[loser];
    if (W.stats.minWinProb < 0.25) {
      const l = this.narrator.line('comeback', winner);
      if (l) this.feed(l, winner, true);
      this.moment(`${W.name} completes a comeback from ${Math.round(W.stats.minWinProb * 100)}%`, winner);
    }
    void L;
  }

  private onVictory(winner: Side): void {
    if (this.victoryPushed) return;
    this.victoryPushed = true;
    const W = this.sim.fighters[winner];
    this.audio.musicStinger('victory');
    this.sfx('victory', { intensity: 1 });
    this.callout(W.name.toUpperCase(), winner, 'xl', 'is victorious');
    const line = this.narrator.line('ko', winner, { fin: this.sim.finisherName || 'a decisive blow' });
    if (line) this.feed(line, winner, true);
    this.moment(`${W.name} wins with ${this.sim.finisherName || 'a decisive blow'}`, winner);
    this.letterboxTarget = 1;
  }

  private onPhase(phase: string): void {
    const labels: Record<string, [string, string]> = {
      escalation: ['ESCALATION', 'the duel intensifies'],
      climax: ['CLIMAX', 'wrath runs high'],
      collapse: ['DIVINE COLLAPSE', 'the arena breaks apart'],
      judgment: ['JUDGMENT', 'every blow is lethal'],
    };
    const l = labels[phase];
    if (!l) return;
    if (phase !== 'escalation') {
      this.callout(l[0], null, 'lg', l[1]);
      this.audio.musicStinger('phase');
      this.moment(l[0], undefined);
    }
    const key = `phase:${phase}`;
    const line = this.narrator.line(key, null);
    if (line) this.feed(line, undefined, phase === 'collapse' || phase === 'judgment');
    if (phase === 'collapse') {
      this.arena.setCollapse(0.6);
      this.cam.addTrauma(0.5);
      this.sfx('rumble', { intensity: 1 });
    }
    if (phase === 'judgment') {
      this.arena.setCollapse(1);
      this.cam.addTrauma(0.6);
      this.sfx('rumble', { intensity: 1 });
    }
  }

  /* ================================================================== */
  /* Per-frame update                                                   */
  /* ================================================================== */

  update(realDt: number, scaledDt: number, wallDt = realDt): void {
    // Brief flashes must never freeze on screen (e.g. when paused mid-impact).
    if (realDt === 0 && wallDt > 0) {
      this.impactT = Math.max(0, this.impactT - wallDt);
      this.post.impact = this.impactT > 0 ? 1 : 0;
      this.flash = Math.max(0, this.flash - wallDt * 3.2);
      this.post.flash[3] = this.flash;
    }
    this.now += realDt;
    const sim = this.sim;
    for (const f of this.timeFx) f.t += realDt;
    this.timeFx = this.timeFx.filter((f) => f.t < f.hold + f.ramp);
    this.audio.setSlowmo(clamp(1 - this.timeScale, 0, 1) * 0.9);

    this.updateIntro();
    this.updateCamera(realDt);
    this.updateContinuous(scaledDt);
    this.updateNarrativeTracking();
    this.updateMusic(realDt);
    this.updatePost(realDt);

    // HUD struggle meter.
    if (this.struggleKind && this.now < this.struggleUntil + 0.6) {
      const [l, r] = this.screenSide[0] === 'left' ? [this.sideColor[0], this.sideColor[1]] : [this.sideColor[1], this.sideColor[0]];
      this.hud.struggle(this.struggleV, l, r, this.struggleKind);
    } else {
      this.hud.struggle(null, '#fff', '#fff');
      if (this.struggleKind && this.now > this.struggleUntil + 0.6) this.struggleKind = null;
    }
    // Ascended / charging loops intensities.
    const charge = this.loops.get('charge');
    if (charge?.active) {
      const cf = sim.fighters.find((f) => f.state === 'charge');
      if (cf) charge.setIntensity(cf.energy / 100);
    }
  }

  private updateCamera(dt: number): void {
    const sim = this.sim;
    const cam = this.cam;
    const half = sim.arena.halfWidth;
    let tx: number, ty: number, tz: number, rot = 0;
    const omega = this.now < this.whipUntil ? 13 : 5.5;
    cam.posOmega = omega;
    cam.zoomOmega = this.now < this.whipUntil ? 9 : 3.6;
    if (this.focus && this.now < this.focus.until) {
      tx = this.focus.x;
      ty = this.focus.y;
      tz = this.focus.zoom;
      rot = this.focus.rot;
    } else {
      this.focus = null;
      const pts: [number, number][] = [];
      for (const f of sim.fighters) {
        if (f.state === 'vanish') {
          pts.push([f.tpX, f.tpY - 60]);
          continue;
        }
        if (f.state === 'dead') continue;
        pts.push([f.x, f.y - 60]);
      }
      for (const z of sim.zones) {
        if ((z.r >= 140 || z.kind === 'lance') && z.age >= z.warn - 40) pts.push([z.x, Math.min(-40, z.y - 40)]);
      }
      for (const b of sim.beams) if (!b.dead) pts.push([b.ox + b.dirX * Math.min(b.length, 900), b.oy + b.dirY * Math.min(b.length, 900)]);
      if (pts.length === 0) pts.push([cam.targetX, cam.targetY]);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of pts) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const padX = 230, padTop = 175;
      const w = maxX - minX + padX * 2;
      const groundY = 40;
      const h = Math.max(groundY, maxY + 60) - (minY - padTop);
      tz = clamp(Math.min(1280 / w, 720 / h), 0.42, 1.55);
      tx = (minX + maxX) / 2;
      // Keep the ground at ~76% of the frame height; rise to keep airborne fighters in view.
      const halfH = 360 / tz;
      const camGround = -(0.76 * 720 - 360) / tz;
      const needTop = minY - padTop + halfH;
      ty = Math.min(camGround, needTop);
      void groundY;
      const halfW = 640 / tz;
      tx = clamp(tx, -half - 160 + halfW, half + 160 - halfW);
      if (Math.abs(tx) > half + 160 - halfW) tx = 0;
      if (sim.decided && sim.winner !== null && sim.sequences.length === 0) {
        const w0 = sim.fighters[sim.winner];
        tx = w0.x;
        ty = -110;
        tz = 1.3;
      }
    }
    cam.targetX = tx;
    cam.targetY = ty;
    cam.targetZoom = tz;
    cam.targetRotation = rot;
    cam.update(dt);
  }

  private updateContinuous(dt: number): void {
    if (dt <= 0) return;
    const sim = this.sim;
    for (const f of sim.fighters) {
      if (f.state === 'dead' || f.state === 'vanish') continue;
      const col = this.sideColor[f.side];
      const cx = f.x, cy = f.y - 60;
      if (f.state === 'charge') {
        this.vfx.chargeMotes(cx, cy, col, f.energy / 100 + 0.3);
        this.vfx.aura(cx, cy, col, 1);
        if (this.rng.chance(0.06)) this.cam.addTrauma(0.05);
      }
      if (f.hasBuff('ascended')) this.vfx.aura(cx, cy, col, 0.9);
      else if (f.hasBuff('lastStand')) this.vfx.aura(cx, cy, '#ff4030', 0.6);
      else if (f.wrath >= 100) this.vfx.aura(cx, cy, col, 0.28);
      if (f.hasBuff('burn') && this.rng.chance(0.12)) this.vfx.elementBurst(cx, cy, 'inferno', 0.12);
      if (f.hasBuff('chill') && this.rng.chance(0.08)) this.vfx.elementBurst(cx, cy, 'frost', 0.1);
      if (f.hp < f.maxHp * 0.18 && this.rng.chance(0.05)) this.vfx.elementBurst(cx, cy, f.def.aspect, 0.08);
      if (f.anim?.clip === 'transform' || f.anim?.clip === 'final.charge') {
        this.vfx.aura(cx, cy, col, 1.2);
        this.vfx.chargeMotes(cx, cy, col, 1);
      }
      if (f.action?.def.abilityId === 'annihilationBeam' && f.actionPhase === 'startup') {
        const h = f.handPos();
        this.vfx.chargeMotes(h.x, h.y, col, 0.8);
      }
      if (f.action?.def.abilityId === 'supernova' && f.actionPhase === 'startup') {
        this.vfx.chargeMotes(cx, cy, col, 1.4);
        this.vfx.aura(cx, cy, col, 1.4);
        if (this.rng.chance(0.2)) this.cam.addTrauma(0.08);
      }
    }
  }

  private updateNarrativeTracking(): void {
    const sim = this.sim;
    // Combo narration when combos end.
    for (const s of [0, 1] as Side[]) {
      const def = sim.fighters[s === 0 ? 1 : 0];
      const ct = this.comboTrack[s];
      if (ct.max > 0 && def.comboHits === 0 && !def.inHitstun) {
        if (ct.max >= 5 || ct.dmg >= 160) {
          this.feedKey('combo', s, ct.max >= 8 || ct.dmg >= 250, { n: ct.max, dmg: Math.round(ct.dmg) });
          if (ct.max >= 7 || ct.dmg >= 220) this.moment(`${sim.fighters[s].name} lands a ${ct.max}-hit combo (${Math.round(ct.dmg)} dmg)`, s);
          if (ct.max >= 6) this.callout(`${ct.max} HITS`, s, 'md', `${Math.round(ct.dmg)} damage`);
        }
        ct.max = 0;
        ct.dmg = 0;
      }
    }
    // Near death.
    for (const f of sim.fighters) {
      if (!this.nearDeath[f.side] && f.hp > 0 && f.hp < f.maxHp * 0.15 && !sim.decided) {
        this.nearDeath[f.side] = true;
        this.sfx('heartbeat', { intensity: 0.8 });
        this.redPulse = 1;
      }
    }
    // Lead changes.
    if (!sim.decided && sim.time > 8) {
      const p = sim.winProb0;
      let lead: Side | null = this.leader;
      if (p > 0.66) lead = 0;
      else if (p < 0.34) lead = 1;
      if (lead !== null && lead !== this.leader) {
        if (this.leader !== null && this.now - this.lastLeadT > 6) {
          this.feedKey('leadChange', lead);
          this.moment(`${sim.fighters[lead].name} seizes the momentum`, lead);
        }
        this.leader = lead;
        this.lastLeadT = this.now;
      }
    }
  }

  private updateMusic(dt: number): void {
    const sim = this.sim;
    const phaseBase: Record<string, number> = { intro: 0.15, opening: 0.3, escalation: 0.48, climax: 0.64, collapse: 0.8, judgment: 0.95, finale: 0.9, over: 0.5 };
    this.actionHeat = Math.max(0, this.actionHeat - dt * 1.4);
    const [a, b] = sim.fighters;
    let t = phaseBase[sim.phase] ?? 0.4;
    t += Math.min(0.25, this.actionHeat * 0.04);
    if (a.hp < 400 && b.hp < 400) t += 0.12;
    if (Math.min(a.hp, b.hp) < 200) t += 0.08;
    if (sim.sequences.some((s) => s.kind !== 'throw')) t = Math.max(t, 0.9);
    if (sim.decided) t = 0.7;
    this.tension = damp(this.tension, clamp(t, 0, 1), 1.5, dt);
    this.audio.setMusicIntensity(this.tension);
  }

  private updatePost(dt: number): void {
    const p = this.post;
    p.time = this.now;
    // Letterbox.
    const lbTarget = this.now < this.letterboxUntil ? 1 : this.letterboxTarget;
    this.letterbox = damp(this.letterbox, lbTarget, 5, dt);
    p.letterbox = this.letterbox;
    // Desaturation.
    this.desat = damp(this.desat, this.desatTarget, this.desatTarget > this.desat ? 9 : 3, dt);
    p.desaturate = this.desat;
    p.scanlines = this.sim.timeStop ? 0.25 : 0;
    // Darken arena.
    const dk = this.now < this.darkenUntil ? this.darken : 0;
    this.arena.setDarken(dk);
    // Flash.
    this.flash = Math.max(0, this.flash - dt * 3.2);
    p.flash[0] = this.flashColor[0];
    p.flash[1] = this.flashColor[1];
    p.flash[2] = this.flashColor[2];
    p.flash[3] = this.flash;
    // Chromatic aberration.
    this.chroma = Math.max(0, this.chroma - dt * 1.8);
    p.chromatic = 0.06 + this.chroma;
    // Bloom.
    this.bloomBoost = Math.max(0, this.bloomBoost - dt * 1.5);
    const beams = this.sim.beams.length > 0 ? 1 : 0;
    p.bloomStrength = (0.9 + this.bloomBoost * 0.6) * (beams ? 0.75 : 1);
    p.bloomThreshold = this.bright ? 0.7 : 0.55;
    // Impact frames.
    if (this.impactT > 0) {
      this.impactT -= dt;
      p.impact = 1;
      p.impactMode = this.impactMode;
      p.impactTint = this.impactTint;
    } else p.impact = 0;
    // Radial blur.
    this.radial = Math.max(0, this.radial - dt * 2.5);
    p.radialBlur = this.radial;
    p.radialCenter = this.radialCenter;
    // Red pulse vignette (near death / last stand heartbeat).
    this.redPulse = Math.max(0, this.redPulse - dt * 1.2);
    const lowHp = this.sim.fighters.some((f) => f.hp > 0 && f.hp < f.maxHp * 0.15) && !this.sim.decided;
    const pulse = this.redPulse + (lowHp ? 0.25 + 0.15 * Math.sin(this.now * 7) : 0);
    p.vignette = 0.36 + pulse * 0.35;
    p.vignetteColor = [0.35 * clamp(pulse, 0, 1), 0, 0];
    // Phase grading.
    const ph = this.sim.phase;
    if (ph === 'judgment') p.tint = [0.6, 0.05, 0.08, 0.12];
    else if (ph === 'collapse') p.tint = [0.4, 0.1, 0.3, 0.08];
    else p.tint = [0, 0, 0, 0];
    // Shockwaves.
    const W = this.cam.width, H = this.cam.height;
    const live: Wave[] = [];
    p.shockwaves.length = 0;
    for (const w of this.waves) {
      const k = (this.now - w.t) / w.dur;
      if (k >= 1) continue;
      live.push(w);
      if (p.shockwaves.length >= 8) continue;
      const s = this.cam.worldToScreen(w.x, w.y);
      const radiusPx = w.r * this.cam.zoom * (0.15 + 0.85 * Math.sqrt(k));
      p.shockwaves.push({ x: s.x / W, y: s.y / H, radius: radiusPx / H, thickness: 0.05 + 0.04 * (1 - k), strength: w.strength * (1 - k) });
    }
    this.waves = live;
  }

  /* ================================================================== */
  /* Helpers                                                            */
  /* ================================================================== */

  private pan(x: number): number {
    const s = this.cam.worldToScreen(x, -60);
    return clamp((s.x / this.cam.width) * 2 - 1, -1, 1) * 0.8;
  }

  private sfx(id: SfxId, params: SfxParams = {}): void {
    if (this.sfxMuted) return;
    this.audio.play(id, params);
  }

  private loop(id: LoopId, params: SfxParams = {}): void {
    const cur = this.loops.get(id);
    if (cur?.active) {
      if (params.intensity !== undefined) cur.setIntensity(params.intensity);
      return;
    }
    this.loops.set(id, this.audio.loop(id, params));
  }

  private stopLoop(id: LoopId, fade = 0.4): void {
    const cur = this.loops.get(id);
    if (cur?.active) cur.stop(fade);
    this.loops.delete(id);
  }

  private stopLoops(fade: number): void {
    for (const [id, l] of this.loops) {
      if (id === 'wind' || id === 'rain' || id === 'lava' || id === 'void_hum') continue;
      if (l.active) l.stop(fade);
      this.loops.delete(id);
    }
  }

  private wave(x: number, y: number, r: number, strength: number, dur: number): void {
    this.waves.push({ x, y, t: this.now, dur, r, strength });
    if (this.waves.length > 12) this.waves.shift();
  }

  private impact(mode: 0 | 1 | 2, side: Side | null): void {
    this.impactT = 0.045;
    this.impactMode = mode;
    this.impactTint = side !== null ? rgb01(this.sideLight[side]) : [1, 1, 1];
  }

  private flashOn(c: [number, number, number], a: number): void {
    if (a > this.flash) {
      this.flash = a;
      this.flashColor = c;
    }
  }

  private desatPulse(a: number): void {
    this.desat = Math.max(this.desat, a);
  }

  private darkenFor(a: number, sec: number): void {
    this.darken = Math.max(a, this.now < this.darkenUntil ? this.darken : 0);
    this.darkenUntil = Math.max(this.darkenUntil, this.now + sec);
  }

  private letterboxFor(sec: number): void {
    this.letterboxUntil = Math.max(this.letterboxUntil, this.now + sec);
  }

  private radialPulse(x: number, y: number, a: number): void {
    const s = this.cam.worldToScreen(x, y);
    this.radialCenter = [s.x / this.cam.width, s.y / this.cam.height];
    this.radial = Math.max(this.radial, a);
  }

  private setFocus(x: number, y: number, zoom: number, hold: number, priority: number, rot = 0): void {
    if (this.focus && this.now < this.focus.until && this.focus.priority > priority) return;
    this.focus = { x, y, zoom, until: this.now + hold, priority, rot };
  }

  private toScreenStruggle(side: Side, v: number): number {
    // v > 0 favours `side`. Screen convention: -1 = left fighter winning.
    const leftWinning = this.screenSide[side] === 'left' ? v : -v;
    return clamp(-leftWinning, -1, 1);
  }

  private callout(text: string, side: Side | null, size: 'sm' | 'md' | 'lg' | 'xl', sub?: string): void {
    this.hud.callout(text, {
      side: side === null ? 'center' : this.screenSide[side],
      color: side === null ? '#ffffff' : this.sideLight[side],
      size,
      sub,
      duration: size === 'xl' ? 1.8 : size === 'lg' ? 1.3 : 1.0,
    });
  }

  private feed(text: string, side?: Side, important = false): void {
    const t = this.sim.time;
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    this.hud.feed({ time: `${mm}:${ss.toString().padStart(2, '0')}`, text, color: side !== undefined ? this.sideLight[side] : undefined, important });
    this.lastFeedT = this.now;
  }

  private feedKey(key: string, side: Side | null, important = false, vars: Record<string, string | number> = {}): void {
    const line = this.narrator.line(key, side, vars);
    if (line) this.feed(line, side ?? undefined, important);
  }

  private moment(text: string, side: Side | undefined): void {
    const t = this.sim.time;
    if (this.moments.length && this.moments[this.moments.length - 1].text === text) return;
    this.moments.push({ t, text, side });
  }

  /** Label for HUD intent. */
  intentLabel(side: Side): string {
    return PLAN_NAMES[this.brains[side].plan as PlanKind] ?? '';
  }

  get introTicks(): number {
    return C.INTRO_TICKS;
  }
}

function rgb01(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [r / 255, g / 255, b / 255];
}

function readSub(what: string): string {
  switch (what) {
    case 'teleport': return 'saw the teleport';
    case 'opener': return 'anticipated';
    case 'throw': return 'escaped the grab';
    case 'jump': return 'anti-air';
    case 'interrupt': return 'interrupted';
    default: return '';
  }
}

function abilitySfx(id: string): SfxId {
  switch (id) {
    case 'phantomStep': case 'voidGate': case 'mirage': return 'teleport_out';
    case 'flashCut': case 'thousandCuts': return 'whoosh_blade';
    case 'galeAscent': return 'whoosh_heavy';
    case 'barrage': case 'crescentWave': case 'seekerOrbs': case 'gravityOrb': return 'charge_release';
    case 'starfall': case 'cataclysm': return 'meteor_fall';
    case 'thunderJudgment': return 'lightning_zap';
    case 'spikeEruption': case 'titanSlam': return 'earth_rumble';
    case 'annihilationBeam': return 'charge_release';
    case 'bindingChains': return 'chains';
    case 'dimensionRend': return 'spatial_cut';
    case 'bladeStorm': return 'blade_summon';
    case 'chronoStop': return 'chrono_tick';
    case 'aegis': return 'shield_up';
    case 'mirrorWard': return 'reflect';
    case 'counterStance': return 'chrono_tick';
    case 'phaseShift': return 'void_pulse';
    case 'chronoRewind': return 'rewind';
    case 'secondWind': return 'heal';
    default: return 'aura_flare';
  }
}
