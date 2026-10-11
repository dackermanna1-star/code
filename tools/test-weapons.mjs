#!/usr/bin/env node
// Exercises src/game/weaponsys.js + src/game/combatrules.js against a fake game ctx.
//   node tools/test-weapons.mjs          (exit code 1 on any failed check)
//   node tools/test-weapons.mjs -v       (also print every passing check)

import {
  WEAPON_IDS, WEAPON_DEFS, BUTTON, createWeapon, weaponDeploy, weaponHolster, weaponFrame, weaponMaxSpeed,
  dropPunchAngle, buyAmmo, canBuy, nextBestWeapon, WEAPON_OPTIONS,
} from '../src/game/weaponsys.js';
import {
  HITGROUP, HITGROUP_DAMAGE_MULT, WEAPON_ARMOR_RATIO, BULLET, fireBullets3, fireBuckshot, computeDamage, radiusDamage,
  explosionOrigin, radiusFlash, RULES, HE, C4, FLASHBANG, SMOKE, createEconomy, roundEndMoney, grenadeThrow,
  createGrenade, updateGrenade, angleVectors, addAccount,
} from '../src/game/combatrules.js';

const VERBOSE = process.argv.includes('-v');
const { ATTACK, ATTACK2, RELOAD } = BUTTON;
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; if (VERBOSE) console.log(`  ok   ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? '  ' + detail : ''}`); }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const f3 = (x) => (x >= 0 ? ' ' : '') + x.toFixed(3);
function section(title) { console.log(`\n== ${title}`); }

// ------------------------------------------------------------------ fake game
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Sim {
  constructor(id, { seed = 1, dt = 0.01, weapon = {}, knifeTrace = null } = {}) {
    this.dt = dt;
    this.frame = 0;
    this.prev = 0;
    const rng = mulberry32(seed);
    const log = this.log = { shots: [], sounds: [], anims: [], shells: [], grenades: [], plants: [], knife: [], events: [], fov: [], retired: [] };
    const ctx = this.ctx = {
      time: 0, dt, onGround: true, ducking: false, speed2d: 0, waterLevel: 0,
      punch: [0, 0, 0], viewAngles: [0, 0, 0], canShoot: true, inBombZone: false, fov: 90,
      setFov(f) { ctx.fov = f || 90; log.fov.push({ t: ctx.time, fov: f }); },
      fireBullets(p) { log.shots.push({ t: ctx.time, ...p, punchAtFire: ctx.punch.slice() }); },
      knifeTrace: (range) => (knifeTrace ? knifeTrace(range) : { hit: false, hitPlayer: null, behind: false, fraction: 1 }),
      knifeDamage(target, dmg, hg) { log.knife.push({ t: ctx.time, target, dmg, hg }); },
      throwGrenade(type, params) { log.grenades.push({ t: ctx.time, type, ...params }); },
      plantBomb() { log.plants.push(ctx.time); return true; },
      playSound(name, o) { log.sounds.push({ t: ctx.time, name, ...o }); },
      playAnim(name, o) { log.anims.push({ t: ctx.time, name, ...o }); },
      emitShell(type) { log.shells.push({ t: ctx.time, type }); },
      random: rng,
      randomInt: (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)),
      event(type, data) { log.events.push({ t: ctx.time, type, ...data }); },
      retire(w) { log.retired.push({ t: ctx.time, id: w.id }); },
    };
    this.w = createWeapon(id, weapon);
  }
  get t() { return this.ctx.time; }
  setTime() { this.ctx.time = Math.round(this.frame * this.dt * 1e6) / 1e6; }
  deploy() { this.setTime(); return weaponDeploy(this.w, this.ctx); }
  holster() { this.setTime(); return weaponHolster(this.w, this.ctx); }
  step(buttons = 0) {
    this.frame++;
    this.setTime();
    dropPunchAngle(this.ctx.punch, this.dt); // PM_DropPunchAngle runs before ItemPostFrame
    const n = this.log.shots.length;
    weaponFrame(this.w, this.ctx, buttons, this.prev);
    if (this.log.shots.length > n) this.log.shots[this.log.shots.length - 1].punchAfter = this.ctx.punch.slice();
    this.prev = buttons;
  }
  run(seconds, buttons = 0) {
    const n = Math.round(seconds / this.dt);
    for (let i = 0; i < n; i++) this.step(typeof buttons === 'function' ? buttons(this.t) : buttons);
  }
  runUntil(pred, maxSeconds, buttons = 0) {
    const n = Math.round(maxSeconds / this.dt);
    for (let i = 0; i < n; i++) { this.step(typeof buttons === 'function' ? buttons(this.t) : buttons); if (pred()) return true; }
    return false;
  }
}

// ------------------------------------------------------------------ 1. definitions
section('definitions');
check('29 weapon ids', WEAPON_IDS.length === 29 && WEAPON_IDS.every((id) => WEAPON_DEFS[id]));
const d = WEAPON_DEFS;
check('buy-menu names', d.galil.name === 'IDF Defender' && d.famas.name === 'Clarion 5.56' && d.mp5.name === 'KM Sub-Machine Gun' && d.ak47.name === 'CV-47' && d.m4a1.name === 'Maverick M4A1 Carbine' && d.awp.name === 'Magnum Sniper Rifle' && d.deagle.name === 'Night Hawk .50C' && d.usp.name === 'K&M .45 Tactical' && d.glock.name === '9x19mm Sidearm');
check('prices', d.ak47.price === 2500 && d.m4a1.price === 3100 && d.awp.price === 4750 && d.galil.price === 2000 && d.famas.price === 2250 && d.deagle.price === 650 && d.m249.price === 5750 && d.hegrenade.price === 300 && d.flashbang.price === 200);
check('clips / reserve caps', d.ak47.clip === 30 && d.ak47.maxAmmo === 90 && d.galil.clip === 35 && d.famas.clip === 25 && d.m249.clip === 100 && d.m249.maxAmmo === 200 && d.awp.maxAmmo === 30 && d.deagle.maxAmmo === 35 && d.p228.maxAmmo === 52 && d.m3.maxAmmo === 32);
check('ammo buy packs', d.ak47.ammoBuy.cost === 80 && d.ak47.ammoBuy.amount === 30 && d.usp.ammoBuy.cost === 25 && d.usp.ammoBuy.amount === 12 && d.deagle.ammoBuy.amount === 7 && d.awp.ammoBuy.cost === 125 && d.p90.ammoBuy.amount === 50);
check('spawn reserve USP 24 / Glock 40', d.usp.spawnReserve === 24 && d.glock.spawnReserve === 40);
check('team restrictions', canBuy('ak47', 'T') && !canBuy('ak47', 'CT') && canBuy('m4a1', 'CT') && !canBuy('m4a1', 'T') && canBuy('awp', 'T') && canBuy('awp', 'CT') && canBuy('elite', 'T') && !canBuy('elite', 'CT') && canBuy('fiveseven', 'CT') && canBuy('tmp', 'CT') && !canBuy('mac10', 'CT') && !canBuy('c4', 'T') && !canBuy('knife', 'CT'));
check('max speeds', d.ak47.maxSpeed === 221 && d.m4a1.maxSpeed === 230 && d.awp.maxSpeed === 210 && d.awp.maxSpeedZoom === 150 && d.scout.maxSpeed === 260 && d.scout.maxSpeedZoom === 220 && d.sg552.maxSpeedZoom === 200 && d.p90.maxSpeed === 245 && d.m249.maxSpeed === 220 && d.knife.maxSpeed === 250);
check('sound base names', d.ak47.sounds.fire === 'ak47' && d.m4a1.sounds.fireSilenced === 'm4a1_silenced' && d.usp.sounds.fireSilenced === 'usp_silenced');
check('armor ratios exposed', WEAPON_ARMOR_RATIO.ak47 === 1.55 && WEAPON_ARMOR_RATIO.awp === 1.95 && d.ak47.armorRatio === 1.55 && d.usp.armorRatio === 1);
check('slots / weights', d.ak47.slot === 1 && d.usp.slot === 2 && d.knife.slot === 3 && d.hegrenade.slot === 4 && d.c4.slot === 5 && d.famas.weight === 75 && d.knife.weight === 0);
check('auto flags', d.ak47.auto && d.awp.auto && !d.usp.auto && !d.glock.auto && !d.deagle.auto);

