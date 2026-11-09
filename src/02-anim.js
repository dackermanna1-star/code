// A small animation blender. The engine's three.js build ships GLTFLoader and keyframe tracks but
// not AnimationMixer, so clips are sampled here directly through each track's interpolant and
// blended per bone (weighted sum for vectors, sign-corrected nlerp for quaternions).
class ClipPlayer {
  constructor(root, clips) {
    this.root = root;
    this.clips = new Map();
    this.layers = []; // { name, clip, time, speed, weight, target, fade, loop, onEnd, done }
    this.props = new Map(); // key -> { obj, prop, acc: Float32Array, w }
    this.minWeight = 0; // layers lighter than this stay alive but are not sampled
    for (const clip of clips) {
      const short = clip.name.replace(/^.*\|/, '');
      const bindings = [];
      for (const track of clip.tracks) {
        const dot = track.name.lastIndexOf('.');
        const nodeName = track.name.slice(0, dot), prop = track.name.slice(dot + 1);
        if (prop !== 'position' && prop !== 'quaternion' && prop !== 'scale') continue;
        const obj = root.getObjectByName(nodeName);
        if (!obj) continue;
        const key = obj.uuid + prop;
        if (!this.props.has(key)) {
          // rest: the pose before any clip ran, for the weight the playing clips leave unkeyed
          const v = obj[prop], rest = new Float32Array(4);
          rest[0] = v.x; rest[1] = v.y; rest[2] = v.z; rest[3] = prop === 'quaternion' ? v.w : 0;
          this.props.set(key, { obj, prop, acc: new Float32Array(4), w: 0, ref: new Float32Array(4), rest });
        }
        bindings.push({ key, interp: track.createInterpolant(new Float32Array(prop === 'quaternion' ? 4 : 3)), size: prop === 'quaternion' ? 4 : 3 });
      }
      this.clips.set(short, { name: short, duration: clip.duration, bindings });
    }
  }

  has(name) { return this.clips.has(name); }
  duration(name) { const c = this.clips.get(name); return c ? c.duration : 0; }

  // fade in a clip; other layers fade out unless `additiveTo` keeps them (used for one-shots)
  play(name, { fade = 0.15, loop = true, speed = 1, restart = false, exclusive = true, weight = 1, onEnd = null, startAt = 0 } = {}) {
    const clip = this.clips.get(name);
    if (!clip) return null;
    let layer = this.layers.find((l) => l.name === name);
    if (!layer) {
      layer = { name, clip, time: startAt, speed, weight: fade > 0 ? 0 : weight, target: weight, fade, loop, onEnd, done: false };
      this.layers.push(layer);
    } else {
      if (restart || layer.done) { layer.time = startAt; layer.done = false; if (fade <= 0) layer.weight = weight; }
      Object.assign(layer, { speed, target: weight, fade, loop, onEnd });
    }
    // replaced layers fade out silently: their end callbacks belong to the action they were
    if (exclusive) for (const l of this.layers) if (l !== layer) { l.target = 0; l.fade = fade; l.onEnd = null; }
    return layer;
  }

  layer(name) { return this.layers.find((l) => l.name === name) || null; }

  setWeight(name, w, fade = 0.15) {
    const l = this.layer(name);
    if (l) { l.target = w; l.fade = fade; if (w <= 0) l.onEnd = null; }
  }

  stop(name, fade = 0.15) { this.setWeight(name, 0, fade); }

  update(dt) {
    for (const l of this.layers) {
      if (!l.done) {
        l.time += dt * l.speed;
        if (l.time >= l.clip.duration) {
          if (l.loop) l.time %= Math.max(1e-4, l.clip.duration);
          else {
            l.time = l.clip.duration;
            l.done = true;
            if (l.onEnd && l.target > 0) { const cb = l.onEnd; l.onEnd = null; cb(l); }
          }
        }
      }
      const rate = l.fade > 0 ? dt / l.fade : 1;
      l.weight = l.weight < l.target ? Math.min(l.target, l.weight + rate) : Math.max(l.target, l.weight - rate);
    }
    this.layers = this.layers.filter((l) => l.weight > 1e-3 || l.target > 0);
    let total = 0;
    for (const l of this.layers) total += l.weight;
    if (total <= 1e-4) return;
    for (const p of this.props.values()) { p.acc.fill(0); p.w = 0; }
    for (const l of this.layers) {
      const w = l.weight / total;
      if (w <= 0 || l.weight < this.minWeight) continue;
      for (const b of l.clip.bindings) {
        const v = b.interp.evaluate(l.time);
        const p = this.props.get(b.key);
        if (b.size === 4) {
          // keep all samples in the hemisphere of the first so the weighted sum is a valid nlerp
          if (p.w === 0) p.ref.set(v);
          const s = p.ref[0] * v[0] + p.ref[1] * v[1] + p.ref[2] * v[2] + p.ref[3] * v[3] < 0 ? -w : w;
          p.acc[0] += v[0] * s; p.acc[1] += v[1] * s; p.acc[2] += v[2] * s; p.acc[3] += v[3] * s;
        } else {
          p.acc[0] += v[0] * w; p.acc[1] += v[1] * w; p.acc[2] += v[2] * w;
        }
        p.w += w;
      }
    }
    for (const p of this.props.values()) {
      // a bone only some clips key (the off arm mid-reload, a shell) eases back to its rest pose
      // when those clips stop, instead of freezing wherever an interrupted clip left it
      const miss = 1 - p.w;
      if (miss > 1e-4) {
        const r = p.rest;
        if (p.prop === 'quaternion') {
          if (p.w === 0) p.ref.set(r);
          const s = p.ref[0] * r[0] + p.ref[1] * r[1] + p.ref[2] * r[2] + p.ref[3] * r[3] < 0 ? -miss : miss;
          p.acc[0] += r[0] * s; p.acc[1] += r[1] * s; p.acc[2] += r[2] * s; p.acc[3] += r[3] * s;
        } else { p.acc[0] += r[0] * miss; p.acc[1] += r[1] * miss; p.acc[2] += r[2] * miss; }
        p.w = 1;
      }
      const a = p.acc, inv = 1 / p.w;
      if (p.prop === 'quaternion') {
        const n = Math.hypot(a[0], a[1], a[2], a[3]) || 1;
        p.obj.quaternion.set(a[0] / n, a[1] / n, a[2] / n, a[3] / n);
      } else p.obj[p.prop].set(a[0] * inv, a[1] * inv, a[2] * inv);
    }
  }
}
