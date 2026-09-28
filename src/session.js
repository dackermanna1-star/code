// Session: campaign flow (menus -> loading -> chapters -> safe rooms -> finale),
// wiring of gameplay events to dialogue, HUD, director, audio and effects.
import * as THREE from 'three';
import { Game } from './game.js';
import { HUD } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { VoiceSystem } from './audio/voice.js';
import { Director } from './ai/director.js';
import { ItemManager } from './world/items.js';
import { PropManager } from './world/dynamic.js';
import { BotBrain } from './entities/bot.js';
import { SurvivorModel } from './entities/survivorModel.js';
import { CAMPAIGNS, campaignById } from './levels/campaign.js';
import { saveSettings, QUALITY, DIFFICULTY } from './config.js';
import { F_SOLID } from './world/collision.js';
import { clamp, pick } from './core/math.js';
import { NetLink } from './net/link.js';
import { CoopHost, CoopClient, withSeed } from './net/coop.js';

const STEP_SURF = { concrete: 'stepConcrete', plaster: 'stepConcrete', brick: 'stepConcrete', tile: 'stepTile', wood: 'stepWood', carpet: 'stepCarpet', metal: 'stepMetal', dirt: 'stepDirt', fabric: 'stepCarpet', rubber: 'stepConcrete', glass: 'stepTile', water: 'stepWater' };

// Compact, JSON-safe survivor event payloads for co-op clients.
function liteEventData(e, d) {
  if (d == null || typeof d !== 'object') return d ?? null;
  if (e === 'hurt') return { a: Math.round(d.amount * 10) / 10, t: d.type, x: d.attacker?.pos ? Math.round(d.attacker.pos.x * 10) / 10 : null, z: d.attacker?.pos ? Math.round(d.attacker.pos.z * 10) / 10 : null };
  if (d.type) return { type: d.type, dur: d.dur, target: d.target?.char?.id || null };
  return null;
}

export class Session {
  constructor(canvas, uiRoot, settings, audio) {
    this.canvas = canvas;
    this.ui = uiRoot;
    this.settings = settings;
    this.audio = audio;
    this.setCampaign(CAMPAIGNS[0].id);
    this.game = null;
    this.chapterIdx = 0;
    this.campaignTime = 0;
    this.menu = new Menu(uiRoot, this);
    this.fadeEl = document.createElement('div');
    this.fadeEl.className = 'fade';
    uiRoot.appendChild(this.fadeEl);
    this.state = 'menu';
    this.createGame();
  }

