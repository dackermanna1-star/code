// Small decor & tableware for the living/dining room. Every item is its own assembly so it can
// be grabbed, thrown and smashed individually:
//  * books (hardcover: two cover boards + spine + page block that tears into paper; paperback:
//    one paper block), magazines,
//  * pillar candles (wax) on a walnut tray, a glazed decorative bowl, ceramic vases, a ceramic
//    figurine, a flower vase holding water (`liquid`) with stems and blossoms,
//  * a standing photo frame (frame bars, glass, photo, backing, easel strut),
//  * framed paintings (wood frame + glass + canvas + backing) hanging on a weak NAIL world bond,
//    a wall mirror (MDF frame, 4 mm mirror glass, backing) on two screwed D-ring hangers,
//  * an area rug (thin soft slab), placemats, dinner plates, stemmed wine glasses, throw pillows.
//
// Frames: origin at the floor/support contact centre (wall items: bottom centre of the back face
// on the wall, front +Z), +Y up.

import { Builder, type V3 } from "../lib/builder.ts";
import { book, bowl, frameBars, lowestPart, pictureFrame, pillow, plate, vase, vessel } from "../lib/kit.ts";
import { qeuler, qrot, v3, vadd } from "../../geom/vec.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { bondTouching, PALETTE, SOFT_SEAM } from "./lib.ts";

const COVERS: SurfaceName[] = ["book_cover_0", "book_cover_1", "book_cover_2", "book_cover_3"];

// =============================================================================================
// Books & magazines
// =============================================================================================

export type BookSize = "paperback" | "trade" | "hardcover" | "large";

/** Book dimensions [w (page depth), h, t (thickness)] by format (m). */
export const BOOK_SIZES: Record<BookSize, [number, number, number]> = {
  paperback: [0.108, 0.178, 0.022],
  trade: [0.14, 0.215, 0.026],
  hardcover: [0.16, 0.24, 0.034],
  large: [0.23, 0.29, 0.028],
};

export interface BookOpts {
  size?: BookSize;
  /** Overrides of the format's [w, h, t]. */
  dims?: [number, number, number];
  cover?: number;
  tint?: number;
  seed?: number;
}

/**
 * Book standing upright: spine faces +Z, thickness along X, page depth along Z, base on y = 0.
 * Paperbacks are one paper block; other formats are hardcovers (covers + spine + page block).
 */
export function buildBook(o: BookOpts = {}): AssemblyDef {
  const size = o.size ?? "hardcover";
  const hard = size !== "paperback";
  const b = new Builder(hard ? "hardcoverBook" : "paperbackBook", hard ? "Hardcover Book" : "Paperback", "decor", hard ? 25 : 10, o.seed);
  const [w, h, t] = o.dims ?? BOOK_SIZES[size];
  const cover = COVERS[(o.cover ?? b.rng.int(0, 3)) % 4];
  const tint = o.tint ?? PALETTE.bookCovers[b.rng.int(0, PALETTE.bookCovers.length - 1)];
  book(b, "book", { w, h, t, cover, tint, hardcover: hard, parts: hard ? 4 : 1 });
  return b.build();
}

