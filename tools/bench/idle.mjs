// Quiet standing for 20 s: postural sway of the centre of mass, foot slip, and joint jitter.
// Lower is better for all metrics; the dummy must never leave balance mode.
import { scene, run, finite, report } from './common.mjs';

const results = [];
for (const seed of [1, 2, 3]) {
  const { sb, person } = scene(seed, { settle: 2 });
  const ctl = person.ctl;
  const feet0 = ['L', 'R'].map((s) => person.rd.segments['foot' + s].body.pos.clone());
  let sway = 0, n = 0, jitter = 0, fell = false;
  const com0 = ctl.sens.com.clone();
  run(sb, 20, () => {
    const c = ctl.sens.com;
    sway += (c.x - com0.x) ** 2 + (c.z - com0.z) ** 2;
    n++;
    for (const b of person.rd.bodies) jitter += b.angVel.lengthSq();
    if (ctl.mode !== 'balance') fell = true;
  });
  const slip = ['L', 'R'].map((s, i) => person.rd.segments['foot' + s].body.pos.distanceTo(feet0[i]));
  results.push({ seed, fell, swayRms: Math.sqrt(sway / n), footSlip: Math.max(...slip), angVelRms: Math.sqrt(jitter / n / person.rd.bodies.length), finite: finite(person) });
}
for (const r of results) console.log(`seed ${r.seed}: fell=${r.fell} swayRMS=${(r.swayRms * 1000).toFixed(1)}mm footSlip=${(r.footSlip * 1000).toFixed(1)}mm angVelRMS=${r.angVelRms.toFixed(3)}rad/s`);
report('idle', {
  fell: results.filter((r) => r.fell).length,
  swayMm: +(1000 * Math.max(...results.map((r) => r.swayRms))).toFixed(1),
  slipMm: +(1000 * Math.max(...results.map((r) => r.footSlip))).toFixed(1),
  angVelRms: +Math.max(...results.map((r) => r.angVelRms)).toFixed(3),
  finite: results.every((r) => r.finite),
});
