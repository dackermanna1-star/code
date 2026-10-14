// Port of p_inter.c: pickups, damage and death. Damage carries an optional
// `hit` record (hit height, inflictor kind, explosion spot...) used by the
// gore/physics layer for locational reactions.

import {
  MF, SKILL, MAXHEALTH, WP, AM, PW, CARDS, INVULNTICS, INVISTICS, INFRATICS, IRONTICS,
  ONFLOORZ, pointToAngle, ANG180, modRandom,
} from './defs.js';
import { MT, S, SPR, WEAPONINFO } from './tables.js';
import { MAX_AMMO, CLIP_AMMO } from './info.js';
import { STRINGS } from './data.js';
import { setMobjState, spawnMobj, removeMobj } from './mobj.js';
import { touchKeyItem } from './ct/items.js';

const BONUSADD = 6;
const BASETHRESHOLD = 100;

export function giveAmmo(w, player, ammo, num) {
  if (ammo === AM.NOAMMO) return false;
  if (player.totalAmmo(ammo) >= player.maxammo[ammo]) return false;
  if (num) num *= CLIP_AMMO[ammo];
  else num = Math.floor(CLIP_AMMO[ammo] / 2);
  if (w.skill === SKILL.BABY || w.skill === SKILL.NIGHTMARE) num <<= 1;
  const oldammo = player.totalAmmo(ammo);
  player.ammo[ammo] = Math.min(player.maxammo[ammo] - player.loadedAmmo(ammo), player.ammo[ammo] + num);
  if (oldammo) return true;
  switch (ammo) {
    case AM.CLIP:
      if (player.readyweapon === WP.FIST) player.pendingweapon = player.weaponowned[WP.CHAINGUN] ? WP.CHAINGUN : WP.PISTOL;
      break;
    case AM.SHELL:
      if (player.readyweapon === WP.FIST || player.readyweapon === WP.PISTOL) {
        if (player.weaponowned[WP.SHOTGUN]) player.pendingweapon = WP.SHOTGUN;
      }
      break;
    case AM.CELL:
      if (player.readyweapon === WP.FIST || player.readyweapon === WP.PISTOL) {
        if (player.weaponowned[WP.PLASMA]) player.pendingweapon = WP.PLASMA;
      }
      break;
    case AM.MISL:
      if (player.readyweapon === WP.FIST && player.weaponowned[WP.MISSILE]) player.pendingweapon = WP.MISSILE;
      break;
    default: break;
  }
  return true;
}

export function giveWeapon(w, player, weapon, dropped) {
  const ammo = WEAPONINFO[weapon].ammo;
  let gaveammo = false;
  if (ammo !== AM.NOAMMO) gaveammo = giveAmmo(w, player, ammo, dropped ? 1 : 2);
  let gaveweapon = false;
  if (!player.weaponowned[weapon]) {
    gaveweapon = true;
    player.weaponowned[weapon] = true;
    player.onNewWeapon(weapon);
    if (w.settings.autoSwitch !== false) player.pendingweapon = weapon;
  }
  return gaveweapon || gaveammo;
}

export function giveBody(player, num) {
  if (player.health >= MAXHEALTH) return false;
  player.health = Math.min(MAXHEALTH, player.health + num);
  player.mo.health = player.health;
  return true;
}

export function giveArmor(player, armortype) {
  const hits = armortype * 100;
  if (player.armorpoints >= hits) return false;
  player.armortype = armortype;
  player.armorpoints = hits;
  return true;
}

function giveCard(player, card) {
  if (player.cards[card]) return;
  player.bonuscount = BONUSADD;
  player.cards[card] = true;
}

export function givePower(player, power) {
  switch (power) {
    case PW.INVULNERABILITY: player.powers[power] = INVULNTICS; return true;
    case PW.INVISIBILITY: player.powers[power] = INVISTICS; player.mo.flags |= MF.SHADOW; return true;
    case PW.INFRARED: player.powers[power] = INFRATICS; return true;
    case PW.IRONFEET: player.powers[power] = IRONTICS; return true;
    case PW.STRENGTH: giveBody(player, 100); player.powers[power] = 1; return true;
    default:
      if (player.powers[power]) return false;
      player.powers[power] = 1;
      return true;
  }
}

