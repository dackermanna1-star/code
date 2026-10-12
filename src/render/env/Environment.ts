// The whole static environment: backdrop (sky, iceberg, far sea), the ice
// floe, scene lighting / shadows / environment map, the ice reflections and
// the blood/scorch decal hook.
//
// Two layers (see docs/RESEARCH.md section 9):
//  1. Backdrop: its own scene + near-horizontal camera, rendered into a
//     render target that becomes `scene.background`. Refreshed one strip per
//     frame (scissored), so slow cloud drift costs a few % of a render.
//  2. Gameplay: the floe lives in the Stage scene and is seen by the 32-degree
//     gameplay camera. The ice shader samples the backdrop target mirrored
//     about the floe's back edge (iceberg reflection) and a half-resolution
//     planar mirror pass of REFLECT_LAYER objects (character reflections).
import * as THREE from 'three';
import type { Stage } from '../Stage';
import {
  FLOE_BACK_SCREEN,
  FLOE_OUTLINE,
  WATER_LEVEL,
  pointInFloe,
  type XZ,
} from '../../config/field';
import { Backdrop } from './Backdrop';
import { buildFloeTopGeometry, buildFloeWallGeometry, createCliffMaterial, createFrontSea, createOutlineMeshes } from './Floe';
import { createIceMaterial, createIceUniforms, MIRROR_SAMPLES, type IceUniforms } from './IceMaterial';
import { PlanarReflection } from './PlanarReflection';
import { createSkyMaterial } from './Sky';

export interface DecalRect {
  minX: number;
  minZ: number;
  sizeX: number;
  sizeZ: number;
}

export type EnvQuality = 'low' | 'medium' | 'high';

interface QualitySettings {
  backdropScale: number;
  backdropStrips: number;
  reflections: boolean;
  reflectionScale: number;
  shadowMapSize: number;
  shadowRadius: number;
}

const QUALITY: Record<EnvQuality, QualitySettings> = {
  low: { backdropScale: 0.5, backdropStrips: 0, reflections: false, reflectionScale: 0.5, shadowMapSize: 1024, shadowRadius: 2 },
  medium: { backdropScale: 0.75, backdropStrips: 24, reflections: true, reflectionScale: 0.5, shadowMapSize: 1536, shadowRadius: 3 },
  high: { backdropScale: 1, backdropStrips: 16, reflections: true, reflectionScale: 0.5, shadowMapSize: 2048, shadowRadius: 3 },
};

/** Direction towards the key light: upper left, slightly behind the floe. */
const SUN_DIR = new THREE.Vector3(-0.5, 0.8, -0.35).normalize();
/** Region the sun's shadow map covers (world XZ) and the height range of casters. */
const SHADOW_BOX = new THREE.Box3(new THREE.Vector3(-24, -0.5, -18), new THREE.Vector3(24, 4, 18));

export class Environment {
  readonly waterLevel = WATER_LEVEL;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly outline: Array<[number, number]> = FLOE_OUTLINE.map(([x, z]) => [x, z] as [number, number]);
  /** Everything this class adds to the stage scene. */
  readonly group = new THREE.Group();
  readonly backdrop: Backdrop;
  readonly reflection: PlanarReflection | null;
  readonly ice: THREE.Mesh;
  readonly iceUniforms: IceUniforms;
  readonly quality: EnvQuality;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private emptyDecal: THREE.DataTexture;
  private disposed = false;
  private readonly settings: QualitySettings;

