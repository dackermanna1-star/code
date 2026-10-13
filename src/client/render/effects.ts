import * as THREE from 'three';
import { blockDef } from '../../shared/world/blocks';
import { pieceGeometry, type Socket } from '../../shared/sim/buildgeom';
import { heldModel } from './entities';
import { tryItemDef } from '../../shared/data/items';

/**
 * Visual effects: block selection outline + crack overlay, particles
 * (block debris, blood, sparks, smoke), tracers, muzzle flashes,
 * explosions, rain/snow, first-person view model and building ghost.
 */
interface Particle {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  color: THREE.Color;
  gravity: number;
}

const MAX_PARTICLES = 3000;

export class Effects {
  readonly group = new THREE.Group();
  private outline: THREE.LineSegments;
  private crack: THREE.Mesh;
  private particles: Particle[] = [];
  private pGeo: THREE.BufferGeometry;
  private pPoints: THREE.Points;
  private tracers: Array<{ line: THREE.Line; life: number }> = [];
  private flashes: Array<{ light: THREE.PointLight; life: number }> = [];
  private rain: THREE.LineSegments;
  private snow: THREE.Points;
  private ghost = new THREE.Group();
  private ghostMats = { ok: new THREE.MeshBasicMaterial({ color: 0x40d0ff, transparent: true, opacity: 0.35, depthWrite: false }), bad: new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.35, depthWrite: false }) };
  private ghostKey = '';

  constructor() {
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.outline = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
    this.outline.visible = false;
    this.group.add(this.outline);
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.005, 1.005, 1.005), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
    this.crack.visible = false;
    this.group.add(this.crack);

    this.pGeo = new THREE.BufferGeometry();
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    this.pPoints = new THREE.Points(this.pGeo, new THREE.PointsMaterial({ size: 0.12, vertexColors: true, sizeAttenuation: true }));
    this.pPoints.frustumCulled = false;
    this.group.add(this.pPoints);

    // weather volumes around the camera
    const N = 1500;
    const rp = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 50, y = Math.random() * 40, z = (Math.random() - 0.5) * 50;
      rp.set([x, y, z, x, y - 0.7, z], i * 6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9ab0d0, transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.group.add(this.rain);
    const sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) sp.set([(Math.random() - 0.5) * 50, Math.random() * 40, (Math.random() - 0.5) * 50], i * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.85 }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.group.add(this.snow);
    this.group.add(this.ghost);
  }

  setTarget(x: number, y: number, z: number, crack: number) {
    this.outline.visible = true;
    this.outline.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.crack.visible = crack > 0;
    this.crack.position.copy(this.outline.position);
    (this.crack.material as THREE.MeshBasicMaterial).opacity = crack * 0.5;
  }

  clearTarget() {
    this.outline.visible = false;
    this.crack.visible = false;
  }

  burst(x: number, y: number, z: number, color: number | THREE.Color, n: number, speed = 3, size = 0.12, gravity = 12, life = 0.8) {
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      this.particles.push({
        p: new THREE.Vector3(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.6),
        v: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed),
        life: life * (0.5 + Math.random() * 0.5), max: life, size, color: c.clone().multiplyScalar(0.8 + Math.random() * 0.4), gravity,
      });
    }
  }

  blockBurst(x: number, y: number, z: number, blockId: number, n = 14) {
    const d = blockDef(blockId);
    this.burst(x, y, z, d.mapColor, n, 3.5);
  }

  explosion(x: number, y: number, z: number, radius: number) {
    this.burst(x, y, z, 0xffa030, 80, radius * 4, 0.25, 2, 0.5);
    this.burst(x, y, z, 0x555555, 120, radius * 2, 0.35, -1, 2.5);
    this.flash(x, y, z, 0xffa040, 12, 0.35, radius * 6);
  }

  flash(x: number, y: number, z: number, color: number, intensity: number, life: number, dist = 8) {
    const l = new THREE.PointLight(color, intensity, dist);
    l.position.set(x, y, z);
    this.group.add(l);
    this.flashes.push({ light: l, life });
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffe6a0) {
    const g = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
    this.group.add(line);
    this.tracers.push({ line, life: 0.08 });
  }

  /** Building plan ghost. */
  setGhost(socket: Socket | null, ok: boolean) {
    if (!socket) {
      this.ghost.visible = false;
      return;
    }
    const key = JSON.stringify(socket) + ok;
    this.ghost.visible = true;
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    this.ghost.clear();
    const geo = pieceGeometry(socket);
    const m = ok ? this.ghostMats.ok : this.ghostMats.bad;
    const bg = new THREE.BoxGeometry(1, 1, 1);
    for (const [x, y, z] of geo.cells) {
      const b = new THREE.Mesh(bg, m);
      b.position.set(x + 0.5, y + 0.5, z + 0.5);
      this.ghost.add(b);
    }
  }

  update(dt: number, cam: THREE.Vector3, rain: number, snow: boolean) {
    // particles
    const pos = this.pGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.pGeo.getAttribute('color') as THREE.BufferAttribute;
    let n = 0;
    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.v.y -= p.gravity * dt;
      p.v.multiplyScalar(1 - 1.5 * dt);
      p.p.addScaledVector(p.v, dt);
      pos.setXYZ(n, p.p.x, p.p.y, p.p.z);
      col.setXYZ(n, p.color.r, p.color.g, p.color.b);
      n++;
      alive.push(p);
    }
    this.particles = alive;
    this.pGeo.setDrawRange(0, n);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    for (const t of this.tracers) {
      t.life -= dt;
      if (t.life <= 0) {
        this.group.remove(t.line);
        t.line.geometry.dispose();
      }
    }
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const f of this.flashes) {
      f.life -= dt;
      f.light.intensity *= 0.8;
      if (f.life <= 0) this.group.remove(f.light);
    }
    this.flashes = this.flashes.filter((f) => f.life > 0);
    // weather
    const showRain = rain > 0.3 && !snow, showSnow = rain > 0.3 && snow;
    this.rain.visible = showRain;
    this.snow.visible = showSnow;
    const vol = showRain ? this.rain : showSnow ? this.snow : null;
    if (vol) {
      vol.position.set(cam.x, cam.y - 15, cam.z);
      const a = vol.geometry.getAttribute('position') as THREE.BufferAttribute;
      const fall = (showRain ? 28 : 2.5) * dt;
      const step = showRain ? 2 : 1;
      for (let i = 0; i < a.count; i += step) {
        let y = a.getY(i) - fall;
        if (y < 0) y += 40;
        a.setY(i, y);
        if (showRain) a.setY(i + 1, y - 0.7);
        else a.setX(i, a.getX(i) + Math.sin(y + i) * 0.01);
      }
      a.needsUpdate = true;
      (vol.material as THREE.Material).opacity = Math.min(0.85, (rain - 0.3) * 1.5);
    }
  }
}

