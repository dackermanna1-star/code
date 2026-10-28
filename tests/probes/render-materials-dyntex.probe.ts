// Probe: DynamicTexture (canvas -> texture) pipeline, orientation, options, update cost, and sampling modes for
// a PS2-ish look (receding floor strips with different filters).
import {
  Engine, Scene, Vector3, Color3, Color4, FreeCamera, MeshBuilder, StandardMaterial, DynamicTexture, Texture, Matrix,
} from "@babylonjs/core";

function drawBricks(ctx: CanvasRenderingContext2D, s: number) {
  ctx.fillStyle = "#d8d0c0";
  ctx.fillRect(0, 0, s, s);
  const bh = s / 8, bw = s / 4;
  for (let r = 0; r < 8; r++) for (let k = -1; k < 5; k++) {
    const off = r % 2 ? bw / 2 : 0;
    ctx.fillStyle = (r + k) % 3 ? "#a0402a" : "#8a3322";
    ctx.fillRect(k * bw + off + 1, r * bh + 1, bw - 2, bh - 2);
  }
}

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.05, 0.05, 0.08, 1);
  const cam = new FreeCamera("cam", new Vector3(0, 1.2, -4), scene);
  cam.setTarget(new Vector3(0, 0.2, 6));
  const out: Record<string, unknown> = {};

  // 1) Label: top half red, bottom half blue, text. update() default invertY=true -> canvas top = v 1.
  const label = new DynamicTexture("label", { width: 128, height: 128 }, scene, false);
  const lctx = label.getContext() as CanvasRenderingContext2D;
  lctx.fillStyle = "#ff0000"; lctx.fillRect(0, 0, 128, 64);
  lctx.fillStyle = "#0000ff"; lctx.fillRect(0, 64, 128, 64);
  label.drawText("UP", 30, 50, "bold 40px sans-serif", "#ffffff", null, true, true);
  const lm = new StandardMaterial("lm", scene);
  lm.disableLighting = true;
  lm.emissiveTexture = label;
  const plane = MeshBuilder.CreatePlane("labelPlane", { size: 1 }, scene);
  plane.position.set(-1.6, 1.6, 0);
  plane.material = lm;
  out.label_defaults = {
    wrapU: label.wrapU, // 0 = CLAMP (DynamicTexture constructor forces clamp)
    samplingMode: label.samplingMode,
    noMipmap: label.noMipmap,
    hasAlpha: label.hasAlpha,
    invertY_internal_afterUpdate: label.getInternalTexture()?.invertY,
  };

  // 2) options-object constructor: are samplingMode / mipmaps honoured?
  const dtOpt = new DynamicTexture("opt", { width: 64, height: 64 }, { scene, samplingMode: Texture.NEAREST_SAMPLINGMODE, noMipmap: false });
  out.optionsCtor = {
    samplingMode: dtOpt.samplingMode,
    internalSamplingMode: dtOpt.getInternalTexture()?.samplingMode,
    internalGenerateMipMaps: dtOpt.getInternalTexture()?.generateMipMaps,
  };
  const dtPos = new DynamicTexture("pos", 64, scene, true, Texture.NEAREST_SAMPLINGMODE);
  out.positionalCtor = {
    samplingMode: dtPos.samplingMode,
    internalSamplingMode: dtPos.getInternalTexture()?.samplingMode,
    internalGenerateMipMaps: dtPos.getInternalTexture()?.generateMipMaps,
  };

  // 3) receding floor strips with different filtering of the same 64px brick texture
  const modes: Array<[string, number, boolean, number]> = [
    ["NEAREST (no mips)", Texture.NEAREST_SAMPLINGMODE, false, 1],
    ["BILINEAR (no mips)", Texture.BILINEAR_SAMPLINGMODE, false, 1],
    ["LINEAR_LINEAR_MIPNEAREST", Texture.LINEAR_LINEAR_MIPNEAREST, true, 1],
    ["TRILINEAR aniso1", Texture.TRILINEAR_SAMPLINGMODE, true, 1],
    ["TRILINEAR aniso8", Texture.TRILINEAR_SAMPLINGMODE, true, 8],
  ];
  modes.forEach(([name, mode, mips, aniso], i) => {
    const dt = new DynamicTexture("bricks" + i, 64, scene, mips, mode);
    drawBricks(dt.getContext() as CanvasRenderingContext2D, 64);
    dt.update();
    dt.wrapU = dt.wrapV = Texture.WRAP_ADDRESSMODE; // DynamicTexture defaults to CLAMP
    dt.uScale = 2;
    dt.vScale = 20;
    dt.anisotropicFilteringLevel = aniso;
    const m = new StandardMaterial("floor" + i, scene);
    m.disableLighting = true;
    m.emissiveTexture = dt;
    const strip = MeshBuilder.CreateGround("strip" + i, { width: 0.9, height: 20 }, scene);
    strip.position.set(-2 + i * 1.0, 0, 10);
    strip.material = m;
  });

  await scene.whenReadyAsync();
  scene.render();
  const w = engine.getRenderWidth(), h = engine.getRenderHeight();
  const read = async (p: Vector3) => {
    const sp = Vector3.Project(p, Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
    const d = (await engine.readPixels(Math.round(sp.x), Math.round(h - sp.y), 1, 1)) as Uint8Array;
    return [d[0], d[1], d[2]];
  };
  out.label_topPixel_expectRed = await read(new Vector3(-1.6 + 0.35, 1.6 + 0.35, 0));
  out.label_bottomPixel_expectBlue = await read(new Vector3(-1.6 + 0.35, 1.6 - 0.35, 0));

  // 4) cost of redrawing + uploading a 256x256 dynamic texture
  const big = new DynamicTexture("big", 256, scene, true);
  const bctx = big.getContext() as CanvasRenderingContext2D;
  let t0 = performance.now();
  for (let i = 0; i < 20; i++) {
    drawBricks(bctx, 256);
    big.update();
  }
  out.ms_redraw_update_256_mips = +((performance.now() - t0) / 20).toFixed(2);
  t0 = performance.now();
  for (let i = 0; i < 20; i++) big.update();
  out.ms_update_only_256_mips = +((performance.now() - t0) / 20).toFixed(2);

  engine.runRenderLoop(() => scene.render());
  return out;
}
