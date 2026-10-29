// Lethality of gunshot wounds. Each scenario shoots a standing dummy and simulates up to `window`
// seconds (default 240), reporting time to unconsciousness and to death (null = survived).
// Expectations (realistic, untreated):
//   head (rifle)                 -> dead immediately (brain)
//   1x pistol, upper arm         -> survives (muscle, humerus, radial nerve)
//   1x pistol, thigh (no vessel) -> survives
//   1x pistol, femoral artery    -> exsanguinates within minutes
//   3x rifle, chest              -> dead within 1 min (heart / great vessels / both lungs)
//   8x pistol, torso             -> dead within 90 s
//   30x SMG, whole body          -> dead within 30 s
//   20x SMG, torso and limbs     -> dead within 30 s (no head / neck hits: haemorrhage, heart, lungs)
//   shotgun, chest, 3 m          -> dead within 1 min
//   4x pistol, abdominal organs  -> dead within minutes (liver / spleen / kidneys bleed persistently)
//   12x pistol, limb muscles     -> slower death from many bleeding wounds and fractures
//   10x pistol, legs (scattered) -> exsanguination over minutes when vessels are hit, but always
//                                   slower than the torso volleys (limb arteries share their
//                                   feeding artery; run on several scene seeds)
//   pistol, carotid artery       -> exsanguinates within minutes (neck haematoma narrows the airway)
//   pistol, back of the neck     -> high cervical cord: apnoea, hypoxic arrest within a few minutes
//   pistol, both lungs           -> bilateral pneumothorax: hypoxic arrest within minutes
//   pistol, jaw / scalp graze    -> survives (bleeding into the mouth, possible knockout)
// Shots aimed at the segment centre converge from `from` (world offset of the muzzle); shots with an
// anatomical aim point (bind-pose coordinates inside the segment) are fired along the segment's own
// axes from `from` (segment-frame offset), so they cross the intended anatomy whatever the pose.
// Env: ONLY=name,name (subset), SEED=n (scene seed of the scenarios without their own, default 3),
// VERBOSE=1 (injury log of each case).
import { scene, run, report, bodyShape, Vec3 } from './common.mjs';
import { raycastPeople } from '../../src/game/weapons.js';

const torso8 = Array.from({ length: 8 }, (_, i) => ['pistol', i % 2 ? 'abdomen' : 'chest', [((i * 37) % 9) / 30 - 0.15, ((i * 53) % 7) / 40 - 0.08, 4]]);
const smg30 = Array.from({ length: 30 }, (_, i) => ['smg', ['chest', 'abdomen', 'pelvis', 'thighL', 'thighR', 'upperArmL', 'upperArmR', 'neck'][i % 8], [((i * 41) % 11) / 30 - 0.18, ((i * 29) % 9) / 40 - 0.1, 4]]);
// the user's case: emptying a magazine into the body (no head or neck hits)
const smg20 = Array.from({ length: 20 }, (_, i) => ['smg', ['chest', 'abdomen', 'pelvis', 'thighL', 'thighR', 'upperArmL', 'upperArmR'][i % 7], [((i * 41) % 11) / 30 - 0.18, ((i * 29) % 9) / 60 - 0.12, 4]]);
const front = (seg, p, w = 'pistol', d = 1.5) => [w, seg, [0, 0, d], p];
const limbs12 = [
  ['thighL', [0.135, 0.78, 0.0]], ['thighR', [-0.135, 0.78, 0.0]], ['thighL', [0.11, 0.66, 0.0]], ['thighR', [-0.11, 0.66, 0.0]],
  ['thighL', [0.14, 0.6, -0.02]], ['thighR', [-0.14, 0.6, -0.02]], ['upperArmL', [0.236, 1.3, -0.04]], ['upperArmR', [-0.236, 1.3, -0.04]],
  ['upperArmL', [0.245, 1.22, -0.045]], ['upperArmR', [-0.245, 1.22, -0.045]], ['shinL', [0.128, 0.33, -0.02]], ['shinR', [-0.128, 0.33, -0.02]],
].map(([seg, p]) => front(seg, p));
// scattered hits over the front of both thighs and shins (low-discrepancy pattern, so some shots
// cross the femoral vessels and some only muscle and bone)
const legs10 = Array.from({ length: 10 }, (_, i) => {
  const seg = ['thighL', 'thighR', 'shinL', 'thighR', 'thighL', 'shinR', 'thighL', 'thighR', 'shinR', 'shinL'][i];
  const u = (i * 0.618034 + 0.2) % 1, v = (i * 0.754878 + 0.5) % 1;
  const sg = seg.endsWith('L') ? 1 : -1;
  const p = seg.startsWith('thigh') ? [sg * (0.04 + 0.11 * u), 0.58 + 0.28 * v, 0.01] : [sg * (0.07 + 0.06 * u), 0.15 + 0.3 * v, -0.01];
  return front(seg, p, 'pistol', 2);
});
const TORSO_VOLLEYS = ['8x pistol torso', '30x SMG body', '20x SMG body no head'];

