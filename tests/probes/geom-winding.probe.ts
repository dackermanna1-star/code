// Verifies the RenderGeom triangle winding convention against Babylon's default culling, and
// renders a tessellated + dented + cracked meshgen cube, a lathe bowl and a Voronoi-fractured
// slab for a visual check. Run: node tests/probe.mjs tests/probes/geom-winding.probe.ts --screenshot out.png
import { Engine, Scene, Vector3, Color3, Color4, Mesh, VertexData, StandardMaterial, FreeCamera, HemisphericLight, DirectionalLight } from "@babylonjs/core";
import { polyBox, faceAttr, polyTransform, polyHiddenFaces, type ConvexPoly } from "../../src/geom/poly.ts";
import { polyToRenderGeom, growCracks, mergeRenderGeoms, type RenderGeom } from "../../src/geom/meshgen.ts";
import { latheTiles } from "../../src/geom/primitives.ts";
import { voronoiFracture, generateSeeds } from "../../src/geom/fracture.ts";
import { qeuler } from "../../src/geom/vec.ts";
import { Rng } from "../../src/core/rng.ts";

const PALETTE = [0xd9c9a8, 0x8a9bb0, 0xb06a4c, 0x6f8f5a, 0xc8c2b8, 0x9a7fb0, 0x5a7f8f, 0xd0a040];

function toMesh(name: string, g: RenderGeom, scene: Scene, mat: StandardMaterial, colorBySurf = true): Mesh {
  const m = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = g.positions;
  vd.normals = g.normals;
  vd.indices = g.indices;
  vd.uvs = g.uvs;
  const col = new Float32Array(g.vertexCount * 4);
  for (let i = 0; i < g.vertexCount; i++) {
    const base = colorBySurf ? PALETTE[g.surf[i] % PALETTE.length] : 0xffffff;
    const t = g.tint[i];
    col[4 * i] = (((base >> 16) & 255) / 255) * (((t >> 16) & 255) / 255);
    col[4 * i + 1] = (((base >> 8) & 255) / 255) * (((t >> 8) & 255) / 255);
    col[4 * i + 2] = ((base & 255) / 255) * ((t & 255) / 255);
    col[4 * i + 3] = 1;
  }
  vd.colors = col;
  vd.applyToMesh(m);
  m.material = mat;
  return m;
}