// ------------------------------------------------------------------ 2. AK-47 spray
section('AK-47 spray (standing, 100 Hz frames, punch decays every frame)');
{
  const s = new Sim('ak47', { weapon: { reserve: 90 } });
  const dt0 = s.deploy();
  check('AK deploy time 0.75 s', near(dt0, 0.75));
  s.run(0.75); // let DefaultDeploy finish with no buttons (WeaponIdle resets the empty sound)
  check('no shot during the deploy lock', s.log.shots.length === 0);
  s.runUntil(() => s.w.clip === 0, 6, ATTACK);
  const shots = s.log.shots;
  console.log('  #   t      spread    acc(before)  punch@fire (p, y)    punch after kick');
  for (let i = 0; i < shots.length; i++) {
    const sh = shots[i];
    console.log(`  ${String(i + 1).padStart(2)}  ${sh.t.toFixed(2)}  ${sh.spread.toFixed(6)}  ${(sh.spread / 0.0275).toFixed(4)}      ${f3(sh.punchAtFire[0])} ${f3(sh.punchAtFire[1])}      ${f3(sh.punchAfter[0])} ${f3(sh.punchAfter[1])}`);
  }
  check('30 rounds fired', shots.length === 30);
  check('first shot spread = 0.0275 * 0.2', near(shots[0].spread, 0.0055));
  check('shots 2..6 spread = 0.0275 * 0.35 (integer shots^3/200)', shots.slice(1, 6).every((x) => near(x.spread, 0.0275 * 0.35)));
  check('shot 7+ spread = 0.0275 * 1.25', shots.slice(6).every((x) => near(x.spread, 0.0275 * 1.25)));
  const intervals = shots.slice(1).map((x, i) => x.t - shots[i].t);
  check('cycle 0.0955 s -> one shot every 0.10 s at 100 Hz', intervals.every((x) => near(x, 0.1, 1e-6)), `min ${Math.min(...intervals).toFixed(3)} max ${Math.max(...intervals).toFixed(3)}`);
  check('first kick = up_base 1.0', near(shots[0].punchAfter[0], -1.0) && near(Math.abs(shots[0].punchAfter[1]), 0.375));
  check('punch pitch clamped at -5.75', shots.every((x) => x.punchAfter[0] >= -5.75 - 1e-9) && shots.some((x) => near(x.punchAfter[0], -5.75)));
  check('punch yaw clamped at +-1.75', shots.every((x) => Math.abs(x.punchAfter[1]) <= 1.75 + 1e-9));
  check('bullet params', shots[0].damage === 36 && shots[0].rangeModifier === 0.98 && shots[0].penetration === 2 && shots[0].bulletType === BULLET.PLAYER_762MM && shots[0].distance === 8192);
  check('fire sound + rifle shells', s.log.sounds.filter((x) => x.name === 'ak47').length === 30 && s.log.shells.length === 30 && s.log.shells[0].type === 'rshell');
  check('accuracy after 30 shots = 1.25', near(s.w.accuracy, 1.25) && s.w.shotsFired === 30);
  // dry fire while still holding
  const tEmpty = s.t;
  s.run(0.5, ATTACK);
  const clicks = s.log.sounds.filter((x) => x.name === 'dryfire_rifle' && x.t > tEmpty);
  check('dry-fire click every 0.2 s while holding an empty AK', clicks.length >= 2 && near(clicks[1].t - clicks[0].t, 0.2, 0.011), `${clicks.length} clicks`);
  // release -> automatic reload (once the 0.2 s dry-fire delay has passed)
  const started = s.runUntil(() => s.w.inReload, 0.3, 0);
  const tRel = s.t;
  check('auto-reload on release', started && near(s.w.nextAttack - s.t, 2.45));
  s.runUntil(() => !s.w.inReload, 3);
  check('reload done after 2.45 s, 30 moved from reserve', s.w.clip === 30 && s.w.ammo === 60 && near(s.t - tRel, 2.45, 0.011), `t=${(s.t - tRel).toFixed(2)}`);
}

// ------------------------------------------------------------------ 3. accuracy decay (rifles) / pistols
section('recoil recovery');
{
  const s = new Sim('ak47', { weapon: { reserve: 90 } });
  s.deploy(); s.run(0.8);
  s.runUntil(() => s.log.shots.length === 10, 2, ATTACK);
  check('10-shot burst -> shotsFired 10', s.w.shotsFired === 10);
  const t0 = s.t;
  s.runUntil(() => s.w.shotsFired === 0, 2, 0);
  const took = s.t - t0;
  check('shotsFired decays after 0.4 s, then one per >=0.0225 s', took > 0.4 && took < 0.4 + 10 * 0.031, `${took.toFixed(3)} s`);
  check('original: accuracy is NOT reset by the decay', near(s.w.accuracy, 1.25));
  s.run(0.05, ATTACK);
  check('next first shot still uses the stale accuracy (CS 1.6 quirk)', near(s.log.shots[10].spread, 0.0275 * 1.25));

  const p = new Sim('deagle', { weapon: { reserve: 35 } });
  p.deploy(); p.run(0.8);
  p.run(1.0, ATTACK); // hold: semi-automatic
  check('Deagle: holding the trigger fires once', p.log.shots.length === 1);
  // spam (re-press as soon as possible)
  for (let i = 0; i < 4; i++) { p.step(0); p.runUntil(() => p.log.shots.length === i + 2, 1, ATTACK); }
  const ds = p.log.shots.map((x) => x.t);
  check('Deagle refire 0.225 s', near(ds[2] - ds[1], 0.23, 0.011));
  const accSpam = p.w.accuracy;
  check('fast Deagle shots lower accuracy toward 0.55', accSpam < 0.9 && accSpam >= 0.55, `acc ${accSpam.toFixed(3)}`);
  p.run(1.0, 0); p.run(0.05, ATTACK); p.run(0.05, 0);
  check('slow shot (>0.4 s gap) restores accuracy to 0.9', near(p.w.accuracy, 0.9));
  check('Deagle punch -2 per shot', near(p.log.shots[1].punchAfter[0] - p.log.shots[1].punchAtFire[0], -2, 1e-9));
}

