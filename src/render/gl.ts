// Thin WebGL2 helpers: programs with cached uniforms, textures and framebuffers.

export type GL = WebGL2RenderingContext;

export class Program {
  readonly prog: WebGLProgram;
  private locs = new Map<string, WebGLUniformLocation | null>();
  constructor(readonly gl: GL, vs: string, fs: string, readonly name: string) {
    this.prog = linkProgram(gl, vs, fs, name);
  }
  use(): this { this.gl.useProgram(this.prog); return this; }
  loc(n: string): WebGLUniformLocation | null {
    let l = this.locs.get(n);
    if (l === undefined) { l = this.gl.getUniformLocation(this.prog, n); this.locs.set(n, l); }
    return l;
  }
  i(n: string, v: number): this { this.gl.uniform1i(this.loc(n), v); return this; }
  u(n: string, v: number): this { this.gl.uniform1ui(this.loc(n), v); return this; }
  f(n: string, v: number): this { this.gl.uniform1f(this.loc(n), v); return this; }
  f2(n: string, x: number, y: number): this { this.gl.uniform2f(this.loc(n), x, y); return this; }
  f3(n: string, x: number, y: number, z: number): this { this.gl.uniform3f(this.loc(n), x, y, z); return this; }
  f4(n: string, x: number, y: number, z: number, w: number): this { this.gl.uniform4f(this.loc(n), x, y, z, w); return this; }
  v3(n: string, v: ArrayLike<number>): this { this.gl.uniform3f(this.loc(n), v[0], v[1], v[2]); return this; }
  fv(n: string, v: Float32Array): this { this.gl.uniform1fv(this.loc(n), v); return this; }
  f4v(n: string, v: Float32Array): this { this.gl.uniform4fv(this.loc(n), v); return this; }
  m4(n: string, m: Float32Array): this { this.gl.uniformMatrix4fv(this.loc(n), false, m); return this; }
  m4v(n: string, m: Float32Array): this { this.gl.uniformMatrix4fv(this.loc(n), false, m); return this; }
  tex(n: string, unit: number, t: WebGLTexture | null, target: number = this.gl.TEXTURE_2D): this {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, t);
    gl.uniform1i(this.loc(n), unit);
    return this;
  }
}

function compile(gl: GL, type: number, src: string, name: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) || '';
    const lines = src.split('\n').map((l, i) => `${String(i + 1).padStart(4)}: ${l}`);
    // show context around first error line
    const m = /ERROR: \d+:(\d+)/.exec(log);
    let ctx = '';
    if (m) { const ln = parseInt(m[1], 10); ctx = lines.slice(Math.max(0, ln - 4), ln + 2).join('\n'); }
    throw new Error(`Shader compile error in ${name} (${type === gl.VERTEX_SHADER ? 'vs' : 'fs'}):\n${log}\n${ctx}`);
  }
  return s;
}

export function linkProgram(gl: GL, vs: string, fs: string, name: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, name));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, name));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Program link error in ${name}: ${gl.getProgramInfoLog(p)}`);
  return p;
}

export interface TexOpts {
  filter?: number; wrap?: number; mips?: boolean; compare?: boolean;
}

export function makeTex(gl: GL, w: number, h: number, internal: number, format: number, type: number, o: TexOpts = {}, data: ArrayBufferView | null = null): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  const f = o.filter ?? gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, o.mips ? gl.LINEAR_MIPMAP_LINEAR : f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  const wr = o.wrap ?? gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
  if (o.compare) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  }
  return t;
}

export function makeFbo(gl: GL, colors: WebGLTexture[], depth: WebGLTexture | null, depthLayer = -1): WebGLFramebuffer {
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const bufs: number[] = [];
  colors.forEach((c, i) => {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, c, 0);
    bufs.push(gl.COLOR_ATTACHMENT0 + i);
  });
  if (depth) {
    if (depthLayer >= 0) gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, depth, 0, depthLayer);
    else gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
  }
  gl.drawBuffers(bufs.length ? bufs : [gl.NONE]);
  if (!bufs.length) gl.readBuffer(gl.NONE);
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer incomplete: 0x' + st.toString(16));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fb;
}

/** Common GLSL header. */
export const GLSL_HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
precision highp sampler2DArray;
precision highp sampler2DArrayShadow;
precision highp sampler3D;
`;

/** Fullscreen triangle vertex shader (no attributes). */
export const FULLSCREEN_VS = GLSL_HEADER + `
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
