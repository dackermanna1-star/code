// Viewmodel effects: pixel-art muzzle flash (front star + side cone), small flames (molotov rag, fuse, flare)
// and ejected casings flying out of the ejection port. Everything lives in the viewmodel scene.
import * as THREE from 'three';
import { createAdditiveMaterial } from './material.js';
import { buildProp } from './misc.js';

function pixelTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// deterministic tiny rng for texture generation
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function drawStar(g, n, seed) {
  const r = rng(seed);
  const c = n / 2;
  const img = g.createImageData(n, n);
  const rays = 5 + Math.floor(r() * 3);
  const rayA = Array.from({ length: rays }, (_, i) => (i / rays) * Math.PI * 2 + r() * 0.5);
  const rayL = rayA.map(() => 0.55 + r() * 0.45);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5 - c) / c, dy = (y + 0.5 - c) / c;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      let v = Math.max(0, 1 - d / 0.38);
      for (let i = 0; i < rays; i++) {
        let da = Math.abs(((a - rayA[i] + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        const w = 0.2 * (1 - d / rayL[i]);
        if (w > 0 && da < w) v = Math.max(v, (1 - d / rayL[i]) * (1 - da / w) * 0.95);
      }
      v = Math.min(1, v * 1.25);
      if (v < 0.08) continue;
      const q = v > 0.75 ? 3 : v > 0.45 ? 2 : v > 0.22 ? 1 : 0;
      const pal = [[255, 110, 20], [255, 170, 40], [255, 225, 120], [255, 252, 225]][q];
      const o = (y * n + x) * 4;
      img.data[o] = pal[0]; img.data[o + 1] = pal[1]; img.data[o + 2] = pal[2];
      img.data[o + 3] = Math.round(Math.min(1, v * 1.4) * 255);
    }
  }
  g.putImageData(img, 0, 0);
}

function drawCone(g, n, seed) {
  const r = rng(seed);
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n; // along the barrel (0 = muzzle)
      const vv = Math.abs((y + 0.5) / n - 0.5) * 2;
      const width = 0.25 + 0.75 * Math.sin(Math.min(1, u * 1.3) * Math.PI) * (0.7 + r() * 0.3);
      let v = (1 - vv / width) * (1 - u * 0.9);
      if (v < 0.1) continue;
      const q = v > 0.7 ? 3 : v > 0.45 ? 2 : v > 0.25 ? 1 : 0;
      const pal = [[255, 110, 20], [255, 170, 40], [255, 225, 120], [255, 252, 225]][q];
      const o = (y * n + x) * 4;
      img.data[o] = pal[0]; img.data[o + 1] = pal[1]; img.data[o + 2] = pal[2];
      img.data[o + 3] = Math.round(Math.min(1, v * 1.5) * 255);
    }
  }
  g.putImageData(img, 0, 0);
}

function drawFlame(g, n, frame, kind) {
  const r = rng(frame * 31 + 7);
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n - 0.5;
      const v = 1 - (y + 0.5) / n; // 0 bottom .. 1 top
      const w = (kind === 'spark' ? 0.18 : 0.36) * (1 - v) * (0.85 + r() * 0.3);
      let f = 1 - Math.abs(u) / Math.max(0.02, w);
      f *= 1 - v * 0.85;
      if (kind === 'spark') f = r() < 0.35 ? f : 0;
      if (f < 0.12) continue;
      const q = f > 0.7 ? 2 : f > 0.4 ? 1 : 0;
      const pal = kind === 'flare' ? [[255, 40, 30], [255, 90, 60], [255, 200, 180]] : [[255, 90, 10], [255, 160, 30], [255, 235, 150]];
      const o = (y * n + x) * 4;
      img.data[o] = pal[q][0]; img.data[o + 1] = pal[q][1]; img.data[o + 2] = pal[q][2];
      img.data[o + 3] = Math.round(Math.min(1, f * 1.6) * 255);
    }
  }
  g.putImageData(img, 0, 0);
}

const _q = new THREE.Quaternion();
const CASE_KIND = { brass: 'round_case', big: 'big_case', shell: 'shell_case' };
const _v = new THREE.Vector3();

export class ViewmodelFX {
  constructor(scene, material) {
    this.scene = scene;
    this.material = material;
    // muzzle flash: front star + 2 crossed side cones
    this.starTex = [1, 2, 3].map((s) => pixelTexture(16, (g, n) => drawStar(g, n, s * 977)));
    this.coneTex = [1, 2].map((s) => pixelTexture(16, (g, n) => drawCone(g, n, s * 131)));
    this.flashMat = createAdditiveMaterial(this.starTex[0], 0xffffff, 3.2);
    this.coneMat = createAdditiveMaterial(this.coneTex[0], 0xffffff, 2.6);
    const quad = new THREE.PlaneGeometry(1, 1);
    const coneGeo = new THREE.PlaneGeometry(1, 1);
    coneGeo.translate(0.5, 0, 0);
    this.flash = new THREE.Group();
    this.flash.visible = false;
    this.flashFront = new THREE.Mesh(quad, this.flashMat);
    this.flash.add(this.flashFront);
    this.flashCones = [0, 1].map((i) => {
      const w = new THREE.Group();
      w.rotation.z = i * Math.PI / 2;
      const m = new THREE.Mesh(coneGeo, this.coneMat);
      m.rotation.y = Math.PI / 2; // +X (cone axis) -> -Z (barrel direction)
      w.add(m);
      this.flash.add(w);
      return m;
    });
    this.flash.renderOrder = 10;
    this.flashT = 0;
    this.flashFrames = 0;
    // flames
    this.flameTex = { fire: [], spark: [], flare: [] };
    for (const k of Object.keys(this.flameTex)) for (let i = 0; i < 4; i++) this.flameTex[k].push(pixelTexture(16, (g, n) => drawFlame(g, n, i + k.length * 9, k)));
    this.flameMat = createAdditiveMaterial(this.flameTex.fire[0], 0xffffff, 2.2);
    this.flame = new THREE.Mesh(quad, this.flameMat);
    this.flame.visible = false;
    this.flame.renderOrder = 9;
    this.flameKind = 'fire';
    this.flameT = 0;
    // casings
    this.shells = [];
    this.shellProtos = {};
  }