// ------------------------------------------------------------------ 4. reload timing / deploy timing
section('deploy / reload timings');
{
  for (const [id, want] of [['ak47', 0.75], ['usp', 0.75], ['knife', 0.75], ['awp', 1.45], ['scout', 1.25], ['m3', 0.75]]) {
    const s = new Sim(id);
    check(`${id} deploy lock ${want} s`, near(s.deploy(), want));
  }
  const s = new Sim('m4a1', { weapon: { reserve: 90, clip: 10 } });
  s.deploy(); s.run(0.8);
  s.step(RELOAD);
  const t0 = s.t;
  check('R starts reload (3.05 s)', s.w.inReload && near(s.w.nextAttack, t0 + 3.05));
  s.runUntil(() => !s.w.inReload, 4);
  check('clip 10 -> 30, reserve 90 -> 70', s.w.clip === 30 && s.w.ammo === 70, `after ${(s.t - t0).toFixed(2)} s`);
  const s2 = new Sim('ak47', { weapon: { reserve: 5, clip: 10 } });
  s2.deploy(); s2.run(0.8); s2.step(RELOAD); s2.run(2.6);
  check('partial reserve: clip 15, reserve 0', s2.w.clip === 15 && s2.w.ammo === 0);
  const s3 = new Sim('ak47', { weapon: { reserve: 90, clip: 10 } });
  s3.deploy(); s3.run(0.8); s3.step(RELOAD); s3.run(1.0); s3.holster(); s3.deploy(); s3.run(3);
  check('holster cancels the reload (no ammo moved)', s3.w.clip === 10 && s3.w.ammo === 90);
  const s4 = new Sim('ak47', { weapon: { reserve: 90 } });
  s4.deploy(); s4.run(0.8); s4.step(RELOAD);
  check('full clip: R does nothing', !s4.w.inReload);
}

// ------------------------------------------------------------------ 5. Glock burst / semi
section('Glock-18 semi-auto and burst');
{
  const s = new Sim('glock', { weapon: { reserve: 40 } });
  s.deploy(); s.run(0.8);
  s.run(1.0, ATTACK);
  check('semi: one shot per trigger pull', s.log.shots.length === 1);
  s.step(0); s.run(0.2, ATTACK);
  check('re-press fires again (spread 0.1 * (1 - 0.9))', s.log.shots.length === 2 && near(s.log.shots[1].spread, 0.01));
  s.step(0);
  s.step(ATTACK2);
  check('ATTACK2 toggles burst mode', s.w.burstMode && s.log.events.some((e) => e.type === 'hud_message' && e.text === '#Switch_To_BurstFire'));
  s.run(0.4, 0);
  const n0 = s.log.shots.length, c0 = s.w.clip;
  s.run(0.03, ATTACK);
  const b = s.log.shots.slice(n0);
  check('burst = 3 rounds on 3 consecutive frames (original server)', b.length === 3 && near(b[2].t - b[0].t, 0.02), b.map((x) => x.t.toFixed(2)).join(','));
  check('burst rounds 2-3: spread 0.05, rangeMod 0.9, damage 25', near(b[1].spread, 0.05) && b[1].rangeModifier === 0.9 && b[2].damage === 25 && b[0].rangeModifier === 0.75);
  check('burst uses 3 rounds', s.w.clip === c0 - 3);
  s.run(0.6, ATTACK);
  const b2 = s.log.shots.slice(n0 + 3);
  check('holding repeats bursts every 0.5 s', b2.length >= 3 && near(b2[0].t - b[0].t, 0.5, 0.011));
  const fast = new Sim('glock', { weapon: { reserve: 40 } });
  WEAPON_OPTIONS.glockBurstUsesTime = true;
  fast.deploy(); fast.run(0.8); fast.step(ATTACK2); fast.run(0.4); fast.run(0.3, ATTACK);
  WEAPON_OPTIONS.glockBurstUsesTime = false;
  check('option glockBurstUsesTime: rounds 0.1 s apart', fast.log.shots.length === 3 && near(fast.log.shots[1].t - fast.log.shots[0].t, 0.1));
}

// ------------------------------------------------------------------ 6. FAMAS burst
section('FAMAS burst');
{
  const s = new Sim('famas', { weapon: { reserve: 90 } });
  s.deploy(); s.run(0.8);
  s.step(ATTACK2); s.run(0.4, 0);
  check('burst mode on', s.w.burstMode);
  s.run(0.6, ATTACK);
  const sh = s.log.shots;
  console.log('  shots:', sh.map((x) => `${x.t.toFixed(2)}s dmg ${x.damage} spread ${x.spread.toFixed(4)}`).join(' | '));
  // FireRemaining fires on the first frame strictly after +0.05, then strictly after +0.1
  check('3 rounds at t, t+0.06, t+0.17 (100 Hz frames)', sh.length >= 3 && near(sh[1].t - sh[0].t, 0.06) && near(sh[2].t - sh[0].t, 0.17));
  check('damage 34 then 30, 30 (FireRemaining uses FAMAS_DAMAGE)', sh[0].damage === 34 && sh[1].damage === 30 && sh[2].damage === 30);
  check('rounds 2-3 reuse the first round spread', near(sh[1].spread, sh[0].spread) && near(sh[2].spread, sh[0].spread));
  check('next burst 0.55 s later', sh.length >= 4 && near(sh[3].t - sh[0].t, 0.55, 0.011));
  const a = new Sim('famas', { weapon: { reserve: 90 } });
  a.deploy(); a.run(0.8); a.run(0.02, ATTACK);
  check('full-auto: +0.01 spread, 30 damage', near(a.log.shots[0].spread, 0.02 * 0.2 + 0.01) && a.log.shots[0].damage === 30);
  const u = new Sim('famas', { weapon: { reserve: 90 } });
  u.deploy(); u.run(0.8); u.ctx.waterLevel = 3; u.run(0.3, ATTACK);
  check('FAMAS cannot fire under water (dry click instead)', u.log.shots.length === 0 && u.log.sounds.some((x) => x.name === 'dryfire_rifle'));
}

