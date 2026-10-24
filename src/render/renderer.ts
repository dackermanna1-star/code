// Deferred WebGL2 renderer for voxel geometry: cascaded shadows, G-buffer, SSAO, deferred lighting,
// forward glass + particles, TAA, bloom and filmic tonemapping.

import { GL, Program, makeTex, makeFbo, FULLSCREEN_VS } from './gl';
import * as S from './shaders';
import { QuadPool } from './quadpool';
import { Frustum } from './frustum';
import { PALETTE, PALETTE_SIZE, PAL_PATTERN } from '../world/materials';
import type { RegionMeshes } from '../world/meshmanager';
import { mat4, mat4Mul, mat4Invert, mat4Ortho, mat4LookAt } from '../engine/math';

export interface BodyDraw { slot: number; start: number; nOp: number; nTr: number; x: number; y: number; z: number; r: number }
export interface PointLight { x: number; y: number; z: number; radius: number; r: number; g: number; b: number }

export interface Environment {
  sunDir: [number, number, number];
  sunColor: [number, number, number];
  skyZenith: [number, number, number];
  skyHorizon: [number, number, number];
  groundColor: [number, number, number];
  fogColor: [number, number, number];
  fogDensity: number;
  fogHeight: number;
  ambient: number;
  exposure: number;
}

export interface CameraState {
  x: number; y: number; z: number;
  view: Float32Array; proj: Float32Array;
  near: number; far: number; fov: number; aspect: number;
}

export interface RenderSettings {
  scale: number;
  shadows: boolean;
  shadowSize: number;
  ssao: boolean;
  taa: boolean;
  bloom: boolean;
  edge: number;
}

/** Hook for systems that draw into the HDR buffer after lighting (particles etc.). */
export interface ForwardPass { draw(r: Renderer): void }
/** Hook for systems that draw opaque geometry into the G-buffer and the shadow maps. */
export interface GeometryPass { drawGBuffer(r: Renderer): void; drawShadow(r: Renderer, lightVP: Float32Array, cascade: number): void }

export const MAX_SLOTS = 4096;
const XFORM_W = 8;

interface Target { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }

export class Renderer {
  readonly gl: GL;
  readonly pool: QuadPool;
  readonly multiDraw: any;
  settings: RenderSettings = { scale: 1, shadows: true, shadowSize: 2048, ssao: true, taa: true, bloom: true, edge: 0.07 };

  // resources
  readonly palAlbedo: WebGLTexture;
  readonly palParams: WebGLTexture;
  private xformTex: WebGLTexture;
  readonly xformData = new Float32Array(MAX_SLOTS * XFORM_W * 4);
  private xformDirtyMax = 0;
  private freeSlots: number[] = [];
  private nextSlot = 1;

  // programs
  private pG: Program; private pShadow: Program; private pLight: Program; private pSSAO: Program; private pBlur: Program;
  private pGlass: Program; private pTAA: Program; private pBloomDown: Program; private pBloomUp: Program; private pFinal: Program; private pCopy: Program;
  readonly emptyVao: WebGLVertexArrayObject;

  // targets
  w = 0; h = 0; canvasW = 0; canvasH = 0;
  private gAlbedo!: WebGLTexture; private gNormal!: WebGLTexture; private gMat!: WebGLTexture; gDepth!: WebGLTexture;
  private gFbo!: WebGLFramebuffer;
  hdr!: WebGLTexture; linDepth!: WebGLTexture;
  private lightFbo!: WebGLFramebuffer; // hdr + linDepth (no depth attachment)
  forwardFbo!: WebGLFramebuffer;       // hdr + gDepth (depth test only)
  private ssaoA!: Target; private ssaoB!: Target;
  private hist: Target[] = [];
  private histIdx = 0;
  private bloomMips: Target[] = [];
  shadowTex: WebGLTexture | null = null;
  private shadowFbos: WebGLFramebuffer[] = [];
  private shadowSize = 0;

