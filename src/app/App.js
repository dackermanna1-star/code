// Application shell: setup menu -> battle generation -> main loop.

import * as THREE from 'three';
import { generateMap } from '../world/mapgen.js';
import { World } from '../sim/world.js';
import { attachAI, planForces } from '../ai/index.js';
import { GameRenderer, QUALITY } from '../render/Renderer.js';
import { CameraController } from '../camera/CameraController.js';
import { AudioSystem } from '../audio/AudioSystem.js';
import { AudioBridge } from './AudioBridge.js';
import { HUD, Loading } from '../ui/HUD.js';
import { Menu } from '../ui/Menu.js';
import { rng } from '../core/rng.js';

const TIME_SCALES = [0.25, 0.5, 1, 2, 4];
const _v = new THREE.Vector3();

export class App {
  constructor(root) {
    this.root = root;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'view';
    this.canvas.setAttribute('aria-label', 'Battlefield view');
    root.append(this.canvas);
    this.loading = new Loading(root);
    this.menu = new Menu(root, (s) => this.start(s));
    this.audio = new AudioSystem();
    this.paused = false;
    this.timeScaleIdx = 2;
    this.markersVisible = true;
    this.hudHidden = false;
    this.selected = null;
    this.frameMs = 16;
    this.simAcc = 0;
    this.stepMs = 0;
    this.slowT = 0;
    this.fastT = 0;
    this.frame = this.frame.bind(this);
    // Handle for tests and debugging in the browser console.
    window.__battlespace = this;
    this.THREE = THREE;
  }

  get timeScale() {
    return TIME_SCALES[this.timeScaleIdx];
  }

  async start(settings) {
    this.settings = settings;
    // Audio must start inside the click that triggered this.
    if (settings.audio) {
      this.audio.start().catch(() => {});
      this.audio.setVoiceRadio(!!settings.radioVoice);
    }
    this.menu.hide();
    const step = (p, text) => {
      this.loading.set(p, text);
      return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    };
    try {
      await step(0.04, 'Surveying terrain');
      rng.seed(settings.seed);
      const map = generateMap(settings.scenario, settings.seed);
      await step(0.25, 'Charting routes and fields of fire');
      const forces = planForces(map, settings.size, settings.mix);
      const world = new World(map, {
        tickets: forces.tickets,
        endless: settings.endless,
        weather: { condition: settings.weather, time: settings.time, dynamic: settings.dynamicWeather, timeFlow: 1 },
        maxBodies: settings.size > 1200 ? 1400 : 1800,
      });
      await step(0.42, 'Mustering forces');
      attachAI(world, forces.armies);
      await step(0.58, 'Building the battlefield');
      this.renderer = new GameRenderer(this.canvas, settings.quality);
      this.renderer.attachWorld(world);
      this.world = world;
      await step(0.78, 'Positioning observers');
      this.camera = new CameraController(this.renderer.camera, this.canvas);
      this.camera.onPick = (x, y) => this.pick(x, y);
      this.placeInitialCamera();
      this.hud = new HUD(this.root, this);
      this.hud.attachWorld(world);
      this.bridge = new AudioBridge(settings.audio ? this.audio : null);
      await step(0.9, 'Compiling shaders');
      this.camera.update(0.016, world, 0);
      this.renderer.renderer.compile(this.renderer.scene, this.renderer.camera);
      await step(1, 'Deploying');
      this.loading.hide();
      this.bindKeys();
      window.addEventListener('resize', () => this.renderer.resize());
      this.basePixelRatio = this.renderer.renderer.getPixelRatio();
      this.last = performance.now();
      requestAnimationFrame(this.frame);
    } catch (err) {
      console.error(err);
      this.loading.set(1, `Could not start the battle: ${err && err.message ? err.message : err}`);
    }
  }

  placeInitialCamera() {
    const w = this.world;
    const side = w.map.attacker >= 0 ? w.map.attacker : 0;
    const d = w.map.deploy[side];
    const obj = w.objectives.slice().sort((a, b) => Math.hypot(a.x - d.x, a.z - d.z) - Math.hypot(b.x - d.x, b.z - d.z))[0];
    const fx = Math.sin(d.yaw);
    const fz = Math.cos(d.yaw);
    const x = d.x - fx * 140;
    const z = d.z - fz * 140;
    const c = this.camera;
    c.pos.set(x, w.terrain.heightAt(x, z) + 70, z);
    c.yaw = Math.atan2(obj.x - x, obj.z - z);
    c.pitch = -0.16;
    c.speedIdx = 4;
  }

