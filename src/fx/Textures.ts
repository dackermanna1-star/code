/**
 * Procedural particle/decal textures (no image assets). Hard-edged shapes
 * keep particles looking "cel-shaded" rather than soft and realistic.
 */
import { DynamicTexture, Texture, type Scene } from "@babylonjs/core";

type Painter = (g: CanvasRenderingContext2D, s: number) => void;

const cache = new WeakMap<Scene, Map<string, DynamicTexture>>();

function make(scene: Scene, name: string, size: number, paint: Painter): DynamicTexture {
  let m = cache.get(scene);
  if (!m) cache.set(scene, (m = new Map()));
  const hit = m.get(name);
  if (hit) return hit;
  const t = new DynamicTexture(`fx_${name}`, { width: size, height: size }, scene, true);
  const g = t.getContext() as unknown as CanvasRenderingContext2D;
  g.clearRect(0, 0, size, size);
  paint(g, size);
  t.hasAlpha = true;
  t.update();
  t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE;
  m.set(name, t);
  return t;
}

/** Seeded pseudo random so splats look the same each session. */
function rand(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function blob(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, wobble: number, rnd: () => number): void {
  g.beginPath();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - wobble / 2 + rnd() * wobble);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
}

export const Tex = {
  /** Solid disc with a thin soft rim. */
  dot: (scene: Scene) =>
    make(scene, "dot", 64, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.72, "rgba(255,255,255,1)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    }),
  /** Soft puff for smoke/dust/mist. */
  puff: (scene: Scene) =>
    make(scene, "puff", 128, (g, s) => {
      const rnd = rand(7);
      for (let i = 0; i < 6; i++) {
        const x = s * (0.3 + rnd() * 0.4);
        const y = s * (0.3 + rnd() * 0.4);
        const r = s * (0.18 + rnd() * 0.12);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, "rgba(255,255,255,0.9)");
        gr.addColorStop(0.6, "rgba(255,255,255,0.75)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    }),
  /** Long thin streak for sparks/tracers. */
  spark: (scene: Scene) =>
    make(scene, "spark", 64, (g, s) => {
      const gr = g.createLinearGradient(0, s / 2, s, s / 2);
      gr.addColorStop(0, "rgba(255,255,255,0)");
      gr.addColorStop(0.5, "rgba(255,255,255,1)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, s * 0.42, s, s * 0.16);
      g.fillStyle = "white";
      g.beginPath();
      g.arc(s / 2, s / 2, s * 0.12, 0, Math.PI * 2);
      g.fill();
    }),
  /** Chunky comic flame lick. */
  flame: (scene: Scene) =>
    make(scene, "flame", 64, (g, s) => {
      const rnd = rand(3);
      g.fillStyle = "white";
      blob(g, s / 2, s / 2, s * 0.42, 0.45, rnd);
    }),
  /** Ground blood splat (white; tinted by material). Variants 0..2. */
  splat: (scene: Scene, variant: number) =>
    make(scene, `splat${variant}`, 256, (g, s) => {
      const rnd = rand(11 + variant * 17);
      g.fillStyle = "white";
      blob(g, s / 2, s / 2, s * 0.26, 0.5, rnd);
      const drops = 9 + Math.floor(rnd() * 6);
      for (let i = 0; i < drops; i++) {
        const a = rnd() * Math.PI * 2;
        const d = s * (0.25 + rnd() * 0.2);
        const r = s * (0.02 + rnd() * 0.06);
        blob(g, s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, r, 0.4, rnd);
        // streak toward center
        g.beginPath();
        g.moveTo(s / 2 + Math.cos(a) * d * 0.5, s / 2 + Math.sin(a) * d * 0.5);
        g.lineTo(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d);
        g.lineWidth = r * 1.2;
        g.strokeStyle = "white";
        g.stroke();
      }
      // darker inner pool
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = "rgba(0,0,0,0.28)";
      blob(g, s / 2 + s * 0.03, s / 2 + s * 0.03, s * 0.17, 0.4, rnd);
      g.globalCompositeOperation = "source-over";
    }),
  /** Scorch mark. */
  scorch: (scene: Scene) =>
    make(scene, "scorch", 256, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, "rgba(20,14,12,0.95)");
      gr.addColorStop(0.55, "rgba(30,22,18,0.7)");
      gr.addColorStop(1, "rgba(30,22,18,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    }),
  /** Shockwave ring. */
  ring: (scene: Scene) =>
    make(scene, "ring", 256, (g, s) => {
      g.strokeStyle = "white";
      g.lineWidth = s * 0.06;
      g.beginPath();
      g.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2);
      g.stroke();
    }),
};
