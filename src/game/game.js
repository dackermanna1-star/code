// Game flow: title, levels, intermission and finale, plus level
// progression rules for DOOM, Ultimate DOOM and DOOM II.

import { World } from './world.js';
import { newGamePlayer } from './player.js';
import { SKILL, TICRATE } from './defs.js';
import { MUSIC_NAMES } from './info.js';
import { LEVEL_NAMES, PAR_TIMES, FINALE } from './data.js';
import { MAP_COMPAT } from './compat.js';
import { saveGame, loadGame } from './savegame.js';

const E4_MUSIC = ['e3m4', 'e3m2', 'e3m3', 'e1m5', 'e2m7', 'e2m4', 'e2m6', 'e2m5', 'e1m9'];

export class Game {
  constructor({ stack, res, settings, gamemode, audio }) {
    this.stack = stack;
    this.res = res;
    this.settings = settings;
    this.gamemode = gamemode;
    this.commercial = gamemode === 'commercial';
    this.audio = audio;
    this.state = 'title';
    this.world = null;
    this.player = null;
    this.skill = SKILL.MEDIUM;
    this.episode = 1;
    this.map = 1;
    this.secretExit = false;
    this.listeners = {};
    this.fxFactory = null;
    this.paused = false;
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, ...args) { for (const fn of this.listeners[ev] || []) fn(...args); }

  mapName(episode = this.episode, map = this.map) {
    return this.commercial ? `MAP${String(map).padStart(2, '0')}` : `E${episode}M${map}`;
  }

  levelTitle(episode = this.episode, map = this.map) {
    const name = this.mapName(episode, map);
    const table = this.commercial ? LEVEL_NAMES.doom2 : LEVEL_NAMES.doom;
    return (table && table[name]) || name;
  }

  musicFor(episode, map) {
    let name;
    if (this.commercial) name = MUSIC_NAMES[MUSIC_NAMES.indexOf('runnin') + map - 1];
    else if (episode === 4) name = E4_MUSIC[map - 1];
    else name = `e${episode}m${map}`;
    return name ? `D_${name.toUpperCase()}` : null;
  }

  skyFor(episode, map) {
    if (this.commercial) return map < 12 ? 'SKY1' : map < 21 ? 'SKY2' : 'SKY3';
    return `SKY${Math.min(4, episode)}`;
  }

  newGame(episode, skill, map = 1) {
    this.skill = skill;
    this.episode = episode;
    this.map = map;
    // G_InitNew: a new game is never paused and forgets any pending level.
    this.paused = false;
    this.pendingNext = null;
    this.player = newGamePlayer();
    this.player.useMagazines = this.settings.get('useMagazines') !== false;
    if (!this.player.useMagazines) { this.player.ammo[0] += this.player.mag[1]; this.player.mag[1] = 0; }
    this.startLevel();
  }

  startLevel() {
    const mapName = this.mapName();
    const lumps = this.stack.mapLumps(mapName);
    if (!lumps) throw new Error(`Map ${mapName} not found`);
    if (this.player.playerstate === 'dead') this.player.playerstate = 'reborn';
    if (this.player.playerstate === 'reborn') this.player.reborn();
    this.player.resetForNewLevel();
    const w = new World({
      game: this,
      res: this.res,
      settings: this.settings.values,
      mapName,
      episode: this.episode,
      map: this.map,
      commercial: this.commercial,
      gamemode: this.gamemode,
      skill: this.skill,
      player: this.player,
      lumps,
      audio: this.audio,
    });
    w.compat = MAP_COMPAT[mapName] || null;
    if (this.fxFactory) w.fx = this.fxFactory(w);
    w.start();
    this.world = w;
    this.state = 'level';
    this.levelStartTime = performance.now();
    this.emit('levelStart', w);
    const music = this.musicFor(this.episode, this.map);
    if (music) this.emit('music', music);
  }

  // One 35 Hz tic.
  tick(cmd) {
    if (this.state !== 'level' || !this.world || this.paused) return;
    const w = this.world;
    const p = this.player;
    if (cmd) p.cmd = cmd;
    // Keep the previous psprite offsets for render interpolation.
    p.pspPrev = { sx: p.psprites[0].sx, sy: p.psprites[0].sy };
    if (p.mods) { p.mods.prevAds = p.mods.ads; }
    w.tick();
    if (p.hitMarker > 0) p.hitMarker--;
    if (p.playerstate === 'reborn') {
      this.emit('playerReborn');
      this.player.playerstate = 'reborn';
      this.restartLevelAfterDeath();
      return;
    }
    if (w.exitRequest) this.completeLevel(w.exitRequest.secret);
  }