  createGame() {
    const hooks = {
      audio: this.audio,
      onSurvivorEvent: (s, e, d) => this.onSurvivorEvent(s, e, d),
      onWeaponEvent: (s, w, e) => this.onWeaponEvent(s, w, e),
      beforeSurvivors: (dt) => this.beforeSurvivors(dt),
      afterSurvivors: (dt) => this.afterSurvivors(dt),
      afterInfected: (dt) => this.afterInfected(dt),
      afterUpdate: (dt) => this.afterUpdate(dt),
    };
    const g = new Game(this.canvas, this.settings, hooks);
    this.game = g;
    window.game = g;
    g.session = this;
    g.hud = new HUD(g, this.ui);
    g.voice = new VoiceSystem(g);
    g.voice.subs = (t, n, c, d) => { if (this.settings.subtitles !== false) g.hud.subtitle(t, n, c, d); };
    g.director = new Director(g);
    g.items = new ItemManager(g);
    g.props = new PropManager(g);
    g.hittables = [];
    this.installGameEvents(g);
    if (this.net) this.net.attach(g);
    g.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !g.paused && !this.lockGrace) this.pause();
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.state === 'playing' && g.paused) { /* menu handles */ }
      }
    });
  }

  uiClick() { this.audio.resume?.(); this.audio.play('uiClick', { vol: 0.6 }); }
  saveSettings() { saveSettings(this.settings); }
  applySettings() {
    const g = this.game;
    const s = this.settings;
    g.input.sensitivity = s.sensitivity;
    g.input.invertY = s.invertY;
    this.audio.setVolumes?.({ master: s.master, music: s.music, sfx: s.sfx, voice: s.voice });
    if (g.level?._arrowMesh) g.level._arrowMesh.visible = s.guideArrows !== false;
  }

  // ------------------------------------------------------------- flow --
  showMainMenu() {
    this.state = 'menu';
    this.game.state = 'menu';
    this.game.hud.show(false);
    this.menu.main();
    this.audio.music?.setState('calm');
    // atmospheric background: load the first chapter behind the menu
    if (!this.game.level) this.loadBackdrop();
  }
  loadBackdrop() {
    const g = this.game;
    try {
      g.createSurvivors(this.settings.character);
      this.buildChapter(0, true);
      g.state = 'menu';
      const L = g.level;
      const cam = g.renderer.camera;
      const bp = L.menuCam || { x: 0, y: 20, z: 0, yaw: 0, pitch: -0.1 };
      g.player.teleport(bp.x, bp.y, bp.z, bp.yaw);
      g.player.pitch = bp.pitch;
      this.menuCamT = 0;
    } catch (e) { console.error(e); }
  }
  setCampaign(id) {
    this.campaign = campaignById(id);
    this.chapters = this.campaign.chapters;
  }
  async startCampaign(chapter = 0, campaignId) {
    if (campaignId) this.setCampaign(campaignId);
    this.campaignTime = 0;
    this.chapterIdx = chapter;
    this.savedInventories = null;
    const g = this.game;
    // quality/difficulty changes require a new game object
    if (QUALITY[this.settings.quality] !== g.quality) {
      this.menu.clear();
      g.renderer.r.dispose();
      this.createGame();
    }
    this.game.difficulty = DIFFICULTY[this.settings.difficulty];
    this.game.createSurvivors(this.settings.character);
    await this.loadChapter(chapter);
  }
  async loadChapter(i, retry = false, netLoad = null) {
    const g = this.game;
    const ch = this.chapters[i];
    this.chapterIdx = i;
    this.state = 'loading';
    g.state = 'loading';
    g.hud.show(false);
    const prog = this.menu.loading(ch.title, i, this.campaign.title);
    prog(0.1);
    await new Promise((r) => setTimeout(r, 60));
    g.voice.reset();
    g.hud.clearTransient?.();
    this.audio.stopAll?.();
    prog(0.3);
    await new Promise((r) => setTimeout(r, 30));
    this.buildChapter(i, false, retry, netLoad ? netLoad.seed : undefined);
    if (netLoad) g.net?.levelReady(netLoad.items);
    else if (g.net?.host) g.net.chapterLoaded(i, retry);
    prog(0.9);
    await new Promise((r) => setTimeout(r, 30));
    // warm up shaders
    g.renderer.render(0.016);
    prog(1);
    this.menu.clear();
    this.state = 'playing';
    g.state = 'playing';
    g.paused = false;
    g.hud.show(true);
    this.chapterTime = 0;
    this.fade(1, 0);
    this.lockGrace = true;
    g.input.requestLock();
    setTimeout(() => { this.lockGrace = false; }, 800);
    g.hud.titleCard(ch.title, this.campaign.title + ' · ' + (i + 1) + ' / ' + this.chapters.length, 6);
    this.audio.music?.stinger?.('chapterStart');
    if (!g.net?.client) ch.onStart?.(g, this);
    if (!g.input.locked) this.menu.clickToPlay(() => { this.menu.clear(); g.input.requestLock(); });
  }
  buildChapter(i, backdrop = false, retry = false, seed) {
    const g = this.game;
    const ch = this.chapters[i];
    const client = !!g.net?.client;
    // level builds are seeded so co-op peers construct identical worlds
    this.levelSeed = seed ?? ((Math.random() * 2147483647) | 0);
    g.props.clear();
    g.items.clear();
    g.hittables = [];
    g.hooks.cutscene = null;
    g.cheats.godAll = false;
    if (this.lbEl) this.lbEl.classList.remove('on');
    g.hud.root.classList.remove('cine');
    g.viewmodel.visible = true;
    for (const s of g.survivors) s.model?.dispose();
    const level = withSeed(this.levelSeed, () => g.loadLevel((L, game) => ch.build(L, game), { def: ch.def || {} }));
    level.chapter = ch;
    // survivors
    for (const s of g.survivors) {
      if (!backdrop && !client) {
        if (retry && this.savedInventories) this.restoreSurvivor(s);
        else if (i > 0 || s.dead) s.respawnForChapter();
      }
      new SurvivorModel(g, s);
      s.model.setHidden(s === g.player);
      s.brain = s.isBot && !client && s.remote == null ? new BotBrain(g, s, g.survivors.indexOf(s)) : null;
      s.cancelAction();
      s.usingMounted = null;
    }
    g.placeSurvivors();
    if (client) {
      g.director.reset(null);
    } else if (!backdrop) {
      this.saveInventories();
      g.director.reset(level);
      if (g.net) g.net.building = true;
      g.items.populate(level, g.director);
      if (g.net) g.net.building = false;
    } else {
      g.director.reset(null);
      g.items.populate(level, null);
    }
    this.endTriggered = false;
    this.failT = 0;
    this.stepAcc = new Map();
    this.lastReverb = null;
    this.lastAmb = null;
    this.audio.setReverb?.(level.env.reverb || 'outdoor');
    this.audio.setAmbience?.(level.env.ambience || null);
    g.time = 0;
    if (!client) level.script?.start?.();
    else level.script?.clientStart?.(); // co-op clients: visual-only setup
  }
  saveInventories() {
    this.savedInventories = this.game.survivors.map((s) => ({
      health: s.health, temp: s.temp, incapCount: s.incapCount, dead: s.dead,
      primary: s.inv.primary ? { type: s.inv.primary.type, clip: s.inv.primary.clip, reserve: s.inv.primary.reserve } : null,
      secondary: { type: s.inv.secondary.type, dual: s.inv.secondary.dual },
      throwable: s.inv.throwable, medkit: s.inv.medkit, pills: s.inv.pills,
    }));
  }
  restoreSurvivor(s) {
    const d = this.savedInventories[this.game.survivors.indexOf(s)];
    s.reset(false);
    s.dead = false;
    s.health = d.health || 50; s.temp = d.temp; s.incapCount = d.incapCount;
    s.inv.primary = null;
    if (d.primary) { s.giveWeapon(d.primary.type, { clip: d.primary.clip, reserve: d.primary.reserve }); }
    s.giveWeapon(d.secondary.type);
    s.inv.secondary.dual = d.secondary.dual;
    s.inv.throwable = d.throwable; s.inv.medkit = d.medkit; s.inv.pills = d.pills;
    s.slot = s.inv.primary ? 0 : 1;
  }
  restartChapter() {
    this.menu.clear();
    this.loadChapter(this.chapterIdx, true);
  }
  quitToMenu() {
    const g = this.game;
    this.leaveNet();
    g.paused = false;
    g.voice.reset();
    this.audio.stopAll?.();
    g.input.exitLock();
    this.showMainMenu();
  }
  pause() {
    const g = this.game;
    if (this.state !== 'playing') return;
    g.paused = true;
    g.input.exitLock();
    this.menu.pause();
    try { window.speechSynthesis?.pause(); } catch (e) { /* */ }
  }
  resume() {
    const g = this.game;
    this.menu.clear();
    g.paused = false;
    this.lockGrace = true;
    g.input.requestLock();
    setTimeout(() => { this.lockGrace = false; }, 500);
    try { window.speechSynthesis?.resume(); } catch (e) { /* */ }
  }
  // Screen fade, animated from the frame loop by wall-clock time (tickFade) so
  // it can never get stuck mid-way the way a CSS transition can when frames
  // are delayed by a long synchronous level build.
  fade(from, to, dur = 1.2) {
    this.fadeAnim = { from, to, dur: Math.max(0.01, dur), t0: performance.now() };
    this.fadeEl.style.transition = 'none';
    this.fadeEl.style.opacity = from;
  }
  tickFade() {
    const a = this.fadeAnim;
    if (!a) return;
    const k = Math.min(1, (performance.now() - a.t0) / 1000 / a.dur);
    this.fadeEl.style.opacity = a.from + (a.to - a.from) * k;
    if (k >= 1) this.fadeAnim = null;
  }
  // letterboxed cutscene presentation (HUD hidden)
  cinematic(on) {
    const g = this.game;
    if (!this.lbEl) {
      this.lbEl = document.createElement('div');
      this.lbEl.className = 'letterbox';
      this.lbEl.innerHTML = '<div></div><div></div>';
      this.fadeEl.parentNode.insertBefore(this.lbEl, this.fadeEl);
    }
    this.lbEl.classList.toggle('on', !!on);
    g.hud.root.classList.toggle('cine', !!on);
  }
  objective(text, sub = 'Objective') {
    this.game.hud.setObjective(`<small>${sub}</small>${text}`, 8);
    this.audio.play('objective', { vol: 0.5 });
  }
  chapterComplete() {
    if (this.endTriggered) return;
    this.endTriggered = true;
    const g = this.game;
    if (g.net?.host) g.net.sendEnd('complete');
    const ch = this.chapters[this.chapterIdx];
    this.campaignTime += this.chapterTime;
    this.audio.play('chapterComplete', { vol: 0.8 });
    this.audio.music?.stinger?.('safeRoom');
    this.fade(0, 1, 1.5);
    setTimeout(() => {
      g.state = 'menu';
      this.state = 'stats';
      g.input.exitLock();
      g.hud.show(false);
      this.menu.chapterComplete(ch.title, g.survivors, this.chapterTime, () => {
        if (this.chapterIdx + 1 < this.chapters.length) this.loadChapter(this.chapterIdx + 1);
        else this.victory();
      });
      this.fade(1, 0, 0.6);
    }, 1800);
  }
  victory() {
    const g = this.game;
    if (this.state === 'victory') return;
    if (g.net?.host) g.net.sendEnd('victory');
    this.state = 'victory';
    g.state = 'menu';
    g.input.exitLock();
    g.hud.show(false);
    this.campaignTime += this.chapterTime || 0;
    this.audio.music?.setState('rescue');
    this.menu.victory(g.survivors, this.campaignTime, () => this.quitToMenu());
  }
  failed() {
    if (this.state !== 'playing') return;
    const g = this.game;
    if (g.net?.host) g.net.sendEnd('failed');
    this.state = 'failed';
    this.audio.music?.stinger?.('death');
    this.fade(0, 0.7, 2);
    setTimeout(() => {
      g.state = 'menu';
      g.input.exitLock();
      g.hud.show(false);
      this.menu.failed(() => { this.fade(1, 0, 0.1); this.restartChapter(); }, () => { this.fade(1, 0, 0.1); this.quitToMenu(); });
    }, 2500);
  }

  // ----------------------------------------------------------- per frame --
  beforeSurvivors(dt) {
    const g = this.game;
    // bots think
    for (const s of g.survivors) if (s.brain) s.brain.update(dt);
    // human interaction (use key): local player + co-op players
    this.interact(g.player, true);
    for (const s of g.survivors) if (s.remote != null && s !== g.player) this.interact(s, false);
  }
  interact(p, local) {
    const g = this.game;
    if (!p.dead && !p.incapped && !p.pinned && !p.usingMounted) {
      const u = g.items.findUsable(p);
      if (local) {
        g.currentUsable = u;
        g.items.setHighlight(u && u.item ? u.item : null);
      }
      const c = p.cmd;
      if (u && c.usePressed && !p.action) {
        if (u.item) g.items.take(u.item, p);
        else if (u.revive) { p.startAction('revive', 5, { hold: 'use', immobile: true, target: u.revive }); u.revive.beingRevived = p; }
        else if (u.usable) {
          if (u.usable.hold) p.startAction('use', u.usable.hold, { hold: 'use', usable: u.usable, label: u.usable.holdLabel || u.usable.prompt, immobile: true });
          else u.usable.onUse(p);
        }
      }
    } else if (local) { g.currentUsable = null; g.items.setHighlight(null); }
  }
  afterSurvivors(dt) {
    const g = this.game;
    for (const s of g.survivors) {
      s.model?.update(dt);
      this.footsteps(s, dt);
    }
    g.props.update(dt);
    g.items.update(dt);
    if (!g.net?.client) for (const h of g.hittables) h.update?.(dt);
  }
  afterInfected(dt) {
    const g = this.game;
    g.director.update(dt);
  }
  afterUpdate(dt) {
    const g = this.game;
    this.chapterTime = (this.chapterTime || 0) + dt;
    g.hud.update(dt);
    this.updateScreenFx(dt);
    this.updateAudioZones();
    // listener
    const cam = g.renderer.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    this.audio.setListener?.(cam.position, fwd, up);
    this.audio.update?.(dt);
    if (!g.net?.client) this.checkEnd(dt);
    // low health chatter
    for (const s of g.survivors) {
      if (!s.dead && !s.incapped && s.totalHealth < 25 && Math.random() < dt * 0.02) g.voice.say(s, 'lowHealth', 1, { cooldown: 40 });
    }
    // occasional idle chatter in quiet times
    if (g.director.state === 'relax' && Math.random() < dt * 0.004) {
      const s = pick(g.survivors.filter((x) => !x.dead && !x.incapped));
      if (s) g.voice.say(s, 'idle', 0, { cooldown: 90, teamCooldown: 45 });
    }
    // smoke clouds (smoker death) cough/obscure
    if (g.smokeClouds) {
      for (let i = g.smokeClouds.length - 1; i >= 0; i--) { g.smokeClouds[i].t -= dt; if (g.smokeClouds[i].t <= 0) g.smokeClouds.splice(i, 1); }
    }
  }
  checkEnd(dt) {
    const g = this.game;
    // end-of-chapter check (end safe room with door closed)
    const L = g.level;
    if (L.endSafe && !this.endTriggered && L.endDoor && !L.endDoor.open) {
      const alive = g.survivors.filter((s) => !s.dead);
      const allIn = alive.length > 0 && alive.every((s) => L.inBox(L.endSafe, s.pos, 0.1) && !s.incapped);
      const humanIn = L.inBox(L.endSafe, g.player.pos, 0.1) || g.player.dead;
      if (allIn && humanIn) this.chapterComplete();
    }
    // failure: everyone down or dead
    const standing = g.survivors.filter((s) => !s.dead && !s.incapped && !s.pinned);
    if (standing.length === 0 && this.state === 'playing' && !this.endTriggered) {
      this.failT += dt;
      if (this.failT > 3.5 || g.survivors.every((s) => s.dead)) this.failed();
    } else this.failT = 0;
  }
  footsteps(s, dt) {
    const g = this.game;
    if (s.dead || s.incapped || !s.phys.onGround) return;
    const sp = Math.hypot(s.phys.vx, s.phys.vz);
    if (sp < 0.8) return;
    let acc = (this.stepAcc.get(s) || 0) + sp * dt;
    const stride = s.sprinting ? 2.3 : s.crouching ? 1.1 : 1.7;
    if (acc > stride) {
      acc = 0;
      const h = g.level.col.raycast(s.pos.x, s.pos.y + 0.3, s.pos.z, 0, -1, 0, 0.8, F_SOLID);
      const inWater = g.level.waterY != null && s.pos.y < g.level.waterY + 0.05 && g.level.inWater?.(s.pos);
      const name = inWater ? 'stepWater' : STEP_SURF[h ? h.surf : 'concrete'] || 'stepConcrete';
      g.noFwd++;
      g.audio.play(name, { pos: s.pos, vol: s.isHuman ? (s.crouching ? 0.25 : 0.5) : 0.35, owner: s });
      g.noFwd--;
      if (inWater) g.fx.splash(s.pos.x, s.pos.y + 0.05, s.pos.z, 3);
    }
    this.stepAcc.set(s, acc);
  }
  updateScreenFx(dt) {
    const g = this.game;
    const fx = g.renderer.fx;
    const p = g.player;
    const tot = p.dead ? 0 : p.totalHealth;
    fx.lowHealth.value = p.dead ? 0 : p.incapped ? 1 : clamp((30 - tot) / 30, 0, 1);
    fx.bw.value = p.dead ? 0.9 : p.blackAndWhite && !p.incapped ? 0.85 : p.incapped ? 0.6 : 0;
    fx.bile.value = clamp(p.bile / 3, 0, 1);
    fx.flash.value = Math.max(0, fx.flash.value - dt * 3);
    fx.chroma.value = Math.max(0, fx.chroma.value - dt * 2);
    let smoke = 0;
    if (g.smokeClouds) for (const c of g.smokeClouds) { const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z); if (d < c.r) smoke = Math.max(smoke, (1 - d / c.r) * Math.min(1, c.t / 2)); }
    fx.smoke.value = smoke * 0.8;
    fx.blur.value = p.incapped ? 0.25 : 0;
    this.audio.heartbeat?.(p.dead ? 0 : p.blackAndWhite || tot < 20 ? clamp((30 - tot) / 30, 0.3, 1) : 0);
  }
  updateAudioZones() {
    const g = this.game;
    const L = g.level;
    const p = g.camPos;
    let rv = L.env.reverb || 'outdoor';
    for (const z of L.reverbZones) if (p.x >= z.box[0] && p.x <= z.box[3] && p.y >= z.box[1] && p.y <= z.box[4] && p.z >= z.box[2] && p.z <= z.box[5]) rv = z.preset;
    if (rv !== this.lastReverb) { this.lastReverb = rv; this.audio.setReverb?.(rv); }
    let am = L.env.ambience || null;
    for (const z of L.ambientZones) if (p.x >= z.box[0] && p.x <= z.box[3] && p.y >= z.box[1] && p.y <= z.box[4] && p.z >= z.box[2] && p.z <= z.box[5]) am = z.name;
    if (am !== this.lastAmb) { this.lastAmb = am; this.audio.setAmbience?.(am); }
  }

  // ------------------------------------------------------------ events --
  onSurvivorEvent(s, e, d) {
    const g = this.game;
    if (g.net?.host) {
      g.net.ev(['se', s.char.id, e, liteEventData(e, d)]);
      g.noFwd++;
      try { this._onSurvivorEvent(s, e, d); } finally { g.noFwd--; }
      return;
    }
    this._onSurvivorEvent(s, e, d);
  }
  _onSurvivorEvent(s, e, d) {
    const g = this.game;
    s.model?.onEvent?.(e, d);
    const v = g.voice;
    switch (e) {
      case 'hurt': {
        const type = d.type;
        g.director.onSurvivorDamaged(s, d.amount, type);
        if (s.isHuman && d.amount > 0.5) {
          g.renderer.fx.flash.value = Math.min(0.5, g.renderer.fx.flash.value + d.amount * 0.03);
          g.renderer.fx.flashColor.value.set(0.55, 0, 0);
          g.renderer.fx.chroma.value = Math.min(1, g.renderer.fx.chroma.value + d.amount * 0.05);
          if (d.attacker && d.attacker.pos) g.hud.damageFrom(d.attacker.pos.x, d.attacker.pos.z);
          s.punchP += (Math.random() - 0.3) * 0.02 * Math.min(4, d.amount);
          s.punchY += (Math.random() - 0.5) * 0.03 * Math.min(4, d.amount);
        }
        if (d.amount > 1 && Math.random() < 0.35) this.audio.play(s.char.body.female ? 'hurtFemale' : 'hurtMale', { pos: s.pos, owner: s, vol: 0.8 });
        if (type === 'ff' && d.attacker) {
          v.say(s, 'friendlyFire', 2, { cooldown: 6 });
          if (d.attacker.isBot) setTimeout(() => v.say(d.attacker, 'ffSorry', 1), 1200);
        }
        break;
      }
      case 'incap':
        g.director.onIncap(s);
        v.say(s, 'incapped', 3);
        this.audio.music?.stinger?.('incap');
        break;
      case 'death':
        for (const o of g.survivors) if (o !== s && !o.dead) { v.say(o, 'teammateDied', 3, { cooldown: 20 }); break; }
        if (s.isHuman) this.audio.music?.stinger?.('death');
        break;
      case 'revived':
        v.say(s, 'revived', 2);
        break;
      case 'actionStart':
        if (d.type === 'heal') v.say(s, d.target ? 'healOther' : 'healSelf', 1);
        if (d.type === 'revive') v.say(s, 'reviving', 2);
        if (d.type === 'pills') v.say(s, 'pills', 1);
        if (d.type === 'heal' || d.type === 'revive') this.audio.play('heal', { pos: s.pos, owner: s, vol: 0.6 });
        if (d.type === 'pills') this.audio.play('pills', { pos: s.pos, owner: s, vol: 0.6 });
        break;
      case 'throw':
        v.say(s, d === 'pipebomb' ? 'throwPipe' : 'throwMolotov', 2);
        break;
      case 'jump':
        if (s.isHuman) this.audio.play('jump', { owner: s, vol: 0.4 });
        break;
      case 'land':
        this.audio.play('land', { pos: s.pos, owner: s, vol: Math.min(1, 0.3 + (d || 0) * 0.15) });
        break;
      case 'flashlight':
        this.audio.play('flashlight', { pos: s.pos, owner: s, vol: 0.5 });
        break;
      case 'shove':
        break;
    }
  }
  onWeaponEvent(s, w, e) {
    const g = this.game;
    if (g.net?.host) {
      g.net.ev(['we', s.char.id, e]);
      g.noFwd++;
      try { this._onWeaponEvent(s, w, e); } finally { g.noFwd--; }
      return;
    }
    this._onWeaponEvent(s, w, e);
  }
  _onWeaponEvent(s, w, e) {
    const pos = s.pos;
    const o = { pos, owner: s, vol: s.isHuman ? 0.7 : 0.45 };
    const k = w.def.kind;
    switch (e) {
      case 'reload':
        if (!w.def.shellReload) {
          this.audio.play('magOut', o);
          setTimeout(() => this.audio.play('magIn', o), w.def.reload * 450);
          setTimeout(() => this.audio.play(k === 'pistol' ? 'slideRack' : 'boltCycle', o), w.def.reload * 850);
        } else this.audio.play('reloadStart', o);
        if (s.isBot && Math.random() < 0.5) this.game.voice.say(s, 'reload', 1, { cooldown: 15 });
        else if (s.isHuman && Math.random() < 0.3) this.game.voice.say(s, 'reload', 1, { cooldown: 12 });
        break;
      case 'shell': this.audio.play('shellInsert', o); break;
      case 'pump': setTimeout(() => this.audio.play('pump', o), 180); break;
      case 'dry': this.audio.play('dryFire', o); break;
      case 'fire':
        if (k === 'sniper') setTimeout(() => this.audio.play('boltCycle', o), 150);
        break;
    }
  }

  // ------------------------------------------------------------- co-op --
  async coopHost(url, name, status) {
    status('Connecting to relay…');
    const link = new NetLink(url);
    try {
      await link.connect();
      await link.host(name);
    } catch (e) { link.close(); status(e.message); return; }
    this.settings.relay = url; this.settings.netName = name; this.saveSettings();
    this.net = new CoopHost(this, link, name);
    this.menu.coopLobby(this.net);
  }
  async coopJoin(url, code, name, status) {
    if (!code) { status('Enter the room code shown on the host\'s screen.'); return; }
    status('Connecting to relay…');
    const link = new NetLink(url);
    try {
      await link.connect();
      await link.join(code, name);
    } catch (e) { link.close(); status(e.message); return; }
    this.settings.relay = url; this.settings.netName = name; this.saveSettings();
    this.net = new CoopClient(this, link, name);
    this.menu.coopWaiting(this.net);
  }
  coopStart(chapter) {
    if (!this.net?.host) return;
    this.startCampaign(chapter);
  }
  leaveNet() {
    const n = this.net;
    if (!n) return;
    this.net = null;
    n.close();
    if (this.game) this.game.net = null;
  }
  netLost(msg) {
    if (!this.net) return;
    const wasClient = this.net.client;
    this.leaveNet();
    if (wasClient || this.state !== 'playing') {
      this.quitToMenu();
      this.menu.notice('Co-op session ended', msg);
    } else this.game.hud?.toast(msg + ' Continuing offline with bots.', 5);
  }
  async clientLoad(m) {
    const g = this.game;
    this.menu.clear();
    g.difficulty = DIFFICULTY[m.diff] || g.difficulty;
    g.createSurvivors(m.char);
    this.campaignTime = this.campaignTime || 0;
    this.endTriggered = false;
    await this.loadChapter(m.ch, false, m);
  }
  clientEnd(d) {
    const g = this.game;
    for (const [id, st, dead] of d.stats || []) {
      const s = g.survivors.find((x) => x.char.id === id);
      if (s) { s.stats = st; s.dead = !!dead; }
    }
    this.campaignTime = d.ctime || 0;
    const ch = this.chapters[this.chapterIdx];
    const show = () => {
      g.state = 'menu';
      this.state = 'stats';
      g.input.exitLock();
      g.hud.show(false);
    };
    if (d.type === 'complete') {
      this.audio.play('chapterComplete', { vol: 0.8 });
      this.fade(0, 1, 1.5);
      setTimeout(() => { show(); this.menu.chapterComplete(ch.title, g.survivors, d.time, null); this.fade(1, 0, 0.6); }, 1800);
    } else if (d.type === 'failed') {
      this.fade(0, 0.7, 2);
      setTimeout(() => { show(); this.menu.failed(null, () => { this.fade(1, 0, 0.1); this.quitToMenu(); }); }, 2500);
    } else if (d.type === 'victory') {
      this.state = 'victory';
      g.hooks.cutscene = null;
      this.cinematic(false);
      show();
      this.audio.music?.setState('rescue');
      this.menu.victory(g.survivors, this.campaignTime, () => this.quitToMenu());
    }
  }

  installGameEvents(g) {
    const v = () => g.voice;
    const S = this;
    g.onIncap = (s) => {};
    g.onRevive = (by, t) => { v().say(t, 'thanks', 1, { cooldown: 8 }); };
    g.onHeal = (by, t) => { if (by !== t) v().say(t, 'healed', 1); };
    g.onGive = (by, t) => { v().say(by, 'givePills', 1); };
    g.onPinned = (s, sp) => {
      g.director.onPinned(s);
      v().say(s, sp.kind === 'hunter' ? 'pinnedHunter' : 'pinnedSmoker', 3);
      if (s.isHuman) S.audio.music?.stinger?.('pinned');
    };
    g.onSpecialSpawn = (sp) => {};
    g.onSpecialNear = (sp) => {
      // a teammate who can see it calls it out
      for (const s of g.survivors) {
        if (s.dead || s.incapped) continue;
        if (s.pos.distanceTo(sp.pos) < 30 && g.level.col.lineOfSight(s.pos.x, s.pos.y + 1.6, s.pos.z, sp.pos.x, sp.pos.y + 1.2, sp.pos.z)) {
          v().say(s, sp.kind + 'Spotted', 2, { cooldown: 12 });
          break;
        }
      }
    };
    g.onTankSpawn = (t) => {
      const s = pick(g.survivors.filter((x) => !x.dead));
      setTimeout(() => v().say(s, 'tankSpotted', 3), 1500);
    };
    g.onTankKilled = () => {
      const s = pick(g.survivors.filter((x) => !x.dead && !x.incapped));
      if (s) setTimeout(() => v().say(s, 'killedTank', 2), 1200);
    };
    g.onWitchStartled = (w, t) => {
      const s = pick(g.survivors.filter((x) => !x.dead && x !== t)) || t;
      v().say(s, 'witchStartled', 3);
      S.audio.music?.stinger?.('witch');
    };
    g.onMob = () => {
      const s = pick(g.survivors.filter((x) => !x.dead && !x.incapped));
      if (s) setTimeout(() => v().say(s, 'hordeIncoming', 2, { cooldown: 20 }), 800);
    };
    g.onBiled = (s) => { v().say(s, 'biled', 3); };
    g.onCarAlarm = () => { const s = pick(g.survivors.filter((x) => !x.dead)); setTimeout(() => v().say(s, 'carAlarm', 2), 600); };
    g.onSpecialKilled = (sp, h) => {
      const a = h?.attacker;
      if (a && a.stats && a.say !== false && sp.kind !== 'tank' && Math.random() < 0.5) v().say(a, 'killedSpecial', 1, { cooldown: 10 });
      if (a === g.player) g.hud.hit(true, h?.zone === 'head');
    };
    g.onPickup = (s, it) => {};
    g.onInfectedKilled = (c, h) => {
      if (h.attacker === g.player) g.hud.hit(true, h.zone === 'head');
    };
    g.onPlayerHit = () => g.hud.hit(false);
    g.onFriendlyFire = () => {};
    g.onSurvivorDeath = (s) => {};
    g.onLeftSafeRoom = () => { S.chapters[S.chapterIdx]?.onLeaveSafe?.(g, S); };
    g.onWitchKilled = () => {};
  }
}
