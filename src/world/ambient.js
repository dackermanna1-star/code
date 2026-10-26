// Ambient life outside (and next door): fireworks, pigeons on the ledge,
// rainbows, a hot-air balloon, storm power flickers, the neighbor's music.
import * as THREE from 'three';
import { G } from '../game.js';
import { mat, sph, cone, cyl, at, group } from '../items/kit.js';
import { MusicPlayer } from '../core/music.js';
import { rand, pick, clamp } from '../core/utils.js';

export class Ambient {
  constructor(scene) {
    this.scene = scene;
    this.pigeon = null;
    this.fwUntil = 0;
    this.fwNext = 0;
    this.lastRain = 0;
    this.rainbow = this._makeRainbow();
    this.balloon = this._makeBalloon();
    this.neighborMusic = null;
    this.acc = 0;
    G.events.on('hour', (h) => this.onHour(h));
  }

  _makeRainbow() {
    const geo = new THREE.TorusGeometry(260, 14, 8, 64, Math.PI);
    const cols = ['#ff4d4d', '#ff9f43', '#ffe066', '#6bdc7a', '#4fa3ff', '#8e6bff'];
    const colors = [];
    const pos = geo.attributes.position;
    const center = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i);
      const r = Math.hypot(p.x, p.y);
      const k = clamp((r - 246) / 28, 0, 0.999);
      const c = new THREE.Color(cols[Math.floor(k * cols.length)]);
      colors.push(c.r, c.g, c.b);
      void center;
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    m.position.set(-60, -60, -480);
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  _makeBalloon() {
    const g = group(
      at(sph(9, mat('#ff6b6b', { rough: 0.6 }), 24, 16), 0, 14, 0),
      at(cone(7.5, 9, mat('#ffd166', { rough: 0.6 }), 24), 0, 5.5, 0),
      at(cyl(1.8, 1.4, 2.2, mat('#7a5230', { rough: 0.9 }), 12), 0, 0, 0),
    );
    g.children[1].rotation.x = Math.PI;
    for (let i = 0; i < 6; i++) { const s = cyl(0.9, 0.9, 18.2, mat(i % 2 ? '#ffffff' : '#4ecdc4', { rough: 0.6 }), 6); s.scale.set(1, 1, 0.12); s.rotation.y = i / 6 * Math.PI; at(s, 0, 14, 0); g.add(s); }
    g.visible = false;
    g.scale.setScalar(1);
    this.scene.add(g);
    return g;
  }

  onHour(h) {
    const day = G.clock.dayName;
    // fireworks: weekend nights over the river
    if ((day === 'Friday' || day === 'Saturday') && h === 21 && Math.random() < 0.85) this.fireworks(90);
    if (h === 22 && Math.random() < 0.08) this.fireworks(40);
    // hot air balloon on nice mornings
    if (h === 8 && G.weather.kind === 'clear' && Math.random() < 0.5) { this.balloon.visible = true; this.balloon.position.set(-420, 70, -330); this.balloonT = 0; }
    // pigeon visit
    if (h >= 7 && h <= 18 && !this.pigeon && G.weather.rain < 0.2 && Math.random() < 0.35) this.spawnPigeon();
    // neighbor music in the evening
    if ((h === 19 || h === 20) && Math.random() < 0.3 && !this.neighborMusic) this.neighborParty();
  }

  fireworks(minutes) {
    this.fwUntil = G.clock.total + minutes;
    if (G.started) G.phone.notify({ app: 'messages', title: '🎆 Fireworks over the river!', body: 'Look out the living room windows.', quiet: true });
  }

  _burst() {
    const center = new THREE.Vector3(rand(-260, 60), rand(70, 140), rand(-380, -240));
    const palette = pick([['#ff4d6d', '#ffd166'], ['#4cc9f0', '#ffffff'], ['#b388ff', '#ff70a6'], ['#06d6a0', '#ffe66d'], ['#ff9f1c', '#ffbf69']]);
    G.particles.add.emit({ pos: center, count: 90, velRand: 46, vel: { x: 0, y: 4, z: 0 }, life: 2.2, size: 5, sizeEnd: 0.5, color: palette, gravity: 7, drag: 0.9, spin: 0, spread: 1 });
    const dist = center.distanceTo(G.camera.position);
    G.audio.play('explode', { delay: dist / 340, volume: 0.25, bus: 'ambience' });
    G.audio.play('crunch', { delay: dist / 340 + 0.3, volume: 0.08, bus: 'ambience' });
  }

