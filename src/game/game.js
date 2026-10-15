// Temporary bootstrap used to validate the engine; replaced by the full game flow.
import * as THREE from 'three';
import { PS1Renderer } from '../engine/renderer.js';
import { Settings } from '../engine/settings.js';
import { Input } from '../engine/input.js';
import { G } from '../engine/ps1material.js';
import { LevelBuilder } from '../engine/levelbuilder.js';
import { CollisionWorld } from '../engine/collision.js';
import { NavGrid } from '../engine/nav.js';

export class Game {
  constructor({ canvas, hud, ui }) {
    this.canvas = canvas; this.hudCanvas = hud; this.ui = ui;
    this.settings = new Settings();
    this.renderer = new PS1Renderer(canvas, this.settings);
    this.renderer.applySettings();
    this.input = new Input(canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 400);
    this.renderer.onResize = (a) => { this.camera.aspect = a; this.camera.updateProjectionMatrix(); };
    this.clock = new THREE.Clock();
    this.yaw = 0; this.pitch = 0;
    canvas.addEventListener('click', () => this.input.requestLock());
  }

  async start() {
    const L = new LevelBuilder({ ambientSky: 0x303440, ambientGround: 0x1a1816, sun: { dir: [0.4, 0.8, 0.3], color: new THREE.Color(0.9, 0.7, 0.5) }, skyRays: 6 });
    L.floor(-20, -20, 20, 20, 0, 'asphalt');
    L.room({ x0: -6, z0: -6, x1: 6, z1: 6, y: 0, h: 3, floor: 'carpetRed', wall: 'wallpaper', wallOut: 'brick', doors: { s: [{ at: 6, w: 1.4, h: 2.2 }], e: [{ at: 3, w: 1.2, h: 2.2 }] } });
    L.stairs([10, 0, -4], 'n', 2, 3, 5, 14, 'concrete', { rails: true });
    L.box([8.5, 0, -14], [11.5, 3, -9], 'concrete');
    L.box([-12, 0, 8], [-9, 1, 11], 'metalRed');
    L.light([0, 2.6, 0], 0xffd8a0, 9, 1.4);
    L.light([0, 2.6, 4], 0xff6020, 6, 1.0, { flicker: 1 });
    const group = await L.build((p, m) => { this.loadMsg = `${m} ${(p * 100) | 0}%`; });
    this.scene.add(group);
    this.collision = new CollisionWorld();
    this.collision.build(L.moveBVH, L.shootBVH);
    const t0 = performance.now();
    const bounds = new THREE.Box3().setFromBufferAttribute(L.colGeo.getAttribute('position'));
    this.nav = new NavGrid(L.moveBVH, bounds).generate();
    this.navTime = performance.now() - t0;
    G.uFogColor.value.set(0x283038); G.uFogNear.value = 8; G.uFogFar.value = 45;
    this.scene.userData.clearColor = 0x283038;
    this.body = { pos: new THREE.Vector3(0, 0.1, 10), vel: new THREE.Vector3(), radius: 0.38, height: 1.8, grounded: false, groundNormal: new THREE.Vector3(0, 1, 0) };
    this.ready = true;
    this.loop();
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    G.uTime.value += dt;
    const sens = 0.0022 * this.settings.get('sensitivity');
    this.yaw -= this.input.mouseDX * sens; this.pitch -= this.input.mouseDY * sens;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
    const f = (this.input.down('forward') ? 1 : 0) - (this.input.down('back') ? 1 : 0);
    const r = (this.input.down('right') ? 1 : 0) - (this.input.down('left') ? 1 : 0);
    const fw = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const rt = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = fw.multiplyScalar(f).add(rt.multiplyScalar(r));
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(5.6);
    this.body.vel.x = wish.x; this.body.vel.z = wish.z;
    this.body.vel.y -= 20 * dt;
    if (this.body.grounded && this.input.hit('jump')) this.body.vel.y = 6.2;
    this.collision.moveCharacter(this.body, dt);
    this.camera.position.set(this.body.pos.x, this.body.pos.y + 1.62, this.body.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.renderer.postUniforms.uTime.value = G.uTime.value;
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }
}
