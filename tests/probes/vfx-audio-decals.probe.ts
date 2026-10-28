// Probe: MeshBuilder.CreateDecal (projected decal meshes) vs decal maps (MeshUVSpaceRenderer + material.decalMap).
import {
  Mesh,
  MeshBuilder,
  VertexData,
  StandardMaterial,
  DynamicTexture,
  MeshUVSpaceRenderer,
  Vector3,
  Color3,
  Color4,
  type Scene,
} from "@babylonjs/core";
import { makeScene, r3, renderUntil, gpuSync, tick } from "./vfx-audio-util.ts";

/** Impact mark: dark soft crater + radial crack lines on transparent background. */
function makeImpactTexture(scene: Scene, size = 128): DynamicTexture {
  const tex = new DynamicTexture("impactTex", { width: size, height: size }, scene, true);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.55);
  g.addColorStop(0, "rgba(20,18,16,0.95)");
  g.addColorStop(0.5, "rgba(40,36,32,0.7)");
  g.addColorStop(1, "rgba(60,55,50,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(25,22,20,0.9)";
  ctx.lineWidth = 2;
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.3 * Math.sin(k * 7.1);
    ctx.beginPath();
    ctx.moveTo(c, c);
    let x = c, y = c;
    for (let s = 0; s < 5; s++) {
      x += Math.cos(a + (Math.sin(k * 3 + s) * 0.5)) * size * 0.09;
      y += Math.sin(a + (Math.sin(k * 3 + s) * 0.5)) * size * 0.09;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  tex.hasAlpha = true;
  tex.update();
  return tex;
}

/** Custom mesh from raw VertexData (like our batch builder output): a slab with flat normals + planar uvs. */
function makeCustomSlab(scene: Scene, name: string, withNormals: boolean): Mesh {
  const src = MeshBuilder.CreateBox("tmpBox", { width: 3, height: 2.4, depth: 0.12 }, scene);
  const vd = new VertexData();
  vd.positions = Array.from(src.getVerticesData("position")!);
  vd.indices = Array.from(src.getIndices()!);
  if (withNormals) vd.normals = Array.from(src.getVerticesData("normal")!);
  vd.uvs = Array.from(src.getVerticesData("uv")!);
  src.dispose();
  const m = new Mesh(name, scene);
  vd.applyToMesh(m, true);
  return m;
}

export async function probe(): Promise<any> {
  const { engine, scene, camera } = makeScene({ wall: false });
  camera.position.set(0, 1.6, -5.2);
  camera.setTarget(new Vector3(0, 1.1, 0));
  const out: any = {};
  const frame = (): void => {
    scene.render();
    gpuSync(engine);
  };
  const impact = makeImpactTexture(scene);

  const decalMat = new StandardMaterial("decalMat", scene);
  decalMat.diffuseTexture = impact;
  decalMat.useAlphaFromDiffuseTexture = true; // soft edges via alpha blending
  decalMat.specularColor = Color3.Black();
  decalMat.zOffset = -2; // polygon offset against z-fighting with the surface
  decalMat.backFaceCulling = true;

  const wallMat = new StandardMaterial("wallMat", scene);
  wallMat.diffuseColor = new Color3(0.8, 0.78, 0.72);
  wallMat.specularColor = Color3.Black();

  // ---------------------------------------------------------- 1) CreateDecal on a custom VertexData mesh
  const slab = makeCustomSlab(scene, "slab", true);
  slab.material = wallMat;
  slab.position.set(-1.7, 1.2, 0.5);
  slab.computeWorldMatrix(true);
  const front = new Vector3(0, 0, -1); // slab front face normal (towards camera)
  const decals: Mesh[] = [];
  const t0 = performance.now();
  for (const [x, y, s] of [[-2.4, 1.6, 0.5], [-1.4, 0.9, 0.35], [-0.8, 1.9, 0.25]] as const) {
    const d = MeshBuilder.CreateDecal("decal", slab, { position: new Vector3(x, y, 0.44), normal: front, size: new Vector3(s, s, 0.2), angle: Math.random() * 6.28 });
    d.material = decalMat;
    decals.push(d);
  }
  out.createDecalOnSlab = { ms3: r3(performance.now() - t0), slabTris: slab.getTotalIndices() / 3, decalVerts: decals.map((d) => d.getTotalVertices()) };

  // decal straddling an edge: wraps around the corner (projection box clips every triangle it touches)
  const edge = MeshBuilder.CreateDecal("edgeDecal", slab, { position: new Vector3(-0.2, 0.5, 0.44), normal: front, size: new Vector3(0.4, 0.4, 0.4) });
  edge.material = decalMat;
  decals.push(edge);
  out.edgeDecalVerts = edge.getTotalVertices();

  // no normals -> ?
  const noN = makeCustomSlab(scene, "slabNoNormals", false);
  noN.position.set(0, -10, 0);
  noN.computeWorldMatrix(true);
  try {
    const d = MeshBuilder.CreateDecal("decalNoNormals", noN, { position: new Vector3(0, -10, -0.06), normal: front, size: new Vector3(0.5, 0.5, 0.3) });
    const ext = d.getBoundingInfo().boundingBox.extendSizeWorld;
    const ref = MeshBuilder.CreateDecal("decalRef", slab, { position: new Vector3(-1.7, 1.2, 0.44), normal: front, size: new Vector3(0.5, 0.5, 0.3) });
    const extRef = ref.getBoundingInfo().boundingBox.extendSizeWorld;
    out.noNormals = { verts: d.getTotalVertices(), normalsPresentOnSource: noN.isVerticesDataPresent("normal"), halfExtent: ext.asArray().map(r3), halfExtentWithNormals: extRef.asArray().map(r3), decalHasNormals: d.isVerticesDataPresent("normal") };
    ref.dispose();
    d.dispose();
  } catch (e) {
    out.noNormals = { threw: String(e) };
  }

  // cost vs source triangle count
  const cost: any = {};
  for (const sub of [10, 50, 120]) {
    const g = MeshBuilder.CreateGround("heavy" + sub, { width: 3, height: 3, subdivisions: sub }, scene);
    g.position.set(0, -20, 0);
    g.computeWorldMatrix(true);
    const tris = g.getTotalIndices() / 3;
    const ts: number[] = [];
    for (let k = 0; k < 5; k++) {
      const t = performance.now();
      const d = MeshBuilder.CreateDecal("hd", g, { position: new Vector3(0, -20, 0), normal: new Vector3(0, 1, 0), size: new Vector3(0.3, 0.3, 0.3) });
      ts.push(performance.now() - t);
      d.dispose();
    }
    ts.sort((a, b) => a - b);
    cost["tris" + tris] = r3(ts[2]);
    g.dispose();
  }
  out.createDecalMsBySourceTris = cost;

  // localMode: decal parented to a moving mesh (dynamic island)
  const box = MeshBuilder.CreateBox("movingBox", { size: 0.8 }, scene);
  box.material = wallMat;
  box.position.set(1.0, 0.4, -1.2);
  box.rotation.y = 0.5;
  box.computeWorldMatrix(true);
  const boxFront = new Vector3(-Math.sin(0.5), 0, -Math.cos(0.5));
  const ld = MeshBuilder.CreateDecal("localDecal", box, { position: box.position.add(boxFront.scale(0.4)), normal: boxFront, size: new Vector3(0.5, 0.5, 0.3), localMode: true });
  ld.material = decalMat;
  box.position.y = 0.6; // move after creation; the decal should follow
  box.rotation.y = 0.35;
  out.localMode = { parentIsBox: ld.parent === box, verts: ld.getTotalVertices() };

  // merging decals into one mesh -> 1 draw call
  const tm = performance.now();
  const merged = Mesh.MergeMeshes(decals.slice(0, 3), true, true);
  out.merge3Decals = { ms: r3(performance.now() - tm), ok: !!merged, verts: merged?.getTotalVertices() };
  if (merged) merged.material = decalMat;

  // ---------------------------------------------------------- 2) decal map (MeshUVSpaceRenderer) on unique-UV mesh
  const dmWall = MeshBuilder.CreateGround("dmWall", { width: 2.4, height: 2.4, subdivisions: 4 }, scene); // UVs unique in [0,1]
  dmWall.rotation.x = -Math.PI / 2; // stand it up facing -Z (towards the camera)
  dmWall.position.set(1.8, 1.25, 0.6);
  dmWall.computeWorldMatrix(true);
  const dmMat = new StandardMaterial("dmMat", scene);
  dmMat.diffuseColor = new Color3(0.7, 0.75, 0.8);
  dmMat.specularColor = Color3.Black();
  dmMat.decalMap!.isEnabled = true; // DecalMapConfiguration plugin (getter creates it lazily)
  dmWall.material = dmMat;
  const uvr = new MeshUVSpaceRenderer(dmWall, scene, { width: 1024, height: 1024 });
  dmWall.decalMap = uvr;
  out.decalMapReadyInitially = uvr.isReady();
  out.decalMapReady = await renderUntil(scene, () => uvr.isReady());
  const n = new Vector3(0, 0, -1);
  const tR: number[] = [];
  for (const [x, y, s] of [[1.2, 1.7, 0.6], [2.2, 0.9, 0.45], [2.5, 1.9, 0.3], [1.6, 0.6, 0.35]] as const) {
    const t = performance.now();
    uvr.renderTexture(impact, new Vector3(x, y, 0.6), n, new Vector3(s, s, 0.3), Math.random() * 6.28);
    tR.push(performance.now() - t);
  }
  out.decalMapRenderTextureMs = tR.map(r3);
  out.decalMapTextureSize = uvr.texture?.getSize();

  // overlapping UVs: a default box maps every face to the full [0,1] square -> the mark repeats on all faces
  const uvBox = MeshBuilder.CreateBox("uvBox", { size: 0.7 }, scene);
  uvBox.position.set(-0.3, 0.35, -1.6);
  uvBox.rotation.y = 0.6;
  uvBox.computeWorldMatrix(true);
  const boxMat = new StandardMaterial("boxDmMat", scene);
  boxMat.diffuseColor = new Color3(0.6, 0.8, 0.6);
  boxMat.decalMap!.isEnabled = true;
  uvBox.material = boxMat;
  const uvr2 = new MeshUVSpaceRenderer(uvBox, scene, { width: 512, height: 512 });
  uvBox.decalMap = uvr2;
  await renderUntil(scene, () => uvr2.isReady());
  const bn = new Vector3(-Math.sin(0.6), 0, -Math.cos(0.6));
  uvr2.renderTexture(impact, uvBox.position.add(bn.scale(0.35)), bn, new Vector3(0.4, 0.4, 0.3), 0);

  await tick(50);
  for (let i = 0; i < 4; i++) frame();
  out.drawCalls = (() => {
    const before = engine._drawCalls.current;
    scene.render();
    return engine._drawCalls.current - before;
  })();
  out.meshes = scene.meshes.filter((m) => m.isEnabled() && m.isVisible).map((m) => m.name);
  scene.clearColor = new Color4(0.08, 0.09, 0.11, 1);
  return out;
}
