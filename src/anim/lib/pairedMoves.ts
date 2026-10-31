import { Key, KeyFoot, KeyHand } from '../clip';
import { definePaired } from './paired';
import { BRAWL, FIGHT, k } from './stances';

/**
 * Victim key helper: author the victim in its OWN local frame (as if standing at origin facing +Z),
 * placed at clip-space (0, D) facing -Z. Converts root displacement and feet to clip space.
 */
function vk(t: number, D: number, base: Omit<Key, 't'>, over: Partial<Key> = {}): Key {
  const kk = k(t, base, over);
  const r = kk.root ?? [0, 0, 0];
  kk.root = [-r[0], D - r[1], 180 + r[2]];
  const conv = (f?: KeyFoot): KeyFoot | undefined => {
    if (!f) return f;
    const out = { ...f };
    if (f.p) out.p = [-f.p[0], f.p[1], D - f.p[2]];
    if (f.yaw !== undefined) out.yaw = 180 + f.yaw;
    return out;
  };
  kk.lf = conv(kk.lf);
  kk.rf = conv(kk.rf);
  return kk;
}
const H = (h: KeyHand) => h;

// victim punch-extended pose (right arm thrust forward)
const V_PUNCH: Omit<Key, 't'> = {
  ...BRAWL,
  hips: [0.02, -0.08, 0.06],
  hipsR: [6, 16, 0],
  torso: [12, 18, -4],
  head: [-6, -8, 0],
  rh: { p: [-0.02, 1.48, 0.62], sp: 'root', roll: 85, pole: [-0.6, -0.6, -0.3], aim: null },
  lf: { p: [0.14, 0, 0.18] },
  rf: { p: [-0.14, 0, -0.18], pitch: 20 },
};

