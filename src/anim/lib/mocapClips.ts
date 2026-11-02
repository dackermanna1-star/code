import data from '../mocap/strikes.json';
import { AimPoint, ClipEvent, defineClipPair, Key, KeyFoot, KeyHand } from '../clip';
import { smoothstep } from '../../core/math';

/**
 * Motion-captured combat clips (punches, kicks, dodges) cut from the ACCAD Open Motion Project's
 * martial-arts captures by tools/mocap/strikes.py. Each is registered with its mirror (_m) like
 * the authored strikes, with: a warp window up to contact (the root closes the distance to the
 * target), the striking hand or foot steered onto the target around contact, a swoosh and the
 * hit event.
 */
interface MocapClip {
  keys: Key[];
  hitT: number;
  dur: number;
  limb: 'lh' | 'rh' | 'lf' | 'rf' | null;
  region: string | null;
  spin: boolean;
}

/** Per-clip timing: the capture's own pace is kept, but the wind-up can be quickened. */
export const MOCAP_CLIPS = data.clips as unknown as Record<string, MocapClip>;

/**
 * The authored clips these captures replace (everything that plays the name - the player's moves,
 * the elites who borrow them, the street's attacks - gets the capture).
 */
export const MOCAP_REPLACES: Record<string, string> = {
  // Jin
  jab: 'm_jab', cross: 'm_cross', hook: 'm_hook', bodyhook: 'm_bodyhook', uppercut: 'm_uppercut', elbow: 'm_elbow',
  frontkick: 'm_frontkick', roundhouse: 'm_roundhouse', sidekick: 'm_sidekick', spinkick: 'm_spinkick',
  // Scarlet
  s_backfist: 'm_backfist', s_palm: 'm_uppercut', s_snapkick: 'm_frontkick_r', s_axekick: 'm_axekick', s_spinhook: 'm_spinhook',
  // the street
  e_punch: 'me_punch', e_haymaker: 'me_haymaker', e_kick: 'me_kick', e_bruiser_punch: 'me_heavy',
  // evasions: a quick step out to the side, a boxer's retreat
  p_dodge_side: 'm_sidestep', p_dodge_back: 'm_retreat',
};

/**
 * Captures from outside a fight (the quick side-step comes from the running takes, its arms
 * hanging loose) are brought towards a fighter's guard - the boxer's own, from the cross's stance.
 */
const GUARDED: Record<string, number> = { m_sidestep: 0.7 };

export function registerMocapClips() {
  const specs = new Map<string, Parameters<typeof defineClipPair>[1]>();
  const guard = MOCAP_CLIPS.m_cross.keys[0] as Key;
  for (const [name, c] of Object.entries(MOCAP_CLIPS)) {
    const keys: Key[] = c.keys.map((k) => JSON.parse(JSON.stringify(k)) as Key);
    const gw = GUARDED[name] ?? 0;
    if (gw > 0) {
      for (const k of keys) {
        for (const side of ['lh', 'rh'] as const) {
          const H = k[side] as KeyHand, G = guard[side] as KeyHand;
          H.p = [0, 1, 2].map((j) => H.p![j] + (G.p![j] - H.p![j]) * gw) as [number, number, number];
          const pl = [0, 1, 2].map((j) => H.pole![j] + (G.pole![j] - H.pole![j]) * gw);
          const ln = Math.hypot(pl[0], pl[1], pl[2]) || 1;
          H.pole = [pl[0] / ln, pl[1] / ln, pl[2] / ln];
          H.roll = H.roll! + (G.roll! - H.roll!) * gw;
        }
      }
    }
    const limb = c.limb;
    const kick = !!limb && limb[1] === 'f';
    if (limb && c.region && name !== 'm_elbow') {
      const aim = c.region as AimPoint;
      for (const k of keys) {
        // steered onto the target over the last moments before contact, released after it
        const w = smoothstep(c.hitT - (kick ? 0.2 : 0.15), c.hitT - 0.02, k.t) * (1 - smoothstep(c.hitT + 0.06, c.hitT + (kick ? 0.24 : 0.18), k.t));
        const L = (k as unknown as Record<string, KeyHand & KeyFoot>)[limb];
        if (w > 1e-3) {
          L.aim = aim;
          L.aimW = w;
          L.aimOff = kick ? [0, 0, -0.1] : [0, 0, -0.07];
        } else {
          L.aim = null;
          L.aimW = 0;
        }
      }
    }
    const events: ClipEvent[] = limb
      ? [
          { t: Math.max(0.02, c.hitT - (kick ? 0.15 : 0.1)), type: 'sfx', name: kick ? 'whoosh_heavy' : 'whoosh_light' },
          { t: c.hitT, type: 'hit', limb },
        ]
      : [{ t: 0.03, type: 'sfx', name: 'whoosh_light' }];
    // footwork is over once both feet are down again
    let settle = c.dur;
    if (!limb) {
      let last = 0;
      keys.forEach((k, i) => {
        if ((k.lf as KeyFoot).p![1] >= 0.03 || (k.rf as KeyFoot).p![1] >= 0.03) last = i;
      });
      settle = Math.min(c.dur, keys[Math.min(keys.length - 1, last + 1)].t + 0.04);
    }
    const spec = {
      keys,
      events,
      warp: limb ? ([0, c.hitT] as [number, number]) : undefined,
      hitT: limb ? c.hitT : undefined,
      comboT: limb ? Math.min(c.dur, c.hitT + (kick ? 0.14 : 0.09)) : undefined,
      recoverT: limb ? Math.min(c.dur, c.hitT + (kick ? 0.34 : 0.24)) : settle,
      footFromStart: true,
    };
    // the elbow lands with the elbow, not the folded fist
    if (name === 'm_elbow') for (const e of events) if (e.type === 'hit') e.limb = 're';
    specs.set(name, spec);
    defineClipPair(name, spec);
  }
  for (const [old, cap] of Object.entries(MOCAP_REPLACES)) {
    const spec = specs.get(cap);
    if (spec) defineClipPair(old, spec);
  }
}
