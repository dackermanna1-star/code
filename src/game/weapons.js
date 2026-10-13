// Port of p_pspr.c (weapon sprites and attacks) extended with modern
// handling: magazines with tactical/empty reloads, tube-fed shotgun loading,
// aim-down-sights, recoil, quick melee, casings and muzzle effects. The
// original state sequences still drive every firing animation and cadence.

import {
  MF, WP, AM, PW, MISSILERANGE, MELEERANGE, SPREAD_UNIT, ANG90, ANG180, TAU, normAngle, pointToAngle,
  modRandom,
} from './defs.js';
import { S, MT, stateTics, stateNext, stateAction, WEAPONINFO, registerActions } from './tables.js';
import { setMobjState, spawnMobj, spawnPlayerMissile } from './mobj.js';
import { aimLineAttack, lineAttack, mapState } from './map.js';
import { noiseAlert } from './enemy.js';
import { WEAPON_CFG, HIT_ZONES } from './weaponcfg.js';
import { SPRNAMES } from './info.js';

export const PS_WEAPON = 0;
export const PS_FLASH = 1;
const WEAPONBOTTOM = 128;
const WEAPONTOP = 32;
const BFGCELLS = 40;
// Quick melee timeline (tics): gun out by MELEE_OUT, hit at MELEE_HIT,
// fist gone at MELEE_BACK, gun back up at MELEE_TICS.
export const MELEE_OUT = 3;
export const MELEE_HIT = 6;
export const MELEE_BACK = 12;
export const MELEE_TICS = 16;
const DEG = Math.PI / 180;

export function weaponCfg(weapon) { return WEAPON_CFG[weapon] || WEAPON_CFG[WP.FIST]; }

export function setPsprite(w, player, position, stnum) {
  const psp = player.psprites[position];
  do {
    if (!stnum) { psp.state = 0; break; }
    psp.state = stnum;
    psp.tics = stateTics[stnum];
    if (position === PS_WEAPON) onWeaponState(w, player, stnum);
    const action = stateAction[stnum];
    if (action) {
      action(w, player, psp);
      if (!psp.state) break;
    }
    stnum = stateNext[psp.state];
  } while (!psp.tics);
}

function onWeaponState(w, player, st) {
  const cfg = weaponCfg(player.readyweapon);
  if (cfg.ejectState && st === S[cfg.ejectState] && w.fx) w.fx.ejectCasing(player, cfg.casing);
}

export function bringUpWeapon(w, player) {
  if (player.pendingweapon === WP.NOCHANGE) player.pendingweapon = player.readyweapon;
  if (player.pendingweapon === WP.CHAINSAW) w.sound(player.mo, 'sawup', { channel: 'weapon' });
  const newstate = WEAPONINFO[player.pendingweapon].upstate;
  player.pendingweapon = WP.NOCHANGE;
  player.psprites[PS_WEAPON].sy = WEAPONBOTTOM;
  player.mods.reload = null;
  setPsprite(w, player, PS_WEAPON, newstate);
}

function shotCost(weapon) {
  if (weapon === WP.BFG) return BFGCELLS;
  if (weapon === WP.SUPERSHOTGUN) return 2;
  return 1;
}

// Rounds available to fire right now for the ready weapon.
export function readyRounds(player, weapon = player.readyweapon) {
  const ammo = WEAPONINFO[weapon].ammo;
  if (ammo === AM.NOAMMO) return Infinity;
  const cfg = weaponCfg(weapon);
  if (cfg.mag && player.useMagazines) return player.mag[weapon];
  return player.ammo[ammo];
}

function consume(player, weapon, n) {
  const ammo = WEAPONINFO[weapon].ammo;
  if (ammo === AM.NOAMMO) return;
  const cfg = weaponCfg(weapon);
  if (cfg.mag && player.useMagazines) player.mag[weapon] = Math.max(0, player.mag[weapon] - n);
  else player.ammo[ammo] = Math.max(0, player.ammo[ammo] - n);
}

