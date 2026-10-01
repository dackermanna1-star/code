// Game state machine: title screen, exploration, pause; plus interactions, saving, events,
// ambience and rendering.
import { RES_W, RES_W_WIDE, RES_H, LEVEL_H, CHUNK, PLAYER_R, PLAYER_H } from '../config.js';
import { strHash } from '../core/rng.js';
import { drawText } from '../gfx/font.js';
import { SPAWN } from '../world/gen/yellow.js';
import { SURF } from '../world/chunk.js';
import { noteText } from '../world/notes.js';
import { UI } from '../ui/ui.js';
import { TouchUI } from '../ui/touch.js';
import { Events } from './events.js';
import { loadSave, writeSave, loadSettings, writeSettings } from './save.js';
import { vestibuleTrigger, portalTarget } from '../world/portals.js';

export const DEFAULT_SEED = 0x5eed0001;
const DEFAULT_ENV = { fog: [0.42, 0.38, 0.2], fogNear: 5, fogFar: 34, hum: 0.6, hvac: 0.5, reverb: 'room', tone: 'yellow' };
const USE_LABEL = { save: 'USE TELEPHONE', note: 'READ', locked: 'OPEN', cooler: 'DRINK', vending: 'USE', typewriter: 'USE TYPEWRITER' };

export class Game {
  constructor(o) {
    Object.assign(this, o);
    this.ctx = this.uic.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.state = 'boot';
    this.time = 0;
    this.last = 0;
    this.lastRender = 0;
    this.flicker = new this.Flicker();
    this.env = { ...DEFAULT_ENV, fog: [...DEFAULT_ENV.fog] };
    this.settings = Object.assign({ sens: 1, invertY: false, fov: 56, fps30: false, jitterMode: 1, dither: true, wide: false, bright: 1, volume: 0.8 }, loadSettings() || {});
    this.debug = false;
    this.params = new URLSearchParams(location.search);
    this.ui = new UI(this);
    this.events = new Events(this);
    this.stats = { time: 0, levels: {} };
    this.audio = null;
    this.audioReady = false;
    this.autosaveT = 0;
    this.gatherT = 0;
    this.audioCtx = { emitters: [], lights: [], flicker: this.flicker, occluded: null };
    this.target = null;
    this.titleCamT = 0;
    this.portalArmed = true;
    this.portalReturn = null;
    this.prefetch = null;
    this.mutableVisited = new Map();
    this.mutT = 0;
  }

