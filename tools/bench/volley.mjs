// "I keep shooting it and it only goes unconscious": time to death after N rounds of a weapon
// spread over the torso and thighs (random-ish aims, several seeds). Reports unconsciousness and
// death times after the volley; ISS at the end of the volley.
import { scene, run, report, fireAt, segPos } from './common.mjs';

const weapon = process.env.WEAPON || 'smg';
const counts = (process.env.COUNTS || '3,6,12').split(',').map(Number);
const seeds = (process.env.SEEDS || '1,2,3').split(',').map(Number);
const SEGS = ['chest', 'abdomen', 'thighL', 'chest', 'pelvis', 'thighR', 'abdomen', 'upperArmL'];
const rows = [];
for (const n of counts) {
  for (const seed of seeds) {
    const { sb, person } = scene(seed, { shape: true });
    for (let i = 0; i < n; i++) {
      const seg = SEGS[(i + seed) % SEGS.length];
      fireAt(sb, weapon, segPos(person, seg), [(((i * 37 + seed * 11) % 13) - 6) / 60, (((i * 53 + seed * 7) % 9) - 4) / 50, 4]);
      run(sb, 0.08);
    }
    const inj = person.injury;
    const iss = inj.vitals().iss;
    const t0 = sb.time;
    let tu = null, td = null;
    run(sb, 300, () => {
      if (tu === null && !inj.conscious) tu = sb.time - t0;
      if (!inj.alive) {
        td = sb.time - t0;
        return false;
      }
    });
    rows.push({ n, seed, iss, tu, td, cause: inj.deathCause });
    console.log(`${weapon} x${String(n).padStart(2)} seed ${seed}: ISS ${iss} unconscious ${tu === null ? '-' : tu.toFixed(1) + 's'} dead ${td === null ? 'ALIVE at 300s' : td.toFixed(1) + 's'} ${inj.deathCause || ''} blood ${Math.round(inj.blood)}`);
  }
}
const deaths = rows.filter((r) => r.td !== null);
report('volley', { weapon, cases: rows.length, dead: deaths.length, medianDeath: deaths.length ? deaths.map((r) => r.td).sort((a, b) => a - b)[Math.floor(deaths.length / 2)] : null, maxISSalive: Math.max(0, ...rows.filter((r) => r.td === null).map((r) => r.iss)) });