// Rounds a weapon can still use: its own magazine plus the reserve it
// reloads from, or just the reserve for weapons without a magazine.
// (Rounds loaded in another weapon of the same ammo type don't count.)
export function weaponRounds(player, weapon) {
  const ammo = WEAPONINFO[weapon].ammo;
  if (ammo === AM.NOAMMO) return Infinity;
  const cfg = weaponCfg(weapon);
  if (cfg.mag && player.useMagazines) return player.mag[weapon] + player.ammo[ammo];
  return player.ammo[ammo];
}

function pickFallbackWeapon(w, player) {
  const has = (wp, need = 1) => player.weaponowned[wp] && weaponRounds(player, wp) >= need;
  if (has(WP.PLASMA)) return WP.PLASMA;
  if (w.commercial && has(WP.SUPERSHOTGUN, 3)) return WP.SUPERSHOTGUN;
  if (has(WP.CHAINGUN)) return WP.CHAINGUN;
  if (has(WP.SHOTGUN)) return WP.SHOTGUN;
  if (weaponRounds(player, WP.PISTOL) > 0) return WP.PISTOL;
  if (player.weaponowned[WP.CHAINSAW]) return WP.CHAINSAW;
  if (has(WP.MISSILE)) return WP.MISSILE;
  if (has(WP.BFG, 41)) return WP.BFG;
  return WP.FIST;
}

export function checkAmmo(w, player) {
  const weapon = player.readyweapon;
  const ammo = WEAPONINFO[weapon].ammo;
  const count = shotCost(weapon);
  if (ammo === AM.NOAMMO) return true;
  if (readyRounds(player) >= count) return true;
  const cfg = weaponCfg(weapon);
  if (cfg.mag && player.useMagazines && player.ammo[ammo] > 0) {
    // Magazine dry but reserve left: reload instead of switching.
    if (w.settings.autoReload !== false) startReload(w, player);
    return false;
  }
  player.pendingweapon = pickFallbackWeapon(w, player);
  if (player.pendingweapon === weapon) player.pendingweapon = WP.FIST;
  setPsprite(w, player, PS_WEAPON, WEAPONINFO[weapon].downstate);
  return false;
}

export function fireWeapon(w, player) {
  if (!checkAmmo(w, player)) {
    if (readyRounds(player) <= 0 && !player.mods.reload && w.fx) w.sound(player.mo, 'x_dry', { channel: 'mech' });
    return;
  }
  setMobjState(w, player.mo, S.S_PLAY_ATK1);
  setPsprite(w, player, PS_WEAPON, WEAPONINFO[player.readyweapon].atkstate);
  noiseAlert(w, player.mo, player.mo);
  player.mods.lastFireTic = w.leveltime;
}

export function dropWeapon(w, player) {
  player.mods.reload = null;
  setPsprite(w, player, PS_WEAPON, WEAPONINFO[player.readyweapon].downstate);
}

// --- Reloading --------------------------------------------------------

export function canReload(player) {
  const weapon = player.readyweapon;
  const cfg = weaponCfg(weapon);
  if (!cfg.mag || !player.useMagazines) return false;
  const ammo = WEAPONINFO[weapon].ammo;
  const cap = cfg.mag + (cfg.chamber && player.mag[weapon] > 0 ? 1 : 0);
  return player.mag[weapon] < cap && player.ammo[ammo] > 0;
}

export function startReload(w, player) {
  if (player.mods.reload || !canReload(player)) return false;
  const weapon = player.readyweapon;
  const cfg = weaponCfg(weapon);
  const empty = player.mag[weapon] === 0;
  if (cfg.tube) {
    player.mods.reload = { weapon, tube: true, phase: 'start', t: 0, empty, stop: false, loaded: 0 };
  } else {
    const total = empty ? cfg.reload.empty : cfg.reload.tactical;
    player.mods.reload = { weapon, tube: false, t: 0, total, empty, out: false, in: false, racked: false };
  }
  player.mods.adsTarget = 0;
  w.sound(player.mo, 'x_reload_start', { channel: 'mech', volume: 0.7 });
  return true;
}