// ------------------------------------------------------------------ 7. silencers
section('M4A1 / USP silencer');
{
  const s = new Sim('m4a1', { weapon: { reserve: 90 } });
  s.deploy(); s.run(0.8);
  s.step(ATTACK2);
  const t0 = s.t;
  check('M4A1 attach: 2.0 s lock', s.w.silenced && near(s.w.nextPrimary, t0 + 2.0) && s.log.anims.some((x) => x.name === 'attach_silencer'));
  s.run(1.5, ATTACK);
  check('cannot fire while attaching', s.log.shots.length === 0);
  s.step(0); s.run(0.6, 0);
  s.run(0.02, ATTACK);
  const sh = s.log.shots[0];
  check('silenced: damage 33, rangeMod 0.95, spread 0.025*acc, sound m4a1_silenced', sh && sh.damage === 33 && sh.rangeModifier === 0.95 && near(sh.spread, 0.025 * 0.2) && s.log.sounds.some((x) => x.name === 'm4a1_silenced'));
  s.run(0.5, 0); s.step(ATTACK2); s.run(2.1, 0); s.run(0.02, ATTACK);
  const sh2 = s.log.shots[1];
  check('unsilenced: damage 32, rangeMod 0.97, sound m4a1', sh2 && !s.w.silenced && sh2.damage === 32 && sh2.rangeModifier === 0.97 && s.log.sounds.some((x) => x.name === 'm4a1'));

  const u = new Sim('usp', { weapon: { reserve: 24 } });
  u.deploy(); u.run(0.8);
  u.run(0.02, ATTACK); u.run(0.3, 0);
  u.step(ATTACK2);
  check('USP attach: 3.0 s', u.w.silenced && near(u.w.nextPrimary - u.t, 3.0));
  u.run(3.1, 0); u.run(0.02, ATTACK);
  const [x0, x1] = u.log.shots;
  check('USP unsil 34 dmg / sil 30 dmg', x0.damage === 34 && x1.damage === 30);
  check('USP spread standing: unsil 0.1*(1-acc), sil 0.15*(1-acc)', near(x0.spread, 0.1 * (1 - 0.92)) && near(x1.spread, 0.15 * (1 - 0.92)), `${x0.spread.toFixed(4)} ${x1.spread.toFixed(4)}`);
  check('USP sounds', u.log.sounds.some((x) => x.name === 'usp') && u.log.sounds.some((x) => x.name === 'usp_silenced'));
}

// ------------------------------------------------------------------ 8. shotgun reload
section('M3 shell-by-shell reload');
{
  const s = new Sim('m3', { weapon: { reserve: 32, clip: 2 } });
  s.deploy(); s.run(0.8);
  s.step(RELOAD); // tap R once
  const t0 = s.t;
  check('start reload (0.55 s)', s.w.specialReload === 1 && s.log.anims.some((x) => x.name === 'reload_start'));
  const inserts = [];
  let last = s.w.clip;
  s.runUntil(() => { if (s.w.clip !== last) { inserts.push(s.t); last = s.w.clip; } return s.w.clip === 8 && s.w.specialReload === 0; }, 6, 0);
  console.log('  shells in at:', inserts.map((t) => (t - t0).toFixed(2)).join(' '), ' pump at', (s.t - t0).toFixed(2));
  check('6 shells inserted one at a time', inserts.length === 6 && s.w.clip === 8 && s.w.ammo === 26);
  const gaps = inserts.slice(1).map((x, i) => x - inserts[i]);
  check('~0.45 s per shell', gaps.every((g) => g >= 0.45 && g <= 0.48), gaps.map((g) => g.toFixed(2)).join(','));
  check('first shell after 0.55 + 0.45 s', inserts[0] - t0 >= 0.99 && inserts[0] - t0 <= 1.03);
  check('pump anim ends the reload', s.log.anims.some((x) => x.name === 'reload_end'));

  const i = new Sim('m3', { weapon: { reserve: 32, clip: 2 } });
  i.deploy(); i.run(0.8); i.step(RELOAD); i.run(1.2, 0);
  const clipBefore = i.w.clip;
  i.run(0.02, ATTACK);
  check('firing interrupts the reload', i.log.shots.length === 1 && i.w.specialReload === 0 && i.w.clip === clipBefore - 1);
  const sh = i.log.shots[0];
  check('M3 blast: 9 pellets, cone 0.0675, 3000 units, 20 dmg', sh.shots === 9 && sh.spreadX === 0.0675 && sh.distance === 3000 && sh.damage === 20 && sh.bulletType === BULLET.PLAYER_BUCKSHOT);
  check('M3 punch 4..6 on the ground', -sh.punchAfter[0] >= 4 - 0.1 && -sh.punchAfter[0] <= 6 + 1e-9);
  i.run(0.9, ATTACK);
  check('M3 refire 0.875 s', i.log.shots.length === 2 && near(i.log.shots[1].t - i.log.shots[0].t, 0.88, 0.011));

  const x = new Sim('xm1014', { weapon: { reserve: 32, clip: 0 } });
  x.deploy(); x.run(0.8); x.run(0.01, 0);
  const tx = x.t;
  x.runUntil(() => x.w.clip === 7, 4, 0);
  check('XM1014 auto-reloads when empty, 0.3 s per shell', x.w.clip === 7 && x.t - tx < 0.55 + 7 * 0.32, `${(x.t - tx).toFixed(2)} s`);
}

