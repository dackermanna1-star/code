// Game shell: menus, chapter loading, main loop, cameras, music direction, chapter flow.
import * as THREE from 'three';
import { PS1Renderer } from '../engine/renderer.js';
import { Settings } from '../engine/settings.js';
import { Input } from '../engine/input.js';
import { G } from '../engine/ps1material.js';
import { LevelBuilder } from '../engine/levelbuilder.js';
import { World } from './world.js';
import { PlayerController } from './player.js';
import { BotController } from './bot.js';
import { HUD } from './hud.js';
import { Menus } from './menus.js';
import { CHAPTERS, TEST_CHAPTER } from '../levels/index.js';
import { AudioEngine } from '../engine/audio.js';
import { Voice } from './tts.js';
import { installDebug } from './debug.js';

export class Game {
  constructor({ canvas, hud, ui }) {
    this.canvas = canvas; this.ui = ui;
    this.settings = new Settings();
    if (this.settings.get('voiceTTS') === undefined) this.settings.set('voiceTTS', false);
    this.renderer = new PS1Renderer(canvas, this.settings);
    this.renderer.applySettings();
    this.input = new Input(canvas);
    this.camera = new THREE.PerspectiveCamera(this.settings.get('fov'), window.innerWidth / window.innerHeight, 0.05, 500);
    this.renderer.onResize = (a) => { this.camera.aspect = a; this.camera.updateProjectionMatrix(); if (this.world) this.world.effects.particles.setScreenHeight(this.renderer.lowH); };
    this.hud = new HUD(hud, this);
    this.menus = new Menus(ui, this);
    this.audio = new AudioEngine(this.settings);
    this.voice = new Voice(this.settings);
    this.chapters = CHAPTERS;
    this.state = 'menu';
    this.clock = new THREE.Clock();
    this.world = null; this.player = null;
    this.chapterIndex = 0;
    this.carry = null;
    this.testMode = false;
    installDebug(this);
    this.input.onLockChange = (locked) => { if (!locked && this.state === 'playing' && !this.testMode) this.pause(); };
    const unlockAudio = () => { this.initAudio(); };
    window.addEventListener('pointerdown', unlockAudio, { once: false });
    window.addEventListener('keydown', unlockAudio, { once: false });
    canvas.addEventListener('click', () => { if (this.state === 'playing' && !this.input.locked && !this.testMode) this.input.requestLock(); });
    window.addEventListener('keydown', (e) => {
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.state === 'playing') this.pause();
    });
  }

  async initAudio() {
    if (this.audioStarted) return;
    this.audioStarted = true;
    try { await this.audio.init(); this.audioReady = true; if (this.state === 'menu') this.playMenuMusic(); } catch (e) { console.warn('audio init failed', e); }
  }
  uiSound(n) { if (this.audio && this.audio.ready) this.audio.play(n, { category: 'ui', volume: 0.5 }); }
  playMenuMusic() { if (this.audio.ready && this.state === 'menu') { this.audio.stopAllMusic(0.5); this.audio.playMusic('menu', { volume: 0.8, fade: 1 }); } }

  applySettings() {
    this.renderer.applySettings();
    if (this.world) this.world.effects.particles.setScreenHeight(this.renderer.lowH);
  }

  start() {
    const q = new URLSearchParams(location.search);
    this.loop();
    window.__ready = true;
    if (q.has('chapter') || q.has('test')) {
      // automated testing / quick start: ?chapter=0..3 or ?test=arena, &diff=normal, &auto=1 (no pointer lock)
      this.testMode = q.has('auto');
      if (q.get('diff')) this.settings.values.difficulty = q.get('diff');
      if (q.has('res')) this.settings.values.resolution = +q.get('res');
      this.applySettings();
      const idx = q.has('test') ? -1 : +q.get('chapter');
      if (idx < 0) this.chapters = [TEST_CHAPTER, ...this.chapters];
      this.startCampaign(Math.max(0, idx), null, { skipClick: this.testMode });
      return;
    }
    this.menus.title();
  }

  // ------------------------------------------------------------------ chapter flow
  async startCampaign(index, carry = null, opts = {}) {
    this.chapterIndex = index;
    this.carry = carry;
    this.state = 'loading';
    if (this.audio.ready) this.audio.stopAllMusic(1);
    if (this.world) { this.world.dispose(); this.world = null; this.player = null; }
    const chapter = this.chapters[index];
    const ld = this.menus.loading(chapter);
    const mod = await chapter.load();
    const level = mod.default;
    ld.set(0.02, 'Building ' + chapter.name);
    await new Promise((r) => setTimeout(r, 30));
    const L = new LevelBuilder(level.builderOpts || {});
    try {
      level.build(L);
      await L.build((p, m) => ld.set(0.05 + p * 0.75, m));
    } catch (e) {
      console.error('Level build failed', e);
      ld.set(0, 'ERROR: ' + e.message);
      this.loadError = e;
      return;
    }
    ld.set(0.85, 'Generating navigation');
    await new Promise((r) => setTimeout(r, 10));
    const world = new World(this, level, L, { difficulty: this.settings.get('difficulty'), chapter });
    ld.set(0.95, 'Populating');
    await new Promise((r) => setTimeout(r, 10));
    world.init(carry);
    this.world = world;
    this.player = new PlayerController(this, world.survivors[0]);
    world.player = world.survivors[0];
    for (let i = 1; i < world.survivors.length; i++) new BotController(world, world.survivors[i]);
    this.hookWorldEvents(world);
    world.effects.particles.setScreenHeight(this.renderer.lowH);
    this.musicState = { tank: null, witch: null, incap: null, horde: null, ambient: null, saferoom: null };
    ld.set(1, 'Ready');
    this.chapterStart = { index, carry };
    if (opts.skipClick || this.testMode) { this.beginPlay(); const q = new URLSearchParams(location.search); if (q.has('autopilot')) this.debug.autopilot(true); if (q.has('god')) this.debug.god(true); }
    else this.menus.clickToBegin(() => { this.initAudio(); this.input.requestLock(); this.beginPlay(); });
  }

  beginPlay() {
    this.menus.clear();
    this.state = 'playing';
    this.fadeIn = 1.5;
    this.clock.getDelta();
    const lvl = this.world.level;
    if (lvl.intro) for (const line of lvl.intro) this.world.after(line.delay || 0, () => { const s = this.world.survivors[line.who] || this.world.survivors[0]; this.world.subtitles.push({ who: s.name, text: line.text, t: line.time || 3.5 }); if (this.voice) this.voice.say(s, line.text); });
    if (this.audio.ready) {
      if (lvl.music) this.musicState.ambient = this.audio.playMusic(lvl.music, { volume: 0.5, fade: 3 });
      this.musicState.saferoom = this.audio.playMusic('saferoom', { volume: 0.55, fade: 2 });
    }
    if (lvl.onBegin) lvl.onBegin(this.world);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.world.paused = true;
    this.input.exitLock();
    if (this.audio.ready) this.audio.pauseAll(true);
    this.menus.pause();
  }
  resume() {
    this.menus.clear();
    this.state = 'playing';
    this.world.paused = false;
    if (this.audio.ready) this.audio.pauseAll(false);
    this.clock.getDelta();
    if (!this.testMode) this.input.requestLock();
  }
  restartChapter() {
    if (this.audio.ready) this.audio.pauseAll(false);
    this.startCampaign(this.chapterStart.index, this.chapterStart.carry);
  }
  quitToMenu() {
    if (this.audio.ready) { this.audio.pauseAll(false); this.audio.stopAllMusic(0.5); }
    if (this.world) { this.world.dispose(); this.world = null; this.player = null; }
    this.state = 'menu';
    this.input.exitLock();
    this.menus.title();
  }

  chapterComplete() {
    const w = this.world;
    if (w.ended) return;
    w.ended = 'complete';
    this.state = 'ending';
    this.endT = 2.5;
    if (this.audio.ready) { this.audio.stopAllMusic(1.5); this.audio.playMusic('chapter_end', { volume: 0.9 }); }
  }
  showChapterStats() {
    const w = this.world;
    this.input.exitLock();
    this.state = 'stats';
    const next = this.chapterIndex + 1;
    const isFinale = !!w.level.finale;
    if (isFinale) {
      this.menus.credits(w, () => this.menus.stats('CAMPAIGN COMPLETE', w, [['MAIN MENU', () => this.quitToMenu()]]));
      return;
    }
    const carry = w.carryOverState();
    this.menus.stats(`CHAPTER ${w.level.chapter || this.chapterIndex + 1} COMPLETE — ${w.level.name.toUpperCase()}`, w, [
      ['CONTINUE ▶', () => this.startCampaign(next, carry)],
      ['MAIN MENU', () => this.quitToMenu()],
    ]);
  }
  wiped() {
    this.state = 'ending';
    this.endT = 3;
    this.wipeEnd = true;
    if (this.audio.ready) { this.audio.stopAllMusic(0.5); this.audio.playMusic('death', { volume: 1 }); }
  }

  // ------------------------------------------------------------------ world events -> HUD / music
  hookWorldEvents(w) {
    const A = () => this.audio.ready ? this.audio : null;
    w.events.on('hurt', (s, amt, info) => {
      if (s === w.player) {
        this.damageFlash = Math.min(1, (this.damageFlash || 0) + amt / 25 + 0.2);
        if (info.dir) this.hud.addDamage(info.dir, s);
        if (amt > 4 && Math.random() < 0.5) w.sound(s.def.voice === 'f' ? 'survivor_pain_f' : 'survivor_pain_m', null, { volume: 0.6, category: 'voice' });
      }
    });
    w.events.on('wipe', () => this.wiped());
    w.events.on('mob', (size) => { const a = A(); if (a && !this.musicState.tank) a.playMusic('horde_incoming', { volume: 0.9 }); if (Math.random() < 0.6) w.speak(w.survivors[(Math.random() * 4) | 0], 'horde'); });
    w.events.on('specialSpawn', (z) => {
      const a = A();
      const d = z.position.distanceTo(w.player.body.pos);
      if (z.type === 'tank' || z.type === 'witch') return;
      if (a && d < 40) a.playMusic('stinger_' + z.type, { volume: 0.7 });
      w.after(1 + Math.random() * 2, () => { const sp = w.survivors.find((s) => s.isBot && s.state === 'alive'); if (sp && z.alive) w.speak(sp, 'spot_' + z.type, 0.6); });
    });
    w.events.on('tankAware', () => {
      const a = A();
      if (a && !this.musicState.tank) { a.stopMusic('horde_loop', 1); this.musicState.tank = a.playMusic('tank', { volume: 1, fade: 0.5 }); }
      w.speak(w.survivors[(Math.random() * 4) | 0], 'spot_tank');
    });
    w.events.on('tankDead', () => { const a = A(); if (a) a.stopMusic('tank', 3); this.musicState.tank = null; w.after(1.5, () => w.speak(w.survivors.find((s) => s.state === 'alive'), 'tank_dead')); });
    w.events.on('witchStartled', () => { const a = A(); if (a) { a.stopMusic('witch_near', 0.3); a.playMusic('witch_rage', { volume: 1 }); } });
    w.events.on('incap', (s) => { if (s === w.player) { const a = A(); if (a) this.musicState.incap = a.playMusic('incap', { volume: 0.8, fade: 1 }); } });
    w.events.on('revived', (s) => { if (s === w.player) { const a = A(); if (a) a.stopMusic('incap', 1.5); } });
    w.events.on('death', (s) => { if (s === w.player) { const a = A(); if (a) { a.stopMusic('incap', 0.5); a.playMusic('death', { volume: 1 }); } } });
    w.events.on('panicStart', () => { const a = A(); if (a && !this.musicState.tank) a.playMusic('horde_loop', { volume: 0.8, fade: 1 }); });
    w.events.on('panicEnd', () => { const a = A(); if (a) a.stopMusic('horde_loop', 3); });
    w.events.on('directorStart', () => { const a = A(); if (a) a.stopMusic('saferoom', 4); });
    w.events.on('chapterComplete', () => this.chapterComplete());
    w.events.on('biled', (s) => { if (s === w.player) { const a = A(); if (a) a.playMusic('danger', { volume: 0.7 }); } });
  }

  updateMusic(dt) {
    const w = this.world, a = this.audio;
    if (!a.ready || !w || !w.player) return;
    // witch proximity music
    let wd = Infinity;
    for (const z of w.infected) if (z.type === 'witch' && z.alive && !z.startled) wd = Math.min(wd, z.position.distanceTo(w.player.body.pos));
    const vol = wd < 46 ? Math.min(1, (46 - wd) / 36) : 0;
    if (vol > 0 && !this.musicState.witch) this.musicState.witch = a.playMusic('witch_near', { volume: vol, fade: 1 });
    if (this.musicState.witch) { a.setMusicLayer('witch_near', vol, 0.5); if (vol <= 0) { a.stopMusic('witch_near', 1); this.musicState.witch = null; } }
    // black & white heartbeat
    const p = w.player;
    this.heartT = (this.heartT || 0) - dt;
    if (p.blackAndWhite && this.heartT <= 0) { this.heartT = 0.85; a.play('heartbeat', { category: 'sfx', volume: 0.9 }); }
    a.setMuffled(p.state === 'incap' ? 0.5 : p.bileScreen > 0 ? 0.3 : 0);
  }

  // ------------------------------------------------------------------ main loop
  loop() {
    requestAnimationFrame(() => this.loop());
    let dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.fixedDt) dt = this.fixedDt;
    G.uTime.value += dt;
    const R = this.renderer, PU = R.postUniforms;
    PU.uTime.value = G.uTime.value;
    const w = this.world;
    if (w && (this.state === 'playing' || this.state === 'ending' || this.state === 'paused')) {
      const steps = this.timeScale ? Math.max(1, Math.round(this.timeScale)) : 1;
      for (let i = 0; i < steps; i++) if (this.state !== 'paused') w.update(dt);
      const p = this.player;
      p.updateCamera(this.camera, dt);
      w.camPos = this.camera.position;
      p.updateViewmodel(dt, this.camera);
      if (this.audio.ready) {
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
        this.audio.setListener(this.camera.position, fwd, up);
        this.audio.update(dt);
        this.updateMusic(dt);
      }
      this.checkSaferoom(dt);
      // post effects
      const ps = p.s;
      this.damageFlash = Math.max(0, (this.damageFlash || 0) - dt * 1.8);
      PU.uDamage.value = this.damageFlash + (ps.state === 'alive' && ps.total < 25 ? 0.15 + Math.sin(G.uTime.value * 4) * 0.05 : 0);
      PU.uBile.value = Math.min(1, ps.bileScreen / 4) * (ps.state === 'dead' ? 0 : 1);
      PU.uGray.value = ps.blackAndWhite || ps.state === 'dead' ? 0.85 : ps.state === 'incap' ? 0.4 : 0;
      PU.uAcid.value = ps.inAcid > 0 ? 0.8 : 0; ps.inAcid = Math.max(0, (ps.inAcid || 0) - dt);
      PU.uFire.value = ps.onFire > 0 ? 0.9 : 0; ps.onFire = Math.max(0, (ps.onFire || 0) - dt);
      PU.uAdrenaline.value = ps.adrenaline > 0 ? 1 : 0;
      if (this.fadeIn > 0) this.fadeIn -= dt;
      let fade = Math.max(0, this.fadeIn || 0);
      if (this.state === 'ending') {
        this.endT -= dt;
        fade = Math.max(fade, 1 - Math.max(0, this.endT - 0.5) / 2);
        if (this.endT <= 0) { if (this.wipeEnd) { this.wipeEnd = false; this.showWipe(); } else this.showChapterStats(); }
      }
      PU.uFade.value = Math.min(1, fade);
      R.render(w.scene, this.camera, p.viewScene, p.viewCam, w.glowScene);
      this.hud.draw(dt);
    } else {
      // menu backdrop: just clear
      R.gl.setRenderTarget(null); R.gl.setClearColor(0x000000, 1); R.gl.clear();
      this.hud.ctx.clearRect(0, 0, this.hud.W, this.hud.H);
    }
    this.input.endFrame();
  }

  showWipe() {
    this.input.exitLock();
    this.state = 'stats';
    this.menus.stats('YOUR TEAM WAS OVERWHELMED', this.world, [['TRY AGAIN', () => this.restartChapter()], ['MAIN MENU', () => this.quitToMenu()]]);
  }

  // saferoom logic: leaving the start room starts the director; closing the end door with everyone inside ends the chapter
  checkSaferoom(dt) {
    const w = this.world;
    if (!w || w.ended) return;
    const zones = w.builder.zones;
    const startZ = zones.find((z) => z.saferoom === 'start'), endZ = zones.find((z) => z.saferoom === 'end');
    const v = new THREE.Vector3();
    for (const s of w.survivors) {
      v.set(s.body.pos.x, s.body.pos.y + 0.5, s.body.pos.z);
      s.inSaferoom = !!((startZ && startZ.box.containsPoint(v)) || (endZ && endZ.box.containsPoint(v)));
      s.inEndRoom = !!(endZ && endZ.box.containsPoint(v));
    }
    if (startZ && !w.director.enabled) {
      const left = w.survivors.some((s) => s.state === 'alive' && !startZ.box.containsPoint(v.set(s.body.pos.x, s.body.pos.y + 0.5, s.body.pos.z)));
      if (left) w.director.start();
    } else if (!startZ && !w.director.enabled && w.level.director && w.level.director.startEnabled !== false) w.director.start();
    if (endZ && !w.level.finale) {
      const door = w.doors.find((d) => d.name === 'endDoor');
      const alive = w.survivors.filter((s) => s.state !== 'dead');
      // every standing survivor must be inside; incapped / pinned ones left outside are abandoned
      const standing = alive.filter((s) => s.state === 'alive' && !s.pinnedBy);
      const allIn = alive.some((s) => s.inEndRoom) && standing.every((s) => s.inEndRoom);
      const humanIn = w.player.state === 'dead' || w.player.inEndRoom;
      if (door && door.closed && allIn && humanIn) {
        const infectedInside = w.infected.some((z) => z.alive && endZ.box.containsPoint(v.set(z.position.x, z.position.y + 0.5, z.position.z)));
        if (!infectedInside) {
          for (const s of alive) if (!s.inEndRoom) s.leftBehind = true;
          w.saferoomLocked = true; this.chapterComplete();
        }
      }
      if (w.player.inEndRoom && this.audio.ready && !this.endRoomMusic) { this.endRoomMusic = true; this.audio.playMusic('saferoom', { volume: 0.5, fade: 2 }); }
    }
  }
}