function finishMag(player, r) {
  const cfg = weaponCfg(r.weapon);
  const ammo = WEAPONINFO[r.weapon].ammo;
  const cap = cfg.mag + (cfg.chamber && !r.empty ? 1 : 0);
  const take = Math.min(cap - player.mag[r.weapon], player.ammo[ammo]);
  if (take > 0) {
    player.mag[r.weapon] += take;
    player.ammo[ammo] -= take;
  }
}

function tickReload(w, player) {
  const r = player.mods.reload;
  const cfg = weaponCfg(r.weapon);
  r.t++;
  const ammo = WEAPONINFO[r.weapon].ammo;
  if (!r.tube) {
    const p = r.t / r.total;
    if (!r.out && p >= 0.22) {
      r.out = true;
      w.sound(player.mo, 'x_magout', { channel: 'mech' });
      if (w.fx) w.fx.dropMagazine(player, r.weapon);
    }
    if (!r.in && p >= 0.55) {
      r.in = true;
      w.sound(player.mo, 'x_magin', { channel: 'mech' });
      finishMag(player, r);
    }
    if (r.empty && !r.racked && p >= cfg.reload.rackAt) {
      r.racked = true;
      w.sound(player.mo, r.weapon === WP.PISTOL ? 'x_slide' : 'x_bolt', { channel: 'mech' });
    }
    if (r.t >= r.total) player.mods.reload = null;
    return;
  }
  // Tube-fed shotgun: shell by shell, interruptible.
  const rc = cfg.reload;
  if (r.phase === 'start') {
    if (r.t >= rc.start) { r.phase = 'load'; r.t = 0; }
  } else if (r.phase === 'load') {
    if (r.t >= rc.perShell) {
      r.t = 0;
      if (player.ammo[ammo] > 0 && player.mag[r.weapon] < cfg.mag) {
        player.mag[r.weapon]++;
        player.ammo[ammo]--;
        r.loaded++;
        w.sound(player.mo, 'x_shellin', { channel: 'mech' });
      }
      if (r.stop || player.mag[r.weapon] >= cfg.mag || player.ammo[ammo] <= 0) {
        r.phase = 'end';
        r.pump = r.empty;
      }
    }
  } else if (r.phase === 'end') {
    if (r.pump && r.t === 3) {
      w.sound(player.mo, 'sgcock', { channel: 'mech' });
    }
    if (r.t >= (r.pump ? rc.end + 8 : rc.end)) player.mods.reload = null;
  }
}

// Frame override for the reload/melee animation, used by the HUD renderer.
export function weaponFrameOverride(player) {
  const m = player.mods;
  if (m.melee) {
    // The gun dips away, the fist punches (PUNG B-C-D-C-B), the gun returns.
    const t = m.melee.t;
    if (t < MELEE_OUT || t >= MELEE_BACK) return null;
    const seq = [1, 2, 3, 3, 2, 1];
    const i = Math.min(seq.length - 1, Math.floor(((t - MELEE_OUT) / (MELEE_BACK - MELEE_OUT)) * seq.length));
    return { sprite: 'PUNG', frame: seq[i] };
  }
  const r = m.reload;
  if (!r) return null;
  const cfg = weaponCfg(r.weapon);
  if (r.tube && r.phase === 'end' && r.pump) {
    const total = cfg.reload.end + 8;
    const seq = [0, 1, 2, 3, 3, 2, 1, 0];
    const i = Math.min(seq.length - 1, Math.floor((r.t / total) * seq.length));
    return { frame: seq[i] };
  }
  if (!r.tube && r.empty && r.weapon === WP.PISTOL) {
    const p = r.t / r.total;
    if (p >= cfg.reload.rackAt && p < cfg.reload.rackAt + 0.12) return { frame: p < cfg.reload.rackAt + 0.06 ? 2 : 1 };
  }
  return null;
}

// --- Ready state --------------------------------------------------------

function weaponBob(w, player, psp) {
  const bob = player.bob * (1 - 0.75 * player.mods.ads);
  const angle = (128 * w.leveltime) * (TAU / 8192);
  psp.sx = 1 + bob * Math.cos(angle);
  psp.sy = WEAPONTOP + bob * Math.abs(Math.sin(angle % Math.PI));
}

