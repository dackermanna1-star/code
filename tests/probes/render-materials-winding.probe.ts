// Probe: which raw-VertexData triangle winding is front-facing in Babylon 9 (left-handed scene,
// default sideOrientation, backFaceCulling = true). Also checks VertexData.ComputeNormals direction,
// MeshBuilder plane reference, mirrored (negative-determinant) transforms and material.sideOrientation.
import { Engine, Scene, Vector3, Matrix, Color3, Color4, FreeCamera, Mesh, VertexData, StandardMaterial, MeshBuilder, Material } from "@babylonjs/core";

function tri(name: string, scene: Scene, cx: number, indices: number[], color: Color3): Mesh {
  const m = new Mesh(name, scene);
  const vd = new VertexData();
  // Triangle in the z=0 plane. Seen from a camera at z=-10 looking towards +Z (x right, y up):
  // p0 bottom-left, p1 bottom-right, p2 top  => order 0,1,2 is COUNTER-CLOCKWISE on screen.
  vd.positions = [cx - 0.8, -0.6, 0, cx + 0.8, -0.6, 0, cx, 0.8, 0];
  vd.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(vd.positions, vd.indices, normals);
  vd.normals = normals;
  vd.applyToMesh(m);
  const mat = new StandardMaterial(name + "M", scene);
  mat.disableLighting = true;
  mat.emissiveColor = color;
  m.material = mat;
  return m;
}

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);
  const cam = new FreeCamera("c", new Vector3(0, 0, -10), scene);
  cam.setTarget(Vector3.Zero());

  // A: indices 0,1,2 (CCW as seen from the camera)  -> red
  const a = tri("ccw", scene, -3, [0, 1, 2], new Color3(1, 0, 0));
  // B: indices 0,2,1 (CW as seen from the camera)   -> green
  const b = tri("cw", scene, 0, [0, 2, 1], new Color3(0, 1, 0));
  // C: same as B but mirrored with scaling.x = -1 (negative determinant) -> blue
  const c = tri("cwMirrored", scene, 0, [0, 2, 1], new Color3(0, 0, 1));
  c.scaling.x = -1;
  c.position.x = 3; // geometry centred at x=0 then mirrored, then moved to x=+3
  // D: CW triangle but material.sideOrientation forced to ClockWise -> yellow
  const d = tri("cwMatCW", scene, 0, [0, 2, 1], new Color3(1, 1, 0));
  d.position.y = 2.2;
  (d.material as Material).sideOrientation = Material.ClockWiseSideOrientation;
  // E: CCW triangle with backFaceCulling = false -> magenta (always visible)
  const e = tri("ccwNoCull", scene, 0, [0, 2, 1], new Color3(1, 0, 1));
  e.position.set(-3, 2.2, 0);
  (e.material as StandardMaterial).backFaceCulling = false;
  // F: CCW triangle mirrored with scaling.x = -1 -> white (expected visible: Babylon flips culling for det<0)
  const f = tri("ccwMirrored", scene, 0, [0, 1, 2], new Color3(1, 1, 1));
  f.scaling.x = -1;
  f.position.set(3, 2.2, 0);
  // Reference: MeshBuilder plane (default FRONTSIDE) at y=-2.2, cyan
  const plane = MeshBuilder.CreatePlane("plane", { size: 1.4 }, scene);
  plane.position.set(0, -2.2, 0);
  const pm = new StandardMaterial("pm", scene);
  pm.disableLighting = true;
  pm.emissiveColor = new Color3(0, 1, 1);
  plane.material = pm;
  // Reference box from the builder: check which way its first face's ComputeNormals points
  const box = MeshBuilder.CreateBox("box", { size: 1 }, scene);
  box.position.set(3, -2.2, 0);
  box.material = pm;

  await scene.whenReadyAsync();
  scene.render();
  scene.render();

  // Read pixels at triangle centroids (GL coords: y from bottom).
  const w = engine.getRenderWidth();
  const h = engine.getRenderHeight();
  const read = async (wx: number, wy: number) => {
    const sp = Vector3.Project(new Vector3(wx, wy, 0), Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
    const px = Math.round(sp.x);
    const py = Math.round(h - sp.y); // Project() gives top-left origin; readPixels wants bottom-left
    const data = (await engine.readPixels(px, py, 1, 1)) as Uint8Array;
    return [data[0], data[1], data[2]];
  };
  const centroidY = (-0.6 - 0.6 + 0.8) / 3;
  const results = {
    meshSideOrientationDefault: a.sideOrientation, // 1 = Material.CounterClockWiseSideOrientation
    materialSideOrientationDefault: (b.material as Material).sideOrientation, // null
    ClockWiseSideOrientation: Material.ClockWiseSideOrientation,
    CounterClockWiseSideOrientation: Material.CounterClockWiseSideOrientation,
    pixel_A_ccw_red: await read(-3, centroidY),
    pixel_B_cw_green: await read(0, centroidY),
    pixel_C_cwMirrored_blue: await read(3, centroidY),
    pixel_D_cw_matClockWise_yellow: await read(0, centroidY + 2.2),
    pixel_E_cw_noCull_magenta: await read(-3, centroidY + 2.2),
    pixel_plane_cyan: await read(0, -2.2),
    pixel_F_ccwMirrored_white: await read(3, centroidY + 2.2),
    normalsA_ccw: Array.from(a.getVerticesData("normal")!.slice(0, 3)),
    normalsB_cw: Array.from(b.getVerticesData("normal")!.slice(0, 3)),
    planeNormal: Array.from(plane.getVerticesData("normal")!.slice(0, 3)),
    planeIndices: Array.from(plane.getIndices()!.slice(0, 3)),
    planePositions: Array.from(plane.getVerticesData("position")!.slice(0, 9)),
    cameraForward: cam.getForwardRay().direction.asArray().map((x) => +x.toFixed(3)),
    cameraRight: Vector3.TransformNormal(new Vector3(1, 0, 0), cam.getWorldMatrix()).asArray().map((x) => +x.toFixed(3)),
  };
  // Box: recompute normals from its indices and compare with the builder's stored normals (outward)
  const bpos = box.getVerticesData("position")!;
  const bidx = box.getIndices()!;
  const bn: number[] = [];
  VertexData.ComputeNormals(bpos, bidx, bn);
  const stored = box.getVerticesData("normal")!;
  let agree = 0;
  for (let i = 0; i < stored.length; i += 3) {
    const dot = stored[i] * bn[i] + stored[i + 1] * bn[i + 1] + stored[i + 2] * bn[i + 2];
    if (dot > 0.99) agree++;
  }
  // Right-hand-rule cross product (p1-p0)x(p2-p0) of the box's first triangle vs its stored (outward) normal
  const i0 = bidx[0] * 3, i1 = bidx[1] * 3, i2 = bidx[2] * 3;
  const p0 = new Vector3(bpos[i0], bpos[i0 + 1], bpos[i0 + 2]);
  const p1 = new Vector3(bpos[i1], bpos[i1 + 1], bpos[i1 + 2]);
  const p2 = new Vector3(bpos[i2], bpos[i2 + 1], bpos[i2 + 2]);
  const rhr = Vector3.Cross(p1.subtract(p0), p2.subtract(p0)).normalize();
  const outward = new Vector3(stored[bidx[0] * 3], stored[bidx[0] * 3 + 1], stored[bidx[0] * 3 + 2]);
  engine.runRenderLoop(() => scene.render());
  return {
    ...results,
    box_ComputeNormalsAgreeWithBuilderNormals: `${agree}/${stored.length / 3}`,
    box_firstTri_rightHandCross: rhr.asArray().map((x) => +x.toFixed(3)),
    box_firstTri_storedOutwardNormal: outward.asArray(),
    box_dot_rhr_outward: +Vector3.Dot(rhr, outward).toFixed(3),
  };
}
