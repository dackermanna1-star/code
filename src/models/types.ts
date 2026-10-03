import type * as THREE from 'three';
import type { Form, FoodState } from '../food/types';
import type { Profile, Rng } from './kit';

export interface SectionOpts {
  /** True when the item was peeled: paint the face without the skin/rind ring. */
  peeled: boolean;
}

/**
 * Visual definition of one ingredient / product. Only `build` is required; everything else
 * lets the generic cut-form builders (src/food/forms.ts) produce good-looking pieces.
 *
 * Coordinate conventions:
 *  - `build()` returns the whole item at real size (metres), resting on y = 0, centred on x/z.
 *  - 'round' / 'disc' style items stand upright: `profile` is [radius, y] from the bottom (y = 0)
 *    to the top. A profile that does not touch the axis (e.g. a closed loop away from it) makes a
 *    ring - fine for donuts.
 *  - 'long' / 'potato' style items lie along the X axis: `profile` is [radius, x] from one end
 *    (x = 0) to the other (the generic builder centres it). Coins are cut perpendicular to X.
 *
 * What the generic builders use, per cut style:
 *  - round:  profile, section (slice discs), sectionV (faces of halves), skin, flesh
 *  - long / potato: profile, section (coins), sectionV (potato halves), skin, flesh
 *  - disc:   profile, sectionV (wedge side faces, e.g. cake layers), skin, flesh
 *  - bread:  sliceShape (loaf slice outline), section (crumb face), skin (crust), flesh
 *  - block:  sliceShape (optional, e.g. triangular cheese slices), section (optional face), skin, flesh
 *  - slab:   skin, flesh, section (optional cut-face pattern: marbling, salmon stripes)
 *  - leafy:  piece (one leaf) or custom forms.leaves / forms.shredded
 *  - bunch:  piece (one grape / floret / pea / shrimp), flesh (for 'diced')
 *  - bun:    forms.halved (top + bottom), egg: forms.cracked + profile/section for boiled halves
 *  - dough:  skin, flesh (pieces = small balls, flat = rolled disc are generic)
 */
export interface ModelDef {
  build(r: Rng): THREE.Object3D;
  /** Main body profile for halves / slices / wedges. */
  profile?: Profile;
  /**
   * Slice outline for 'bread' / 'block' items, in the slice plane: x across (centred on 0),
   * y up from 0 (bottom of the slice). E.g. a loaf slice with a domed top, a cheese triangle.
   */
  sliceShape?: () => THREE.Shape;
  /** Material of the outer skin for generated pieces (sides of slices, skin bits on dice). */
  skin?: () => THREE.Material;
  /** Material of the inside (dice, sticks, mash). */
  flesh?: () => THREE.Material;
  /**
   * Paint the cross-section face into a square canvas of size s. For round/long items it is a
   * disc centred at (s/2, s/2) with radius s/2 (include the rind/peel ring unless opts.peeled).
   * For bread/block/slab items, fill the whole square (it is mapped onto the slice shape's bounds).
   */
  section?: (ctx: CanvasRenderingContext2D, s: number, opts: SectionOpts) => void;
  /**
   * Paint the lengthwise cut face of a halved item / the side face of a wedge into a w x h canvas:
   * canvas x = -R..R across the item, canvas y = top (0) .. bottom (h) of the item.
   * Areas outside the item's silhouette are never shown, so just fill generously.
   */
  sectionV?: (ctx: CanvasRenderingContext2D, w: number, h: number, opts: SectionOpts) => void;
  /** One natural sub-piece for 'bunch' / 'leafy' items (a grape, a floret, a leaf, a shrimp). */
  piece?: (r: Rng, index: number) => THREE.Object3D;
  /** Custom builders for specific forms; take precedence over the generic ones. */
  forms?: Partial<Record<Form, (r: Rng, state: FoodState) => THREE.Object3D>>;
  /**
   * State-dependent replacement, checked before everything else (cooked rice, products that
   * depend on state.tint / state.from...). Return null to use the default path.
   */
  variant?: (state: FoodState, r: Rng) => THREE.Object3D | null;
  /** Peeled whole item. Default: build() with skin meshes recoloured to the peeled colour. */
  peeled?: (r: Rng) => THREE.Object3D;
  /** Thumbnail framing tweak: extra rotation (radians) applied in the fridge icon. */
  iconRotation?: [number, number, number];
}

export type ModelTable = Record<string, ModelDef>;
