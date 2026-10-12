// Frame orchestration: low-resolution palette-indexed render target, world,
// sky, sprites, particles, decals, 2D overlay and the final palette pass.

import {
  WORLD_VS, WORLD_FS, SKY_FS, WORLD_LAYOUT, WORLD_FLOATS,
  SPRITE_VS, SPRITE_FS, SPRITE_LAYOUT, SPRITE_FLOATS,
  UI_VS, UI_FS, UI_LAYOUT, UI_FLOATS,
  FINAL_VS, FINAL_FS,
} from './shaders.js';
import { compileProgram, createVertexArray, createDataTexture, DynamicBuffer } from './gl.js';
import { perspective, viewMatrix, multiply } from './math.js';
import { WorldGeometry } from './worldgeo.js';

export const SPR_FULLBRIGHT = 1;
export const SPR_FUZZ = 2;
export const SPR_SOLID = 4;
export const SPR_DITHER = 8;
export const SPR_ROUND = 16;
export const UI_SHADEBG = 32;

// Two-triangle corner orders, hoisted out of the per-sprite/particle paths.
const QUAD_ORDER = [0, 1, 2, 0, 2, 3];
const PARTICLE_CORNERS = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, -1, 0, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];

export class Renderer {
  constructor(canvas, res, settings) {
    this.canvas = canvas;
    this.res = res;
    this.settings = settings;
    const gl = canvas.getContext('webgl2', {
      antialias: false, depth: false, stencil: false, alpha: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL 2 is required to run this game.');
    this.gl = gl;
    gl.getExtension('EXT_color_buffer_float');
    this.programs = {
      world: compileProgram(gl, WORLD_VS, WORLD_FS, 'world'),
      sky: compileProgram(gl, WORLD_VS, SKY_FS, 'sky'),
      sprite: compileProgram(gl, SPRITE_VS, SPRITE_FS, 'sprite'),
      ui: compileProgram(gl, UI_VS, UI_FS, 'ui'),
      final: compileProgram(gl, FINAL_VS, FINAL_FS, 'final'),
    };
    res.atlas.bind(gl);
    this.paletteTex = createDataTexture(gl, 256, 14, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.expandPalettes(res.palettes));
    this.colormapTex = createDataTexture(gl, 256, 34, gl.R8, gl.RED, gl.UNSIGNED_BYTE, res.colormaps);
    this.translations = this.buildTranslations();
    this.translationTex = createDataTexture(gl, 256, this.translations.length / 256, gl.R8, gl.RED, gl.UNSIGNED_BYTE, this.translations);

    this.spriteBatch = new DynamicBuffer(gl, SPRITE_FLOATS, 8192);
    this.fuzzBatch = new DynamicBuffer(gl, SPRITE_FLOATS, 1024);
    this.uiBatch = new DynamicBuffer(gl, UI_FLOATS, 8192);
    this.lineBatch = new DynamicBuffer(gl, UI_FLOATS, 8192);
    this.decalBatch = new DynamicBuffer(gl, WORLD_FLOATS, 4096);
    this.spriteVao = createVertexArray(gl, this.programs.sprite, this.spriteBatch.buffer, SPRITE_LAYOUT);
    this.fuzzVao = createVertexArray(gl, this.programs.sprite, this.fuzzBatch.buffer, SPRITE_LAYOUT);
    this.uiVao = createVertexArray(gl, this.programs.ui, this.uiBatch.buffer, UI_LAYOUT);
    this.lineVao = createVertexArray(gl, this.programs.ui, this.lineBatch.buffer, UI_LAYOUT);
    this.decalVao = createVertexArray(gl, this.programs.world, this.decalBatch.buffer, WORLD_LAYOUT);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.finalVao = createVertexArray(gl, this.programs.final, quad, [['a_pos', 2]]);

    this.world = null;
    this.W = 0;
    this.H = 0;
    this.fbo = null;
    this.lights = [];
    this.wipe = null;
    this.frameCount = 0;
    this.resize();
  }

  expandPalettes(pal) {
    const out = new Uint8Array(256 * 14 * 4);
    for (let i = 0; i < 256 * 14; i++) {
      out[i * 4] = pal[i * 3];
      out[i * 4 + 1] = pal[i * 3 + 1];
      out[i * 4 + 2] = pal[i * 3 + 2];
      out[i * 4 + 3] = 255;
    }
    return out;
  }

  // Translation tables: 0 identity, 1 red->gray, 2 red->gold, 3 red->green,
  // 4 red->blue, 5 green->gray (player), 6 green->brown, 7 green->red, 8 red->white(bright)
  buildTranslations() {
    const rows = 9;
    const t = new Uint8Array(256 * rows);
    for (let r = 0; r < rows; r++) for (let i = 0; i < 256; i++) t[r * 256 + i] = i;
    const remapRange = (row, from, to, fromLen, toLen) => {
      for (let i = 0; i < fromLen; i++) {
        t[row * 256 + from + i] = to + Math.min(toLen - 1, Math.floor((i * toLen) / fromLen));
      }
    };
    // Red ramp is 176-191 (+ 32-47 for dark reds)
    remapRange(1, 176, 80, 16, 32);
    remapRange(1, 32, 96, 16, 16);
    remapRange(2, 176, 160, 16, 8);
    remapRange(2, 32, 224, 16, 8);
    remapRange(3, 176, 112, 16, 16);
    remapRange(3, 32, 120, 16, 8);
    remapRange(4, 176, 192, 16, 16);
    remapRange(4, 32, 200, 16, 8);
    remapRange(5, 112, 96, 16, 16);
    remapRange(6, 112, 64, 16, 16);
    remapRange(7, 112, 32, 16, 16);
    remapRange(8, 176, 80, 16, 8);
    remapRange(8, 32, 80, 16, 16);
    return t;
  }

  setLevel(level) {
    if (this.world) {
      this.world.dispose();
      this.gl.deleteVertexArray(this.worldVao);
      this.gl.deleteVertexArray(this.skyVao);
      this.worldVao = this.skyVao = null;
    }
    this.world = level ? new WorldGeometry(this.gl, level, this.res) : null;
    if (this.world) {
      const gl = this.gl;
      this.worldVao = createVertexArray(gl, this.programs.world, this.world.worldBuffer, WORLD_LAYOUT);
      this.skyVao = createVertexArray(gl, this.programs.sky, this.world.skyBuffer, WORLD_LAYOUT);
    }
  }

  setSky(textureName) {
    const t = this.res.textureByName.get(textureName);
    this.skyImage = t ? t.id : -1;
    // Colour used above the top of the sky texture: average of the top rows.
    this.skyTop = 0;
    if (t) {
      const info = this.res.images[t.id];
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = 0; y < Math.min(4, info.height); y++) {
        for (let x = 0; x < info.width; x++) {
          const [cr, cg, cb] = this.res.rgbOf(info.img.pixels[y * info.width + x]);
          r += cr; g += cg; b += cb; n++;
        }
      }
      if (n) this.skyTop = this.res.nearest(r / n, g / n, b / n);
    }
  }

  // --- Render target ------------------------------------------------------

  resize() {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    const s = this.settings;
    const stretch = s.get('aspectCorrect') ? 1.2 : 1.0;
    const physAspect = cw / ch;
    let H;
    const mode = s.get('renderScale');
    if (mode === 'native') H = ch;
    else H = Math.round(200 * Number(mode || 1));
    H = Math.max(200, Math.min(H, 4320));
    let W = Math.round(H * physAspect * stretch);
    // Never narrower than 4:3.
    const minW = Math.round(H * (4 / 3) * stretch);
    let destW = cw, destH = ch, destX = 0, destY = 0;
    if (W < minW) {
      W = minW;
      destH = Math.round(cw / ((W / H) / stretch));
      destY = Math.floor((ch - destH) / 2);
    }
    this.stretch = stretch;
    this.dest = [destX, destY, destW, destH];
    if (W === this.W && H === this.H && this.fbo) return;
    this.W = W;
    this.H = H;
    this.pixelScale = H / 200;
    if (this.fbo) {
      gl.deleteFramebuffer(this.fbo);
      gl.deleteTexture(this.colorTex);
      gl.deleteRenderbuffer(this.depthRb);
      gl.deleteTexture(this.sceneTex);
      gl.deleteTexture(this.oldTex);
      gl.deleteTexture(this.wipeTex);
    }
    this.colorTex = createDataTexture(gl, W, H, gl.R8, gl.RED, gl.UNSIGNED_BYTE, null);
    this.sceneTex = createDataTexture(gl, W, H, gl.R8, gl.RED, gl.UNSIGNED_BYTE, null);
    this.oldTex = createDataTexture(gl, W, H, gl.R8, gl.RED, gl.UNSIGNED_BYTE, null);
    this.wipeTex = createDataTexture(gl, W, 1, gl.R32F, gl.RED, gl.FLOAT, null);
    this.depthRb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.wipe = null;
  }

  // Width in buffer pixels of one 320-wide virtual unit.
  get vScaleX() { return this.pixelScale * this.stretch / 1.2; }
  get vScaleY() { return this.pixelScale; }
  // Left edge of the centred 320x200 virtual screen in buffer pixels.
  get vLeft() { return (this.W - 320 * this.vScaleX) / 2; }

  // --- Frame --------------------------------------------------------------

  beginFrame() {
    const gl = this.gl;
    this.resize();
    this.res.atlas.sync();
    this.frameCount++;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.W, this.H);
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.spriteBatch.reset();
    this.fuzzBatch.reset();
    this.uiBatch.reset();
    this.lineBatch.reset();
    this.decalBatch.reset();
    this.lights.length = 0;
  }

