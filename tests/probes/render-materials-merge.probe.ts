// Probe: Mesh.MergeMeshes vs VertexData.merge vs manual typed-array concatenation (with custom "surf").
import { Engine, Scene, Vector3, Color4, FreeCamera, Mesh, VertexData, StandardMaterial, Matrix, Quaternion } from "@babylonjs/core";
import { GeomBuilder } from "./render-materials-proctex.ts";

function sourceGeom(): GeomBuilder {
  const g = new GeomBuilder();
  const s = (layer: number) => ({ layer, normalLayer: 0, rough: 0.7, emissive: 0, tint: [1, 1, 1] as [number, number, number], metal: 0, worldSize: 0.5 });
  g.box([0, 0.15, 0], [0.15, 0.15, 0.15], () => s(2));
  g.box([0, 0.38, 0], [0.08, 0.08, 0.08], () => s(1));
  return g;
}

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);
  new FreeCamera("cam", new Vector3(0, 5, -10), scene);
  const mat = new StandardMaterial("m", scene);
  const g = sourceGeom();
  const out: Record<string, unknown> = {};

  const makeMeshes = (n: number) => {
    const list: Mesh[] = [];
    for (let i = 0; i < n; i++) {
      const m = new Mesh("s" + i, scene);
      const vd = new VertexData();
      vd.positions = g.positions; vd.normals = g.normals; vd.uvs = g.uvs; vd.colors = g.colors; vd.indices = g.indices;
      vd.applyToMesh(m);
      m.setVerticesData("surf", g.surf, false, 4);
      m.material = mat;
      m.position.set(i % 20, 0, Math.floor(i / 20));
      m.rotationQuaternion = Quaternion.RotationYawPitchRoll(i * 0.1, 0, 0);
      list.push(m);
    }
    return list;
  };

  for (const n of [200, 2000]) {
    // 1) Mesh.MergeMeshes
    let list = makeMeshes(n);
    let t0 = performance.now();
    const merged = Mesh.MergeMeshes(list, true, true)!;
    const msMergeMeshes = performance.now() - t0;
    const firstPos = merged.getVerticesData("position")!.slice(0, 3);
    out[`n${n}_MergeMeshes`] = {
      ms: +msMergeMeshes.toFixed(1),
      vertices: merged.getTotalVertices(),
      hasSurf: merged.isVerticesDataPresent("surf"),
      hasColor: merged.isVerticesDataPresent("color"),
      mergedPositionIsWorldSpace: Array.from(firstPos).map((v) => +v.toFixed(3)),
      mergedWorldMatrixIsIdentity: merged.getWorldMatrix().isIdentity(),
      is32bitIndices: merged.getIndices() instanceof Uint32Array,
    };
    merged.dispose();

    // 2) VertexData.merge (+ transform per source)
    const vds: VertexData[] = [];
    for (let i = 0; i < n; i++) {
      const vd = new VertexData();
      vd.positions = g.positions.slice(); vd.normals = g.normals.slice(); vd.uvs = g.uvs.slice(); vd.colors = g.colors.slice(); vd.indices = g.indices.slice();
      vds.push(vd);
    }
    t0 = performance.now();
    const mats: Matrix[] = [];
    for (let i = 0; i < n; i++) mats.push(Matrix.Compose(Vector3.One(), Quaternion.RotationYawPitchRoll(i * 0.1, 0, 0), new Vector3(i % 20, 0, Math.floor(i / 20))));
    for (let i = 0; i < n; i++) vds[i].transform(mats[i]);
    const root = vds[0];
    root.merge(vds.slice(1), true);
    const m2 = new Mesh("vdMerged", scene);
    root.applyToMesh(m2);
    const msVD = performance.now() - t0;
    out[`n${n}_VertexData_merge`] = { ms: +msVD.toFixed(1), vertices: m2.getTotalVertices() };
    m2.dispose();

    // 3) manual concatenation into typed arrays (what the batcher should do; keeps custom attributes)
    t0 = performance.now();
    const vPer = g.positions.length / 3, iPer = g.indices.length;
    const P = new Float32Array(n * vPer * 3), N = new Float32Array(n * vPer * 3), UV = new Float32Array(n * vPer * 2);
    const C = new Float32Array(n * vPer * 4), SU = new Float32Array(n * vPer * 4), I = new Uint32Array(n * iPer);
    const v = new Vector3(), r = new Vector3();
    for (let k = 0; k < n; k++) {
      const M = mats[k];
      const vo = k * vPer;
      for (let j = 0; j < vPer; j++) {
        v.set(g.positions[j * 3], g.positions[j * 3 + 1], g.positions[j * 3 + 2]);
        Vector3.TransformCoordinatesToRef(v, M, r);
        P[(vo + j) * 3] = r.x; P[(vo + j) * 3 + 1] = r.y; P[(vo + j) * 3 + 2] = r.z;
        v.set(g.normals[j * 3], g.normals[j * 3 + 1], g.normals[j * 3 + 2]);
        Vector3.TransformNormalToRef(v, M, r);
        N[(vo + j) * 3] = r.x; N[(vo + j) * 3 + 1] = r.y; N[(vo + j) * 3 + 2] = r.z;
      }
      UV.set(g.uvs, vo * 2);
      C.set(g.colors, vo * 4);
      SU.set(g.surf, vo * 4);
      for (let j = 0; j < iPer; j++) I[k * iPer + j] = g.indices[j] + vo;
    }
    const m3 = new Mesh("manual", scene);
    const vd3 = new VertexData();
    vd3.positions = P; vd3.normals = N; vd3.uvs = UV; vd3.colors = C; vd3.indices = I;
    vd3.applyToMesh(m3);
    m3.setVerticesData("surf", SU, false, 4);
    const msManual = performance.now() - t0;
    out[`n${n}_manualConcat`] = { ms: +msManual.toFixed(1), vertices: m3.getTotalVertices(), hasSurf: m3.isVerticesDataPresent("surf") };
    m3.dispose();
    list = [];
  }

  // VertexData.merge with mismatched attribute sets
  const a = new VertexData();
  a.positions = [0, 0, 0, 1, 0, 0, 0, 1, 0]; a.indices = [0, 1, 2]; a.normals = [0, 0, -1, 0, 0, -1, 0, 0, -1];
  const b = new VertexData();
  b.positions = [0, 0, 0, 1, 0, 0, 0, 1, 0]; b.indices = [0, 1, 2];
  let err = "none";
  try { a.clone().merge(b.clone()); } catch (e) { err = String(e).slice(0, 120); }
  out.VertexData_merge_mismatchedAttributes = err;
  let err2 = "none";
  try { a.clone().merge(b.clone(), false, false, false, true); } catch (e) { err2 = String(e).slice(0, 120); }
  out.VertexData_merge_mismatched_enableCompletion = err2;
  return out;
}
