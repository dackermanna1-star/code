// Lethality of gunshot wounds. Each scenario shoots a standing dummy and simulates up to 240 s,
// reporting time to unconsciousness and to death (null = survived). Expectations (realistic):
//   head (rifle)          -> dead immediately
//   1x pistol, upper arm  -> survives the window
//   1x pistol, thigh      -> survives (unless femoral artery)
//   3x rifle, chest       -> dead within ~1-2 min (massive haemorrhage / cardiac)
//   8x pistol, torso      -> dead within ~2 min
//   30x SMG, whole body   -> dead within ~30 s
//   shotgun, chest, 3 m   -> dead within ~1 min
import { scene, run, report, fireAt, segPos } from './common.mjs';

const SCEN = [
  { name: 'rifle head', expect: 'dead<1s', shots: [['rifle', 'head']] },
  { name: 'pistol upper arm', expect: 'alive', shots: [['pistol', 'upperArmR']] },
  { name: 'pistol thigh', expect: 'alive', shots: [['pistol', 'thighL', [0.05, 0.05, 4]]] },
  { name: '3x rifle chest', expect: 'dead<120s', shots: [['rifle', 'chest', [0.12, 0.05, 4]], ['rifle', 'chest', [-0.1, -0.05, 4]], ['rifle', 'chest', [0.02, 0.12, 4]]] },
  { name: '8x pistol torso', expect: 'dead<150s', shots: Array.from({ length: 8 }, (_, i) => ['pistol', i % 2 ? 'abdomen' : 'chest', [((i * 37) % 9) / 30 - 0.15, ((i * 53) % 7) / 40 - 0.08, 4]]) },
  { name: '30x SMG body', expect: 'dead<45s', shots: Array.from({ length: 30 }, (_, i) => ['smg', ['chest', 'abdomen', 'pelvis', 'thighL', 'thighR', 'upperArmL', 'upperArmR', 'neck'][i % 8], [((i * 41) % 11) / 30 - 0.18, ((i * 29) % 9) / 40 - 0.1, 4]]) },
  { name: 'shotgun chest', expect: 'dead<90s', shots: [['shotgun', 'chest', [0, 0.05, 3]]] },
];
const out = [];
for (const s of SCEN) {
  const { sb, person } = scene(3, { shape: true, settle: 1 });
  // fire the volley at ~10 rounds/s, re-aiming at the (possibly moving) body
  let k = 0;
  run(sb, Math.max(0.1, s.shots.length * 0.1), (i) => {
    if (i % 6 === 0 && k < s.shots.length) {
      const [w, seg, from] = s.shots[k++];
      fireAt(sb, w, segPos(person, seg), from || [0.03, 0.05, 4]);
    }
  });
  while (k < s.shots.length) {
    const [w, seg, from] = s.shots[k++];
    fireAt(sb, w, segPos(person, seg), from || [0.03, 0.05, 4]);
  }
  const t0 = sb.time;
  let tUnc = null, tDead = null;
  run(sb, 240, () => {
    const inj = person.injury;
    if (tUnc === null && !inj.conscious) tUnc = sb.time - t0;
    if (tDead === null && !inj.alive) {
      tDead = sb.time - t0;
      return false;
    }
  });
  const inj = person.injury;
  const r = { name: s.name, expect: s.expect, unconscious: tUnc === null ? null : +tUnc.toFixed(1), dead: tDead === null ? null : +tDead.toFixed(1), cause: inj.deathCause, blood: Math.round(inj.blood), wounds: inj.wounds.length };
  const pass = s.expect === 'alive' ? r.dead === null : r.dead !== null && r.dead < +s.expect.match(/<(\d+)/)[1];
  r.pass = pass;
  out.push(r);
  console.log(`${s.name.padEnd(18)} expect ${s.expect.padEnd(10)} unconscious=${r.unconscious ?? '-'}s dead=${r.dead ?? '-'}s cause=${r.cause ?? '-'} blood=${r.blood} ${pass ? 'PASS' : 'FAIL'}`);
}
report('lethality', { pass: out.filter((r) => r.pass).length, total: out.length, cases: out.map((r) => [r.name, r.dead, r.pass]) });