  constructor(
    private stage: Stage,
    opts: { quality?: EnvQuality } = {},
  ) {
    this.quality = opts.quality ?? 'high';
    this.settings = QUALITY[this.quality];
    const { renderer, scene, camera } = stage;
    this.group.name = 'Environment';
    scene.add(this.group);

    // ---- Lighting -------------------------------------------------------
    this.hemi = new THREE.HemisphereLight(0xd6dcf2, 0x7d8aa3, 2.2);
    this.group.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2e6, 2.3);
    this.sun.name = 'Sun';
    this.sun.target.position.set(0, 0, -1);
    this.sun.position.copy(this.sun.target.position).addScaledVector(SUN_DIR, 80);
    this.sun.castShadow = true;
    const sh = this.sun.shadow;
    sh.mapSize.set(this.settings.shadowMapSize, this.settings.shadowMapSize);
    sh.radius = this.settings.shadowRadius;
    sh.bias = -0.0004;
    sh.normalBias = 0.03;
    sh.intensity = 0.7;
    this.fitShadowCamera();
    this.group.add(this.sun, this.sun.target);

    // ---- Backdrop -------------------------------------------------------
    this.backdrop = new Backdrop({ scale: this.settings.backdropScale, strips: this.settings.backdropStrips });
    scene.background = this.backdrop.texture;

    // ---- Environment map (PMREM of a cloudless version of the sky) -------
    this.buildEnvMap(renderer, scene);

    // ---- Floe -----------------------------------------------------------
    this.emptyDecal = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    this.emptyDecal.needsUpdate = true;
    this.iceUniforms = createIceUniforms();
    const u = this.iceUniforms;
    u.uBackdrop.value = this.backdrop.texture;
    u.uDecalMap.value = this.emptyDecal;
    camera.updateMatrixWorld();
    u.uDesignVP.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.computeMirrorLine(u.uMirrorLine.value);
    this.updateAlbedoNorm();

    this.reflection = this.settings.reflections ? new PlanarReflection(this.settings.reflectionScale) : null;
    if (this.reflection) {
      u.uReflMap.value = this.reflection.target.texture;
      u.uReflMatrix.value = this.reflection.textureMatrix;
      u.uReflStrength.value = 0.17;
    }

    this.ice = new THREE.Mesh(buildFloeTopGeometry(), createIceMaterial(u, { reflections: !!this.reflection }));
    this.ice.name = 'FloeTop';
    this.ice.receiveShadow = true;
    this.group.add(this.ice);

    const walls = new THREE.Mesh(buildFloeWallGeometry(), createCliffMaterial());
    walls.name = 'FloeWalls';
    this.group.add(walls);

    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    for (const m of createOutlineMeshes(camPos)) this.group.add(m);
    this.group.add(createFrontSea());

