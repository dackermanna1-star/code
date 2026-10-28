// Probe: InstancedMesh vs thin instances: per-instance colour, picking, static-buffer pitfall, bounding info,
// promotion of one instance to a unique mesh, CPU cost per frame for 2000 copies (static and moving).
import {
  Engine, Scene, Vector3, Color3, Color4, FreeCamera, HemisphericLight, Mesh, VertexData, StandardMaterial, VertexBuffer,
  Matrix, Quaternion, InstancedMesh, MeshBuilder,
} from "@babylonjs/core";

// ~40-vertex prism (8 sides, flat shaded: 8*4 side verts + 2*4... ) built with VertexData.CreateCylinder
function prismVD(): VertexData {
  return VertexData.CreateCylinder({ height: 0.3, diameter: 0.2, tessellation: 6, subdivisions: 1 });
}

function timeFrames(scene: Scene, n: number, perFrame?: (i: number) => void): number {
  for (let i = 0; i < 5; i++) { perFrame?.(i); scene.render(); }
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { perFrame?.(i); scene.render(); }
  return +((performance.now() - t0) / n).toFixed(3);
}

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);
  const cam = new FreeCamera("cam", new Vector3(0, 0, -6), scene);
  cam.setTarget(Vector3.Zero());
  new HemisphericLight("h", new Vector3(0, 0, -1), scene).intensity = 1;
  const out: Record<string, unknown> = {};
  const vd = prismVD();
  out.prismVertexCount = vd.positions!.length / 3;

  const mat = new StandardMaterial("m", scene);
  mat.disableLighting = true;
  mat.emissiveColor = Color3.White();

  // ---------- InstancedMesh with per-instance colour
  const src = new Mesh("src", scene);
  vd.applyToMesh(src);
  src.material = mat;
  src.registerInstancedBuffer(VertexBuffer.ColorKind, 4);
  src.instancedBuffers.color = new Color4(1, 1, 1, 1);
  src.position.set(-2.5, 1.5, 0);
  const instA = src.createInstance("instA");
  instA.position.set(-1.5, 1.5, 0);
  instA.instancedBuffers.color = new Color4(1, 0, 0, 1);
  const instB = src.createInstance("instB");
  instB.position.set(-0.5, 1.5, 0);
  instB.instancedBuffers.color = new Color4(0, 1, 0, 1);

  // ---------- thin instances with per-instance colour (dynamic buffers)
  const thin = new Mesh("thin", scene);
  vd.applyToMesh(thin);
  thin.material = mat;
  const N = 3;
  const mats = new Float32Array(16 * N);
  const cols = new Float32Array(4 * N);
  for (let i = 0; i < N; i++) {
    Matrix.Translation(0.5 + i, 1.5, 0).copyToArray(mats, i * 16);
    cols.set([0, 0, 1, 1].map((v, k) => (k === i ? 1 : v)), i * 4);
  }
  thin.thinInstanceSetBuffer("matrix", mats, 16, false); // staticBuffer=false -> updatable
  thin.thinInstanceSetBuffer("color", cols, 4, false);
  thin.thinInstanceEnablePicking = true;

  // ---------- static thin-instance buffer (default) then update -> pitfall check
  const thinStatic = new Mesh("thinStatic", scene);
  vd.applyToMesh(thinStatic);
  thinStatic.material = mat;
  const ms = new Float32Array(16);
  Matrix.Translation(-1.5, -1.0, 0).copyToArray(ms, 0);
  thinStatic.thinInstanceSetBuffer("matrix", ms); // static by default

  await scene.whenReadyAsync();
  scene.render();
  const w = engine.getRenderWidth(), h = engine.getRenderHeight();
  const proj = (p: Vector3) => Vector3.Project(p, Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
  const read = async (p: Vector3) => {
    const sp = proj(p);
    const d = (await engine.readPixels(Math.round(sp.x), Math.round(h - sp.y), 1, 1)) as Uint8Array;
    return [d[0], d[1], d[2]];
  };
  out.instanceColors_src_A_B = [await read(new Vector3(-2.5, 1.5, -0.1)), await read(new Vector3(-1.5, 1.5, -0.1)), await read(new Vector3(-0.5, 1.5, -0.1))];
  out.thinColors_0_1_2 = [await read(new Vector3(0.5, 1.5, -0.1)), await read(new Vector3(1.5, 1.5, -0.1)), await read(new Vector3(2.5, 1.5, -0.1))];

  // picking
  const pa = proj(new Vector3(-1.5, 1.5, -0.1));
  const pickA = scene.pick(pa.x, pa.y);
  out.pick_instance = { pickedMesh: pickA.pickedMesh?.name, isInstancedMesh: pickA.pickedMesh instanceof InstancedMesh };
  const pt = proj(new Vector3(1.5, 1.5, -0.1));
  const pickT = scene.pick(pt.x, pt.y);
  out.pick_thin = { pickedMesh: pickT.pickedMesh?.name, thinInstanceIndex: pickT.thinInstanceIndex };

  // static buffer update pitfall
  Matrix.Translation(-0.5, -1.0, 0).copyToArray(ms, 0);
  thinStatic.thinInstanceBufferUpdated("matrix");
  scene.render();
  out.staticThinBuffer_updated_movedTo_x_minus0_5 = (await read(new Vector3(-0.5, -1.0, -0.1)))[0] > 100;
  out.staticThinBuffer_stillAtOldPlace = (await read(new Vector3(-1.5, -1.0, -0.1)))[0] > 100;
  thinStatic.thinInstanceAllowAutomaticStaticBufferRecreation = true;
  thinStatic.thinInstanceBufferUpdated("matrix");
  scene.render();
  out.afterAllowRecreation_moved = (await read(new Vector3(-0.5, -1.0, -0.1)))[0] > 100;

  // bounding info: move thin instance 2 far away (x=+30) and look at it
  Matrix.Translation(30, 0, 0).copyToArray(mats, 2 * 16);
  thin.thinInstanceBufferUpdated("matrix");
  cam.position.set(30, 0, -3);
  cam.setTarget(new Vector3(30, 0, 0));
  scene.render();
  const farPix = async () => (await read(new Vector3(30, 0, -0.1)));
  out.thinMovedOutsideBBox_visibleWithoutRefresh = (await farPix())[2] > 100 || (await farPix())[0] > 100;
  thin.thinInstanceRefreshBoundingInfo(false);
  scene.render();
  out.thinMovedOutsideBBox_visibleAfterRefresh = (await farPix())[2] > 100 || (await farPix())[0] > 100;
  cam.position.set(0, 0, -6);
  cam.setTarget(Vector3.Zero());

  // ---------- promote instance A to a unique mesh
  const promote = (inst: InstancedMesh): Mesh => {
    const source = inst.sourceMesh;
    const m = new Mesh(inst.name + "_unique", scene);
    // ExtractFromMesh() would THROW here (mesh reports the instanced "color" buffer as present) -> use the geometry
    VertexData.ExtractFromGeometry(source.geometry!, true, true).applyToMesh(m, true); // own copy of the geometry
    // custom kinds (e.g. "surf") are NOT in VertexData -> copy them explicitly:
    for (const kind of source.geometry!.getVerticesDataKinds()) {
      if (!m.isVerticesDataPresent(kind)) {
        const vb = source.getVertexBuffer(kind)!;
        m.setVerticesData(kind, source.getVerticesData(kind, true, true)!, true, vb.getSize());
      }
    }
    const c = inst.instancedBuffers.color as Color4 | undefined;
    if (c) {
      const n = m.getTotalVertices();
      const colors = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b, c.a], i * 4);
      m.setVerticesData(VertexBuffer.ColorKind, colors, true);
    }
    inst.computeWorldMatrix(true).decompose(m.scaling, (m.rotationQuaternion = new Quaternion()), m.position);
    m.material = source.material;
    m.parent = inst.parent;
    inst.dispose();
    return m;
  };
  let extractFromMeshError = "none";
  try { VertexData.ExtractFromMesh(src, true, true); } catch (e) { extractFromMeshError = String(e).slice(0, 80); }
  out.ExtractFromMesh_onMeshWithInstancedColor = extractFromMeshError;
  out.mesh_isVerticesDataPresent_color = src.isVerticesDataPresent(VertexBuffer.ColorKind);
  out.geometry_isVerticesDataPresent_color = src.geometry!.isVerticesDataPresent(VertexBuffer.ColorKind);
  const uniq = promote(instA);
  scene.render();
  out.promoted = {
    name: uniq.name,
    position: uniq.position.asArray(),
    color: await read(new Vector3(-1.5, 1.5, -0.1)),
    srcInstancesLeft: src.instances.length,
    sharesGeometry: uniq.geometry === src.geometry,
  };
  // the naive alternative: clone() shares the geometry and inherits the instanced-buffer registration
  const cl = src.clone("clone", null, true);
  out.clone_sharesGeometry = cl.geometry === src.geometry;
  out.clone_hasInstancedBufferColor = !!cl.instancedBuffers?.color;
  cl.dispose();

  // ---------- costs: 2000 InstancedMesh vs 2000 thin instances (render CPU ms/frame)
  for (const m of scene.meshes.slice()) m.dispose();
  const COUNT = 2000;
  cam.position.set(0, 0, -30);
  cam.setTarget(Vector3.Zero());
  const grid = (i: number) => new Vector3((i % 50) - 25, Math.floor(i / 50) - 20, 0).scaleInPlace(0.5);

  const src2 = new Mesh("src2", scene);
  vd.applyToMesh(src2);
  src2.material = mat;
  src2.registerInstancedBuffer(VertexBuffer.ColorKind, 4);
  src2.instancedBuffers.color = new Color4(1, 1, 1, 1);
  const insts: InstancedMesh[] = [];
  let t0 = performance.now();
  for (let i = 0; i < COUNT; i++) {
    const it = src2.createInstance("i" + i);
    it.position.copyFrom(grid(i));
    it.instancedBuffers.color = new Color4(Math.random(), Math.random(), Math.random(), 1);
    insts.push(it);
  }
  out.ms_create2000InstancedMesh = +(performance.now() - t0).toFixed(1);
  await scene.whenReadyAsync();
  out.ms_frame_2000InstancedMesh_static = timeFrames(scene, 60);
  out.ms_frame_2000InstancedMesh_allMoving = timeFrames(scene, 60, (f) => {
    for (let i = 0; i < COUNT; i++) insts[i].position.z = Math.sin(f * 0.1 + i) * 0.1;
  });
  for (const it of insts) it.freezeWorldMatrix();
  out.ms_frame_2000InstancedMesh_frozenWorld = timeFrames(scene, 60);
  src2.dispose();

  const thin2 = new Mesh("thin2", scene);
  vd.applyToMesh(thin2);
  thin2.material = mat;
  const m2 = new Float32Array(16 * COUNT);
  const c2 = new Float32Array(4 * COUNT);
  t0 = performance.now();
  const tmp = Matrix.Identity();
  for (let i = 0; i < COUNT; i++) {
    const p = grid(i);
    Matrix.TranslationToRef(p.x, p.y, p.z, tmp);
    tmp.copyToArray(m2, i * 16);
    c2.set([Math.random(), Math.random(), Math.random(), 1], i * 4);
  }
  thin2.thinInstanceSetBuffer("matrix", m2, 16, false);
  thin2.thinInstanceSetBuffer("color", c2, 4, true);
  out.ms_create2000Thin = +(performance.now() - t0).toFixed(1);
  await scene.whenReadyAsync();
  out.ms_frame_2000Thin_static = timeFrames(scene, 60);
  out.ms_frame_2000Thin_allMoving = timeFrames(scene, 60, (f) => {
    for (let i = 0; i < COUNT; i++) m2[i * 16 + 14] = Math.sin(f * 0.1 + i) * 0.1; // translation z
    thin2.thinInstanceBufferUpdated("matrix");
  });
  out.ms_frame_2000Thin_partialUpdate10 = timeFrames(scene, 60, (f) => {
    for (let i = 0; i < 10; i++) m2[i * 16 + 14] = Math.sin(f * 0.1 + i) * 0.1;
    thin2.thinInstancePartialBufferUpdate("matrix", 10, 0); // 10 matrices from index 0 (GPU only)
  });
  thin2.dispose();

  // reference: 2000 unique meshes (no special flags)
  const uniques: Mesh[] = [];
  t0 = performance.now();
  for (let i = 0; i < COUNT; i++) {
    const m = new Mesh("u" + i, scene);
    vd.applyToMesh(m);
    m.material = mat;
    m.position.copyFrom(grid(i));
    uniques.push(m);
  }
  out.ms_create2000Unique = +(performance.now() - t0).toFixed(1);
  await scene.whenReadyAsync();
  out.ms_frame_2000Unique_static = timeFrames(scene, 30);
  for (const m of uniques) m.dispose();

  engine.runRenderLoop(() => scene.render());
  void MeshBuilder;
  return out;
}
