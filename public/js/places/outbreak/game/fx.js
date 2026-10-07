// Effects: particles (dust, sparks, blood, smoke, splinters, water), bullet
// holes and blood on the ground, the muzzle-flash light, and smoke columns for
// crash sites. One instanced mesh of camera-facing quads for all particles;
// decals are a ring buffer of small quads laid on surfaces.
import * as THREE from 'three';
import { O } from '../state.js';

function tex(draw, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const PUFF = () => tex((g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
const HOLE = () => tex((g, s) => { g.clearRect(0, 0, s, s); const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(10,8,6,1)'); gr.addColorStop(0.25, 'rgba(20,16,12,0.95)'); gr.addColorStop(0.45, 'rgba(60,50,40,0.5)'); gr.addColorStop(1, 'rgba(60,50,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
const SPLAT = () => tex((g, s) => {
  g.clearRect(0, 0, s, s);
  for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, r = Math.random() * s * 0.38; g.fillStyle = `rgba(${70 + Math.random() * 40},4,4,${0.6 + Math.random() * 0.4})`; g.beginPath(); g.arc(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, 2 + Math.random() * s * 0.12, 0, 7); g.fill(); }
}, 128);

export class FX {
  constructor(world) {
    this.world = world;
    const N = this.N = 900;
    const geo = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('position', q.attributes.position); geo.setAttribute('uv', q.attributes.uv); geo.setIndex(q.index);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage); // xyz, size
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage); // rgb, alpha
    geo.setAttribute('pPos', this.aPos); geo.setAttribute('pCol', this.aCol);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: PUFF() }, ...THREE.UniformsLib.fog },
      vertexShader: `attribute vec4 pPos; attribute vec4 pCol; varying vec4 vCol; varying vec2 vUv;
#include <fog_pars_vertex>
void main() { vUv = uv; vCol = pCol; vec4 mv = viewMatrix * vec4(pPos.xyz, 1.0); mv.xy += position.xy * pPos.w; gl_Position = projectionMatrix * mv; vec4 mvPosition = mv;
#include <fog_vertex>
}`,
      fragmentShader: `uniform sampler2D map; varying vec4 vCol; varying vec2 vUv;
#include <fog_pars_fragment>
void main() { vec4 t = texture2D(map, vUv); gl_FragColor = vec4(vCol.rgb, t.a * vCol.a); if (gl_FragColor.a < 0.01) discard;
#include <fog_fragment>
}`,
      transparent: true, depthWrite: false, fog: true,
    });
    this.points = new THREE.Mesh(geo, mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    world.scene.add(this.points);
    this.geo = geo;
    this.ps = []; // { x,y,z, vx,vy,vz, life, max, size, grow, r,g,b, a, drag, grav }
    // decals
    this.holeTex = HOLE(); this.splatTex = SPLAT();
    this.decals = [];
    this.holeMat = new THREE.MeshStandardMaterial({ map: this.holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.9 });
    this.bloodMat = new THREE.MeshStandardMaterial({ map: this.splatTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.35, color: 0xaa2020 });
    this.quad = new THREE.PlaneGeometry(1, 1);
    // the muzzle flash light (one, reused)
    this.flashLight = new THREE.PointLight(0xffb060, 0, 40, 1.6);
    world.scene.add(this.flashLight);
    this.flashT = 0;
    this.smokes = [];
  }

  /** Throw out n particles. o: { color [r,g,b], speed, up, spread, life, size, grow, grav, drag, alpha, dir {x,y,z} } */
  burst(x, y, z, n, o = {}) {
    for (let i = 0; i < n; i++) {
      if (this.ps.length >= this.N) this.ps.shift();
      const sp = (o.speed ?? 6) * (0.4 + Math.random() * 0.8);
      let dx = (Math.random() - 0.5) * 2, dy = Math.random() * (o.up ?? 1), dz = (Math.random() - 0.5) * 2;
      if (o.dir) { const k = o.spread ?? 0.6; dx = o.dir.x + dx * k; dy = o.dir.y + dy * k; dz = o.dir.z + dz * k; }
      const L = Math.hypot(dx, dy, dz) || 1;
      const c = o.color || [0.6, 0.55, 0.5];
      const life = (o.life ?? 0.8) * (0.6 + Math.random() * 0.8);
      this.ps.push({ x, y, z, vx: dx / L * sp, vy: dy / L * sp, vz: dz / L * sp, life, max: life, size: (o.size ?? 0.5) * (0.6 + Math.random() * 0.8), grow: o.grow ?? 1.5, r: c[0], g: c[1], b: c[2], a: o.alpha ?? 0.9, drag: o.drag ?? 2, grav: o.grav ?? 4 });
    }
  }
  impact(x, y, z, nx, ny, nz, mat) {
    const dir = { x: nx, y: ny, z: nz };
    if (mat === 'metal') { this.burst(x, y, z, 7, { color: [1.0, 0.75, 0.35], speed: 14, dir, spread: 0.9, life: 0.25, size: 0.12, grow: 0, grav: 30, drag: 1, alpha: 1 }); this.burst(x, y, z, 2, { color: [0.5, 0.5, 0.5], speed: 2, dir, life: 0.6, size: 0.4 }); }
    else if (mat === 'wood') { this.burst(x, y, z, 6, { color: [0.45, 0.32, 0.2], speed: 8, dir, spread: 0.7, life: 0.6, size: 0.18, grow: 0, grav: 30, drag: 1 }); this.burst(x, y, z, 3, { color: [0.6, 0.5, 0.4], speed: 3, dir, life: 0.8, size: 0.5 }); }
    else if (mat === 'glass') this.burst(x, y, z, 10, { color: [0.8, 0.9, 0.95], speed: 9, dir, spread: 1, life: 0.6, size: 0.1, grow: 0, grav: 30, drag: 0.5 });
    else if (mat === 'water') this.burst(x, y, z, 10, { color: [0.85, 0.9, 0.95], speed: 7, dir: { x: 0, y: 1, z: 0 }, spread: 0.4, life: 0.7, size: 0.25, grow: 0.5, grav: 25, drag: 0.5 });
    else if (mat === 'dirt') this.burst(x, y, z, 8, { color: [0.42, 0.36, 0.28], speed: 7, dir, spread: 0.6, life: 0.9, size: 0.4, grow: 1.2, grav: 18 });
    else this.burst(x, y, z, 6, { color: [0.62, 0.6, 0.56], speed: 6, dir, spread: 0.6, life: 0.9, size: 0.45, grow: 1.4, grav: 8 });
  }
  blood(x, y, z, dir, heavy = false) {
    this.burst(x, y, z, heavy ? 16 : 9, { color: [0.45, 0.02, 0.02], speed: heavy ? 9 : 6, dir, spread: 0.7, life: 0.5, size: 0.22, grow: 0.8, grav: 25, drag: 1.5, alpha: 1 });
    this.burst(x, y, z, 3, { color: [0.35, 0.03, 0.03], speed: 2, dir, life: 0.4, size: 0.6, grow: 1.5, grav: 2, alpha: 0.7 });
    // a splash on the ground below
    if (Math.random() < 0.7) {
      const g = O.phys.groundAt(x + dir.x * 2, y, z + dir.z * 2, 0.3, 30);
      this.decal(x + dir.x * 2, g + 0.04, z + dir.z * 2, 0, 1, 0, heavy ? 2.6 : 1.6, this.bloodMat);
    }
  }
  /** A flat mark on a surface. */
  decal(x, y, z, nx, ny, nz, size, mat = this.holeMat) {
    const m = new THREE.Mesh(this.quad, mat);
    m.position.set(x + nx * 0.03, y + ny * 0.03, z + nz * 0.03);
    m.lookAt(x + nx, y + ny, z + nz);
    m.rotateZ(Math.random() * 6.28);
    m.scale.setScalar(size);
    m.receiveShadow = true;
    this.world.scene.add(m);
    this.decals.push(m);
    if (this.decals.length > 160) { const o = this.decals.shift(); this.world.scene.remove(o); }
  }
  muzzle(x, y, z) { this.flashLight.position.set(x, y, z); this.flashLight.intensity = 60; this.flashT = 0.05; }
  /** A column of smoke rising from (x, y, z) (crash sites, flares). */
  smoke(x, y, z, o = {}) { const s = { x, y, z, t: 0, life: o.life ?? 1e9, color: o.color || [0.35, 0.34, 0.33], rate: o.rate ?? 6, size: o.size ?? 6 }; this.smokes.push(s); return s; }

  update(dt) {
    // smoke columns: puffs that rise, spread and drift with the wind
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt; if (s.t > s.life) { this.smokes.splice(i, 1); continue; }
      const cam = O.world.camera.position;
      if (Math.abs(cam.x - s.x) + Math.abs(cam.z - s.z) > 3500) continue;
      s.acc = (s.acc || 0) + dt * s.rate;
      while (s.acc > 1) { s.acc -= 1; this.burst(s.x + (Math.random() - 0.5) * 3, s.y, s.z + (Math.random() - 0.5) * 3, 1, { color: s.color, speed: 1.5, dir: { x: 0.25, y: 1, z: 0.1 }, spread: 0.3, life: 14, size: s.size, grow: 1.3, grav: -1.5, drag: 0.05, alpha: 0.55 }); }
    }
    const P = this.ps, pos = this.aPos.array, col = this.aCol.array;
    let n = 0;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) { P.splice(i, 1); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.size += p.grow * dt;
      const f = p.life / p.max;
      pos[n * 4] = p.x; pos[n * 4 + 1] = p.y; pos[n * 4 + 2] = p.z; pos[n * 4 + 3] = p.size;
      // lit a little by the sky
      const L = O.sky ? Math.min(1.2, 0.25 + (O.sky.state?.light ?? 1)) : 1;
      col[n * 4] = p.r * L; col[n * 4 + 1] = p.g * L; col[n * 4 + 2] = p.b * L; col[n * 4 + 3] = p.a * Math.min(1, f * 2.5);
      n++;
    }
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashLight.intensity = 0; }
  }
}