    // ---- Offscreen passes -----------------------------------------------
    stage.onResize(() => this.resize());
    stage.onPreRender((_dt, time) => {
      if (this.disposed) return;
      this.backdrop.update(renderer, time);
      if (this.reflection) this.reflection.render(renderer, scene, camera);
    });
  }

  /** Blood/scorch decal texture (RGBA, premultiplied alpha) covering `rect` of the ice top (world XZ). */
  setDecalMap(tex: THREE.Texture, rect: DecalRect): void {
    this.iceUniforms.uDecalMap.value = tex ?? this.emptyDecal;
    this.iceUniforms.uDecalRect.value.set(rect.minX, rect.minZ, rect.sizeX, rect.sizeZ);
  }

  /** True if (x,z) is on the floe top surface (inside the outline). */
  isOnFloe(x: number, z: number): boolean {
    return pointInFloe(x, z, this.outline as XZ[]);
  }

  /** Per-frame update (animations). Offscreen passes run from stage.onPreRender. */
  update(_dt: number, time: number): void {
    this.iceUniforms.uTime.value = time;
  }

  dispose(): void {
    this.disposed = true;
    const scene = this.stage.scene;
    if (scene.background === this.backdrop.texture) scene.background = null;
    if (this.envTarget && scene.environment === this.envTarget.texture) scene.environment = null;
    scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    this.sun.shadow.map?.dispose();
    this.backdrop.dispose();
    this.reflection?.dispose();
    this.envTarget?.dispose();
    this.emptyDecal.dispose();
  }

  // ---------------------------------------------------------------------

  private resize(): void {
    const size = this.stage.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.backdrop.setSize(size.x, size.y);
    if (this.reflection) {
      this.reflection.setSize(size.x, size.y);
      this.iceUniforms.uReflTexel.value.set(1 / this.reflection.target.width, 1 / this.reflection.target.height);
    }
  }

  /** Fit the sun's orthographic shadow camera tightly around SHADOW_BOX. */
  private fitShadowCamera(): void {
    const cam = this.sun.shadow.camera;
    const view = new THREE.Matrix4().lookAt(this.sun.position, this.sun.target.position, new THREE.Vector3(0, 1, 0));
    view.setPosition(this.sun.position);
    const inv = view.clone().invert();
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const p = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? SHADOW_BOX.max.x : SHADOW_BOX.min.x, i & 2 ? SHADOW_BOX.max.y : SHADOW_BOX.min.y, i & 4 ? SHADOW_BOX.max.z : SHADOW_BOX.min.z);
      p.applyMatrix4(inv);
      min.min(p);
      max.max(p);
    }
    cam.left = min.x;
    cam.right = max.x;
    cam.bottom = min.y;
    cam.top = max.y;
    cam.near = Math.max(0.5, -max.z - 5);
    cam.far = -min.z + 5;
    cam.updateProjectionMatrix();
  }

  /** Per-channel albedo scale so unshadowed, up-facing ice shows its painted colour. */
  private updateAlbedoNorm(): void {
    const e = new THREE.Vector3(this.hemi.color.r, this.hemi.color.g, this.hemi.color.b).multiplyScalar(this.hemi.intensity);
    const up = Math.max(0, SUN_DIR.y);
    e.x += this.sun.color.r * this.sun.intensity * up;
    e.y += this.sun.color.g * this.sun.intensity * up;
    e.z += this.sun.color.b * this.sun.intensity * up;
    this.iceUniforms.uAlbedoNorm.value.set(Math.PI / e.x, Math.PI / e.y, Math.PI / e.z);
  }

  /**
   * Screen-space line (GL uv y per frame u) about which the backdrop is
   * mirrored: the visible back edge (without the notch apex), smoothed.
   */
  private computeMirrorLine(out: Float32Array): void {
    const pts = FLOE_BACK_SCREEN.filter((_, i, a) => !(i > 0 && i < a.length - 1 && a[i][0] < a[i - 1][0]));
    const vAt = (u: number) => {
      for (let i = 1; i < pts.length; i++) {
        if (u <= pts[i][0]) {
          const [u0, v0] = pts[i - 1];
          const [u1, v1] = pts[i];
          return v0 + ((v1 - v0) * (u - u0)) / (u1 - u0);
        }
      }
      return pts[pts.length - 1][1];
    };
    const raw: number[] = [];
    for (let i = 0; i < MIRROR_SAMPLES; i++) raw.push(vAt(i / (MIRROR_SAMPLES - 1)));
    for (let i = 0; i < MIRROR_SAMPLES; i++) {
      let s = 0;
      let w = 0;
      for (let k = -1; k <= 1; k++) {
        const j = Math.min(MIRROR_SAMPLES - 1, Math.max(0, i + k));
        const wk = k === 0 ? 2 : 1;
        s += raw[j] * wk;
        w += wk;
      }
      // GL uv y, nudged up by the stroke width so the reflection starts at the line.
      out[i] = 1 - s / w + 0.002;
    }
  }

  private buildEnvMap(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    const envScene = new THREE.Scene();
    const skyMat = createSkyMaterial(true);
    // Below the horizon the characters mostly "see" the bright floe, not the sea.
    skyMat.uniforms.uSea.value.set(0.24, 0.29, 0.36);
    skyMat.uniforms.uSeaFar.value.set(0.4, 0.42, 0.52);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
    envScene.add(sky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = pmrem.fromScene(envScene, 0.02, 1, 1000, { size: this.quality === 'low' ? 64 : 128 });
    pmrem.dispose();
    sky.geometry.dispose();
    sky.material.dispose();
    scene.environment = this.envTarget.texture;
    scene.environmentIntensity = 0.6;
  }
}
