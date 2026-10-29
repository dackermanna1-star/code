// Surface (appearance) table. A surface = texture layer(s) + shading parameters. Geometry
// stores only the surface INDEX per face (`S.<name>`); the batcher turns it into vertex
// attributes for the world material. Indices are assigned from list order at module load,
// so always reference surfaces by name (S.wood_oak), never by literal number.
//
// Contract owned by the orchestrator. The render agent implements loading/generation of
// every `tex` (photo textures from public/assets/textures/manifest.json, or procedural
// generators for "proc:*" names) and may tune numbers, and may APPEND new surfaces.

export interface SurfaceDef {
  name: string;
  /** Texture name in public/assets/textures/manifest.json, or "proc:<generator>" for canvas-generated. */
  tex: string;
  /** Metres covered by one texture repeat (uv in metres is divided by this). */
  worldSize: number;
  /** Roughness multiplier (0..1) applied to the texture's roughness channel (or constant if none). */
  roughness: number;
  metallic: number;
  /** Default tint 0xRRGGBB multiplied with the face tint. */
  tint: number;
  /** Emissive strength (HDR; >1 blooms). 0 = not emissive. */
  emissive?: number;
  /** Routed to the transparent glass mesh instead of the opaque world mesh. */
  transparent?: boolean;
  /** Normal-map strength multiplier (default 1). */
  normalStrength?: number;
}