  // per frame state
  readonly viewProj = mat4();
  readonly invViewProj = mat4();
  readonly prevViewProj = mat4();
  private prevValid = false;
  private reproj = mat4();
  private tmp = mat4();
  readonly frustum = new Frustum();
  private cascadeVP: Float32Array[] = [mat4(), mat4(), mat4(), mat4()];
  private cascadeVPFlat = new Float32Array(16 * S.NUM_CASCADES);
  private cascadeSplits = [10, 30, 85, 220];
  private cascadeTexel = new Float32Array(S.NUM_CASCADES);
  private cascadeFrame = 0;
  readonly lightPos = new Float32Array(S.MAX_LIGHTS * 4);
  readonly lightCol = new Float32Array(S.MAX_LIGHTS * 4);
  lightCount = 0;
  private firsts = new Int32Array(4096);
  private counts = new Int32Array(4096);
  private drawN = 0;
  frame = 0;
  private jx = 0; private jy = 0;
  time = 0;
  flash = 0;
  damage = 0;
  stats = { drawn: 0, quads: 0, shadowDraws: 0 };
  forwardPasses: ForwardPass[] = [];
  geometryPasses: GeometryPass[] = [];
  /** camera for passes that need it */
  cam!: CameraState;
  env!: Environment;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is not supported by this browser.');
    this.gl = gl;
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float not supported.');
    gl.getExtension('OES_texture_float_linear');
    this.multiDraw = gl.getExtension('WEBGL_multi_draw');
    this.pool = new QuadPool(gl, 512);
    this.emptyVao = gl.createVertexArray()!;

    // palette textures
    const alb = new Uint8Array(256 * 4), prm = new Uint8Array(256 * 4);
    for (let i = 0; i < PALETTE_SIZE; i++) {
      const e = PALETTE[i];
      alb[i * 4] = e.r; alb[i * 4 + 1] = e.g; alb[i * 4 + 2] = e.b; alb[i * 4 + 3] = 255;
      prm[i * 4] = Math.round(e.rough * 255); prm[i * 4 + 1] = Math.round(e.metal * 255);
      prm[i * 4 + 2] = Math.min(255, Math.round((e.emissive / 16) * 255)); prm[i * 4 + 3] = PAL_PATTERN[i];
    }
    this.palAlbedo = makeTex(gl, 256, 1, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, { filter: gl.NEAREST }, alb);
    this.palParams = makeTex(gl, 256, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, { filter: gl.NEAREST }, prm);

    // body transforms: slot 0 = static world scale
    const xd = this.xformData;
    for (let k = 0; k < 2; k++) { xd[k * 12 + 0] = 0.1; xd[k * 12 + 5] = 0.1; xd[k * 12 + 10] = 0.1; }
    this.xformTex = makeTex(gl, XFORM_W, MAX_SLOTS, gl.RGBA32F, gl.RGBA, gl.FLOAT, { filter: gl.NEAREST }, xd);