/** Magazine lying flat (A4-ish, ~0.2 kg). */
export function buildMagazine(o: { cover?: number; tint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("magazine", "Magazine", "decor", 6, o.seed);
  const cover = COVERS[(o.cover ?? b.rng.int(0, 3)) % 4];
  const tint = o.tint ?? PALETTE.bookCovers[b.rng.int(0, PALETTE.bookCovers.length - 1)];
  const p = b.box("magazine", "paper", "book_pages", [0.21, 0.005, 0.28], [0, 0.0025, 0], {
    faces: { py: { surf: cover, tint }, ny: { surf: cover, tint } },
  });
  b.stuffing(p, "paper");
  return b.build();
}

// =============================================================================================
// Candles, bowl, vases, figurine
// =============================================================================================

/** Pillar candle (paraffin wax ~900 kg/m³, modelled on the plastic material: it cracks). */
export function buildPillarCandle(o: { r?: number; h?: number; tint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("pillarCandle", "Pillar Candle", "decor", 12, o.seed);
  const r = o.r ?? 0.035,
    h = o.h ?? 0.12;
  const vol = Math.PI * r * r * h;
  b.cyl("wax", "plastic", "plastic", r, h, [0, h / 2, 0], { segments: 12, tint: o.tint ?? 0xf1e8d4, capTint: 0xe8dcc0, mass: vol * 900 });
  return b.build();
}

/** Walnut candle tray (0.34 × 0.018 × 0.16 m). */
export function buildCandleTray(o: { seed?: number } = {}): AssemblyDef {
  const b = new Builder("candleTray", "Candle Tray", "decor", 30, o.seed);
  b.bevelBox("tray", "hardwood", "wood_walnut", [0.34, 0.018, 0.16], 0.004, [0, 0.009, 0], { grain: "x" });
  return b.build();
}

/** Glazed decorative bowl (Ø 0.26 m). */
export function buildDecorBowl(o: { tint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("decorBowl", "Ceramic Bowl", "decor", 45, o.seed);
  bowl(b, "bowl", { r: 0.13, h: 0.075, t: 0.007, segments: 8, tint: o.tint ?? 0x2f5d6b });
  return b.build();
}

/** Ceramic vase (hollow lathe shell). */
export function buildCeramicVase(o: { r?: number; h?: number; tint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("ceramicVase", "Ceramic Vase", "decor", 40, o.seed);
  const tint = o.tint ?? PALETTE.ceramic[b.rng.int(0, PALETTE.ceramic.length - 1)];
  vase(b, "vase", { r: o.r ?? 0.06, h: o.h ?? 0.22, t: 0.006, segments: 6, tint });
  return b.build();
}

/** Glazed ceramic figurine (abstract bird on a plinth, ~0.35 kg). */
export function buildFigurine(o: { tint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("figurine", "Ceramic Figurine", "decor", 35, o.seed);
  const tint = o.tint ?? 0xf3f0ea;
  const base = b.cyl("plinth", "ceramic", "ceramic_glaze", 0.035, 0.015, [0, 0.0075, 0], { segments: 10, tint });
  const body = b.ellipsoid("body", "ceramic", "ceramic_glaze", [0.03, 0.055, 0.026], [0, 0.015 + 0.055 - 0.004, 0], { tint, segments: 10, rings: 6 });
  const head = b.ellipsoid("head", "ceramic", "ceramic_glaze", [0.02, 0.02, 0.018], [0.006, 0.015 + 0.11 - 0.008 + 0.02 - 0.004, 0.004], { tint, segments: 8, rings: 5 });
  b.fuse(body, base);
  b.fuse(head, body);
  return b.build();
}

/** Flower vase with water (`liquid`) and five cut flowers. */
export function buildFlowerVase(o: { tint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("flowerVase", "Vase of Flowers", "decor", 55, o.seed);
  const r = 0.07,
    h = 0.26,
    t = 0.006;
  const tiles = vase(b, "vase", { r, h, t, segments: 6, tint: o.tint ?? 0xe9e3d6 });
  const floor = lowestPart(b, tiles);
  b.liquid(floor, 0xcfe3ea, 0.4);
  const petals = [0xd8425a, 0xf2f0ea, 0xe7a23b, 0xc25a9a, 0xf0d34a];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * 2 * Math.PI + 0.3;
    const c = Math.cos(a),
      s = Math.sin(a);
    const topR = 0.05 + 0.025 * (k % 2);
    const topY = h + 0.17 + 0.05 * ((k * 3) % 5) * 0.4;
    const stem = b.tube(`stem${k}`, "food", "foliage", [
      [0.006 * c, t + 0.004, 0.006 * s],
      [0.012 * c, h, 0.012 * s],
      [topR * c, topY, topR * s],
    ], 0.0025, { sides: 5, tint: 0x4f7a34, joint: "fused", jointStrength: 6 });
    b.friction(stem[0], floor, 2);
    const head: V3 = [topR * c * 1.06, topY + 0.018, topR * s * 1.06];
    const bloom = b.ellipsoid(`bloom${k}`, "paper", "fabric_cotton", [0.03, 0.022, 0.03], head, { tint: petals[k], segments: 8, rings: 4, mass: 0.006 });
    b.glue(bloom, stem[1], 4);
  }
  return b.build();
}

// =============================================================================================
// Frames, paintings, mirror
// =============================================================================================

/** Standing photo frame with an easel strut (0.16 × 0.21 m). */
export function buildPhotoFrame(o: { w?: number; h?: number; tint?: number; surf?: SurfaceName; seed?: number } = {}): AssemblyDef {
  const b = new Builder("photoFrame", "Photo Frame", "decor", 20, o.seed);
  const w = o.w ?? 0.16,
    h = o.h ?? 0.21,
    depth = 0.012;
  const lean = 12; // degrees back from vertical
  const a = (-lean * Math.PI) / 180;
  const q = qeuler(a, 0, 0);
  const gy = (h / 2) * Math.cos(a); // bottom back edge on the floor
  const gz = 0.02;
  const pf = pictureFrame(b, "frame", { w, h, bar: 0.018, depth, mat: "softwood", surf: o.surf ?? "wood_walnut", tint: o.tint, art: "photo_0", nail: false }, [0, gy, gz], [-lean, 0, 0]);
  // easel strut: from the back of the backing down to the floor behind
  const hingeLocal = v3(0, 0.03, 0); // on the back face (z = 0)
  const H = vadd(qrot(q, hingeLocal), v3(0, gy, gz));
  const footZ = H.z - 0.075;
  const sw = 0.03,
    st = 0.003;
  const pts: V3[] = [];
  for (const x of [-sw / 2, sw / 2]) {
    pts.push([x, H.y, H.z], [x, H.y + 0.002, H.z - st]);
    pts.push([x, 0, footZ], [x, 0, footZ - st]);
  }
  const strut = b.hull("strut", "mdf", "mdf", pts, [0, 0, 0], { tint: 0x5a4636 });
  b.glue(strut, pf.backing, 4);
  return b.build();
}

export interface PaintingOpts {
  w?: number;
  h?: number;
  art?: SurfaceName;
  frameSurf?: SurfaceName;
  frameTint?: number;
  /** Nail strength (J) — weak, so it falls when the wall is hit hard. */
  nail?: number;
  seed?: number;
}

/** Framed painting hanging on a nail. Origin: bottom centre of the back face (on the wall). */
export function buildFramedPainting(o: PaintingOpts = {}): AssemblyDef {
  const b = new Builder("framedPainting", "Framed Painting", "decor", 240, o.seed);
  const w = o.w ?? 0.9,
    h = o.h ?? 0.65;
  pictureFrame(b, "painting", { w, h, bar: 0.045, depth: 0.03, mat: "hardwood", surf: o.frameSurf ?? "wood_walnut", tint: o.frameTint, art: o.art ?? "painting_0", glass: true, nail: { strength: o.nail ?? 12 } }, [0, h / 2, 0]);
  return b.build();
}

/** Wall mirror (0.6 × 0.9 m, ~7 kg) on two D-ring hangers screwed into the wall. */
export function buildWallMirror(o: { w?: number; h?: number; frameTint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("wallMirror", "Wall Mirror", "decor", 160, o.seed);
  const w = o.w ?? 0.6,
    h = o.h ?? 0.9,
    bar = 0.04,
    depth = 0.025;
  const fr = frameBars(b, "frame", { w, h, bar, depth, mat: "mdf", surf: "metal_black", tint: o.frameTint ?? 0xffffff, corner: { kind: "glue", strength: 45 } }, [0, h / 2, 0]);
  const iw = fr.inner.x1 - fr.inner.x0,
    ih = fr.inner.y1 - fr.inner.y0;
  const glass = b.box("glass", "glass", "glass_edge", [iw, ih, 0.004], [0, h / 2, 0.014], { faces: { pz: { surf: "mirror" }, nz: { surf: "mdf" } } });
  const backing = b.box("backing", "mdf", "mdf", [iw, ih, 0.003], [0, h / 2, 0.0105]);
  for (const bar_ of fr.all) {
    b.clip(glass, bar_, 6);
    b.clip(backing, bar_, 6);
  }
  b.glue(glass, backing, 30);
  // D-rings on the side bars near the top, each screwed into a wall anchor
  b.world(fr.left, "screw", 30, [-(w / 2 - bar / 2), h - 0.12, 0]);
  b.world(fr.right, "screw", 30, [w / 2 - bar / 2, h - 0.12, 0]);
  return b.build();
}

// =============================================================================================
// Textiles & tableware
// =============================================================================================

/** Area rug: thin soft slab (wool pile on a jute backing), 1.4 × 2.0 m by default. */
export function buildAreaRug(o: { w?: number; l?: number; tint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("areaRug", "Area Rug", "soft", 220, o.seed);
  const w = o.w ?? 1.4,
    l = o.l ?? 2.0,
    t = 0.01;
  b.box("rug", "fabric", "carpet", [w, t, l], [0, t / 2, 0], { tint: o.tint ?? 0xcfc4b4, faces: { py: { surf: "rug_pattern" } } });
  return b.build();
}

/** Woven placemat (0.45 × 0.32 m). */
export function buildPlacemat(o: { tint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("placemat", "Placemat", "soft", 8, o.seed);
  b.box("mat", "fabric", "fabric_cotton", [0.45, 0.003, 0.32], [0, 0.0015, 0], { tint: o.tint ?? 0xb9a27c });
  return b.build();
}

/** Stoneware dinner plate (Ø 0.27 m). */
export function buildDinnerPlate(o: { tint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("dinnerPlate", "Dinner Plate", "kitchenware", 12, o.seed);
  plate(b, "plate", { segments: 8, tint: o.tint ?? 0xf5f2ea });
  return b.build();
}

/** Stemmed wine glass (annealed glass: bowl tiles fused onto a pulled stem and a foot). */
export function buildWineGlass(o: { seed?: number } = {}): AssemblyDef {
  const b = new Builder("wineGlass", "Wine Glass", "kitchenware", 9, o.seed);
  const footT = 0.003,
    stemH = 0.085;
  const foot = b.cyl("foot", "glass", "glass", 0.034, footT, [0, footT / 2, 0], { segments: 12, capSurf: "glass" });
  const stem = b.cyl("stem", "glass", "glass", 0.0035, stemH + 0.002, [0, footT + stemH / 2, 0], { segments: 8 });
  const bowlTiles = vessel(
    b,
    "bowl",
    {
      profile: [
        [0.016, 0],
        [0.042, 0.045],
        [0.035, 0.1],
      ],
      t: 0.002,
      segments: 6,
      mat: "glass",
      surf: "glass",
    },
    [0, footT + stemH, 0],
  );
  b.fuse(stem, foot, 12);
  bondTouching(b, stem, bowlTiles, "fused", 12, 0.0015);
  return b.build();
}

/** Feather-filled throw pillow lying flat (0.45 × 0.14 × 0.45 m). */
export function buildThrowPillow(o: { tint?: number; size?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("throwPillow", "Throw Pillow", "soft", 35, o.seed);
  const s = o.size ?? 0.45;
  pillow(b, "pillow", { size: [s, 0.14, s], tint: o.tint ?? 0xd9b45a, surf: "fabric_cotton", kg: 0.55, fill: "feathers" });
  void SOFT_SEAM;
  return b.build();
}
