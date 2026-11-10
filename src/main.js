// Application bootstrap and main loop.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Stage } from './render/stage.js';
import { Sim } from './core/sim.js';
import { Effects } from './fx/effects.js';
import { AudioEngine } from './fx/audio.js';
import { CameraRig } from './interaction/camera.js';
import { Tools } from './interaction/tools.js';
import { UI } from './ui/ui.js';
import { PROPS, PROP_BY_TYPE, defaultLayout, buildProjectile } from './props/index.js';
import { buildPreview } from './props/builder.js';

class App {
  constructor() {
    this.paused = false;
    this.timeScale = 1;
    this.slowScale = 0.2;
    this.volume = 0.8;
    this.previews = new Map();
    this.projectiles = 0;
    this.stepRequest = 0;
    this.fps = 60;
    this.frames = 0;
    this.fpsT = 0;
    this.last = performance.now();
  }

  async init() {
    await RAPIER.init();
    const canvas = document.getElementById('view');
    this.stage = new Stage(canvas);
    this.sim = new Sim(RAPIER, this.stage.scene);
    this.fx = new Effects(this.stage);
    this.audio = new AudioEngine();
    this.audio.setMasterVolume(this.volume);
    this.sim.fx = this.fx;
    this.sim.audio = this.audio;
    this.rig = new CameraRig(this.stage.camera);
    this.tools = new Tools({ sim: this.sim, stage: this.stage, fx: this.fx, audio: this.audio, rig: this.rig, canvas, app: this });
    this.ui = new UI(this);
    this.tools.onChange = () => this.ui.refreshTool();
    this.ui.refreshTool();
    window.addEventListener('resize', () => this.stage.resize());
    // URL switches used by the automated tests: ?gfx=low&manual=1&empty=1
    const q = new URLSearchParams(location.search);
    if (q.get('gfx') === 'low') {
      Object.assign(this.stage.settings, { bloom: false, motionBlur: false, renderScale: 0.5 });
      this.stage.setShadowQuality(q.get('shadows') || 'low');
      this.stage.resize();
      this.ui.syncInputs();
    }
    this.manual = q.get('manual') === '1';
    if (q.get('empty') !== '1') this.resetScene(true);
    // prop thumbnails are drawn with the main renderer, so do them before the first visible frame
    if (!this.manual) {
      for (const p of PROPS) {
        try {
          const obj = buildPreview(this.previewDef(p.type));
          this.ui.setThumb(p.type, this.stage.thumbnail(obj));
          obj.traverse((o) => o.geometry && o.geometry.dispose());
        } catch (e) {
          console.warn('thumbnail failed', p.type, e);
        }
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    this.rig.update(0.016);
    this.stage.updateShadow(this.rig.sTarget);
    this.stage.render(0.016);
    document.getElementById('loading').classList.add('done');
    if (this.manual) return;
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Cached definition used for placement ghosts and thumbnails. */
  previewDef(type) {
    let d = this.previews.get(type);
    if (!d) {
      d = PROP_BY_TYPE[type].build();
      this.previews.set(type, d);
    }
    return d;
  }

  spawn(type, pos, yaw = 0, awake = false) {
    const entry = PROP_BY_TYPE[type];
    if (!entry) return null;
    const prop = this.sim.spawnProp(entry.build(), pos, yaw, { awake });
    this.audio.ui('spawn');
    return prop;
  }

  /** Fire a projectile of the given type from `origin` along unit vector `dir`. */
  launch(type, origin, dir, speed) {
    const rnd = () => (Math.random() - 0.5) * 6;
    const prop = this.sim.spawnProp(buildProjectile(type), origin, Math.random() * 6.28, {
      awake: true,
      linvel: { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed },
      angvel: { x: rnd(), y: rnd(), z: rnd() },
    });
    this.trackProjectile();
    return prop;
  }

  resetScene(silent) {
    this.tools.release();
    this.tools.cancelPlacement();
    this.sim.clearAll();
    this.fx.clear();
    this.audio.stopAll();
    for (const item of defaultLayout()) this.sim.spawnProp(PROP_BY_TYPE[item.type].build(), item.pos, item.yaw);
    // frame the two rows of props, leaving room for the spawn panel on the left
    const aspect = this.stage.camera.aspect || 1.6;
    const wide = aspect > 1.2;
    this.rig.setView(new THREE.Vector3(wide ? -1.0 : 0, 0.9, -0.3), 0.05, 0.25, wide ? Math.max(10.4, 17.5 / aspect) : 11.5 / aspect + 6, !!silent);
    if (!silent) this.ui.flash('Scene reset');
  }

  clearAll() {
    this.tools.release();
    this.sim.clearAll();
    this.fx.clear();
    this.audio.stopAll();
    this.ui.flash('All objects cleared');
  }

  clearDebris() {
    this.tools.release();
    this.sim.clearDebris();
    for (const prop of [...this.sim.props]) if (prop.type === 'projectile') this.sim.removeProp(prop);
    this.fx.clear();
    this.ui.flash('Debris cleared');
  }

  /** Keep the number of spent projectiles bounded. */
  trackProjectile() {
    let n = 0;
    let oldest = null;
    for (const prop of this.sim.props) {
      if (prop.type !== 'projectile') continue;
      n++;
      if (!oldest || prop.born < oldest.born) oldest = prop;
    }
    if (n > 60 && oldest) this.sim.removeProp(oldest);
  }

  togglePause(v) {
    this.paused = v === undefined ? !this.paused : v;
    this.ui.refreshPause();
  }

  stepOnce() {
    if (!this.paused) return;
    this.stepRequest++;
  }

  setTimeScale(v) {
    this.timeScale = v;
    this.audio.setTimeScale(v);
    this.ui.refreshTime();
  }

  toggleSlowMo() {
    if (this.timeScale < 0.99) this.setTimeScale(1);
    else this.setTimeScale(this.slowScale);
  }

  toggleHelp(v) {
    const el = document.getElementById('help');
    el.hidden = v === undefined ? !el.hidden : !v;
  }

  flash(text) {
    this.ui.flash(text);
  }

  /** Test hook: advance the simulation without rendering. */
  advance(seconds, dt = 1 / 60) {
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      this.tools.update(dt);
      this.sim.step(dt * this.timeScale);
    }
    this.sim.sync(dt);
  }

  /** Test hook: render a single frame. */
  renderOnce(dt = 1 / 60) {
    this.rig.update(dt, this.fx.shakeOffset, this.fx.shakeRot);
    this.sim.sync(0);
    this.fx.update(dt, dt, this.stage.camera);
    this.stage.updateShadow(this.rig.sTarget);
    this.stage.render(dt);
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.05) dt = 0.05;

    this.rig.update(dt, this.fx.shakeOffset, this.fx.shakeRot);
    this.tools.update(dt);

    let simDt = 0;
    if (!this.paused) simDt = dt * this.timeScale;
    else if (this.stepRequest > 0) {
      simDt = 1 / 60;
      this.stepRequest--;
    }
    if (simDt > 0) this.sim.step(simDt);
    this.sim.sync(simDt);
    this.fx.update(simDt, dt, this.stage.camera);

    const cam = this.stage.camera;
    this._fwd = this._fwd || new THREE.Vector3();
    this._up = this._up || new THREE.Vector3();
    cam.getWorldDirection(this._fwd);
    this._up.setFromMatrixColumn(cam.matrixWorld, 1);
    this.audio.setListener(cam.position, this._fwd, this._up);

    this.stage.updateShadow(this.rig.sTarget);
    this.stage.render(dt);

    // read-outs
    this.frames++;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      this.fps = this.frames / this.fpsT;
      this.frames = 0;
      this.fpsT = 0;
      this.ui.setStats(this.fps, this.sim.stats);
      this.ui.setInfo(this.tools.describeHover());
    }
  }
}

const app = new App();
window.__lab = app;
app.init().catch((e) => {
  console.error(e);
  const t = document.getElementById('loadingText');
  const msg = e && e.message ? e.message : String(e);
  const hint = /wasm|webassembly|compile|instantiate/i.test(msg)
    ? 'This viewer blocked WebAssembly, which the physics engine needs. Open the page in a regular browser tab or run the project locally.'
    : /webgl|context/i.test(msg)
      ? 'WebGL 2 is not available in this browser.'
      : msg;
  if (t) {
    t.textContent = 'Could not start. ' + hint;
    t.style.cssText = 'max-width:32em;text-align:center;line-height:1.4;letter-spacing:0.06em;padding:0 16px';
  }
  const bar = document.querySelector('#loading .bar');
  if (bar) bar.style.animation = 'none';
});
