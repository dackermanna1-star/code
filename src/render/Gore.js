// Blood: sprays and mist when soldiers are hit, bursts when a blast tears
// them apart, spurts from wound stumps, and decals on the ground (spatter,
// pools that spread under bodies, drip trails behind the wounded). Particles
// go through the battlefield effects pools; decals are one instanced mesh
// with a four-cell texture atlas.

import * as THREE from 'three';
import { FRAME } from './textures.js';

const rand = Math.random;
const rr = (a, b) => a + (b - a) * rand();

const CELL_SPATTER = 0;
const CELL_POOL = 1;
const CELL_SMEAR = 2;
const CELL_DROPS = 3;

// Blood colour (linear) for particles: fresh and darker as it dries.
const RED = [0.3, 0.012, 0.01];
const DARK = [0.14, 0.008, 0.006];

function bloodAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const blob = (x, y, r, a) => {
    ctx.fillStyle = `rgba(48,5,4,${a * 0.85})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Cells: canvas quadrant for atlas cell i (texture v runs bottom-up).
  const cell = (i) => [(i % 2) * 128, (1 - Math.floor(i / 2)) * 128];
  // 0: spatter, a splash with droplets thrown out.
  {
    const [ox, oy] = cell(CELL_SPATTER);
    for (let i = 0; i < 9; i++) blob(ox + 64 + rr(-14, 14), oy + 64 + rr(-14, 14), rr(8, 18), 0.85);
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2;
      const d = rr(20, 60);
      blob(ox + 64 + Math.cos(a) * d, oy + 64 + Math.sin(a) * d, rr(1, 4.5) * (1 - d / 80), 0.9);
    }
  }
  // 1: pool, a soft irregular disc, darker in the middle.
  {
    const [ox, oy] = cell(CELL_POOL);
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2;
      const d = rr(0, 26);
      blob(ox + 64 + Math.cos(a) * d, oy + 64 + Math.sin(a) * d, rr(18, 34), 0.55);
    }
    const g = ctx.createRadialGradient(ox + 64, oy + 64, 4, ox + 64, oy + 64, 50);
    g.addColorStop(0, 'rgba(26,3,2,0.6)');
    g.addColorStop(1, 'rgba(26,3,2,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ox, oy, 128, 128);
  }
  // 2: smear, streaks in one direction.
  {
    const [ox, oy] = cell(CELL_SMEAR);
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      ctx.strokeStyle = `rgba(46,5,4,${rr(0.35, 0.75)})`;
      ctx.lineWidth = rr(3, 10);
      const y = oy + 64 + rr(-22, 22);
      ctx.beginPath();
      ctx.moveTo(ox + rr(14, 34), y);
      ctx.lineTo(ox + rr(80, 116), y + rr(-8, 8));
      ctx.stroke();
    }
  }
  // 3: a few drops.
  {
    const [ox, oy] = cell(CELL_DROPS);
    for (let i = 0; i < 12; i++) blob(ox + 64 + rr(-34, 34), oy + 64 + rr(-34, 34), rr(2, 7), 0.9);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class BloodDecals {
  constructor(scene, terrain, max = 4000) {
    this.terrain = terrain;
    this.max = max;
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    this.cells = new Float32Array(max);
    this.aCell = new THREE.InstancedBufferAttribute(this.cells, 1);
    g.setAttribute('aCell', this.aCell);
    const mat = new THREE.MeshLambertMaterial({ map: bloodAtlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = 'attribute float aCell;\n' + shader.vertexShader.replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\n  vMapUv = vMapUv * 0.5 + vec2(mod(aCell, 2.0), floor(aCell / 2.0)) * 0.5;',
      );
    };
    mat.customProgramCacheKey = () => 'blood-decals';
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.next = 0;
    this.growing = [];
    this.obj = new THREE.Object3D();
    this.n = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
  }

  // y: surface height (rooftops); null means the terrain under (x, z).
  add(x, y, z, size, cell, grow = 0) {
    const t = this.terrain;
    const g = t.heightAt(x, z);
    const onGround = y === null || y === undefined || Math.abs(y - g) < 0.4;
    const d = {
      i: this.next,
      x,
      y: (onGround ? g : y) + 0.04,
      z,
      rot: rand() * Math.PI * 2,
      size: grow > 0 ? size * 0.12 : size,
      target: size,
      rate: grow > 0 ? size / grow : 0,
      ground: onGround,
    };
    this.next = (this.next + 1) % this.max;
    this.mesh.count = Math.max(this.mesh.count, d.i + 1);
    this.cells[d.i] = cell;
    const shade = rr(0.75, 1.05);
    this.mesh.instanceColor.setXYZ(d.i, shade, shade, shade);
    this.mesh.instanceColor.needsUpdate = true;
    this.aCell.needsUpdate = true;
    this.place(d);
    if (grow > 0) {
      for (let k = this.growing.length - 1; k >= 0; k--) if (this.growing[k].i === d.i) this.growing.splice(k, 1);
      this.growing.push(d);
    }
  }

  place(d) {
    const o = this.obj;
    o.position.set(d.x, d.y, d.z);
    if (d.ground) this.terrain.normalAt(d.x, d.z, this.n);
    else this.n.set(0, 1, 0);
    o.quaternion.setFromUnitVectors(this.up, this.n);
    o.rotateY(d.rot);
    o.scale.set(d.size, 1, d.size);
    o.updateMatrix();
    this.mesh.setMatrixAt(d.i, o.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    for (let k = this.growing.length - 1; k >= 0; k--) {
      const d = this.growing[k];
      d.size = Math.min(d.target, d.size + d.rate * dt * (d.size < d.target * 0.5 ? 1.4 : 0.7));
      this.place(d);
      if (d.size >= d.target) this.growing.splice(k, 1);
    }
  }
}

export class Gore {
  constructor(scene, terrain, effects) {
    this.terrain = terrain;
    this.fx = effects;
    this.decals = new BloodDecals(scene, terrain);
    this.on = true;
    this.dripT = 0;
    this._near = [];
  }

  drop(x, y, z, vx, vy, vz, size, life) {
    const fx = this.fx;
    fx.emit(fx.fx, { x, y, z, vx, vy, vz, k: 0, tx: 0, ty: -9.8, tz: 0, life, s0: size, s1: size * 0.8, c: [RED[0], RED[1], RED[2], 1], c1: [DARK[0], DARK[1], DARK[2], 0.9], frame: FRAME.SPARK, stretch: 0.35, fadeIn: 0.01 });
  }

  mist(x, y, z, vx, vy, vz, size, life, alpha = 0.7) {
    const fx = this.fx;
    fx.emit(fx.fx, { x, y, z, vx, vy, vz, k: 3, tx: fx.windX * 0.3, ty: -0.6, tz: fx.windZ * 0.3, life, s0: size * 0.3, s1: size, spin: rr(-1, 1), c: [RED[0], RED[1], RED[2], alpha], c1: [DARK[0] * 1.4, DARK[1], DARK[2], 0], frame: FRAME.SMOKE_A, fadeIn: 0.02 });
  }

  // A bullet wound: a puff at the entry, droplets thrown on through the body,
  // often a spatter on the ground behind.
  hit(x, y, z, dx, dy, dz, heavy) {
    const l = this.fx.lod(x, y, z);
    if (l <= 0) return;
    const k = heavy ? 1.8 : 1;
    this.mist(x, y, z, dx * 1.5 + rr(-0.3, 0.3), dy * 1.5 + 0.3, dz * 1.5 + rr(-0.3, 0.3), 0.45 * k, rr(0.3, 0.5));
    if (l > 0.4) {
      this.mist(x + dx * 0.2, y, z + dz * 0.2, dx * 3, dy * 2 + 0.2, dz * 3, 0.6 * k, rr(0.35, 0.6), 0.5);
      const n = Math.round((heavy ? 10 : 5) * l);
      for (let i = 0; i < n; i++) {
        const s = rr(2, 5) * k;
        this.drop(x, y, z, dx * s + rr(-1, 1), dy * s + rr(0, 1.5), dz * s + rr(-1, 1), rr(0.025, 0.05) * k, rr(0.4, 0.8));
      }
    }
    if (rand() < (heavy ? 0.7 : 0.3)) {
      const d = rr(0.6, 2.4) * k;
      this.decals.add(x + dx * d, null, z + dz * d, rr(0.35, 0.7) * k, rand() < 0.6 ? CELL_SPATTER : CELL_SMEAR);
    }
  }

  // A soldier torn apart by a blast.
  burst(x, y, z, limbs) {
    const l = this.fx.lod(x, y, z);
    if (l <= 0) return;
    for (let i = 0; i < 5 + limbs * 2; i++) this.mist(x + rr(-0.4, 0.4), y + rr(-0.3, 0.5), z + rr(-0.4, 0.4), rr(-3, 3), rr(0, 3), rr(-3, 3), rr(0.8, 1.6), rr(0.5, 0.9), 0.6);
    const n = Math.round((25 + limbs * 12) * Math.max(0.4, l));
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const s = rr(2, 8);
      this.drop(x, y, z, Math.cos(a) * s, rr(1, 6), Math.sin(a) * s, rr(0.03, 0.07), rr(0.5, 1.1));
    }
    for (let i = 0; i < 2 + limbs; i++) {
      const a = rand() * Math.PI * 2;
      const d = rr(0.3, 3);
      this.decals.add(x + Math.cos(a) * d, null, z + Math.sin(a) * d, rr(0.6, 1.4), rand() < 0.5 ? CELL_SPATTER : CELL_DROPS);
    }
  }

  // Arterial spurt from a stump; k fades it out.
  spurt(x, y, z, vx, vy, vz, k) {
    if (this.fx.lod(x, y, z) <= 0) return;
    for (let i = 0; i < 2; i++) this.drop(x, y, z, vx + rr(-0.3, 0.3), vy + rr(-0.2, 0.3), vz + rr(-0.3, 0.3), rr(0.025, 0.045), rr(0.35, 0.6));
    if (rand() < 0.06 * k) this.decals.add(x + vx * 0.4, null, z + vz * 0.4, rr(0.15, 0.3), CELL_DROPS);
  }

  // Blood spreading out under a body.
  pool(x, y, z, size, grow) {
    this.decals.add(x, y, z, size, CELL_POOL, grow);
  }

  update(dt, world, cam) {
    this.decals.update(dt);
    // Wounded soldiers leave drops where they walk.
    this.dripT -= dt;
    if (this.dripT > 0 || dt <= 0) return;
    this.dripT = 0.4;
    const near = world.unitGrid.queryRadius(cam.x, cam.z, 110, this._near);
    for (let i = 0; i < near.length; i++) {
      const u = near[i];
      if (u.cat !== 'inf' || !u.alive || u.downed || u.mounted || u.hidden) continue;
      if (!(u.bleed > 0) && !u.wounded) continue;
      if (u.speed > 0.4 ? rand() < (u.bleed > 0 ? 0.7 : 0.25) : rand() < 0.08) {
        this.decals.add(u.pos.x + rr(-0.2, 0.2), u.roof ? u.pos.y : null, u.pos.z + rr(-0.2, 0.2), rr(0.12, 0.28), CELL_DROPS);
        this.drop(u.pos.x, u.pos.y + 0.9, u.pos.z, rr(-0.2, 0.2), 0, rr(-0.2, 0.2), 0.03, 0.4);
      }
    }
  }
}