export function A_WeaponReady(w, player, psp) {
  const mo = player.mo;
  if (mo.state === S.S_PLAY_ATK1 || mo.state === S.S_PLAY_ATK2) setMobjState(w, mo, S.S_PLAY);
  if (player.readyweapon === WP.CHAINSAW && psp.state === S.S_SAW) w.sound(mo, 'sawidl', { channel: 'weapon' });
  if (player.pendingweapon !== WP.NOCHANGE || !player.health) {
    player.mods.reload = null;
    player.mods.melee = null;
    setPsprite(w, player, PS_WEAPON, WEAPONINFO[player.readyweapon].downstate);
    return;
  }
  const cmd = player.cmd;
  const m = player.mods;
  if (m.melee) {
    tickMelee(w, player);
    weaponBob(w, player, psp);
    return;
  }
  if (m.reload) {
    if (cmd.attack && m.reload.tube && player.mag[player.readyweapon] > 0) m.reload.stop = true;
    tickReload(w, player);
    weaponBob(w, player, psp);
    if (cmd.attack && !m.reload && !player.attackdown) {
      player.attackdown = true;
      fireWeapon(w, player);
    }
    return;
  }
  if (cmd.melee && !player.meleedown && w.settings.quickMelee !== false) {
    player.meleedown = true;
    m.melee = { t: 0, total: MELEE_TICS, done: false };
    m.adsTarget = 0;
    w.sound(mo, 'x_whoosh', { channel: 'mech' });
    weaponBob(w, player, psp);
    return;
  }
  if (cmd.reload && !player.reloaddown) {
    player.reloaddown = true;
    if (startReload(w, player)) { weaponBob(w, player, psp); return; }
  }
  if (cmd.attack && !player.sprinting) {
    if (!player.attackdown || (player.readyweapon !== WP.MISSILE && player.readyweapon !== WP.BFG)) {
      player.attackdown = true;
      fireWeapon(w, player);
      return;
    }
  } else if (!cmd.attack) {
    player.attackdown = false;
  }
  weaponBob(w, player, psp);
}

function tickMelee(w, player) {
  const m = player.mods.melee;
  m.t++;
  if (!m.done && m.t >= MELEE_HIT) {
    m.done = true;
    let damage = (w.rng.P() % 10 + 1) << 1;
    if (player.powers[PW.STRENGTH]) damage *= 10;
    else damage = Math.round(damage * 1.5);
    const angle = player.mo.angle;
    const slope = Math.tan(player.aimPitch());
    const res = lineAttack(w, player.mo, angle, MELEERANGE, slope, damage, {
      fromZ: player.shootZ(), onThingHit: (hit) => { hit.melee = true; hit.weapon = WP.FIST; hit.player = player; },
    });
    if (res.kind === 'thing') {
      w.sound(player.mo, 'punch', { channel: 'weapon' });
      player.mods.kick += 4;
    }
    if (w.fx) w.fx.meleeImpact(player, res);
  }
  if (m.t >= m.total) player.mods.melee = null;
}

export function A_ReFire(w, player) {
  if (player.cmd.attack && player.pendingweapon === WP.NOCHANGE && player.health && !player.mods.reload) {
    player.refire++;
    fireWeapon(w, player);
  } else {
    player.refire = 0;
    checkAmmo(w, player);
  }
}

export function A_CheckReload(w, player) { checkAmmo(w, player); }

export function A_Lower(w, player, psp) {
  psp.sy += w.settings.fastSwitch !== false ? 12 : 6;
  if (psp.sy < WEAPONBOTTOM) return;
  if (player.playerstate === 'dead') { psp.sy = WEAPONBOTTOM; return; }
  if (!player.health) { setPsprite(w, player, PS_WEAPON, S.S_NULL); return; }
  player.readyweapon = player.pendingweapon;
  bringUpWeapon(w, player);
}