  spawnPigeon() {
    const grey = mat('#7d8590', { rough: 0.8 });
    const g = group(
      at(sph(0.08, grey, 14, 10), 0, 0.09, 0),
      at(sph(0.045, mat('#5c6672', { rough: 0.7 }), 12, 8), 0, 0.18, 0.06),
      at(cone(0.012, 0.03, mat('#3a3a3a'), 8), 0, 0.175, 0.11),
      at(cone(0.05, 0.12, grey, 8), 0, 0.09, -0.11),
    );
    g.children[0].scale.set(0.9, 0.9, 1.3);
    g.children[2].rotation.x = Math.PI / 2;
    g.children[3].rotation.x = -Math.PI / 2 - 0.3;
    const neck = sph(0.05, mat('#5f8a7a', { rough: 0.4, metal: 0.3 }), 10, 8); at(neck, 0, 0.14, 0.04); g.add(neck);
    for (const s of [-1, 1]) g.add(at(sph(0.008, mat('#ff7b00', { emissive: '#ff7b00', ei: 0.2 }), 6, 4), s * 0.03, 0.19, 0.09));
    const x = rand(-6, 6);
    g.position.set(x, 0.08, -5.62);
    g.rotation.y = rand(-0.6, 0.6) + Math.PI;
    this.scene.add(g);
    this.pigeon = { g, t: 0, stay: rand(60, 140), flying: false };
    G.audio.play('whoosh', { pos: g.position, volume: 0.3, pitch: 1.6 });
  }

  _updatePigeon(dt) {
    const p = this.pigeon;
    if (!p) return;
    p.t += dt;
    const head = p.g.children[1];
    if (!p.flying) {
      head.position.z = 0.06 + Math.max(0, Math.sin(p.t * 6)) * 0.02;
      p.g.rotation.y += Math.sin(p.t * 0.7) * dt * 0.4;
      if (Math.random() < dt * 0.15) G.audio.play('purr', { pos: p.g.position, volume: 0.25 });
      const near = G.player.pos.distanceTo(new THREE.Vector3(p.g.position.x, 0, -4.9)) < 1.1;
      if (near || p.t > p.stay) { p.flying = true; p.vy = 0; G.audio.play('rustle', { pos: p.g.position }); if (near) G.events.emit('act', 'pigeon'); }
    } else {
      p.vy += dt * 3;
      p.g.position.y += p.vy * dt;
      p.g.position.z -= dt * 3;
      p.g.position.x += dt * 1.5;
      if (p.g.position.y > 12) { this.scene.remove(p.g); this.pigeon = null; }
    }
  }

  neighborParty() {
    this.neighborMusic = new MusicPlayer({ station: pick(['pop', 'synth', 'bossa']), pos: new THREE.Vector3(-0.6, 1.3, 7.8), volume: 0.5, filterFreq: 520 });
    this.neighborMusic.start();
    setTimeout(() => { this.neighborMusic?.stop(); this.neighborMusic = null; }, rand(90, 200) * 1000);
  }

  powerFlicker() {
    const apt = G.apartment;
    let n = 0;
    G.audio.play('switch');
    const saved = { ...G.state.home.lights };
    const iv = setInterval(() => {
      n++;
      for (const r of Object.keys(saved)) G.state.home.lights[r] = saved[r] && n % 2 === 0;
      apt.applyLights();
      if (n > 6) { clearInterval(iv); Object.assign(G.state.home.lights, saved); apt.applyLights(); }
    }, 140);
  }

  update(dt) {
    if (!G.started) return;
    // fireworks
    if (G.clock.total < this.fwUntil) {
      this.fwNext -= dt;
      if (this.fwNext <= 0) { this.fwNext = rand(0.25, 1.4); this._burst(); if (Math.random() < 0.3) setTimeout(() => this._burst(), 180); }
    }
    this._updatePigeon(dt);
    // balloon drift
    if (this.balloon.visible) {
      this.balloonT += dt;
      this.balloon.position.x += dt * 2.2;
      this.balloon.position.y = 70 + Math.sin(this.balloonT * 0.05) * 8;
      if (this.balloon.position.x > 420) this.balloon.visible = false;
    }
    // rainbow after rain during the day
    const raining = G.weather.rain > 0.3;
    if (raining) this.lastRain = G.clock.total;
    const sun = G.sky.info;
    const want = !raining && G.clock.total - this.lastRain < 90 && this.lastRain > 0 && sun && sun.daylight > 0.6;
    const m = this.rainbow.material;
    m.opacity = THREE.MathUtils.damp(m.opacity, want ? 0.32 : 0, 0.5, dt);
    this.rainbow.visible = m.opacity > 0.01;
    // storms occasionally flicker the power
    this.acc += dt;
    if (this.acc > 1) {
      this.acc = 0;
      if (G.weather.kind === 'storm' && Math.random() < 0.006) this.powerFlicker();
    }
  }
}
