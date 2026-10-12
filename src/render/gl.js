// Small WebGL2 helpers.

export function compileProgram(gl, vsSource, fsSource, name = 'program') {
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      const numbered = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
      throw new Error(`${name} shader compile failed:\n${log}\n${numbered}`);
    }
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`${name} link failed: ${gl.getProgramInfoLog(prog)}`);
  }
  const uniforms = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    const uname = info.name.replace(/\[0\]$/, '');
    uniforms[uname] = gl.getUniformLocation(prog, info.name);
  }
  const attribs = {};
  const na = gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < na; i++) {
    const info = gl.getActiveAttrib(prog, i);
    attribs[info.name] = gl.getAttribLocation(prog, info.name);
  }
  return { prog, uniforms, attribs, name };
}

// Creates a VAO for an interleaved float buffer. layout: [[attribName, size], ...]
export function createVertexArray(gl, program, buffer, layout) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const stride = layout.reduce((s, [, n]) => s + n, 0) * 4;
  let offset = 0;
  for (const [name, size] of layout) {
    const loc = program.attribs[name];
    if (loc !== undefined && loc >= 0) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
    }
    offset += size * 4;
  }
  gl.bindVertexArray(null);
  return vao;
}

export function createDataTexture(gl, width, height, internalFormat, format, type, data = null) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);
  return tex;
}

// Growable float data texture with fixed width (rows grow as needed).
export class FloatTable {
  constructor(gl, width = 256, minRows = 1) {
    this.gl = gl;
    this.width = width;
    this.rows = 0;
    this.data = new Float32Array(width * 4 * minRows);
    this.texture = null;
    this.dirtyMin = Infinity;
    this.dirtyMax = -1;
    this.ensure(width * minRows);
  }

  ensure(count) {
    const rows = Math.max(1, Math.ceil(count / this.width));
    if (rows <= this.rows) return;
    const data = new Float32Array(rows * this.width * 4);
    data.set(this.data.subarray(0, Math.min(this.data.length, data.length)));
    this.data = data;
    this.rows = rows;
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    this.texture = createDataTexture(gl, this.width, rows, gl.RGBA32F, gl.RGBA, gl.FLOAT, null);
    this.dirtyMin = 0;
    this.dirtyMax = rows * this.width - 1;
  }

  set(i, a, b, c, d) {
    const o = i * 4;
    const data = this.data;
    if (data[o] === a && data[o + 1] === b && data[o + 2] === c && data[o + 3] === d) return;
    data[o] = a; data[o + 1] = b; data[o + 2] = c; data[o + 3] = d;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }

  upload() {
    if (this.dirtyMax < 0) return;
    const gl = this.gl;
    const r0 = Math.floor(this.dirtyMin / this.width);
    const r1 = Math.floor(this.dirtyMax / this.width);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, r0, this.width, r1 - r0 + 1, gl.RGBA, gl.FLOAT,
      this.data.subarray(r0 * this.width * 4, (r1 + 1) * this.width * 4));
    this.dirtyMin = Infinity;
    this.dirtyMax = -1;
  }
}

// Growable dynamic vertex stream.
export class DynamicBuffer {
  constructor(gl, floatsPerVertex, initialVertices = 4096) {
    this.gl = gl;
    this.fpv = floatsPerVertex;
    this.data = new Float32Array(floatsPerVertex * initialVertices);
    this.count = 0;
    this.buffer = gl.createBuffer();
    this.capacity = 0;
  }

  reset() { this.count = 0; }

  reserve(vertices) {
    const need = (this.count + vertices) * this.fpv;
    if (need > this.data.length) {
      const grown = new Float32Array(Math.max(need, this.data.length * 2));
      grown.set(this.data.subarray(0, this.count * this.fpv));
      this.data = grown;
    }
    const o = this.count * this.fpv;
    this.count += vertices;
    return o;
  }

  upload() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const bytes = this.count * this.fpv * 4;
    if (bytes > this.capacity) {
      this.capacity = Math.max(bytes, this.capacity * 2, 65536);
      gl.bufferData(gl.ARRAY_BUFFER, this.capacity, gl.DYNAMIC_DRAW);
    }
    if (this.count) gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.count * this.fpv);
  }
}