// ------------------------------------------------------------------ 9. AWP zoom / speed
section('AWP / Scout / AUG zoom');
{
  const s = new Sim('awp', { weapon: { reserve: 30 } });
  s.deploy(); s.run(1.5);
  check('AWP unzoomed speed 210', weaponMaxSpeed(s.w) === 210);
  s.step(ATTACK2);
  check('zoom 1: fov 40, speed 150', s.w.fov === 40 && s.ctx.fov === 40 && weaponMaxSpeed(s.w) === 150 && weaponMaxSpeed(s.w, true) === 150 && s.log.sounds.some((x) => x.name === 'zoom'));
  s.run(0.2, ATTACK2);
  check('0.3 s between zoom steps', s.w.fov === 40);
  s.run(0.15, ATTACK2);
  check('zoom 2: fov 10', s.w.fov === 10 && s.w.zoomLevel === 2);
  s.step(0); s.run(0.3, 0); s.step(ATTACK2);
  check('zoom 3: back to 90', s.w.fov === 90 && weaponMaxSpeed(s.w) === 210);
  s.run(0.4, 0); s.run(0.02, ATTACK);
  check('unzoomed standing spread 0.001 + 0.08', near(s.log.shots[0].spread, 0.081));
  s.run(1.5, 0); s.step(ATTACK2); s.run(0.4, 0);
  s.step(ATTACK);
  check('zoomed standing spread 0.001, 115 dmg, pen 3', near(s.log.shots[1].spread, 0.001) && s.log.shots[1].damage === 115 && s.log.shots[1].penetration === 3);
  check('shot unzooms immediately', s.w.fov === 90 && s.w.resumeZoom);
  const tShot = s.t;
  s.runUntil(() => s.w.fov === 40, 2, 0);
  check('zoom resumes when the bolt is back (1.45 s)', near(s.t - tShot, 1.45, 0.011));
  const shell = s.log.shells[s.log.shells.length - 1];
  check('shell ejected 0.55 s after the shot', s.log.shells.length === 2 && near(shell.t - tShot, 0.55, 0.011) && shell.type === 'rshell_big');
  s.ctx.speed2d = 100; s.step(ATTACK); s.ctx.speed2d = 0;
  check('walking (>10 u/s) zoomed spread 0.1', near(s.log.shots[2].spread, 0.1));
  s.step(0); s.run(1.5, 0); s.step(ATTACK2); s.run(0.4, 0);
  s.ctx.ducking = true; s.step(ATTACK); s.ctx.ducking = false;
  check('ducked + zoomed: perfectly accurate', s.log.shots[3].spread === 0);

  const r = new Sim('awp', { weapon: { reserve: 30, clip: 5 } });
  r.deploy(); r.run(1.5); r.step(ATTACK2); r.run(0.4); r.step(RELOAD);
  check('reload while zoomed unzooms', r.w.inReload && r.w.fov === 90);

  const sc = new Sim('scout', { weapon: { reserve: 30 } });
  sc.deploy(); sc.run(1.3);
  sc.step(ATTACK2); const z1 = sc.w.fov; sc.run(0.35, 0); sc.step(ATTACK2); const z2 = sc.w.fov;
  check('Scout zoom 40 -> 15, speed 260/220', z1 === 40 && z2 === 15 && weaponMaxSpeed(sc.w) === 220 && weaponMaxSpeed(sc.w, false) === 260);
  const au = new Sim('aug', { weapon: { reserve: 90 } });
  au.deploy(); au.run(0.8); au.step(ATTACK2);
  check('AUG zoom 55, speed stays 240', au.w.fov === 55 && weaponMaxSpeed(au.w) === 240);
  au.run(0.4, 0); au.run(0.3, ATTACK);
  check('AUG zoomed cycle 0.135 s', au.log.shots.length >= 2 && near(au.log.shots[1].t - au.log.shots[0].t, 0.14, 0.011));
  const sg = new Sim('sg552', { weapon: { reserve: 90 } });
  sg.deploy(); sg.run(0.8); sg.step(ATTACK2);
  check('SG552 zoomed speed 200', weaponMaxSpeed(sg.w) === 200);
}

// ------------------------------------------------------------------ 10. knife
section('knife');
{
  const victim = { name: 'bot' };
  let behind = false, hit = true;
  const s = new Sim('knife', { knifeTrace: () => (hit ? { hit: true, hitPlayer: victim, behind, fraction: 0.5, hitgroup: HITGROUP.CHEST } : { hit: false, hitPlayer: null, behind: false, fraction: 1 }) });
  s.deploy(); s.run(0.8);
  s.step(ATTACK);
  const t0 = s.t;
  check('slash hit: 15 damage, next slash +0.4', s.log.knife[0].dmg === 15 && near(s.w.nextPrimary, t0 + 0.4));
  s.run(0.5, 0); s.step(ATTACK2);
  check('stab: 65', s.log.knife[1].dmg === 65 && near(s.w.nextPrimary - s.t, 1.1));
  s.run(1.2, 0); behind = true; s.step(ATTACK2);
  check('backstab: 65 x 3 = 195', s.log.knife[2].dmg === 195);
  s.run(1.2, 0); hit = false; s.step(ATTACK);
  check('slash miss: +0.35', near(s.w.nextPrimary - s.t, 0.35) && s.log.knife.length === 3);
  s.run(0.6, 0); s.step(ATTACK2);
  check('stab miss: +1.0', near(s.w.nextPrimary - s.t, 1.0));
  const res = computeDamage({ health: 100, armor: 100, helmet: true }, 65, HITGROUP.CHEST, { attackerWeapon: 'knife' });
  check('stab vs kevlar (ratio 0.85): 55 damage', res.damageToHealth === 55, JSON.stringify({ health: res.health, armor: +res.armor.toFixed(3) }));
}

// ------------------------------------------------------------------ 11. grenades & C4 weapons
section('grenade throw / C4 plant');
{
  const s = new Sim('hegrenade');
  s.deploy(); s.run(0.8);
  s.run(0.2, ATTACK);
  const tPin = s.log.anims.find((x) => x.name === 'pinpull').t;
  check('pin pulled', s.w.pinPulled);
  s.run(0.5, 0);
  const g = s.log.grenades[0];
  check('released early -> thrown 0.5 s after the pin', g && near(g.t - tPin, 0.5, 0.011));
  check('level throw: pitch -10, speed 600, fuse 1.5', g && near(g.angles[0], -10) && near(g.speed, 600) && g.fuse === 1.5);
  check('HE reserve now 0 and spent flag', s.w.ammo === 0 && s.w.spent);
  s.run(1.0, 0);
  check('last grenade -> retire', s.log.retired.length === 1);
  check('throw: 45 deg up -> capped 750; 30 deg down -> 400', near(grenadeThrow([-45, 0, 0]).speed, 750) && near(grenadeThrow([30, 0, 0]).speed, 400));
  const th = grenadeThrow([0, 90, 0], [0, 0, 0], [0, 0, 64], [100, 0, 0]);
  check('throw origin eye + 16 fwd, velocity adds player velocity', near(th.origin[1], 16 * Math.cos(10 * Math.PI / 180), 1e-6) && near(th.velocity[0], 100, 1e-6));

  const f = new Sim('flashbang', { weapon: { reserve: 2 } });
  f.deploy(); f.run(0.8); f.run(0.6, ATTACK); f.run(1.0, 0);
  check('flashbang retires after a throw even with one left (original)', f.log.grenades.length === 1 && f.w.ammo === 1 && f.log.retired.length === 1);

  const c = new Sim('c4');
  c.ctx.inBombZone = true;
  c.deploy(); c.run(0.8);
  c.step(ATTACK);
  const tArm = c.t;
  check('arming freezes the player (maxspeed 1)', c.w.startedArming && weaponMaxSpeed(c.w) === 1);
  c.runUntil(() => c.log.plants.length > 0, 4, ATTACK);
  check('planted after 3.0-3.3 s of holding', c.log.plants.length === 1 && c.t - tArm >= 3.0 && c.t - tArm <= 3.31, `${(c.t - tArm).toFixed(2)} s`);
  check('C4 spent and retired', c.w.ammo === 0 && c.w.spent && c.log.retired.length === 1);
  const c2 = new Sim('c4');
  c2.ctx.inBombZone = true; c2.deploy(); c2.run(0.8); c2.run(1.5, ATTACK); c2.run(0.1, 0);
  check('releasing cancels the plant', !c2.w.startedArming && c2.log.plants.length === 0 && weaponMaxSpeed(c2.w) === 250);
  const c3 = new Sim('c4');
  c3.deploy(); c3.run(0.8); c3.step(ATTACK);
  check('outside a bomb site: no arming, hint', !c3.w.startedArming && c3.log.events.some((e) => e.text === '#C4_Plant_At_Bomb_Spot'));
}

