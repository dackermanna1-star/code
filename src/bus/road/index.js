// STUB — replaced by the road module. Draws a plain ribbon along the route.
import * as THREE from 'three';
export async function init(app) {
  const R = app.route, pos = [], idx = [];
  const STEP = 10;
  let ax = null, az = null;
  for (let s = 0, k = 0; s <= R.length; s += STEP, k++) {
    const hw = R.sample(s).type.halfW - 2;
    const a = R.pointAt(s, -hw), b = R.pointAt(s, hw);
    if (ax === null) { ax = a.x; az = a.z; }
    pos.push(a.x - ax, a.y + 0.02, a.z - az, b.x - ax, b.y + 0.02, b.z - az);
    if (k > 0) { const o = (k - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2c2d30, roughness: 0.9, side: THREE.DoubleSide }));
  mesh.position.set(ax, 0, az);
  mesh.frustumCulled = false;
  app.worldRoot.add(mesh);
  return { stub: true };
}