export function touchSpecialThing(w, special, toucher) {
  const delta = special.z - toucher.z;
  if (delta > toucher.height || delta < -8) return;
  let sound = 'itemup';
  const player = toucher.player;
  if (!player || toucher.health <= 0) return;
  const S2 = STRINGS;
  let msg = null;
  switch (special.sprite) {
    case SPR.ARM1: if (!giveArmor(player, 1)) return; msg = S2.GOTARMOR; break;
    case SPR.ARM2: if (!giveArmor(player, 2)) return; msg = S2.GOTMEGA; break;
    case SPR.BON1:
      player.health = Math.min(2 * MAXHEALTH, player.health + 1);
      player.mo.health = player.health;
      msg = S2.GOTHTHBONUS;
      break;
    case SPR.BON2:
      player.armorpoints = Math.min(2 * 100, player.armorpoints + 1);
      if (!player.armortype) player.armortype = 1;
      msg = S2.GOTARMBONUS;
      break;
    case SPR.SOUL:
      player.health = Math.min(200, player.health + 100);
      player.mo.health = player.health;
      msg = S2.GOTSUPER;
      sound = 'getpow';
      break;
    case SPR.MEGA:
      if (!w.commercial) return;
      player.health = 200;
      player.mo.health = player.health;
      giveArmor(player, 2);
      msg = S2.GOTMSPHERE;
      sound = 'getpow';
      break;
    case SPR.BKEY: if (!player.cards[CARDS.BLUECARD]) msg = S2.GOTBLUECARD; giveCard(player, CARDS.BLUECARD); break;
    case SPR.YKEY: if (!player.cards[CARDS.YELLOWCARD]) msg = S2.GOTYELWCARD; giveCard(player, CARDS.YELLOWCARD); break;
    case SPR.RKEY: if (!player.cards[CARDS.REDCARD]) msg = S2.GOTREDCARD; giveCard(player, CARDS.REDCARD); break;
    case SPR.BSKU: if (!player.cards[CARDS.BLUESKULL]) msg = S2.GOTBLUESKUL; giveCard(player, CARDS.BLUESKULL); break;
    case SPR.YSKU: if (!player.cards[CARDS.YELLOWSKULL]) msg = S2.GOTYELWSKUL; giveCard(player, CARDS.YELLOWSKULL); break;
    case SPR.RSKU: if (!player.cards[CARDS.REDSKULL]) msg = S2.GOTREDSKULL; giveCard(player, CARDS.REDSKULL); break;
    case SPR.STIM: if (!giveBody(player, 10)) return; msg = S2.GOTSTIM; break;
    case SPR.MEDI:
      if (!giveBody(player, 25)) return;
      msg = player.health < 50 ? S2.GOTMEDINEED : S2.GOTMEDIKIT;
      break;
    case SPR.PINV: if (!givePower(player, PW.INVULNERABILITY)) return; msg = S2.GOTINVUL; sound = 'getpow'; break;
    case SPR.PSTR:
      if (!givePower(player, PW.STRENGTH)) return;
      msg = S2.GOTBERSERK;
      if (player.readyweapon !== WP.FIST) player.pendingweapon = WP.FIST;
      sound = 'getpow';
      break;
    case SPR.PINS: if (!givePower(player, PW.INVISIBILITY)) return; msg = S2.GOTINVIS; sound = 'getpow'; break;
    case SPR.SUIT: if (!givePower(player, PW.IRONFEET)) return; msg = S2.GOTSUIT; sound = 'getpow'; break;
    case SPR.PMAP: if (!givePower(player, PW.ALLMAP)) return; msg = S2.GOTMAP; sound = 'getpow'; break;
    case SPR.PVIS: if (!givePower(player, PW.INFRARED)) return; msg = S2.GOTVISOR; sound = 'getpow'; break;
    case SPR.CLIP:
      if (special.flags & MF.DROPPED) { if (!giveAmmo(w, player, AM.CLIP, 0)) return; } else if (!giveAmmo(w, player, AM.CLIP, 1)) return;
      msg = S2.GOTCLIP;
      break;
    case SPR.AMMO: if (!giveAmmo(w, player, AM.CLIP, 5)) return; msg = S2.GOTCLIPBOX; break;
    case SPR.ROCK: if (!giveAmmo(w, player, AM.MISL, 1)) return; msg = S2.GOTROCKET; break;
    case SPR.BROK: if (!giveAmmo(w, player, AM.MISL, 5)) return; msg = S2.GOTROCKBOX; break;
    case SPR.CELL: if (!giveAmmo(w, player, AM.CELL, 1)) return; msg = S2.GOTCELL; break;
    case SPR.CELP: if (!giveAmmo(w, player, AM.CELL, 5)) return; msg = S2.GOTCELLBOX; break;
    case SPR.SHEL: if (!giveAmmo(w, player, AM.SHELL, 1)) return; msg = S2.GOTSHELLS; break;
    case SPR.SBOX: if (!giveAmmo(w, player, AM.SHELL, 5)) return; msg = S2.GOTSHELLBOX; break;
    case SPR.BPAK:
      if (!player.backpack) {
        for (let i = 0; i < 4; i++) player.maxammo[i] *= 2;
        player.backpack = true;
      }
      for (let i = 0; i < 4; i++) giveAmmo(w, player, i, 1);
      msg = S2.GOTBACKPACK;
      break;
    case SPR.BFUG: if (!giveWeapon(w, player, WP.BFG, false)) return; msg = S2.GOTBFG9000; sound = 'wpnup'; break;
    case SPR.MGUN: if (!giveWeapon(w, player, WP.CHAINGUN, special.flags & MF.DROPPED)) return; msg = S2.GOTCHAINGUN; sound = 'wpnup'; break;
    case SPR.CSAW: if (!giveWeapon(w, player, WP.CHAINSAW, false)) return; msg = S2.GOTCHAINSAW; sound = 'wpnup'; break;
    case SPR.LAUN: if (!giveWeapon(w, player, WP.MISSILE, false)) return; msg = S2.GOTLAUNCHER; sound = 'wpnup'; break;
    case SPR.PLAS: if (!giveWeapon(w, player, WP.PLASMA, false)) return; msg = S2.GOTPLASMA; sound = 'wpnup'; break;
    case SPR.SHOT: if (!giveWeapon(w, player, WP.SHOTGUN, special.flags & MF.DROPPED)) return; msg = S2.GOTSHOTGUN; sound = 'wpnup'; break;
    case SPR.SGN2: if (!giveWeapon(w, player, WP.SUPERSHOTGUN, special.flags & MF.DROPPED)) return; msg = S2.GOTSHOTGUN2; sound = 'wpnup'; break;
    default:
      // Chinatown's key items (gas can, plug, blowtorch).
      msg = touchKeyItem(w, special, player);
      if (!msg) return;
      sound = 'wpnup';
      break;
  }
  if (msg) player.message = Array.isArray(msg) ? msg.join('\n') : msg;
  if (special.flags & MF.COUNTITEM) player.itemcount++;
  if (w.fx && w.fx.pickup) w.fx.pickup(special, player);
  removeMobj(w, special);
  player.bonuscount += BONUSADD;
  w.sound(null, sound, { ui: true });
}