// ------------------------------------------------------------------ 12. armor math
section('damage & armor (TraceAttack + TakeDamage)');
{
  const kev = () => ({ health: 100, armor: 100, helmet: false });
  const vh = () => ({ health: 100, armor: 100, helmet: true });
  const ak = { attackerWeapon: 'ak47' };
  const rows = [];
  const t = (label, victim, dmg, hg, opts, wantHealth, wantArmor) => {
    const r = computeDamage(victim, dmg, hg, opts);
    rows.push(`  ${label.padEnd(40)} health ${String(r.health).padStart(4)}  armor ${r.armor.toFixed(4).padStart(8)}  (-${r.damageToHealth} hp, -${r.damageToArmor.toFixed(4)} ap)${r.helmetHit ? ' helmet' : ''}`);
    check(label, r.health === wantHealth && (wantArmor == null || near(r.armor, wantArmor, 1e-9)));
    return r;
  };
  t('AK chest vs kevlar: 36 -> 27 hp, 4.05 ap', kev(), 36, HITGROUP.CHEST, ak, 73, 95.95);
  t('AK chest no armor: 36', { health: 100, armor: 0 }, 36, HITGROUP.CHEST, ak, 64, 0);
  t('AK stomach vs kevlar: 45*0.775 = 34', kev(), 36, HITGROUP.STOMACH, ak, 66, 100 - 45 * 0.225 * 0.5);
  t('AK leg vs kevlar (legs unarmored): 27', kev(), 36, HITGROUP.LEFTLEG, ak, 73, 100);
  t('AK head, kevlar only: 144', kev(), 36, HITGROUP.HEAD, ak, -44, 100);
  const hh = t('AK head vs helmet: 111', vh(), 36, HITGROUP.HEAD, ak, -11, 100 - 16.2);
  check('helmet spark flag', hh.helmetHit && hh.killed);
  t('AWP chest vs kevlar: 115*0.975 = 112', kev(), 115, HITGROUP.CHEST, { attackerWeapon: 'awp' }, -12, 100 - 115 * 0.025 * 0.5);
  t('Glock chest vs kevlar (ratio 0.525): 13', kev(), 25, HITGROUP.CHEST, { attackerWeapon: 'glock' }, 87, 100 - 25 * 0.475 * 0.5);
  t('USP chest vs kevlar (ratio 0.5): 17', kev(), 34, HITGROUP.CHEST, { attackerWeapon: 'usp' }, 83, 91.5);
  t('AK chest vs 2 armor: overflow -> 32', { health: 100, armor: 2, helmet: false }, 36, HITGROUP.CHEST, ak, 68, 0);
  t('M4A1 arm vs kevlar: 32*0.7 = 22', kev(), 32, HITGROUP.RIGHTARM, { attackerWeapon: 'm4a1' }, 78, 100 - 32 * 0.3 * 0.5);
  t('HE blast 80 vs kevlar: 40', kev(), 80, HITGROUP.GENERIC, { attackerWeapon: 'hegrenade' }, 60, 80);
  t('HE blast 80 vs 10 armor: 70', { health: 100, armor: 10 }, 80, HITGROUP.GENERIC, { blast: true }, 30, 0);
  t('teammate AK chest, FF on: 36*0.35 -> 12.6*0.775', kev(), 36, HITGROUP.CHEST, { ...ak, teammate: true, friendlyFire: true }, 91, 100 - 12.6 * 0.225 * 0.5);
  const tm = computeDamage(kev(), 36, HITGROUP.CHEST, { ...ak, teammate: true, friendlyFire: false });
  check('teammate, FF off: refused', tm.refused && tm.health === 100);
  const fl = computeDamage({ health: 100, armor: 0 }, 36, HITGROUP.CHEST, ak);
  check('AK unarmored chest: victim punch -3.6, large flinch 0.65 + knockback', near(fl.victimPunch.x, -3.6) && fl.velocityModifier === 0.65 && fl.knockback === 170);
  const sm = computeDamage({ health: 100, armor: 0 }, 26, HITGROUP.CHEST, { attackerWeapon: 'mp5' });
  check('MP5 hit: small flinch 0.5', sm.velocityModifier === 0.5 && sm.knockback === 0);
  check('hit-group multipliers', HITGROUP_DAMAGE_MULT[HITGROUP.HEAD] === 4 && HITGROUP_DAMAGE_MULT[HITGROUP.STOMACH] === 1.25 && HITGROUP_DAMAGE_MULT[HITGROUP.LEFTLEG] === 0.75 && HITGROUP_DAMAGE_MULT[HITGROUP.CHEST] === 1);
  console.log(rows.join('\n'));
}