  // ------------------------------------------------------------------ boot
  start() {
    const p = this.params;
    this.applyScreen();
    if (('ontouchstart' in window || navigator.maxTouchPoints > 0) && !p.has('notouch')) this.touchUI = new TouchUI(this, this.glc.parentElement.parentElement);
    const seed = p.has('seed') ? (Number(p.get('seed')) >>> 0 || strHash(p.get('seed'))) : DEFAULT_SEED;
    this.createWorld(seed);
    window.addEventListener('keydown', (e) => { if (e.code === 'F3') { this.debug = !this.debug; e.preventDefault(); } });
    const gesture = () => this.initAudio();
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('keydown', gesture);
    window.addEventListener('touchstart', gesture, { passive: true });
    this.glc.parentElement.addEventListener('click', () => {
      if (this.state === 'play' && !this.input.locked && !this.ui.active) this.input.lock();
    });
    this.input.onUnlock = () => { if (this.state === 'play' && !this.ui.active && !this.input.isTouch) this.pause(); };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play') { this.pause(); }
      if (document.hidden && this.audio) this.audioCall('suspend');
      else if (!document.hidden && this.audio) this.audioCall('resume');
    });
    window.addEventListener('beforeunload', () => { if (this.state === 'play' || this.state === 'pause') this.saveGame('auto'); });
    if (p.has('x') || p.has('play')) {
      // development: jump straight in
      this.state = 'play';
      if (p.has('x')) {
        this.spawnAt(Number(p.get('dim') || 0), Number(p.get('x')), Number(p.get('y') || 0), Number(p.get('z')), Number(p.get('yaw') || 0));
        if (p.has('pitch')) this.player.pitch = this.player.tpitch = Number(p.get('pitch'));
      }
    } else {
      this.state = 'title';
      this.ui.fade = 1; this.ui.fadeTarget = 1;
      this.titleWaiting = true;
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  createWorld(seed) {
    if (this.world) this.world.unloadAll();
    this.seed = seed;
    this.world = new this.World(seed, this.texIndex, this.renderer);
    if (this.params.has('force')) this.world.zones.forceType = this.params.get('force');
    if (this.params.has('piece')) this.world.zones.forcePiece = this.params.get('piece');
    if (this.worker && !this.workerFailed) {
      this.world.attachWorker(this.worker);
      if (!this.workerWatch) {
        this.workerWatch = true;
        this.worker.addEventListener('error', (e) => { console.warn('world worker failed, generating on the main thread', e.message); this.dropWorker(); });
        setTimeout(() => { if (!this.worker || !this.worker.helloed) this.dropWorker(); }, 8000);
      }
    }
    this.player = new this.Player(this.world);
    this.hookPlayer();
    this.spawnAt(0, SPAWN[0] + 0.5, 0, SPAWN[1] + 0.5, 0);
  }

  dropWorker() {
    if (this.workerFailed) return;
    this.workerFailed = true;
    if (this.world) { this.world.worker = null; this.world.inflight = new Map(); }
    try { this.worker && this.worker.terminate(); } catch (e) { /* ignore */ }
  }

  hookPlayer() {
    const p = this.player;
    p.onStep = (surf, speed, crouched) => this.audioCall('footstep', surf, speed, crouched);
    p.onLand = (speed, surf) => this.audioCall('land', speed, surf);
    p.onClimb = () => this.audioCall('play', 'climb', p.x, p.y + 1, p.z, {});
  }

  initAudio() {
    if (this.audioStarted) { this.audioCall('resume'); return; }
    this.audioStarted = true;
    import('../audio/audio.js').then(async (m) => {
      this.audio = new m.AudioEngine();
      await this.audio.init();
      this.audioReady = true;
      this.applyVolume();
    }).catch((e) => { console.warn('audio unavailable', e); });
  }

  audioCall(method, ...args) {
    if (!this.audioReady || !this.audio || typeof this.audio[method] !== 'function') return undefined;
    try { return this.audio[method](...args); } catch (e) { console.warn('audio', method, e); return undefined; }
  }
  sfx(name) { this.audioCall('ui', name); }
  applyVolume() { this.audioCall('setVolume', this.settings.volume); }

  applyScreen() {
    const w = this.settings.wide ? RES_W_WIDE : RES_W;
    this.renderer.setResolution(w, RES_H);
    this.uic.width = w; this.uic.height = RES_H;
    this.ctx.imageSmoothingEnabled = false;
    const scr = this.glc.parentElement;
    scr.style.aspectRatio = this.settings.wide ? '16 / 9' : '4 / 3';
    scr.style.height = this.settings.wide ? 'min(100vh, 56.25vw)' : 'min(100vh, 75vw)';
  }

  saveSettings() { writeSettings(this.settings); }

  // ------------------------------------------------------------------ flow
  startNew() {
    this.ui.stack.length = 0;
    this.ui.fade = 1; this.ui.fadeTarget = 0;
    if (this.seed !== DEFAULT_SEED && !this.params.has('seed')) this.createWorld(DEFAULT_SEED);
    else this.spawnAt(0, SPAWN[0] + 0.5, 0, SPAWN[1] + 0.5, 0);
    this.player.distance = 0;
    this.stats = { time: 0, levels: {} };
    this.events.reset();
    this.state = 'play';
    this.input.lock();
    this.sfx('start');
  }

  hasSave() { return !!loadSave(); }

  continueGame() {
    const s = loadSave();
    if (!s) { this.startNew(); return; }
    this.ui.stack.length = 0;
    this.ui.fade = 1; this.ui.fadeTarget = 0;
    if (s.seed !== this.seed) this.createWorld(s.seed);
    this.spawnAt(s.dim || 0, s.x, s.y, s.z, s.yaw || 0);
    this.player.pitch = this.player.tpitch = s.pitch || 0;
    this.player.distance = s.distance || 0;
    this.stats = { time: s.time || 0, levels: s.levels || {} };
    this.portalReturn = s.portalReturn || null;
    this.events.reset();
    this.state = 'play';
    this.input.lock();
    this.sfx('start');
  }

  saveGame(kind) {
    const p = this.player;
    if (!p || this.state === 'title') return false;
    const ok = writeSave({
      v: 1, seed: this.seed, dim: p.dim, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
      distance: p.distance, time: this.stats.time, levels: this.stats.levels, kind, date: Date.now(),
      portalReturn: this.portalReturn,
    });
    if (ok && kind === 'auto') this.ui.saveIcon = 1.6;
    return ok;
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.ui.stack.length = 0;
    this.ui.note = null;
    this.ui.open('pause');
    this.input.unlock();
    this.saveGame('auto');
  }
  resume() {
    this.ui.stack.length = 0;
    this.state = 'play';
    this.input.lock();
  }
  quitToTitle() {
    this.saveGame('auto');
    this.ui.stack.length = 0;
    this.state = 'title';
    this.ui.fade = 1; this.ui.fadeTarget = 0;
    this.input.unlock();
  }

  // Place the player on a free floor spot near (x, z) as soon as the area is loaded.
  spawnAt(dim, x, y, z, yaw) {
    this.player.dim = dim;
    this.player.setPos(x, y, z, yaw);
    this.player.frozen = true;
    this.pendingSpawn = { dim, x, y, z, yaw, t: 0 };
    if (!this.world.worker) { this.world.update(dim, x, y, z, 0, 40); this.trySpawn(); }
    return true;
  }

  trySpawn(dt = 0) {
    const s = this.pendingSpawn;
    if (!s) return true;
    s.t += dt;
    const w = this.world;
    w.update(s.dim, s.x, s.y, s.z, 4);
    if (w.worker && !w.areaReady(s.dim, s.x, s.y, s.z, 1) && s.t < 20) return false;
    const level = Math.floor((s.y + 0.05) / LEVEL_H);
    const tmp = [];
    let placed = false;
    for (let r = 0; r < 14 && !placed; r++) {
      for (let dz = -r; dz <= r && !placed; dz++) for (let dx = -r; dx <= r && !placed; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = Math.floor(s.x) + dx + 0.5, cz = Math.floor(s.z) + dz + 0.5;
        const y0 = level * LEVEL_H;
        w.queryBoxes(s.dim, cx - PLAYER_R, y0 - 3, cz - PLAYER_R, cx + PLAYER_R, y0 + 4.5, cz + PLAYER_R, tmp);
        let best = null;
        for (let k = 0; k < tmp.length; k += 7) {
          const top = tmp[k + 4];
          if (top > s.y + 1.5 || top < s.y - 3) continue;
          if (best !== null && Math.abs(top - s.y) >= Math.abs(best - s.y)) continue;
          let blocked = false;
          for (let j = 0; j < tmp.length; j += 7) {
            if (tmp[j + 1] < top + PLAYER_H && tmp[j + 4] > top + 0.01) { blocked = true; break; }
          }
          if (!blocked) best = top;
        }
        if (best !== null) { this.player.setPos(cx, best + 0.001, cz, s.yaw); placed = true; }
      }
    }
    if (!placed) this.player.setPos(s.x, s.y, s.z, s.yaw);
    this.player.dim = s.dim;
    this.player.frozen = false;
    this.pendingSpawn = null;
    return true;
  }

  // drop the player onto a random spot some levels down (fell into nothing)
  fellThrough() {
    const p = this.player;
    const down = 1 + Math.floor(Math.random() * 3);
    const lvl = p.level() - down;
    const a = Math.random() * Math.PI * 2;
    this.ui.fadeTarget = 1;
    this.pendingTeleport = { t: 1.4, dim: p.dim, x: p.x + Math.cos(a) * 40, y: lvl * LEVEL_H, z: p.z + Math.sin(a) * 40 };
  }

  // ------------------------------------------------------------------ main loop
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const tsec = now / 1000;
    if (!this.last) this.last = tsec;
    if (this.settings.fps30 && now - this.lastRender < 1000 / 30 - 3) return;
    this.lastRender = now;
    const dt = Math.min(0.1, tsec - this.last);
    this.last = tsec;
    this.time += dt;
    const inp = this.input.poll();
    if (this.touchUI) this.touchUI.update();
    if (this.state === 'title') this.updateTitle(dt, inp);
    else if (this.state === 'play') this.updatePlay(dt, inp);
    else if (this.state === 'pause') this.ui.input(inp);
    this.render(dt);
  }

  updateTitle(dt, inp) {
    if (this.pendingSpawn) this.trySpawn(dt);
    if (!this.ui.top()) {
      if (inp.menuOk || inp.click || inp.use || inp.pause) { this.ui.open('title'); }
    } else this.ui.input(inp);
    // slow drift through the first hall
    this.titleCamT += dt;
    const t = this.titleCamT;
    const p = this.player;
    p.x = SPAWN[0] + 0.5 + Math.sin(t * 0.021) * 3;
    p.z = SPAWN[1] + 0.5 - ((t * 0.32) % 22);
    p.y = 0;
    p.yaw = p.tyaw = Math.sin(t * 0.05) * 0.5 - 0.15;
    p.pitch = p.tpitch = 0.03;
    p.dim = 0;
    this.world.update(0, p.x, p.y, p.z, 4);
    // fade in once the first hall has streamed in
    if (this.titleWaiting && (this.world.areaReady(0, p.x, p.y, p.z, 1) || this.titleCamT > 12)) { this.titleWaiting = false; this.ui.fadeTarget = 0; }
    this.updateEnv(dt);
    this.updateAudio(dt);
  }

  updatePlay(dt, inp) {
    const p = this.player;
    const ui = this.ui;
    if (this.pendingSpawn) {
      this.ui.loading = !this.trySpawn(dt);
      if (this.pendingSpawn) { this.updateEnv(dt); return; }
    }
    this.ui.loading = false;
    if (ui.active) {
      ui.input(inp);
      p.update(dt, { mx: 0, mz: 0, turn: 0, lookX: 0, lookY: 0 });
    } else {
      if (inp.pause) { this.pause(); return; }
      p.sens = 0.0023 * this.settings.sens;
      p.invertY = this.settings.invertY;
      p.update(dt, inp);
      this.findTarget();
      if (inp.use && this.target) this.interact(this.target);
    }
    this.checkPortals();
    this.world.update(p.dim, p.x, p.y, p.z, 5, false, this.prefetch);
    this.stats.time += dt;
    this.stats.levels[p.dim + ':' + p.level()] = 1;
    // fell into nothing
    if (p.airTime > 2.6 && p.vy < -14 && !this.pendingTeleport) this.fellThrough();
    if (this.pendingTeleport) {
      const pt = this.pendingTeleport;
      pt.t -= dt;
      p.frozen = true;
      if (pt.t <= 0) {
        this.pendingTeleport = null;
        this.spawnAt(pt.dim, pt.x, pt.y, pt.z, p.yaw);
        p.frozen = false;
        this.ui.fadeTarget = 0;
        this.audioCall('land', 6, p.surface);
      }
    }
    this.updateEnv(dt);
    this.updateMutations(dt);
    this.events.update(dt);
    this.updateAudio(dt);
    this.autosaveT += dt;
    if (this.autosaveT > 75) { this.autosaveT = 0; this.saveGame('auto'); }
  }

  // Mutable zones rearrange once the player has been inside and wandered well away.
  updateMutations(dt) {
    this.mutT -= dt;
    if (this.mutT > 0) return;
    this.mutT = 1;
    const p = this.player;
    if (this.zone && this.zone.params && this.zone.params.mutable) this.mutableVisited.set(this.zone.key, this.zone);
    for (const [k, z] of this.mutableVisited) {
      if (z.dim !== p.dim) { this.mutableVisited.delete(k); continue; }
      const dx = Math.max(z.x0 - p.x, 0, p.x - z.x1), dz = Math.max(z.z0 - p.z, 0, p.z - z.z1);
      if (Math.hypot(dx, dz) > 60 || Math.abs(p.level() - z.level) > 0) {
        this.world.mutate(z);
        this.mutableVisited.delete(k);
      }
    }
  }

  // Seamless portals: swap the player into the vestibule's twin while they stand in its middle.
  checkPortals() {
    const p = this.player;
    let inside = false;
    let near = null, nearD = 1e9;
    const lv = p.level();
    for (const ch of this.world.chunksNear(p.dim, p.x, p.z, 20)) {
      if (ch.level !== lv) continue;
      for (const s of ch.data.specials) {
        if (s.kind !== 'vestibule') continue;
        const v = s.v;
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < nearD) { nearD = d; near = v; }
        const [x0, z0, x1, z1] = vestibuleTrigger(v);
        const y0 = v.level * LEVEL_H;
        if (p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1 && p.y > y0 - 0.5 && p.y < y0 + 1.5) {
          inside = true;
          if (this.portalArmed) { this.teleport(v); return; }
        }
      }
    }
    if (!inside) this.portalArmed = true;
    // keep the far side of a nearby portal loaded
    this.prefetch = null;
    if (near && nearD < 18 && near.kind !== 'loop') {
      const t = portalTarget(near, this);
      if (t && !t.respawn) this.prefetch = [{ dim: t.dim, x: p.x + (t.dx || 0), y: p.y + (t.dy || 0), z: p.z + (t.dz || 0), r: 1 }];
    }
  }

  teleport(v) {
    const p = this.player;
    const t = portalTarget(v, this);
    if (!t) return;
    this.portalArmed = false;
    if (t.respawn) {
      this.spawnAt(0, SPAWN[0] + 0.5, 0, SPAWN[1] + 0.5, p.yaw);
      this.portalReturn = null;
      return;
    }
    if (t.rot180) {
      const cx = v.ox + 1.5, cz = v.oz + v.Lg + 0.5;
      p.x = 2 * cx - p.x; p.z = 2 * cz - p.z;
      p.vx = -p.vx; p.vz = -p.vz;
      p.yaw += Math.PI; p.tyaw += Math.PI;
      return;
    }
    if (t.enterPocket) this.portalReturn = { dim: v.dim, level: v.level, ox: v.ox, oz: v.oz };
    if (t.leavePocket) this.portalReturn = null;
    p.dim = t.dim;
    p.x += t.dx; p.y += t.dy; p.z += t.dz;
    if (p.lastSafe) p.lastSafe = [p.x, p.y, p.z];
    // the far side should already be prefetched; make sure the immediate chunks exist
    this.world.update(p.dim, p.x, p.y, p.z, 0, 24);
  }

  findTarget() {
    const p = this.player;
    const cam = p.camera(this.time);
    const fx = Math.sin(cam.yaw) * Math.cos(cam.pitch), fy = Math.sin(cam.pitch), fz = -Math.cos(cam.yaw) * Math.cos(cam.pitch);
    let best = null, bd = 1e9;
    for (const ch of this.world.chunksNear(p.dim, p.x, p.z, 3)) {
      for (const it of ch.data.interact) {
        const dx = it.x - cam.x, dy = it.y - cam.y, dz = it.z - cam.z;
        const along = dx * fx + dy * fy + dz * fz;
        if (along < 0.1 || along > 1.9) continue;
        const px = cam.x + fx * along, py = cam.y + fy * along, pz = cam.z + fz * along;
        const off = Math.hypot(it.x - px, (it.y - py) * 0.7, it.z - pz);
        if (off > (it.r || 0.6)) continue;
        if (along + off < bd) { bd = along + off; best = it; }
      }
    }
    this.target = best;
    this.ui.prompt = best ? '[' + (this.input.isTouch ? 'USE' : this.input.usingPad ? 'X' : 'E') + '] ' + (USE_LABEL[best.prop && best.prop.type === 'typewriter' ? 'typewriter' : best.kind] || 'USE') : null;
  }

  interact(it) {
    const p = this.player;
    switch (it.kind) {
      case 'save':
        if (it.prop && (it.prop.type === 'phone' || it.prop.type === 'payphone')) {
          const answered = this.events.answered(it);
          this.audioCall('play', 'phone_pickup', it.x, it.y, it.z, {});
          if (answered) this.ui.say('...', 2);
        } else this.audioCall('play', 'typewriter', it.x, it.y, it.z, {});
        this.ui.openSaveDialog();
        break;
      case 'note': {
        const idx = it.prop && it.prop.opts && it.prop.opts.text !== undefined ? it.prop.opts.text : Math.floor(it.x * 13 + it.z * 7);
        this.audioCall('play', 'paper', it.x, it.y, it.z, {});
        this.ui.showNote(noteText(idx));
        break;
      }
      case 'locked':
        this.audioCall('play', 'locked_rattle', it.x, it.y, it.z, {});
        this.ui.say(Math.random() < 0.85 ? 'It is locked.' : 'It will not open.');
        break;
      case 'cooler':
        this.audioCall('play', 'cooler_glug', it.x, it.y, it.z, {});
        this.ui.say('The water is room temperature.');
        break;
      case 'vending':
        this.audioCall('play', 'vending_clunk', it.x, it.y, it.z, {});
        this.ui.say(Math.random() < 0.7 ? 'Nothing comes out.' : 'SOLD OUT');
        break;
      default:
        break;
    }
    void p;
  }

  updateEnv(dt) {
    const p = this.player;
    const zone = this.world.zoneInfoAt(p.dim, p.x, p.y + 0.5, p.z);
    const target = (zone && zone.params && zone.params.env) || DEFAULT_ENV;
    this.zone = zone;
    const k = 1 - Math.exp(-dt * 0.9);
    for (let i = 0; i < 3; i++) this.env.fog[i] += (target.fog[i] - this.env.fog[i]) * k;
    this.env.fogNear += (target.fogNear - this.env.fogNear) * k;
    this.env.fogFar += (target.fogFar - this.env.fogFar) * k;
    this.env.hum = target.hum; this.env.hvac = target.hvac; this.env.reverb = target.reverb; this.env.tone = target.tone;
  }

  updateAudio(dt) {
    if (!this.audioReady) return;
    const p = this.player;
    this.gatherT -= dt;
    if (this.gatherT <= 0) {
      this.gatherT = 0.25;
      const em = [], li = [];
      const lv = p.level();
      for (const ch of this.world.chunksNear(p.dim, p.x, p.z, 26)) {
        if (Math.abs(ch.level - lv) > 1) continue;
        for (const e of ch.data.emitters) if (Math.hypot(e.x - p.x, e.z - p.z) < (e.rad || 12) + 4) em.push(e);
        if (ch.level === lv) for (const L of ch.data.lights) if (Math.hypot(L.x - p.x, L.z - p.z) < 14) li.push(L);
      }
      this.audioCtx.emitters = em;
      this.audioCtx.lights = li;
      if (!this.audioCtx.occluded) {
        const tmp = [];
        this.audioCtx.occluded = (x, y, z) => {
          const c = this.player.camera(this.time);
          return this.world.segmentBlocked(this.player.dim, c.x, c.y, c.z, x, y, z, tmp);
        };
      }
    }
    const cam = p.camera(this.time);
    this.audioCall('update', dt, { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw }, this.env, this.audioCtx);
  }

  mouseUI() {
    if (this.input.locked || !this.input.mouse.moved) return null;
    const rect = this.uic.getBoundingClientRect();
    const x = ((this.input.mouse.x - rect.left) / rect.width) * this.uic.width;
    const y = ((this.input.mouse.y - rect.top) / rect.height) * this.uic.height;
    return { x, y };
  }

  // ------------------------------------------------------------------ render
  render(dt) {
    const r = this.renderer, s = this.settings;
    this.flicker.update(this.time);
    const cam = this.player.camera(this.time);
    cam.fov = (s.fov * Math.PI) / 180;
    r.snapScale = s.jitterMode === 0 ? 0.001 : s.jitterMode === 2 ? 2.4 : 1;
    r.dither = s.dither;
    r.begin(cam, { fogColor: this.env.fog, fogNear: this.env.fogNear, fogFar: this.env.fogFar, time: this.time, flick: this.flicker.v, bright: s.bright });
    this.world.time = this.time;
    this.world.draw(r, cam.dim, cam, this.env.fogFar, this.env.fogFar * 0.8);
    r.end();
    this.ui.draw(dt);
    if (this.debug) this.drawDebug();
  }

  drawDebug() {
    const c = this.ctx, p = this.player, w = this.world;
    const lines = [
      `pos ${p.x.toFixed(1)} ${p.y.toFixed(2)} ${p.z.toFixed(1)} L${p.level()} d${p.dim}`,
      `zone ${this.zone ? this.zone.type + ':' + (this.zone.params.variant || this.zone.params.layout || '') : '-'}`,
      `chunks ${w.chunks.size} tris ${Math.round(this.renderer.stats.tris)} draws ${this.renderer.stats.draws}`,
      `build ${w.stats.built} avg ${(w.stats.buildMs / Math.max(1, w.stats.built)).toFixed(1)}ms pending ${w.pendingCount || 0}`,
    ];
    lines.forEach((l, i) => {
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.fillRect(0, 1 + i * 9, l.length * 6 + 3, 9);
      drawText(c, l, 2, 2 + i * 9, '#ff0');
    });
  }
}
void CHUNK; void SURF;
