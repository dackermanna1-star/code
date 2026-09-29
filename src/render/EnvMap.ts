import * as THREE from 'three';

/**
 * A tiny "diner" light-probe scene rendered into a PMREM environment map.
 * Gives chrome, steel, sauces and glossy buns believable warm reflections
 * with a bright window on one side and overhead panels.
 */
export class EnvMapper {
  private pmrem: THREE.PMREMGenerator;
  private scene = new THREE.Scene();
  private windowMat = new THREE.MeshBasicMaterial({ color: 0xbfe0ff });
  private panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private warmMat = new THREE.MeshBasicMaterial({ color: 0xffd6a0 });
  private wallMat = new THREE.MeshBasicMaterial({ color: 0x8a7563, side: THREE.BackSide });
  private floorMat = new THREE.MeshBasicMaterial({ color: 0x4a3c36 });
  private current: THREE.WebGLRenderTarget | null = null;

  constructor(renderer: THREE.WebGLRenderer) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    const room = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 12), this.wallMat);
    room.position.y = 2;
    this.scene.add(room);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.49;
    this.scene.add(floor);
    // ceiling light panels
    for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, 0]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), this.panelMat);
      p.rotation.x = Math.PI / 2;
      p.position.set(x, 4.45, z);
      this.scene.add(p);
    }
    // big window (sky) on +z wall
    const w = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.2), this.windowMat);
    w.position.set(0, 2.2, 5.95);
    w.rotation.y = Math.PI;
    this.scene.add(w);
    const w2 = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.0), this.windowMat);
    w2.position.set(5.95, 2.2, 0);
    w2.rotation.y = -Math.PI / 2;
    this.scene.add(w2);
    // warm pendant blobs
    for (const [x, z] of [[-2, 1], [2, 2], [0, -2]]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), this.warmMat);
      s.position.set(x, 3.2, z);
      this.scene.add(s);
    }
    // red accent (booths) + dark counter band for richer reflections
    const band = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.0), new THREE.MeshBasicMaterial({ color: 0x7a1c1c }));
    band.position.set(0, 0.2, -5.95);
    this.scene.add(band);
  }

  update(night: number, skyColor: THREE.Color): THREE.Texture {
    const day = 1 - night;
    this.windowMat.color.copy(skyColor).multiplyScalar(1.2 * day + 0.08);
    this.panelMat.color.setRGB(2.2, 2.2, 2.1);
    this.warmMat.color.setRGB(3.0, 2.2, 1.3).multiplyScalar(0.6 + night * 0.8);
    this.wallMat.color.setRGB(0.62, 0.56, 0.5).multiplyScalar(0.75 + day * 0.35);
    const rt = this.pmrem.fromScene(this.scene, 0.035);
    const old = this.current;
    this.current = rt;
    if (old) setTimeout(() => old.dispose(), 100);
    return rt.texture;
  }
}
