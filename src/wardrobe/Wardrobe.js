import * as THREE from 'three';
import { BodyAtlas } from './BodyAtlas.js';
import { buildFitted } from './GarmentBuilder.js';
import { makeFabricMaterial, updateFabric } from './fabric.js';
import { CATALOG, SLOTS } from './catalog.js';

/**
 * Manages what the character is wearing.  Each garment occupies one slot;
 * putting something on replaces the item in its slot (and any slot it
 * conflicts with, e.g. a dress replaces top + bottom).
 */
export class Wardrobe {
  constructor(character, { onChange } = {}) {
    this.character = character;
    this.atlas = new BodyAtlas(character);
    this.worn = new Map();      // slot -> { def, opts, object, covered }
    this.geomCache = new Map(); // item id -> { geometry, covered }
    this.onChange = onChange;
    this.dynamic = [];          // garments with physics (cloth sims etc.)
  }

  get(slot) { return this.worn.get(slot); }

  prebuild(id) {
    const def = CATALOG[id];
    if (!def || !def.fitted || this.geomCache.has(id)) return;
    this.geomCache.set(id, buildFitted(this.atlas, def.fitted));
  }

  isWorn(id) { for (const w of this.worn.values()) if (w.def.id === id) return true; return false; }

  wear(id, opts = {}) {
    const def = CATALOG[id];
    if (!def) throw new Error('unknown garment ' + id);
    // remove conflicting items
    for (const slot of [def.slot, ...(def.replaces || [])]) this.remove(slot, true);
    for (const [slot, w] of [...this.worn]) {
      if ((w.def.replaces || []).includes(def.slot)) this.remove(slot, true);
    }
    const o = { ...def.defaults, ...opts };
    const L = this.atlas.L;
    const extra = { _id: id, land: [L.pelvis.y + 0.03, L.pelvis.y - 0.05, L.crotchY, L.neckBase.y] };
    if (def.band) extra.band = def.band(L);
    const entry = { def, opts: o, object: null, covered: null, sim: null };
    if (def.build) {
      const res = def.build(this, { ...o, ...extra });
      entry.object = res.object;
      entry.covered = res.covered || null;
      entry.sim = res.sim || null;
      entry.update = res.update || null;
      entry.material = res.material || null;
      entry.dispose = res.dispose || null;
    } else {
      let cached = this.geomCache.get(id);
      if (!cached) {
        cached = buildFitted(this.atlas, def.fitted);
        this.geomCache.set(id, cached);
      }
      const mat = makeFabricMaterial({ ...o, ...extra });
      const mesh = new THREE.SkinnedMesh(cached.geometry, mat);
      mesh.name = id;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.renderOrder = def.layer || 1;
      this.character.model.add(mesh);
      mesh.bind(this.character.skeleton, this.character.body.bindMatrix);
      entry.object = mesh;
      entry.material = mat;
      entry.covered = o.sheer ? null : cached.covered;
    }
    this.worn.set(def.slot, entry);
    this._refresh();
    return entry;
  }

  remove(slot, silent = false) {
    const w = this.worn.get(slot);
    if (!w) return;
    if (w.def.locked) return;
    if (w.object && w.object.parent) w.object.parent.remove(w.object);
    if (w.material && w.material.dispose) w.material.dispose();
    if (w.dispose) w.dispose();
    this.worn.delete(slot);
    if (!silent) this._refresh();
  }

  restyle(slot, opts) {
    const w = this.worn.get(slot);
    if (!w) return;
    const needsRebuild = (opts.material && opts.material !== w.opts.material) || (opts.sheer !== undefined && opts.sheer !== w.opts.sheer);
    Object.assign(w.opts, opts);
    if (needsRebuild) { this.wear(w.def.id, w.opts); return; }
    if (w.material && w.material.userData.uniforms) updateFabric(w.material, opts);
    if (w.restyle) w.restyle(opts);
    this.onChange && this.onChange(this);
  }

  /** Walking-style modifiers contributed by what she wears (shoes, narrow skirts...). */
  gaitModifiers() {
    // garments first, shoes last (shoes define the foot geometry); scales multiply
    const mods = {};
    const list = [...this.worn.values()].sort((a, b) => (a.def.slot === 'shoes') - (b.def.slot === 'shoes'));
    for (const w of list) {
      const g = w.def.gait;
      if (!g) continue;
      for (const [k, v] of Object.entries(g)) {
        if (k.endsWith('Scale') && mods[k] !== undefined) mods[k] *= v;
        else if (k === 'stepWidth' && mods[k] !== undefined) mods[k] = Math.min(mods[k], v);
        else if (k === 'armOut' && mods[k] !== undefined) mods[k] = Math.max(mods[k], v);
        else mods[k] = v;
      }
    }
    return mods;
  }

  _refresh() {
    // hide skin that is fully covered by opaque garments
    const atlas = this.atlas;
    const hidden = new Uint8Array(atlas.triCount);
    for (const w of this.worn.values()) {
      if (!w.covered) continue;
      for (let t = 0; t < atlas.triCount; t++) if (w.covered[t]) hidden[t] = 1;
    }
    const src = atlas.renderIndex;
    const out = new Uint32Array(src.length);
    let n = 0;
    for (let t = 0; t < atlas.triCount; t++) {
      if (hidden[t]) continue;
      out[n++] = src[t * 3]; out[n++] = src[t * 3 + 1]; out[n++] = src[t * 3 + 2];
    }
    const g = this.character.body.geometry;
    g.setIndex(new THREE.BufferAttribute(out.slice(0, n), 1));
    // inner layers that are completely covered are not drawn (avoids poke-through)
    const hiddenSlots = new Set();
    for (const w of this.worn.values()) {
      const h = typeof w.def.hides === 'function' ? w.def.hides(w.opts) : w.def.hides;
      if (h && !w.opts.sheer) for (const s of h) hiddenSlots.add(s);
    }
    for (const [slot, w] of this.worn) if (w.object) w.object.visible = !hiddenSlots.has(slot);
    // tops are tucked into skirts / trousers: clip them just below the waistband
    const bottom = this.worn.get('bottom');
    const wy = bottom && bottom.def.waist ? bottom.def.waist(atlas.L) - 0.015 : -1;
    const top = this.worn.get('top');
    if (top && top.material && top.material.userData.uniforms) top.material.userData.uniforms.uClipY.value = wy;
    // knits are tucked into flared skirts (otherwise the skirt would cut through them)
    const layer = this.worn.get('layer');
    if (layer && layer.material && layer.material.userData.uniforms) {
      layer.material.userData.uniforms.uClipY.value = bottom && bottom.def.build ? wy : -1;
    }
    this.dynamic = [...this.worn.values()].filter((w) => w.update);
    this.onChange && this.onChange(this);
  }

  update(dt, ctx) {
    for (const w of this.dynamic) w.update(dt, ctx);
  }

  serialize() {
    const out = {};
    for (const [slot, w] of this.worn) out[slot] = { id: w.def.id, opts: w.opts };
    return out;
  }
}

export { CATALOG, SLOTS };