// ------------------------------------------------------------------ 13. FireBullets3 penetration
section('FireBullets3 wall penetration (shooting +X from the origin)');
{
  // 1-D world along +X with GoldSrc trace semantics: a trace starting inside a wall ignores
  // that wall until it leaves it; player boxes are hit on entry only.
  function makeTrace(walls, players) {
    return (start, end) => {
      const sx = start[0], ex = end[0];
      const L = ex - sx;
      let best = null;
      for (const w of walls) {
        const inside = sx > w.x0 && sx < w.x1;
        if (inside && ex > w.x0 && ex < w.x1) return { fraction: 1, endpos: end.slice(), allsolid: true, startsolid: true };
        if (inside) continue;
        if (w.x0 >= sx && w.x0 <= ex) { const f = (w.x0 - sx) / L; if (!best || f < best.fraction) best = { fraction: f, surface: w.surface, entity: null }; }
      }
      for (const p of players) {
        if (p.x0 >= sx && p.x0 <= ex) { const f = (p.x0 - sx) / L; if (!best || f < best.fraction) best = { fraction: f, entity: p, hitgroup: p.hitgroup, surface: 'flesh' }; }
      }
      const startsolid = walls.some((w) => sx > w.x0 && sx < w.x1);
      if (!best) return { fraction: 1, endpos: end.slice(), startsolid };
      return { ...best, endpos: [sx + L * best.fraction, 0, 0], normal: [-1, 0, 0], startsolid };
    };
  }
  const base = { src: [0, 0, 0], forward: [1, 0, 0], right: [0, -1, 0], up: [0, 0, 1], spread: 0, spreadOffset: [0, 0] };
  const shot = (label, wpn, walls, players) => {
    const def = WEAPON_DEFS[wpn];
    const hits = [];
    fireBullets3({ ...base, distance: def.distance, penetration: def.penetration, bulletType: def.bulletType, damage: def.damage, rangeModifier: def.rangeModifier }, makeTrace(walls, players), (h) => hits.push(h));
    console.log(`  ${label.padEnd(46)} ` + (hits.map((h) => `${h.entity ? 'PLAYER' : h.surface}@${h.point[0].toFixed(0)}:${h.damage}`).join(' -> ') || '(nothing)'));
    return hits;
  };
  const target = { x0: 300, x1: 316, hitgroup: HITGROUP.CHEST, name: 'ct' };
  let h = shot('AK, 8u concrete @100, player @300', 'ak47', [{ x0: 100, x1: 108, surface: 'concrete' }], [target]);
  check('AK: wall 35, then player 16 (power 39->9, x0.5)', h.length === 2 && h[0].damage === 35 && h[1].damage === 16 && h[1].entity === target && h[1].penetrated === 1);
  const pd = computeDamage({ health: 100, armor: 100 }, h[1].damage, h[1].hitgroup, { attackerWeapon: 'ak47' });
  check('...through-wall hit vs kevlar = 12 hp', pd.damageToHealth === 12);
  h = shot('AK, 64u concrete @100 (thick), player @300', 'ak47', [{ x0: 100, x1: 164, surface: 'concrete' }], [target]);
  check('thick wall: start-in-solid trace exits and still hits (CS 1.6)', h.length === 2 && h[1].damage === 16);
  h = shot('AK, 8u metal @100, player @300', 'ak47', [{ x0: 100, x1: 108, surface: 'metal' }], [target]);
  check('metal: power 5, damage x0.2 -> 6', h.length === 2 && h[1].damage === 6);
  h = shot('AK, 8u wood @100, player @300', 'ak47', [{ x0: 100, x1: 108, surface: 'wood' }], [target]);
  check('wood: damage x0.6 -> 35*0.6=21 -> 20', h.length === 2 && h[1].damage === 20);
  h = shot('Glock (penetration 1), concrete @100', 'glock', [{ x0: 100, x1: 108, surface: 'concrete' }], [target]);
  check('Glock does not penetrate', h.length === 1 && h[0].damage === 23);
  h = shot('Deagle, concrete @1100 (> 1000 pen. distance)', 'deagle', [{ x0: 1100, x1: 1108, surface: 'concrete' }], [{ ...target, x0: 1300 }]);
  check('beyond the bullet penetration distance: stops', h.length === 1);
  h = shot('AWP, wood @100, concrete @200, player @300', 'awp', [{ x0: 100, x1: 108, surface: 'wood' }, { x0: 200, x1: 208, surface: 'concrete' }], [target]);
  check('AWP two walls: 114 -> 67 -> 39', h.length === 3 && h[0].damage === 114 && h[1].damage === 67 && h[2].damage === 39);
  h = shot('AK, player @300 then player @400', 'ak47', [], [target, { ...target, x0: 400, name: 'b' }]);
  check('through a player: x0.75, jump 42 units', h.length === 2 && h[0].damage === 35 && h[1].damage === Math.trunc(Math.trunc(35 * 0.75) * Math.pow(0.98, (400 - 342) / 500)));
  // range falloff only
  h = shot('AK, open air, player @2000', 'ak47', [], [{ ...target, x0: 2000 }]);
  check('range modifier 36*0.98^(2000/500) = 33', h.length === 1 && h[0].damage === Math.trunc(36 * Math.pow(0.98, 4)));
  // spread distribution
  const rng = mulberry32(7);
  let maxAbs = 0, sum = 0;
  for (let i = 0; i < 4000; i++) {
    const dir = fireBullets3({ ...base, spreadOffset: undefined, spread: 0.1, random: rng, distance: 100, penetration: 1, bulletType: '762mm', damage: 36 }, () => ({ fraction: 1 }));
    maxAbs = Math.max(maxAbs, Math.abs(dir.spreadX), Math.abs(dir.spreadY)); sum += dir.spreadX;
  }
  check('spread offsets: triangular in [-spread, spread], mean 0', maxAbs <= 0.1 && maxAbs > 0.09 && Math.abs(sum / 4000) < 0.003, `max ${maxAbs.toFixed(4)}`);
  // buckshot
  const pellets = fireBuckshot({ ...base, shots: 9, spreadX: 0.0675, spreadY: 0.0675, distance: 3000, damage: 20, random: mulberry32(3) },
    (s, e) => ({ fraction: 300 / 3000, endpos: [300, 0, 0], entity: target, hitgroup: HITGROUP.CHEST }));
  check('M3 at 300 u: 9 pellets x int(0.9*20)=18 summed into one hit', pellets.damage.length === 1 && pellets.damage[0].amount === 162);
  const viaB3 = fireBullets3({ ...base, shots: 6, bulletType: BULLET.PLAYER_BUCKSHOT, spreadX: 0.0725, spreadY: 0.0725, distance: 3048, damage: 20, random: mulberry32(3) }, () => ({ fraction: 1 }));
  check('fireBullets3 routes shotgun blasts to fireBuckshot', viaB3.buckshot && viaB3.buckshot.dirs.length === 6);
}

