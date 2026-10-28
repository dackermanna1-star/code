// Probe: RawTexture2DArray behaviour: upload paths & orientation, REPEAT wrapping, layer selection, sampling
// modes, mipmaps, GL parameters, updateMipLevel, update costs. Uses StandardMaterial + WorldMaterialPlugin with
// disableLighting + white emissive so the framebuffer shows the raw texel colours.
import {
  Engine, Scene, Vector3, Color3, Color4, FreeCamera, Camera, Mesh, VertexData, StandardMaterial, Texture, Constants,
  RawTexture2DArray, UploadImageToTexture2DArrayLayer, CreateTexture2DArrayFromImageUrlsAsync, Matrix, type BaseTexture,
} from "@babylonjs/core";
import { WorldMaterialPlugin, createTextureArray, canvasToLayer, decodeImageToLayer, flipRowsRGBA } from "./render-materials-worldmat.ts";

const S = 64;

function quadrantCanvas(): HTMLCanvasElement {
  // TL red, TR green, BL blue, BR white
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#ff0000"; g.fillRect(0, 0, S / 2, S / 2);
  g.fillStyle = "#00ff00"; g.fillRect(S / 2, 0, S / 2, S / 2);
  g.fillStyle = "#0000ff"; g.fillRect(0, S / 2, S / 2, S / 2);
  g.fillStyle = "#ffffff"; g.fillRect(S / 2, S / 2, S / 2, S / 2);
  return c;
}

function checker(size: number, cell: number, a: number, b: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? a : b;
    out.set([v, v, v, 255], (y * size + x) * 4);
  }
  return out;
}

const solid = (r: number, g: number, b: number) => {
  const out = new Uint8Array(S * S * 4);
  for (let i = 0; i < out.length; i += 4) out.set([r, g, b, 255], i);
  return out;
};

