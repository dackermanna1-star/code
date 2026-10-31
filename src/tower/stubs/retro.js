// Stand-in for the retro renderer: a plain renderer at a low pixel ratio.
import * as THREE from 'three';

export class RetroRenderer {
  constructor(parent) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(0.5);
    this.renderer.autoClear = false;
    parent.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.imageRendering = 'pixelated';
  }
  setQuality() {}
  setScopeBoost() {}
  setSize(w, h) {
    this.renderer.setSize(w, h);
  }
  render(scene, camera) {
    this.renderer.clear();
    this.renderer.render(scene, camera);
  }
  renderOverlay(scene, camera) {
    this.renderer.clearDepth();
    this.renderer.render(scene, camera);
  }
}