  restartLevelAfterDeath() {
    this.emit('wipe');
    this.startLevel();
  }

  completeLevel(secret) {
    const w = this.world;
    const p = this.player;
    this.secretExit = secret;
    const parTable = this.commercial ? PAR_TIMES.doom2 : PAR_TIMES.doom;
    const stats = {
      episode: this.episode,
      map: this.map,
      mapName: this.mapName(),
      next: this.nextMap(secret),
      title: this.levelTitle(),
      kills: p.killcount, totalKills: w.totalkills,
      items: p.itemcount, totalItems: w.totalitems,
      secrets: p.secretcount, totalSecrets: w.totalsecret,
      time: Math.floor(w.leveltime / TICRATE),
      par: (parTable && parTable[this.mapName()]) || 0,
      didSecret: secret,
    };
    // Weapons survive, powers and keys do not.
    p.powers.fill(0);
    p.cards.fill(false);
    p.extralight = 0;
    p.fixedcolormap = 0;
    p.damagecount = 0;
    p.bonuscount = 0;
    // wminfo.didsecret is the value from before this exit: G_WorldDone only
    // sets players[].didsecret once the intermission is over.
    stats.didSecret = secret || p.didsecret;
    stats.secretExit = secret;
    this.lastStats = stats;
    // Like G_DoCompleted: DOOM 1 episode ends go straight to the finale.
    if (!this.commercial && this.map === 8) {
      this.advance();
      return;
    }
    this.state = 'intermission';
    this.emit('intermission', stats);
  }

  nextMap(secret) {
    const e = this.episode, m = this.map;
    if (this.commercial) {
      if (secret) {
        if (m === 15) return { episode: 1, map: 31 };
        if (m === 31) return { episode: 1, map: 32 };
      }
      if (m === 31 || m === 32) return { episode: 1, map: 16 };
      if (m === 30) return null;
      return { episode: 1, map: m + 1 };
    }
    if (secret) {
      const from = { 1: 3, 2: 5, 3: 6, 4: 2 }[e];
      if (m === from) return { episode: e, map: 9 };
    }
    if (m === 9) return { episode: e, map: { 1: 4, 2: 6, 3: 7, 4: 3 }[e] };
    if (m === 8) return null;
    return { episode: e, map: m + 1 };
  }

  // After intermission: finale or next level.
  advance() {
    const stats = this.lastStats;
    const finale = this.finaleAfter(stats);
    if (finale) {
      this.state = 'finale';
      this.emit('finale', finale);
      this.pendingNext = stats.next || null;
      return;
    }
    if (!stats.next) {
      this.state = 'title';
      this.emit('title');
      return;
    }
    this.episode = stats.next.episode;
    this.map = stats.next.map;
    this.startLevel();
  }

  finaleAfter(stats) {
    if (this.commercial) {
      const m = stats.map;
      const table = FINALE.doom2 || {};
      // G_WorldDone: c5/c6 follow the secret exits of MAP15/MAP31, the
      // others follow the normal exits of MAP06/11/20/30.
      const secretExit = !!stats.secretExit;
      for (const key of Object.keys(table)) {
        const f = table[key];
        const needsSecret = key === 'c5' || key === 'c6';
        if (f.afterMap === m && needsSecret === secretExit) return { ...f, key };
      }
      return null;
    }
    if (stats.map === 8) {
      const f = FINALE.doom[`e${stats.episode}`];
      return f ? { ...f, key: `e${stats.episode}`, episode: stats.episode } : null;
    }
    return null;
  }

  // Called by the finale UI when the player presses on (Doom II mid-game texts).
  finaleDone() {
    if (this.pendingNext) {
      const n = this.pendingNext;
      this.pendingNext = null;
      this.episode = n.episode;
      this.map = n.map;
      this.startLevel();
      return;
    }
    this.state = 'title';
    this.emit('title');
  }

  save(description) {
    return saveGame(this, description);
  }

  // Restores a saved level (see savegame.js).
  restore(data) {
    const w = loadGame(this, data);
    w.compat = MAP_COMPAT[w.mapName] || null;
    if (this.fxFactory) w.fx = this.fxFactory(w);
    this.world = w;
    this.state = 'level';
    this.paused = false;
    this.emit('levelStart', w);
    const music = this.musicFor(this.episode, this.map);
    if (music) this.emit('music', music);
  }

  // IDCLEV: like G_DeferedInitNew, a fresh pistol start on the chosen map.
  warp(episode, map) {
    this.newGame(episode, this.skill, map);
  }
}
