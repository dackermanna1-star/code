// The classic 2008 head: a cylinder with rounded edges (the "head" mesh on a
// 2x1x1 part) and the curved patch the face decal sits on. Shared by the
// character rig and by hats that are made of extra heads (Headstack, Headrow...).
import * as THREE from 'three';
import { faceTexture } from './textures.js';
export { faceTexture };

let headGeo = null;
export function headGeometry() {
  if (headGeo) return headGeo;
  // Rounded cylinder ~1.2 studs wide/tall (2x1x1 part with head mesh scaled 1.25).
  const R = 0.62, H = 0.62, r = 0.2;
  const pts = [];
  pts.push(new THREE.Vector2(0, -H));
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(R - r + Math.cos(a) * r, -H + r + Math.sin(a) * r));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(R - r + Math.cos(a) * r, H - r + Math.sin(a) * r));
  }
  pts.push(new THREE.Vector2(0, H));
  headGeo = new THREE.LatheGeometry(pts, 28);
  return headGeo;
}

let faceGeo = null;
export function faceGeometry() {
  if (faceGeo) return faceGeo;
  // A front-facing curved patch slightly outside the head cylinder.
  const g = new THREE.CylinderGeometry(0.635, 0.635, 1.2, 24, 1, true, Math.PI - Math.PI * 0.42, Math.PI * 0.84);
  // remap uvs so the whole decal spans the patch
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i));
  faceGeo = g;
  return g;
}

/** A complete classic head (yellow unless a colour is given) with the default face. */
export function classicHead(color = 0xf5cd30) {
  const head = new THREE.Mesh(headGeometry(), new THREE.MeshPhongMaterial({ color: new THREE.Color(color), shininess: 14, specular: 0x1c1c1c }));
  head.add(new THREE.Mesh(faceGeometry(), new THREE.MeshPhongMaterial({ map: faceTexture(), transparent: true, depthWrite: false, shininess: 10 })));
  return head;
}
