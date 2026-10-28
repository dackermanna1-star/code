// Probe: raw mesh creation/update APIs + costs for a ~500-vertex mesh with a custom vec4 attribute.
import { Engine, Scene, Vector3, Color4, FreeCamera, HemisphericLight, Mesh, VertexData, StandardMaterial, VertexBuffer } from "@babylonjs/core";

interface Geom {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  surf: Float32Array;
  indices: Uint32Array;
}

// Grid of independent quads (flat shading, 4 verts per quad). quads=125 -> 500 verts, 750 indices.
function buildGeom(quads: number, jitter: number): Geom {
  const n = quads * 4;
  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  const colors = new Float32Array(n * 4);
  const surf = new Float32Array(n * 4);
  const indices = new Uint32Array(quads * 6);
  const side = Math.ceil(Math.sqrt(quads));
  for (let q = 0; q < quads; q++) {
    const x0 = (q % side) * 0.1 - 0.5;
    const y0 = Math.floor(q / side) * 0.1 - 0.5;
    const z = Math.sin(q + jitter) * 0.01;
    const vx = [x0, x0 + 0.09, x0 + 0.09, x0];
    const vy = [y0, y0, y0 + 0.09, y0 + 0.09];
    for (let k = 0; k < 4; k++) {
      const v = q * 4 + k;
      positions.set([vx[k], vy[k], z], v * 3);
      normals.set([0, 0, -1], v * 3);
      uvs.set([vx[k], vy[k]], v * 2);
      colors.set([1, 1, 1, 1], v * 4);
      surf.set([q % 4, 0, 0.5, 0], v * 4);
    }
    // CCW as seen from -Z (front-facing for a camera looking towards +Z), see winding probe
    indices.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
  }
  return { positions, normals, uvs, colors, surf, indices };
}

function toVD(g: Geom): VertexData {
  const vd = new VertexData();
  vd.positions = g.positions;
  vd.normals = g.normals;
  vd.uvs = g.uvs;
  vd.colors = g.colors;
  vd.indices = g.indices;
  return vd;
}

