// WebGL2 renderer drawing straight into a low resolution canvas that CSS scales up with
// nearest-neighbour filtering.
import { WORLD_VS, WORLD_FS } from './shaders.js';
import { mat4, perspective, mul, fpsView, frustumPlanes } from '../core/math.js';
import { TS } from './texgen.js';

export const VERTEX_BYTES = 32;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    throw new Error('shader compile failed: ' + log);
  }
  return s;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: true, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, WORLD_VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, WORLD_FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link failed: ' + gl.getProgramInfoLog(prog));
    this.prog = prog;
    this.u = {};
    for (const n of ['uVP', 'uModel', 'uCam', 'uSnap', 'uFog', 'uTime', 'uFlick', 'uBright', 'uTex', 'uFogColor', 'uDither', 'uAlphaMul', 'uLightMul', 'uLens']) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }
    this.view = mat4();
    this.proj = mat4();
    this.vp = mat4();
    this.ident = mat4();
    this.planes = new Float32Array(24);
    this.snapScale = 1;
    this.lens = 0;
    this.dither = true;
    this.stats = { draws: 0, tris: 0 };
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
  }

  setResolution(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.w = w; this.h = h;
  }

  uploadTextures(layers) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, TS, TS, layers.length);
    layers.forEach((data, i) => {
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, TS, TS, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
    });
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this.tex = tex;
  }

  // data: ArrayBuffer of interleaved vertices, idx: Uint32Array
  createMesh(data, idx) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    const S = VERTEX_BYTES;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribIPointer(2, 1, gl.UNSIGNED_SHORT, S, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribIPointer(3, 2, gl.UNSIGNED_BYTE, S, 22);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, S, 24);
    gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 4, gl.UNSIGNED_BYTE, true, S, 28);
    gl.bindVertexArray(null);
    return { vao, vbo, ibo, count: idx.length };
  }

  deleteMesh(m) {
    if (!m) return;
    const gl = this.gl;
    gl.deleteBuffer(m.vbo); gl.deleteBuffer(m.ibo); gl.deleteVertexArray(m.vao);
  }

  // cam: {x,y,z,yaw,pitch,roll,fov}, env: {fogColor,fogNear,fogFar,time,flick,bright}
  begin(cam, env) {
    const gl = this.gl;
    gl.viewport(0, 0, this.w, this.h);
    const fc = env.fogColor;
    gl.clearColor(fc[0], fc[1], fc[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    perspective(this.proj, cam.fov, this.w / this.h, 0.06, 140);
    fpsView(this.view, cam.x, cam.y, cam.z, cam.yaw, cam.pitch, cam.roll || 0);
    mul(this.vp, this.proj, this.view);
    frustumPlanes(this.vp, this.planes);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uVP, false, this.vp);
    gl.uniformMatrix4fv(this.u.uModel, false, this.ident);
    gl.uniform3f(this.u.uCam, cam.x, cam.y, cam.z);
    const ss = this.snapScale > 0 ? this.snapScale : 1;
    gl.uniform2f(this.u.uSnap, (this.w / 2) / ss, (this.h / 2) / ss);
    gl.uniform2f(this.u.uFog, env.fogNear, env.fogFar);
    gl.uniform1f(this.u.uTime, env.time);
    gl.uniform1fv(this.u.uFlick, env.flick);
    gl.uniform1f(this.u.uBright, env.bright ?? 1);
    gl.uniform1f(this.u.uLightMul, env.lightMul ?? 1);
    gl.uniform1f(this.u.uLens, this.lens);
    gl.uniform3f(this.u.uFogColor, fc[0], fc[1], fc[2]);
    gl.uniform1f(this.u.uDither, this.dither ? 1 : 0);
    gl.uniform1f(this.u.uAlphaMul, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.uniform1i(this.u.uTex, 0);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    this.stats.draws = 0; this.stats.tris = 0;
    this.modelSet = false;
  }

  setModel(m) {
    this.gl.uniformMatrix4fv(this.u.uModel, false, m || this.ident);
    this.modelSet = !!m;
  }

  blend(mode) {
    const gl = this.gl;
    if (mode === 'alpha') {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    } else if (mode === 'add') {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
    } else {
      gl.disable(gl.BLEND); gl.depthMask(true);
    }
  }

  draw(mesh, start = 0, count = mesh.count) {
    if (!count) return;
    const gl = this.gl;
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, start * 4);
    this.stats.draws++;
    this.stats.tris += count / 3;
  }

  end() {
    this.gl.bindVertexArray(null);
  }
}