export function A_Raise(w, player, psp) {
  psp.sy -= w.settings.fastSwitch !== false ? 12 : 6;
  if (psp.sy > WEAPONTOP) return;
  psp.sy = WEAPONTOP;
  setPsprite(w, player, PS_WEAPON, WEAPONINFO[player.readyweapon].readystate);
}

export function A_GunFlash(w, player) {
  setMobjState(w, player.mo, S.S_PLAY_ATK2);
  setPsprite(w, player, PS_FLASH, WEAPONINFO[player.readyweapon].flashstate);
}

// --- Firing helpers -------------------------------------------------------

function applyRecoil(w, player, scale = 1) {
  const cfg = weaponCfg(player.readyweapon);
  const r = cfg.recoil;
  if (!r) return;
  const m = player.mods;
  const adsMul = 1 - 0.4 * m.ads;
  const crouchMul = player.crouchFrac > 0.5 ? 0.8 : 1;
  const k = scale * adsMul * crouchMul * (w.settings.recoil ?? 1);
  let pitch = r.pitch * DEG * k;
  if (r.climb && player.refire > 0) pitch *= 1 + Math.min(player.refire, 12) * 0.06;
  m.recoilPitch += pitch;
  m.recoilYaw += (modRandom(w) * 2 - 1) * r.yaw * DEG * k;
  m.kick += r.kick * (1 - 0.3 * m.ads);
  m.shake = Math.min(8, m.shake + r.shake * k);
  m.recoverRate = r.recover || 0.85;
  if (r.push) {
    player.mo.momx -= Math.cos(player.mo.angle) * r.push * 0.3;
    player.mo.momy -= Math.sin(player.mo.angle) * r.push * 0.3;
  }
  if (w.fx) w.fx.muzzleFlash(player, cfg.lightPower || 8, cfg);
}

function zoneFor(target) {
  const spr = SPRNAMES[target.sprite] || '';
  return Object.prototype.hasOwnProperty.call(HIT_ZONES, spr) ? HIT_ZONES[spr] : HIT_ZONES.default;
}

// One player hitscan bullet with spread, free aim and locational damage.
function playerBullet(w, player, damage, spreadDeg, vSpreadDeg, opts = {}) {
  const mo = player.mo;
  let angle = mo.angle + player.mods.recoilYaw;
  if (spreadDeg > 0) angle += w.rng.sub() / 255 * spreadDeg * DEG;
  let slope;
  if (w.settings.autoaim && player.bulletslope != null) slope = player.bulletslope;
  else slope = Math.tan(player.aimPitch());
  if (vSpreadDeg > 0) slope += Math.tan((w.rng.sub() / 255) * vSpreadDeg * DEG);
  const res = lineAttack(w, mo, normAngle(angle), opts.range || MISSILERANGE, slope, damage, {
    fromZ: player.shootZ(),
    onThingHit: (hit) => {
      hit.weapon = player.readyweapon;
      hit.player = player;
      hit.pellet = !!opts.pellet;
      if (w.settings.locationalDamage !== false) {
        const zone = zoneFor(hit.thing);
        if (zone) {
          if (hit.hitHeight >= zone.head) { hit.zone = 'head'; hit.zoneMult = zone.headMult; } else if (hit.hitHeight <= zone.legs) { hit.zone = 'legs'; hit.zoneMult = zone.legMult; } else hit.zone = 'torso';
        }
      }
    },
    hitCorpses: (corpse, dist, ang) => { if (w.fx) w.fx.shootCorpse(corpse, ang, damage, player); },
  });
  if (w.fx) {
    w.fx.bulletImpact(player, res, player.readyweapon, opts);
    if (w.fx.bulletTrace) w.fx.bulletTrace(player, mo.x, mo.y, player.shootZ(), normAngle(angle), slope, res, damage, opts);
  }
  return res;
}

