// Probe: generate every procedural texture, time it, and return contact sheets (data URLs):
// each cell shows the albedo and a lit preview (normal map + relative roughness).
import { generatorNames, generateTexture } from "../../src/render/proctex/index.ts";
import { heightToNormal, SIZE } from "../../src/render/proctex/kit.ts";

export async function probe(): Promise<unknown> {
  const names = generatorNames();
  const times: Record<string, number> = {};
  const outs: Array<{ name: string; rgba: Uint8ClampedArray; normal: Uint8ClampedArray | null; rough: Float32Array | number; emissive: Float32Array | null }> = [];
  const t0 = performance.now();
  for (const n of names) {
    const t = performance.now();
    const { out } = generateTexture(n);
    const normal = out.height ? heightToNormal(out.height, out.bump ?? 1) : null;
    times[n] = Math.round((performance.now() - t) * 10) / 10;
    outs.push({ name: n, rgba: out.rgba, normal, rough: out.rough ?? 1, emissive: out.emissive ?? null });
  }
  const total = performance.now() - t0;

  const cell = 192,
    cols = 3,
    rows = 4,
    lab = 16;
  const sheets: string[] = [];
  const L = [-0.5, 0.55, 0.67];
  const ll = Math.hypot(L[0], L[1], L[2]);
  const Ln = [L[0] / ll, L[1] / ll, L[2] / ll];
  const H = [Ln[0], Ln[1], Ln[2] + 1];
  const hl = Math.hypot(H[0], H[1], H[2]);
  const Hn = [H[0] / hl, H[1] / hl, H[2] / hl];
  for (let s = 0; s * cols * rows < outs.length; s++) {
    const cv = document.createElement("canvas");
    cv.width = cols * cell * 2;
    cv.height = rows * (cell + lab);
    const g = cv.getContext("2d")!;
    g.fillStyle = "#202020";
    g.fillRect(0, 0, cv.width, cv.height);
    for (let k = 0; k < cols * rows; k++) {
      const o = outs[s * cols * rows + k];
      if (!o) break;
      const cx = (k % cols) * cell * 2,
        cy = Math.floor(k / cols) * (cell + lab);
      g.fillStyle = "#fff";
      g.font = "12px sans-serif";
      g.fillText(`${o.name}  ${times[o.name]}ms`, cx + 4, cy + 12);
      const alb = new ImageData(new Uint8ClampedArray(o.rgba), SIZE, SIZE);
      const lit = new ImageData(SIZE, SIZE);
      for (let i = 0; i < SIZE * SIZE; i++) {
        const j = i * 4;
        let nx = 0,
          ny = 0,
          nz = 1;
        if (o.normal) {
          nx = o.normal[j] / 127.5 - 1;
          ny = o.normal[j + 1] / 127.5 - 1;
          nz = o.normal[j + 2] / 127.5 - 1;
        }
        const r = typeof o.rough === "number" ? o.rough : o.rough[i];
        const rough = Math.min(1, Math.max(0.05, 0.5 * r));
        const ndl = Math.max(0, nx * Ln[0] + ny * Ln[1] + nz * Ln[2]);
        const ndh = Math.max(0, nx * Hn[0] + ny * Hn[1] + nz * Hn[2]);
        const spec = Math.pow(ndh, 2 + 120 * (1 - rough) ** 3) * (1 - rough) * 0.5;
        const e = o.emissive ? o.emissive[i] : 0;
        for (let c = 0; c < 3; c++) {
          const a = (o.rgba[j + c] / 255) ** 2.2;
          const v = a * (0.15 + 0.85 * ndl) + spec + e * a * 1.5;
          lit.data[j + c] = Math.min(255, Math.pow(v, 1 / 2.2) * 255);
        }
        lit.data[j + 3] = 255;
      }
      const tmp = document.createElement("canvas");
      tmp.width = SIZE;
      tmp.height = SIZE;
      const tg = tmp.getContext("2d")!;
      tg.putImageData(alb, 0, 0);
      g.drawImage(tmp, cx, cy + lab, cell, cell);
      tg.putImageData(lit, 0, 0);
      g.drawImage(tmp, cx + cell, cy + lab, cell, cell);
    }
    sheets.push(cv.toDataURL("image/png"));
  }
  return { count: names.length, totalMs: Math.round(total), times, sheets };
}
