// Minimal tween / timeline runner driven by the game loop.
import { clamp } from './utils.js';

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  sine: (t) => Math.sin(t * Math.PI),
};

const active = new Set();

// tween({ duration, ease, update(t, eased), done() }) -> handle with cancel()
export function tween({ duration = 0.3, ease = Ease.outCubic, update, done, delay = 0 }) {
  const h = { t: -delay, duration, ease, update, done, cancelled: false, cancel() { this.cancelled = true; active.delete(this); } };
  active.add(h);
  return h;
}

export function wait(seconds) {
  return new Promise((res) => tween({ duration: seconds, update() {}, done: res }));
}

export function animate(opts) {
  return new Promise((res) => {
    const d = opts.done;
    tween({ ...opts, done: () => { d?.(); res(); } });
  });
}

export function updateTweens(dt) {
  for (const h of [...active]) {
    if (h.cancelled) continue;
    h.t += dt;
    if (h.t < 0) continue;
    const t = clamp(h.t / h.duration, 0, 1);
    try { h.update?.(t, h.ease(t)); } catch (e) { console.error(e); active.delete(h); continue; }
    if (t >= 1) { active.delete(h); try { h.done?.(); } catch (e) { console.error(e); } }
  }
}
