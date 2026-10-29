// Getting up: a 160 N*s shove (back / forward / side) knocks the dummy down; counts cases where it
// gets up and then stands stably for 4 s within 30 s, the mean time to stand, and extra falls.
import { scene, run, report, Vec3 } from './common.mjs';

const seeds = (process.env.SEEDS || '1,2,3,4,5,6').split(',').map(Number);
let stood = 0, total = 0, extraFalls = 0, tsum = 0;
for (const d of ['back', 'fwd', 'side']) {
  for (const seed of seeds) {
    const { sb, person } = scene(seed);
    const imp = { back: new Vec3(0, 0, -160), fwd: new Vec3(0, 0, 160), side: new Vec3(160, 0, 0) }[d];
    const chest = person.rd.segments.chest.body;
    sb.shove(chest, chest.pos.clone(), imp, 0.15);
    let fell = false, standT = 0, first = -1, falls = 0, prev = 'balance';
    run(sb, 30, (i, t) => {
      const m = person.ctl.mode;
      if (m === 'falling' && prev !== 'falling') falls++;
      prev = m;
      if (m !== 'balance') fell = true;
      if (fell && m === 'balance') {
        standT += 1 / 60;
        if (standT > 4 && first < 0) first = t;
      } else standT = 0;
    });
    total++;
    if (first >= 0) {
      stood++;
      tsum += first;
    }
    extraFalls += Math.max(0, falls - 1);
    const inj = person.injury;
    console.log(`${d.padEnd(4)} ${seed}: ${first >= 0 ? `stood at ${first.toFixed(1)}s` : 'never stood'} falls=${falls} final=${person.ctl.mode} pain=${inj.pain.toFixed(2)} fractures=${inj.fractures.map((f) => f.label).join('/') || '-'} conscious=${inj.conscious}`);
  }
}
report('getup', { stood, total, meanTime: stood ? +(tsum / stood).toFixed(1) : null, extraFalls });
