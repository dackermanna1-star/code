// Instanced voxel-model pass: monsters and ragdoll parts are boxes whose
// fragment shader raymarches the model's 3D texture (see VOX_FS).

import { VOX_VS, VOX_FS, VOX_INSTANCE, VOX_FLOATS } from './shaders.js';
import { compileProgram } from './gl.js';

export const VOX_FULLBRIGHT = 1;
export const VOX_FUZZ = 2;
export const VOX_CHUNK = 4;

// Unit cube, 12 triangles wound counter-clockwise from outside.
const CUBE = (() => {
  const f = [
    [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], // -z
    [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], // +z
    [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], // -y
    [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], // +y
    [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], // -x
    [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], // +x
  ];
  const out = [];
  for (const q of f) for (const i of [0, 1, 2, 0, 2, 3]) out.push(...q[i]);
  return new Float32Array(out);
})();

export class VoxelPass {
  constructor(gl) {
    this.gl = gl;
    this.program = compileProgram(gl, VOX_VS, VOX_FS, 'voxel');
    this.cube = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cube);
    gl.bufferData(gl.ARRAY_BUFFER, CUBE, gl.STATIC_DRAW);
    this.instBuf = gl.createBuffer();
    this.capacity = 0;
    this.data = new Float32Array(VOX_FLOATS * 256);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const loc = this.program.attribs.a_corner;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cube);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
    this.groups = new Map(); // model -> [instance float arrays...]
    this.fuzzGroups = new Map();
    this.count = 0;
    this.maxSize = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE);
  }

  reset() {
    this.groups.clear();
    this.fuzzGroups.clear();
    this.count = 0;
  }

  // m: 12 floats (rows of the voxel->world matrix), lo/hi voxel box,
  // label (0 = all), light, flags, severed mask, alpha, blood colour index.
  add(model, m, lo, hi, label, light, flags = 0, severed = 0, alpha = 1, blood = 176) {
    if (!this.texture(model)) return;
    const map = (flags & VOX_FUZZ) ? this.fuzzGroups : this.groups;
    let list = map.get(model);
    if (!list) map.set(model, list = []);
    list.push(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11],
      lo[0], lo[1], lo[2], label, hi[0], hi[1], hi[2], light, flags, severed, alpha, blood);
    this.count++;
  }

  // Creates the model's 3D texture the first time it's drawn.
  texture(model) {
    if (model.tex !== undefined) return model.tex;
    const gl = this.gl;
    if (!model.data || Math.max(model.nx, model.ny, model.nz) > this.maxSize) { model.tex = null; return null; }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RG8, model.nx, model.ny, model.nz, 0, gl.RG, gl.UNSIGNED_BYTE, model.data);
    model.tex = tex;
    // The GPU copy is all rendering needs.
    model.data = null;
    return tex;
  }

  // Draws the collected instances; fuzz=true draws the spectre ones.
  draw(renderer, fuzz, extralight, fixed) {
    const groups = fuzz ? this.fuzzGroups : this.groups;
    if (!groups.size) return;
    const gl = this.gl;
    const p = this.program;
    renderer.bindCommon(p, extralight, fixed);
    const u = p.uniforms;
    const cam = renderer.cam;
    gl.uniform3f(u.u_cam, cam.x, cam.y, cam.z);
    gl.uniform1f(u.u_pixelScale, renderer.pixelScale);
    gl.uniform1f(u.u_fuzzPhase, Math.floor(renderer.frameCount / 2) % 64);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, renderer.sceneTex);
    gl.uniform1i(u.u_scene, 5);
    gl.uniform1i(u.u_vox, 7);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    if (fuzz) gl.depthMask(false);
    // Upload every group into one buffer, then draw each from its offset.
    let total = 0;
    for (const list of groups.values()) total += list.length;
    if (this.data.length < total) this.data = new Float32Array(Math.max(total, this.data.length * 2));
    let o = 0;
    const offsets = [];
    for (const [model, list] of groups) {
      this.data.set(list, o);
      offsets.push([model, o, list.length / VOX_FLOATS]);
      o += list.length;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    if (this.capacity < this.data.length) {
      gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
      this.capacity = this.data.length;
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, total);
    gl.bindVertexArray(this.vao);
    const stride = VOX_FLOATS * 4;
    for (const [model, start, count] of offsets) {
      let off = start * 4;
      for (const [name, size] of VOX_INSTANCE) {
        const loc = p.attribs[name];
        if (loc !== undefined && loc >= 0) {
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
          gl.vertexAttribDivisor(loc, 1);
        }
        off += size * 4;
      }
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_3D, model.tex);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, count);
    }
    gl.bindVertexArray(null);
    if (fuzz) gl.depthMask(true);
    gl.cullFace(gl.BACK);
    gl.disable(gl.CULL_FACE);
  }
}
