import { G } from '../core/G';
import { mulberry32, rand } from '../core/math';
import { ARENA } from '../world/config';
import { wavesForDay } from './Progress';

export type Phase = 'menu' | 'prep' | 'wave' | 'dayEnd' | 'dead';

// gentle early, steep after day 20: late days need real weapons and defenses
export function hpScale(day: number) {
  return 1 + 0.022 * (day - 1) + 0.0009 * Math.max(0, day - 20) ** 2;
}
export function dmgScale(day: number) {
  return 1 + 0.012 * (day - 1) + 0.0004 * Math.max(0, day - 20) ** 2;
}
export function rewardScale(day: number) {
  return 1 + 0.012 * (day - 1);
}

/** Zombie types to spawn for a wave (in spawn order). */
export function waveComposition(day: number, wave: number, total: number, seed = 1): string[] {
  const rnd = mulberry32(day * 1009 + wave * 31 + seed);
  const base = 9 + 1.5 * (day - 1) + 0.012 * (day - 1) ** 2;
  let count = Math.round(base * (1 + 0.38 * (wave - 1)) * (wave === total ? 1.25 : 1));
  const weights: [string, number][] = [['walker', Math.max(30, 100 - (day - 1) * 2)]];
  const late = (wave - 1) / Math.max(1, total - 1);
  if (day >= 2) weights.push(['runner', Math.min(30, 8 + day * 0.6) * (0.7 + late * 0.6)]);
  if (day >= 3) weights.push(['tough', Math.min(18, 5 + day * 0.3)]);
  if (day >= 4) weights.push(['dog', Math.min(14, 4 + day * 0.25)]);
  if (day >= 5) weights.push(['crawler', 6]);
  if (day >= 6) weights.push(['armored', Math.min(22, 4 + day * 0.35) * (0.6 + late * 0.8)]);
  if (day >= 8) weights.push(['exploder', Math.min(12, 3 + day * 0.2)]);
  if (day >= 16) weights.push(['shield', Math.min(16, 3 + (day - 16) * 0.8)]);
  if (day >= 22) weights.push(['military', Math.min(34, 4 + (day - 22) * 1.6) * (0.6 + late * 0.8)]);
  const out: string[] = [];
  // day 1 teaches the basics
  if (day === 1) {
    if (wave === 2) {
      out.push('runner', 'runner');
      count -= 2;
    } else if (wave === 3) {
      out.push('tough', 'tough');
      count -= 2;
    }
    for (let i = 0; i < count; i++) out.push('walker');
  } else {
    const totalW = weights.reduce((a, b) => a + b[1], 0);
    for (let i = 0; i < count; i++) {
      let r = rnd() * totalW;
      for (const [t, w] of weights) {
        r -= w;
        if (r <= 0) {
          out.push(t);
          break;
        }
      }
    }
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  // brutes arrive mid-wave
  if (day >= 10) {
    const brutes = Math.min(8, Math.floor((day - 6) / 8) + (wave === total ? 1 : 0) + (late > 0.5 ? 1 : 0));
    for (let b = 0; b < brutes; b++) out.splice(Math.floor(out.length * (0.35 + rnd() * 0.5)), 0, 'brute');
  }
  // bosses at the end of every 5th day from day 10
  if (day >= 10 && day % 5 === 0 && wave === total) {
    const n = day >= 40 ? 2 : 1;
    for (let b = 0; b < n; b++) out.splice(Math.floor(out.length * (0.55 + b * 0.2)), 0, 'boss');
  }
  return out;
}

export const PREP_BETWEEN = 15;
const PREP_FIRST = 20;
const PREP_FIRST_MAX = 45;

export class Waves {
  phase: Phase = 'menu';
  day = 1;
  wave = 0;
  total = 3;
  private queue: string[] = [];
  private spawnT = 0;
  private burst = 0;
  waveSize = 0;
  waveKills = 0;
  dayKills = 0;
  dayMoney = 0;
  dayHeadshots = 0;
  waveTime = 0;
  lastKillT = 0;
  maxAliveCap = 240;
  /** Countdown to the next wave (prep phase only). */
  prepT = 0;
  prepTotal = 0;
  onPhase: ((p: Phase) => void) | null = null;

  get remaining() {
    return this.queue.length + G.zombies.list.length;
  }

  startDay(day: number) {
    this.day = day;
    this.wave = 0;
    this.total = wavesForDay(day);
    this.dayKills = 0;
    this.dayMoney = 0;
    this.dayHeadshots = 0;
    this.queue = [];
    G.zombies.hpScale = hpScale(day);
    G.zombies.damageScale = dmgScale(day);
    this.setPhase('prep');
  }

  setPhase(p: Phase) {
    this.phase = p;
    if (p === 'prep') {
      this.prepTotal = this.prepTime();
      this.prepT = this.prepTotal;
    }
    this.onPhase?.(p);
  }

  /**
   * Waves start on their own. Between waves the break is short; the first
   * wave of a day waits longer because every defense has to be placed again.
   */
  prepTime() {
    if (this.wave > 0) return PREP_BETWEEN;
    const inv: Record<string, number[]> = G.progress.data.inventory;
    let items = 0;
    for (const k in inv) items += inv[k].length;
    return Math.min(PREP_FIRST_MAX, PREP_FIRST + Math.round(items * 1.5));
  }

  startWave() {
    if (this.phase !== 'prep') return;
    this.wave++;
    this.queue = waveComposition(this.day, this.wave, this.total);
    this.waveSize = this.queue.length;
    this.waveKills = 0;
    this.waveTime = 0;
    this.lastKillT = 0;
    // opening horde front
    this.burst = Math.min(this.queue.length, 8 + Math.round(this.day * 1.2));
    this.spawnT = 0;
    this.setPhase('wave');
  }

  maxAlive() {
    return Math.min(this.maxAliveCap, 28 + this.day * 4);
  }

  onKill() {
    this.waveKills++;
    this.dayKills++;
    this.lastKillT = this.waveTime;
  }

  private spawnGroup(n: number) {
    const cx = rand(-ARENA.spawnHalfWidth + 2, ARENA.spawnHalfWidth - 2);
    const cz = rand(ARENA.spawnZMin, ARENA.spawnZMax);
    for (let i = 0; i < n && this.queue.length > 0; i++) {
      const t = this.queue.shift()!;
      const spread = t === 'boss' ? 0 : 3.5;
      const x = Math.max(-ARENA.spawnHalfWidth, Math.min(ARENA.spawnHalfWidth, cx + rand(-spread, spread)));
      const z = cz + rand(-4, 4);
      G.zombies.spawn(t, x, z, Math.PI + rand(-0.3, 0.3));
    }
  }

  update(dt: number) {
    if (this.phase === 'prep') {
      const before = Math.ceil(this.prepT);
      this.prepT -= dt;
      const now = Math.ceil(this.prepT);
      if (now !== before && now >= 1 && now <= 3) G.audio?.play('countTick', {});
      if (this.prepT <= 0) this.startWave();
      return;
    }
    if (this.phase !== 'wave') return;
    this.waveTime += dt;
    const alive = G.zombies.list.length;
    this.spawnT -= dt;
    if (this.queue.length > 0 && this.spawnT <= 0 && alive < this.maxAlive()) {
      if (this.burst > 0) {
        const n = Math.min(this.burst, 6);
        this.spawnGroup(n);
        this.burst -= n;
        this.spawnT = 0.35;
      } else {
        const group = 2 + Math.floor(this.day / 6) + Math.floor(Math.random() * 4);
        this.spawnGroup(Math.min(group, this.maxAlive() - alive));
        this.spawnT = Math.max(0.55, 2.4 - this.day * 0.035) * rand(0.7, 1.3);
      }
    }
    // stragglers: hurry the last few along
    if (this.queue.length === 0 && alive > 0 && alive <= 4 && this.waveTime - this.lastKillT > 30) {
      for (const z of G.zombies.list) if (z.speed < 3) z.speed *= 1 + dt * 0.3;
    }
    if (this.queue.length === 0 && alive === 0) {
      if (this.wave >= this.total) this.setPhase('dayEnd');
      else this.setPhase('prep');
    }
  }
}
