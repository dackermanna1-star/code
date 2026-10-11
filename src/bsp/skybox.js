// GoldSrc skybox (env/<name>{rt,lf,bk,ft,up,dn}.tga) drawn as six textured
// quads around the eye. Face orientation follows the engine's R_DrawSkyBox:
// rt = +x, lf = -x, bk = +y, ft = -y, up = +z, dn = -z, each image seen from
// inside with +z up (up/dn: image top = -x / +x, image left = +y).
// The object lives in GoldSrc coordinates (add it to Renderer.world).
import * as THREE from 'three';

const D = 4096;
// corners in order: top-left, top-right, bottom-right, bottom-left (as seen from inside)
const FACES = {
  rt: [[D, D, D], [D, -D, D], [D, -D, -D], [D, D, -D]],
  lf: [[-D, -D, D], [-D, D, D], [-D, D, -D], [-D, -D, -D]],
  bk: [[-D, D, D], [D, D, D], [D, D, -D], [-D, D, -D]],
  ft: [[D, -D, D], [-D, -D, D], [-D, -D, -D], [D, -D, -D]],
  up: [[-D, D, D], [-D, -D, D], [D, -D, D], [D, D, D]],
  dn: [[D, D, -D], [D, -D, -D], [-D, -D, -D], [-D, D, -D]],
};

/** images: { rt, lf, bk, ft, up, dn } -> canvases or ImageData-like {width,height,data} (top row first) */
export function createSkybox(images) {
  const group = new THREE.Group();
  group.name = 'skybox';
  for (const [name, c] of Object.entries(FACES)) {
    let src = images[name];
    if (!src) continue;
    // canvases are read back into raw pixels: DataTexture uploads work on every
    // GL backend (canvas uploads come out black under SwiftShader)
    if (src instanceof HTMLCanvasElement) src = src.getContext('2d').getImageData(0, 0, src.width, src.height);
    const tex = new THREE.DataTexture(new Uint8Array(src.data.buffer, src.data.byteOffset, src.data.length), src.width, src.height, THREE.RGBAFormat);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    // data rows are top-down and DataTexture puts row 0 at v = 0, so v runs downward;
    // inset half a texel so the clamped edges don't bleed
    const e = 0.5 / src.width;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(c.flat(), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([e, e, 1 - e, e, 1 - e, 1 - e, e, 1 - e], 2));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    m.renderOrder = -1000;
    m.frustumCulled = false;
    group.add(m);
  }
  /** keep the box centred on the eye (GoldSrc coordinates) */
  group.userData.follow = (eye) => group.position.set(eye[0], eye[1], eye[2]);
  return group;
}