async function pixelAt(engine: Engine, x: number, y: number): Promise<number[]> {
  const w = engine.getRenderWidth(),
    h = engine.getRenderHeight();
  const px = Math.round(x * w),
    py = Math.round((1 - y) * h); // readPixels origin is bottom-left
  const buf = (await engine.readPixels(px, py, 1, 1)) as Uint8Array;
  return [buf[0], buf[1], buf[2]];
}

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);
  const cam = new FreeCamera("cam", new Vector3(0, 0, -3), scene);
  cam.setTarget(Vector3.Zero());

  // ---- 1) winding test: one face (−Z, facing the camera) as given vs. index-reversed copy
  const flat = new StandardMaterial("flat", scene);
  flat.disableLighting = true;
  flat.emissiveColor = new Color3(1, 1, 1);
  flat.backFaceCulling = true;
  const box = polyBox({ x: 0.8, y: 0.8, z: 0.8 }, faceAttr(0));
  const front: ConvexPoly = { verts: box.verts, faces: box.faces.filter((f) => f.n.z < -0.5) };
  const g = polyToRenderGeom(front);
  const asIs = toMesh("asIs", g, scene, flat, false);
  asIs.position.x = -0.9;
  const rev: RenderGeom = { ...g, indices: g.indices.slice() };
  for (let t = 0; t < rev.indices.length; t += 3) [rev.indices[t + 1], rev.indices[t + 2]] = [rev.indices[t + 2], rev.indices[t + 1]];
  const reversed = toMesh("rev", rev, scene, flat, false);
  reversed.position.x = 0.9;
  await scene.whenReadyAsync();
  scene.render();
  scene.render();
  const left = await pixelAt(engine, 0.5 - 0.9 / (2 * 3 * Math.tan(cam.fov / 2) * (engine.getRenderWidth() / engine.getRenderHeight())), 0.5);
  const right = await pixelAt(engine, 0.5 + 0.9 / (2 * 3 * Math.tan(cam.fov / 2) * (engine.getRenderWidth() / engine.getRenderHeight())), 0.5);
  const asIsVisible = left[0] > 128;
  const reversedVisible = right[0] > 128;
  asIs.dispose();
  reversed.dispose();

  // ---- 2) visual check scene
  scene.clearColor = new Color4(0.12, 0.13, 0.16, 1);
  cam.position = new Vector3(0, 1.4, -3.2);
  cam.setTarget(new Vector3(0, 0.25, 0));
  const hemi = new HemisphericLight("h", new Vector3(0.2, 1, -0.3), scene);
  hemi.intensity = 0.55;
  const sun = new DirectionalLight("s", new Vector3(-0.5, -0.8, 0.6), scene);
  sun.intensity = 0.9;
  const lit = new StandardMaterial("lit", scene);
  lit.backFaceCulling = true;
  lit.specularColor = new Color3(0.15, 0.15, 0.15);

  // dented, cracked, tessellated sheet-metal box (microwave-ish casing)
  const casing = polyBox({ x: 0.9, y: 0.55, z: 0.6 }, faceAttr(1));
  const dents = [
    { p: { x: 0.1, y: 0.275, z: -0.05 }, dir: { x: 0, y: -1, z: 0 }, r: 0.16, depth: 0.05 },
    { p: { x: -0.2, y: 0.05, z: -0.3 }, dir: { x: 0.1, y: 0, z: 1 }, r: 0.12, depth: 0.035 },
  ];
  const cracks = growCracks(casing, { x: -0.25, y: 0.1, z: -0.3 }, { x: 0, y: 0, z: 1 }, 0.9, new Rng(7), { radial: true, width: 0.004 });
  const cg = polyToRenderGeom(casing, { tessCell: 0.04, dents, cracks, crackSurf: 7, dentDarken: 0.4 });
  const cm = toMesh("casing", cg, scene, lit);
  cm.position = new Vector3(-0.75, 0.28, 0.3);

  // lathe bowl tiles
  const tiles = latheTiles({
    profile: [
      [0.08, 0],
      [0.14, 0.04],
      [0.19, 0.11],
      [0.21, 0.17],
    ],
    thickness: 0.012,
    segments: 28,
    capBottom: true,
    outer: faceAttr(2, 0xffffff, { smooth: 1 }),
    inner: faceAttr(4, 0xffffff, { smooth: 2 }),
    edge: faceAttr(3),
  });
  // internal seam faces between fused tiles are skipped (they only cause depth-tie seams)
  const tilePolys = tiles.map((t) => t.poly);
  let hiddenCount = 0;
  const bowlGeoms = tilePolys.map((p) => {
    const hidden = polyHiddenFaces(p, tilePolys);
    hiddenCount += hidden.size;
    return polyToRenderGeom({ verts: p.verts, faces: p.faces.filter((_, i) => !hidden.has(i)) });
  });
  const bowl = toMesh("bowl", mergeRenderGeoms(bowlGeoms), scene, lit);
  bowl.position = new Vector3(0.75, 0, 0.1);

  // fractured slab (radial glass-like pattern on a thick slab so cells are visible), cells pushed apart
  const slab = polyTransform(polyBox({ x: 0.9, y: 0.03, z: 0.7 }, faceAttr(5)), { p: { x: 0, y: 0, z: 0 }, q: qeuler(0, 0.2, 0) });
  const seeds = generateSeeds(slab, { pattern: "radial", impact: { x: 0.05, y: 0.015, z: -0.05 }, dir: { x: 0, y: -1, z: 0 }, radius: 0.3, count: 40, rng: new Rng(11) });
  const cells = voronoiFracture(slab, seeds, { interiorAttr: faceAttr(6, 0xffffff, { interior: true }) });
  const parts: RenderGeom[] = [];
  for (const c of cells) {
    const off = { x: (c.centroid.x - 0.05) * 0.18, y: 0, z: (c.centroid.z + 0.05) * 0.18 };
    parts.push(polyToRenderGeom(polyTransform(c.poly, { p: off, q: { x: 0, y: 0, z: 0, w: 1 } })));
  }
  const fm = toMesh("frac", mergeRenderGeoms(parts), scene, lit);
  fm.position = new Vector3(0, 0.015, -0.75);

  await scene.whenReadyAsync();
  for (let i = 0; i < 3; i++) scene.render();
  // sample centre of the casing's top to verify it renders lit (front faces visible)
  return {
    winding: { asIsVisible, reversedVisible, left, right, convention: "RenderGeom triangles: cross(p1-p0,p2-p0) = -n (clockwise seen from outside)" },
    casing: { verts: cg.vertexCount, tris: cg.indices.length / 3, cracks: cracks.length },
    bowl: { tiles: tiles.length, hiddenInternalFaces: hiddenCount },
    fracture: { cells: cells.length },
  };
}
