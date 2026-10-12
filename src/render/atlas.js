// Texture atlas for palette-indexed images.
//
// Every image (wall textures, flats, sprites, HUD patches, generated decals)
// lives in a 2D texture array of RG8 pages: R = palette index, G = coverage.
// Shaders address images through a small "image table" texture holding each
// image's atlas rectangle, and wrap texture coordinates manually with
// texelFetch so tiling stays pixel exact with no filtering bleed.

export const PAGE_SIZE = 2048;
const TABLE_WIDTH = 256;

export class Atlas {
  constructor() {
    this.pages = [];
    this.entries = []; // {page, x, y, w, h}
    this.shelf = null;
    this.gl = null;
    this.texture = null;
    this.tableTexture = null;
    this.tableData = null;
    this.uploadedPages = 0;
    this.dirtyPages = new Set();
    this.dirtyRects = [];
    this.tableDirty = true;
  }

  newPage() {
    const page = { data: new Uint8Array(PAGE_SIZE * PAGE_SIZE * 2), shelves: [], y: 0 };
    this.pages.push(page);
    return this.pages.length - 1;
  }

  place(w, h) {
    // Shelf packer: find a shelf with enough height and room, else open one.
    const pw = w + 1;
    const ph = h + 1;
    for (let p = 0; p < this.pages.length; p++) {
      const page = this.pages[p];
      for (const shelf of page.shelves) {
        if (ph <= shelf.h && shelf.x + pw <= PAGE_SIZE && ph >= shelf.h * 0.5) {
          const pos = { page: p, x: shelf.x, y: shelf.y };
          shelf.x += pw;
          return pos;
        }
      }
      if (page.y + ph <= PAGE_SIZE) {
        const shelf = { x: pw, y: page.y, h: ph };
        page.shelves.push(shelf);
        page.y += ph;
        return { page: p, x: 0, y: shelf.y };
      }
    }
    const p = this.newPage();
    const page = this.pages[p];
    const shelf = { x: pw, y: 0, h: ph };
    page.shelves.push(shelf);
    page.y = ph;
    return { page: p, x: 0, y: 0 };
  }

  // Adds an IndexedImage; returns its image id.
  add(img) {
    const w = Math.max(1, Math.min(img.width, PAGE_SIZE - 1));
    const h = Math.max(1, Math.min(img.height, PAGE_SIZE - 1));
    const pos = this.place(w, h);
    const page = this.pages[pos.page];
    for (let y = 0; y < h; y++) {
      let d = ((pos.y + y) * PAGE_SIZE + pos.x) * 2;
      let s = y * img.width;
      for (let x = 0; x < w; x++, d += 2, s++) {
        page.data[d] = img.pixels[s];
        page.data[d + 1] = img.mask[s];
      }
    }
    const entry = { page: pos.page, x: pos.x, y: pos.y, w, h };
    this.entries.push(entry);
    this.writeTableEntry(this.entries.length - 1, entry);
    // After the first upload, new images go up as small sub-rectangles.
    if (this.texture && pos.page < this.uploadedPages) this.dirtyRects.push(entry);
    else this.dirtyPages.add(pos.page);
    return this.entries.length - 1;
  }

  // Redirect an image id to show another image's pixels (texture animation).
  alias(id, targetId) {
    const t = this.entries[targetId];
    this.writeTableEntry(id, t);
  }

  writeTableEntry(id, e) {
    const needed = (id + 1) * 4;
    if (!this.tableData || this.tableData.length < needed) {
      const grown = new Float32Array(Math.max(needed, (this.tableData ? this.tableData.length : 0) * 2, TABLE_WIDTH * 4 * 8));
      if (this.tableData) grown.set(this.tableData);
      this.tableData = grown;
    }
    const o = id * 4;
    this.tableData[o] = e.page * PAGE_SIZE + e.x;
    this.tableData[o + 1] = e.y;
    this.tableData[o + 2] = e.w;
    this.tableData[o + 3] = e.h;
    this.tableDirty = true;
  }

  sizeOf(id) {
    return this.entries[id];
  }

  bind(gl) {
    this.gl = gl;
    this.upload();
  }

  upload() {
    const gl = this.gl;
    if (!gl) return;
    if (!this.texture || this.uploadedPages !== this.pages.length) {
      if (this.texture) gl.deleteTexture(this.texture);
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RG8, PAGE_SIZE, PAGE_SIZE, this.pages.length);
      this.uploadedPages = this.pages.length;
      this.dirtyPages = new Set(this.pages.keys());
    }
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    for (const p of this.dirtyPages) {
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, p, PAGE_SIZE, PAGE_SIZE, 1, gl.RG, gl.UNSIGNED_BYTE, this.pages[p].data);
    }
    this.dirtyPages.clear();
    for (const e of this.dirtyRects) {
      const page = this.pages[e.page];
      const sub = new Uint8Array(e.w * e.h * 2);
      for (let y = 0; y < e.h; y++) {
        const src = ((e.y + y) * PAGE_SIZE + e.x) * 2;
        sub.set(page.data.subarray(src, src + e.w * 2), y * e.w * 2);
      }
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, e.x, e.y, e.page, e.w, e.h, 1, gl.RG, gl.UNSIGNED_BYTE, sub);
    }
    this.dirtyRects.length = 0;
    this.uploadTable();
  }

  uploadTable() {
    const gl = this.gl;
    const rows = Math.max(1, Math.ceil(this.tableData.length / 4 / TABLE_WIDTH));
    if (!this.tableTexture || this.tableRows !== rows) {
      if (this.tableTexture) gl.deleteTexture(this.tableTexture);
      this.tableTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tableTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, TABLE_WIDTH, rows);
      this.tableRows = rows;
      this.tableDirty = true;
    }
    if (this.tableDirty) {
      gl.bindTexture(gl.TEXTURE_2D, this.tableTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TABLE_WIDTH, rows, gl.RGBA, gl.FLOAT, this.tableData.subarray(0, rows * TABLE_WIDTH * 4));
      this.tableDirty = false;
    }
  }

  // Called once per frame by the renderer.
  sync() {
    if (this.dirtyPages.size || this.dirtyRects.length || this.uploadedPages !== this.pages.length) this.upload();
    else if (this.tableDirty) this.uploadTable();
  }
}
