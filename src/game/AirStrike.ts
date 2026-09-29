import * as THREE from 'three';
import { G } from '../core/G';
import { rand } from '../core/math';
import { C, mat } from '../weapons/ModelBuilder';

interface Bomb {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
}

/** Captain Miller's call-in: a jet drops a line of bombs on the horde. */
export class AirStrike {
  private plane: THREE.Group;
  private active = false;
  private t = 0;
  private start = new THREE.Vector3();
  private end = new THREE.Vector3();
  private dropAt: number[] = [];
  private bombs: Bomb[] = [];
  private dropped = 0;

  constructor(private scene: THREE.Scene) {
    const g = new THREE.Group();
    const add = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
    };
    add(1.4, 1.4, 11, 0, 0, 0, 0x5a626a);
    add(12, 0.25, 3, 0, 0, 0.5, 0x4a525a);
    add(4.5, 0.2, 1.6, 0, 0.3, 4.6, 0x4a525a);
    add(0.2, 2.2, 1.8, 0, 1.2, 4.6, 0x4a525a);
    add(0.9, 0.7, 2, 0, 0.7, -2.8, 0x2a3a4a);
    add(0.9, 0.9, 0.6, 0, 0, 5.6, 0x303030);
    g.visible = false;
    scene.add(g);
    this.plane = g;
  }

  call() {
    if (this.active) return;
    const pl = G.player;
    const f = new THREE.Vector3(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw)).normalize();
    // target: the densest cluster ahead of the player
    let best = { x: pl.pos.x + f.x * 30, z: pl.pos.z + f.z * 30 };
    let bestN = 0;
    for (const z of G.zombies.list) {
      const dx = z.x - pl.pos.x;
      const dz = z.z - pl.pos.z;
      const along = dx * f.x + dz * f.z;
      if (along < 8) continue;
      let n = 0;
      for (const o of G.zombies.list) if ((o.x - z.x) ** 2 + (o.z - z.z) ** 2 < 36) n++;
      if (n > bestN) {
        bestN = n;
        best = { x: z.x, z: z.z };
      }
    }
    this.active = true;
    this.t = 0;
    this.dropped = 0;
    this.start.set(best.x - f.x * 160, 55, best.z - f.z * 160);
    this.end.set(best.x + f.x * 160, 55, best.z + f.z * 160);
    this.plane.visible = true;
    this.plane.position.copy(this.start);
    this.plane.lookAt(this.end);
    this.dropAt = [];
    for (let i = 0; i < 9; i++) this.dropAt.push(0.36 + i * 0.022);
    G.audio?.play('jet', { volume: 1 });
    G.hud?.banner?.('AIR STRIKE INBOUND', "Captain Miller's call-in", 2.2);
  }

  update(dt: number) {
    if (this.active) {
      this.t += dt / 3.2;
      const p = this.start.clone().lerp(this.end, this.t);
      this.plane.position.copy(p);
      while (this.dropped < this.dropAt.length && this.t >= this.dropAt[this.dropped]) {
        this.dropped++;
        const dir = this.end.clone().sub(this.start).normalize();
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 1.4), mat(C.DARK));
        m.position.copy(p).add(new THREE.Vector3(rand(-2, 2), -1.5, 0));
        this.scene.add(m);
        this.bombs.push({ mesh: m, vx: dir.x * 70, vy: -5, vz: dir.z * 70 });
      }
      if (this.t >= 1) {
        this.active = false;
        this.plane.visible = false;
      }
    }
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.vy -= 30 * dt;
      b.vx *= Math.exp(-dt * 0.9);
      b.vz *= Math.exp(-dt * 0.9);
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.z += b.vz * dt;
      b.mesh.lookAt(b.mesh.position.x + b.vx, b.mesh.position.y + b.vy, b.mesh.position.z + b.vz);
      if (b.mesh.position.y <= 0.3) {
        const x = b.mesh.position.x;
        const z = b.mesh.position.z;
        this.scene.remove(b.mesh);
        this.bombs.splice(i, 1);
        G.explosions.explode(x, 0.4, z, 7, 140, { source: 'player', player: true, gore: 1, big: true, weapon: 'airstrike', selfMul: 0.35 });
      }
    }
  }

  clear() {
    for (const b of this.bombs) this.scene.remove(b.mesh);
    this.bombs = [];
    this.active = false;
    this.plane.visible = false;
  }
}
