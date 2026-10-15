// Sky dome mesh (follows the camera, drawn first on the far plane) + an identical dome in a tiny scene used to
// bake the PMREM environment map for image-based lighting.
import * as THREE from 'three';
import { skyFragment, skyVertex } from './skyShader';

export class SkyDome {
  readonly uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uTurbidity: { value: 2.5 },
    uRayleigh: { value: 1.0 },
    uMieCoef: { value: 0.005 },
    uMieG: { value: 0.8 },
    uSkyScale: { value: 0.42 },
    uSkyIntensity: { value: 1 },
    uSkyGrey: { value: 0 },
    uNight: { value: 0 },
    uCloudCover: { value: 0.3 },
    uCloudDark: { value: 0 },
    uCloudTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.0002, 0.00007) },
    uFogColor: { value: new THREE.Color(0.6, 0.7, 0.8) },
    uFogDensity: { value: 0.0003 },
    uFogFalloff: { value: 0.006 },
    uCamPos: { value: new THREE.Vector3() },
    uGround: { value: new THREE.Color(0.16, 0.18, 0.12) },
    uStars: { value: 1 },
    uSunDisc: { value: 1 },
    tNoise: { value: null as THREE.Texture | null },
  };
  readonly mesh: THREE.Mesh;
  readonly envScene = new THREE.Scene();
  private readonly envMesh: THREE.Mesh;

  constructor(noise: THREE.Texture) {
    this.uniforms.tNoise.value = noise;
    const make = () =>
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: true,
        fog: false,
      });
    const geo = new THREE.SphereGeometry(1, 48, 24);
    this.mesh = new THREE.Mesh(geo, make());
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.matrixAutoUpdate = false;
    this.envMesh = new THREE.Mesh(geo, make());
    this.envMesh.scale.setScalar(50);
    this.envScene.add(this.envMesh);
  }

  /** Keep the dome centered on the camera (scale well inside the far plane). */
  follow(camera: THREE.PerspectiveCamera): void {
    const s = camera.far * 0.9;
    this.mesh.matrix.makeScale(s, s, s).setPosition(camera.position);
    this.mesh.matrixWorld.copy(this.mesh.matrix);
    this.uniforms.uCamPos.value.copy(camera.position);
  }
}
