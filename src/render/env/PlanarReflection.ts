// Planar mirror pass for the ice: renders only REFLECT_LAYER objects (characters,
// corpses, effects) from a camera mirrored about the plane y = 0 into a
// half-resolution target. The ice shader samples it through `textureMatrix`
// (blurred, low opacity). The maths follows three.js' Reflector, including the
// oblique near plane that clips anything below the ice.
import * as THREE from 'three';
import { REFLECT_LAYER } from '../Stage';

const _normal = new THREE.Vector3(0, 1, 0);
const _planePos = new THREE.Vector3(0, 0, 0);
const _camPos = new THREE.Vector3();
const _rot = new THREE.Matrix4();
const _lookAt = new THREE.Vector3();
const _view = new THREE.Vector3();
const _target = new THREE.Vector3();
const _plane = new THREE.Plane();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();

export class PlanarReflection {
  readonly target: THREE.WebGLRenderTarget;
  readonly camera = new THREE.PerspectiveCamera();
  /** World -> reflection texture coordinates (projective). */
  readonly textureMatrix = new THREE.Matrix4();
  private clearColor = new THREE.Color();

  constructor(private scale = 0.5) {
    this.target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.target.texture.name = 'IceReflectionRT';
    this.camera.layers.set(REFLECT_LAYER);
  }

  setSize(w: number, h: number): void {
    this.target.setSize(Math.max(4, Math.round(w * this.scale)), Math.max(4, Math.round(h * this.scale)));
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    _camPos.setFromMatrixPosition(camera.matrixWorld);
    _view.subVectors(_planePos, _camPos);
    if (_view.dot(_normal) > 0) return; // camera below the ice
    _view.reflect(_normal).negate().add(_planePos);

    _rot.extractRotation(camera.matrixWorld);
    _lookAt.set(0, 0, -1).applyMatrix4(_rot).add(_camPos);
    _target.subVectors(_planePos, _lookAt).reflect(_normal).negate().add(_planePos);

    const vc = this.camera;
    vc.position.copy(_view);
    vc.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_normal);
    vc.lookAt(_target);
    vc.near = camera.near;
    vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);

    // Oblique near plane = the ice plane, so nothing under the ice is mirrored.
    _plane.setFromNormalAndCoplanarPoint(_normal, _planePos).applyMatrix4(vc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pm = vc.projectionMatrix.elements;
    _q.x = (Math.sign(_clip.x) + pm[8]) / pm[0];
    _q.y = (Math.sign(_clip.y) + pm[9]) / pm[5];
    _q.z = -1.0;
    _q.w = (1.0 + pm[10]) / pm[14];
    _clip.multiplyScalar(2.0 / _clip.dot(_q));
    pm[2] = _clip.x;
    pm[6] = _clip.y;
    pm[10] = _clip.z + 1.0 - 0.003;
    pm[14] = _clip.w;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();

    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    const prevAutoClear = renderer.autoClear;
    const prevBg = scene.background;
    renderer.getClearColor(this.clearColor);
    const prevAlpha = renderer.getClearAlpha();

    scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.target);
    renderer.render(scene, vc);

    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(this.clearColor, prevAlpha);
    renderer.autoClear = prevAutoClear;
    renderer.shadowMap.autoUpdate = prevShadow;
    scene.background = prevBg;
  }

  dispose(): void {
    this.target.dispose();
  }
}
