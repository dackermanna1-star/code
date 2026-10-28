// Engine creation options for a game: context attributes, hardware scaling, resize, preserveDrawingBuffer,
// screenshots, audioEngine flag, WebGPU availability, context loss/restore.
// The final visible canvas renders MAGENTA with preserveDrawingBuffer:false and the render loop stopped,
// so the harness --screenshot shows whether Playwright screenshots need preserveDrawingBuffer.
import {
  Engine, AbstractEngine, WebGPUEngine, Scene, FreeCamera, Vector3, Color4, MeshBuilder, HemisphericLight,
  CreateScreenshotUsingRenderTargetAsync, type EngineOptions,
} from "@babylonjs/core";
import { freshCanvas, r, frames } from "./input-loop-util.ts";

function attrs(engine: Engine) {
  const gl = engine._gl;
  const a = gl.getContextAttributes();
  return a ? { ...a } : null;
}

function mk(opts: EngineOptions, antialias?: boolean) {
  const c = freshCanvas();
  const engine = new Engine(c, antialias, opts);
  const scene = new Scene(engine);
  const cam = new FreeCamera("c", new Vector3(0, 0, -3), scene);
  new HemisphericLight("h", new Vector3(0, 1, 0), scene);
  return { c, engine, scene, cam };
}

async function decodeCenter(dataUrl: string): Promise<number[]> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c2 = document.createElement("canvas");
  c2.width = img.width;
  c2.height = img.height;
  const ctx = c2.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return Array.from(ctx.getImageData(img.width >> 1, img.height >> 1, 1, 1).data);
}