  addLight(x, y, z, radius, power) {
    if (this.lights.length >= 8) {
      // Replace the weakest.
      let wi = 0;
      for (let i = 1; i < this.lights.length; i++) if (this.lights[i][4] < this.lights[wi][4]) wi = i;
      if (this.lights[wi][4] >= power) return;
      this.lights[wi] = [x, y, z, radius, power];
      return;
    }
    this.lights.push([x, y, z, radius, power]);
  }

  // Camera: {x,y,z,yaw,pitch,roll,fov,viewX,viewY,viewW,viewH (buffer px, y from top)}
  setupCamera(cam) {
    const stretch = this.stretch;
    const width43 = this.H * (4 / 3) * stretch;
    const tanX43 = Math.tan((cam.fov * Math.PI) / 360);
    const P = width43 / 2 / tanX43;
    const tanX = cam.viewW / 2 / P;
    const tanY = cam.viewH / 2 / P;
    this.proj = perspective(tanX, tanY, 2, 40000);
    this.view = viewMatrix(cam.x, cam.y, cam.z, cam.yaw, cam.pitch, cam.roll || 0);
    this.viewProj = multiply(this.proj, this.view);
    this.cam = cam;
    this.projScale = P;
  }

  bindCommon(p, extralight, fixedColormap) {
    const gl = this.gl;
    const u = p.uniforms;
    gl.useProgram(p.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.res.atlas.tableTexture);
    gl.uniform1i(u.u_images, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.res.atlas.texture);
    gl.uniform1i(u.u_atlas, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.colormapTex);
    gl.uniform1i(u.u_colormap, 2);
    if (u.u_extralight) gl.uniform1f(u.u_extralight, extralight);
    if (u.u_fixedColormap) gl.uniform1f(u.u_fixedColormap, fixedColormap);
    if (u.u_smoothLight) gl.uniform1f(u.u_smoothLight, this.settings.get('smoothLighting') ? 1 : 0);
    if (u.u_numLights) {
      const n = this.lights.length;
      gl.uniform1i(u.u_numLights, n);
      if (n) {
        const pos = this.lightPos || (this.lightPos = new Float32Array(32));
        const pow = this.lightPow || (this.lightPow = new Float32Array(8));
        for (let i = 0; i < n; i++) {
          const L = this.lights[i];
          pos[i * 4] = L[0]; pos[i * 4 + 1] = L[1]; pos[i * 4 + 2] = L[2]; pos[i * 4 + 3] = L[3];
          pow[i] = L[4];
        }
        gl.uniform4fv(u.u_lights, pos);
        gl.uniform1fv(u.u_lightPower, pow);
      }
    }
    if (u.u_view) gl.uniformMatrix4fv(u.u_view, false, this.view);
    if (u.u_proj) gl.uniformMatrix4fv(u.u_proj, false, this.proj);
  }