  /** Attach the muzzle flash to a muzzle point object (or detach with null). */
  attachMuzzle(obj) {
    if (this.flash.parent) this.flash.parent.remove(this.flash);
    if (obj) obj.add(this.flash);
    this.flash.visible = false;
  }

  attachFlame(obj, kind = 'fire') {
    if (this.flame.parent) this.flame.parent.remove(this.flame);
    this.flameKind = kind;
    if (obj) obj.add(this.flame);
    this.flame.visible = false;
  }

  /** size: muzzle flash scale (1 = rifle). Units of the muzzle object's parent are cm. */
  muzzleFlash(size) {
    if (!this.flash.parent || size <= 0) return;
    const k = size * (0.85 + Math.random() * 0.35);
    this.flashMat.uniforms.map.value = this.starTex[(Math.random() * 3) | 0];
    this.coneMat.uniforms.map.value = this.coneTex[(Math.random() * 2) | 0];
    this.flashFront.scale.setScalar(13 * k);
    this.flashFront.rotation.z = Math.random() * Math.PI * 2;
    for (const c of this.flashCones) c.scale.set(16 * k, 7 * k, 1);
    this.flash.visible = true;
    this.flashT = 0;
    this.flashFrames = 0;
  }

  ejectShell(kind, pos, dir) {
    if (!kind) return;
    let s = this.shells.find((x) => !x.alive && x.kind === kind);
    if (!s) {
      if (this.shells.length > 24) {
        s = this.shells.find((x) => !x.alive);
        if (!s) return;
        this.scene.remove(s.obj);
        this.shells.splice(this.shells.indexOf(s), 1);
      }
      const g = buildProp(CASE_KIND[kind] || kind).build(this.material, 1).group;
      // casings: use prop geometry without bullet
      s = { kind, obj: g, alive: false, v: new THREE.Vector3(), w: new THREE.Vector3(), t: 0 };
      this.shells.push(s);
      this.scene.add(g);
    }
    s.alive = true;
    s.t = 0;
    s.obj.visible = true;
    s.obj.position.copy(pos);
    s.obj.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    const sp = kind === 'shell' ? 1.1 : 1.4;
    s.v.copy(dir).normalize().multiplyScalar(sp * (0.8 + Math.random() * 0.4));
    s.v.x += (Math.random() - 0.5) * 0.3;
    s.v.y += 0.6 + Math.random() * 0.4;
    s.w.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
  }

  update(dt, cameraQuatInv) {
    // muzzle flash: visible ~2 frames
    if (this.flash.visible) {
      this.flashFrames++;
      this.flashT += dt;
      if (this.flashFrames > 1 && this.flashT > 0.03) this.flash.visible = false;
      else {
        // face the camera: front quad billboard
        this.flash.parent.getWorldQuaternion(_q).invert();
        this.flashFront.quaternion.copy(_q);
        this.flashFront.rotateZ(this.flashT * 40);
      }
    }
    if (this.flame.visible && this.flame.parent) {
      this.flameT += dt;
      const frames = this.flameTex[this.flameKind] || this.flameTex.fire;
      this.flameMat.uniforms.map.value = frames[Math.floor(this.flameT * 14) % frames.length];
      this.flame.parent.getWorldQuaternion(_q).invert();
      this.flame.quaternion.copy(_q);
      const s = this.flameKind === 'spark' ? 5 : this.flameKind === 'flare' ? 9 : 8;
      this.flame.scale.set(s, s * 1.4, 1);
      this.flame.position.set(0, s * 0.45, 0);
    }
    for (const s of this.shells) {
      if (!s.alive) continue;
      s.t += dt;
      s.v.y -= 7 * dt;
      s.obj.position.addScaledVector(s.v, dt);
      s.obj.rotation.x += s.w.x * dt;
      s.obj.rotation.y += s.w.y * dt;
      s.obj.rotation.z += s.w.z * dt;
      if (s.t > 1.2 || s.obj.position.y < -1.5) {
        s.alive = false;
        s.obj.visible = false;
      }
    }
  }

  setFlameVisible(v) {
    this.flame.visible = v && !!this.flame.parent;
  }

  clearShells() {
    for (const s of this.shells) { s.alive = false; s.obj.visible = false; }
  }
}