function timeIt(iters: number, fn: (i: number) => void): number {
  // warmup
  for (let i = 0; i < 5; i++) fn(i);
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn(i);
  return +((performance.now() - t0) / iters).toFixed(4);
}

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.1, 0.1, 0.1, 1);
  const cam = new FreeCamera("c", new Vector3(0, 0, -2), scene);
  cam.setTarget(Vector3.Zero());
  new HemisphericLight("h", new Vector3(0, 0, -1), scene);
  const mat = new StandardMaterial("m", scene);
  const out: Record<string, unknown> = {};

  // --- correctness: custom attribute set BEFORE geometry exists is silently dropped
  const early = new Mesh("early", scene);
  early.setVerticesData("surf", new Float32Array(16), false, 4);
  toVD(buildGeom(1, 0)).applyToMesh(early);
  out.customKindSetBeforeGeometry_present = early.isVerticesDataPresent("surf");
  early.setVerticesData("surf", new Float32Array(16), false, 4);
  out.customKindSetAfterGeometry_present = early.isVerticesDataPresent("surf");
  out.customKind_stride = early.getVertexBuffer("surf")?.getStrideSize();
  out.customKind_size = early.getVertexBuffer("surf")?.getSize();
  early.dispose();

  // --- correctness: updateVerticesData on a NON-updatable buffer
  const g0 = buildGeom(125, 0);
  const g1 = buildGeom(125, 1);
  const nu = new Mesh("nonUpdatable", scene);
  toVD(g0).applyToMesh(nu, false);
  nu.material = mat;
  scene.render();
  const before = nu.getVerticesData(VertexBuffer.PositionKind)![2];
  nu.updateVerticesData(VertexBuffer.PositionKind, g1.positions);
  const after = nu.getVerticesData(VertexBuffer.PositionKind)![2];
  out.nonUpdatable_updateVerticesData_changedCpuData = before !== after;
  out.nonUpdatable_isUpdatable = nu.getVertexBuffer(VertexBuffer.PositionKind)!.isUpdatable();
  nu.dispose();

  // --- create cost: new Mesh + applyToMesh + custom attribute (+ material assign), then dispose
  const created: Mesh[] = [];
  out.ms_create500 = timeIt(200, (i) => {
    const m = new Mesh("c" + i, scene);
    const g = i % 2 ? g0 : g1;
    toVD(g).applyToMesh(m, false);
    m.setVerticesData("surf", g.surf, false, 4);
    m.material = mat;
    created.push(m);
  });
  scene.render(); // first render with these
  {
    const n = created.length;
    const t0 = performance.now();
    for (const m of created.splice(0)) m.dispose();
    out.ms_disposePerMesh = +((performance.now() - t0) / n).toFixed(4);
  }

  // --- rebuild paths on one mesh
  const mesh = new Mesh("dyn", scene);
  toVD(g0).applyToMesh(mesh, true);
  mesh.setVerticesData("surf", g0.surf, true, 4);
  mesh.material = mat;
  await scene.whenReadyAsync();
  scene.render();
  out.ms_render_baseline = timeIt(100, () => scene.render());

  // A) same vertex count, recreate all GPU buffers (applyToMesh again = setVerticesData + setIndices)
  out.ms_rebuild_applyToMesh_sameCount = timeIt(300, (i) => {
    const g = i % 2 ? g0 : g1;
    toVD(g).applyToMesh(mesh, true);
    mesh.setVerticesData("surf", g.surf, true, 4);
  });
  out.ms_rebuild_applyToMesh_plusRender = timeIt(100, (i) => {
    const g = i % 2 ? g0 : g1;
    toVD(g).applyToMesh(mesh, true);
    mesh.setVerticesData("surf", g.surf, true, 4);
    scene.render();
  });
  // B) same vertex count, in-place updates (bufferSubData) of updatable buffers
  out.ms_update_updateVerticesData_sameCount = timeIt(300, (i) => {
    const g = i % 2 ? g0 : g1;
    mesh.updateVerticesData(VertexBuffer.PositionKind, g.positions, false);
    mesh.updateVerticesData(VertexBuffer.NormalKind, g.normals);
    mesh.updateVerticesData(VertexBuffer.UVKind, g.uvs);
    mesh.updateVerticesData(VertexBuffer.ColorKind, g.colors);
    mesh.updateVerticesData("surf", g.surf);
    mesh.updateIndices(g.indices);
  });
  out.ms_update_plusRefreshBoundingInfo = timeIt(300, (i) => {
    const g = i % 2 ? g0 : g1;
    mesh.updateVerticesData(VertexBuffer.PositionKind, g.positions, false);
    mesh.updateVerticesData(VertexBuffer.NormalKind, g.normals);
    mesh.updateVerticesData("surf", g.surf);
    mesh.refreshBoundingInfo();
  });
  out.ms_update_plusRender = timeIt(100, (i) => {
    const g = i % 2 ? g0 : g1;
    mesh.updateVerticesData(VertexBuffer.PositionKind, g.positions, true);
    mesh.updateVerticesData(VertexBuffer.NormalKind, g.normals);
    mesh.updateVerticesData("surf", g.surf);
    scene.render();
  });
  // C) vertex count changes (500 <-> 520): must go through applyToMesh/setVerticesData
  const g2 = buildGeom(130, 2);
  out.ms_rebuild_countChanges = timeIt(300, (i) => {
    const g = i % 2 ? g0 : g2;
    toVD(g).applyToMesh(mesh, true);
    mesh.setVerticesData("surf", g.surf, true, 4);
  });
  out.totalVerticesAfter = mesh.getTotalVertices();
  out.totalIndicesAfter = mesh.getTotalIndices();
  // D) ComputeNormals on 500 verts
  const nrm = new Float32Array(g0.positions.length);
  out.ms_ComputeNormals500 = timeIt(500, () => VertexData.ComputeNormals(g0.positions, g0.indices, nrm));
  // E) refreshBoundingInfo alone
  out.ms_refreshBoundingInfo500 = timeIt(500, () => mesh.refreshBoundingInfo());
  // F) VertexData construction overhead (merge of 10 small vds)
  out.boundingAfterRefresh = mesh.getBoundingInfo().boundingBox.extendSize.asArray().map((v) => +v.toFixed(3));

  // G) a 500-vertex mesh rebuilt as a NEW mesh each time (new Mesh + apply + dispose old)
  let cur: Mesh | null = null;
  out.ms_replaceWithNewMesh = timeIt(200, (i) => {
    const m = new Mesh("r" + i, scene);
    const g = i % 2 ? g0 : g1;
    toVD(g).applyToMesh(m, false);
    m.setVerticesData("surf", g.surf, false, 4);
    m.material = mat;
    cur?.dispose();
    cur = m;
  });
  scene.render();
  engine.runRenderLoop(() => scene.render());
  out.glRenderer = engine.getGlInfo().renderer;
  return out;
}
