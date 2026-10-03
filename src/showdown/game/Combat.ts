import * as THREE from 'three';
import { SD } from '../core/SD';
import type { Fighter } from './Fighter';

export type HitKind =
  | 'punch'
  | 'kick'
  | 'blackflash'
  | 'red'
  | 'blue'
  | 'purple'
  | 'dismantle'
  | 'cleave'
  | 'fuga'
  | 'shrine'
  | 'wcs'
  | 'void'
  | 'crash'
  | 'sword'
  | 'burst';

export interface Hit {
  kind: HitKind;
  dmg: number;
  point: THREE.Vector3;
  /** push direction */
  dir: THREE.Vector3;
  knock: number;
  lift: number;
  stun: number;
  /** Domain Amplification: Infinity can't stop it */
  da?: boolean;
  /** a domain's sure-hit or the world-cutting slash: nothing stops it */
  sure?: boolean;
  /** throws the target through the air */
  launch?: boolean;
  source: Combatant | null;
}

export type HitResult = 'hit' | 'blocked' | 'dodged' | 'immune';

export interface Combatant {
  readonly name: string;
  readonly f: Fighter;
  hp: number;
  readonly maxHp: number;
  alive: boolean;
  /** world position of the chest (aim point) */
  aim(out: THREE.Vector3): THREE.Vector3;
  receive(hit: Hit): HitResult;
}

export function makeHit(kind: HitKind, dmg: number, point: THREE.Vector3, dir: THREE.Vector3, o: Partial<Hit> = {}): Hit {
  return {
    kind,
    dmg,
    point: point.clone(),
    dir: dir.clone().normalize(),
    knock: o.knock ?? 4,
    lift: o.lift ?? 0,
    stun: o.stun ?? 0.3,
    da: o.da,
    sure: o.sure,
    launch: o.launch,
    source: o.source ?? null,
  };
}

/**
 * Fight-wide timing: hit-stop (brief freeze on impact), slow motion and the
 * time scale they leave behind.
 */
export class Timing {
  private stopT = 0;
  private stopScale = 0.05;
  private slowT = 0;
  private slowScale = 1;
  private slowFade = 0.3;

  /** Freeze the action for `dur` real seconds. */
  hitstop(dur: number, scale = 0.04) {
    if (dur > this.stopT) this.stopT = dur;
    this.stopScale = Math.min(this.stopScale, scale);
  }

  slowmo(dur: number, scale: number, fade = 0.3) {
    this.slowT = Math.max(this.slowT, dur);
    this.slowScale = scale;
    this.slowFade = fade;
  }

  get stopped() {
    return this.stopT > 0;
  }

  /** Called with real (unscaled) dt; sets SD.timeScale. */
  update(dt: number) {
    let s = 1;
    if (this.slowT > 0) {
      this.slowT -= dt;
      const k = this.slowT < this.slowFade ? this.slowT / this.slowFade : 1;
      s = 1 + (this.slowScale - 1) * Math.max(0, k);
    }
    if (this.stopT > 0) {
      this.stopT -= dt;
      s = Math.min(s, this.stopScale);
      if (this.stopT <= 0) this.stopScale = 0.05;
    }
    SD.timeScale = s;
  }

  reset() {
    this.stopT = this.slowT = 0;
    SD.timeScale = 1;
  }
}