function classify(p: number[]): string {
  const [r, g, b] = p;
  if (r > 200 && g > 200 && b > 200) return "white";
  if (r > 180 && g < 80 && b < 80) return "red";
  if (g > 180 && r < 80 && b < 80) return "green";
  if (b > 180 && r < 80 && g < 80) return "blue";
  if (r < 40 && g < 40 && b < 40) return "black";
  return `?(${r},${g},${b})`;
}

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const gl = (engine as unknown as { _gl: WebGL2RenderingContext })._gl;
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);
  const cam = new FreeCamera("cam", new Vector3(0, 0, -10), scene);
  cam.setTarget(Vector3.Zero());
  cam.mode = Camera.ORTHOGRAPHIC_CAMERA;
  const aspect = engine.getRenderWidth() / engine.getRenderHeight();
  cam.orthoTop = 5; cam.orthoBottom = -5; cam.orthoLeft = -5 * aspect; cam.orthoRight = 5 * aspect;
  const out: Record<string, unknown> = {};

  const makeMat = (name: string, tex: BaseTexture | null) => {
    const m = new StandardMaterial(name, scene);
    m.disableLighting = true;
    m.emissiveColor = Color3.White();
    const p = new WorldMaterialPlugin(m);
    p.setTextures(tex, null);
    return m;
  };
  // quad facing the camera (-Z): U=+X, V=+Y ; uv rectangle [u0,u1]x[v0,v1]
  const quad = (name: string, cx: number, cy: number, w: number, h: number, uv: [number, number, number, number], layer: number, mat: StandardMaterial) => {
    const m = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = [cx - w / 2, cy - h / 2, 0, cx + w / 2, cy - h / 2, 0, cx + w / 2, cy + h / 2, 0, cx - w / 2, cy + h / 2, 0];
    vd.normals = [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
    vd.uvs = [uv[0], uv[2], uv[1], uv[2], uv[1], uv[3], uv[0], uv[3]];
    vd.colors = new Array(16).fill(1);
    vd.indices = [0, 1, 2, 0, 2, 3];
    vd.applyToMesh(m);
    m.setVerticesData("surf", [layer, 0, 1, 0, layer, 0, 1, 0, layer, 0, 1, 0, layer, 0, 1, 0], false, 4);
    m.material = mat;
    return m;
  };
  const w = engine.getRenderWidth(), h = engine.getRenderHeight();
  const read = async (x: number, y: number) => {
    const sp = Vector3.Project(new Vector3(x, y, 0), Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
    const d = (await engine.readPixels(Math.round(sp.x), Math.round(h - sp.y), 1, 1)) as Uint8Array;
    return [d[0], d[1], d[2]];
  };
  const readRow = async (x0: number, x1: number, y: number) => {
    const a = Vector3.Project(new Vector3(x0, y, 0), Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
    const b = Vector3.Project(new Vector3(x1, y, 0), Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
    const px0 = Math.round(a.x), px1 = Math.round(b.x);
    const d = (await engine.readPixels(px0, Math.round(h - a.y), px1 - px0, 1)) as Uint8Array;
    const lum: number[] = [];
    for (let i = 0; i < px1 - px0; i++) lum.push(d[i * 4]);
    return lum;
  };

  // ---------------- A) upload paths / orientation
  const qc = quadrantCanvas();
  const raw = canvasToLayer(qc, false); // row 0 = canvas top
  const flipped = canvasToLayer(qc, true);
  const t1 = createTextureArray(scene, [raw], S, { mipmaps: false, samplingMode: Texture.NEAREST_SAMPLINGMODE });
  const t2 = createTextureArray(scene, [flipped], S, { mipmaps: false, samplingMode: Texture.NEAREST_SAMPLINGMODE });
  while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
  const t3 = new RawTexture2DArray(raw.slice(), S, S, 1, Constants.TEXTUREFORMAT_RGBA, scene, false, true /* invertY */, Texture.NEAREST_SAMPLINGMODE);
  out.A3_invertYTrue_glErrorAfterCreate = gl.getError();
  const t4 = new RawTexture2DArray(null, S, S, 1, Constants.TEXTUREFORMAT_RGBA, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
  UploadImageToTexture2DArrayLayer(t4, qc, 0, { invertY: true });
  out.A4_glError = gl.getError();
  const bmp = await createImageBitmap(qc);
  const t5 = new RawTexture2DArray(null, S, S, 1, Constants.TEXTUREFORMAT_RGBA, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
  UploadImageToTexture2DArrayLayer(t5, bmp, 0, { invertY: true });
  out.A5_glError = gl.getError();
  // JPEG round trip through a blob URL (same path as a real .jpg URL)
  const jpgBlob = await new Promise<Blob>((res) => qc.toBlob((b) => res(b!), "image/jpeg", 0.95));
  const jpgUrl = URL.createObjectURL(jpgBlob);
  const t6 = await CreateTexture2DArrayFromImageUrlsAsync(scene, [jpgUrl], { generateMipMaps: false, samplingMode: Texture.NEAREST_SAMPLINGMODE });
  const t6b = await CreateTexture2DArrayFromImageUrlsAsync(scene, [jpgUrl], { generateMipMaps: false, samplingMode: Texture.NEAREST_SAMPLINGMODE, invertY: true });
  const t6c = await CreateTexture2DArrayFromImageUrlsAsync(scene, [jpgUrl], { generateMipMaps: false, samplingMode: Texture.NEAREST_SAMPLINGMODE, imageBitmapOptions: { imageOrientation: "flipY" } });
  const t7 = createTextureArray(scene, [await decodeImageToLayer(jpgUrl, S, true)], S, { mipmaps: false, samplingMode: Texture.NEAREST_SAMPLINGMODE });
  const pathTex: Array<[string, BaseTexture]> = [
    ["A1_getImageData_noFlip", t1], ["A2_getImageData_flipRows", t2], ["A3_raw_invertYtrue", t3],
    ["A4_upload_canvas_invertY", t4], ["A5_upload_imageBitmap_invertY", t5], ["A6_fromUrls_default", t6],
    ["A6b_fromUrls_invertY", t6b], ["A6c_fromUrls_bitmapFlipY", t6c], ["A7_decodeHelper_flip", t7],
  ];
  pathTex.forEach(([name, tex], i) => quad(name, -7.5 + (i % 5) * 3.2, 3 - Math.floor(i / 5) * 3.2, 2.4, 2.4, [0, 1, 0, 1], 0, makeMat(name, tex)));

  // ---------------- B) REPEAT: uv -1..2 in both axes (3x3 repeats), upright texture
  const tB = createTextureArray(scene, [flipped], S, { mipmaps: false, samplingMode: Texture.NEAREST_SAMPLINGMODE });
  quad("B_repeat", 5.5, -2.0, 4.8, 4.8, [-1, 2, -1, 2], 0, makeMat("B", tB));

  // ---------------- C) layer selection (4 solid layers), one quad per layer index
  const tC = createTextureArray(scene, [solid(255, 0, 0), solid(0, 255, 0), solid(0, 0, 255), solid(255, 255, 255)], S, { mipmaps: false });
  for (let l = 0; l < 4; l++) quad("C" + l, -8 + l * 0.9, -4.3, 0.8, 0.8, [0, 1, 0, 1], l, makeMat("C" + l, tC));
  // layer index with interpolation error (2.98 / 3.02) and out of range (7) -> rounding / clamping
  quad("C_2.98", -4.2, -4.3, 0.8, 0.8, [0, 1, 0, 1], 2.98, makeMat("Ca", tC));
  quad("C_7", -3.3, -4.3, 0.8, 0.8, [0, 1, 0, 1], 7, makeMat("Cb", tC));

  // ---------------- D) sampling: magnified 8px checker, NEAREST vs BILINEAR vs updateSamplingMode
  const chk = checker(S, 8, 230, 30);
  const tDn = createTextureArray(scene, [chk], S, { mipmaps: false, samplingMode: Texture.NEAREST_SAMPLINGMODE });
  const tDb = createTextureArray(scene, [chk], S, { mipmaps: false, samplingMode: Texture.BILINEAR_SAMPLINGMODE });
  const tDu = createTextureArray(scene, [chk], S, { mipmaps: false, samplingMode: Texture.BILINEAR_SAMPLINGMODE });
  tDu.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);
  quad("D_nearest", -8.2, -1.6, 1.6, 1.6, [0, 0.5, 0, 0.5], 0, makeMat("Dn", tDn));
  quad("D_bilinear", -6.4, -1.6, 1.6, 1.6, [0, 0.5, 0, 0.5], 0, makeMat("Db", tDb));
  quad("D_updatedToNearest", -4.6, -1.6, 1.6, 1.6, [0, 0.5, 0, 0.5], 0, makeMat("Du", tDu));

  // ---------------- E) mipmaps: 1-texel checker minified (uv 0..24 over 1.6 m)
  const fine = checker(S, 1, 255, 0);
  const tEm = createTextureArray(scene, [fine], S, { mipmaps: true }); // trilinear
  const tEn = createTextureArray(scene, [fine], S, { mipmaps: false }); // bilinear, no mips
  quad("E_mips", -2.8, -1.6, 1.6, 1.6, [0, 24, 0, 24], 0, makeMat("Em", tEm));
  quad("E_noMips", -1.0, -1.6, 1.6, 1.6, [0, 24, 0, 24], 0, makeMat("En", tEn));

  await scene.whenReadyAsync();
  scene.render();
  scene.render();

  const orient: Record<string, string> = {};
  for (let i = 0; i < pathTex.length; i++) {
    const cx = -7.5 + (i % 5) * 3.2, cy = 3 - Math.floor(i / 5) * 3.2;
    const tl = classify(await read(cx - 0.6, cy + 0.6));
    const tr = classify(await read(cx + 0.6, cy + 0.6));
    const bl = classify(await read(cx - 0.6, cy - 0.6));
    const br = classify(await read(cx + 0.6, cy - 0.6));
    orient[pathTex[i][0]] = `TL=${tl} TR=${tr} BL=${bl} BR=${br}` + (tl === "red" && tr === "green" && bl === "blue" ? "  (UPRIGHT)" : tl === "blue" && bl === "red" ? "  (UPSIDE-DOWN)" : "");
  }
  out.A_orientation_expectUpright_TLred_TRgreen_BLblue_BRwhite = orient;
  out.A6_jpegRedPixel = await read(-7.5 + 0 * 3.2 + (5 % 5) * 0, 0); // placeholder overwritten below
  out.A7_jpegCornerColor_TL = await read(-7.5 + 3 * 3.2 - 0.6, 3 - 3.2 + 0.6);

  // B) the 3x3 repeat grid: centre of each repeat cell's TL quadrant must be red
  const bRes: string[] = [];
  for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) {
    const cell = 4.8 / 3;
    const x = 5.5 - 2.4 + gx * cell + cell * 0.25;
    const y = -2.0 - 2.4 + gy * cell + cell * 0.75;
    bRes.push(classify(await read(x, y)));
  }
  out.B_repeat_TLquadrantOfEachRepeat = bRes.join(",");

  // C) layers
  const cRes: string[] = [];
  for (let l = 0; l < 4; l++) cRes.push(classify(await read(-8 + l * 0.9, -4.3)));
  out.C_layers_0to3 = cRes.join(",");
  out.C_layer2_98_rounds_to = classify(await read(-4.2, -4.3));
  out.C_layer7_of4_clamps_to = classify(await read(-3.3, -4.3));

  // D) unique values along a row crossing checker edges
  const uniq = (a: number[]) => new Set(a).size;
  out.D_uniqueLum_nearest = uniq(await readRow(-8.9, -7.5, -1.6));
  out.D_uniqueLum_bilinear = uniq(await readRow(-7.1, -5.7, -1.6));
  out.D_uniqueLum_updatedToNearest = uniq(await readRow(-5.3, -3.9, -1.6));

  // E) luminance std-dev over a row of the minified checker
  const std = (a: number[]) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return +Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length).toFixed(1); };
  out.E_lumStdDev_mipmapped = std(await readRow(-3.5, -2.1, -1.6));
  out.E_lumStdDev_noMips = std(await readRow(-1.7, -0.3, -1.6));

  // F) GL texture parameters of the arrays (after they've been bound by a render)
  const params = (tex: BaseTexture) => {
    const it = tex.getInternalTexture() as unknown as { _hardwareTexture: { underlyingResource: WebGLTexture } };
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, it._hardwareTexture.underlyingResource);
    const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
    const r = {
      MIN: gl.getTexParameter(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER),
      MAG: gl.getTexParameter(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER),
      WRAP_S: gl.getTexParameter(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S),
      WRAP_T: gl.getTexParameter(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T),
      ANISO: aniso ? gl.getTexParameter(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT) : "n/a",
    };
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    engine.resetTextureCache();
    return r;
  };
  out.F_glEnums = { NEAREST: gl.NEAREST, LINEAR: gl.LINEAR, LINEAR_MIPMAP_LINEAR: gl.LINEAR_MIPMAP_LINEAR, REPEAT: gl.REPEAT, CLAMP_TO_EDGE: gl.CLAMP_TO_EDGE };
  out.F_params_trilinearMips = params(tEm);
  out.F_params_bilinearNoMips = params(tEn);
  out.F_params_nearest = params(tDn);
  out.F_caps = { MAX_ARRAY_TEXTURE_LAYERS: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS), MAX_TEXTURE_SIZE: gl.getParameter(gl.MAX_TEXTURE_SIZE), maxAnisotropy: engine.getCaps().maxAnisotropy };

  // G) updateMipLevel(data, 1) on WebGL
  while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
  const tG = createTextureArray(scene, [solid(255, 0, 0)], S, { mipmaps: true });
  const gq = quad("G", 8.5, 3.5, 1.2, 1.2, [0, 1, 0, 1], 0, makeMat("G", tG));
  await scene.whenReadyAsync();
  scene.render();
  const before = classify(await read(8.5, 3.5));
  const half = new Uint8Array((S / 2) * (S / 2) * 4);
  for (let i = 0; i < half.length; i += 4) half.set([0, 255, 0, 255], i);
  tG.updateMipLevel(half, 1);
  out.G_updateMipLevel1_glError = gl.getError();
  scene.render();
  out.G_baseLevelBefore_after = `${before} -> ${classify(await read(8.5, 3.5))}`;
  gq.dispose();

  // H) update costs: 16 layers of 256x256 RGBA
  const big = 256, layers = 16;
  const bigData = new Uint8Array(big * big * 4 * layers);
  for (let i = 0; i < bigData.length; i++) bigData[i] = (i * 31) & 255;
  let t0 = performance.now();
  const tH = new RawTexture2DArray(bigData, big, big, layers, Constants.TEXTUREFORMAT_RGBA, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  gl.finish();
  out.H_create_16x256_mips_ms = +(performance.now() - t0).toFixed(1);
  t0 = performance.now();
  for (let i = 0; i < 5; i++) tH.update(bigData);
  gl.finish();
  out.H_update_full_16x256_mips_ms = +((performance.now() - t0) / 5).toFixed(1);
  const lc = document.createElement("canvas");
  lc.width = big; lc.height = big;
  lc.getContext("2d")!.fillRect(0, 0, 10, 10);
  t0 = performance.now();
  for (let i = 0; i < 5; i++) UploadImageToTexture2DArrayLayer(tH, lc, i, { invertY: true });
  gl.finish();
  out.H_uploadOneLayerFromCanvas_withMipRegen_ms = +((performance.now() - t0) / 5).toFixed(1);
  const it = tH.getInternalTexture()!;
  it.generateMipMaps = false; // suppress per-layer mip regeneration (re-enable + regenerate once afterwards)
  t0 = performance.now();
  for (let i = 0; i < 5; i++) UploadImageToTexture2DArrayLayer(tH, lc, i, { invertY: true });
  gl.finish();
  out.H_uploadOneLayerFromCanvas_noMipRegen_ms = +((performance.now() - t0) / 5).toFixed(1);
  it.generateMipMaps = true;
  t0 = performance.now();
  const flipBuf = new Uint8Array(big * big * 4);
  for (let i = 0; i < 20; i++) flipRowsRGBA(flipBuf, big, big);
  out.H_flipRows256_ms = +((performance.now() - t0) / 20).toFixed(3);
  t0 = performance.now();
  for (let i = 0; i < 20; i++) lc.getContext("2d")!.getImageData(0, 0, big, big);
  out.H_getImageData256_ms = +((performance.now() - t0) / 20).toFixed(3);

  delete out.A6_jpegRedPixel;
  URL.revokeObjectURL(jpgUrl);
  engine.runRenderLoop(() => scene.render());
  return out;
}
