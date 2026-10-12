// Application shell: owns the subsystems, runs the fixed 35 Hz simulation
// with interpolated rendering, and routes input between game and UI.

import { Game } from './game/game.js';
import { ViewRenderer } from './render/view.js';
import { TICRATE, PW, SKILL, normAngle } from './game/defs.js';
import { Hud } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { Intermission } from './ui/intermission.js';
import { Finale } from './ui/finale.js';
import { Automap } from './ui/automap.js';
import { TitleScreen } from './ui/title.js';
import { Cheats } from './ui/cheats.js';
import { AudioSystem } from './audio/audio.js';
import { createEffects } from './fx/effects.js';
import { storeIwad, clearStoredIwad } from './wadstore.js';

const TIC_SEC = 1 / TICRATE;

export class App {
  constructor(opts) {
    Object.assign(this, opts);
    this.view = new ViewRenderer(this.renderer, this.res, this.settings);
    this.acc = 0;
    this.last = 0;
    this.fps = 0;
    this.frames = 0;
    this.fpsTime = 0;
    this.fpsEl = document.getElementById('fps');
  }

  async init() {
    this.audio = new AudioSystem(this.stack, this.settings);
    this.game = new Game({ stack: this.stack, res: this.res, settings: this.settings, gamemode: this.gamemode, audio: this.audio });
    this.game.fxFactory = (w) => createEffects(w, this);
    this.hud = new Hud(this);
    this.menu = new Menu(this);
    this.intermission = new Intermission(this);
    this.finale = new Finale(this);
    this.automap = new Automap(this);
    this.title = new TitleScreen(this);
    this.cheats = new Cheats(this);

    const g = this.game;
    g.on('levelStart', (w) => {
      this.renderer.setLevel(w.level);
      this.renderer.setSky(g.skyFor(g.episode, g.map));
      w.hooks.sideChanged = (side) => this.renderer.world && this.renderer.world.updateSide(side);
      w.hooks.sectorChanged = (sec) => this.renderer.world && this.renderer.world.updateSectorFlats(sec);
      this.automap.reset(w);
      this.hud.reset();
      this.audio.setWorld(w);
      this.acc = 0;
      this.wipe();
    });
    g.on('music', (name) => this.audio.playMusic(name));
    g.on('intermission', (stats) => {
      this.wipe();
      this.audio.setWorld(null);
      this.intermission.start(stats);
    });
    g.on('finale', (f) => { this.wipe(); this.finale.start(f); });
    g.on('title', () => { this.wipe(); this.title.start(); });
    this.input.onPress = (code, e) => this.onPress(code, e);
    this.input.onLockChange = (locked) => {
      if (!locked && this.game.state === 'level' && !this.menu.active && !this.input.captureNext) this.menu.open();
    };
    window.addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('visibilitychange', () => { this.last = 0; });
    await this.audio.init().catch((e) => console.warn('audio init failed', e));
  }

