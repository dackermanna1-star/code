import * as THREE from 'three';
import { Studio } from './world/Studio.js';
import { FollowCamera } from './world/FollowCamera.js';
import { Character } from './character/Character.js';
import { makeHairMaterial } from './character/hair.js';
import { Wardrobe } from './wardrobe/Wardrobe.js';
import { Animator } from './anim/Animator.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');

const SPEEDS = { stroll: 0.75, walk: 1.2, brisk: 1.6 };

class App {
  async init() {
    this.studio = new Studio(document.getElementById('app'));
    this.studio.contact.hidden = [this.studio.floor, this.studio.grid];
    this.character = await Character.load();
    this.studio.scene.add(this.character.root);
    await this.character.setHair(params.get('hair') || 'long', (map) => makeHairMaterial(map));
    this.wardrobe = new Wardrobe(this.character);
    this.wardrobe.wear('briefs_hipster');
    this.wardrobe.wear('bra_bralette');
    this.animator = new Animator(this.character);
    this.cam = new FollowCamera(this.studio.camera, this.studio.renderer.domElement);
    this.keys = new Set();
    this.speedMode = 'walk';
    this.input = { dir: new THREE.Vector3(), speed: 0, cameraYaw: 0 };
    this._bindKeys();
    this.clock = new THREE.Clock();
    this.time = 0;
    if (TEST) this._testApi();
    else this._loop();
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      this.keys.add(e.code);
      if (e.code === 'KeyG') this.studio.grid.visible = !this.studio.grid.visible;
      if (e.code === 'Digit1') this.cam.setPreset('full');
      if (e.code === 'Digit2') this.cam.setPreset('close');
      if (e.code === 'Digit3') this.cam.setPreset('face');
      if (e.code === 'Digit4') this.cam.setPreset('feet');
      if (e.code === 'Digit5') this.cam.setPreset('wide');
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _readInput() {
    const k = this.keys;
    let f = 0, r = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) r += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) r -= 1;
    const yaw = this.cam.viewYaw;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    this.input.dir.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, r);
    const mag = this.input.dir.length();
    if (mag > 0) this.input.dir.divideScalar(mag);
    let mode = this.speedMode;
    if (k.has('ShiftLeft') || k.has('ShiftRight')) mode = 'brisk';
    if (k.has('ControlLeft') || k.has('AltLeft') || k.has('KeyC')) mode = 'stroll';
    this.input.speed = mag > 0 ? SPEEDS[mode] : 0;
    this.input.cameraYaw = Math.atan2(this.studio.camera.position.x - this.animator.loco.pos.x,
      this.studio.camera.position.z - this.animator.loco.pos.z);
  }

  step(dt) {
    this.time += dt;
    this.animator.update(dt, this.input);
    this.wardrobe.update(dt, { animator: this.animator });
    const L = this.animator.loco;
    this.cam.update(dt, L.pos, L.heading, L.speed);
    this.studio.follow(L.pos);
  }

  _loop() {
    const tick = () => {
      requestAnimationFrame(tick);
      const dt = Math.min(this.clock.getDelta(), 1 / 20);
      this._readInput();
      this.step(dt);
      this.studio.render();
    };
    tick();
    window.__ready = true;
  }

  /** Deterministic stepping for automated visual tests (?test). */
  _testApi() {
    const app = this;
    window.__app = app;
    window.__test = {
      setInput(fx, fz, speed) { app.input.dir.set(fx, 0, fz); if (app.input.dir.lengthSq()) app.input.dir.normalize(); app.input.speed = speed; },
      run(seconds, fps = 60) { const n = Math.round(seconds * fps); for (let i = 0; i < n; i++) app.step(1 / fps); },
      render() { app.studio.render(); app.studio.render(); },
      camera(x, y, z, tx, ty, tz) {
        const c = app.studio.camera; const p = app.animator.loco.pos;
        c.position.set(p.x + x, y, p.z + z); c.lookAt(p.x + tx, ty, p.z + tz);
      },
      state() { const L = app.animator.loco; return { pos: L.pos.toArray(), heading: L.heading, speed: L.speed, phase: L.phase, active: L.active }; },
      wear(id, opts) { app.wardrobe.wear(id, opts || {}); app.animator.setGaitModifiers(app.wardrobe.gaitModifiers()); },
      remove(slot) { app.wardrobe.remove(slot); app.animator.setGaitModifiers(app.wardrobe.gaitModifiers()); },
      grid(v) { app.studio.grid.visible = v; },
    };
    app.studio.render();
    window.__ready = true;
  }
}

const app = new App();
app.init().catch((e) => {
  console.error(e);
  window.__error = String((e && e.stack) || e);
});
