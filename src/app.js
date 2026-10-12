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
import { writeSlot, readSlot } from './game/savegame.js';

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
      this.input.wantLock = true; // like startNewGame: the first click grabs the mouse
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
    // Held keys auto-repeat: only automap panning/zooming wants that, not
    // toggles like the automap, pause, quick save/load or the menu.
    if (e && e.repeat) {
      if (this.game.state === 'level' && this.automap.active) this.automap.responder(code, e);
      return;
    }
    if (code === 'Escape') {
      this.menu.open();
      return;
    }
    // Original function-key shortcuts.
    const fkeys = { F1: 'help', F2: 'save', F3: 'load', F4: 'options' };
    if (fkeys[code]) { this.menu.openTo(fkeys[code]); return; }
    if (code === 'Pause' && this.game.state === 'level') {
      this.game.paused = !this.game.paused;
      return;
    }
    const st = this.game.state;
    if (st !== 'level' && this.input.bindsFor('quickLoad').includes(code)) { this.quickLoad(); return; }
    if (st === 'title') { this.title.responder(code, e); return; }
    if (st === 'intermission') { this.intermission.responder(code, e); return; }
    if (st === 'finale') { this.finale.responder(code, e); return; }
    if (st === 'level') {
      if (e && e.key && e.key.length === 1) this.cheats.key(e.key);
      if (this.input.bindsFor('automap').includes(code)) { this.automap.toggle(); return; }
      if (this.automap.active && this.automap.responder(code, e)) return;
      if (this.input.bindsFor('quickSave').includes(code)) { this.quickSave(); return; }
      if (this.input.bindsFor('quickLoad').includes(code)) { this.quickLoad(); return; }
      if (!this.input.locked) this.input.requestLock();
    }
  }

  saveToSlot(slot, description) {
    const data = this.game.save(description);
    if (!data) return false;
    const ok = writeSlot(slot, data);
    this.hud.message(ok ? 'game saved.' : 'could not save (storage full?)');
    return ok;
  }

  loadFromSlot(slot) {
    const data = readSlot(slot);
    if (!data) { this.hud.message('no saved game in that slot.'); return false; }
    if (data.gamemode && data.gamemode !== this.game.gamemode && !this.stack.mapLumps(data.mapName)) {
      this.hud.message('that save needs a different wad.');
      return false;
    }
    try {
      this.menu.close();
      this.game.restore(data);
      this.hud.message('game loaded.');
      this.input.wantLock = true;
      this.input.requestLock();
      return true;
    } catch (e) {
      console.error(e);
      this.hud.message('failed to load the saved game.');
      return false;
    }
  }

  quickSave() {
    if (this.game.state !== 'level' || !this.game.player || this.game.player.playerstate !== 'live') {
      this.hud.message("you can't save if you aren't playing!");
      return;
    }
    this.saveToSlot('quick', `quicksave ${this.game.mapName()}`);
  }

  quickLoad() { this.loadFromSlot('quick'); }

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
    const playing = g.state === 'level' && !menuOpen && !g.paused;

    // Per-frame look for responsiveness.
    if (playing && g.player && g.player.mo && g.player.playerstate === 'live') {
      const look = this.input.consumeLook(dt);
      const p = g.player;
      const sens = (1 - 0.35 * p.mods.ads) * this.aimAssist(p, look, dt);
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
    // The melt advances per 35 Hz tic (like wipe_ScreenWipe), not per frame.
    if (this.renderer.wipe && tics) this.renderer.tickWipe(tics);

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

  // Gamepad aim assist: slows the stick over a target and gently pulls
  // toward it. Mouse aim is never touched.
  aimAssist(p, look, dt) {
    const strength = this.settings.get('aimAssist') || 0;
    const pad = this.input.padState;
    if (!strength || !pad || (Math.abs(pad.rx) < 0.05 && Math.abs(pad.ry) < 0.05) || !this.game.world) return 1;
    const w = this.game.world;
    const mo = p.mo;
    let best = null, bestErr = 0.12;
    for (const m of w.mobjs) {
      if (!(m.flags & 0x4) || m.health <= 0 || m === mo || !(m.flags & 0x400000)) continue;
      const dx = m.x - mo.x, dy = m.y - mo.y;
      const d = Math.hypot(dx, dy);
      if (d > 1500 || d < 1) continue;
      const err = Math.abs(((Math.atan2(dy, dx) - mo.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (err < bestErr && w.checkSight(mo, m)) { bestErr = err; best = { m, d }; }
    }
    if (!best) return 1;
    const target = Math.atan2(best.m.y - mo.y, best.m.x - mo.x);
    const diff = ((target - mo.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    look.yaw += diff * Math.min(1, dt * 6) * strength;
    return 1 - 0.45 * strength;
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
    const reduce = this.settings.get('reduceFlashes');
    if (cnt) return 1 + Math.min(reduce ? 2 : 7, (cnt + 7) >> 3);
    if (p.bonuscount) return 9 + Math.min(reduce ? 0 : 3, (p.bonuscount + 7) >> 3);
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
      // The listener follows the player even while the full-screen map is up.
      const cam = this.view.camera(w, p, frac, rect, dt);
      this.audio.setListener(cam, p);
      if (this.automap.active && this.automap.fullscreen) {
        this.automap.draw(r, rect, frac);
      } else {
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
      if (g.paused && !this.menu.active) r.drawPatch('M_PAUSE', 92, 4);
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
