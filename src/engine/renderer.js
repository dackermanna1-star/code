// three.js setup in the spirit of the GoldSrc OpenGL renderer: no AA, no tone
// mapping, gamma-space colour, 90° horizontal FOV at 4:3 (Hor+ on widescreen),
// separate depth-cleared pass for the view model.

import * as THREE from 'three';
import { DEG } from './coords.js';

THREE.ColorManagement.enabled = false;

export const VIDEO_MODES = {
  native: null,
  '640x480': [640, 480],
  '800x600': [800, 600],
  '1024x768': [1024, 768],
  '1280x960': [1280, 960],
};

const VFOV_43 = 2 * Math.atan(Math.tan(45 * DEG) * 3 / 4) / DEG; // 73.74°

export class Renderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(1);
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game-canvas';
    container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.world = new THREE.Group();
    this.world.rotation.x = -Math.PI / 2;
    this.world.updateMatrix();
    this.world.matrixAutoUpdate = false;
    this.scene.add(this.world);

    this.camera = new THREE.PerspectiveCamera(VFOV_43, 4 / 3, 4, 16384);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(VFOV_43, 4 / 3, 1, 400);

    this.settings = { mode: 'native', aspect: 'fill', fov: 90, scale: 1 };
    this.zoomFov = 0; // horizontal fov override when scoped
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  configure(opts) {
    Object.assign(this.settings, opts);
    this.resize();
  }

  resize() {
    const cw = this.container.clientWidth || window.innerWidth;
    const ch = this.container.clientHeight || window.innerHeight;
    let vw = cw, vh = ch;
    if (this.settings.aspect === '4:3') {
      if (cw / ch > 4 / 3) { vw = Math.round(ch * 4 / 3); vh = ch; } else { vw = cw; vh = Math.round(cw * 3 / 4); }
    }
    const mode = VIDEO_MODES[this.settings.mode];
    let rw = vw, rh = vh;
    if (mode) {
      // keep the mode's height, widen for the display aspect
      rh = mode[1];
      rw = Math.round(rh * vw / vh);
    } else {
      rw = Math.round(vw * this.settings.scale);
      rh = Math.round(vh * this.settings.scale);
    }
    this.renderer.setSize(rw, rh, false);
    this.canvas.style.width = vw + 'px';
    this.canvas.style.height = vh + 'px';
    this.canvas.style.left = Math.round((cw - vw) / 2) + 'px';
    this.canvas.style.top = Math.round((ch - vh) / 2) + 'px';
    this.viewport = { x: Math.round((cw - vw) / 2), y: Math.round((ch - vh) / 2), w: vw, h: vh, rw, rh };
    this.aspect = rw / rh;
    this.updateFov();
    if (this.onResize) this.onResize(this.viewport);
  }

  updateFov() {
    const hfov = this.zoomFov || this.settings.fov || 90;
    // fov is defined at 4:3; Hor+ keeps the vertical fov for wider screens
    const vfov = 2 * Math.atan(Math.tan(hfov / 2 * DEG) * 3 / 4) / DEG;
    this.camera.fov = vfov;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.vmCamera.fov = VFOV_43;
    this.vmCamera.aspect = this.aspect;
    this.vmCamera.updateProjectionMatrix();
  }

  setZoom(hfov) {
    if (this.zoomFov === hfov) return;
    this.zoomFov = hfov;
    this.updateFov();
  }

  // eye in GoldSrc coords; angles GoldSrc degrees
  setView(eye, pitch, yaw, roll = 0) {
    this.eye = eye;
    const c = this.camera;
    c.position.set(eye[0], eye[2], -eye[1]);
    c.rotation.set(-pitch * DEG, (yaw - 90) * DEG, roll * DEG, 'YXZ');
    c.updateMatrixWorld();
  }

  render(drawViewModel = true) {
    const r = this.renderer;
    r.clear(true, true, true);
    r.render(this.scene, this.camera);
    if (drawViewModel) {
      r.clearDepth();
      r.render(this.vmScene, this.vmCamera);
    }
  }
}