  // ------------------------------------------------------------ input

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      const c = this.camera;
      const w = this.world;
      switch (e.code) {
        case 'Space':
          this.paused = !this.paused;
          e.preventDefault();
          break;
        case 'Minus':
        case 'NumpadSubtract':
          this.timeScaleIdx = Math.max(0, this.timeScaleIdx - 1);
          break;
        case 'Equal':
        case 'NumpadAdd':
          this.timeScaleIdx = Math.min(TIME_SCALES.length - 1, this.timeScaleIdx + 1);
          break;
        case 'Digit1':
          c.setMode('free', w);
          break;
        case 'Digit2':
          this.ensureTarget();
          c.setMode('orbit', w);
          break;
        case 'Digit3':
          this.ensureTarget();
          c.setMode('follow', w);
          break;
        case 'Digit4':
          this.ensureTarget();
          c.setMode('eyes', w);
          break;
        case 'Digit5':
          c.setMode('cinematic', w);
          break;
        case 'Digit6':
          c.setMode('overview', w);
          break;
        case 'KeyF':
          this.cameraFollow('follow');
          break;
        case 'KeyV':
          this.cameraFollow('eyes');
          break;
        case 'KeyO':
          this.cameraFollow('orbit');
          break;
        case 'BracketRight':
          this.cycle(1);
          break;
        case 'BracketLeft':
          this.cycle(-1);
          break;
        case 'KeyR':
          this.jumpToHotspot();
          break;
        case 'KeyT': {
          const a = c.director.pickInteresting(w, (u) => u.cat === 'air' && u.aclass !== 'uav');
          if (a) {
            this.select(a);
            c.follow(a, 'follow');
          }
          break;
        }
        case 'KeyM':
          this.markersVisible = !this.markersVisible;
          this.renderer.markers.visible = this.markersVisible;
          break;
        case 'Tab':
          e.preventDefault();
          this.hudHidden = !this.hudHidden;
          this.hud.setHidden(this.hudHidden);
          break;
        case 'KeyP':
          this.hud.togglePerf();
          break;
        case 'KeyH':
          this.hud.toggleHelp();
          break;
        case 'Escape':
          if (c.mode !== 'free') this.release();
          else this.select(null);
          this.hud.toggleHelp(false);
          break;
        default:
          break;
      }
    });
  }

  ensureTarget() {
    if (!this.selected || !this.selected.alive) {
      const u = this.camera.director.pickInteresting(this.world);
      if (u) this.select(u);
    }
    this.camera.target = this.selected;
  }

  select(u) {
    this.selected = u;
    this.hud.setSelected(u);
  }

  cameraFollow(mode) {
    this.ensureTarget();
    if (this.selected) this.camera.follow(this.selected, mode);
  }

  release() {
    this.camera.setMode('free', this.world);
  }

  cycle(dir) {
    const w = this.world;
    const cur = this.selected;
    let list = w.units.filter((u) => u.alive && !u.hidden && (!cur || (u.faction === cur.faction && u.cat === cur.cat)));
    if (!list.length) list = w.units.filter((u) => u.alive && !u.hidden);
    if (!list.length) return;
    list.sort((a, b) => a.id - b.id);
    let i = cur ? list.findIndex((u) => u.id > cur.id) : 0;
    if (dir < 0) {
      const idx = cur ? list.findIndex((u) => u.id >= cur.id) : 0;
      i = (idx <= 0 ? list.length : idx) - 1;
    } else if (i < 0) i = 0;
    const u = list[i];
    this.select(u);
    if (this.camera.mode === 'free' || this.camera.mode === 'overview' || this.camera.mode === 'cinematic') this.camera.follow(u, 'follow');
    else this.camera.target = u;
  }

  jumpTo(x, z) {
    const c = this.camera;
    if (c.mode === 'overview') {
      c.overview.x = x;
      c.overview.z = z;
      return;
    }
    c.setMode('free', this.world);
    const back = 90;
    const px = x - Math.sin(c.yaw) * back;
    const pz = z - Math.cos(c.yaw) * back;
    c.pos.set(px, this.world.terrain.heightAt(px, pz) + 55, pz);
    c.pitch = -0.45;
    c.vel.set(0, 0, 0);
  }

  jumpToHotspot() {
    const hs = this.camera.director.hotspot(this.world);
    this.jumpTo(hs.x, hs.z);
  }

  pick(cx, cy) {
    const rect = this.canvas.getBoundingClientRect();
    const cam = this.renderer.camera;
    let best = null;
    let bs = Infinity;
    const test = (u) => {
      if (!u.alive || u.hidden) return;
      const h = u.cat === 'inf' ? 1 : u.cat === 'veh' ? u.spec.height * 0.5 : 0;
      _v.set(u.pos.x, u.pos.y + h, u.pos.z).project(cam);
      if (_v.z < -1 || _v.z > 1) return;
      const sx = rect.left + ((_v.x + 1) / 2) * rect.width;
      const sy = rect.top + ((1 - _v.y) / 2) * rect.height;
      const d = Math.hypot(sx - cx, sy - cy);
      const r = u.cat === 'inf' ? 22 : 34;
      if (d > r) return;
      const score = d + _v.z * 40 - (u.cat !== 'inf' ? 8 : 0);
      if (score < bs) {
        bs = score;
        best = u;
      }
    };
    for (const u of this.world.units) test(u);
    this.select(best);
  }

  newBattle() {
    location.reload();
  }

  // Advance the simulation without rendering (used by the smoke test to
  // reach the middle of a battle). Craters and the last moments of events
  // are kept for the effects, HUD and audio.
  fastForward(seconds) {
    const w = this.world;
    const keep = [];
    const n = Math.round(seconds * 30);
    for (let i = 0; i < n && !w.over; i++) {
      w.update(1 / 30);
      for (const e of w.events) if (e.t === 'crater' || e.t === 'objective' || e.t === 'battle_over' || i > n - 45) keep.push(e);
      w.events.length = 0;
    }
    for (const e of keep) w.events.push(e);
  }

  // ------------------------------------------------------------ main loop

  frame(now) {
    requestAnimationFrame(this.frame);
    const w = this.world;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.1);
    const t0 = performance.now();
    const simDt = this.paused ? 0 : dt * this.timeScale;
    w.listener = this.renderer.camera.position;
    // The simulation normally steps once per frame; when a step gets
    // expensive (huge battles) it runs at a fixed 30 Hz instead.
    this.simAcc += simDt;
    const minStep = this.stepMs > 7 ? 1 / 30 : 0;
    if (this.simAcc > 0 && this.simAcc >= minStep) {
      const steps = Math.min(4, Math.ceil(this.simAcc / 0.034));
      const h = Math.min(this.simAcc / steps, 0.034);
      for (let i = 0; i < steps; i++) w.update(h);
      this.stepMs += ((performance.now() - t0) / steps - this.stepMs) * 0.1;
      this.simAcc = 0;
    }
    const t1 = performance.now();
    this.camera.update(dt, w, this.renderer.shake);
    const events = w.events;
    this.renderer.handleEvents(events);
    if (this.bridge) this.bridge.handle(events, w);
    this.hud.handle(events);
    events.length = 0;
    const cin = this.camera.mode === 'cinematic';
    this.renderer.letterbox += ((cin ? 1 : 0) - this.renderer.letterbox) * Math.min(1, dt * 3);
    this.renderer.fpv = this.camera.fpvActive ? 1 : 0;
    this.renderer.markerMode = !this.markersVisible ? 'off' : this.camera.mode === 'overview' ? 'on' : this.camera.mode === 'free' ? 'auto' : 'off';
    const ct = this.camera.target;
    this.renderer.hideUnit = this.camera.mode === 'eyes' && ct && ct.cat === 'veh' && ct.alive ? ct : null;
    this.renderer.render(dt, simDt, this.selected);
    if (this.bridge) this.bridge.update(dt, this.renderer.camera, w, this.timeScale, this.paused);
    const t2 = performance.now();
    this.hud.update(dt, this.renderer.camera, this.canvas.clientWidth, this.canvas.clientHeight);
    // Stats and dynamic resolution.
    this.frameMs += (dt * 1000 - this.frameMs) * 0.05;
    this.adaptResolution(dt);
    const r = this.renderer.stats;
    this.hud.updatePerf([
      `${Math.round(1000 / this.frameMs)} fps · ${this.frameMs.toFixed(1)} ms`,
      `sim ${(t1 - t0).toFixed(1)} ms · render ${(t2 - t1).toFixed(1)} ms`,
      `units ${w.units.length} · dead ${w.dead.length} · shots ${w.projectiles.active.length}`,
      `draw calls ${r.calls} · tris ${(r.tris / 1e6).toFixed(2)}M · soldiers drawn ${r.soldiers}`,
      `paths queued ${w.paths.queue.length} · los ${w.losPerTick - w.losBudget}/${w.losPerTick}`,
      `pixel ratio ${this.renderer.renderer.getPixelRatio().toFixed(2)}`,
    ]);
  }

  adaptResolution(dt) {
    const r = this.renderer;
    const pr = r.renderer.getPixelRatio();
    const maxPr = Math.min(window.devicePixelRatio || 1, QUALITY[r.qualityName].pixelRatio);
    if (this.frameMs > 42) {
      this.slowT += dt;
      this.fastT = 0;
    } else if (this.frameMs < 22) {
      this.fastT += dt;
      this.slowT = 0;
    } else {
      this.slowT = 0;
      this.fastT = 0;
    }
    if (this.slowT > 2 && pr > maxPr * 0.55) {
      r.renderer.setPixelRatio(Math.max(maxPr * 0.55, pr * 0.88));
      r.resize();
      this.slowT = 0;
    } else if (this.fastT > 5 && pr < maxPr) {
      r.renderer.setPixelRatio(Math.min(maxPr, pr * 1.1));
      r.resize();
      this.fastT = 0;
    }
  }
}
