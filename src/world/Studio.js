import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ContactShadows } from './ContactShadows.js';

/**
 * The "infinite white studio": a seamless white floor and background, soft
 * natural lighting and grounded contact shadows.  Nothing else.
 */
export class Studio {
  constructor(container) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    this.scene = scene;

    // Neutral studio reflections (skin speculars, eyes, leather, satin...)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.05, 200);

    // Soft sky/ground fill - bounce light from the white floor is warm and strong.
    const hemi = new THREE.HemisphereLight(0xffffff, 0xf3ece6, 1.15);
    scene.add(hemi);

    // Key light: high, front-left, slightly warm.  Casts the main shadow.
    const key = new THREE.DirectionalLight(0xfff4ea, 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -1.6; sc.right = 1.6; sc.top = 1.6; sc.bottom = -1.6; sc.near = 0.5; sc.far = 12;
    key.shadow.bias = -0.00025;
    key.shadow.normalBias = 0.012;
    key.shadow.radius = 4;
    scene.add(key, key.target);
    this.key = key;
    this.keyOffset = new THREE.Vector3(2.2, 5.0, 2.8);

    // Cool rim light from behind for shape definition.
    const rim = new THREE.DirectionalLight(0xe9f0ff, 1.1);
    rim.position.set(-2.5, 3.0, -3.5);
    scene.add(rim, rim.target);
    this.rim = rim;

    // Seamless floor: renders only the shadows on top of the white background.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.ShadowMaterial({ color: 0x3a3028, opacity: 0.22, depthWrite: false })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.renderOrder = -2;
    scene.add(floor);
    this.floor = floor;

    // Optional faint reference grid (toggle with G) to judge foot planting.
    const grid = new THREE.GridHelper(200, 200, 0xd9d9d9, 0xe9e9e9);
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    grid.material.depthWrite = false;
    grid.position.y = 0.0005;
    grid.renderOrder = -1;
    grid.visible = false;
    scene.add(grid);
    this.grid = grid;

    this.contact = new ContactShadows(renderer, scene);

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Keep the shadow frustum and contact shadow centred on the character. */
  follow(pos) {
    const t = this.key.target.position;
    // snap to shadow texels to avoid shimmering
    const texel = 3.2 / 2048;
    t.set(Math.round(pos.x / texel) * texel, 0.8, Math.round(pos.z / texel) * texel);
    this.key.position.copy(t).add(this.keyOffset);
    this.rim.target.position.copy(t);
    this.rim.position.copy(t).add(new THREE.Vector3(-2.5, 2.2, -3.5));
    this.contact.setCenter(pos);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.contact.update();
  }
}
