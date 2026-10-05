// First-person gun view for "Desert Strike": the held gun and blocky R6 arms
// drawn in their own pass on top of the world (so they never poke into
// walls), with sway, bob, sprinting, aiming down the sights, recoil, the
// slide/bolt cycling, ejected brass, and reload animations.
import * as THREE from 'three';
import { brickColor } from '../../engine/BrickColor.js';
import { gunMaterials } from './guns.js';
import { playMech, playBrass } from './fx.js';

const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;

export class ViewModel {
  constructor(world) {
    this.world = world;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.01, 50);
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a5a48, 1.6));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.position.set(0.6, 1, 0.4); this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xd0dcff, 0.6); fill.position.set(-0.6, 0.2, 0.6); this.scene.add(fill);
    this.flashLight = new THREE.PointLight(0xffc070, 0, 2, 2); this.scene.add(this.flashLight);
    // reflections for the metal parts: a little desert sky
    const pm = new THREE.PMREMGenerator(world.renderer);
    const env = new THREE.Scene();
    env.background = new THREE.Color(0xcab894);
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8fb4e0, side: THREE.BackSide }));
    env.add(skyDome);
    const sunBlob = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); sunBlob.position.set(2, 3, 1); env.add(sunBlob);
    this.scene.environment = pm.fromScene(env, 0.02).texture;
    pm.dispose();

    this.root = new THREE.Group(); // sway + bob + aim
    this.kick = new THREE.Group(); // recoil
    this.holder = new THREE.Group(); // the gun, moved by reload animations
    this.scene.add(this.root); this.root.add(this.kick); this.kick.add(this.holder);
    this.arms = null;
    this.gun = null;
    this.ads = 0; this.adsTarget = 0;
    this.sprint = 0;
    this.recoil = 0; this.recoilRot = 0;
    this.bobT = 0;
    this.swayX = 0; this.swayY = 0;
    this.equipT = 1;
    this.anim = null; // current reload/bolt animation
    this.brass = [];
    this.flash = null;
    this.visible = true;
    world.overlays = world.overlays || [];
    world.overlays.push((r) => this.render(r));
  }

  setAppearance(app, gloves = null) {
    if (this.arms) for (const a of this.arms) this.scene.remove(a);
    const c = (n) => { const b = brickColor(n); return new THREE.Color().setRGB(b.r, b.g, b.b, THREE.SRGBColorSpace); };
    const sleeve = app.shirt?.color ? new THREE.Color(app.shirt.color) : null;
    const mk = (skin) => {
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: sleeve || skin, roughness: 0.7 });
      if (app.shirt?.style === 'camo') {
        // camouflage sleeves
        const c2 = document.createElement('canvas'); c2.width = c2.height = 64; const x = c2.getContext('2d');
        x.fillStyle = app.shirt.color; x.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 14; i++) { x.fillStyle = (app.shirt.blobs || ['#6e5d40'])[i % 3]; x.beginPath(); x.ellipse(Math.random() * 64, Math.random() * 64, 6 + Math.random() * 8, 3 + Math.random() * 5, Math.random() * 3, 0, 7); x.fill(); }
        const t = new THREE.CanvasTexture(c2); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 4);
        m.map = t; m.color.set(0xffffff);
      }
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 1), m); arm.position.z = 0.5; g.add(arm);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.078, 0.06), new THREE.MeshStandardMaterial({ color: gloves ?? skin, roughness: 0.75 })); hand.position.z = 0.03; g.add(hand);
      g.userData.arm = arm;
      this.scene.add(g);
      return g;
    };
    this.arms = [mk(c(app.colors.rightArm)), mk(c(app.colors.leftArm))];
  }

  setWeapon(info) {
    if (this.gun) this.holder.remove(this.gun.group);
    this.gun = info;
    if (!info) return;
    info.group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    this.holder.add(info.group);
    this.pistol = !!info.pistol;
    this.hip = this.pistol ? new THREE.Vector3(0.09, -0.115, -0.38) : new THREE.Vector3(0.14, -0.15, -0.42);
    this.adsDist = info.scope === 'sniper' ? 0.1 : info.scope === 'acog' ? 0.12 : this.pistol ? 0.26 : 0.17;
    this.equipT = 0;
    this.anim = null;
    this.restMag = info.mag ? info.mag.position.clone() : null;
    if (info.slide) this.restSlide = info.slide.position.clone();
    if (info.bolt) this.restBolt = info.bolt.position.clone();
    if (info.pump) this.restPump = info.pump.position.clone();
    playMech('slide');
  }

  // --- actions ---------------------------------------------------------------------------------
  fire(strength = 1) {
    this.recoil = Math.min(1.5, this.recoil + 0.6 * strength);
    this.recoilRot = Math.min(1.2, this.recoilRot + 0.5 * strength);
    this.cycleT = 0;
    const g = this.gun;
    if (!g) return;
    // muzzle flash
    if (!g.stats?.suppressed) {
      if (!this.flash) {
        this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._flashTex(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
        this.scene.add(this.flash);
      }
      this.flash.visible = true; this.flashT = 0.045;
      this.flash.material.rotation = Math.random() * 6.28;
      this.flash.scale.setScalar((this.pistol ? 0.09 : 0.13) * (0.8 + Math.random() * 0.5));
      this.flashLight.intensity = 3;
    }
    // ejected brass
    if (g.eject && !g.pump && !g.stats?.bolt) this._eject();
  }

  _flashTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); x.translate(32, 32);
    for (let i = 0; i < 6; i++) { x.rotate(Math.PI / 3); const gr = x.createLinearGradient(0, 0, 30, 0); gr.addColorStop(0, 'rgba(255,240,190,1)'); gr.addColorStop(1, 'rgba(255,140,30,0)'); x.fillStyle = gr; x.beginPath(); x.moveTo(0, -4); x.lineTo(30, 0); x.lineTo(0, 4); x.fill(); }
    const gr = x.createRadialGradient(0, 0, 0, 0, 0, 14); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(1, 'rgba(255,170,40,0)'); x.fillStyle = gr; x.beginPath(); x.arc(0, 0, 14, 0, 7); x.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  _eject() {
    const M = gunMaterials();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, this.pistol ? 0.019 : 0.045, 8), M.brass);
    this.gun.group.updateMatrixWorld(true);
    shell.position.copy(this.gun.group.localToWorld(this.gun.eject.clone()));
    shell.rotation.set(Math.random(), Math.random(), Math.PI / 2);
    this.scene.add(shell);
    this.brass.push({ m: shell, v: new THREE.Vector3(0.9 + Math.random() * 0.6, 0.9 + Math.random() * 0.5, 0.2 + Math.random() * 0.3), w: new THREE.Vector3(Math.random() * 30, Math.random() * 30, 20), age: 0 });
    playBrass(null);
  }

  /**
   * Reload animation. kind: 'mag' | 'shell' (one shotgun shell) | 'pump' |
   * 'bolt'. Calls done() when finished.
   */
  play(kind, duration, done) {
    this.anim = { kind, t: 0, dur: duration, done, sounds: new Set() };
  }

  get busy() { return !!this.anim; }
  get scopeActive() { return this.ads > 0.95 && this.gun && (this.gun.scope === 'sniper' || this.gun.scope === 'acog'); }

  // --- per frame ----------------------------------------------------------------------------------
  update(dt, { moving = 0, sprint = false, ads = false, look = [0, 0], grounded = true }) {
    const g = this.gun;
    this.equipT = Math.min(1, this.equipT + dt / 0.45);
    this.adsTarget = ads && !sprint && !this.anim ? 1 : 0;
    this.ads += (this.adsTarget - this.ads) * Math.min(1, dt * 12);
    this.sprint += ((sprint && moving > 0.1 && !this.anim ? 1 : 0) - this.sprint) * Math.min(1, dt * 8);
    this.recoil *= Math.exp(-dt * 14);
    this.recoilRot *= Math.exp(-dt * 10);
    this.bobT += dt * (moving > 0.1 && grounded ? (sprint ? 13 : 9) : 0);
    // mouse sway (the gun lags behind the view a little)
    this.swayX += (Math.max(-0.06, Math.min(0.06, -look[0] * 0.0009)) - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (Math.max(-0.05, Math.min(0.05, look[1] * 0.0009)) - this.swayY) * Math.min(1, dt * 10);
    if (!g) return;

    const a = ease(this.ads);
    const adsPos = new THREE.Vector3(0, 0, -this.adsDist).sub(g.sight);
    const pos = this.hip.clone().lerp(adsPos, a);
    const bobAmp = (1 - a * 0.85) * Math.min(1, moving);
    const t = performance.now() / 1000;
    pos.x += Math.sin(this.bobT) * 0.012 * bobAmp + Math.sin(t * 1.1) * 0.0015 * (1 - a);
    pos.y += -Math.abs(Math.cos(this.bobT)) * 0.012 * bobAmp + Math.sin(t * 1.6) * 0.002 * (1 - a * 0.7);
    // sprinting: the gun comes down and across
    const s = ease(this.sprint);
    pos.x += -0.04 * s; pos.y += -0.05 * s; pos.z += 0.03 * s;
    // equipping: rises from below
    const e = 1 - ease(this.equipT);
    pos.y -= e * 0.25;
    this.root.position.copy(pos);
    this.root.rotation.set(this.swayY * (1 - a * 0.6) - e * 0.6 - s * 0.25, this.swayX * (1 - a * 0.6) + s * 0.75, s * 0.35 + Math.sin(this.bobT) * 0.01 * bobAmp);
    // recoil: kick back and up
    this.kick.position.set(0, this.recoil * 0.006, this.recoil * (this.pistol ? 0.03 : 0.022) * (1 - a * 0.3));
    this.kick.rotation.set(this.recoilRot * (this.pistol ? 0.16 : 0.07), (Math.random() - 0.5) * 0.01 * this.recoil, 0);
    // the slide / bolt carrier cycling after a shot
    this.cycleT = (this.cycleT ?? 1) + dt / 0.06;
    const cyc = this.cycleT < 1 ? Math.sin(this.cycleT * Math.PI) : 0;
    if (g.slide && this.restSlide) g.slide.position.z = this.restSlide.z + cyc * 0.04 + (this.slideLocked ? 0.04 : 0);
    if (g.bolt && this.restBolt && !g.stats?.bolt) g.bolt.position.z = this.restBolt.z + cyc * 0.03;
    // flash
    if (this.flash && this.flash.visible) {
      this.flashT -= dt;
      g.group.updateMatrixWorld(true);
      this.flash.position.copy(g.group.localToWorld(g.muzzle.clone().add(new THREE.Vector3(0, 0, -0.03))));
      this.flashLight.position.copy(this.flash.position);
      if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; }
    }
    // brass
    for (let i = this.brass.length - 1; i >= 0; i--) {
      const b = this.brass[i];
      b.age += dt; b.v.y -= 6 * dt;
      b.m.position.addScaledVector(b.v, dt);
      b.m.rotation.x += b.w.x * dt; b.m.rotation.y += b.w.y * dt;
      if (b.age > 0.7) { this.scene.remove(b.m); b.m.geometry.dispose(); this.brass.splice(i, 1); }
    }
    this._animate(dt);
    this._placeArms();
  }

  _animate(dt) {
    const g = this.gun, A = this.anim;
    this.holder.position.set(0, 0, 0); this.holder.rotation.set(0, 0, 0);
    if (g.mag && this.restMag) { g.mag.position.copy(this.restMag); g.mag.visible = !g.pump || false; if (g.pump) g.mag.visible = false; }
    if (g.pump && this.restPump) g.pump.position.copy(this.restPump);
    if (g.bolt && this.restBolt && g.stats?.bolt) { g.bolt.position.copy(this.restBolt); g.bolt.rotation.set(0, 0, 0); }
    this.leftOverride = null;
    if (!A) return;
    A.t += dt / A.dur;
    const t = Math.min(1, A.t);
    const at = (name, when, fn = () => playMech(name)) => { if (t >= when && !A.sounds.has(name + when)) { A.sounds.add(name + when); fn(); } };
    if (A.kind === 'mag') {
      // tilt, drop the magazine, bring a new one up, seat it, charge
      const tilt = ease(seg(t, 0, 0.15)) * (1 - ease(seg(t, 0.85, 1)));
      this.holder.rotation.set(tilt * 0.25, tilt * 0.3, tilt * (this.pistol ? 0.35 : 0.6));
      this.holder.position.set(-tilt * 0.03, -tilt * 0.03, 0);
      if (g.mag && this.restMag) {
        const out = ease(seg(t, 0.15, 0.32)), back = ease(seg(t, 0.45, 0.66));
        const drop = out * (1 - back);
        g.mag.position.y = this.restMag.y - drop * 0.3 - (out > 0.99 && back < 0.01 ? 0.3 : 0);
        g.mag.visible = !(t > 0.33 && t < 0.42);
        const magWorld = new THREE.Vector3(); g.mag.getWorldPosition(magWorld);
        this.leftOverride = magWorld.add(new THREE.Vector3(-0.01, -0.04, 0.0));
        if (t > 0.3 && t < 0.45) this.leftOverride.y -= 0.25 * Math.sin(seg(t, 0.3, 0.45) * Math.PI);
      }
      at('magOut', 0.18); at('magIn', 0.64);
      if (!this.pistol) {
        const rk = seg(t, 0.72, 0.86);
        if (g.bolt && this.restBolt) g.bolt.position.z = this.restBolt.z + Math.sin(rk * Math.PI) * 0.07;
        at('rack', 0.74);
      } else {
        this.slideLocked = t < 0.75 && this.slideLocked;
        at('slide', 0.76);
      }
    } else if (A.kind === 'shell') {
      // tip the shotgun, push one shell into the tube
      const tilt = ease(seg(t, 0, 0.25)) * (1 - ease(seg(t, 0.8, 1)));
      this.holder.rotation.set(tilt * 0.2, 0, -tilt * 0.5);
      if (g.mag) {
        g.mag.visible = t < 0.7;
        const p = ease(seg(t, 0.2, 0.6));
        g.mag.position.set(0, -0.06 - (1 - p) * 0.12, 0.02 - p * 0.02);
        const w = new THREE.Vector3(); g.mag.getWorldPosition(w);
        this.leftOverride = w.add(new THREE.Vector3(0, -0.03, 0.02));
      }
      at('shell', 0.6);
    } else if (A.kind === 'pump' || A.kind === 'bolt') {
      const back = ease(seg(t, 0.1, 0.45)), fwd = ease(seg(t, 0.55, 0.9));
      const k = back * (1 - fwd);
      if (g.pump && this.restPump) { g.pump.position.z = this.restPump.z + k * 0.08; at('pumpBack', 0.15); at('pumpFwd', 0.6); }
      if (g.bolt && this.restBolt && g.stats?.bolt) {
        const up = ease(seg(t, 0.0, 0.15)) * (1 - ease(seg(t, 0.85, 1)));
        g.bolt.rotation.z = up * 1.0;
        g.bolt.position.z = this.restBolt.z + k * 0.09;
        at('boltUp', 0.05); at('boltBack', 0.25); at('boltFwd', 0.6);
        if (t > 0.4 && !A.ejected) { A.ejected = true; this._eject(); }
        this.holder.rotation.z = -0.12 * Math.sin(t * Math.PI);
      }
      if (g.pump && t > 0.35 && !A.ejected) { A.ejected = true; this._ejectShell(); }
    }
    if (A.t >= 1) { this.anim = null; A.done?.(); }
  }

  _ejectShell() {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0xa01818, roughness: 0.6 }));
    this.gun.group.updateMatrixWorld(true);
    shell.position.copy(this.gun.group.localToWorld(this.gun.eject.clone()));
    this.scene.add(shell);
    this.brass.push({ m: shell, v: new THREE.Vector3(1.0, 1.2, 0.2), w: new THREE.Vector3(20, 10, 15), age: 0 });
    playBrass(null);
  }

  /** Point each blocky arm from an off-screen shoulder to its hand. */
  _placeArms() {
    if (!this.arms || !this.gun) return;
    const g = this.gun.group;
    this.scene.updateMatrixWorld(true);
    const right = g.localToWorld(new THREE.Vector3(0, -0.045, 0.025));
    const left = this.leftOverride || g.localToWorld(this.gun.leftHand.clone());
    const shoulders = [new THREE.Vector3(0.24, -0.5, 0.12), new THREE.Vector3(-0.26, -0.52, 0.06)];
    [right, left].forEach((hand, i) => {
      const arm = this.arms[i];
      const sh = shoulders[i].clone().add(this.root.position.clone().multiplyScalar(0.4));
      arm.position.copy(hand);
      const dir = sh.clone().sub(hand);
      const len = dir.length();
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
      arm.userData.arm.scale.z = len + 0.4;
      arm.userData.arm.position.z = (len + 0.4) / 2;
      arm.visible = this.visible && !this.scopeActive;
    });
  }

  render(renderer) {
    if (!this.visible || !this.gun || this.scopeActive) return;
    const size = renderer.getSize(new THREE.Vector2());
    this.camera.aspect = size.x / size.y;
    this.camera.updateProjectionMatrix();
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    const sm = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false;
    renderer.render(this.scene, this.camera);
    renderer.shadowMap.enabled = sm;
    renderer.autoClear = ac;
  }

  /** Where the muzzle is in the world (for tracers and flashes), given the main camera. */
  muzzleWorld(mainCam, scale = 3.5) {
    if (!this.gun) return mainCam.position.clone();
    this.gun.group.updateMatrixWorld(true);
    const p = this.gun.group.localToWorld(this.gun.muzzle.clone());
    return mainCam.localToWorld(p.multiplyScalar(scale));
  }
}
