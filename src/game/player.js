// Player state and per-tic thinking (port of p_user.c) with modern movement:
// mouse look, jumping, crouching, sprinting and sliding layered on DOOM's
// momentum model so the original speed and feel are preserved.

import {
  MF, WP, AM, PW, VIEWHEIGHT, MAXBOB, TAU, ANG90, ANG180, normAngle, pointToAngle,
} from './defs.js';
import { S, WEAPONINFO } from './tables.js';
import { MAX_AMMO } from './info.js';
import { KEY_ITEM_COUNT } from './ct/items.js';
import { climbThink, abortClimb } from './ct/ladder.js';
import { setMobjState } from './mobj.js';
import { useLines } from './map.js';
import {
  setupPsprites, movePsprites, dropWeapon, tickHandling, weaponCfg, weaponRounds, PS_WEAPON,
} from './weapons.js';

export const STAND_HEIGHT = 56;
export const CROUCH_HEIGHT = 32;
const CROUCH_VIEW = 23;
const JUMP_SPEED = 8;
const ANG5 = ANG90 / 18;

export function emptyCmd() {
  return {
    forwardmove: 0, sidemove: 0, attack: false, use: false, ads: false, reload: false, jump: false,
    crouch: false, sprint: false, melee: false, weapon: -1, nextWeapon: 0,
  };
}

export class Player {
  constructor() {
    this.mo = null;
    this.playerstate = 'live';
    this.cmd = emptyCmd();
    this.viewz = 0;
    this.viewheight = VIEWHEIGHT;
    this.baseViewHeight = VIEWHEIGHT;
    this.deltaviewheight = 0;
    this.bob = 0;
    this.health = 100;
    this.armorpoints = 0;
    this.armortype = 0;
    this.powers = [0, 0, 0, 0, 0, 0];
    this.cards = [false, false, false, false, false, false];
    this.backpack = false;
    // Chinatown key items carried (ct/items.js KEY_ITEM order).
    this.keyItems = new Array(KEY_ITEM_COUNT).fill(false);
    // Chinatown ladder climb in progress (ct/ladder.js), else null.
    this.climb = null;
    this.weaponowned = new Array(9).fill(false);
    this.ammo = [0, 0, 0, 0];
    this.maxammo = MAX_AMMO.slice();
    this.mag = new Array(9).fill(0);
    this.useMagazines = true;
    this.readyweapon = WP.PISTOL;
    this.pendingweapon = WP.PISTOL;
    this.attackdown = false;
    this.usedown = false;
    this.meleedown = false;
    this.reloaddown = false;
    this.jumpdown = false;
    this.cheats = 0;
    this.refire = 0;
    this.killcount = 0;
    this.itemcount = 0;
    this.secretcount = 0;
    this.message = null;
    this.damagecount = 0;
    this.bonuscount = 0;
    this.attacker = null;
    this.extralight = 0;
    this.fixedcolormap = 0;
    this.psprites = [{ state: 0, tics: 0, sx: 0, sy: 0 }, { state: 0, tics: 0, sx: 0, sy: 0 }];
    this.didsecret = false;
    this.bulletslope = 0;
    // Modern
    this.pitch = 0;
    this.prevPitch = 0;
    this.crouchFrac = 0;
    this.prevCrouch = 0;
    this.sprinting = false;
    this.sprintFrac = 0;
    this.slide = null;
    this.slideFriction = 0;
    this.onground = true;
    this.landDip = 0;
    this.mods = {
      ads: 0, prevAds: 0, adsTarget: 0, reload: null, melee: null, kick: 0, prevKick: 0,
      recoilPitch: 0, prevRecoilPitch: 0, recoilYaw: 0, shake: 0, recoverRate: 0.85, lastFireTic: -100,
    };
    this.damageDirs = [];
  }

  // Ammo helpers (reserve + loaded magazines).
  loadedAmmo(type) {
    let n = 0;
    for (let wp = 0; wp < 9; wp++) {
      if (this.weaponowned[wp] && WEAPONINFO[wp].ammo === type && weaponCfg(wp).mag) n += this.mag[wp];
    }
    return n;
  }

  totalAmmo(type) {
    if (type === AM.NOAMMO) return 0;
    return this.ammo[type] + (this.useMagazines ? this.loadedAmmo(type) : 0);
  }

  onNewWeapon(weapon) {
    const cfg = weaponCfg(weapon);
    if (!cfg.mag || !this.useMagazines) return;
    const type = WEAPONINFO[weapon].ammo;
    const take = Math.min(cfg.mag, this.ammo[type]);
    this.mag[weapon] = take;
    this.ammo[type] -= take;
  }

