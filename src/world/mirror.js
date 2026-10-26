// Real-time mirrors (planar reflections) that can see the player's avatar.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { LAYER_AVATAR, LAYER_WORLD } from '../core/engine.js';
import { G } from '../game.js';

export const MIRRORS = [];

export function makeMirror(w, h, { res = 640, fogable = false } = {}) {
  const ratio = w / h;
  const tw = Math.round(res * Math.min(1, ratio)), th = Math.round(res * Math.min(1, 1 / ratio));
  const refl = new Reflector(new THREE.PlaneGeometry(w, h), { textureWidth: tw, textureHeight: th, clipBias: 0.002, color: 0x8a8d8f, multisample: 4 });
  refl.camera.layers.set(LAYER_WORLD);
  refl.camera.layers.enable(LAYER_AVATAR);
  const g = new THREE.Group();
  g.add(refl);
  let fog = null;
  if (fogable) {
    fog = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: '#eef3f6', transparent: true, opacity: 0, roughness: 1, depthWrite: false }));
    fog.position.z = 0.002;
    g.add(fog);
  }
  const m = { group: g, reflector: refl, fog, fogLevel: 0 };
  MIRRORS.push(m);
  return m;
}

export function updateMirrors(dt) {
  for (const m of MIRRORS) {
    if (m.fog) {
      m.fogLevel = Math.max(0, m.fogLevel - dt * 0.012);
      m.fog.material.opacity = Math.min(0.85, m.fogLevel);
      m.fog.visible = m.fogLevel > 0.01;
    }
  }
  void G;
}
