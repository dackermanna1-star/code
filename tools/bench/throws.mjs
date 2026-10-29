// Thrown objects hitting a standing dummy. "light" cases should normally be absorbed standing
// (stagger, step, flinch); "heavy" cases may knock it down. Score = light cases still standing at
// 5 s (in balance mode or back to it) and never fallen.
import { scene, run, report, segPos, Vec3 } from './common.mjs';

const CASES = [
  // [object, target segment, speed (m/s or null = default), class]
  ['soccerBall', 'chest', 24, 'light'],
  ['soccerBall', 'head', 20, 'light'],
  ['baseball', 'chest', 30, 'light'],
  ['baseball', 'thighL', 30, 'light'],
  ['bottle', 'chest', 15, 'light'],
  ['brick', 'abdomen', 14, 'light'],
  ['brick', 'upperArmR', 14, 'light'],
  ['pipe', 'chest', 12, 'light'],
  ['watermelon', 'chest', 9, 'light'],
  ['crate', 'chest', 6, 'light'],
  ['bowlingBall', 'chest', 8, 'heavy'],
  ['dumbbell', 'chest', 8, 'heavy'],
  ['bowlingBall', 'shinL', 10, 'heavy'],
  ['brick', 'head', 15, 'heavy'],
];
let lightOk = 0, light = 0;
for (const [type, seg, speed, cls] of CASES) {
  let stoodAll = true, falls = 0, stepsTot = 0;
  for (const seed of [1, 2]) {
    const { sb, person } = scene(seed);
    const t = segPos(person, seg);
    const o = new Vec3(t.x + (seed === 1 ? 0.15 : -0.2), t.y + 0.1, 3.2);
    sb.throwObject(type, o, t.clone().sub(o).normalize(), speed);
    let fell = false, steps = 0;
    run(sb, 5, () => {
      steps += person.ctl.events.filter((e) => e.type === 'step').length;
      if (person.ctl.mode === 'falling' || person.ctl.mode === 'ground' || person.ctl.mode === 'unconscious') fell = true;
    });
    if (fell) {
      falls++;
      stoodAll = false;
    }
    stepsTot += steps;
    console.log(`${type.padEnd(11)} -> ${seg.padEnd(9)} ${cls.padEnd(5)} seed ${seed}: ${fell ? 'FELL' : 'stood'} steps=${steps} final=${person.ctl.mode} injuries=${person.injury.injuries.length}`);
  }
  if (cls === 'light') {
    light += 2;
    lightOk += 2 - falls;
  }
}
report('throws', { lightStood: lightOk, lightTotal: light });