  // Draws world + sprites into the 3D viewport. `scene` provides callbacks
  // to fill sprite/particle/decal batches.
  renderWorld(cam, scene) {
    const gl = this.gl;
    const world = this.world;
    if (!world) return;
    this.setupCamera(cam);
    const vx = Math.round(cam.viewX), vw = Math.round(cam.viewW), vh = Math.round(cam.viewH);
    const vy = this.H - Math.round(cam.viewY) - vh;
    gl.viewport(vx, vy, vw, vh);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(vx, vy, vw, vh);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.disable(gl.BLEND);

    world.updateSectors(cam.frac);
    if (scene.beforeUpload) scene.beforeUpload(world);
    world.upload();

    const extralight = cam.extralight || 0;
    const fixed = cam.fixedColormap == null ? -1 : cam.fixedColormap;

    // Walls & flats
    const wp = this.programs.world;
    this.bindCommon(wp, extralight, fixed);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, world.sectorTable.texture);
    gl.uniform1i(wp.uniforms.u_sectors, 3);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, world.surfaceTable.texture);
    gl.uniform1i(wp.uniforms.u_surfaces, 4);
    gl.bindVertexArray(this.worldVao);
    gl.drawArrays(gl.TRIANGLES, 0, world.worldCount);

    // Sky
    if (world.skyCount && this.skyImage >= 0) {
      const sp = this.programs.sky;
      this.bindCommon(sp, extralight, fixed);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, world.sectorTable.texture);
      gl.uniform1i(sp.uniforms.u_sectors, 3);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, world.surfaceTable.texture);
      gl.uniform1i(sp.uniforms.u_surfaces, 4);
      gl.uniform3f(sp.uniforms.u_camPos, cam.x, cam.y, cam.z);
      gl.uniform1f(sp.uniforms.u_skyImage, this.skyImage);
      gl.uniform1f(sp.uniforms.u_skyTop, this.skyTop);
      gl.bindVertexArray(this.skyVao);
      gl.drawArrays(gl.TRIANGLES, 0, world.skyCount);
    }

    // Decals (world program, dynamic buffer)
    if (scene.decals) scene.decals(this, world);
    if (this.decalBatch.count) {
      world.upload();
      this.bindCommon(wp, extralight, fixed);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, world.sectorTable.texture);
      gl.uniform1i(wp.uniforms.u_sectors, 3);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, world.surfaceTable.texture);
      gl.uniform1i(wp.uniforms.u_surfaces, 4);
      this.decalBatch.upload();
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-1, -4);
      gl.depthMask(false);
      gl.bindVertexArray(this.decalVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.decalBatch.count);
      gl.depthMask(true);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // Sprites & particles
    gl.disable(gl.CULL_FACE);
    if (scene.sprites) scene.sprites(this);
    const spp = this.programs.sprite;
    if (this.spriteBatch.count) {
      this.spriteBatch.upload();
      this.bindCommon(spp, extralight, fixed);
      gl.uniform1f(spp.uniforms.u_pixelScale, this.pixelScale);
      gl.uniform1f(spp.uniforms.u_fuzzPhase, this.frameCount % 64);
      gl.bindVertexArray(this.spriteVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.spriteBatch.count);
    }
    // Snapshot for fuzz (spectres, invisibility).
    this.copyScene();
    if (this.fuzzBatch.count) {
      this.fuzzBatch.upload();
      this.bindCommon(spp, extralight, fixed);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.uniform1i(spp.uniforms.u_scene, 5);
      gl.uniform1f(spp.uniforms.u_pixelScale, this.pixelScale);
      gl.uniform1f(spp.uniforms.u_fuzzPhase, Math.floor(this.frameCount / 2) % 64);
      gl.depthMask(false);
      gl.bindVertexArray(this.fuzzVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.fuzzBatch.count);
      gl.depthMask(true);
    }
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, this.W, this.H);
  }

  copyScene() {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, this.W, this.H);
  }

  // Billboard sprite in world space. Corners computed from camera yaw.
  // opts: {image, x, y, z (bottom), width, height, leftOffset, topOffset, flip, light, flags, alpha, roll, scale}
  addSprite(s) {
    const info = this.res.images[s.image];
    if (!info) return;
    const batch = (s.flags & SPR_FUZZ) ? this.fuzzBatch : this.spriteBatch;
    const scale = s.scale || 1;
    const cy = Math.cos(this.cam.yaw), sy = Math.sin(this.cam.yaw);
    // Right vector in doom space.
    const rx = sy, ry = -cy;
    const w = info.width, h = info.height;
    let left = -info.leftOffset * scale;
    let right = (w - info.leftOffset) * scale;
    // Like R_ProjectSprite, a mirrored frame keeps its screen extent and
    // only reverses its columns.
    const top = s.z + info.topOffset * scale;
    const bot = top - h * scale;
    const u0 = s.flip ? w : 0, u1 = s.flip ? 0 : w;
    const corners = [
      [left, bot, u0, h], [right, bot, u1, h], [right, top, u1, 0], [left, top, u0, 0],
    ];
    if (s.roll) {
      // Rotate in the camera plane around the sprite's centre.
      const cxm = (left + right) / 2, czm = (top + bot) / 2;
      const c = Math.cos(s.roll), sn = Math.sin(s.roll);
      for (const k of corners) {
        const dx = k[0] - cxm, dz = k[1] - czm;
        k[0] = cxm + dx * c - dz * sn;
        k[1] = czm + dx * sn + dz * c;
      }
    }
    const o = batch.reserve(6);
    const d = batch.data;
    let p = o;
    for (const idx of QUAD_ORDER) {
      const k = corners[idx];
      d[p++] = s.x + rx * k[0];
      d[p++] = s.y + ry * k[0];
      d[p++] = k[1];
      d[p++] = k[2];
      d[p++] = k[3];
      d[p++] = s.image;
      d[p++] = s.light;
      d[p++] = 0;
      d[p++] = s.flags || 0;
      d[p++] = s.alpha == null ? 1 : s.alpha;
      d[p++] = s.x; d[p++] = s.y; d[p++] = s.cz == null ? s.z : s.cz;
      d[p++] = s.clipZ == null ? 1e9 : s.clipZ;
    }
  }

  // Camera-facing square particle of a solid palette colour.
  addParticle(x, y, z, size, color, light, flags = 0, alpha = 1) {
    const view = this.view;
    // Camera right/up in doom space from the view matrix rows.
    const rx = view[0], rz = view[4], ry = -view[8];
    const ux = view[1], uz = view[5], uy = -view[9];
    const hs = size / 2;
    const o = this.spriteBatch.reserve(6);
    const d = this.spriteBatch.data;
    let p = o;
    for (const c of PARTICLE_CORNERS) {
      d[p++] = x + (rx * c[0] + ux * c[1]) * hs;
      d[p++] = y + (ry * c[0] + uy * c[1]) * hs;
      d[p++] = z + (rz * c[0] + uz * c[1]) * hs;
      d[p++] = c[2];
      d[p++] = c[3];
      d[p++] = -1;
      d[p++] = light;
      d[p++] = color;
      d[p++] = flags | SPR_SOLID;
      d[p++] = alpha;
      d[p++] = x; d[p++] = y; d[p++] = z;
      d[p++] = 1e9;
    }
  }

  // Arbitrary world-space quad with an image (used for flat-lying gibs/casings).
  addWorldQuad(pts, image, light, flags = 0, center = null) {
    const o = this.spriteBatch.reserve(6);
    const d = this.spriteBatch.data;
    let p = o;
    const c = center || [(pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2, (pts[0][2] + pts[2][2]) / 2];
    for (const i of QUAD_ORDER) {
      const q = pts[i];
      d[p++] = q[0]; d[p++] = q[1]; d[p++] = q[2]; d[p++] = q[3]; d[p++] = q[4];
      d[p++] = image; d[p++] = light; d[p++] = 0; d[p++] = flags; d[p++] = 1;
      d[p++] = c[0]; d[p++] = c[1]; d[p++] = c[2];
      d[p++] = 1e9;
    }
  }

  // UI quad with four arbitrary corners (rotated weapon sprites).
  drawImageQuad(id, corners, opts = {}) {
    const info = this.res.images[id];
    if (!info) return;
    const w = info.width, h = info.height;
    const ua = opts.flip ? w : 0, ub = opts.flip ? 0 : w;
    const uv = [[ua, 0], [ub, 0], [ub, h], [ua, h]];
    const o = this.uiBatch.reserve(6);
    const d = this.uiBatch.data;
    let p = o;
    const level = opts.level == null ? -1 : opts.level;
    const flags = (opts.fuzz ? 2 : 0);
    for (const i of [0, 1, 2, 0, 2, 3]) {
      d[p++] = corners[i][0]; d[p++] = corners[i][1]; d[p++] = uv[i][0]; d[p++] = uv[i][1];
      d[p++] = id; d[p++] = level; d[p++] = 0; d[p++] = flags; d[p++] = opts.trans || 0;
    }
  }

  // --- 2D -------------------------------------------------------------------

  // Draws an atlas image at buffer pixel coords (top-left), scaled.
  drawImage(id, x, y, opts = {}) {
    const info = this.res.images[id];
    if (!info) return;
    const sx = opts.scaleX || 1, sy = opts.scaleY || 1;
    const w = (opts.srcW || info.width), h = (opts.srcH || info.height);
    const u0 = opts.srcX || 0, v0 = opts.srcY || 0;
    const x0 = x, y0 = y, x1 = x + w * sx, y1 = y + h * sy;
    const ua = opts.flip ? u0 + w : u0, ub = opts.flip ? u0 : u0 + w;
    this.pushUIQuad(x0, y0, x1, y1, ua, v0, ub, v0 + h, id, opts.level == null ? -1 : opts.level,
      opts.alpha == null ? 0 : opts.alpha, (opts.fuzz ? 2 : 0) | (opts.alpha != null ? 8 : 0), opts.trans || 0);
  }

  pushUIQuad(x0, y0, x1, y1, ua, va, ub, vb, image, level, color, flags, trans) {
    const o = this.uiBatch.reserve(6);
    const d = this.uiBatch.data;
    let p = o;
    const v = [[x0, y0, ua, va], [x1, y0, ub, va], [x1, y1, ub, vb], [x0, y0, ua, va], [x1, y1, ub, vb], [x0, y1, ua, vb]];
    for (const c of v) {
      d[p++] = c[0]; d[p++] = c[1]; d[p++] = c[2]; d[p++] = c[3];
      d[p++] = image; d[p++] = level; d[p++] = color; d[p++] = flags; d[p++] = trans;
    }
  }

  fillRect(x, y, w, h, color) {
    this.pushUIQuad(x, y, x + w, y + h, 0, 0, 1, 1, -1, -1, color, 4, 0);
  }

  // Darken whatever is already rendered under the rect by colormap level.
  shadeRect(x, y, w, h, level) {
    this.flushUI();
    this.copyScene();
    this.pushUIQuad(x, y, x + w, y + h, 0, 0, 1, 1, -1, level, 0, 4 | UI_SHADEBG, 0);
    this.flushUI();
  }

  line(x0, y0, x1, y1, color) {
    const o = this.lineBatch.reserve(2);
    const d = this.lineBatch.data;
    let p = o;
    for (const [x, y] of [[x0, y0], [x1, y1]]) {
      d[p++] = x; d[p++] = y; d[p++] = 0; d[p++] = 0;
      d[p++] = -1; d[p++] = -1; d[p++] = color; d[p++] = 4; d[p++] = 0;
    }
  }

  // Patch in the 320x200 virtual screen, honouring patch offsets.
  drawPatch(name, vx, vy, opts = {}) {
    const p = typeof name === 'string' ? this.res.patch(name) : name;
    if (!p) return;
    const sx = this.vScaleX * (opts.scale || 1), sy = this.vScaleY * (opts.scale || 1);
    const x = this.vLeft + (vx - (opts.noOffset ? 0 : p.leftOffset)) * this.vScaleX;
    const y = (vy - (opts.noOffset ? 0 : p.topOffset)) * this.vScaleY + (opts.yOffsetPx || 0);
    this.drawImage(p.id, x, y, { ...opts, scaleX: sx, scaleY: sy });
  }

  flushUI() {
    const gl = this.gl;
    if (!this.uiBatch.count && !this.lineBatch.count) return;
    const up = this.programs.ui;
    this.bindCommon(up, 0, -1);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.uniform2f(up.uniforms.u_screen, this.W, this.H);
    gl.uniform1f(up.uniforms.u_pixelScale, this.pixelScale);
    gl.uniform1f(up.uniforms.u_fuzzPhase, Math.floor(this.frameCount / 2) % 64);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(up.uniforms.u_scene, 5);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.translationTex);
    gl.uniform1i(up.uniforms.u_translations, 6);
    if (this.uiBatch.count) {
      this.uiBatch.upload();
      gl.bindVertexArray(this.uiVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.uiBatch.count);
      this.uiBatch.reset();
    }
    if (this.lineBatch.count) {
      this.lineBatch.upload();
      gl.bindVertexArray(this.lineVao);
      gl.drawArrays(gl.LINES, 0, this.lineBatch.count);
      this.lineBatch.reset();
    }
  }

  // --- Wipe -----------------------------------------------------------------

  startWipe() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.bindTexture(gl.TEXTURE_2D, this.oldTex);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, this.W, this.H);
    // Original melt: columns start at random negative offsets in 2px pairs.
    const W = this.W;
    const offs = new Float32Array(W);
    const colW = Math.max(1, Math.round(2 * this.vScaleX));
    let y = -Math.floor(Math.random() * 16);
    for (let x = 0; x < W; x += colW) {
      y += Math.floor(Math.random() * 3) - 1;
      y = Math.max(-15, Math.min(0, y));
      for (let k = 0; k < colW && x + k < W; k++) offs[x + k] = y * this.pixelScale;
    }
    this.wipe = { offs, time: 0 };
  }

  // Advance wipe by tics; returns true while running.
  tickWipe(tics) {
    if (!this.wipe) return false;
    const w = this.wipe;
    const H = this.H;
    let done = true;
    for (let t = 0; t < tics; t++) {
      for (let x = 0; x < w.offs.length; x++) {
        let y = w.offs[x];
        if (y < 0) { y += this.pixelScale; done = false; } else if (y < H) {
          const dy = (y < 16 * this.pixelScale) ? y + this.pixelScale : 8 * this.pixelScale;
          y = Math.min(H, y + dy);
          done = false;
        }
        w.offs[x] = y;
      }
    }
    if (done) this.wipe = null;
    return !done;
  }

  // --- Final ----------------------------------------------------------------

  endFrame(paletteRow = 0) {
    const gl = this.gl;
    this.flushUI();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    const fp = this.programs.final;
    gl.useProgram(fp.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.colorTex);
    gl.uniform1i(fp.uniforms.u_index, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.oldTex);
    gl.uniform1i(fp.uniforms.u_oldIndex, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.wipeTex);
    if (this.wipe) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.W, 1, gl.RED, gl.FLOAT, this.wipe.offs);
    }
    gl.uniform1i(fp.uniforms.u_wipe, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.uniform1i(fp.uniforms.u_palette, 3);
    gl.uniform1f(fp.uniforms.u_paletteRow, paletteRow);
    gl.uniform4f(fp.uniforms.u_dest, this.dest[0], this.dest[1], this.dest[2], this.dest[3]);
    gl.uniform2f(fp.uniforms.u_src, this.W, this.H);
    gl.uniform1f(fp.uniforms.u_wipeActive, this.wipe ? 1 : 0);
    gl.uniform1f(fp.uniforms.u_gamma, 1 + 0.12 * (this.settings.get('gamma') || 0));
    gl.uniform1f(fp.uniforms.u_crt, this.settings.get('scanlines') ? 1 : 0);
    gl.bindVertexArray(this.finalVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
