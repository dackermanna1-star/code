// Optional CC0 sample layering. If public/assets/sounds/manifest.json exists (Kenney /
// OpenGameArt packs fetched by scripts/assets/fetch_sounds.py), a balanced selection of
// matching samples is decoded in the background and blended with the synthesized sounds
// (impacts by material, footsteps, punches, glass breaks, wood cracks, doors, cloth …).
// The game never depends on them: every sound exists procedurally.

export interface ManifestRow {
  file: string;
  pack?: string;
  category?: string;
  durationSec?: number;
}

export interface SampleRef {
  file: string;
  layer: string;
  /** 0 light … 1 heavy (from Kenney's light/medium/heavy naming). */
  intensity: number;
  durationSec: number;
}

/** Classify a manifest row into a layer key (see SAMPLE_FOR_* in mapping.ts) or null. */
export function classifySample(row: ManifestRow): { layer: string; intensity: number } | null {
  const cat = (row.category ?? "").toLowerCase();
  const name = (row.file ?? "").toLowerCase();
  const base = name.slice(name.lastIndexOf("/") + 1);
  const intensity = /heavy|slam|breaking/.test(base) ? 1 : /light|tap|small/.test(base) ? 0.2 : 0.55;
  const L = (layer: string) => ({ layer, intensity });
  if ((row.durationSec ?? 0) > 6) return null; // long ambiences/loops are not layered
  switch (cat) {
    case "impact_glass":
      return L("impact.glass");
    case "impact_ceramic":
      return L("impact.ceramic");
    case "impact_metal":
      if (/bell/.test(base)) return null; // too musical
      return /tin|sheet|pot|toaster|can\b|clink/.test(base) ? L("impact.metalThin") : L("impact.metal");
    case "impact_wood":
      return L("impact.wood");
    case "impact_plastic":
      return L("impact.plastic");
    case "impact_concrete":
      return L("impact.concrete");
    case "impact_soft":
      return /book/.test(base) ? L("impact.paper") : L("impact.soft");
    case "punch":
      return L("punch");
    case "footstep_wood":
      return L("step.wood");
    case "footstep_tile":
      return L("step.tile");
    case "footstep_carpet":
      return L("step.carpet");
    case "footstep_concrete":
      return L("step.concrete");
    case "glass_break":
      return L("shatter.glass");
    case "wood_break":
      return L("break.wood");
    case "debris":
      if (/earthquake|cave/.test(base)) return null;
      return /rock|stone|crunch/.test(base) ? L("debris.rock") : L("debris.generic");
    case "door":
      if (/microwave/.test(base)) return null;
      if (/lock|latch/.test(base)) return L("door.latch");
      if (/slam|close/.test(base)) return L("door.slam");
      return null;
    case "creak":
      return /wood|squeak|tree/.test(base) ? L("creak.wood") : L("creak.door");
    case "cloth":
      return L("cloth");
    case "electric":
      if (/switch/.test(base)) return L("elec.switch");
      if (/spark|snap/.test(base)) return L("spark");
      return null;
    default:
      return null;
  }
}

/**
 * Pick a balanced, deterministic subset: up to `perLayer` files per layer spread across
 * intensities, at most `total` overall.
 */
export function selectSamples(rows: readonly ManifestRow[], perLayer = 6, total = 110): SampleRef[] {
  const by = new Map<string, SampleRef[]>();
  for (const r of rows) {
    if (!r || typeof r.file !== "string" || !/\.(ogg|wav|mp3|m4a|flac)$/i.test(r.file)) continue;
    const c = classifySample(r);
    if (!c) continue;
    const list = by.get(c.layer) ?? [];
    list.push({ file: r.file, layer: c.layer, intensity: c.intensity, durationSec: r.durationSec ?? 0 });
    by.set(c.layer, list);
  }
  const out: SampleRef[] = [];
  for (const [, list] of [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    list.sort((a, b) => a.intensity - b.intensity || (a.file < b.file ? -1 : 1));
    const n = Math.min(perLayer, list.length);
    for (let i = 0; i < n; i++) out.push(list[Math.floor(((i + 0.5) * list.length) / n)]);
  }
  // Round-robin across layers when trimming to the total cap.
  if (out.length <= total) return out;
  const layers = [...new Set(out.map((s) => s.layer))];
  const res: SampleRef[] = [];
  for (let k = 0; res.length < total; k++) {
    let added = false;
    for (const l of layers) {
      const items = out.filter((s) => s.layer === l);
      if (k < items.length && res.length < total) {
        res.push(items[k]);
        added = true;
      }
    }
    if (!added) break;
  }
  return res;
}

/** Decoded sample with a loudness-matching gain. */
export interface LoadedSample {
  buffer: AudioBuffer;
  intensity: number;
  /** Gain that brings the sample to the bank's loudness reference. */
  norm: number;
}

/** Background loader: fetch manifest, decode the selection, expose layers. */
export class SampleLibrary {
  readonly layers = new Map<string, LoadedSample[]>();
  loaded = 0;
  failed = 0;
  ready = false;
  private aborted = false;

  /** Pick a sample for a layer, preferring intensities close to `intensity` (0..1). */
  pick(layer: string, intensity: number, rand: () => number): LoadedSample | null {
    const list = this.layers.get(layer);
    if (!list || list.length === 0) return null;
    // Choose among the 3 closest intensities.
    let best: LoadedSample[] = list;
    if (list.length > 3) best = [...list].sort((a, b) => Math.abs(a.intensity - intensity) - Math.abs(b.intensity - intensity)).slice(0, 3);
    return best[Math.floor(rand() * best.length) % best.length];
  }

  abort(): void {
    this.aborted = true;
  }

  /**
   * Load (never throws). `base` is the URL prefix of the sounds folder, `decode` decodes an
   * ArrayBuffer into an AudioBuffer, `loudness` returns the weighted loudness gain.
   */
  async load(base: string, decode: (data: ArrayBuffer) => Promise<AudioBuffer>, normGain: (b: AudioBuffer) => number, concurrency = 4): Promise<void> {
    try {
      if (typeof fetch !== "function") return;
      const res = await fetch(base + "manifest.json");
      if (!res.ok) return;
      const rows = (await res.json()) as ManifestRow[];
      if (!Array.isArray(rows)) return;
      const sel = selectSamples(rows);
      let next = 0;
      const worker = async () => {
        while (!this.aborted) {
          const i = next++;
          if (i >= sel.length) return;
          const s = sel[i];
          try {
            const r = await fetch(base + s.file.split("/").map(encodeURIComponent).join("/"));
            if (!r.ok) throw new Error(String(r.status));
            const buf = await decode(await r.arrayBuffer());
            if (!buf || !(buf.length > 0)) throw new Error("empty");
            const list = this.layers.get(s.layer) ?? [];
            list.push({ buffer: buf, intensity: s.intensity, norm: normGain(buf) });
            this.layers.set(s.layer, list);
            this.loaded++;
          } catch {
            this.failed++;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    } catch {
      /* no manifest / offline: synthesized sounds only */
    } finally {
      this.ready = true;
    }
  }
}