const SCEN = [
  { name: 'rifle head', expect: 'dead<1s', shots: [['rifle', 'head']] },
  { name: 'pistol upper arm', expect: 'alive', shots: [['pistol', 'upperArmR']] },
  { name: 'pistol thigh', expect: 'alive', shots: [front('thighL', [0.135, 0.72, 0.02], 'pistol', 1)] },
  // the original thigh shot ([0.05, 0.05, 4] at the thigh centre) could sever the femoral artery
  // and vein depending on the spread; both outcomes are now aimed for explicitly
  { name: 'pistol femoral artery', expect: 'dead<240s', shots: [front('thighL', [0.075, 0.75, 0.022], 'pistol', 1)] },
  { name: '3x rifle chest', expect: 'dead<60s', shots: [['rifle', 'chest', [0.12, 0.05, 4]], ['rifle', 'chest', [-0.1, -0.05, 4]], ['rifle', 'chest', [0.02, 0.12, 4]]] },
  { name: '8x pistol torso', expect: 'dead<90s', shots: torso8 },
  { name: '30x SMG body', expect: 'dead<30s', shots: smg30 },
  { name: '20x SMG body no head', expect: 'dead<30s', noHead: true, shots: smg20 },
  { name: 'shotgun chest', expect: 'dead<60s', shots: [['shotgun', 'chest', [0, 0.05, 3]]] },
  { name: '4x pistol abdomen', expect: 'dead<240s', shots: [[-0.06, 1.14], [0.06, 1.12], [-0.075, 1.07], [0.05, 1.05]].map(([x, y]) => front('abdomen', [x, y, 0.04])) },
  { name: '12x pistol limbs', expect: 'dead<300s', window: 300, rof: 30, shots: limbs12 },
  ...[1, 2, 5].map((seed) => ({ name: `10x pistol legs s${seed}`, seed, expect: 'dead<300s', window: 300, slowerThan: TORSO_VOLLEYS, shots: legs10 })),
  { name: 'pistol carotid', expect: 'dead<240s', shots: [front('neck', [0.028, 1.53, 0.0], 'pistol', 1)] },
  { name: 'pistol back of neck', expect: 'dead<240s', shots: [['pistol', 'neck', [0, 0, -1], [0, 1.575, -0.045]]] },
  { name: 'pistol both lungs', expect: 'dead<240s', shots: [front('chest', [-0.085, 1.36, 0.0]), front('chest', [0.09, 1.34, 0.0])] },
  { name: 'pistol jaw', expect: 'alive', shots: [['pistol', 'head', [1.5, 0, 0.15], [0, 1.61, 0.055]]] },
  { name: 'pistol scalp graze', expect: 'alive', shots: [['pistol', 'head', [1.5, 0, 0], [0, 1.778, -0.015]]] },
];

/**
 * A shooter who keeps off the head and neck (`noHead` scenarios): once the dummy is down, a level
 * shot at an arm can run on into the head, so fire from higher up until the line of fire is clear.
 */
