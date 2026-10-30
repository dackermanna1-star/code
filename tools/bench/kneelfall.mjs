// Collapses after leg / gut gunshots ("fall to knees"): the dummy must go down without striking
// its head on the floor. Reports knock-outs and the worst head-floor impact speed over a matrix of
// shots fired from the front and from behind. ASSIST=0 runs with the balance assist off.
import { scene, run, report, fireAt, segPos } from './common.mjs';

const assist = process.env.ASSIST !== undefined ? +process.env.ASSIST : 1;
const seeds = (process.env.SEEDS || '1,2').split(',').map(Number);
const SHOTS = [
  ['rifle', ['shinL']], ['rifle', ['shinR']], ['rifle', ['thighL']], ['rifle', ['thighR']],
  ['rifle', ['abdomen']], ['rifle', ['pelvis']], ['rifle', ['thighL', 'thighR']],
  ['pistol', ['shinL']], ['pistol', ['thighL']], ['pistol', ['thighR']], ['pistol', ['abdomen']],
  ['pistol', ['pelvis']], ['pistol', ['thighL', 'thighR']], ['pistol', ['shinL', 'shinR']],
  ['smg', ['thighL', 'thighR', 'thighL']], ['shotgun', ['thighL']], ['revolver', ['thighR']],
  ['sniper', ['thighL']], ['sniper', ['abdomen']],
];
let kos = 0, n = 0, worst = 0, strikes = 0;
for (const back of [false, true]) {
  for (const seed of seeds) {
    for (const [w, segs] of SHOTS) {
      const { sb, person } = scene(seed, { shape: true });
      sb.setAssist(assist);
      const z = back ? -4 : 4;
      segs.forEach((seg, i) => fireAt(sb, w, segPos(person, seg), [0.02 * (i + 1), 0.03, z]));
      let ko = false, vmax = 0;
      run(sb, 8, () => {
        for (const imp of sb.world.impactList) {
          if (!imp.bodyB && imp.bodyA === person.rd.segments.head.body) vmax = Math.max(vmax, imp.speed);
        }
        if (person.injury.events.some((e) => e.type === 'ko')) ko = true;
        if (!person.injury.conscious && person.injury.alive && person.injury.koTimer > 0) ko = true;
      });
      n++;
      if (ko) kos++;
      if (vmax > 1.5) strikes++;
      worst = Math.max(worst, vmax);
      if (ko || vmax > 1.5) console.log(`${back ? 'behind' : 'front '} seed ${seed} ${w} ${segs.join('+').padEnd(20)} ko=${ko} headStrike=${vmax.toFixed(2)} m/s final=${person.ctl.mode}`);
    }
  }
}
report('kneelfall', { assist, cases: n, knockouts: kos, headStrikes: strikes, worstHeadSpeed: +worst.toFixed(2) });
