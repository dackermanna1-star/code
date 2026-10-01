// Runtime helpers: safe AudioParam automation, panners, distance cues.

export const SPEED_OF_SOUND = 343;

export function finite(v, d = 0) {
  return Number.isFinite(v) ? v : d;
}

/** Smoothly move an AudioParam toward v (no zipper noise). */
export function glide(param, v, t, tc = 0.03) {
  if (!param || !Number.isFinite(v)) return;
  if (tc <= 0) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
  } else {
    param.setTargetAtTime(v, t, tc);
  }
}

/** Jump an AudioParam to v at time t, discarding pending automation. */
export function jump(param, v, t) {
  if (!param || !Number.isFinite(v)) return;
  param.cancelScheduledValues(t);
  param.setValueAtTime(v, t);
}

/** Cancel automation but keep the current value (where supported). */
export function hold(param, t) {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(t);
  } else {
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
  }
}

export function makePanner(ctx, model = 'equalpower', ref = 1, rolloff = 1) {
  const p = ctx.createPanner();
  p.panningModel = model;
  p.distanceModel = 'inverse';
  p.refDistance = ref;
  p.rolloffFactor = rolloff;
  p.maxDistance = 10000;
  p.coneInnerAngle = 360;
  p.coneOuterAngle = 360;
  p.coneOuterGain = 1;
  return p;
}

export function setPannerPos(p, pos, t, tc = 0) {
  const x = finite(pos.x), y = finite(pos.y), z = finite(pos.z);
  if (p.positionX) {
    if (tc > 0) {
      p.positionX.setTargetAtTime(x, t, tc);
      p.positionY.setTargetAtTime(y, t, tc);
      p.positionZ.setTargetAtTime(z, t, tc);
    } else {
      p.positionX.cancelScheduledValues(t); p.positionX.setValueAtTime(x, t);
      p.positionY.cancelScheduledValues(t); p.positionY.setValueAtTime(y, t);
      p.positionZ.cancelScheduledValues(t); p.positionZ.setValueAtTime(z, t);
    }
  } else if (p.setPosition) {
    p.setPosition(x, y, z);
  }
}

export function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Inverse-distance gain as computed by PannerNode ('inverse' model). */
export function inverseGain(d, ref, rolloff) {
  return ref / (ref + rolloff * (Math.max(d, ref) - ref));
}

/** Air-absorption low-pass cutoff vs distance (humid night air + scattering). */
export function airCutoff(d) {
  const f = 20000 / (1 + d / 26);
  return f < 1500 ? 1500 : f > 20000 ? 20000 : f;
}

export function dbToGain(db) {
  return Math.pow(10, db / 20);
}

export function rand(a, b) {
  return a + (b - a) * Math.random();
}
export function randExp(mean) {
  return -Math.log(1 - Math.random() * 0.999999) * mean;
}
export function pickIndexNoRepeat(n, last) {
  if (n <= 1) return 0;
  let i = Math.floor(Math.random() * (n - 1));
  if (i >= last && last >= 0) i++;
  return i;
}

/** Create a looping buffer source starting at a random offset. */
export function loopSource(ctx, buffer, rate = 1, t = ctx.currentTime) {
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.playbackRate.value = rate;
  s.start(t, Math.random() * buffer.duration);
  return s;
}

/** Disconnect a set of nodes when the source ends. */
export function autoCleanup(src, nodes, onDone) {
  src.onended = () => {
    try { src.disconnect(); } catch (e) { /* ignore */ }
    for (const n of nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
    if (onDone) onDone();
  };
}
