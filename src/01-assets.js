// Asset loading. Large binaries (GLB) live in dist/assets/<key>.js as base64 so they load through
// plain <script> tags: that works both from a web server and straight from the file system.
const Assets = {
  base: (typeof window !== 'undefined' && window.__BR_ASSET_BASE) || 'assets/',
  _bytes: new Map(),
  _gltf: new Map(),
  progress: { loaded: 0, wanted: 0 },

  bytes(key) {
    if (this._bytes.has(key)) return this._bytes.get(key);
    this.progress.wanted++;
    const p = new Promise((resolve, reject) => {
      const take = () => {
        const b64 = window.__BR_ASSETS && window.__BR_ASSETS[key];
        if (!b64) return false;
        delete window.__BR_ASSETS[key];
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        this.progress.loaded++;
        resolve(out.buffer);
        return true;
      };
      if (take()) return;
      const s = document.createElement('script');
      s.src = this.base + key + '.js';
      s.async = true;
      s.onload = () => { if (!take()) reject(new Error('asset script did not register ' + key)); s.remove(); };
      s.onerror = () => { reject(new Error('missing asset ' + key)); s.remove(); };
      document.head.appendChild(s);
    });
    this._bytes.set(key, p);
    return p;
  },

  gltf(key) {
    if (this._gltf.has(key)) return this._gltf.get(key);
    const p = this.bytes(key).then(
      (buf) => new Promise((resolve, reject) => new Lab.GLTFLoader().parse(buf, '', resolve, reject)),
    );
    p.catch((e) => console.warn('[assets]', key, e));
    this._gltf.set(key, p);
    return p;
  },
};
