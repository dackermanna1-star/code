// LAST LOOKOUT balance: a simulated sniper plays the waves (aims at the nearest threat with a
// human-ish error that grows with range, leads and compensates drop like a decent player, buys
// rifles / upgrades / repairs between waves). Reports, per wave: duration, kills, gate and cabin
// health, cash. Usage: node tools/bench/towerBalance.mjs [--waves=N] [--skill=0..1] [--seed=N]
import { Vec3, makeRng } from '../../src/physics/math.js';
import { TowerGame } from '../../src/tower/game/game.js';
import { LAYOUT, isWalkable } from '../../src/tower/level/layout.js';
import { RIFLES, UPGRADES } from '../../src/tower/catalog.js';
import { bodyShape } from './common.mjs';

const arg = (k, d) => +(process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const WAVES = arg('waves', 12), SKILL = arg('skill', 0.6), SEED = arg('seed', 1);
const rng = makeRng(SEED * 31 + 7);
const g = new TowerGame({ layout: LAYOUT, isWalkable, shape: bodyShape(), rng: makeRng(SEED) });
const eye = new Vec3(...LAYOUT.tower.eye);
const gauss = () => Math.sqrt(-2 * Math.log(rng() + 1e-9)) * Math.cos(2 * Math.PI * rng());

function threat(z) {
  // climbers on the tower first, then whoever is closest to the gate
  if (z.state === 'climb' || z.state === 'top') return -1000 + (z.state === 'top' ? -100 : 0);
  const p = z.animated ? z.root.pos : z.person.rd.pelvis.pos;
  return Math.hypot(p.x, p.z) - (z.def.boss ? 30 : 0);
}

let thinkT = 0;
function botStep(dt) {
  thinkT -= dt;
  if (thinkT > 0 || !g.rifle.canFire()) return;
  let best = null, bt = Infinity;
  for (const z of g.horde.list) {
    if (!z.alive || z.state === 'frozen') continue;
    const t = threat(z);
    if (t < bt) {
      bt = t;
      best = z;
    }
  }
  if (!best) return;
  // armour: the legs (a downed boss crawls and can barely hurt the gate)
  const armoured = best.def.armor && best.person.injury.armor && best.person.injury.armor.helmet > 0;
  const seg = armoured ? (rng() < 0.5 ? 'thighL' : 'thighR') : 'head';
  const p = best.person.rd.segments[seg].body.pos.clone();
  const d = p.distanceTo(eye);
  if (d > 260) return;
  // a decent player: drop and lead right on average, error grows with range and target speed
  const tf = d / 760;
  p.y += 0.5 * 9.81 * tf * tf;
  if (best.animated) {
    const sp = best.speed();
    p.x += Math.sin(best.facing) * sp * tf;
    p.z += Math.cos(best.facing) * sp * tf;
  }
  const err = (0.0006 + 0.0016 * (1 - SKILL)) * (1 + (best.animated ? best.speed() / 3 : 0.5));
  const dir = p.sub(eye).normalize();
  dir.x += gauss() * err;
  dir.y += gauss() * err;
  dir.z += gauss() * err;
  g.fire(eye.clone(), dir.normalize());
  thinkT = 0.35 + (1 - SKILL) * 0.9 + rng() * 0.4; // time to settle the crosshair
}

function shop() {
  const wants = ['repair', 'rifle:sr10', 'up:rangefinder', 'up:steady', 'up:optics', 'rifle:whisper', 'up:action', 'up:magazine', 'rifle:anvil', 'up:steady', 'up:optics'];
  if (g.gate.hp < g.gate.max * 0.6) g.buy('defence', 'repair');
  for (const w of wants) {
    if (w === 'repair') continue;
    const [k, id] = w.split(':');
    if (k === 'rifle' && !g.owned.rifles.has(id) && g.cash >= RIFLES[id].price) g.buy('rifle', id);
    if (k === 'up') {
      const lv = g.upgradeLevel(id);
      if (lv < UPGRADES[id].levels.length && g.cash >= UPGRADES[id].levels[lv].price) g.buy('upgrade', id);
    }
  }
  if (g.director.wave >= 4 && g.cash > 600) {
    g.buy('ammo', 'ap');
    if (!g.defences.sentry && g.cash > 4000) g.buy('defence', 'sentry');
  }
  // prefer the best rifle owned
  const best = ['anvil', 'whisper', 'sr10', 'm91'].find((r) => g.owned.rifles.has(r));
  if (g.rifle.id !== best) g.equip('rifle', best);
  if (g.owned.ammo.ap > 0) g.equip('ammo', 'ap');
}

g.nextWave();
const DT = 1 / 60;
let waveT = 0;
const t0 = performance.now();
for (let i = 0; i < 60 * 60 * 40; i++) {
  botStep(DT);
  g.step(DT);
  waveT += DT;
  for (const e of g.drainEvents()) {
    if (e.type === 'waveCleared') {
      const s = g.stats;
      console.log(`wave ${String(e.n).padStart(2)} ${waveT.toFixed(0).padStart(4)} s  kills ${String(e.kills).padStart(3)}  gate ${Math.round(g.gate.hp)}/${g.gate.max}  cabin ${Math.round(g.player.hp)}  cash $${g.cash}  rifle ${g.rifle.id}  acc ${(s.hits / Math.max(1, s.shots)).toFixed(2)} hs ${s.headshots}`);
    }
    if (e.type === 'over') console.log(`GAME OVER on wave ${e.wave} (${e.reason})`);
  }
  if (g.over) break;
  if (g.director.phase === 'shop') {
    if (g.director.wave >= WAVES) break;
    shop();
    g.nextWave();
    waveT = 0;
  }
}
console.log(`sim ${((performance.now() - t0) / 1000).toFixed(0)} s real; stats ${JSON.stringify(g.stats)}`);
