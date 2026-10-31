import { defineClip } from '../clip';
import { BRAWL, FIGHT, k, RELAXED } from './stances';
import { registerStrikes } from './strikes';
import { registerEnemyMoves } from './enemy';
import { registerReactions } from './reactions';
import { registerPaired } from './pairedMoves';

let registered = false;
export function registerAllClips() {
  if (registered) return;
  registered = true;
  registerStrikes();
  registerEnemyMoves();
  registerReactions();
  registerPaired();
  defineClip('pose_fight', { keys: [k(0, FIGHT), k(1, FIGHT)] });
  defineClip('pose_relaxed', { keys: [k(0, RELAXED), k(1, RELAXED)] });
  defineClip('pose_brawl', { keys: [k(0, BRAWL), k(1, BRAWL)] });
  defineClip('pose_tpose', {
    keys: [
      k(0, RELAXED, {
        hips: [0, 0, 0], hipsR: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
        lh: { p: [0.78, 1.47, -0.02], sp: 'root', pole: [0, 0, -1], roll: 0 },
        rh: { p: [-0.78, 1.47, -0.02], sp: 'root', pole: [0, 0, -1], roll: 0 },
        lf: { p: [0.09, 0, 0], yaw: 0 }, rf: { p: [-0.09, 0, 0], yaw: 0 },
      }),
      k(1, RELAXED),
    ],
  });
}