  start() {
    const p = this.params;
    if (p.has('map')) {
      const m = p.get('map').toUpperCase();
      const skill = p.has('skill') ? Number(p.get('skill')) - 1 : SKILL.HARD;
      let ep = 1, map = 1;
      const em = /^E(\d)M(\d)$/.exec(m);
      const mm = /^MAP(\d\d)$/.exec(m);
      if (em) { ep = +em[1]; map = +em[2]; } else if (mm) map = +mm[1];
      this.game.newGame(ep, skill, map);
      if (p.has('god')) this.game.player.cheats |= 2;
    } else {
      this.title.start();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  wipe() {
    if (this.renderer.fbo) this.renderer.startWipe();
  }

  // --- Input routing ------------------------------------------------------

  onPress(code, e) {
    if (this.input.captureNext) return;
    this.audio.resume();
    if (this.menu.active) {
      this.menu.responder(code, e);
      return;
    }
    if (code === 'Escape') {
      this.menu.open();
      return;
    }
    const st = this.game.state;
    if (st === 'title') { this.title.responder(code, e); return; }
    if (st === 'intermission') { this.intermission.responder(code, e); return; }
    if (st === 'finale') { this.finale.responder(code, e); return; }
    if (st === 'level') {
      if (e && e.key && e.key.length === 1) this.cheats.key(e.key);
      if (this.input.bindsFor('automap').includes(code)) { this.automap.toggle(); return; }
      if (this.automap.active && this.automap.responder(code, e)) return;
      if (this.input.bindsFor('quickSave').includes(code)) { this.hud.message('quick save is not supported'); return; }
      if (!this.input.locked) this.input.requestLock();
    }
  }

  startNewGame(episode, skill) {
    this.menu.close();
    this.game.newGame(episode, skill);
    this.input.wantLock = true;
    this.input.requestLock();
  }

  async loadIwadFile(file) {
    const buf = await file.arrayBuffer();
    await storeIwad(file.name, buf);
    location.reload();
  }

  async resetIwad() {
    await clearStoredIwad();
    location.reload();
  }

  // --- Main loop ----------------------------------------------------------

  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    let dt = this.last ? (t - this.last) / 1000 : 0;
    this.last = t;
    if (dt > 0.25) dt = 0.25;
    this.input.pollPad();
    const g = this.game;
    const menuOpen = this.menu.active;
    const playing = g.state === 'level' && !menuOpen;

    // Per-frame look for responsiveness.
    if (playing && g.player && g.player.mo && g.player.playerstate === 'live') {
      const look = this.input.consumeLook(dt);
      const p = g.player;
      const sens = 1 - 0.35 * p.mods.ads;
      p.mo.angle = normAngle(p.mo.angle + look.yaw * sens);
      p.pitch = Math.max(-1.4, Math.min(1.4, p.pitch + look.pitch * sens));
      this.view.updateSway(p, look, dt);
      if (this.automap.active) this.automap.follow();
    } else {
      this.input.consumeLook(dt);
    }

    // Fixed-rate tics
    this.acc += dt;
    let tics = 0;
    while (this.acc >= TIC_SEC && tics < 8) {
      this.acc -= TIC_SEC;
      tics++;
      this.tic(playing);
    }
    if (tics === 8) this.acc = 0;
    if (this.renderer.wipe) this.renderer.tickWipe(Math.max(1, tics ? tics : 0));

    this.render(dt, playing);

    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTime);
      this.frames = 0;
      this.fpsTime = 0;
      if (this.fpsEl) this.fpsEl.textContent = this.settings.get('showFps') ? `${this.fps} fps` : '';
    }
  }

  tic(playing) {
    const g = this.game;
    this.menu.tick();
    switch (g.state) {
      case 'level':
        if (playing) {
          const cmd = this.input.buildCmd(g.player);
          g.tick(cmd);
          this.hud.tick();
          this.automap.tick();
        }
        break;
      case 'intermission': this.intermission.tick(); break;
      case 'finale': this.finale.tick(); break;
      case 'title': this.title.tick(); break;
      default: break;
    }
    this.input.endTic();
    this.audio.update();
  }

  paletteRow(p) {
    if (!p) return 0;
    let cnt = p.damagecount;
    if (p.powers[PW.STRENGTH]) {
      const bzc = 12 - (p.powers[PW.STRENGTH] >> 6);
      if (bzc > cnt) cnt = bzc;
    }
    if (cnt) return 1 + Math.min(7, (cnt + 7) >> 3);
    if (p.bonuscount) return 9 + Math.min(3, (p.bonuscount + 7) >> 3);
    if (p.powers[PW.IRONFEET] > 4 * 32 || (p.powers[PW.IRONFEET] & 8)) return 13;
    return 0;
  }

  render(dt, playing) {
    const r = this.renderer;
    const g = this.game;
    r.beginFrame();
    let palette = 0;
    if (g.state === 'level' && g.world && g.player && g.player.mo) {
      const w = g.world;
      const p = g.player;
      const frac = playing ? Math.min(1, this.acc / TIC_SEC) : 1;
      const hudMode = this.settings.get('hud');
      const rect = this.view.viewRect(hudMode);
      if (this.automap.active && this.automap.fullscreen) {
        this.automap.draw(r, rect, frac);
      } else {
        const cam = this.view.camera(w, p, frac, rect, dt);
        this.audio.setListener(cam, p);
        if (w.fx) w.fx.addLights(r, frac, cam);
        r.renderWorld(cam, {
          sprites: (rr) => {
            this.view.addThings(w, cam, frac);
            if (w.fx) w.fx.render(rr, cam, frac, dt);
          },
          decals: (rr, geo) => { if (w.fx) w.fx.renderDecals(rr, geo, cam); },
        });
        this.view.drawWeapon(w, p, frac, rect, hudMode);
        r.flushUI();
        this.view.drawCrosshair(p, rect);
        this.view.drawDamageIndicators(p, rect);
        if (this.automap.active) this.automap.draw(r, rect, frac);
      }
      this.hud.draw(r, rect, frac);
      palette = this.paletteRow(p);
    } else if (g.state === 'intermission') {
      this.intermission.draw(r);
    } else if (g.state === 'finale') {
      this.finale.draw(r);
    } else if (g.state === 'title') {
      this.title.draw(r);
    }
    if (this.menu.active) this.menu.draw(r);
    r.endFrame(palette);
  }
}