// ------------------------------------------------------------------ 14. explosions / flash / grenade physics
section('explosions, flashbang, grenade physics');
{
  const tg = (x, z = 36) => ({ origin: [x, 0, z] });
  const list = radiusDamage([0, 0, 0], HE.damage, HE.radius, [tg(0), tg(200, 1), tg(400, 1)]);
  check('HE 100 dmg / 350 radius, linear', HE.damage === 100 && HE.radius === 350 && list.length === 2 && near(list[0].damage, 100 - 35 * 100 / 350) && near(list[1].damage, 100 - 200 * 100 / 350));
  const c4 = radiusDamage([0, 0, 0], C4.damage, C4.radius, [tg(700, 1)]);
  check('C4 500 dmg / 1750 radius', C4.damage === 500 && C4.radius === 1750 && near(c4[0].damage, 300));
  const eo = explosionOrigin([0, 0, 2], (s, e) => ({ fraction: (s[2] - 0) / (s[2] - e[2]), endpos: [0, 0, 0], normal: [0, 0, 1] }), 100);
  check('explosion lifted (100-24)*0.6 = 45.6 off the floor', near(eo[2], 45.6));
  const fl = radiusFlash([0, 0, 0], [
    { origin: [100, 0, 0], viewAngles: [0, 180, 0], name: 'facing' },
    { origin: [100, 0, 0], viewAngles: [0, 0, 0], name: 'away' },
  ], () => ({ fraction: 1 }), { random: () => 0.5 });
  check('flashbang: facing gets alpha 255 & 3x fade, turned away 200 & 1.75x', fl.length === 2 && fl[0].alpha === 255 && fl[1].alpha === 200 && fl[0].fadeTime > fl[1].fadeTime && near(fl[0].fadeTime, fl[0].strength * 3) && near(fl[0].holdTime, fl[0].strength / 1.5));
  check('flash numbers', FLASHBANG.radius === 1500 && FLASHBANG.flashDamage === 4 && SMOKE.puffCount === 21);
  // HE dropped on a flat floor at z = 0
  const floor = (s, e) => {
    if (e[2] >= 0) return { fraction: 1, endpos: e.slice() };
    const f = s[2] <= 0 ? 0 : s[2] / (s[2] - e[2]);
    return { fraction: f, endpos: [s[0] + (e[0] - s[0]) * f, s[1] + (e[1] - s[1]) * f, 0], normal: [0, 0, 1] };
  };
  const g = createGrenade('hegrenade', [0, 0, 60], [400, 0, 200], 0);
  let boom = null, bounces = 0;
  for (let i = 1; i < 300 && !boom; i++) { if (updateGrenade(g, i * 0.01, 0.01, floor, () => bounces++) === 'explode') boom = i * 0.01; }
  check('HE detonates on the think after its 1.5 s fuse (1.6 s)', boom != null && near(boom, 1.6, 0.011), `t=${boom}`);
  check('HE bounces (airborne bounces only damp the normal component)', bounces >= 2 && g.origin[0] > 600, `x=${g.origin[0].toFixed(0)} bounces ${bounces}`);
  const r = createGrenade('hegrenade', [0, 0, 4], [150, 0, 0], 0);
  let restAt = null;
  for (let i = 1; i < 140 && restAt == null; i++) { updateGrenade(r, i * 0.01, 0.01, floor); if (r.onGround && r.velocity.every((v) => v === 0)) restAt = i * 0.01; }
  check('slow grenade rolls to a stop (x0.8 ground friction per frame)', restAt != null && r.origin[0] < 60, `rest at ${restAt}s x=${r.origin[0].toFixed(1)}`);
  const sgFloor = createGrenade('smokegrenade', [0, 0, 0], [0, 0, 0], 0);
  sgFloor.onGround = true;
  let smokeAt = null;
  for (let i = 1; i < 400 && smokeAt == null; i++) if (updateGrenade(sgFloor, i * 0.01, 0.01, floor) === 'smoke') smokeAt = i * 0.01;
  check('smoke on the ground pops on the think after the fuse (1.6 s)', near(smokeAt, 1.6, 0.011), `t=${smokeAt}`);
  const sgAir = createGrenade('smokegrenade', [0, 0, 1000], [0, 0, 0], 0);
  let airAt = null, landed = null;
  for (let i = 1; i < 600 && airAt == null; i++) { if (updateGrenade(sgAir, i * 0.01, 0.01, floor) === 'smoke') airAt = i * 0.01; if (landed == null && sgAir.origin[2] === 0) landed = i * 0.01; }
  check('airborne smoke waits until it is on the ground', airAt != null && landed != null && airAt > 2.2 && airAt > landed, `landed ${landed}s, smoke ${airAt}s`);
}

// ------------------------------------------------------------------ 15. rules / economy
section('rules & economy');
{
  check('RULES basics', RULES.startMoney === 800 && RULES.maxMoney === 16000 && RULES.freezeTime === 6 && RULES.buyTime === 90 && RULES.c4Timer === 45 && RULES.roundTime === 300);
  check('kill / teamkill money', RULES.killReward === 300 && RULES.teamKillMoney === -3300 && RULES.teamKillPenalty === 3300);
  check('round rewards', RULES.reward.targetBombed === 3500 && RULES.reward.bombDefused === 3250 && RULES.reward.ctsWinElimination === 3250 && RULES.reward.targetSaved === 3250 && RULES.reward.bombPlantedTeam === 800 && RULES.rewardPlant === 0 && RULES.rewardDefuse === 0);
  check('defuse 10 / 5 s, arm 3 s', RULES.defuseTime === 10 && RULES.defuseTimeKit === 5 && RULES.c4ArmTime === 3);
  const eco = createEconomy();
  const ct = [];
  for (let i = 0; i < 6; i++) ct.push(roundEndMoney(eco, { winner: 'T', reason: 'elimination' }).CT);
  check('CT loss bonus 1400,1900,2400,2900,3400,3400', ct.join() === '1400,1900,2400,2900,3400,3400', ct.join());
  const brk = roundEndMoney(eco, { winner: 'CT', reason: 'bomb_defused' });
  const nxt = roundEndMoney(eco, { winner: 'CT', reason: 'target_saved' });
  check('streak broken: T get 1500 + 800 (defused), then 2000', brk.T === 2300 && brk.CT === 3250 && nxt.T === 2000 && nxt.CT === 3250, JSON.stringify([brk, nxt]));
  check('bomb exploded pays 3500', roundEndMoney(createEconomy(), { winner: 'T', reason: 'target_bombed' }).T === 3500);
  check('AddAccount clamps to 16000', addAccount(15900, 300) === 16000 && addAccount(100, -3300) === 0);
}

// ------------------------------------------------------------------ 16. misc helpers
section('misc');
{
  const p = [-5, 0, 0];
  dropPunchAngle(p, 0.01);
  check('PM_DropPunchAngle: 5 -> 5 - (10 + 2.5)*0.01', near(p[0], -4.875));
  const w = createWeapon('ak47');
  const b1 = buyAmmo(w, 800); buyAmmo(w, 800); buyAmmo(w, 800);
  check('buy AK ammo: 30 for $80, capped at 90', b1.cost === 80 && b1.added === 30 && w.ammo === 90 && buyAmmo(w, 800) === null);
  const pool = { '9mm': 0 };
  const mp5 = createWeapon('mp5', { pool }), gl = createWeapon('glock', { pool, reserve: 40 });
  check('shared ammo pool (m_rgAmmo)', pool['9mm'] === 40 && buyAmmo(mp5, 100).added === 30 && pool['9mm'] === 70);
  const inv = [createWeapon('knife'), createWeapon('usp'), createWeapon('m4a1'), createWeapon('flashbang')];
  check('next best weapon = heaviest other', nextBestWeapon(inv, inv[3]).id === 'm4a1' && nextBestWeapon(inv, inv[2]).id === 'usp');
  const { forward } = angleVectors([0, 90, 0]);
  check('angleVectors yaw 90 -> +Y, pitch +90 -> down', near(forward[1], 1) && near(angleVectors([90, 0, 0]).forward[2], -1));
  // every weapon survives a generic workout
  let ok = true;
  for (const id of WEAPON_IDS) {
    try {
      const s = new Sim(id, { weapon: { reserve: WEAPON_DEFS[id].maxAmmo > 0 ? WEAPON_DEFS[id].maxAmmo : 1 } });
      s.ctx.inBombZone = true;
      s.deploy(); s.run(2, ATTACK); s.run(0.5, ATTACK2); s.run(0.5, 0); s.run(0.2, RELOAD); s.run(5, 0); s.holster();
      if (!Number.isFinite(s.w.clip) || !Number.isFinite(s.w.ammo)) ok = false;
    } catch (e) { ok = false; console.log('   ', id, e.message); }
  }
  check('all 29 weapons run deploy/fire/alt/reload/idle/holster without errors', ok);
}

console.log(`\n${pass} passed, ${fail} failed${fail ? ': ' + failures.join('; ') : ''}`);
process.exit(fail ? 1 : 0);