  // Fill magazines from reserve (level start, cheats).
  topOffMagazines() {
    if (!this.useMagazines) return;
    for (let wp = 0; wp < 9; wp++) {
      if (!this.weaponowned[wp]) continue;
      const cfg = weaponCfg(wp);
      if (!cfg.mag) continue;
      const type = WEAPONINFO[wp].ammo;
      const take = Math.min(cfg.mag - this.mag[wp], this.ammo[type]);
      if (take > 0) { this.mag[wp] += take; this.ammo[type] -= take; }
    }
  }

  dropWeapon(w) { dropWeapon(w, this); }

  aimPitch() {
    return Math.max(-1.45, Math.min(1.45, this.pitch + this.mods.recoilPitch));
  }

  lookPitch() { return this.aimPitch(); }

  shootZ() { return this.mo.z + this.viewheight - 2; }

  shootHeight() { return this.viewheight - 8; }

  resetForNewLevel() {
    this.cards.fill(false);
    this.keyItems.fill(false);
    this.climb = null;
    this.powers.fill(0);
    this.extralight = 0;
    this.fixedcolormap = 0;
    this.damagecount = 0;
    this.bonuscount = 0;
    this.killcount = 0;
    this.itemcount = 0;
    this.secretcount = 0;
    this.message = null;
    this.mods.reload = null;
    this.mods.melee = null;
    this.mods.ads = 0;
    this.crouchFrac = 0;
    this.slide = null;
    this.pitch = 0;
  }

  // Reborn (G_PlayerReborn): fresh inventory, keep nothing.
  reborn() {
    const kills = this.killcount, items = this.itemcount, secrets = this.secretcount;
    const useMagazines = this.useMagazines;
    Object.assign(this, new Player());
    this.killcount = kills; this.itemcount = items; this.secretcount = secrets;
    this.useMagazines = useMagazines; // a game setting, not inventory
    this.usedown = this.attackdown = true; // don't do anything immediately
    this.weaponowned[WP.FIST] = true;
    this.weaponowned[WP.PISTOL] = true;
    this.ammo[AM.CLIP] = 50;
    this.topOffMagazines();
  }
}

export function newGamePlayer() {
  const p = new Player();
  p.weaponowned[WP.FIST] = true;
  p.weaponowned[WP.PISTOL] = true;
  p.ammo[AM.CLIP] = 50;
  p.topOffMagazines();
  return p;
}

export function spawnPlayerSetup(w, player) {
  player.playerstate = 'live';
  player.refire = 0;
  player.viewheight = VIEWHEIGHT;
  player.baseViewHeight = VIEWHEIGHT;
  player.deltaviewheight = 0;
  player.mo.health = player.health;
  player.mo.player = player;
  player.mo.height = STAND_HEIGHT;
  player.viewz = player.mo.z + player.viewheight;
  setupPsprites(w, player);
}

// --- Thinking -----------------------------------------------------------

function thrust(player, angle, move) {
  player.mo.momx += move * Math.cos(angle);
  player.mo.momy += move * Math.sin(angle);
}

function calcHeight(w, player) {
  const mo = player.mo;
  player.bob = (mo.momx * mo.momx + mo.momy * mo.momy) / 4;
  if (player.bob > MAXBOB) player.bob = MAXBOB;
  if (player.slide) player.bob *= 0.2;
  const bobScale = w.settings.viewBob ?? 1;
  if ((player.cheats & 4) || !player.onground) {
    player.viewz = mo.z + player.viewheight;
    if (player.viewz > mo.ceilingz - 4) player.viewz = mo.ceilingz - 4;
    return;
  }
  const angle = (Math.floor(8192 / 20) * w.leveltime) * (TAU / 8192); // FINEANGLES/20 is integer division
  const bob = (player.bob / 2) * Math.sin(angle) * bobScale;
  if (player.playerstate === 'live') {
    const base = player.baseViewHeight;
    player.viewheight += player.deltaviewheight;
    if (player.viewheight > base) {
      player.viewheight = base;
      player.deltaviewheight = 0;
    }
    if (player.viewheight < base / 2) {
      player.viewheight = base / 2;
      if (player.deltaviewheight <= 0) player.deltaviewheight = 1;
    }
    if (player.deltaviewheight) {
      player.deltaviewheight += 0.25;
      if (!player.deltaviewheight) player.deltaviewheight = 1;
    }
  }
  player.viewz = mo.z + player.viewheight + bob;
  if (player.viewz > mo.ceilingz - 4) player.viewz = mo.ceilingz - 4;
}