/** First-person arm + held item, rendered in its own scene on top. */
export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  private root = new THREE.Group();
  private item = new THREE.Group();
  private arm: THREE.Mesh;
  private heldId = '';
  private swing = 0;
  private recoil = 0;
  private bob = 0;
  private light: THREE.DirectionalLight;
  private amb: THREE.AmbientLight;

  constructor() {
    this.arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.7), new THREE.MeshLambertMaterial({ color: 0xe0b48c }));
    this.arm.position.set(0, -0.05, 0.3);
    this.root.add(this.arm);
    this.root.add(this.item);
    this.root.position.set(0.42, -0.42, -0.6);
    this.scene.add(this.root);
    this.light = new THREE.DirectionalLight(0xffffff, 1.2);
    this.light.position.set(1, 2, 1);
    this.amb = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(this.light, this.amb);
  }

  setHeld(id: string) {
    if (id === this.heldId) return;
    this.heldId = id;
    this.item.clear();
    const d = id ? tryItemDef(id) : undefined;
    if (!d) return;
    const shape = d.icon.shape;
    const model = shape === 'block' ? new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: d.icon.c1 })) : heldModel(shape, d.icon.c1, d.icon.c2 ?? d.icon.c1);
    model.scale.setScalar(shape === 'block' ? 0.7 : 0.75);
    model.position.set(0.05, 0.02, -0.2);
    if (['axe', 'pick', 'hammer', 'blade', 'torch', 'spear'].includes(shape)) model.rotation.x = 0.9;
    this.item.add(model);
  }

  setSkin(color: number) {
    (this.arm.material as THREE.MeshLambertMaterial).color.setHex(color);
  }

  doSwing() {
    this.swing = 1;
  }

  doRecoil(amount = 1) {
    this.recoil = Math.min(1.5, this.recoil + amount);
  }

  update(dt: number, moving: number, brightness: number, aspect: number, aiming: boolean) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.bob += dt * moving * 9;
    this.swing = Math.max(0, this.swing - dt * 4);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    const s = Math.sin(this.swing * Math.PI);
    const ax = aiming ? 0.0 : 0.42, ay = aiming ? -0.3 : -0.42;
    this.root.position.set(ax + Math.sin(this.bob) * 0.02 * moving, ay + Math.abs(Math.cos(this.bob)) * 0.02 * moving - s * 0.1, -0.6 + this.recoil * 0.08);
    this.root.rotation.set(-s * 1.1 + this.recoil * 0.15, s * 0.3, 0);
    this.light.intensity = 0.4 + brightness * 0.9;
    this.amb.intensity = 0.25 + brightness * 0.45;
  }
}
