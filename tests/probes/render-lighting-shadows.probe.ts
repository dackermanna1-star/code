// Probe: sun shadows through a window. Compares ShadowGenerator / CascadedShadowGenerator variants by rendering
// a top-down view of the floor and scoring each floor sample against raycast ground truth (lit vs in shadow).
import {
  Vector3, Color3, FreeCamera, HemisphericLight, Ray, ShadowGenerator, CascadedShadowGenerator,
  SceneInstrumentation, type IShadowGenerator,
} from "@babylonjs/core";
import { makeEngine, toScreen, readAll, lumAt, renderFrames, now } from "./render-lighting-util.ts";
import { buildRoom, makeSun, ROOM } from "./render-lighting-room.ts";

export async function probe(): Promise<any> {
  const { engine, scene } = makeEngine();
  const cam = new FreeCamera("cam", new Vector3(2.5, 2.9, 2.0), scene);
  cam.setTarget(new Vector3(2.5, 0, 2.0001));
  cam.fov = 1.25;
  cam.minZ = 0.05;
  cam.maxZ = 200;
  const si = new SceneInstrumentation(scene);
  const room = buildRoom(scene);
  for (const m of room.meshes) m.receiveShadows = true;
  const sun = makeSun(scene, 225, 20);
  sun.intensity = 3;
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.25;
  hemi.diffuse = new Color3(0.55, 0.65, 0.85);
  hemi.groundColor = new Color3(0.25, 0.2, 0.15);

  // ground truth on a floor grid (world matrices must be computed first: render once before picking!)
  scene.render();
  const toSun = sun.direction.scale(-1).normalize();
  const isLit = (p: Vector3): boolean => {
    const hit = scene.pickWithRay(new Ray(p.add(new Vector3(0, 0.002, 0)), toSun, 60), (m) => room.meshes.includes(m as any));
    return !hit || !hit.hit;
  };
  const samples: { p: Vector3; lit: boolean }[] = [];
  for (let x = 0.15; x < ROOM.w; x += 0.15) {
    for (let z = 0.15; z < ROOM.d; z += 0.15) {
      const p = new Vector3(x, 0, z);
      // skip points under props (their top faces are not the floor)
      if (room.props.some((m) => { const b = m.getBoundingInfo().boundingBox; return x > b.minimumWorld.x - 0.02 && x < b.maximumWorld.x + 0.02 && z > b.minimumWorld.z - 0.02 && z < b.maximumWorld.z + 0.02 && b.minimumWorld.y < 0.05; })) continue;
      const lit = isLit(p);
      const e = 0.06; // exclude penumbra / boundary samples
      const nb = [new Vector3(x + e, 0, z), new Vector3(x - e, 0, z), new Vector3(x, 0, z + e), new Vector3(x, 0, z - e)];
      if (nb.some((q) => isLit(q) !== lit)) continue;
      samples.push({ p, lit });
    }
  }
  scene.render();
  const screenPts = samples.map((s) => toScreen(scene, cam, s.p));

  async function score(label: string, gen: IShadowGenerator | null, extra: any = {}): Promise<any> {
    console.log("score start", label, Math.round(now()));
    const t0 = now();
    await scene.whenReadyAsync();
    const readyMs = Math.round(now() - t0);
    await renderFrames(scene, 6);
    const fb = await readAll(engine);
    const litL: number[] = [];
    const shL: number[] = [];
    samples.forEach((s, i) => { const v = lumAt(fb, screenPts[i].x, screenPts[i].y, 1); (s.lit ? litL : shL).push(v); });
    const med = (a: number[]) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)] ?? 0; };
    const litMed = med(litL), shMed = med(shL);
    const thr = (litMed + shMed) / 2;
    const t1 = now();
    for (let i = 0; i < 5; i++) scene.render();
    return {
      label, readyMs, litN: litL.length, shadowN: shL.length, litMedian: Math.round(litMed), shadowMedian: Math.round(shMed),
      litRenderedDark: litL.filter((v) => v < thr).length, shadowRenderedBright: shL.filter((v) => v > thr).length,
      drawCalls: si.drawCallsCounter.current, swiftshaderMsPerFrame: +((now() - t1) / 5).toFixed(1),
      shadowMapSize: gen?.getShadowMap()?.getSize(), ...extra,
    };
  }

  const out: any = { samples: samples.length, litSamples: samples.filter((s) => s.lit).length, results: [] as any[] };
  out.results.push(await score("no shadows", null));

  const addCasters = (g: ShadowGenerator) => { for (const m of room.casters) g.addShadowCaster(m, false); };

  // A: ShadowGenerator defaults (bias 5e-5, no filter), auto-extends ortho, z range = camera minZ..maxZ
  let sg = new ShadowGenerator(2048, sun);
  addCasters(sg);
  out.results.push(await score("SG 2048 defaults (no filter, autoCalcShadowZBounds=false)", sg, { shadowMinZ: sun.shadowMinZ, shadowMaxZ: sun.shadowMaxZ }));
  // B: tight z bounds + PCF
  sun.autoCalcShadowZBounds = true;
  sg.usePercentageCloserFiltering = true;
  sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  out.results.push(await score("SG 2048 PCF medium + autoCalcShadowZBounds", sg, { shadowMinZ: sun.shadowMinZ, shadowMaxZ: sun.shadowMaxZ, ortho: [sun.orthoLeft, sun.orthoRight, sun.orthoBottom, sun.orthoTop] }));
  sg.bias = 0.0005;
  out.results.push(await score("SG 2048 PCF medium bias .0005", sg));
  sg.normalBias = 0.02;
  out.results.push(await score("SG 2048 PCF medium bias .0005 normalBias .02", sg));
  sg.bias = 0.002;
  out.results.push(await score("SG 2048 PCF medium bias .002 normalBias .02", sg));
  sg.bias = 0.0005;
  sg.filteringQuality = ShadowGenerator.QUALITY_HIGH;
  out.results.push(await score("SG 2048 PCF high bias .0005 normalBias .02", sg));
  sg.useContactHardeningShadow = true; // PCSS
  sg.contactHardeningLightSizeUVRatio = 0.02;
  out.results.push(await score("SG 2048 PCSS bias .0005", sg, { filter: sg.filter }));
  sg.usePercentageCloserFiltering = true;
  sg.dispose();
  // C: 1024 map
  sg = new ShadowGenerator(1024, sun);
  addCasters(sg);
  sg.usePercentageCloserFiltering = true;
  sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  sg.bias = 0.0005;
  sg.normalBias = 0.02;
  out.results.push(await score("SG 1024 PCF medium bias .0005 normalBias .02", sg));
  sg.dispose();
  sun.autoCalcShadowZBounds = false;

  // D: CSM
  const csm = new CascadedShadowGenerator(2048, sun);
  addCasters(csm);
  csm.numCascades = 3;
  csm.lambda = 0.9;
  csm.shadowMaxZ = 20;
  csm.stabilizeCascades = true;
  csm.bias = 0.002;
  csm.normalBias = 0.02;
  csm.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  out.results.push(await score("CSM 2048 x3 PCF med lambda .9 maxZ 20 stabilize bias .002 nb .02", csm, { shadowMaxZ: csm.shadowMaxZ }));
  csm.stabilizeCascades = false;
  csm.bias = 0.0005;
  out.results.push(await score("CSM 2048 x3 bias .0005 nb .02 no stabilize", csm));
  csm.autoCalcDepthBounds = true;
  out.results.push(await score("CSM 2048 x3 autoCalcDepthBounds", csm, { minD: csm.minDistance, maxD: csm.maxDistance }));
  csm.autoCalcDepthBounds = false;
  const shadowMaxZBefore = csm.shadowMaxZ;
  csm.shadowMaxZ = 500; // > camera.maxZ (200): silently ignored
  out.csmShadowMaxZIgnored = { before: shadowMaxZBefore, after: csm.shadowMaxZ };
  csm.shadowMaxZ = 20;
  csm.dispose();

  // E: fixed frustum ShadowGenerator (no per-frame bounds fitting)
  sun.shadowFrustumSize = 14;
  sun.shadowMinZ = 5;
  sun.shadowMaxZ = 40;
  sg = new ShadowGenerator(2048, sun);
  addCasters(sg);
  sg.usePercentageCloserFiltering = true;
  sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  sg.bias = 0.0005;
  sg.normalBias = 0.02;
  out.results.push(await score("SG 2048 PCF medium fixed frustum 14m, z 5..40, bias .0005 nb .02", sg));
  // refresh-once static map
  sg.getShadowMap()!.refreshRate = 0; // RenderTargetTexture.REFRESHRATE_RENDER_ONCE
  await renderFrames(scene, 3);
  const dcOnce = si.drawCallsCounter.current;
  out.refreshOnceDrawCalls = dcOnce;
  sg.getShadowMap()!.refreshRate = 1;
  await renderFrames(scene, 3);
  out.refreshEveryFrameDrawCalls = si.drawCallsCounter.current;
  return out;
}