function updateCrouch(w, player) {
  const cmd = player.cmd;
  const mo = player.mo;
  player.prevCrouch = player.crouchFrac;
  const allow = w.settings.allowCrouch !== false;
  let want = allow && (cmd.crouch || !!player.slide) ? 1 : 0;
  if (!want && player.crouchFrac > 0) {
    // Need headroom to stand up.
    if (mo.ceilingz - mo.z < STAND_HEIGHT) want = 1;
  }
  const step = 1 / 6;
  if (player.crouchFrac < want) player.crouchFrac = Math.min(want, player.crouchFrac + step);
  else if (player.crouchFrac > want) player.crouchFrac = Math.max(want, player.crouchFrac - step);
  const h = STAND_HEIGHT + (CROUCH_HEIGHT - STAND_HEIGHT) * player.crouchFrac;
  const prevBase = player.baseViewHeight;
  player.baseViewHeight = VIEWHEIGHT + (CROUCH_VIEW - VIEWHEIGHT) * player.crouchFrac;
  if (player.viewheight > player.baseViewHeight || prevBase !== player.baseViewHeight) {
    player.viewheight += player.baseViewHeight - prevBase;
  }
  mo.height = h;
}

function movePlayer(w, player) {
  const cmd = player.cmd;
  const mo = player.mo;
  const s = w.settings;
  player.onground = mo.z <= mo.floorz;
  const cfg = weaponCfg(player.readyweapon);

  // Sprint: forward only, not while aiming, firing or reloading in tube mode.
  const recentlyFired = w.leveltime - (player.mods.lastFireTic ?? -100) < 10;
  player.sprinting = !!(s.allowSprint !== false && cmd.sprint && cmd.forwardmove > 0
    && player.mods.ads < 0.1 && !recentlyFired && player.crouchFrac < 0.5 && !player.slide);
  player.sprintFrac += ((player.sprinting ? 1 : 0) - player.sprintFrac) * 0.25;

  // Slide: crouch while sprinting on the ground.
  if (s.allowSlide !== false && !player.slide && player.onground && cmd.crouch && !player.crouchHeld
    && player.sprintFrac > 0.6 && Math.hypot(mo.momx, mo.momy) > 12) {
    const ang = Math.atan2(mo.momy, mo.momx);
    mo.momx += Math.cos(ang) * 6;
    mo.momy += Math.sin(ang) * 6;
    player.slide = { t: 0, total: 22 };
    w.sound(mo, 'x_slide_start', { channel: 'body', volume: 0.6 });
  }
  player.crouchHeld = cmd.crouch;

  let fwd = cmd.forwardmove;
  let side = cmd.sidemove;
  let mul = 1;
  if (player.sprinting) mul *= s.sprintSpeed || 1.3;
  if (player.mods.ads > 0) mul *= 1 + ((cfg.ads?.move ?? 0.6) - 1) * player.mods.ads;
  if (player.crouchFrac > 0 && !player.slide) mul *= 1 - 0.5 * player.crouchFrac;
  if (player.slide) {
    player.slide.t++;
    fwd = 0; side = 0;
    player.slideFriction = 0.965;
    if (player.slide.t >= player.slide.total || Math.hypot(mo.momx, mo.momy) < 4 || !cmd.crouch && player.slide.t > 8) {
      player.slide = null;
      player.slideFriction = 0;
    }
  } else {
    player.slideFriction = 0;
  }
  const air = player.onground ? 1 : (s.airControl ?? 0.08);
  if (fwd) thrust(player, mo.angle, (fwd * mul / 32) * air);
  if (side) thrust(player, mo.angle - ANG90, (side * mul / 32) * air);

  // Jump
  if (cmd.jump && !player.jumpdown && player.onground && s.allowJump !== false && player.crouchFrac < 0.5
    && w.jumpAllowedAt(mo)) {
    mo.momz = JUMP_SPEED;
    player.jumpFloor = mo.floorz;
    player.onground = false;
    if (player.slide) { player.slide = null; player.slideFriction = 0; }
    w.sound(mo, 'x_jump', { channel: 'body', volume: 0.5 });
  }
  player.jumpdown = cmd.jump;

  if ((fwd || side) && mo.state === S.S_PLAY) setMobjState(w, mo, S.S_PLAY_RUN1);
}

function deathThink(w, player) {
  movePsprites(w, player);
  if (player.viewheight > 6) player.viewheight -= 1;
  if (player.viewheight < 6) player.viewheight = 6;
  player.deltaviewheight = 0;
  player.onground = player.mo.z <= player.mo.floorz;
  calcHeight(w, player);
  player.pitch *= 0.9;
  if (player.attacker && player.attacker !== player.mo) {
    const angle = pointToAngle(player.mo.x, player.mo.y, player.attacker.x, player.attacker.y);
    const delta = normAngle(angle - player.mo.angle);
    if (delta < ANG5 || delta > TAU - ANG5) {
      player.mo.angle = angle;
      if (player.damagecount) player.damagecount--;
    } else if (delta < ANG180) player.mo.angle = normAngle(player.mo.angle + ANG5);
    else player.mo.angle = normAngle(player.mo.angle - ANG5);
  } else if (player.damagecount) player.damagecount--;
  if (player.cmd.use && w.leveltime - (player.deathTic || 0) > 20) player.playerstate = 'reborn';
}

