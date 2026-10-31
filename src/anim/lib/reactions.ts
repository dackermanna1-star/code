import { defineClip, defineClipPair, Key } from '../clip';
import { BRAWL, FIGHT, k } from './stances';

const SUPINE: Omit<Key, 't'> = {
  root: [0, 0, 0],
  hips: [0, -0.84, 0.0],
  hipsR: [-88, 0, 0],
  spine: [-2, 0, 0],
  chest: [-2, 0, 0],
  neck: [10, 0, 0],
  head: [8, 0, 0],
  lh: { p: [0.42, 0.06, -0.25], sp: 'root', pole: [0.3, 1, 0], roll: -80, aim: null, dir: null },
  rh: { p: [-0.42, 0.06, -0.25], sp: 'root', pole: [-0.3, 1, 0], roll: -80, aim: null, dir: null },
  lf: { p: [0.15, 0.02, 0.84], yaw: 15, pitch: -60, pole: [0.3, 1, 0] },
  rf: { p: [-0.15, 0.02, 0.84], yaw: -15, pitch: -60, pole: [-0.3, 1, 0] },
};
const PRONE: Omit<Key, 't'> = {
  root: [0, 0, 0],
  hips: [0, -0.84, 0.0],
  hipsR: [88, 0, 0],
  spine: [2, 0, 0],
  chest: [2, 0, 0],
  neck: [-25, 0, 0],
  head: [-20, 0, 0],
  lh: { p: [0.35, 0.05, 0.75], sp: 'root', pole: [0.4, -1, 0], roll: 90, aim: null, dir: null },
  rh: { p: [-0.35, 0.05, 0.75], sp: 'root', pole: [-0.4, -1, 0], roll: 90, aim: null, dir: null },
  lf: { p: [0.14, 0.04, -0.84], yaw: 15, pitch: 75, pole: [0.3, -1, 0] },
  rf: { p: [-0.14, 0.04, -0.84], yaw: -15, pitch: 75, pole: [-0.3, -1, 0] },
};