// Photo-backed surfaces use the measured real-world extent of their photo
// (public/assets/textures/manifest.json worldSizeMeters; the procedural fallbacks are drawn at
// the same scale), also when a surface borrows another surface's photo. Deliberate exception:
// `food` uses the plastic photo as a generic fine-grained look at 0.2 m. Printed (whole-picture)
// surfaces are fitted per face by the batcher; their worldSize only matters for strips.
const BUILTIN = [
  // ---- woods
  { name: "wood_oak", tex: "wood_oak", worldSize: 1.0, roughness: 0.75, metallic: 0, tint: 0xffffff },
  { name: "wood_walnut", tex: "wood_walnut", worldSize: 1.0, roughness: 0.7, metallic: 0, tint: 0xffffff },
  { name: "wood_pine", tex: "wood_pine", worldSize: 0.8, roughness: 0.85, metallic: 0, tint: 0xffffff },
  { name: "wood_fiber", tex: "wood_fiber", worldSize: 0.4, roughness: 0.95, metallic: 0, tint: 0xffffff },
  { name: "wood_painted", tex: "paint_wall", worldSize: 1.5, roughness: 0.55, metallic: 0, tint: 0xf2efe8 },
  { name: "plywood", tex: "plywood", worldSize: 1.2, roughness: 0.85, metallic: 0, tint: 0xffffff },
  { name: "mdf", tex: "mdf", worldSize: 0.5, roughness: 0.9, metallic: 0, tint: 0xffffff },
  { name: "particleboard", tex: "particleboard", worldSize: 0.5, roughness: 0.9, metallic: 0, tint: 0xffffff },
  { name: "laminate_white", tex: "plastic", worldSize: 0.5, roughness: 0.35, metallic: 0, tint: 0xf4f4f0 },
  // ---- walls, ceilings, masonry
  { name: "paint_wall", tex: "paint_wall", worldSize: 1.5, roughness: 0.8, metallic: 0, tint: 0xffffff },
  { name: "wallpaper", tex: "wallpaper", worldSize: 0.6, roughness: 0.8, metallic: 0, tint: 0xffffff },
  { name: "gypsum", tex: "gypsum", worldSize: 0.3, roughness: 0.95, metallic: 0, tint: 0xffffff },
  { name: "drywall_paper", tex: "paper", worldSize: 0.3, roughness: 0.9, metallic: 0, tint: 0xd9d2c0 },
  { name: "plaster_ceiling", tex: "plaster_ceiling", worldSize: 0.8, roughness: 0.9, metallic: 0, tint: 0xffffff },
  { name: "concrete", tex: "concrete", worldSize: 1.5, roughness: 0.9, metallic: 0, tint: 0xffffff },
  { name: "concrete_broken", tex: "concrete_broken", worldSize: 0.4, roughness: 0.95, metallic: 0, tint: 0xffffff },
  { name: "insulation", tex: "insulation", worldSize: 0.4, roughness: 1.0, metallic: 0, tint: 0xffffff },
  // ---- tiles & ceramics & stone
  { name: "tile_porcelain", tex: "tile_porcelain", worldSize: 0.6, roughness: 0.35, metallic: 0, tint: 0xffffff },
  { name: "tile_glazed_white", tex: "tile_glazed_white", worldSize: 0.3, roughness: 0.12, metallic: 0, tint: 0xffffff },
  { name: "grout", tex: "grout", worldSize: 0.25, roughness: 0.95, metallic: 0, tint: 0xffffff },
  { name: "ceramic_glaze", tex: "ceramic_glaze", worldSize: 0.5, roughness: 0.08, metallic: 0, tint: 0xffffff },
  { name: "ceramic_bisque", tex: "ceramic_bisque", worldSize: 0.2, roughness: 0.95, metallic: 0, tint: 0xffffff },
  { name: "granite", tex: "granite", worldSize: 0.8, roughness: 0.25, metallic: 0, tint: 0xffffff },
  { name: "marble", tex: "marble", worldSize: 1, roughness: 0.2, metallic: 0, tint: 0xffffff },
  { name: "stone_broken", tex: "concrete_broken", worldSize: 0.4, roughness: 0.9, metallic: 0, tint: 0xb8b2aa },
  // ---- metals
  { name: "steel_brushed", tex: "steel_brushed", worldSize: 0.5, roughness: 0.35, metallic: 1, tint: 0xffffff },
  { name: "metal_painted", tex: "metal_painted", worldSize: 0.5, roughness: 0.4, metallic: 0, tint: 0xffffff },
  { name: "metal_black", tex: "metal_painted", worldSize: 0.5, roughness: 0.45, metallic: 0, tint: 0x222326 },
  { name: "metal_raw", tex: "metal_raw", worldSize: 0.6, roughness: 0.5, metallic: 1, tint: 0xffffff },
  { name: "chrome", tex: "metal_raw", worldSize: 0.6, roughness: 0.08, metallic: 1, tint: 0xffffff },
  { name: "aluminum", tex: "aluminum", worldSize: 0.5, roughness: 0.4, metallic: 1, tint: 0xffffff },
  { name: "copper", tex: "copper", worldSize: 0.3, roughness: 0.35, metallic: 1, tint: 0xffffff },
  { name: "cast_iron", tex: "metal_raw", worldSize: 0.6, roughness: 0.7, metallic: 1, tint: 0x3a3a3a },
  // ---- plastics & rubber
  { name: "plastic", tex: "plastic", worldSize: 0.5, roughness: 0.55, metallic: 0, tint: 0xffffff },
  { name: "plastic_glossy", tex: "plastic", worldSize: 0.5, roughness: 0.2, metallic: 0, tint: 0xffffff },
  { name: "acrylic_white", tex: "ceramic_glaze", worldSize: 0.5, roughness: 0.12, metallic: 0, tint: 0xfbfbf8 },
  { name: "rubber", tex: "rubber", worldSize: 0.4, roughness: 0.9, metallic: 0, tint: 0xffffff },
  // ---- soft goods
  { name: "fabric_upholstery", tex: "fabric_upholstery", worldSize: 0.3, roughness: 0.95, metallic: 0, tint: 0xffffff },
  { name: "fabric_cotton", tex: "fabric_cotton", worldSize: 0.3, roughness: 0.95, metallic: 0, tint: 0xffffff },
  { name: "carpet", tex: "carpet", worldSize: 0.5, roughness: 1.0, metallic: 0, tint: 0xffffff },
  { name: "leather", tex: "leather", worldSize: 0.4, roughness: 0.55, metallic: 0, tint: 0xffffff },
  { name: "foam", tex: "foam", worldSize: 0.15, roughness: 1.0, metallic: 0, tint: 0xffffff },
  { name: "paper", tex: "paper", worldSize: 0.3, roughness: 0.9, metallic: 0, tint: 0xffffff },
  { name: "paper_printed", tex: "proc:paper_printed", worldSize: 0.25, roughness: 0.9, metallic: 0, tint: 0xffffff },
  { name: "cardboard", tex: "cardboard", worldSize: 0.4, roughness: 0.95, metallic: 0, tint: 0xffffff },
  { name: "soil", tex: "soil", worldSize: 0.6, roughness: 1.0, metallic: 0, tint: 0xffffff },
  { name: "foliage", tex: "foliage", worldSize: 0.15, roughness: 0.7, metallic: 0, tint: 0xffffff },
  { name: "food", tex: "plastic", worldSize: 0.2, roughness: 0.5, metallic: 0, tint: 0xffffff },
  // ---- glass & screens (transparent ones go to the glass mesh)
  { name: "glass", tex: "proc:glass", worldSize: 1.0, roughness: 0.05, metallic: 0, tint: 0xe8f4f0, transparent: true },
  { name: "glass_frosted", tex: "proc:glass_frosted", worldSize: 0.5, roughness: 0.4, metallic: 0, tint: 0xf4f8f8, transparent: true },
  { name: "glass_dark", tex: "proc:glass", worldSize: 1.0, roughness: 0.05, metallic: 0, tint: 0x404850, transparent: true },
  { name: "glass_edge", tex: "proc:glass_edge", worldSize: 0.1, roughness: 0.1, metallic: 0, tint: 0x9fd8c8 },
  { name: "mirror", tex: "proc:mirror", worldSize: 1.0, roughness: 0.02, metallic: 1, tint: 0xffffff },
  { name: "lcd_off", tex: "proc:lcd", worldSize: 1.0, roughness: 0.1, metallic: 0, tint: 0x101214 },
  { name: "pcb", tex: "proc:pcb", worldSize: 0.15, roughness: 0.5, metallic: 0, tint: 0xffffff },
  { name: "ic_chip", tex: "proc:ic_chip", worldSize: 0.03, roughness: 0.4, metallic: 0, tint: 0xffffff },
  // ---- emissive
  { name: "bulb_on", tex: "proc:white", worldSize: 0.1, roughness: 0.2, metallic: 0, tint: 0xfff1d6, emissive: 6 },
  { name: "bulb_off", tex: "proc:white", worldSize: 0.1, roughness: 0.2, metallic: 0, tint: 0xd8d4cc },
  { name: "led_green", tex: "proc:white", worldSize: 0.05, roughness: 0.3, metallic: 0, tint: 0x40ff60, emissive: 4 },
  { name: "led_red", tex: "proc:white", worldSize: 0.05, roughness: 0.3, metallic: 0, tint: 0xff3020, emissive: 4 },
  { name: "led_blue", tex: "proc:white", worldSize: 0.05, roughness: 0.3, metallic: 0, tint: 0x4080ff, emissive: 4 },
  { name: "display_green", tex: "proc:display_digits", worldSize: 0.08, roughness: 0.2, metallic: 0, tint: 0x60ff90, emissive: 2.5 },
  { name: "display_blue", tex: "proc:display_digits", worldSize: 0.08, roughness: 0.2, metallic: 0, tint: 0x70b0ff, emissive: 2.5 },
  // ---- printed / decorative procedural
  { name: "panel_microwave", tex: "proc:panel_microwave", worldSize: 0.3, roughness: 0.3, metallic: 0, tint: 0xffffff },
  { name: "panel_appliance", tex: "proc:panel_appliance", worldSize: 0.3, roughness: 0.3, metallic: 0, tint: 0xffffff },
  { name: "keycaps", tex: "proc:keycaps", worldSize: 0.1, roughness: 0.5, metallic: 0, tint: 0xffffff },
  { name: "speaker_grille", tex: "proc:grille", worldSize: 0.05, roughness: 0.8, metallic: 0, tint: 0x2a2a2a },
  { name: "vent_grille", tex: "proc:grille", worldSize: 0.08, roughness: 0.6, metallic: 0, tint: 0xe8e8e8 },
  { name: "book_cover_0", tex: "proc:book_cover_0", worldSize: 0.25, roughness: 0.6, metallic: 0, tint: 0xffffff },
  { name: "book_cover_1", tex: "proc:book_cover_1", worldSize: 0.25, roughness: 0.6, metallic: 0, tint: 0xffffff },
  { name: "book_cover_2", tex: "proc:book_cover_2", worldSize: 0.25, roughness: 0.6, metallic: 0, tint: 0xffffff },
  { name: "book_cover_3", tex: "proc:book_cover_3", worldSize: 0.25, roughness: 0.6, metallic: 0, tint: 0xffffff },
  { name: "book_pages", tex: "proc:book_pages", worldSize: 0.05, roughness: 0.9, metallic: 0, tint: 0xfaf5e8 },
  { name: "painting_0", tex: "proc:painting_0", worldSize: 0.8, roughness: 0.7, metallic: 0, tint: 0xffffff },
  { name: "painting_1", tex: "proc:painting_1", worldSize: 0.6, roughness: 0.7, metallic: 0, tint: 0xffffff },
  { name: "poster_0", tex: "proc:poster_0", worldSize: 0.7, roughness: 0.6, metallic: 0, tint: 0xffffff },
  { name: "photo_0", tex: "proc:photo_0", worldSize: 0.2, roughness: 0.3, metallic: 0, tint: 0xffffff },
  { name: "rug_pattern", tex: "proc:rug_pattern", worldSize: 2.0, roughness: 1.0, metallic: 0, tint: 0xffffff },
  { name: "clock_face", tex: "proc:clock_face", worldSize: 0.3, roughness: 0.3, metallic: 0, tint: 0xffffff },
  { name: "label_food", tex: "proc:label_food", worldSize: 0.25, roughness: 0.5, metallic: 0, tint: 0xffffff },
  { name: "label_bottle", tex: "proc:label_bottle", worldSize: 0.2, roughness: 0.5, metallic: 0, tint: 0xffffff },
  { name: "city_windows", tex: "proc:city_windows", worldSize: 12.0, roughness: 0.6, metallic: 0, tint: 0xffffff, emissive: 1.2 },
  // ---- damage overlays
  { name: "crack_line", tex: "proc:white", worldSize: 0.1, roughness: 0.95, metallic: 0, tint: 0x14110e },
  { name: "scorch", tex: "proc:scorch", worldSize: 0.3, roughness: 1.0, metallic: 0, tint: 0x202020 },
] as const satisfies readonly SurfaceDef[];

export type SurfaceName = (typeof BUILTIN)[number]["name"];

const L: SurfaceDef[] = BUILTIN.map((s) => ({ ...s }));

export const SURFACES: readonly SurfaceDef[] = L;

/** Surface name → index (typo-safe for built-in surfaces). */
export const S: Readonly<Record<SurfaceName, number>> = Object.fromEntries(L.map((s, i) => [s.name, i])) as Record<
  SurfaceName,
  number
>;

const byName = new Map<string, number>(L.map((s, i) => [s.name, i]));

export function surfaceIndex(name: string): number {
  const i = byName.get(name);
  if (i === undefined) throw new Error(`unknown surface '${name}'`);
  return i;
}

export function surfaceDef(index: number): SurfaceDef {
  const s = L[index];
  if (!s) throw new Error(`bad surface index ${index}`);
  return s;
}

/** Append a surface at runtime (render agent / content). Returns its index. */
export function registerSurface(def: SurfaceDef): number {
  const existing = byName.get(def.name);
  if (existing !== undefined) return existing;
  L.push({ ...def });
  byName.set(def.name, L.length - 1);
  return L.length - 1;
}