function clearOfHead(sb, a) {
  for (let i = 0; i < 8; i++) {
    const dir = a.target.clone().sub(a.origin).normalize();
    const hits = raycastPeople(sb.people, bodyShape(), a.origin, dir, 12);
    if (!hits.some((h) => h.seg.name === 'head' || h.seg.name === 'neck')) break;
    a.origin.y += 0.4;
  }
  return a;
}

/** Muzzle and aim point of one shot (see the header). */
function aim(person, seg, from, bindPt) {
  const s = person.rd.segments[seg];
  if (!bindPt) {
    const t = s.body.pos.clone();
    return { target: t, origin: t.clone().add(new Vec3(from[0], from[1], from[2])) };
  }
  const t = s.body.localToWorld(new Vec3(bindPt[0], bindPt[1], bindPt[2]).sub(s.bindPos), new Vec3());
  return { target: t, origin: t.clone().add(s.body.localDirToWorld(new Vec3(from[0], from[1], from[2]), new Vec3())) };
}

const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const out = [];
for (const s of SCEN) {
  if (only && !only.includes(s.name)) continue;
  const { sb, person } = scene(s.seed ?? +(process.env.SEED || 3), { shape: true, settle: 1 });
  // fire the volley at `rof` rounds/s (default 10), re-aiming at the (possibly moving) body
  let k = 0;
  const shoot = () => {
    const [w, seg, from, bp] = s.shots[k++];
    let a = aim(person, seg, from || [0.03, 0.05, 4], bp);
    if (s.noHead) a = clearOfHead(sb, a);
    sb.fire(w, a.origin, a.target.clone().sub(a.origin).normalize());
  };
  const every = Math.max(1, Math.round(60 / (s.rof || 10)));
  run(sb, Math.max(0.1, (s.shots.length * every) / 60), (i) => {
    if (i % every === 0 && k < s.shots.length) shoot();
  });
  while (k < s.shots.length) shoot();
  const t0 = sb.time;
  let tUnc = null, tDead = null;
  run(sb, s.window || 240, () => {
    const inj = person.injury;
    if (tUnc === null && !inj.conscious) tUnc = sb.time - t0;
    if (tDead === null && !inj.alive) {
      tDead = sb.time - t0;
      return false;
    }
  });
  const inj = person.injury;
  const v = inj.vitals();
  const r = { name: s.name, expect: s.expect, unconscious: tUnc === null ? null : +tUnc.toFixed(1), dead: tDead === null ? null : +tDead.toFixed(1), cause: inj.deathCause, blood: Math.round(inj.blood), wounds: inj.wounds.length, iss: v.iss };
  let pass = s.expect === 'alive' ? r.dead === null : r.dead !== null && r.dead < +s.expect.match(/<(\d+)/)[1];
  // the premise of a `noHead` scenario: death from the body wounds, not a stray head shot
  if (s.noHead && (inj.structSev.brain || inj.structSev.brainstem)) pass = false;
  // (a scenario that must die more slowly than the torso volleys is checked after they have run)
  if (s.slowerThan) {
    const ref = out.filter((x) => s.slowerThan.includes(x.name) && x.dead !== null).map((x) => x.dead);
    if (ref.length && r.dead !== null && r.dead <= Math.max(...ref)) pass = false;
  }
  r.pass = pass;
  out.push(r);
  console.log(`${s.name.padEnd(21)} expect ${s.expect.padEnd(10)} unconscious=${r.unconscious ?? '-'}s dead=${r.dead ?? '-'}s cause=${r.cause ?? '-'} blood=${r.blood} ISS=${r.iss} ${pass ? 'PASS' : 'FAIL'}`);
  if (process.env.VERBOSE) for (const e of inj.injuries) console.log(`    ${e.time.toFixed(1).padStart(6)}s ${e.text}`);
}
report('lethality', { pass: out.filter((r) => r.pass).length, total: out.length, cases: out.map((r) => [r.name, r.dead, r.pass]) });
