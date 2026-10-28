// Probe: showcase with the PS2 post-process attached after the DefaultRenderingPipeline; checks chain order
// across pipeline rebuilds and runtime toggling. Screenshot shows PS2 mode ON.
import { makeEngine, renderFrames, readAll } from "./render-lighting-util.ts";
import { buildShowcase, chainNames, keepLast } from "./render-lighting-scene.ts";

export async function probe(): Promise<any> {
  const { engine, scene } = makeEngine();
  const s = buildShowcase(scene, engine, { ps2: true });
  const cam = s.camera;
  const ps2 = s.ps2!;
  const drp = s.drp!;
  const out: any = {};
  const compact = () => chainNames(cam).filter((n) => n !== "null");
  out.afterBuild = compact();
  out.ps2InputSize = [ps2.width, ps2.height];

  // A pipeline rebuild (any *Enabled / samples change) re-appends the DRP effects at the END of camera._postProcesses.
  // Our onBuildObservable hook (keepLast) moves ps2 back to the end. Show what happens without the hook:
  drp.onBuildObservable.clear();
  drp.fxaaEnabled = false;
  out.afterRebuildWithoutHook = compact();
  keepLast(cam, ps2);
  drp.onBuildObservable.add(() => keepLast(cam, ps2));
  drp.fxaaEnabled = true;
  out.afterRebuildWithHook = compact();

  // Runtime toggle: detach / re-attach (attach appends at the end)
  cam.detachPostProcess(ps2);
  out.afterDetach = compact();
  cam.attachPostProcess(ps2);
  out.afterReattach = compact();

  await scene.whenReadyAsync();
  await renderFrames(scene, 8);
  // verify quantisation + blockiness on the final image: count distinct values per channel and check 2x2 block equality
  const fb = await readAll(engine);
  const vals = new Set<number>();
  let sameBlocks = 0, blocks = 0;
  for (let y = 100; y < 600; y += 7) {
    for (let x = 100; x < 1100; x += 7) {
      const i = (y * fb.w + x) * 4;
      vals.add(fb.data[i]);
      const j = (y * fb.w + x + 1) * 4;
      blocks++;
      if (fb.data[i] === fb.data[j] && fb.data[i + 1] === fb.data[j + 1]) sameBlocks++;
    }
  }
  out.distinctRedValuesSampled = vals.size;
  out.redValuesSample = Array.from(vals).sort((a, b) => a - b).slice(0, 12);
  out.horizontalNeighbourEqualFraction = +(sameBlocks / blocks).toFixed(2);
  out.drawCalls = s.si.drawCallsCounter.current;
  return out;
}
