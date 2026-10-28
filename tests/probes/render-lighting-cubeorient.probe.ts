// Probe: verify the per-texel direction formula for RawCubeTexture faces (so a CPU sky gradient can be generated).
// Each texel stores its own direction (GL cube-map convention formula below); a SKYBOX_MODE box is viewed from inside
// and the decoded colour is compared with the actual camera ray direction at sampled pixels.
import {
  Vector3, FreeCamera, MeshBuilder, StandardMaterial, RawCubeTexture, Constants, Texture, Matrix, Viewport,
} from "@babylonjs/core";
import { makeEngine, readAll, renderFrames } from "./render-lighting-util.ts";

/** GL convention: face order +X,-X,+Y,-Y,+Z,-Z; s,t in [-1,1] from column/row (row 0 = first row in memory). */
export function cubeDir(face: number, s: number, t: number): [number, number, number] {
  switch (face) {
    case 0: return [1, -t, -s];
    case 1: return [-1, -t, s];
    case 2: return [s, 1, t];
    case 3: return [s, -1, -t];
    case 4: return [s, -t, 1];
    default: return [-s, -t, -1];
  }
}

export async function probe(): Promise<any> {
  const { engine, scene } = makeEngine();
  const cam = new FreeCamera("cam", new Vector3(0, 0, 0), scene);
  cam.minZ = 0.1;
  cam.maxZ = 1000;
  cam.fov = 1.2;
  const size = 32;
  const faces: Uint8Array[] = [];
  for (let f = 0; f < 6; f++) {
    const d = new Uint8Array(size * size * 4);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const s = (2 * (col + 0.5)) / size - 1;
        const t = (2 * (row + 0.5)) / size - 1;
        const v = new Vector3(...cubeDir(f, s, t)).normalize();
        const i = (row * size + col) * 4;
        d[i] = Math.round((v.x * 0.5 + 0.5) * 255);
        d[i + 1] = Math.round((v.y * 0.5 + 0.5) * 255);
        d[i + 2] = Math.round((v.z * 0.5 + 0.5) * 255);
        d[i + 3] = 255;
      }
    }
    faces.push(d);
  }
  const raw = new RawCubeTexture(scene, faces, size, Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_UNSIGNED_BYTE, false, false, Texture.NEAREST_SAMPLINGMODE);
  raw.coordinatesMode = Texture.SKYBOX_MODE;
  const box = MeshBuilder.CreateBox("sky", { size: 100, sideOrientation: 1 }, scene);
  const m = new StandardMaterial("m", scene);
  m.backFaceCulling = false;
  m.disableLighting = true;
  m.reflectionTexture = raw;
  box.material = m;
  box.infiniteDistance = true;

  const targets = [new Vector3(1, 0.2, 0.3), new Vector3(-1, -0.3, 0.2), new Vector3(0.2, 1, 0.1), new Vector3(0.1, -1, 0.3), new Vector3(0.3, 0.2, 1), new Vector3(-0.2, 0.3, -1)];
  const results: any[] = [];
  let worst = 1;
  for (const tgt of targets) {
    cam.setTarget(tgt);
    await scene.whenReadyAsync();
    await renderFrames(scene, 2);
    const fb = await readAll(engine);
    for (const [x, y] of [[640, 360], [200, 120], [1100, 600], [1000, 150], [300, 650]]) {
      const i = ((fb.h - 1 - y) * fb.w + x) * 4;
      const dec = new Vector3(fb.data[i] / 127.5 - 1, fb.data[i + 1] / 127.5 - 1, fb.data[i + 2] / 127.5 - 1).normalize();
      // actual ray direction through pixel (x,y)
      const ray = scene.createPickingRay(x, y, Matrix.Identity(), cam);
      const dot = Vector3.Dot(dec, ray.direction.normalize());
      worst = Math.min(worst, dot);
      results.push({ tgt: tgt.asArray().map((n) => +n.toFixed(1)), x, y, dot: +dot.toFixed(3) });
    }
  }
  void Viewport;
  return { worstDot: +worst.toFixed(3), results: results.filter((r) => r.dot < 0.98) };
}