export function registerReactions() {
  // ------------------------------------------------------------------ head snap back (frontal hit)
  defineClip('r_head_back', {
    recoverT: 0.4,
    keys: [
      k(0, BRAWL),
      k(0.06, BRAWL, { e: 'snap', root: [0, -0.08, 0], hips: [0, -0.06, -0.05], hipsR: [-6, -10, 0], torso: [-14, 0, 0], neck: [-14, 0, 0], head: [-26, 4, 0], lh: { p: [0.28, 0.05, 0.32], sp: 'chest', roll: -20 }, rh: { p: [-0.28, 0.1, 0.3], sp: 'chest', roll: -20 } }),
      k(0.22, BRAWL, { e: 'out', root: [0, -0.22, 0], hips: [0, -0.08, -0.03], torso: [-6, 0, 0], head: [-10, 6, 0], lf: { p: [0.14, 0, -0.02] }, rf: { p: [-0.15, 0, -0.3] } }),
      k(0.5, BRAWL, { root: [0, -0.26, 0], lf: { p: [0.14, 0, -0.02] }, rf: { p: [-0.15, 0, -0.3] } }),
    ],
  });
  // ------------------------------------------------------------------ head snapped sideways (hit from victim's right -> head goes left)
  defineClipPair('r_head_l', {
    recoverT: 0.42,
    keys: [
      k(0, BRAWL),
      k(0.06, BRAWL, { e: 'snap', root: [0.05, -0.04, 0], hips: [0.04, -0.07, -0.02], hipsR: [0, 18, -6], torso: [4, 18, -10], neck: [0, 22, -12], head: [4, 30, -18], lh: { p: [0.34, 0.0, 0.25], sp: 'chest', roll: 0 }, rh: { p: [-0.05, 0.25, 0.28], sp: 'chest' } }),
      k(0.24, BRAWL, { e: 'out', root: [0.14, -0.12, 10], torso: [2, 8, -4], head: [2, 12, -6], lf: { p: [0.3, 0, 0.0] } }),
      k(0.52, BRAWL, { root: [0.16, -0.14, 10], lf: { p: [0.3, 0, 0.0] }, rf: { p: [-0.02, 0, -0.18] } }),
    ],
  });
  // ------------------------------------------------------------------ gut: doubled over
  defineClip('r_gut', {
    recoverT: 0.55,
    keys: [
      k(0, BRAWL),
      k(0.08, BRAWL, { e: 'snap', root: [0, -0.1, 0], hips: [0, -0.1, -0.12], hipsR: [24, -6, 0], torso: [34, 0, 0], neck: [10, 0, 0], head: [16, 0, 0], lh: { p: [0.1, -0.22, 0.2], sp: 'chest', roll: 40, pole: [0.6, -0.4, -0.2] }, rh: { p: [-0.08, -0.25, 0.22], sp: 'chest', roll: 40, pole: [-0.6, -0.4, -0.2] }, shrug: [8, 8] }),
      k(0.34, BRAWL, { e: 'out', root: [0, -0.2, 0], hips: [0, -0.12, -0.1], hipsR: [20, -6, 0], torso: [28, 0, 0], head: [10, 0, 0], rf: { p: [-0.15, 0, -0.32] } }),
      k(0.7, BRAWL, { root: [0, -0.22, 0], rf: { p: [-0.15, 0, -0.32] }, lf: { p: [0.14, 0, 0.0] } }),
    ],
  });
  // ------------------------------------------------------------------ heavy stagger back (two steps)
  defineClip('r_heavy', {
    recoverT: 0.75,
    keys: [
      k(0, BRAWL),
      k(0.07, BRAWL, { e: 'snap', root: [0, -0.15, 0], hips: [0, -0.04, -0.1], hipsR: [-12, 0, 0], torso: [-20, 0, 6], neck: [-14, 0, 0], head: [-24, 0, 0], lh: { p: [0.4, 0.15, 0.1], sp: 'chest', roll: -40, pole: [1, 0, 0] }, rh: { p: [-0.4, 0.1, 0.12], sp: 'chest', roll: -40, pole: [-1, 0, 0] } }),
      k(0.28, BRAWL, { e: 'out', root: [0, -0.55, 0], hips: [0, -0.12, -0.04], torso: [-8, 0, 2], head: [-10, 0, 0], lf: { p: [0.16, 0, -0.35] }, rf: { p: [-0.15, 0, -0.7] } }),
      k(0.5, BRAWL, { e: 'inout', root: [0, -0.8, 0], hips: [0, -0.1, 0], torso: [4, 0, 0], head: [0, 0, 0], lf: { p: [0.14, 0, -0.6] }, rf: { p: [-0.15, 0, -0.92] } }),
      k(0.85, BRAWL, { root: [0, -0.82, 0], lf: { p: [0.14, 0, -0.6] }, rf: { p: [-0.15, 0, -0.95] } }),
    ],
  });
  // ------------------------------------------------------------------ hit from behind: lurch forward
  defineClip('r_back', {
    recoverT: 0.45,
    keys: [
      k(0, BRAWL),
      k(0.07, BRAWL, { e: 'snap', root: [0, 0.1, 0], hips: [0, -0.06, 0.08], hipsR: [-10, 0, 0], torso: [-18, 0, 0], head: [-20, 0, 0], lh: { p: [0.35, 0.0, 0.1], sp: 'chest' }, rh: { p: [-0.35, 0.0, 0.1], sp: 'chest' } }),
      k(0.28, BRAWL, { e: 'out', root: [0, 0.3, 0], torso: [8, 0, 0], head: [6, 0, 0], lf: { p: [0.14, 0, 0.5] } }),
      k(0.55, BRAWL, { root: [0, 0.32, 0], lf: { p: [0.14, 0, 0.5] }, rf: { p: [-0.15, 0, 0.12] } }),
    ],
  });
  // ------------------------------------------------------------------ stunned / dazed (loopable segment 0.3-1.5)
  defineClip('r_stun', {
    recoverT: 1.8,
    keys: [
      k(0, BRAWL),
      k(0.1, BRAWL, { e: 'snap', root: [0, -0.1, 0], hips: [0, -0.1, -0.05], torso: [-12, 0, 6], head: [-20, 0, 10], lh: { p: [0.08, 0.3, 0.16], sp: 'chest', roll: -70, pole: [1, -0.3, 0] }, rh: { p: [-0.08, 0.3, 0.16], sp: 'chest', roll: -70, pole: [-1, -0.3, 0] } }),
      k(0.5, BRAWL, { root: [0.05, -0.18, 8], hips: [0.04, -0.12, -0.02], torso: [10, 6, -8], head: [14, 8, -10], lh: { p: [0.06, 0.35, 0.14], sp: 'chest' }, rh: { p: [-0.06, 0.33, 0.14], sp: 'chest' }, lf: { p: [0.2, 0, 0.0] } }),
      k(0.95, BRAWL, { root: [-0.04, -0.2, -6], hips: [-0.04, -0.13, 0.0], torso: [14, -6, 8], head: [20, -6, 12], lh: { p: [0.07, 0.34, 0.14], sp: 'chest' }, rh: { p: [-0.07, 0.36, 0.14], sp: 'chest' }, rf: { p: [-0.18, 0, -0.3] } }),
      k(1.4, BRAWL, { root: [0.03, -0.22, 4], hips: [0.02, -0.12, -0.02], torso: [8, 4, -4], head: [12, 4, -6], lh: { p: [0.07, 0.34, 0.14], sp: 'chest' }, rh: { p: [-0.07, 0.34, 0.14], sp: 'chest' }, lf: { p: [0.18, 0, 0.0] }, rf: { p: [-0.18, 0, -0.3] } }),
      k(1.9, BRAWL, { root: [0, -0.22, 0], lf: { p: [0.16, 0, 0.0] }, rf: { p: [-0.16, 0, -0.3] } }),
    ],
  });
  // ------------------------------------------------------------------ blocking (guard absorb)
  defineClip('r_block', {
    recoverT: 0.3,
    keys: [
      k(0, BRAWL, { lh: { p: [0.08, 0.3, 0.26], sp: 'chest', roll: -10 }, rh: { p: [-0.08, 0.3, 0.26], sp: 'chest', roll: -10 }, head: [10, 0, 0] }),
      k(0.06, BRAWL, { e: 'snap', root: [0, -0.12, 0], hips: [0, -0.1, -0.04], torso: [-6, 0, 0], head: [6, 0, 0], lh: { p: [0.08, 0.3, 0.22], sp: 'chest', roll: -10 }, rh: { p: [-0.08, 0.3, 0.22], sp: 'chest', roll: -10 } }),
      k(0.4, BRAWL, { e: 'out', root: [0, -0.16, 0], lh: { p: [0.08, 0.3, 0.26], sp: 'chest', roll: -10 }, rh: { p: [-0.08, 0.3, 0.26], sp: 'chest', roll: -10 }, head: [10, 0, 0], rf: { p: [-0.15, 0, -0.28] } }),
    ],
  });
  // ------------------------------------------------------------------ attack parried / dodged by player: stumble forward
  defineClip('r_whiff', {
    recoverT: 0.6,
    keys: [
      k(0, BRAWL),
      k(0.12, BRAWL, { e: 'out', root: [0, 0.25, 0], hips: [0, -0.12, 0.08], torso: [24, 0, 0], head: [-10, 0, 0], lh: { p: [0.3, 0.0, 0.3], sp: 'chest' }, rh: { p: [-0.2, -0.1, 0.45], sp: 'chest' }, lf: { p: [0.14, 0, 0.55] } }),
      k(0.45, BRAWL, { e: 'inout', root: [0, 0.45, 0], torso: [8, 0, 0], lf: { p: [0.14, 0, 0.6] }, rf: { p: [-0.15, 0, 0.2] } }),
      k(0.7, BRAWL, { root: [0, 0.45, 0], lf: { p: [0.14, 0, 0.6] }, rf: { p: [-0.15, 0, 0.25] } }),
    ],
  });
  // ------------------------------------------------------------------ agile dodge (hop back)
  defineClip('r_dodge_back', {
    recoverT: 0.4,
    keys: [
      k(0, FIGHT),
      k(0.08, FIGHT, { e: 'out', root: [0, -0.1, 0], hips: [0, -0.15, -0.02], torso: [10, 0, 0] }),
      k(0.24, FIGHT, { e: 'out', root: [0, -0.9, 0], hips: [0, -0.02, -0.06], torso: [-8, 0, 0], head: [6, 0, 0], lf: { p: [0.1, 0.06, -0.55] }, rf: { p: [-0.13, 0.04, -0.95] } }),
      k(0.48, FIGHT, { root: [0, -1.0, 0], lf: { p: [0.1, 0, -0.75] }, rf: { p: [-0.13, 0, -1.1] } }),
    ],
    events: [{ t: 0.05, type: 'sfx', name: 'whoosh_light' }],
  });
  defineClipPair('r_dodge_side', {
    recoverT: 0.38,
    keys: [
      k(0, FIGHT),
      k(0.08, FIGHT, { e: 'out', hips: [0.02, -0.15, 0], torso: [8, 0, -10] }),
      k(0.24, FIGHT, { e: 'out', root: [0.9, -0.1, 0], hips: [0.06, -0.18, 0], torso: [10, 0, -18], head: [0, 0, 10], lf: { p: [1.0, 0, 0.1], lift: 0.06 }, rf: { p: [0.75, 0, -0.25], lift: 0.06 } }),
      k(0.45, FIGHT, { root: [0.95, -0.1, 0], lf: { p: [1.05, 0, 0.1] }, rf: { p: [0.8, 0, -0.28] } }),
    ],
    events: [{ t: 0.05, type: 'sfx', name: 'whoosh_light' }],
  });

  // ------------------------------------------------------------------ get up from back (supine)
  defineClip('getup_back', {
    recoverT: 1.45,
    keys: [
      k(0, SUPINE),
      k(0.3, SUPINE, { hips: [0, -0.8, 0.05], hipsR: [-60, 0, 0], spine: [20, 0, 0], chest: [20, 0, 0], head: [10, 0, 0], lh: { p: [0.35, 0.06, -0.05] }, rh: { p: [-0.35, 0.06, -0.05] }, lf: { p: [0.15, 0.0, 0.6], pitch: -20, pole: [0.3, 1, 0.5] }, rf: { p: [-0.15, 0.0, 0.5], pitch: 0, pole: [-0.3, 1, 0.5] } }),
      k(0.65, SUPINE, { e: 'inout', hips: [0, -0.62, 0.05], hipsR: [-10, -20, 0], spine: [30, 10, 0], chest: [25, 10, 0], neck: [0, 0, 0], head: [-10, 0, 0], lh: { p: [0.36, 0.06, 0.1], pole: [0.3, -1, -0.3] }, rh: { p: [-0.15, 0.6, 0.45], pole: [-0.5, -1, 0] }, lf: { p: [0.18, 0, 0.35], pitch: 30, pole: [0.5, 0.3, 1] }, rf: { p: [-0.12, 0, 0.32], pitch: 0, pole: [-0.2, 0.4, 1] } }),
      k(1.0, BRAWL, { e: 'inout', root: [0, 0.15, 0], hips: [0, -0.35, 0.05], hipsR: [20, -10, 0], torso: [30, 0, 0], lh: { p: [0.25, -0.05, 0.3], sp: 'chest' }, rh: { p: [-0.2, -0.05, 0.3], sp: 'chest' }, lf: { p: [0.16, 0, 0.35], pitch: 0 }, rf: { p: [-0.14, 0, 0.2], pitch: 0 } }),
      k(1.5, BRAWL, { root: [0, 0.15, 0], lf: { p: [0.16, 0, 0.35] }, rf: { p: [-0.14, 0, 0.2] } }),
    ],
    events: [{ t: 0.2, type: 'sfx', name: 'grunt_pain' }],
  });
  // ------------------------------------------------------------------ get up from front (prone)
  defineClip('getup_front', {
    recoverT: 1.45,
    keys: [
      k(0, PRONE),
      k(0.35, PRONE, { hips: [0, -0.78, -0.05], hipsR: [70, 0, 0], neck: [-30, 0, 0], head: [-25, 0, 0], lh: { p: [0.28, 0.05, 0.45] }, rh: { p: [-0.28, 0.05, 0.45] } }),
      k(0.7, PRONE, { e: 'inout', hips: [0, -0.55, -0.1], hipsR: [45, 0, 0], spine: [10, 0, 0], chest: [10, 0, 0], neck: [-25, 0, 0], head: [-20, 0, 0], lh: { p: [0.28, 0.05, 0.42] }, rh: { p: [-0.28, 0.05, 0.42] }, lf: { p: [0.15, 0, -0.1], pitch: 40, pole: [0.2, 0.3, 1] }, rf: { p: [-0.15, 0.04, -0.6], pitch: 70 } }),
      k(1.05, BRAWL, { e: 'inout', root: [0, 0.05, 0], hips: [0, -0.32, -0.05], hipsR: [30, -10, 0], torso: [30, 0, 0], lh: { p: [0.25, -0.05, 0.3], sp: 'chest' }, rh: { p: [-0.2, -0.05, 0.3], sp: 'chest' }, lf: { p: [0.16, 0, 0.1], pitch: 0 }, rf: { p: [-0.14, 0, -0.25], pitch: 0 } }),
      k(1.5, BRAWL, { root: [0, 0.05, 0], lf: { p: [0.16, 0, 0.1] }, rf: { p: [-0.14, 0, -0.2] } }),
    ],
    events: [{ t: 0.25, type: 'sfx', name: 'grunt_pain' }],
  });
  // static lying poses (used for knocked-down enemies waiting / ground takedown victims)
  defineClip('lie_back', { keys: [k(0, SUPINE), k(1, SUPINE)], loop: true });
  defineClip('lie_front', { keys: [k(0, PRONE), k(1, PRONE)], loop: true });

  // ================================================================== PLAYER defensive moves
  defineClipPair('p_dodge_side', {
    recoverT: 0.3,
    keys: [
      k(0, FIGHT),
      k(0.06, FIGHT, { e: 'out', hips: [0.02, -0.16, 0], torso: [10, 0, -8] }),
      k(0.2, FIGHT, { e: 'out', root: [1.25, 0, 0], hips: [0.08, -0.22, 0], hipsR: [8, -20, -10], torso: [14, 0, -16], head: [-6, 0, 12], lf: { p: [1.32, 0, 0.12], lift: 0.05 }, rf: { p: [1.05, 0, -0.2], lift: 0.05 } }),
      k(0.36, FIGHT, { root: [1.3, 0, 0], lf: { p: [1.4, 0, 0.17] }, rf: { p: [1.16, 0, -0.17] } }),
    ],
    events: [{ t: 0.03, type: 'sfx', name: 'whoosh_light' }],
  });
  defineClip('p_dodge_back', {
    recoverT: 0.32,
    keys: [
      k(0, FIGHT),
      k(0.06, FIGHT, { e: 'out', hips: [0, -0.15, 0.02], torso: [12, 0, 0] }),
      k(0.22, FIGHT, { e: 'out', root: [0, -1.3, 0], hips: [0, -0.1, -0.06], torso: [-6, 0, 0], head: [8, 0, 0], lf: { p: [0.1, 0.04, -0.95], lift: 0.06 }, rf: { p: [-0.13, 0.02, -1.45], lift: 0.06 } }),
      k(0.38, FIGHT, { root: [0, -1.35, 0], lf: { p: [0.1, 0, -1.15] }, rf: { p: [-0.13, 0, -1.5] } }),
    ],
    events: [{ t: 0.03, type: 'sfx', name: 'whoosh_light' }],
  });
  // ------------------------------------------------------------------ vault flip over an enemy (target at ~1.0m)
  defineClip('p_vault', {
    warp: [0, 0.12],
    recoverT: 0.66,
    keys: [
      k(0, FIGHT),
      k(0.1, FIGHT, { e: 'in', root: [0, 0.35, 0], hips: [0, -0.2, 0.05], hipsR: [20, 0, 0], torso: [20, 0, 0], lh: { aim: 'p.neck', aimOff: [0.12, 0.1, -0.05], roll: 90 }, rh: { aim: 'p.neck', aimOff: [-0.12, 0.1, -0.05], roll: 90 } }),
      k(0.24, FIGHT, { e: 'linear', root: [0, 1.0, 0], hips: [0, 1.0, 0.0], hipsR: [110, 0, 0], torso: [30, 0, 0], head: [20, 0, 0], lh: { aim: 'p.neck', aimOff: [0.12, 0.08, 0], roll: 90 }, rh: { aim: 'p.neck', aimOff: [-0.12, 0.08, 0], roll: 90 }, lf: { p: [0.1, 1.5, 0.6], pitch: 30, pole: [0, 1, 0] }, rf: { p: [-0.1, 1.5, 0.5], pitch: 30, pole: [0, 1, 0] } }),
      k(0.38, FIGHT, { e: 'linear', root: [0, 1.7, 0], hips: [0, 0.75, 0.0], hipsR: [240, 0, 0], torso: [40, 0, 0], head: [30, 0, 0], lh: { aim: null, p: [0.25, 0.1, 0.3], sp: 'chest' }, rh: { aim: null, p: [-0.25, 0.1, 0.3], sp: 'chest' }, lf: { p: [0.1, 1.4, 2.0], pitch: 30, pole: [0, -0.3, 1] }, rf: { p: [-0.1, 1.3, 1.9], pitch: 30, pole: [0, -0.3, 1] } }),
      k(0.52, FIGHT, { e: 'out', root: [0, 2.3, 0], hips: [0, -0.18, 0.05], hipsR: [372, -10, 0], torso: [16, 0, 0], head: [-6, 0, 0], lf: { p: [0.12, 0, 2.5] }, rf: { p: [-0.14, 0, 2.15] } }),
      k(0.72, FIGHT, { root: [0, 2.35, 0], hipsR: [364, -24, 0], lf: { p: [0.12, 0, 2.52] }, rf: { p: [-0.14, 0, 2.18] } }),
    ],
    events: [{ t: 0.05, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.52, type: 'sfx', name: 'footstep' }],
  });
  // ------------------------------------------------------------------ player hit reactions
  defineClip('p_hit', {
    recoverT: 0.38,
    keys: [
      k(0, FIGHT),
      k(0.06, FIGHT, { e: 'snap', root: [0, -0.1, 0], hips: [0, -0.08, -0.05], hipsR: [-6, -20, 0], torso: [-12, 0, 4], head: [-22, 10, 0], lh: { p: [0.3, 0.1, 0.3], sp: 'chest' }, rh: { p: [-0.25, 0.1, 0.28], sp: 'chest' } }),
      k(0.22, FIGHT, { e: 'out', root: [0, -0.3, 0], torso: [-4, 0, 0], head: [-6, 12, 0], rf: { p: [-0.13, 0, -0.42] }, lf: { p: [0.1, 0, -0.05] } }),
      k(0.45, FIGHT, { root: [0, -0.32, 0], rf: { p: [-0.13, 0, -0.42] }, lf: { p: [0.1, 0, -0.05] } }),
    ],
  });
  defineClip('p_hit_gut', {
    recoverT: 0.45,
    keys: [
      k(0, FIGHT),
      k(0.07, FIGHT, { e: 'snap', root: [0, -0.12, 0], hips: [0, -0.12, -0.1], hipsR: [20, -20, 0], torso: [30, 0, 0], head: [10, 10, 0], lh: { p: [0.1, -0.15, 0.22], sp: 'chest' }, rh: { p: [-0.1, -0.15, 0.22], sp: 'chest' } }),
      k(0.3, FIGHT, { e: 'out', root: [0, -0.3, 0], torso: [14, 0, 0], rf: { p: [-0.13, 0, -0.42] } }),
      k(0.52, FIGHT, { root: [0, -0.32, 0], rf: { p: [-0.13, 0, -0.42] } }),
    ],
  });
  defineClip('p_block_hit', {
    recoverT: 0.22,
    keys: [
      k(0, FIGHT, { lh: { p: [0.07, 0.31, 0.24], sp: 'chest', roll: -10 }, rh: { p: [-0.07, 0.31, 0.24], sp: 'chest', roll: -10 } }),
      k(0.05, FIGHT, { e: 'snap', root: [0, -0.18, 0], hips: [0, -0.12, -0.04], torso: [-6, 0, 0], lh: { p: [0.07, 0.31, 0.2], sp: 'chest', roll: -10 }, rh: { p: [-0.07, 0.31, 0.2], sp: 'chest', roll: -10 } }),
      k(0.3, FIGHT, { e: 'out', root: [0, -0.24, 0], lh: { p: [0.07, 0.31, 0.24], sp: 'chest', roll: -10 }, rh: { p: [-0.07, 0.31, 0.24], sp: 'chest', roll: -10 }, rf: { p: [-0.13, 0, -0.38] } }),
    ],
  });
  defineClip('p_knockdown', {
    recoverT: 2.2,
    keys: [
      k(0, FIGHT),
      k(0.1, FIGHT, { e: 'snap', root: [0, -0.3, 0], hips: [0, -0.1, -0.1], hipsR: [-20, 0, 0], torso: [-20, 0, 0], head: [-20, 0, 0], lh: { p: [0.4, 0.2, 0.1], sp: 'chest' }, rh: { p: [-0.4, 0.2, 0.1], sp: 'chest' } }),
      k(0.45, SUPINE, { e: 'in', root: [0, -1.2, 0], hips: [0, -0.8, 0], lf: { p: [0.15, 0.02, -0.4] }, rf: { p: [-0.15, 0.02, -0.4] } }),
      k(0.9, SUPINE, { root: [0, -1.25, 0], lf: { p: [0.15, 0.02, -0.4] }, rf: { p: [-0.15, 0.02, -0.4] } }),
      k(1.25, SUPINE, { root: [0, -1.25, 0], hips: [0, -0.62, 0.05], hipsR: [-10, -20, 0], spine: [30, 10, 0], chest: [25, 10, 0], neck: [0, 0, 0], head: [-10, 0, 0], lh: { p: [0.36, 0.06, 0.1], pole: [0.3, -1, -0.3] }, rh: { p: [-0.15, 0.6, 0.45], pole: [-0.5, -1, 0] }, lf: { p: [0.18, 0, -0.85], pitch: 30, pole: [0.5, 0.3, 1] }, rf: { p: [-0.12, 0, -0.88], pitch: 0, pole: [-0.2, 0.4, 1] } }),
      k(1.7, FIGHT, { e: 'inout', root: [0, -1.1, 0], hips: [0, -0.3, 0.05], torso: [24, 0, 0], lf: { p: [0.1, 0, -0.9] }, rf: { p: [-0.13, 0, -1.25] } }),
      k(2.3, FIGHT, { root: [0, -1.1, 0], lf: { p: [0.1, 0, -0.9] }, rf: { p: [-0.13, 0, -1.25] } }),
    ],
    events: [{ t: 0.4, type: 'sfx', name: 'body_fall' }],
  });
}