function bulletSlope(w, player) {
  const mo = player.mo;
  let an = mo.angle;
  player.bulletslope = aimLineAttack(w, mo, an, 16 * 64, player.shootZ());
  if (!mapState.linetarget) {
    an += (1 << 26) * (TAU / 4294967296);
    player.bulletslope = aimLineAttack(w, mo, an, 16 * 64, player.shootZ());
    if (!mapState.linetarget) {
      an -= (2 << 26) * (TAU / 4294967296);
      player.bulletslope = aimLineAttack(w, mo, an, 16 * 64, player.shootZ());
    }
  }
  if (!mapState.linetarget) player.bulletslope = Math.tan(player.aimPitch());
}

function spreadFor(player, first) {
  const cfg = weaponCfg(player.readyweapon);
  const s = cfg.spread || { hip: 5.6, ads: 2 };
  const ads = player.mods.ads;
  let hip = first ? (s.hipFirst ?? s.hip) : s.hip;
  let adsS = first ? 0 : s.ads;
  // Moving fast and airborne loosen hip fire a touch.
  const speed = Math.hypot(player.mo.momx, player.mo.momy);
  if (!player.onground) hip *= 1.3;
  else if (speed > 14) hip *= 1.1;
  if (player.crouchFrac > 0.5) { hip *= 0.85; adsS *= 0.8; }
  return hip + (adsS - hip) * ads;
}

function gunShot(w, player, accurate) {
  const damage = 5 * (w.rng.P() % 3 + 1);
  const cfg = weaponCfg(player.readyweapon);
  const spread = spreadFor(player, accurate);
  const vs = accurate ? 0 : (cfg.spread?.vertical || 0) * (1 - 0.6 * player.mods.ads);
  playerBullet(w, player, damage, spread, vs);
}

export function A_Punch(w, player) {
  let damage = (w.rng.P() % 10 + 1) << 1;
  if (player.powers[PW.STRENGTH]) damage *= 10;
  let angle = player.mo.angle;
  angle += w.rng.sub() * SPREAD_UNIT;
  const slope = Math.tan(player.aimPitch());
  const res = lineAttack(w, player.mo, normAngle(angle), MELEERANGE, slope, damage, {
    fromZ: player.shootZ(), onThingHit: (hit) => { hit.melee = true; hit.weapon = WP.FIST; hit.player = player; hit.berserk = !!player.powers[PW.STRENGTH]; },
  });
  applyRecoil(w, player, 0.5);
  if (res.kind === 'thing') {
    w.sound(player.mo, 'punch', { channel: 'weapon' });
    player.mo.angle = pointToAngle(player.mo.x, player.mo.y, res.thing.x, res.thing.y);
  }
  if (w.fx) w.fx.meleeImpact(player, res);
}

export function A_Saw(w, player) {
  const damage = 2 * (w.rng.P() % 10 + 1);
  let angle = player.mo.angle + w.rng.sub() * SPREAD_UNIT;
  const slope = Math.tan(player.aimPitch());
  const res = lineAttack(w, player.mo, normAngle(angle), MELEERANGE + 1, slope, damage, {
    fromZ: player.shootZ(), onThingHit: (hit) => { hit.melee = true; hit.saw = true; hit.weapon = WP.CHAINSAW; hit.player = player; },
  });
  applyRecoil(w, player, res.kind === 'thing' ? 1 : 0.3);
  if (w.fx) w.fx.meleeImpact(player, res, true);
  if (res.kind !== 'thing') {
    w.sound(player.mo, 'sawful', { channel: 'weapon' });
    return;
  }
  w.sound(player.mo, 'sawhit', { channel: 'weapon' });
  const mo = player.mo;
  const target = res.thing;
  const ang = pointToAngle(mo.x, mo.y, target.x, target.y);
  const d = normAngle(ang - mo.angle);
  const step = ANG90 / 20;
  if (d > ANG180) {
    if (d - TAU < -step) mo.angle = normAngle(ang + ANG90 / 21);
    else mo.angle = normAngle(mo.angle - step);
  } else if (d > step) mo.angle = normAngle(ang - ANG90 / 21);
  else mo.angle = normAngle(mo.angle + step);
  mo.flags |= MF.JUSTATTACKED;
}

export function A_FireMissile(w, player) {
  consume(player, player.readyweapon, 1);
  spawnPlayerMissile(w, player.mo, MT.ROCKET);
  applyRecoil(w, player);
}