export function registerPaired() {
  // =================================================================== COUNTER: catch + elbow
  {
    const D = 1.0;
    definePaired(
      'ctr_elbow',
      {
        hitT: 0.2, recoverT: 0.5,
        keys: [
          k(0, FIGHT),
          k(0.09, FIGHT, { e: 'out', root: [-0.05, 0.08, -10], hipsR: [4, -30, 0], torso: [6, -12, 0], lh: H({ aim: 'p.handR', aimOff: [0, 0, 0.02], roll: 60, pole: [0.6, -0.6, -0.3] }), lf: { p: [0.06, 0, 0.25] } }),
          k(0.2, FIGHT, { e: 'snap', root: [-0.05, 0.2, -10], hips: [0.02, -0.11, 0.05], hipsR: [6, 26, 0], torso: [10, 34, -8], head: [-4, -16, 0], lh: H({ aim: 'p.handR', roll: 60 }), rh: H({ p: [0.17, 0.16, 0.17], sp: 'chest', pole: [-0.3, 0.45, 1], roll: 90 }), rf: { p: [-0.11, 0, -0.06], pitch: 28 }, lf: { p: [0.06, 0, 0.3] } }),
          k(0.34, FIGHT, { e: 'out', root: [-0.05, 0.22, -10], hipsR: [4, -6, 0], torso: [6, 6, 0], lh: H({ aim: null, p: [0.17, 0.17, 0.33], sp: 'chest' }), rh: H({ p: [-0.03, 0.19, 0.25], sp: 'chest', pole: [-0.4, -1, -0.25] }), rf: { p: [-0.13, 0, -0.04], pitch: 0 }, lf: { p: [0.06, 0, 0.3] } }),
          k(0.52, FIGHT, { root: [-0.05, 0.22, -10], lf: { p: [0.06, 0, 0.3] }, rf: { p: [-0.13, 0, -0.02] } }),
        ],
        events: [{ t: 0.04, type: 'sfx', name: 'parry' }, { t: 0.2, type: 'hit', limb: 're', region: 'head', strength: 0.9, damage: 26, bleed: 0.8, kind: 'elbow' }],
      },
      {
        recoverT: 0.6,
        keys: [
          vk(0, D, V_PUNCH),
          vk(0.09, D, V_PUNCH, { root: [0, 0.08, 0], torso: [16, 18, -4] }),
          vk(0.2, D, V_PUNCH, { e: 'snap', root: [0, 0.06, 0], hips: [0, -0.08, -0.04], torso: [-10, -10, 8], neck: [-14, -20, 0], head: [-24, -30, 6] }),
          vk(0.36, D, BRAWL, { e: 'out', root: [0, -0.25, 0], hips: [0, -0.1, -0.04], torso: [-6, 0, 4], head: [-10, -10, 0], lf: { p: [0.14, 0, -0.1] }, rf: { p: [-0.14, 0, -0.42] } }),
          vk(0.6, D, BRAWL, { root: [0, -0.3, 0], lf: { p: [0.14, 0, -0.12] }, rf: { p: [-0.14, 0, -0.44] } }),
        ],
      },
      D,
    );
  }
  // =================================================================== COUNTER: parry + palm to chin
  {
    const D = 1.0;
    definePaired(
      'ctr_palm',
      {
        hitT: 0.22, recoverT: 0.5,
        keys: [
          k(0, FIGHT),
          k(0.09, FIGHT, { e: 'out', root: [0.05, 0.05, 8], hipsR: [4, -10, 0], torso: [4, 10, 0], rh: H({ aim: 'p.farmR', aimOff: [-0.08, 0, 0], roll: 0, pole: [-1, -0.2, 0] }) }),
          k(0.22, FIGHT, { e: 'snap', root: [0.05, 0.22, 8], hips: [0.02, -0.02, 0.06], hipsR: [0, 16, 0], torso: [-4, 14, -4], rh: H({ aim: 'p.farmR', aimOff: [-0.12, 0.05, 0], roll: 0 }), lh: H({ p: [0, 1.6, 0.6], aim: 'p.head', aimOff: [0, -0.12, -0.04], roll: -80, dir: [0, 1, 0.3], dirW: 0.8, pole: [0.4, -1, 0] }), lf: { p: [0.1, 0, 0.36] }, rf: { p: [-0.12, 0, -0.08], pitch: 25 } }),
          k(0.36, FIGHT, { e: 'out', root: [0.05, 0.24, 8], rh: H({ aim: null, p: [-0.03, 0.19, 0.25], sp: 'chest' }), lh: H({ aim: null, dir: null, p: [0.17, 0.17, 0.33], sp: 'chest' }), lf: { p: [0.1, 0, 0.36] }, rf: { p: [-0.13, 0, -0.04], pitch: 0 } }),
          k(0.52, FIGHT, { root: [0.05, 0.24, 8], lf: { p: [0.1, 0, 0.36] }, rf: { p: [-0.13, 0, 0.0] } }),
        ],
        events: [{ t: 0.06, type: 'sfx', name: 'parry' }, { t: 0.22, type: 'hit', limb: 'lh', region: 'head', strength: 0.95, damage: 24, bleed: 0.5, kind: 'palm', dir: 'up' }],
      },
      {
        recoverT: 0.6,
        keys: [
          vk(0, D, V_PUNCH),
          vk(0.1, D, V_PUNCH, { torso: [10, -10, -10], rh: H({ p: [0.25, 1.5, 0.5], sp: 'root' }) }),
          vk(0.22, D, V_PUNCH, { e: 'snap', root: [0, 0.02, 0], hips: [0, -0.02, -0.06], torso: [-18, -10, 0], neck: [-25, 0, 0], head: [-35, 0, 0], rh: H({ p: [0.3, 1.55, 0.35], sp: 'root' }), lh: H({ p: [0.35, 0.2, 0.15], sp: 'chest' }) }),
          vk(0.4, D, BRAWL, { e: 'out', root: [0, -0.32, 0], torso: [-10, 0, 0], head: [-14, 0, 0], lf: { p: [0.14, 0, -0.2] }, rf: { p: [-0.14, 0, -0.5] } }),
          vk(0.62, D, BRAWL, { root: [0, -0.36, 0], lf: { p: [0.14, 0, -0.22] }, rf: { p: [-0.14, 0, -0.52] } }),
        ],
      },
      D,
    );
  }
  // =================================================================== COUNTER: arm break
  {
    const D = 0.95;
    definePaired(
      'ctr_armbreak',
      {
        hitT: 0.3, recoverT: 0.62,
        keys: [
          k(0, FIGHT),
          k(0.1, FIGHT, { e: 'out', root: [0.08, 0.06, 20], hipsR: [6, -10, 0], torso: [8, 10, 0], lh: H({ aim: 'p.handR', roll: 90, pole: [0.5, -0.8, -0.3] }), rh: H({ p: [-0.15, 0.3, 0.2], sp: 'chest', roll: 90 }) }),
          k(0.3, FIGHT, { e: 'snap', root: [0.12, 0.12, 30], hips: [0, -0.15, 0.04], hipsR: [12, 10, 0], torso: [24, 14, 0], lh: H({ aim: 'p.handR', aimOff: [0, -0.1, 0], roll: 90 }), rh: H({ aim: 'p.farmR', aimOff: [0, -0.04, 0], roll: 90, pole: [-0.5, 1, 0] }), lf: { p: [0.1, 0, 0.26] } }),
          k(0.46, FIGHT, { e: 'out', root: [0.12, 0.12, 30], hips: [0, -0.1, 0], torso: [10, 6, 0], lh: H({ aim: null, p: [0.17, 0.17, 0.33], sp: 'chest' }), rh: H({ aim: null, p: [-0.03, 0.19, 0.25], sp: 'chest' }), lf: { p: [0.1, 0, 0.26] } }),
          k(0.65, FIGHT, { root: [0.12, 0.12, 20], lf: { p: [0.1, 0, 0.26] }, rf: { p: [-0.13, 0, -0.1] } }),
        ],
        events: [{ t: 0.05, type: 'sfx', name: 'parry' }, { t: 0.3, type: 'hit', limb: 'rh', region: 'chest', strength: 0.8, damage: 30, bleed: 0.4, kind: 'palm', boneBreak: true, breakArm: -1 }],
      },
      {
        recoverT: 0.9,
        keys: [
          vk(0, D, V_PUNCH),
          vk(0.1, D, V_PUNCH, { root: [0.0, 0.1, 0], torso: [20, 18, -6] }),
          vk(0.3, D, V_PUNCH, { e: 'snap', root: [0.05, 0.14, 0], hips: [0, -0.2, 0], hipsR: [20, 20, 0], torso: [36, 10, -8], neck: [-20, 0, 0], head: [-30, -10, 10], rh: H({ p: [-0.05, 1.05, 0.62], sp: 'root' }), lh: H({ p: [0.25, 0.0, 0.2], sp: 'chest' }) }),
          vk(0.55, D, BRAWL, { e: 'out', root: [0.05, -0.1, 0], hips: [0, -0.16, -0.04], torso: [26, 0, 0], head: [10, 0, 0], rh: H({ p: [-0.24, -0.4, 0.1], sp: 'chest' }), lh: H({ p: [-0.05, -0.2, 0.2], sp: 'chest' }), lf: { p: [0.14, 0, -0.05] }, rf: { p: [-0.14, 0, -0.3] } }),
          vk(0.9, D, BRAWL, { root: [0.05, -0.15, 0], hips: [0, -0.12, -0.04], torso: [18, 0, 0], rh: H({ p: [-0.24, -0.4, 0.1], sp: 'chest' }), lh: H({ p: [-0.05, -0.2, 0.2], sp: 'chest' }), lf: { p: [0.14, 0, -0.05] }, rf: { p: [-0.14, 0, -0.32] } }),
        ],
      },
      D,
    );
  }
  // =================================================================== COUNTER: hip toss (ragdoll flight)
  {
    const D = 0.9;
    definePaired(
      'ctr_throw',
      {
        hitT: 0.3, recoverT: 0.6,
        keys: [
          k(0, FIGHT),
          k(0.12, FIGHT, { e: 'out', root: [0.0, 0.2, 60], hips: [0, -0.14, 0.05], hipsR: [10, 0, 0], torso: [14, 0, 0], lh: H({ aim: 'p.handR', roll: 90 }), rh: H({ aim: 'p.uarmR', roll: 60 }), lf: { p: [0.05, 0, 0.42], yaw: 80 }, rf: { p: [-0.1, 0, 0.2], yaw: 120 } }),
          k(0.3, FIGHT, { e: 'snap', root: [0.0, 0.3, 160], hips: [0, -0.24, 0.0], hipsR: [30, 0, 0], torso: [36, 0, 0], lh: H({ aim: 'p.handR', roll: 90 }), rh: H({ aim: 'p.uarmR', roll: 60 }), lf: { p: [0.12, 0, 0.5], yaw: 160 }, rf: { p: [-0.12, 0, 0.2], yaw: 170 } }),
          k(0.45, FIGHT, { e: 'out', root: [0.0, 0.3, 180], hips: [0, -0.18, 0], torso: [20, 0, 0], lh: H({ aim: null, p: [0.2, -0.1, 0.4], sp: 'chest' }), rh: H({ aim: null, p: [-0.2, -0.1, 0.4], sp: 'chest' }), lf: { p: [0.12, 0, 0.5], yaw: 175 }, rf: { p: [-0.12, 0, 0.2], yaw: 170 } }),
          k(0.62, FIGHT, { root: [0.0, 0.3, 180], lf: { p: [0.12, 0, 0.5], yaw: 176 }, rf: { p: [-0.12, 0, 0.18], yaw: 142 } }),
        ],
        events: [{ t: 0.05, type: 'sfx', name: 'parry' }, { t: 0.08, type: 'sfx', name: 'grunt_attack' }, { t: 0.28, type: 'throw', dir: [0, 0.9, -1.0], power: 7 }],
      },
      {
        keys: [
          vk(0, D, V_PUNCH),
          vk(0.12, D, V_PUNCH, { root: [0, 0.25, 0], torso: [24, 10, 0] }),
          vk(0.28, D, V_PUNCH, { root: [0.0, 0.5, 0], hips: [0, 0.1, 0.1], torso: [40, 0, 0] }),
          vk(0.3, D, V_PUNCH, { root: [0.0, 0.55, 0], hips: [0, 0.15, 0.1], torso: [45, 0, 0] }),
        ],
      },
      D,
    );
  }
  // =================================================================== COUNTER: weapon disarm (knife/club/sword)
  {
    const D = 1.0;
    definePaired(
      'ctr_disarm',
      {
        hitT: 0.32, recoverT: 0.6,
        keys: [
          k(0, FIGHT),
          k(0.08, FIGHT, { e: 'out', root: [0.06, 0.05, 6], hipsR: [4, -6, 0], torso: [4, 6, 0], lh: H({ aim: 'p.farmR', aimOff: [0.05, 0, 0], roll: 40 }) }),
          k(0.18, FIGHT, { e: 'snap', root: [0.06, 0.12, 6], torso: [10, 20, -4], lh: H({ aim: 'p.farmR', roll: 40 }), rh: H({ aim: 'p.handR', aimOff: [-0.05, 0, 0], roll: 0, pole: [-1, 0, 0] }) }),
          k(0.32, FIGHT, { e: 'snap', root: [0.06, 0.2, 6], hips: [0.02, -0.1, 0.06], hipsR: [6, 18, 0], torso: [12, 22, -4], lh: H({ aim: null, p: [0.15, 0.2, 0.3], sp: 'chest' }), rh: H({ p: [0, 1.5, 0.85], aim: 'p.head', aimOff: [0, 0, -0.06], roll: 86, pole: [-0.6, -0.6, -0.3] }), rf: { p: [-0.12, 0, -0.12], pitch: 30 }, lf: { p: [0.1, 0, 0.3] } }),
          k(0.46, FIGHT, { e: 'out', root: [0.06, 0.2, 6], rh: H({ aim: null, p: [-0.03, 0.19, 0.25], sp: 'chest' }), rf: { p: [-0.13, 0, -0.06], pitch: 0 }, lf: { p: [0.1, 0, 0.3] } }),
          k(0.62, FIGHT, { root: [0.06, 0.2, 6], lf: { p: [0.1, 0, 0.3] }, rf: { p: [-0.13, 0, -0.04] } }),
        ],
        events: [{ t: 0.05, type: 'sfx', name: 'sword_clash' }, { t: 0.18, type: 'disarm' }, { t: 0.32, type: 'hit', limb: 'rh', region: 'head', strength: 0.9, damage: 22, bleed: 0.5, kind: 'punch' }],
      },
      {
        recoverT: 0.65,
        keys: [
          vk(0, D, V_PUNCH),
          vk(0.18, D, V_PUNCH, { e: 'snap', torso: [6, 26, -8], rh: H({ p: [0.1, 1.2, 0.6], sp: 'root' }) }),
          vk(0.32, D, BRAWL, { e: 'snap', root: [0, 0.02, 0], hips: [0, -0.04, -0.05], torso: [-14, 0, 0], neck: [-14, 0, 0], head: [-26, 4, 0] }),
          vk(0.46, D, BRAWL, { e: 'out', root: [0, -0.24, 0], torso: [-6, 0, 0], head: [-10, 6, 0], lf: { p: [0.14, 0, -0.06] }, rf: { p: [-0.15, 0, -0.34] } }),
          vk(0.66, D, BRAWL, { root: [0, -0.28, 0], lf: { p: [0.14, 0, -0.06] }, rf: { p: [-0.15, 0, -0.36] } }),
        ],
      },
      D,
    );
  }

  // =================================================================== FINISHER: jumping spin roundhouse to head
  {
    const D = 1.1;
    definePaired(
      'fin_roundhouse',
      {
        hitT: 0.42, recoverT: 0.85,
        keys: [
          k(0, FIGHT),
          k(0.14, FIGHT, { e: 'in', root: [0, 0.1, -40], hips: [0, -0.18, 0], hipsR: [10, -20, 0], torso: [14, -20, 0], head: [0, 40, 0], lf: { p: [0.08, 0, 0.25], yaw: -40, pitch: 15 } }),
          k(0.3, FIGHT, { e: 'linear', root: [0, 0.2, -190], hips: [0, 0.2, 0], hipsR: [-4, -40, -10], torso: [0, -30, 10], head: [-6, -20, 0], lf: { p: [0.08, 0.35, 0.3], pitch: 30 }, rf: { p: [-0.15, 0.6, 0.0], pitch: 40, pole: [0, 0.6, 1] } }),
          k(0.42, FIGHT, { e: 'snap', root: [0, 0.25, -305], hips: [0, 0.3, 0], hipsR: [-6, 60, -28], torso: [-8, -30, 24], neck: [0, -10, -6], head: [-6, -30, -10], lf: { p: [0.1, 0.4, 0.3], pitch: 30, pole: [0, 0.5, 1] }, rf: { p: [0.25, 1.55, 0.95], aim: 'p.head', aimW: 1, aimOff: [0.16, -0.04, -0.06], pitch: 45, pole: [-0.2, 1, 0.1] } }),
          k(0.6, FIGHT, { e: 'out', root: [0, 0.28, -350], hips: [0, -0.15, 0], hipsR: [6, 30, -6], torso: [6, -10, 4], lf: { p: [0.12, 0, 0.32], pitch: 0, yaw: -350 }, rf: { p: [-0.12, 0, 0.0], aim: null, aimW: 0, pitch: 0, yaw: -390 } }),
          k(0.9, FIGHT, { root: [0, 0.28, -360], lf: { p: [0.12, 0, 0.32], yaw: -364 }, rf: { p: [-0.13, 0, 0.0], yaw: -398 } }),
        ],
        events: [{ t: 0.15, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.2, type: 'sfx', name: 'grunt_attack' }, { t: 0.42, type: 'hit', limb: 'rf', region: 'head', strength: 1.5, damage: 999, bleed: 1.2, kind: 'kick', dir: 'left', finisher: true, launch: 5 }],
      },
      {
        keys: [vk(0, D, BRAWL, { head: [6, 0, 6], torso: [8, 0, 4] }), vk(0.42, D, BRAWL, { root: [0.0, 0.05, 0], head: [10, -10, 8], torso: [10, 0, 6] })],
      },
      D,
      { side: 1, height: 1.0, dist: 3.4, fov: 46, orbit: 0.25 },
    );
  }
  // =================================================================== FINISHER: arm break + knee to face
  {
    const D = 0.95;
    definePaired(
      'fin_armknee',
      {
        hitT: 0.62, recoverT: 1.0,
        keys: [
          k(0, FIGHT),
          k(0.12, FIGHT, { e: 'out', root: [0.05, 0.1, 15], lh: H({ aim: 'p.handR', roll: 90 }), rh: H({ p: [-0.1, 0.3, 0.2], sp: 'chest' }), torso: [8, 10, 0] }),
          k(0.3, FIGHT, { e: 'snap', root: [0.1, 0.15, 30], hips: [0, -0.15, 0.04], hipsR: [12, 10, 0], torso: [24, 14, 0], lh: H({ aim: 'p.handR', aimOff: [0, -0.08, 0], roll: 90 }), rh: H({ aim: 'p.farmR', aimOff: [0, -0.04, 0], roll: 90, pole: [-0.5, 1, 0] }) }),
          k(0.48, FIGHT, { e: 'out', root: [0.1, 0.2, 10], hips: [0, -0.06, 0.04], torso: [16, 0, 0], lh: H({ aim: 'p.neck', aimOff: [0.06, 0.04, -0.05], roll: 70 }), rh: H({ aim: 'p.neck', aimOff: [-0.06, 0.04, -0.05], roll: 70 }) }),
          k(0.62, FIGHT, { e: 'snap', root: [0.1, 0.24, 10], hips: [0, 0.02, 0.1], hipsR: [-10, -6, 0], torso: [22, -4, 0], lh: H({ aim: 'p.neck', aimOff: [0.06, -0.08, -0.05] }), rh: H({ aim: 'p.neck', aimOff: [-0.06, -0.08, -0.05] }), rf: { p: [-0.06, 0.55, 0.3], pitch: 55, pole: [0, 0.3, 1] }, lf: { pitch: 18 } }),
          k(0.8, FIGHT, { e: 'out', root: [0.1, 0.24, 10], torso: [8, 0, 0], lh: H({ aim: null, p: [0.17, 0.17, 0.33], sp: 'chest' }), rh: H({ aim: null, p: [-0.03, 0.19, 0.25], sp: 'chest' }), rf: { p: [-0.12, 0, 0.02], pitch: 0 }, lf: { pitch: 0 } }),
          k(1.0, FIGHT, { root: [0.1, 0.24, 10], rf: { p: [-0.13, 0, 0.02] } }),
        ],
        events: [{ t: 0.3, type: 'hit', limb: 'rh', region: 'chest', strength: 0.6, damage: 1, bleed: 0.3, kind: 'palm', boneBreak: true, breakArm: -1, noKill: true }, { t: 0.62, type: 'hit', limb: 'rk', region: 'head', strength: 1.4, damage: 999, bleed: 1.3, kind: 'knee', finisher: true, launch: 2 }],
      },
      {
        keys: [
          vk(0, D, BRAWL, { head: [10, 0, 6], torso: [10, 0, 0], rh: H({ p: [-0.05, 1.3, 0.55], sp: 'root' }) }),
          vk(0.3, D, BRAWL, { e: 'snap', root: [0.05, 0.12, 0], hips: [0, -0.2, 0], hipsR: [20, 20, 0], torso: [36, 10, -8], head: [-30, -10, 10], rh: H({ p: [-0.05, 1.0, 0.6], sp: 'root' }) }),
          vk(0.5, D, BRAWL, { root: [0.05, 0.16, 0], hips: [0, -0.3, -0.05], hipsR: [30, 0, 0], torso: [40, 0, 0], head: [20, 0, 0], rh: H({ p: [-0.24, -0.4, 0.1], sp: 'chest' }) }),
          vk(0.62, D, BRAWL, { e: 'snap', root: [0.05, 0.16, 0], hips: [0, -0.18, -0.08], hipsR: [0, 0, 0], torso: [-10, 0, 0], neck: [-20, 0, 0], head: [-40, 0, 0], rh: H({ p: [-0.24, -0.4, 0.1], sp: 'chest' }) }),
        ],
      },
      D,
      { side: -1, height: 1.2, dist: 3.0, fov: 44, orbit: -0.2 },
    );
  }
  // =================================================================== FINISHER: double palm launch
  {
    const D = 1.0;
    definePaired(
      'fin_palm',
      {
        hitT: 0.36, recoverT: 0.75,
        keys: [
          k(0, FIGHT),
          k(0.2, FIGHT, { e: 'out', root: [0, -0.05, 0], hips: [0, -0.2, -0.06], hipsR: [6, -10, 0], torso: [-4, 0, 0], lh: H({ p: [0.18, -0.02, 0.05], sp: 'chest', roll: -10 }), rh: H({ p: [-0.18, -0.02, 0.05], sp: 'chest', roll: -10 }) }),
          k(0.36, FIGHT, { e: 'snap', root: [0, 0.3, 0], hips: [0, -0.16, 0.1], hipsR: [12, -2, 0], torso: [14, 0, 0], lh: H({ p: [0.12, 1.3, 0.8], aim: 'p.chest', aimOff: [0.1, 0, -0.1], roll: -90, dir: [0, 1, 0.3], dirW: 0.7 }), rh: H({ p: [-0.12, 1.3, 0.8], aim: 'p.chest', aimOff: [-0.1, 0, -0.1], roll: -90, dir: [0, 1, 0.3], dirW: 0.7 }), lf: { p: [0.1, 0, 0.5] }, rf: { p: [-0.13, 0, -0.05], pitch: 25 } }),
          k(0.55, FIGHT, { e: 'out', root: [0, 0.32, 0], lh: H({ aim: null, dir: null, p: [0.3, 0.2, 0.45], sp: 'chest' }), rh: H({ aim: null, dir: null, p: [-0.3, 0.2, 0.45], sp: 'chest' }), lf: { p: [0.1, 0, 0.5] }, rf: { p: [-0.13, 0, -0.02], pitch: 0 } }),
          k(0.8, FIGHT, { root: [0, 0.32, 0], lf: { p: [0.1, 0, 0.5] }, rf: { p: [-0.13, 0, 0.1] } }),
        ],
        events: [{ t: 0.1, type: 'sfx', name: 'grunt_attack' }, { t: 0.36, type: 'hit', limb: 'rh', region: 'chest', strength: 1.5, damage: 999, bleed: 0.9, kind: 'palm', finisher: true, launch: 9, boneBreak: true }],
      },
      { keys: [vk(0, D, BRAWL, { head: [8, 4, 8], torso: [6, 0, 6] }), vk(0.36, D, BRAWL, { head: [10, 0, 6] })] },
      D,
      { side: 1, height: 0.8, dist: 3.6, fov: 50, orbit: 0.15 },
    );
  }
  // =================================================================== FINISHER: sweep + axe kick (victim knocked down by ragdoll, then heel drop)
  {
    const D = 1.0;
    definePaired(
      'fin_sweep',
      {
        hitT: 1.0, recoverT: 1.35,
        keys: [
          k(0, FIGHT),
          k(0.12, FIGHT, { e: 'in', root: [0, 0.1, -30], hips: [0, -0.45, 0], hipsR: [20, -40, 0], torso: [30, -20, 0], lf: { p: [0.1, 0, 0.3], pitch: 20 }, lh: H({ p: [0.35, 0.1, 0.5], sp: 'root' }) }),
          k(0.28, FIGHT, { e: 'snap', root: [0, 0.15, -100], hips: [0, -0.55, 0], hipsR: [20, -100, 0], torso: [30, -60, 0], rf: { p: [0.1, 0.05, 0.75], aim: 'p.shinL', aimW: 0.8, pitch: 20, lift: 0.02, pole: [0, 1, 0] }, lf: { p: [0.1, 0, 0.3], yaw: -100 } }),
          k(0.5, FIGHT, { e: 'out', root: [0, 0.15, -20], hips: [0, -0.1, 0], hipsR: [6, -30, 0], torso: [6, -10, 0], rf: { p: [-0.13, 0, -0.1], aim: null, aimW: 0, pitch: 0 }, lf: { p: [0.1, 0, 0.3], yaw: -20 } }),
          k(0.78, FIGHT, { e: 'out', root: [0, 0.4, 0], hips: [0, 0.0, -0.04], hipsR: [-14, -10, 0], torso: [-10, 0, 0], head: [20, 0, 0], rf: { p: [-0.05, 1.7, 0.6], pitch: 30, pole: [0, 0.4, 1] }, lf: { p: [0.1, 0, 0.5] } }),
          k(1.0, FIGHT, { e: 'expoIn', root: [0, 0.45, 0], hips: [0, -0.2, 0.06], hipsR: [20, -10, 0], torso: [24, 0, 0], head: [30, 0, 0], rf: { p: [0, 0.3, 0.8], aim: 'p.chest', aimW: 1, aimOff: [0, 0.05, 0], pitch: -20, pole: [0, 0.5, 1] }, lf: { p: [0.1, 0, 0.5] } }),
          k(1.4, FIGHT, { root: [0, 0.45, 0], rf: { p: [-0.12, 0, 0.3], aim: null, aimW: 0, pitch: 0 }, lf: { p: [0.1, 0, 0.5] } }),
        ],
        events: [{ t: 0.08, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.28, type: 'sweep' }, { t: 0.7, type: 'sfx', name: 'grunt_attack' }, { t: 1.0, type: 'hit', limb: 'rf', region: 'chest', strength: 1.5, damage: 999, bleed: 1.2, kind: 'stomp', finisher: true, boneBreak: true }],
      },
      { keys: [vk(0, D, BRAWL, { head: [8, 0, 6] }), vk(0.28, D, BRAWL, { head: [8, 0, 6] })] },
      D,
      { side: -1, height: 1.4, dist: 3.4, fov: 48, orbit: 0.2 },
    );
  }
  // =================================================================== FINISHER: flying knee to the face
  {
    const D = 1.4;
    definePaired(
      'fin_flyknee',
      {
        hitT: 0.38, recoverT: 0.75,
        keys: [
          k(0, FIGHT),
          k(0.1, FIGHT, { e: 'in', root: [0, 0.3, 0], hips: [0, -0.18, 0.04], hipsR: [12, -10, 0], torso: [18, 0, 0], rf: { p: [-0.1, 0, 0.05], pitch: 30 } }),
          k(0.26, FIGHT, { e: 'out', root: [0, 0.7, 0], hips: [0, 0.38, 0.08], hipsR: [-4, -8, 0], torso: [8, 0, 0], lf: { p: [0.1, 0.45, 0.65], pitch: 30 }, rf: { p: [-0.08, 0.7, 0.6], pitch: 50, pole: [0, 0.5, 1] }, lh: H({ aim: 'p.head', aimOff: [0.12, 0.1, -0.06] }), rh: H({ aim: 'p.head', aimOff: [-0.12, 0.1, -0.06] }) }),
          k(0.38, FIGHT, { e: 'snap', root: [0, 0.82, 0], hips: [0, 0.42, 0.12], hipsR: [-14, -4, 0], torso: [16, 0, 0], lf: { p: [0.1, 0.4, 0.9], pitch: 50 }, rf: { p: [-0.06, 1.05, 1.2], pitch: 60, pole: [0, 0.6, 1] }, lh: H({ aim: 'p.head', aimOff: [0.1, 0.06, -0.06] }), rh: H({ aim: 'p.head', aimOff: [-0.1, 0.06, -0.06] }) }),
          k(0.56, FIGHT, { e: 'in', root: [0, 1.15, 0], hips: [0, -0.05, 0.05], torso: [10, 0, 0], lh: H({ aim: null, p: [0.2, 0.2, 0.3], sp: 'chest' }), rh: H({ aim: null, p: [-0.05, 0.2, 0.25], sp: 'chest' }), lf: { p: [0.1, 0, 1.3], pitch: 0 }, rf: { p: [-0.12, 0, 1.0], pitch: 0 } }),
          k(0.8, FIGHT, { root: [0, 1.15, 0], lf: { p: [0.1, 0, 1.32] }, rf: { p: [-0.13, 0, 1.0] } }),
        ],
        events: [{ t: 0.08, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.12, type: 'sfx', name: 'grunt_attack' }, { t: 0.38, type: 'hit', limb: 'rk', region: 'head', strength: 1.5, damage: 999, bleed: 1.4, kind: 'knee', finisher: true, launch: 4, dir: 'up' }],
      },
      { keys: [vk(0, D, BRAWL, { head: [6, 0, 4] }), vk(0.38, D, BRAWL, { head: [8, 0, 4] })] },
      D,
      { side: 1, height: 1.3, dist: 3.2, fov: 46, orbit: 0.3 },
    );
  }
  // =================================================================== ENVIRONMENT: head slam into surface behind victim
  {
    const D = 0.8;
    definePaired(
      'env_slam',
      {
        hitT: 0.46, recoverT: 0.85,
        keys: [
          k(0, FIGHT),
          k(0.14, FIGHT, { e: 'out', root: [0, 0.15, 0], hips: [0, -0.08, 0.04], torso: [12, 0, 0], lh: H({ aim: 'p.neck', aimOff: [0.04, 0.02, -0.06], roll: 70 }), rh: H({ aim: 'p.head', aimOff: [-0.05, 0.03, -0.06], roll: 70 }) }),
          k(0.46, FIGHT, { e: 'in3', root: [0, 0.75, 0], hips: [0, -0.12, 0.14], hipsR: [14, 0, 0], torso: [26, 0, 0], lh: H({ aim: 'p.neck', aimOff: [0.04, 0.0, -0.06] }), rh: H({ aim: 'p.head', aimOff: [-0.05, 0.0, -0.06] }), lf: { p: [0.1, 0, 0.7] }, rf: { p: [-0.13, 0, 0.3], pitch: 30 } }),
          k(0.62, FIGHT, { e: 'out', root: [0, 0.68, 0], hips: [0, -0.08, 0.0], torso: [8, 0, 0], lh: H({ aim: null, p: [0.17, 0.17, 0.33], sp: 'chest' }), rh: H({ aim: null, p: [-0.03, 0.19, 0.25], sp: 'chest' }), lf: { p: [0.1, 0, 0.7] }, rf: { p: [-0.13, 0, 0.35], pitch: 0 } }),
          k(0.9, FIGHT, { root: [0, 0.65, 0], lf: { p: [0.1, 0, 0.7] }, rf: { p: [-0.13, 0, 0.36] } }),
        ],
        events: [{ t: 0.1, type: 'sfx', name: 'grunt_attack' }, { t: 0.46, type: 'slam' }],
      },
      {
        keys: [
          vk(0, D, BRAWL),
          vk(0.14, D, BRAWL, { root: [0, -0.05, 0], torso: [-10, 0, 0], head: [-10, 0, 0] }),
          vk(0.46, D, BRAWL, { e: 'in3', root: [0, -0.62, 0], hips: [0, -0.06, -0.08], torso: [-24, 0, 0], neck: [-14, 0, 0], head: [-20, 0, 0], lf: { p: [0.14, 0, -0.3] }, rf: { p: [-0.14, 0, -0.55] } }),
        ],
      },
      D,
      { side: 1, height: 1.2, dist: 3.0, fov: 46, orbit: 0.2 },
    );
  }
  // =================================================================== GROUND TAKEDOWN: stomp (victim lying on back)
  {
    const D = 0.75;
    definePaired(
      'gt_stomp',
      {
        hitT: 0.5, recoverT: 0.85,
        keys: [
          k(0, FIGHT),
          k(0.28, FIGHT, { e: 'out', root: [0, 0.1, 0], hips: [0, 0.0, -0.04], hipsR: [-8, -10, 0], torso: [-4, 0, 0], head: [30, 0, 0], rf: { p: [-0.1, 0.6, 0.35], pitch: 20, pole: [0, 0.4, 1] } }),
          k(0.5, FIGHT, { e: 'expoIn', root: [0, 0.15, 0], hips: [0, -0.14, 0.05], hipsR: [12, -10, 0], torso: [16, 0, 0], head: [35, 0, 0], rf: { p: [-0.05, 0.12, 0.6], aim: 'p.head', aimW: 1, aimOff: [0, 0.06, 0], pitch: 0, pole: [0, 0.3, 1] } }),
          k(0.7, FIGHT, { e: 'out', root: [0, 0.15, 0], rf: { p: [-0.12, 0, 0.1], aim: null, aimW: 0 }, head: [10, 0, 0] }),
          k(0.9, FIGHT, { root: [0, 0.15, 0], rf: { p: [-0.13, 0, 0.0] } }),
        ],
        events: [{ t: 0.3, type: 'sfx', name: 'grunt_attack' }, { t: 0.5, type: 'hit', limb: 'rf', region: 'head', strength: 1.3, damage: 999, bleed: 1.3, kind: 'stomp', finisher: true, boneBreak: true, ground: true }],
      },
      { keys: [vk(0, D, BRAWL), vk(1, D, BRAWL)] },
      D,
      { side: 1, height: 1.6, dist: 2.6, fov: 48, orbit: 0.2 },
    );
  }
  // =================================================================== GRAB: hold by the collar (loop), knee, throw
  {
    const D = 0.72;
    definePaired(
      'grab_hold',
      {
        loop: true,
        keys: [
          k(0, FIGHT, { lh: H({ aim: 'p.neck', aimOff: [0.0, -0.03, -0.06], roll: 80 }), rh: H({ p: [-0.18, 0.22, 0.1], sp: 'chest', roll: 30 }), torso: [6, 6, 0] }),
          k(0.5, FIGHT, { lh: H({ aim: 'p.neck', aimOff: [0.0, -0.05, -0.06], roll: 80 }), rh: H({ p: [-0.18, 0.2, 0.1], sp: 'chest', roll: 30 }), torso: [8, 6, 0] }),
          k(1.0, FIGHT, { lh: H({ aim: 'p.neck', aimOff: [0.0, -0.03, -0.06], roll: 80 }), rh: H({ p: [-0.18, 0.22, 0.1], sp: 'chest', roll: 30 }), torso: [6, 6, 0] }),
        ],
      },
      {
        loop: true,
        keys: [
          vk(0, D, BRAWL, { hips: [0, -0.1, -0.06], torso: [14, 0, 0], head: [-10, 0, 0], lh: H({ aim: 'p.handL', aimOff: [0.04, -0.02, 0.02], roll: 60 }), rh: H({ aim: 'p.farmL', aimOff: [-0.03, 0, 0.02], roll: 60 }) }),
          vk(0.5, D, BRAWL, { hips: [0, -0.12, -0.06], torso: [16, 4, 0], head: [-12, 6, 0], lh: H({ aim: 'p.handL', aimOff: [0.04, -0.02, 0.02], roll: 60 }), rh: H({ aim: 'p.farmL', aimOff: [-0.03, 0, 0.02], roll: 60 }) }),
          vk(1.0, D, BRAWL, { hips: [0, -0.1, -0.06], torso: [14, 0, 0], head: [-10, 0, 0], lh: H({ aim: 'p.handL', aimOff: [0.04, -0.02, 0.02], roll: 60 }), rh: H({ aim: 'p.farmL', aimOff: [-0.03, 0, 0.02], roll: 60 }) }),
        ],
      },
      D,
    );
    definePaired(
      'grab_knee',
      {
        hitT: 0.2, recoverT: 0.42,
        keys: [
          k(0, FIGHT, { lh: H({ aim: 'p.neck', aimOff: [0.0, -0.03, -0.06], roll: 80 }), rh: H({ aim: 'p.neck', aimOff: [-0.06, -0.02, -0.05], roll: 70 }), torso: [10, 0, 0] }),
          k(0.2, FIGHT, { e: 'snap', hips: [0, 0.0, 0.08], hipsR: [-10, -4, 0], torso: [18, 0, 0], lh: H({ aim: 'p.neck', aimOff: [0.0, -0.08, -0.06] }), rh: H({ aim: 'p.neck', aimOff: [-0.06, -0.08, -0.05] }), rf: { p: [-0.06, 0.42, 0.18], pitch: 55, pole: [0, 0.3, 1] }, lf: { pitch: 15 } }),
          k(0.42, FIGHT, { e: 'out', lh: H({ aim: 'p.neck', aimOff: [0.0, -0.03, -0.06] }), rh: H({ aim: null, p: [-0.18, 0.22, 0.1], sp: 'chest' }), torso: [6, 6, 0], rf: { p: [-0.13, 0, -0.17], pitch: 0 }, lf: { pitch: 0 } }),
        ],
        events: [{ t: 0.1, type: 'sfx', name: 'whoosh_light' }, { t: 0.2, type: 'hit', limb: 'rk', region: 'gut', strength: 0.85, damage: 16, bleed: 0.2, kind: 'knee', grabHit: true }],
      },
      {
        keys: [
          vk(0, D, BRAWL, { hips: [0, -0.1, -0.06], torso: [14, 0, 0], head: [-10, 0, 0] }),
          vk(0.2, D, BRAWL, { e: 'snap', hips: [0, -0.06, -0.12], torso: [36, 0, 0], head: [20, 0, 0], lh: H({ p: [0.1, -0.2, 0.2], sp: 'chest' }), rh: H({ p: [-0.1, -0.2, 0.2], sp: 'chest' }) }),
          vk(0.42, D, BRAWL, { hips: [0, -0.1, -0.06], torso: [18, 0, 0], head: [-6, 0, 0] }),
        ],
      },
      D,
    );
    definePaired(
      'grab_throw',
      {
        hitT: 0.22, recoverT: 0.5,
        keys: [
          k(0, FIGHT, { lh: H({ aim: 'p.neck', aimOff: [0.0, -0.03, -0.06], roll: 80 }), rh: H({ aim: 'p.chest', aimOff: [-0.05, 0, -0.08], roll: 60 }) }),
          k(0.12, FIGHT, { e: 'out', root: [0, -0.05, 25], hips: [0, -0.12, -0.04], hipsR: [6, -30, 0], torso: [10, -20, 0], lh: H({ aim: 'p.neck', aimOff: [0.0, -0.03, -0.06] }), rh: H({ aim: 'p.chest', aimOff: [-0.05, 0, -0.08] }) }),
          k(0.22, FIGHT, { e: 'snap', root: [0, 0.15, -10], hips: [0, -0.15, 0.08], hipsR: [12, 20, 0], torso: [20, 24, 0], lh: H({ aim: null, p: [0.3, 1.2, 0.8], sp: 'root' }), rh: H({ aim: null, p: [-0.1, 1.2, 0.85], sp: 'root' }), lf: { p: [0.12, 0, 0.35] } }),
          k(0.5, FIGHT, { root: [0, 0.15, -10], lf: { p: [0.12, 0, 0.35] } }),
        ],
        events: [{ t: 0.05, type: 'sfx', name: 'grunt_attack' }, { t: 0.22, type: 'throw', dir: [0, 0.35, 1], power: 9 }],
      },
      { keys: [vk(0, D, BRAWL, { hips: [0, -0.1, -0.06], torso: [14, 0, 0] }), vk(0.22, D, BRAWL, { root: [0, -0.15, 0], torso: [-10, 0, 0] })] },
      D,
    );
  }
  // =================================================================== WEAPON FINISHER: bat/club overhead smash
  {
    const D = 1.0;
    definePaired(
      'fin_weapon_club',
      {
        hitT: 0.5, recoverT: 0.9,
        keys: [
          k(0, FIGHT, { rh: H({ p: [-0.16, 0.02, 0.3], sp: 'chest', dir: [0, 0.3, 1], dirW: 0.6 }) }),
          k(0.3, FIGHT, { e: 'out', root: [0, 0.05, 0], hips: [0, 0.0, -0.06], hipsR: [-10, -15, 0], torso: [-18, -6, 0], head: [-10, 10, 0], rh: H({ p: [-0.1, 0.6, -0.12], sp: 'chest', roll: -20, pole: [-0.4, 0.6, -0.6], dir: [0, 0.2, -1], dirW: 1 }), lh: H({ p: [0.0, 0.58, -0.08], sp: 'chest' }) }),
          k(0.5, FIGHT, { e: 'expoIn', root: [0, 0.3, 0], hips: [0, -0.2, 0.08], hipsR: [22, 0, 0], torso: [32, 4, 0], head: [-8, 0, 0], rh: H({ p: [0, 1.0, 0.6], aim: 'p.head', aimOff: [0, -0.5, -0.3], roll: -20, pole: [-0.3, -1, 0], dir: [0, -0.5, 1], dirW: 1 }), lh: H({ p: [-0.02, 0.98, 0.55], aim: 'p.head', aimOff: [0.04, -0.5, -0.35] }), lf: { p: [0.1, 0, 0.42] }, rf: { p: [-0.13, 0, -0.06], pitch: 25 } }),
          k(0.72, FIGHT, { e: 'out', root: [0, 0.32, 0], hipsR: [10, 0, 0], torso: [14, 0, 0], rh: H({ aim: null, p: [-0.15, -0.1, 0.35], sp: 'chest', dir: [0, -0.5, 1], dirW: 1 }), lh: H({ aim: null, p: [0.17, 0.17, 0.33], sp: 'chest' }), lf: { p: [0.1, 0, 0.42] }, rf: { p: [-0.13, 0, -0.04], pitch: 0 } }),
          k(0.95, FIGHT, { root: [0, 0.32, 0], rh: H({ p: [-0.16, 0.02, 0.3], sp: 'chest', dir: [0, 0.3, 1], dirW: 0.6 }), lf: { p: [0.1, 0, 0.42] }, rf: { p: [-0.13, 0, 0.0] } }),
        ],
        events: [{ t: 0.2, type: 'sfx', name: 'grunt_attack' }, { t: 0.38, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.5, type: 'hit', limb: 'rh', region: 'head', strength: 1.5, damage: 999, bleed: 1.5, kind: 'blunt', finisher: true, boneBreak: true, dir: 'down' }],
      },
      { keys: [vk(0, D, BRAWL, { head: [8, 0, 8], torso: [8, 0, 4] }), vk(0.5, D, BRAWL, { head: [10, 0, 8] })] },
      D,
      { side: 1, height: 1.3, dist: 3.0, fov: 46, orbit: 0.2 },
    );
  }
  // =================================================================== WEAPON FINISHER: blade impale + kick off
  {
    const D = 0.85;
    definePaired(
      'fin_weapon_blade',
      {
        hitT: 0.62, recoverT: 1.0,
        keys: [
          k(0, FIGHT, { rh: H({ p: [-0.16, 0.02, 0.3], sp: 'chest', dir: [0, 0.3, 1], dirW: 0.6 }) }),
          k(0.12, FIGHT, { e: 'out', root: [0, 0.05, 0], lh: H({ aim: 'p.neck', aimOff: [0.0, -0.02, -0.06], roll: 80 }), rh: H({ p: [-0.2, -0.05, -0.1], sp: 'chest', dir: [0, 0, 1], dirW: 1, roll: 90 }), torso: [6, -14, 0] }),
          k(0.3, FIGHT, { e: 'expoIn', root: [0, 0.2, 0], hips: [0, -0.1, 0.08], hipsR: [8, 16, 0], torso: [14, 20, -4], lh: H({ aim: 'p.neck', aimOff: [0.0, -0.02, -0.06] }), rh: H({ p: [0, 1.1, 0.6], aim: 'p.chest', aimOff: [-0.02, -0.18, 0.05], dir: [0, 0, 1], dirW: 1, roll: 90, pole: [-0.4, -0.8, -0.3] }) }),
          k(0.5, FIGHT, { root: [0, 0.22, 0], torso: [16, 22, -4], lh: H({ aim: 'p.neck', aimOff: [0.0, -0.04, -0.06] }), rh: H({ aim: 'p.chest', aimOff: [-0.02, -0.16, 0.08], dir: [0, 0.2, 1], dirW: 1 }) }),
          k(0.62, FIGHT, { e: 'snap', root: [0, 0.18, 0], hips: [0, -0.04, -0.04], hipsR: [-12, -10, 0], torso: [-10, -6, 0], lh: H({ aim: null, p: [0.2, 0.2, 0.25], sp: 'chest' }), rh: H({ aim: null, p: [-0.2, 0.05, 0.25], sp: 'chest', dir: [0, 0.3, 1], dirW: 0.8 }), lf: { p: [0.1, 0.9, 0.62], aim: 'p.chest', aimW: 0.8, aimOff: [0, 0, -0.15], pitch: -25, toe: 40, pole: [0, 0.2, 1] } }),
          k(0.8, FIGHT, { e: 'out', root: [0, 0.18, 0], lf: { p: [0.1, 0.3, 0.3], aim: null, aimW: 0, pitch: 0, toe: 0 } }),
          k(1.0, FIGHT, { root: [0, 0.18, 0], lf: { p: [0.1, 0, 0.3] } }),
        ],
        events: [{ t: 0.3, type: 'hit', limb: 'rh', region: 'gut', strength: 0.9, damage: 1, bleed: 1.6, kind: 'blade', noKill: true }, { t: 0.62, type: 'hit', limb: 'lf', region: 'chest', strength: 1.4, damage: 999, bleed: 1.2, kind: 'kick', finisher: true, launch: 6 }],
      },
      {
        keys: [
          vk(0, D, BRAWL, { head: [8, 0, 6] }),
          vk(0.3, D, BRAWL, { e: 'snap', hips: [0, -0.1, -0.08], torso: [30, 0, 0], head: [14, 0, 0], lh: H({ p: [0.06, -0.2, 0.18], sp: 'chest' }), rh: H({ p: [-0.06, -0.2, 0.18], sp: 'chest' }) }),
          vk(0.6, D, BRAWL, { hips: [0, -0.12, -0.08], torso: [34, 0, 0], head: [20, 0, 0], lh: H({ p: [0.06, -0.2, 0.18], sp: 'chest' }), rh: H({ p: [-0.06, -0.2, 0.18], sp: 'chest' }) }),
        ],
      },
      D,
      { side: -1, height: 1.2, dist: 2.8, fov: 44, orbit: -0.2 },
    );
  }
}
