// Stand-in for the level scene: ground, boxes for the colliders, a sky colour.
import * as THREE from 'three';

export function buildLevelScene(LAYOUT) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6b5a6e);
  scene.fog = new THREE.Fog(0x6b5a6e, 60, 360);
  const hemi = new THREE.HemisphereLight(0xffd2a0, 0x2a2430, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb070, 1.2);
  sun.position.set(-1, 0.4, 0.6);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), new THREE.MeshLambertMaterial({ color: 0x4d5a32 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const mat = new THREE.MeshLambertMaterial({ color: 0x8a7f74 });
  for (const c of LAYOUT.colliders) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(c.h[0] * 2, c.h[1] * 2, c.h[2] * 2), mat);
    m.position.set(c.c[0], c.c[1], c.c[2]);
    m.rotation.y = c.yaw || 0;
    scene.add(m);
  }
  const T = LAYOUT.tower;
  for (const [x, z] of T.legs) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, T.cabin.floorY, 0.25), mat);
    leg.position.set(x * 0.85, T.cabin.floorY / 2, z * 0.85);
    scene.add(leg);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(T.cabin.half[0] * 2, 0.2, T.cabin.half[1] * 2), mat);
  floor.position.set(0, T.cabin.floorY, 0);
  scene.add(floor);
  const traps = new Set();
  return {
    scene, sunDir: new THREE.Vector3(-1, 0.4, 0.6).normalize(),
    update() {},
    setTimeOfDay(t) {
      const c = new THREE.Color(0x6b5a6e).lerp(new THREE.Color(0x0c1020), t);
      scene.background.copy(c);
      scene.fog.color.copy(c);
      hemi.intensity = 1.6 - 1.2 * t;
      sun.intensity = 1.2 - 1.1 * t;
    },
    setRain() {},
    addFloodlight() {},
    removeFloodlight() {},
    placeTrapMesh(kind, pos, yaw) {
      const geo = kind === 'wire' ? new THREE.BoxGeometry(6, 0.5, 0.2) : kind === 'barrel' ? new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10) : new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10);
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: kind === 'barrel' ? 0xa02020 : 0x666666 }));
      m.position.set(pos.x, kind === 'barrel' ? 0.45 : 0.1, pos.z);
      m.rotation.y = yaw || 0;
      scene.add(m);
      traps.add(m);
      return m;
    },
    removeTrapMesh(m) {
      scene.remove(m);
      traps.delete(m);
    },
    gateMesh() {
      return { setDamage() {}, break() {} };
    },
    scare() {},
  };
}
