import * as THREE from 'three';

// =============================================================================
// Interaction manager: things the player can use in the cabin.
//
//   const h = app.interactions.add({
//     object,                 // Object3D (searched recursively) or InstancedMesh
//     instanceId,             // optional: only this instance of an InstancedMesh
//     label: 'Open overhead bin' | (hit) => string,
//     onInteract: (hit) => {}, // hit = { object, instanceId, point, distance, face, uv }
//     enabled: (hit) => true,  // optional predicate
//     maxDistance: 2.2,        // metres from the camera
//     priority: 0,             // higher wins when several are hit at almost the same distance
//     key: 'E',                // label hint only
//   });
//   h.remove();
//
//   app.interactions.addOccluder(object)  – non-interactive geometry that blocks rays
//
// The player module calls update() after moving the camera (priority 60). Primary
// action = left click (pointer locked) or the E key. The HUD reads `current`.
// Every interactable is in the CABIN scene (aircraft-local space).
// =============================================================================
export class Interactions {
  constructor(app) {
    this.app = app;
    this.entries = [];
    this.occluders = [];
    this.enabled = true;
    this.current = null;        // { entry, hit, label }
    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;
    this._ndc = new THREE.Vector2(0, 0);
    this._objects = [];
    this._dirty = true;

    app.events.on('input:keydown', ({ code }) => {
      if (code === 'KeyE' && this.app.input.mode === 'play') this.trigger();
    });
    app.events.on('input:mousedown', ({ button, locked }) => {
      if (button === 0 && locked && this.app.input.mode === 'play') this.trigger();
    });
  }

  add(def) {
    const entry = { maxDistance: 2.2, priority: 0, key: 'E', ...def, _removed: false };
    entry.object.traverse?.((o) => { o.userData.__interactive = o.userData.__interactive || []; o.userData.__interactive.push(entry); });
    this.entries.push(entry);
    this._dirty = true;
    return {
      entry,
      remove: () => {
        entry._removed = true;
        this.entries = this.entries.filter((e) => e !== entry);
        entry.object.traverse?.((o) => { if (o.userData.__interactive) o.userData.__interactive = o.userData.__interactive.filter((e) => e !== entry); });
        this._dirty = true;
      },
      setLabel: (l) => { entry.label = l; },
    };
  }

  addOccluder(object) { this.occluders.push(object); this._dirty = true; return () => { this.occluders = this.occluders.filter((o) => o !== object); this._dirty = true; }; }

  _rebuild() {
    const set = new Set();
    for (const e of this.entries) set.add(e.object);
    for (const o of this.occluders) set.add(o);
    this._objects = [...set];
    this._dirty = false;
  }

  /** Raycast from the camera (screen centre, or the given NDC) and find the best interactable. */
  pick(camera, ndc = null) {
    if (this._dirty) this._rebuild();
    this._ndc.set(ndc ? ndc.x : 0, ndc ? ndc.y : 0);
    this.raycaster.setFromCamera(this._ndc, camera);
    this.raycaster.far = 3.5;
    const hits = this.raycaster.intersectObjects(this._objects.filter((o) => o.visible !== false), true);
    for (const h of hits) {
      if (!isVisible(h.object)) continue;
      const list = h.object.userData.__interactive;
      if (!list || list.length === 0) return null; // occluder
      let best = null;
      for (const e of list) {
        if (e.instanceId !== undefined && e.instanceId !== h.instanceId) continue;
        if (h.distance > e.maxDistance) continue;
        if (e.enabled && !safe(() => e.enabled(h), false)) continue;
        if (!best || (e.priority || 0) > (best.priority || 0)) best = e;
      }
      if (best) {
        const label = typeof best.label === 'function' ? safe(() => best.label(h), '') : best.label;
        return { entry: best, hit: h, label };
      }
      // an interactive object whose entries are all disabled still blocks the ray
      return null;
    }
    return null;
  }

  update(camera) {
    if (!this.enabled || this.app.input.mode !== 'play') { this._setCurrent(null); return; }
    this._setCurrent(this.pick(camera));
  }

  _setCurrent(c) {
    const prevEntry = this.current?.entry, prevLabel = this.current?.label;
    this.current = c;
    if (prevEntry !== c?.entry || prevLabel !== c?.label) {
      this.app.events.emit('interact:hover', c ? { label: c.label, key: c.entry.key } : null);
    }
  }

  trigger() {
    const c = this.current;
    if (!c) return false;
    try { c.entry.onInteract(c.hit); } catch (e) { console.error('[interactions] onInteract failed', e); }
    this.app.events.emit('interact:use', { label: c.label });
    // label may change after use (e.g. "Open" -> "Close")
    this.current = null;
    return true;
  }
}

function isVisible(o) {
  while (o) { if (o.visible === false) return false; o = o.parent; }
  return true;
}
function safe(fn, fallback) { try { return fn(); } catch (e) { console.error(e); return fallback; } }