export function killMobj(w, source, target, hit) {
  target.flags &= ~(MF.SHOOTABLE | MF.FLOAT | MF.SKULLFLY);
  if (target.type !== MT.SKULL) target.flags &= ~MF.NOGRAVITY;
  target.flags |= MF.CORPSE | MF.DROPOFF;
  target.height /= 4;
  if (target.flags & MF.COUNTKILL) {
    if (w.player) w.player.killcount++;
  }
  if (target.player) {
    target.flags &= ~MF.SOLID;
    target.player.playerstate = 'dead';
    target.player.deathTic = w.leveltime;
    target.player.dropWeapon(w);
    if (w.onPlayerDeath) w.onPlayerDeath(target.player, source);
  }
  const xdeath = target.health < -target.info.spawnhealth && target.info.xdeathstate !== S.S_NULL;
  // Gore layer may decide on dismemberment/launch before the state change.
  if (w.fx) w.fx.kill(target, source, hit, xdeath);
  if (xdeath) setMobjState(w, target, target.info.xdeathstate);
  else setMobjState(w, target, target.info.deathstate);
  if (target.removed) return;
  target.tics -= w.rng.P() & 3;
  if (target.tics < 1) target.tics = 1;
  let item;
  switch (target.type) {
    case MT.WOLFSS:
    case MT.POSSESSED: item = MT.CLIP; break;
    case MT.SHOTGUY: item = MT.SHOTGUN; break;
    case MT.CHAINGUY: item = MT.CHAINGUN; break;
    default: return;
  }
  const mo = spawnMobj(w, target.x, target.y, ONFLOORZ, item);
  mo.flags |= MF.DROPPED;
  // Toss the dropped item a little (modern touch, keeps it reachable).
  if (w.settings.physics) {
    mo.momx = (modRandom(w) - 0.5) * 3;
    mo.momy = (modRandom(w) - 0.5) * 3;
    mo.momz = 3;
    mo.z = target.z + 16;
  }
}

