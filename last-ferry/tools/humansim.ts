// A human-like player for balance checks (complements the bot's tools/sim.ts).
// It plays the real logic the way a decent first-time player would: holds fire
// whenever something is on screen, lines up with the most urgent zombie by eye
// (the zombie's visual lane, with aiming noise, not the bot's exact inverse of
// the hit rule), reacts with a delay, buys the best gun it can afford (never
// the flare unless FLARE=1, so it saves for the outboard), stomps only when
// grabbed, blows the horn when one nears the gangway and calls the deck gun on
// a crowd. Its own randomness is seeded per run (RSEED, world seed), so run N
// of two tuning variants is the same player until their games diverge
// (paired comparisons).
//
// Usage (repo root): npx vite-node last-ferry/tools/humansim.ts
// Env: RUNS=40 SEED0=2000 RSEED=12345 NOISE=0.35 (aim error, m) REACT=0.35 (s)
//      CH=1 (start chapter; CH=3 starts with the nail gun, shotgun, harpoon and MONEY3=8400)
//      MAXCH=3 HORN=1 CANNON=1 FLARE=0 QUIET=1
import { ESCAPE_X, TICK_RATE } from '../src/config/world';
import { MUZZLE_Z, WEAPONS } from '../src/config/weapons';
import type { WeaponId } from '../src/config/ids';
import { World } from '../src/core/World';
import type { Zombie } from '../src/core/Zombie';

const env = (k: string, d: string): string => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[k] ?? d;
const runs = Number(env('RUNS', '40'));
const seed0 = Number(env('SEED0', '2000'));
const noise = Number(env('NOISE', '0.35'));
const react = Number(env('REACT', '0.35'));
const ch0 = Number(env('CH', '1'));
const maxCh = Number(env('MAXCH', '3'));
const horn = env('HORN', '1') === '1';
const cannon = env('CANNON', '1') === '1';
const flare = env('FLARE', '0') === '1';
const quiet = env('QUIET', '0') === '1';

// Seeded randomness for the player (mulberry32), reseeded per run from RSEED and the world seed:
// run N of two tuning variants is the same player until their games diverge.
const rseed = Number(env('RSEED', '12345')) >>> 0;
let rs = rseed;
const rnd = (): number => {
  rs = (rs + 0x6d2b79f5) >>> 0;
  let t = rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const BUY_ORDER: WeaponId[] = ['outboard', 'harpoon', 'flare', 'shotgun', 'nailgun'];
const cleared = [0, 0, 0, 0];
const causes: Record<string, number> = {};
for (let r = 0; r < runs; r++) {
  const seed = seed0 + r;
  rs = (rseed ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
  const w = new World({ seed, startChapter: ch0, money: ch0 === 3 ? 1e9 : ch0 === 2 ? 3000 : 0 });
  const p = w.player;
  if (ch0 === 3) {
    for (const id of ['nailgun', 'shotgun', 'harpoon'] as const) p.buy(id);
    p.money = Number(env('MONEY3', '8400'));
  }
  const buys: string[] = [];
  const chapters: string[] = [];
  let chT = w.tick;
  w.events.on('buy', (e) => buys.push(`${e.weapon}@${(w.tick / TICK_RATE).toFixed(0)}s`));
  w.events.on('chapterComplete', (e) => {
    cleared[e.num]++;
    chapters.push(`ch${e.num} ${((w.tick - chT) / TICK_RATE).toFixed(0)}s`);
    chT = w.tick;
  });
  let target: Zombie | null = null;
  let aimErr = 0;
  let hesitate = 0;
  while (!w.gameEnded && w.tick < TICK_RATE * 60 * 15 && w.chapter <= maxCh) {
    const inp = p.input;
    inp.left = inp.right = inp.up = inp.down = inp.fire = inp.jump = inp.horn = inp.cannon = false;
    const alive = w.zombies.filter((z) => z.alive);
    const seen = alive.filter((z) => z.onScreen);
    if (w.tick % 25 === 0) {
      for (const id of BUY_ORDER) {
        if (p.has(id) || p.money < WEAPONS[id].price || (id === 'flare' && !flare)) continue;
        p.buy(id);
        break;
      }
    }
    // The most urgent zombie on screen (time to the gangway; the ones past the Bosun first).
    let best: Zombie | null = null;
    let bt = Infinity;
    for (const z of seen) {
      let t = (ESCAPE_X - z.x) / Math.max(0.3, z.speed);
      if (z.x > p.x - 1) t -= 4;
      if (t < bt) {
        bt = t;
        best = z;
      }
    }
    if (best !== target) {
      if (best) {
        hesitate = Math.round(react * TICK_RATE);
        aimErr = (rnd() * 2 - 1) * noise;
      }
      target = best;
    }
    if (w.tick % TICK_RATE === 0) aimErr = aimErr * 0.6 + (rnd() * 2 - 1) * noise * 0.4;
    let wantX = 15;
    let wantZ = p.z;
    if (target) {
      // By eye: the zombie's own lane, not the view-consistent inverse the bot uses.
      wantZ = target.z - MUZZLE_Z[p.weapon.id] + aimErr;
      if (target.x > p.x - 1.5) wantX = Math.min(20.5, target.x + 2.6);
      if (target.crawling && target.x > p.x - 5) {
        wantZ = target.z;
        wantX = target.x + 0.7;
      }
    }
    if (hesitate > 0) hesitate--;
    else if (wantZ > p.z + 0.12) inp.down = true;
    else if (wantZ < p.z - 0.12) inp.up = true;
    if (p.x < wantX - 0.5) inp.right = true;
    else if (p.x > wantX + 0.5) inp.left = true;
    const gas = w.hazards.gasAt(p.x, p.z, 0.3);
    if (gas) {
      inp.up = p.z < gas.z;
      inp.down = p.z >= gas.z;
    }
    inp.fire = seen.some((z) => z.x < p.x + 0.3);
    if (p.grabbers.size > 0 && w.tick % 15 === 0) inp.jump = true;
    if (horn && w.hornReady && alive.some((z) => !z.crawling && z.x > ESCAPE_X - 4)) inp.horn = true;
    if (cannon && w.favourReady && seen.filter((z) => z.x < p.x - 1).length >= 4) inp.cannon = true;
    w.step();
  }
  const g = w.gameOverInfo;
  const cause = g ? (g.reason === 'dead' ? 'dead' : `${g.risen ? 'crawler:' : ''}${g.kind}${g.boss ? '(boss)' : ''}`) : w.phase;
  causes[cause] = (causes[cause] ?? 0) + 1;
  if (!quiet) {
    const st = p.stats;
    console.log(`seed ${seed}: ${w.phase} ch${w.chapter} t=${(w.tick / TICK_RATE).toFixed(0)}s cause=${cause} kills=${st.kills} acc=${Math.round((100 * st.hits) / Math.max(1, st.shots))}% | ${chapters.join(' | ')} | buys ${buys.join(' ')} | horn ${st.horns} cannon ${st.cannonStrikes}`);
  }
}
console.log(`human-like, noise ${noise} react ${react}, ${runs} runs from chapter ${ch0}: cleared ch1 ${cleared[1]}/${runs}, ch2 ${cleared[2]}/${runs}, ch3 (victory) ${cleared[3]}/${runs}`);
console.log(`  causes: ${Object.entries(causes).map(([k, v]) => `${k} ×${v}`).join(', ')}`);