export async function probe() {
  const out: Record<string, unknown> = {};
  out.devicePixelRatio = window.devicePixelRatio;

  console.log('step E1');
  // E1 defaults
  {
    const { c, engine } = mk({});
    out.E1_defaults = {
      contextAttributes: attrs(engine),
      webGLVersion: engine.webGLVersion,
      isStencilEnable: engine.isStencilEnable,
      hardwareScalingLevel: engine.getHardwareScalingLevel(),
      clientSize: [c.clientWidth, c.clientHeight],
      renderSize: [engine.getRenderWidth(), engine.getRenderHeight()],
      maxMSAASamples: engine.getCaps().maxMSAASamples,
      audioEngineStatic: AbstractEngine.audioEngine ? "created" : null,
      disableContextMenu: engine.disableContextMenu,
      canvasTabIndex: engine.canvasTabIndex,
      renderEvenInBackground: engine.renderEvenInBackground,
      disablePerformanceMonitorInBackground: engine.disablePerformanceMonitorInBackground,
      adaptToDeviceRatio: engine.adaptToDeviceRatio,
      creationOptionsKeys: Object.keys(engine.getCreationOptions()),
      glInfo: engine.getGlInfo(),
      unmuteButtonInDom: !!document.getElementById("babylonUnmuteIconBtn"),
    };
    engine.dispose();
  }
  console.log('step E2');
  // E2 explicit game options
  {
    const { engine } = mk({ preserveDrawingBuffer: true, stencil: true, powerPreference: "high-performance", antialias: true, adaptToDeviceRatio: true }, true);
    out.E2_gameOptions = { contextAttributes: attrs(engine), hardwareScalingLevel: engine.getHardwareScalingLevel() };
    engine.dispose();
  }
  console.log('step E3');
  // E3 doNotHandleContextLost -> Babylon no longer defaults powerPreference
  {
    const { engine } = mk({ doNotHandleContextLost: true });
    out.E3_doNotHandleContextLost = { powerPreference: attrs(engine)?.powerPreference, flag: engine.doNotHandleContextLost };
    engine.dispose();
  }
  console.log('step E4');
  // E4 audioEngine:true creates the legacy Babylon audio engine (+ unmute UI)
  {
    const { engine } = mk({ audioEngine: true });
    await frames(2);
    const ae = AbstractEngine.audioEngine as unknown as { canUseWebAudio?: boolean; audioContext?: AudioContext } | null;
    out.E4_audioEngineTrue = {
      audioEngineStatic: ae ? "created" : null,
      audioContextState: ae?.audioContext?.state ?? null,
      unmuteButtonInDom: !!document.getElementById("babylonUnmuteIconBtn"),
    };
    engine.dispose();
    out.E4_afterDispose = { audioEngineStatic: AbstractEngine.audioEngine ? "still there" : null };
  }
  console.log('step E5');
  // E5 hardware scaling + resize
  {
    const { c, engine } = mk({});
    let resizes = 0;
    engine.onResizeObservable.add(() => resizes++);
    engine.setHardwareScalingLevel(1 / 0.6);
    const s1 = [engine.getRenderWidth(), engine.getRenderHeight()];
    engine.setHardwareScalingLevel(0.5);
    const s2 = [engine.getRenderWidth(), engine.getRenderHeight()];
    engine.setHardwareScalingLevel(1);
    c.style.width = "50%";
    const beforeResize = [engine.getRenderWidth(), engine.getRenderHeight()];
    engine.resize();
    const afterResize = [engine.getRenderWidth(), engine.getRenderHeight()];
    out.E5_scaling = {
      level_1_over_0_6: s1,
      level_0_5: s2,
      cssWidth50pct_beforeResize: beforeResize,
      afterEngineResize: afterResize,
      onResizeObservableCount: resizes,
    };
    engine.dispose();
  }
  console.log('step E6');
  // E6 preserveDrawingBuffer and canvas.toDataURL after the frame was presented
  console.log('step E6');
  for (const pdb of [false, true]) {
    const { c, engine, scene } = mk({ preserveDrawingBuffer: pdb });
    scene.clearColor = new Color4(1, 0, 0, 1);
    scene.render();
    const sameTask = await decodeCenter(c.toDataURL("image/png"));
    await frames(3);
    const afterFrames = await decodeCenter(c.toDataURL("image/png"));
    out["E6_toDataURL_preserveDrawingBuffer_" + pdb] = { sameTaskAsRender: sameTask, afterFramesPresented: afterFrames };
    engine.dispose();
  }
  console.log('step E7');
  // E7 Babylon screenshot via render target works regardless of preserveDrawingBuffer
  {
    const { engine, scene, cam } = mk({ preserveDrawingBuffer: false });
    scene.clearColor = new Color4(0, 0, 1, 1);
    MeshBuilder.CreateBox("b", { size: 0.5 }, scene);
    scene.render();
    await frames(2);
    // NOTE: it waits for engine.onEndFrameObservable, which only fires under engine.runRenderLoop().
    // Without a running loop the promise never settles (verified: the first version of this probe hung here).
    engine.runRenderLoop(() => scene.render());
    const t0 = performance.now();
    const url = await CreateScreenshotUsingRenderTargetAsync(engine, cam, { width: 64, height: 64 });
    engine.stopRenderLoop();
    out.E7_CreateScreenshotUsingRenderTargetAsync = { centerRGBA: await decodeCenter(url), ms: r(performance.now() - t0, 1), urlPrefix: url.slice(0, 22) };
    engine.dispose();
  }
  console.log('step E8');
  // E8 WebGPU availability (note only)
  out.E8_webgpu = { navigatorGpu: "gpu" in navigator, isSupportedAsync: await WebGPUEngine.IsSupportedAsync };
  console.log('step E9');
  // E9 context loss + restore
  {
    const { engine, scene } = mk({});
    scene.clearColor = new Color4(0, 1, 0, 1);
    MeshBuilder.CreateSphere("s", { diameter: 1 }, scene);
    scene.render();
    const ext = engine._gl.getExtension("WEBGL_lose_context");
    const events: string[] = [];
    engine.onContextLostObservable.add(() => events.push("lost"));
    engine.onContextRestoredObservable.add(() => events.push("restored"));
    let renderedAfter = null as number[] | null;
    if (ext) {
      ext.loseContext();
      await new Promise((r2) => setTimeout(r2, 300));
      let threw = "";
      try {
        scene.render();
      } catch (e) {
        threw = String(e);
      }
      ext.restoreContext();
      await new Promise((r2) => setTimeout(r2, 800));
      scene.render();
      renderedAfter = Array.from((await engine.readPixels(engine.getRenderWidth() >> 1, 5, 1, 1)) as Uint8Array);
      out.E9_contextLoss = { events, renderWhileLostThrew: threw || false, pixelAfterRestore: renderedAfter };
    } else out.E9_contextLoss = "WEBGL_lose_context unavailable";
    engine.dispose();
  }
  console.log('step E10');
  // E10 final visible canvas: preserveDrawingBuffer:false, magenta, loop stopped before resolving
  {
    const { engine, scene } = mk({ preserveDrawingBuffer: false });
    scene.clearColor = new Color4(1, 0, 1, 1);
    engine.runRenderLoop(() => scene.render());
    await frames(5);
    engine.stopRenderLoop();
    await frames(2);
    out.E10 = "magenta canvas, preserveDrawingBuffer:false, render loop stopped; see screenshot";
  }
  return out;
}
