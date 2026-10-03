// Renderer, lighting and environment shared by the game and the model viewer.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface RendererOptions {
  canvas?: HTMLCanvasElement;
  antialias?: boolean;
  pixelRatio?: number;
  preserveDrawingBuffer?: boolean;
}

export function createRenderer(o: RendererOptions = {}): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas: o.canvas,
    antialias: o.antialias ?? true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: o.preserveDrawingBuffer ?? false,
  });
  renderer.setPixelRatio(o.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

export interface Lights {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fill: THREE.DirectionalLight;
  envTexture: THREE.Texture;
}

/**
 * Warm, soft "afternoon kitchen" lighting: a sun key light with soft shadows, a sky/ground
 * hemisphere, a cool fill from the camera side and a room environment for gentle reflections.
 */
export function setupLights(scene: THREE.Scene, renderer: THREE.WebGLRenderer, opts: { shadowSize?: number; envIntensity?: number } = {}): Lights {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = envTexture;
  scene.environmentIntensity = opts.envIntensity ?? 0.55;

  const hemi = new THREE.HemisphereLight(0xfff4e6, 0xc9a98a, 1.15);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0dc, 2.4);
  sun.position.set(-2.2, 4.2, 3.0);
  sun.castShadow = true;
  const size = opts.shadowSize ?? 2048;
  sun.shadow.mapSize.set(size, size);
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.012;
  const cam = sun.shadow.camera;
  cam.near = 0.5;
  cam.far = 12;
  cam.left = -3;
  cam.right = 3;
  cam.top = 3;
  cam.bottom = -3;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.55);
  fill.position.set(2.5, 2.0, 4.0);
  scene.add(fill);

  return { sun, hemi, fill, envTexture };
}

/** Fit the sun's shadow camera around a region (centre + half extent), keeping texel density high. */
export function focusShadow(sun: THREE.DirectionalLight, center: THREE.Vector3, halfExtent: number) {
  const dir = sun.position.clone().sub(sun.target.position).normalize();
  sun.target.position.copy(center);
  sun.position.copy(center).addScaledVector(dir, 6);
  const cam = sun.shadow.camera;
  cam.left = -halfExtent;
  cam.right = halfExtent;
  cam.top = halfExtent;
  cam.bottom = -halfExtent;
  cam.near = 0.5;
  cam.far = 14;
  cam.updateProjectionMatrix();
  sun.target.updateMatrixWorld();
}

/** Soft radial "contact shadow" texture used for blob shadows under items. */
let blobTex: THREE.Texture | null = null;
export function blobShadowTexture(): THREE.Texture {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(40,24,16,0.55)');
  g.addColorStop(0.45, 'rgba(40,24,16,0.28)');
  g.addColorStop(1, 'rgba(40,24,16,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  blobTex = new THREE.CanvasTexture(c);
  blobTex.colorSpace = THREE.SRGBColorSpace;
  return blobTex;
}

export function makeBlobShadow(radius: number, opacity = 1): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, opacity, toneMapped: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  m.userData.noPick = true;
  return m;
}