    this.pG = new Program(gl, S.GBUFFER_VS, S.GBUFFER_FS, 'gbuffer');
    this.pShadow = new Program(gl, S.SHADOW_VS, S.SHADOW_FS, 'shadow');
    this.pLight = new Program(gl, FULLSCREEN_VS, S.LIGHTING_FS.replace('out vec4 oColor;', 'layout(location=0) out vec4 oColor;\nlayout(location=1) out vec4 oLin;').replace(/oColor = vec4\(fullSky\(rd\), 1\.0\);\n    return;/, 'oColor = vec4(fullSky(rd), 1.0); oLin = vec4(1e5);\n    return;').replace('oColor = vec4(col, 1.0);\n}', 'oColor = vec4(col, 1.0); oLin = vec4(dist);\n}'), 'lighting');
    this.pSSAO = new Program(gl, FULLSCREEN_VS, S.SSAO_FS, 'ssao');
    this.pBlur = new Program(gl, FULLSCREEN_VS, S.SSAO_BLUR_FS, 'ssaoBlur');
    this.pGlass = new Program(gl, S.GBUFFER_VS, S.GLASS_FS, 'glass');
    this.pTAA = new Program(gl, FULLSCREEN_VS, S.TAA_FS, 'taa');
    this.pBloomDown = new Program(gl, FULLSCREEN_VS, S.BLOOM_DOWN_FS, 'bloomDown');
    this.pBloomUp = new Program(gl, FULLSCREEN_VS, S.BLOOM_UP_FS, 'bloomUp');
    this.pFinal = new Program(gl, FULLSCREEN_VS, S.FINAL_FS, 'final');
    this.pCopy = new Program(gl, FULLSCREEN_VS, S.COPY_FS, 'copy');
  }

  // ---------------------------------------------------------------- slots
  allocSlot(): number {
    const s = this.freeSlots.pop() ?? (this.nextSlot < MAX_SLOTS ? this.nextSlot++ : -1);
    return s;
  }
  freeSlot(s: number): void { if (s > 0) this.freeSlots.push(s); }

  /** Writes current + previous 3x4 model rows (voxel grid coords -> world). */
  setXform(slot: number, cur: ArrayLike<number>, prev: ArrayLike<number>): void {
    const o = slot * XFORM_W * 4;
    const d = this.xformData;
    for (let i = 0; i < 12; i++) { d[o + i] = cur[i]; d[o + 12 + i] = prev[i]; }
    if (slot + 1 > this.xformDirtyMax) this.xformDirtyMax = slot + 1;
  }

  // ---------------------------------------------------------------- targets
  private resize(): void {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    const w = Math.max(1, Math.floor(cw * this.settings.scale)), h = Math.max(1, Math.floor(ch * this.settings.scale));
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    this.canvasW = cw; this.canvasH = ch;
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    const L = gl.LINEAR, N = gl.NEAREST;
    this.gAlbedo = makeTex(gl, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, { filter: N });
    this.gNormal = makeTex(gl, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, { filter: N });
    this.gMat = makeTex(gl, w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, { filter: N });
    this.gDepth = makeTex(gl, w, h, gl.DEPTH_COMPONENT32F, gl.DEPTH_COMPONENT, gl.FLOAT, { filter: N });
    this.gFbo = makeFbo(gl, [this.gAlbedo, this.gNormal, this.gMat], this.gDepth);
    this.hdr = makeTex(gl, w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, { filter: L });
    this.linDepth = makeTex(gl, w, h, gl.R32F, gl.RED, gl.FLOAT, { filter: N });
    this.lightFbo = makeFbo(gl, [this.hdr, this.linDepth], null);
    this.forwardFbo = makeFbo(gl, [this.hdr], this.gDepth);
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    this.ssaoA = this.target(hw, hh, gl.R8, gl.RED, gl.UNSIGNED_BYTE, L);
    this.ssaoB = this.target(hw, hh, gl.R8, gl.RED, gl.UNSIGNED_BYTE, L);
    this.hist = [this.target(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, L), this.target(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, L)];
    this.prevValid = false;
    this.bloomMips = [];
    let bw = hw, bh = hh;
    for (let i = 0; i < 6 && bw >= 4 && bh >= 4; i++) {
      this.bloomMips.push(this.target(bw, bh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, L));
      bw >>= 1; bh >>= 1;
    }
  }

  private target(w: number, h: number, internal: number, format: number, type: number, filter: number): Target {
    const tex = makeTex(this.gl, w, h, internal, format, type, { filter });
    return { tex, fbo: makeFbo(this.gl, [tex], null), w, h };
  }

  private ensureShadow(): void {
    const size = this.settings.shadowSize;
    if (this.shadowTex && this.shadowSize === size) return;
    const gl = this.gl;
    if (this.shadowTex) { gl.deleteTexture(this.shadowTex); this.shadowFbos.forEach((f) => gl.deleteFramebuffer(f)); }
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH_COMPONENT24, size, size, S.NUM_CASCADES);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shadowTex = t;
    this.shadowFbos = [];
    for (let i = 0; i < S.NUM_CASCADES; i++) this.shadowFbos.push(makeFbo(gl, [], t, i));
    this.shadowSize = size;
    this.cascadeFrame = 0;
  }

  // ---------------------------------------------------------------- draw lists
  private beginList(): void { this.drawN = 0; }
  private add(first: number, count: number): void {
    if (count <= 0) return;
    if (this.drawN >= this.firsts.length) {
      const f = new Int32Array(this.firsts.length * 2); f.set(this.firsts); this.firsts = f;
      const c = new Int32Array(this.counts.length * 2); c.set(this.counts); this.counts = c;
    }
    this.firsts[this.drawN] = first * 6;
    this.counts[this.drawN] = count * 6;
    this.drawN++;
  }
  private flush(): void {
    const gl = this.gl;
    const n = this.drawN;
    if (n === 0) return;
    if (this.multiDraw) this.multiDraw.multiDrawArraysWEBGL(gl.TRIANGLES, this.firsts, 0, this.counts, 0, n);
    else for (let i = 0; i < n; i++) gl.drawArrays(gl.TRIANGLES, this.firsts[i], this.counts[i]);
    this.drawN = 0;
  }

  /** Collect visible geometry for a frustum. transparent=false -> opaque ranges, true -> glass ranges. */
  private collect(regions: RegionMeshes, bodies: BodyDraw[], f: Frustum, transparent: boolean, maxDistSq: number, cx: number, cy: number, cz: number): number {
    let quads = 0;
    const act = regions.active, b = regions.bounds;
    for (let i = 0; i < act.length; i++) {
      const ri = act[i];
      const n = transparent ? regions.nTr[ri] : regions.nOp[ri];
      if (n === 0) continue;
      const o = ri * 6;
      if (maxDistSq > 0) {
        const dx = Math.max(b[o] - cx, 0, cx - b[o + 3]), dy = Math.max(b[o + 1] - cy, 0, cy - b[o + 4]), dz = Math.max(b[o + 2] - cz, 0, cz - b[o + 5]);
        if (dx * dx + dy * dy + dz * dz > maxDistSq) continue;
      }
      if (!f.testBox(b[o], b[o + 1], b[o + 2], b[o + 3], b[o + 4], b[o + 5])) continue;
      const start = regions.start[ri] + (transparent ? regions.nOp[ri] : 0);
      this.add(start, n);
      quads += n;
    }
    for (let i = 0; i < bodies.length; i++) {
      const bd = bodies[i];
      const n = transparent ? bd.nTr : bd.nOp;
      if (n === 0) continue;
      if (!f.testSphere(bd.x, bd.y, bd.z, bd.r)) continue;
      this.add(bd.start + (transparent ? bd.nOp : 0), n);
      quads += n;
    }
    return quads;
  }

  private bindQuadData(p: Program): void {
    p.tex('uQuads', 0, this.pool.tex);
    p.tex('uXforms', 1, this.xformTex);
  }

  private fullscreen(): void { this.gl.drawArrays(this.gl.TRIANGLES, 0, 3); }

  // ---------------------------------------------------------------- frame
  render(cam: CameraState, env: Environment, lights: PointLight[], regions: RegionMeshes, bodies: BodyDraw[], dt: number): void {
    const gl = this.gl;
    this.resize();
    this.cam = cam; this.env = env;
    this.time += dt;
    this.frame++;
    const W = this.w, H = this.h;
    gl.bindVertexArray(this.emptyVao);

    // upload transforms
    if (this.xformDirtyMax > 0) {
      gl.bindTexture(gl.TEXTURE_2D, this.xformTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, XFORM_W, this.xformDirtyMax, gl.RGBA, gl.FLOAT, this.xformData, 0);
      this.xformDirtyMax = 0;
    }

    // matrices
    mat4Mul(this.viewProj, cam.proj, cam.view);
    mat4Invert(this.invViewProj, this.viewProj);
    if (!this.prevValid) this.prevViewProj.set(this.viewProj);
    if (this.settings.taa) {
      const hx = halton(this.frame % 8 + 1, 2) - 0.5, hy = halton(this.frame % 8 + 1, 3) - 0.5;
      this.jx = (hx * 2) / W; this.jy = (hy * 2) / H;
    } else { this.jx = 0; this.jy = 0; }
    this.frustum.setFromMatrix(this.viewProj);

    // ---- shadows
    if (this.settings.shadows) this.renderShadows(cam, env, regions, bodies);

    // ---- G-buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gFbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.colorMask(true, true, true, true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);
    const pg = this.pG.use();
    this.bindQuadData(pg);
    pg.m4('uViewProj', this.viewProj).m4('uPrevViewProj', this.prevViewProj).f2('uJitter', this.jx, this.jy);
    pg.tex('uPalAlbedo', 2, this.palAlbedo).tex('uPalParams', 3, this.palParams).f('uEdge', this.settings.edge);
    this.beginList();
    this.stats.quads = this.collect(regions, bodies, this.frustum, false, 0, cam.x, cam.y, cam.z);
    this.stats.drawn = this.drawN;
    this.flush();
    for (const gp of this.geometryPasses) gp.drawGBuffer(this);
    gl.bindVertexArray(this.emptyVao);

    // ---- SSAO
    if (this.settings.ssao) this.renderSSAO(cam);

    // ---- lighting
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightFbo);
    gl.viewport(0, 0, W, H);
    const pl = this.pLight.use();
    this.setEnvUniforms(pl, env, cam);
    pl.tex('uAlbedo', 0, this.gAlbedo).tex('uNormal', 1, this.gNormal).tex('uMat', 2, this.gMat).tex('uDepth', 3, this.gDepth)
      .tex('uSSAO', 4, this.ssaoA ? this.ssaoA.tex : null).tex('uShadow', 5, this.shadowTex, gl.TEXTURE_2D_ARRAY);
    pl.m4('uInvViewProj', this.invViewProj);
    this.setCascadeUniforms(pl);
    pl.i('uUseSSAO', this.settings.ssao ? 1 : 0).f('uShadowSoft', 1.0).i('uFrame', this.frame);
    // lights
    const nl = Math.min(lights.length, S.MAX_LIGHTS);
    for (let i = 0; i < nl; i++) {
      const L = lights[i];
      this.lightPos[i * 4] = L.x; this.lightPos[i * 4 + 1] = L.y; this.lightPos[i * 4 + 2] = L.z; this.lightPos[i * 4 + 3] = L.radius;
      this.lightCol[i * 4] = L.r; this.lightCol[i * 4 + 1] = L.g; this.lightCol[i * 4 + 2] = L.b; this.lightCol[i * 4 + 3] = 0;
    }
    this.lightCount = nl;
    pl.f4v('uLightPos', this.lightPos).f4v('uLightCol', this.lightCol).i('uLightCount', nl);
    if (!this.settings.shadows) {
      // no shadow map: bind a cleared one so lookups return lit
      this.ensureShadow();
    }
    this.fullscreen();

    // ---- forward: glass, particles
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.forwardFbo);
    gl.viewport(0, 0, W, H);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.disable(gl.CULL_FACE);
    const pgl = this.pGlass.use();
    this.bindQuadData(pgl);
    pgl.m4('uViewProj', this.viewProj).m4('uPrevViewProj', this.prevViewProj).f2('uJitter', this.jx, this.jy);
    pgl.tex('uPalAlbedo', 2, this.palAlbedo).tex('uPalParams', 3, this.palParams).f('uEdge', this.settings.edge);
    pgl.tex('uShadow', 5, this.shadowTex, gl.TEXTURE_2D_ARRAY);
    this.setEnvUniforms(pgl, env, cam);
    this.setCascadeUniforms(pgl);
    this.beginList();
    this.collect(regions, bodies, this.frustum, true, 0, cam.x, cam.y, cam.z);
    this.flush();
    for (const fp of this.forwardPasses) fp.draw(this);
    gl.bindVertexArray(this.emptyVao);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // ---- TAA
    let sceneTex = this.hdr;
    if (this.settings.taa) {
      const src = this.hist[this.histIdx], dst = this.hist[1 - this.histIdx];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, W, H);
      mat4Mul(this.reproj, this.prevViewProj, this.invViewProj);
      const pt = this.pTAA.use();
      pt.tex('uCurrent', 0, this.hdr).tex('uHistory', 1, src.tex).tex('uMat', 2, this.gMat).tex('uDepth', 3, this.gDepth)
        .f2('uTexel', 1 / W, 1 / H).f('uBlend', 0.1).i('uReset', this.prevValid ? 0 : 1).m4('uReproj', this.reproj);
      this.fullscreen();
      this.histIdx = 1 - this.histIdx;
      sceneTex = dst.tex;
    }

    // ---- bloom
    let bloomTex: WebGLTexture | null = null;
    if (this.settings.bloom && this.bloomMips.length > 1) {
      const pd = this.pBloomDown.use();
      let src = sceneTex, sw = W, sh = H;
      for (let i = 0; i < this.bloomMips.length; i++) {
        const t = this.bloomMips[i];
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
        gl.viewport(0, 0, t.w, t.h);
        pd.tex('uSrc', 0, src).f2('uTexel', 1 / sw, 1 / sh).i('uFirst', i === 0 ? 1 : 0).f('uThreshold', 1.0);
        this.fullscreen();
        src = t.tex; sw = t.w; sh = t.h;
      }
      const pu = this.pBloomUp.use();
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = this.bloomMips.length - 1; i > 0; i--) {
        const s = this.bloomMips[i], t = this.bloomMips[i - 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
        gl.viewport(0, 0, t.w, t.h);
        pu.tex('uSrc', 0, s.tex).f2('uTexel', 1 / s.w, 1 / s.h).f('uRadius', 1.0);
        this.fullscreen();
      }
      gl.disable(gl.BLEND);
      bloomTex = this.bloomMips[0].tex;
    }

    // ---- final
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvasW, this.canvasH);
    const pf = this.pFinal.use();
    pf.tex('uScene', 0, sceneTex).tex('uBloom', 1, bloomTex ?? sceneTex)
      .f('uExposure', env.exposure).f('uBloomStrength', bloomTex ? 0.06 : 0).f('uTime', this.time)
      .f2('uRes', this.canvasW, this.canvasH).f('uFlash', this.flash).f('uDamage', this.damage);
    this.fullscreen();

    this.prevViewProj.set(this.viewProj);
    this.prevValid = true;
  }

  invalidateHistory(): void { this.prevValid = false; }

  setEnvUniforms(p: Program, env: Environment, cam: CameraState): void {
    p.v3('uSunDir', env.sunDir).v3('uSunColor', env.sunColor).v3('uSkyZenith', env.skyZenith).v3('uSkyHorizon', env.skyHorizon)
      .v3('uGroundColor', env.groundColor).v3('uFogColor', env.fogColor).f('uFogDensity', env.fogDensity).f('uFogHeight', env.fogHeight)
      .f('uTime', this.time).f3('uCamPos', cam.x, cam.y, cam.z).f('uAmbient', env.ambient);
  }

  setCascadeUniforms(p: Program): void {
    for (let i = 0; i < S.NUM_CASCADES; i++) this.cascadeVPFlat.set(this.cascadeVP[i], i * 16);
    this.gl.uniformMatrix4fv(p.loc('uCascadeVP[0]'), false, this.cascadeVPFlat);
    const sp = this.cascadeSplits;
    p.f4('uCascadeSplits', sp[0], sp[1], sp[2], this.settings.shadows ? sp[3] : -1);
    this.gl.uniform1fv(p.loc('uCascadeTexel[0]'), this.cascadeTexel);
  }

  private renderShadows(cam: CameraState, env: Environment, regions: RegionMeshes, bodies: BodyDraw[]): void {
    const gl = this.gl;
    this.ensureShadow();
    const size = this.shadowSize;
    const ps = this.pShadow.use();
    this.bindQuadData(ps);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    gl.colorMask(false, false, false, false);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.0, 2.0);
    const sd = env.sunDir;
    // camera basis
    const v = cam.view;
    const fwdX = -v[2], fwdY = -v[6], fwdZ = -v[10];
    const tanY = Math.tan(cam.fov / 2), tanX = tanY * cam.aspect;
    const f = new Frustum();
    this.stats.shadowDraws = 0;
    let near = cam.near;
    for (let c = 0; c < S.NUM_CASCADES; c++) {
      const far = this.cascadeSplits[c];
      const update = c < 2 || (this.cascadeFrame % (c === 2 ? 2 : 4)) === (c === 2 ? 0 : 1) || this.cascadeFrame < 4;
      if (update) {
        // bounding sphere of the frustum slice
        const mid = (near + far) * 0.5;
        const diag2 = 1 + tanX * tanX + tanY * tanY;
        // center along the view direction minimizing radius
        let zc = mid * (1 + (tanX * tanX + tanY * tanY));
        if (zc > far) zc = far;
        const rFar = Math.sqrt((far - zc) * (far - zc) + far * far * (diag2 - 1));
        const rNear = Math.sqrt((zc - near) * (zc - near) + near * near * (diag2 - 1));
        let radius = Math.max(rFar, rNear);
        radius = Math.ceil(radius * 16) / 16;
        let ccx = cam.x + fwdX * zc, ccy = cam.y + fwdY * zc, ccz = cam.z + fwdZ * zc;
        // light view basis
        const lv = mat4LookAt(this.tmp, 0, 0, 0, -sd[0], -sd[1], -sd[2], 0, 1, 0);
        // snap center to texel grid in light space
        const texel = (radius * 2) / size;
        let lx = lv[0] * ccx + lv[4] * ccy + lv[8] * ccz;
        let ly = lv[1] * ccx + lv[5] * ccy + lv[9] * ccz;
        const lz = lv[2] * ccx + lv[6] * ccy + lv[10] * ccz;
        lx = Math.floor(lx / texel) * texel; ly = Math.floor(ly / texel) * texel;
        // back to world (inverse of the rotation = transpose)
        ccx = lv[0] * lx + lv[1] * ly + lv[2] * lz;
        ccy = lv[4] * lx + lv[5] * ly + lv[6] * lz;
        ccz = lv[8] * lx + lv[9] * ly + lv[10] * lz;
        const back = radius + 150;
        const view = mat4LookAt(mat4(), ccx + sd[0] * back, ccy + sd[1] * back, ccz + sd[2] * back, ccx, ccy, ccz, 0, 1, 0);
        const proj = mat4Ortho(mat4(), -radius, radius, -radius, radius, 0.5, back + radius + 60);
        mat4Mul(this.cascadeVP[c], proj, view);
        this.cascadeTexel[c] = texel;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbos[c]);
        gl.viewport(0, 0, size, size);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        ps.m4('uLightVP', this.cascadeVP[c]);
        f.setFromMatrix(this.cascadeVP[c]);
        this.beginList();
        this.collect(regions, bodies, f, false, 0, cam.x, cam.y, cam.z);
        this.stats.shadowDraws += this.drawN;
        this.flush();
        if (c < 3) for (const gp of this.geometryPasses) { gp.drawShadow(this, this.cascadeVP[c], c); }
        gl.bindVertexArray(this.emptyVao);
        ps.use();
      }
      near = far;
    }
    this.cascadeFrame++;
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.colorMask(true, true, true, true);
    gl.cullFace(gl.BACK);
  }

  private renderSSAO(cam: CameraState): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    const a = this.ssaoA, b = this.ssaoB;
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
    gl.viewport(0, 0, b.w, b.h);
    const invProj = mat4Invert(mat4(), cam.proj)!;
    const p = this.pSSAO.use();
    p.tex('uDepth', 0, this.gDepth).tex('uNormal', 1, this.gNormal).m4('uProj', cam.proj).m4('uInvProj', invProj).m4('uView', cam.view)
      .f2('uTexel', 1 / b.w, 1 / b.h).f('uRadius', 0.55).i('uFrame', this.frame);
    this.fullscreen();
    const pb = this.pBlur.use();
    pb.f('uNear', cam.near).f('uFar', cam.far);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    pb.tex('uAO', 0, b.tex).tex('uDepth', 1, this.gDepth).f2('uTexel', 1 / a.w, 1 / a.h).f2('uDir', 1, 0);
    this.fullscreen();
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
    pb.tex('uAO', 0, a.tex).f2('uDir', 0, 1);
    this.fullscreen();
    // result in b -> swap so ssaoA holds final
    this.ssaoA = b; this.ssaoB = a;
  }

  /** Current jitter (clip space) for passes that want to match the G-buffer. */
  get jitter(): [number, number] { return [this.jx, this.jy]; }
}

function halton(i: number, b: number): number {
  let f = 1, r = 0;
  while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); }
  return r;
}