export function playerThink(w, player) {
  const mo = player.mo;
  if (player.cheats & 1) mo.flags |= MF.NOCLIP;
  else mo.flags &= ~MF.NOCLIP;
  const cmd = player.cmd;
  if (mo.flags & MF.JUSTATTACKED) {
    cmd.forwardmove = 0xc800 / 512;
    cmd.sidemove = 0;
    mo.flags &= ~MF.JUSTATTACKED;
  }
  if (player.playerstate === 'dead') {
    if (player.climb) abortClimb(w, player);
    deathThink(w, player);
    return;
  }
  if (player.climb) {
    // On a Chinatown ladder (ct/ladder.js): the climb moves body and view,
    // the controls and the weapon wait.
    climbThink(w, player);
    player.usedown = !!cmd.use;
  } else {
    updateCrouch(w, player);
    if (mo.reactiontime) mo.reactiontime--;
    else movePlayer(w, player);
    calcHeight(w, player);
    if (mo.subsector.sector.special) w.specials.playerInSpecialSector(player);

    // Weapon change
    let newweapon = cmd.weapon;
    if (cmd.nextWeapon) newweapon = cycleWeapon(w, player, cmd.nextWeapon);
    if (newweapon >= 0) {
      if (newweapon === WP.FIST && player.weaponowned[WP.CHAINSAW]
        && !(player.readyweapon === WP.CHAINSAW && player.powers[PW.STRENGTH])) newweapon = WP.CHAINSAW;
      if (w.commercial && newweapon === WP.SHOTGUN && player.weaponowned[WP.SUPERSHOTGUN]
        && player.readyweapon !== WP.SUPERSHOTGUN) newweapon = WP.SUPERSHOTGUN;
      if (player.weaponowned[newweapon] && newweapon !== player.readyweapon) player.pendingweapon = newweapon;
    }
    if (cmd.use) {
      if (!player.usedown) {
        useLines(w, player);
        player.usedown = true;
      }
    } else player.usedown = false;

    tickHandling(w, player);
    movePsprites(w, player);
  }

  if (player.powers[PW.STRENGTH]) player.powers[PW.STRENGTH]++;
  if (player.powers[PW.INVULNERABILITY]) player.powers[PW.INVULNERABILITY]--;
  if (player.powers[PW.INVISIBILITY]) {
    if (!--player.powers[PW.INVISIBILITY]) mo.flags &= ~MF.SHADOW;
  }
  if (player.powers[PW.INFRARED]) player.powers[PW.INFRARED]--;
  if (player.powers[PW.IRONFEET]) player.powers[PW.IRONFEET]--;
  if (player.damagecount) player.damagecount--;
  if (player.bonuscount) player.bonuscount--;
  if (player.powers[PW.INVULNERABILITY]) {
    player.fixedcolormap = (player.powers[PW.INVULNERABILITY] > 4 * 32 || (player.powers[PW.INVULNERABILITY] & 8)) ? 32 : 0;
  } else if (player.powers[PW.INFRARED]) {
    player.fixedcolormap = (player.powers[PW.INFRARED] > 4 * 32 || (player.powers[PW.INFRARED] & 8)) ? 1 : 0;
  } else player.fixedcolormap = 0;
  // Damage direction indicators fade.
  for (const d of player.damageDirs) d.t--;
  player.damageDirs = player.damageDirs.filter((d) => d.t > 0);
}

const CYCLE = [WP.FIST, WP.CHAINSAW, WP.PISTOL, WP.SHOTGUN, WP.SUPERSHOTGUN, WP.CHAINGUN, WP.MISSILE, WP.PLASMA, WP.BFG];

function cycleWeapon(w, player, dir) {
  const cur = player.pendingweapon !== WP.NOCHANGE ? player.pendingweapon : player.readyweapon;
  let i = CYCLE.indexOf(cur);
  for (let n = 0; n < CYCLE.length; n++) {
    i = (i + dir + CYCLE.length) % CYCLE.length;
    const wp = CYCLE[i];
    if (!player.weaponowned[wp]) continue;
    if (weaponRounds(player, wp) <= 0) continue;
    return wp;
  }
  return -1;
}

export { PS_WEAPON };