export function A_FireBFG(w, player) {
  consume(player, player.readyweapon, BFGCELLS);
  spawnPlayerMissile(w, player.mo, MT.BFG);
  applyRecoil(w, player);
}

export function A_FirePlasma(w, player) {
  consume(player, player.readyweapon, 1);
  setPsprite(w, player, PS_FLASH, WEAPONINFO[player.readyweapon].flashstate + (w.rng.P() & 1));
  spawnPlayerMissile(w, player.mo, MT.PLASMA);
  applyRecoil(w, player);
}

export function A_FirePistol(w, player) {
  w.sound(player.mo, 'pistol', { channel: 'weapon' });
  setMobjState(w, player.mo, S.S_PLAY_ATK2);
  consume(player, player.readyweapon, 1);
  setPsprite(w, player, PS_FLASH, WEAPONINFO[player.readyweapon].flashstate);
  bulletSlope(w, player);
  gunShot(w, player, !player.refire);
  applyRecoil(w, player);
  if (w.fx) w.fx.muzzleSmoke(player);
}

export function A_FireShotgun(w, player) {
  w.sound(player.mo, 'shotgn', { channel: 'weapon' });
  setMobjState(w, player.mo, S.S_PLAY_ATK2);
  consume(player, player.readyweapon, 1);
  setPsprite(w, player, PS_FLASH, WEAPONINFO[player.readyweapon].flashstate);
  bulletSlope(w, player);
  const cfg = weaponCfg(WP.SHOTGUN);
  const ads = player.mods.ads;
  const spread = cfg.spread.hip + (cfg.spread.ads - cfg.spread.hip) * ads;
  const vs = cfg.spread.vertical + (cfg.spread.verticalAds - cfg.spread.vertical) * ads;
  for (let i = 0; i < 7; i++) {
    const damage = 5 * (w.rng.P() % 3 + 1);
    playerBullet(w, player, damage, spread, vs, { pellet: true });
  }
  applyRecoil(w, player);
  if (w.fx) w.fx.muzzleSmoke(player, 2);
}

export function A_FireShotgun2(w, player) {
  w.sound(player.mo, 'dshtgn', { channel: 'weapon' });
  setMobjState(w, player.mo, S.S_PLAY_ATK2);
  consume(player, player.readyweapon, 2);
  setPsprite(w, player, PS_FLASH, WEAPONINFO[player.readyweapon].flashstate);
  bulletSlope(w, player);
  const cfg = weaponCfg(WP.SUPERSHOTGUN);
  const spread = cfg.spread.hip + (cfg.spread.ads - cfg.spread.hip) * player.mods.ads;
  for (let i = 0; i < 20; i++) {
    const damage = 5 * (w.rng.P() % 3 + 1);
    playerBullet(w, player, damage, spread, cfg.spread.vertical * (1 - 0.4 * player.mods.ads), { pellet: true });
  }
  applyRecoil(w, player);
  if (w.fx) w.fx.muzzleSmoke(player, 3);
}

export function A_FireCGun(w, player, psp) {
  w.sound(player.mo, 'pistol', { channel: 'weapon' });
  if (readyRounds(player) <= 0) return;
  setMobjState(w, player.mo, S.S_PLAY_ATK2);
  consume(player, player.readyweapon, 1);
  setPsprite(w, player, PS_FLASH, WEAPONINFO[player.readyweapon].flashstate + (psp.state - S.S_CHAIN1));
  bulletSlope(w, player);
  gunShot(w, player, !player.refire);
  applyRecoil(w, player);
  if (w.fx) { w.fx.ejectCasing(player, 'brass'); w.fx.muzzleSmoke(player, 0.6); }
}

export function A_Light0(w, player) { player.extralight = 0; }
export function A_Light1(w, player) { player.extralight = 1; }
export function A_Light2(w, player) { player.extralight = 2; }

