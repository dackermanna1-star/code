// Stand-in effects: tracer lines and a flash for explosions.
import * as THREE from 'three';

export class TowerFx {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }
  add(obj, life) {
    this.scene.add(obj);
    this.items.push({ obj, life, t: 0 });
  }
  update(dt) {
    for (const it of this.items) {
      it.t += dt;
      if (it.obj.material) it.obj.material.opacity = Math.max(0, 1 - it.t / it.life);
    }
    for (const it of this.items.filter((x) => x.t >= x.life)) {
      this.scene.remove(it.obj);
      it.obj.geometry.dispose();
    }
    this.items = this.items.filter((x) => x.t < x.life);
  }
  tracer(a, b) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, a.y - 0.1, a.z), new THREE.Vector3(b.x, b.y, b.z)]);
    this.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true })), 0.25);
  }
  explosion(p, power) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.5 * power, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true }));
    m.position.set(p.x, p.y, p.z);
    this.add(m, 0.5);
  }
  fire() {}
  gasCloud() {}
  muzzle() {}
  impact() {}
  bloodMist() {}
  dust() {}
  shellCasing() {}
}