export function damageMobj(w, target, inflictor, source, damage, hit = null) {
  if (!(target.flags & MF.SHOOTABLE)) return;
  if (target.health <= 0) return;
  if (target.flags & MF.SKULLFLY) target.momx = target.momy = target.momz = 0;
  const player = target.player;
  if (player && w.skill === SKILL.BABY) damage >>= 1;
  // Locational damage multiplier (head shots) for player hitscan.
  if (hit && hit.zoneMult && !player) damage = Math.round(damage * hit.zoneMult);

  if (inflictor && !(target.flags & MF.NOCLIP)
    && (!source || !source.player || source.player.readyweapon !== WP.CHAINSAW)) {
    let ang = pointToAngle(inflictor.x, inflictor.y, target.x, target.y);
    let thrust = damage * (1 / 8) * 100 / target.info.mass;
    if (damage < 40 && damage > target.health && target.z - inflictor.z > 64 && (w.rng.P() & 1)) {
      ang += ANG180;
      thrust *= 4;
    }
    const kb = (!player && w.settings.knockback) ? w.settings.knockback : 1;
    target.momx += thrust * kb * Math.cos(ang);
    target.momy += thrust * kb * Math.sin(ang);
  }

  if (player) {
    if (target.subsector.sector.special === 11 && damage >= target.health) damage = target.health - 1;
    if (damage < 1000 && ((player.cheats & 2) || player.powers[PW.INVULNERABILITY])) return;
    if (player.armortype) {
      let saved = player.armortype === 1 ? Math.floor(damage / 3) : Math.floor(damage / 2);
      if (player.armorpoints <= saved) {
        saved = player.armorpoints;
        player.armortype = 0;
      }
      player.armorpoints -= saved;
      damage -= saved;
    }
    player.health -= damage;
    if (player.health < 0) player.health = 0;
    player.attacker = source;
    player.damagecount += damage;
    if (player.damagecount > 100) player.damagecount = 100;
    if (w.fx && w.fx.playerHurt) w.fx.playerHurt(player, damage, inflictor, source);
  }

  target.health -= damage;
  if (w.fx) w.fx.damage(target, inflictor, source, damage, hit);
  if (target.health <= 0) {
    killMobj(w, source, target, hit);
    return;
  }
  const stagger = w.fx && w.fx.stagger ? w.fx.stagger(target, damage, hit) : false;
  if ((w.rng.P() < target.info.painchance || stagger) && !(target.flags & MF.SKULLFLY)) {
    target.flags |= MF.JUSTHIT;
    setMobjState(w, target, target.info.painstate);
  }
  target.reactiontime = 0;
  // Chinatown's zombies only ever go for the player (no infighting).
  const infight = source && !source.player && target.info.ct && target.info.ct.zombie;
  if ((!target.threshold || target.type === MT.VILE) && source && source !== target && source.type !== MT.VILE && !infight) {
    target.target = source;
    target.threshold = BASETHRESHOLD;
    if (target.state === target.info.spawnstate && target.info.seestate !== S.S_NULL) {
      setMobjState(w, target, target.info.seestate);
    }
  }
}

export { MAX_AMMO };