export function A_BFGSpray(w, mo) {
  if (!mo.target) return;
  for (let i = 0; i < 40; i++) {
    const an = normAngle(mo.angle - ANG90 / 2 + (ANG90 / 40) * i);
    aimLineAttack(w, mo.target, an, 16 * 64);
    const lt = mapState.linetarget;
    if (!lt) continue;
    spawnMobj(w, lt.x, lt.y, lt.z + lt.height / 4, MT.EXTRABFG);
    let damage = 0;
    for (let j = 0; j < 15; j++) damage += (w.rng.P() & 7) + 1;
    w.damageMobj(lt, mo.target, mo.target, damage, { bfg: true });
  }
}

export function A_BFGsound(w, player) { w.sound(player.mo, 'bfg', { channel: 'weapon' }); }
export function A_OpenShotgun2(w, player) { w.sound(player.mo, 'dbopn', { channel: 'mech' }); }
export function A_LoadShotgun2(w, player) { w.sound(player.mo, 'dbload', { channel: 'mech' }); }
export function A_CloseShotgun2(w, player, psp) { w.sound(player.mo, 'dbcls', { channel: 'mech' }); A_ReFire(w, player, psp); }

export function setupPsprites(w, player) {
  for (const p of player.psprites) p.state = 0;
  player.pendingweapon = player.readyweapon;
  bringUpWeapon(w, player);
}

export function movePsprites(w, player) {
  for (let i = 0; i < 2; i++) {
    const psp = player.psprites[i];
    if (psp.state) {
      if (psp.tics !== -1) {
        psp.tics--;
        if (!psp.tics) setPsprite(w, player, i, stateNext[psp.state]);
      }
    }
  }
  player.psprites[PS_FLASH].sx = player.psprites[PS_WEAPON].sx;
  player.psprites[PS_FLASH].sy = player.psprites[PS_WEAPON].sy;
}

// Per-tic modern handling state: ADS blend, recoil recovery, shake.
export function tickHandling(w, player) {
  const m = player.mods;
  const cfg = weaponCfg(player.readyweapon);
  const psp = player.psprites[PS_WEAPON];
  const ready = psp.state && psp.sy <= WEAPONTOP + 0.01 && player.pendingweapon === WP.NOCHANGE;
  const wantAds = player.cmd.ads && cfg.ads && ready && !m.reload && !m.melee && !player.sprinting && player.health > 0;
  m.adsTarget = wantAds ? 1 : 0;
  m.prevAds = m.ads;
  const speed = cfg.ads ? cfg.ads.speed : 0.2;
  if (m.ads < m.adsTarget) {
    if (m.ads === 0) w.sound(player.mo, 'x_adsin', { channel: 'mech', volume: 0.35 });
    m.ads = Math.min(1, m.ads + speed);
  } else if (m.ads > m.adsTarget) {
    m.ads = Math.max(0, m.ads - speed * 1.3);
  }
  m.prevRecoilPitch = m.recoilPitch;
  m.prevKick = m.kick;
  const firing = w.leveltime - (m.lastFireTic ?? -100) < 6;
  const rec = firing && cfg.recoil?.climb ? 0.96 : (m.recoverRate || 0.85);
  m.recoilPitch *= rec;
  m.recoilYaw *= 0.8;
  if (Math.abs(m.recoilPitch) < 0.0002) m.recoilPitch = 0;
  m.kick *= 0.62;
  if (m.kick < 0.05) m.kick = 0;
  m.shake *= 0.78;
  if (m.shake < 0.02) m.shake = 0;
  if (!player.cmd.melee) player.meleedown = false;
  if (!player.cmd.reload) player.reloaddown = false;
}

registerActions({
  A_WeaponReady, A_ReFire, A_CheckReload, A_Lower, A_Raise, A_GunFlash, A_Punch, A_Saw, A_FireMissile,
  A_FireBFG, A_FirePlasma, A_FirePistol, A_FireShotgun, A_FireShotgun2, A_FireCGun, A_Light0, A_Light1,
  A_Light2, A_BFGSpray, A_BFGsound, A_OpenShotgun2, A_LoadShotgun2, A_CloseShotgun2,
});

export { WEAPONBOTTOM, WEAPONTOP };
