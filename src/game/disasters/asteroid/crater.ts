/**
 * Crater geometry (pure, unit tested).
 *
 * Profile in units of the crater radius R, relative to the pre-impact ground:
 *   inside  (r < 1): bowl  -D·(1 - r²) + H·r⁶      (parabolic transient crater, steep raised rim)
 *   outside (r ≥ 1): ejecta blanket  H·r⁻³         (blanket thickness falls off as the cube of distance)
 * so the floor is D below ground at the centre, the rim crest H above ground at r = 1, and the
 * blanket thins to H/8 at two radii.
 */

export interface ImpactPlan {
  /** Impact column (block coords). */
  cx: number;
  cz: number;
  /** Ground level at the impact (y of the top terrain block). */
  G: number;
  /** Crater radius, depth and rim height (blocks). */
  R: number;
  D: number;
  H: number;
  /** Lava lake surface y (lava fills crater floor columns below it). */
  lavaY: number;
  /** Water is boiled away inside this radius. */
  evapR: number;
  /** Outer radius of the leveling (loaded map). */
  maxR: number;
  seed: number;
}

/** Crater + blanket profile at normalised radius r (see file header). */
export function craterProfile(r: number, D: number, H: number): number {
  const a = Math.abs(r);
  if (a < 1) {
    const r2 = a * a;
    return -D * (1 - r2) + H * r2 * r2 * r2;
  }
  return H / (a * a * a);
}

/**
 * Plan an impact at ground level G. `rand` in [0,1). Depth is clamped so the floor stays above
 * the bedrock layers; `maxR` is the leveling radius (distance to the edge of the loaded map).
 */
export function planImpact(cx: number, cz: number, G: number, maxR: number, rand: () => number, scale = 1): ImpactPlan {
  const R = Math.round((66 + rand() * 20) * scale);
  let D = Math.round((34 + rand() * 12) * scale);
  D = Math.max(3, Math.min(D, G - 8));
  const H = Math.max(2, Math.round(R * 0.12));
  // lava lake: the bottom ~18% of the bowl (radius ≈ 0.42 R)
  const lavaY = G - D + Math.max(2, Math.round(D * 0.18));
  const mR = Math.max(maxR, Math.ceil(R * 1.5));
  const evapR = Math.min(mR, Math.max(R * 3, mR * 0.6));
  return { cx, cz, G, R, D, H, lavaY, evapR, maxR: mR, seed: Math.floor(rand() * 1e6) };
}

/** Radius at which the crater floor sits at the lava surface (the lake radius, in blocks). */
export function lavaLakeRadius(p: ImpactPlan): number {
  const depth = p.lavaY - (p.G - p.D); // lake depth at centre
  if (depth <= 0) return 0;
  // -D(1-r²) + H r⁶ = depth - D  (H term negligible this deep in the bowl)
  const r2 = Math.max(0, depth / p.D);
  return Math.sqrt(r2) * p.R;
}
