package com.mineception.dream;

import static com.mineception.dream.MiniBlock.AIR;
import static com.mineception.dream.MiniBlock.BLACK_CONCRETE;
import static com.mineception.dream.MiniBlock.BOOKSHELF;
import static com.mineception.dream.MiniBlock.DARK_OAK_PLANKS;
import static com.mineception.dream.MiniBlock.GLASS;
import static com.mineception.dream.MiniBlock.GLOWSTONE;
import static com.mineception.dream.MiniBlock.OAK_LEAVES;
import static com.mineception.dream.MiniBlock.POLISHED_ANDESITE;
import static com.mineception.dream.MiniBlock.QUARTZ_BLOCK;
import static com.mineception.dream.MiniBlock.RED_WOOL;
import static com.mineception.dream.MiniBlock.SEA_LANTERN;
import static com.mineception.dream.MiniBlock.SMOOTH_STONE;
import static com.mineception.dream.MiniBlock.STONE;
import static com.mineception.dream.MiniBlock.TERRACOTTA;
import static com.mineception.dream.MiniBlock.WHITE_WOOL;

/**
 * Level 2, The Hotel: a grand lobby sealed on every side. The player stands behind the dark-oak reception desk and looks
 * across the laptop down a red carpet, between rows of quartz columns under chandeliers and galleries of room doors,
 * to the glass entrance at the far end. Built in the canonical frame (looking north from the desk).
 */
final class HotelLevel {
	/** Floor surface layer and the first air layer above it. */
	private static final int FLOOR = 3;
	private static final int G = FLOOR + 1;

	/** Three moods for the lobby. */
	private enum Palette {
		/** Warm terracotta walls under a quartz ceiling, golden lamps. */
		WARM(TERRACOTTA, QUARTZ_BLOCK, DARK_OAK_PLANKS, TERRACOTTA, GLOWSTONE),
		/** White marble everywhere, cool sea lantern light. */
		MARBLE(QUARTZ_BLOCK, WHITE_WOOL, POLISHED_ANDESITE, QUARTZ_BLOCK, SEA_LANTERN),
		/** Dark wood panelling and walls of books, like an old library. */
		LIBRARY(DARK_OAK_PLANKS, DARK_OAK_PLANKS, DARK_OAK_PLANKS, BOOKSHELF, GLOWSTONE);

		final MiniBlock wall;
		final MiniBlock ceiling;
		final MiniBlock aisleA;
		final MiniBlock aisleB;
		final MiniBlock lamp;

		Palette(MiniBlock wall, MiniBlock ceiling, MiniBlock aisleA, MiniBlock aisleB, MiniBlock lamp) {
			this.wall = wall;
			this.ceiling = ceiling;
			this.aisleA = aisleA;
			this.aisleB = aisleB;
			this.lamp = lamp;
		}
	}

	private final MiniWorld w;
	private final DreamRandom r;
	/** Nave centre x, half the distance between the column rows, and the column spacing along z. */
	private final int ac;
	private final int half;
	private final int spacing;
	/** Ceiling layer and gallery floor layer (0 if the hall has no galleries). */
	private final int ceiling;
	private final int gallery;
	/** The hotel's mood: wall, ceiling, aisle floor and lamp materials. */
	private final Palette palette;
	private final MiniBlock wall;
	private final MiniBlock lamp;
	/** Row of the reception desk. */
	private final int deskZ;

	private HotelLevel(MiniWorld w, DreamRandom r) {
		this.w = w;
		this.r = r;
		this.ac = r.range(19, 20);
		this.half = r.range(4, 6);
		this.spacing = r.range(5, 6);
		this.ceiling = G + r.range(10, 12);
		this.gallery = r.chance(0.8) ? G + r.range(4, 5) : 0;
		this.palette = r.pick(Palette.values());
		this.wall = palette.wall;
		this.lamp = palette.lamp;
		this.deskZ = r.range(29, 31);
	}

	static WorldGen.Stage build(MiniWorld w, DreamRandom random) {
		return new HotelLevel(w, random).build();
	}

	private WorldGen.Stage build() {
		shell();
		floor();
		columnsAndCeiling();
		if (gallery > 0) {
			galleries();
		}
		sideWalls();
		if (gallery > 0 && r.chance(0.5)) {
			grandStair();
		} else {
			entrance();
		}
		lounge();
		reception();
		int distance = r.range(WorldGen.MIN_SPAWN_DISTANCE, WorldGen.MAX_SPAWN_DISTANCE);
		return new WorldGen.Stage(ac, G, deskZ, distance, DARK_OAK_PLANKS, DARK_OAK_PLANKS, r.nextInt(4));
	}

	/** Foundation, outer walls and the ceiling: the hotel is a sealed box. */
	private void shell() {
		Build.fill(w, 0, 1, 0, 39, FLOOR, 39, STONE);
		Build.fill(w, 0, G, 0, 39, ceiling, 0, wall);
		Build.fill(w, 0, G, 39, 39, ceiling, 39, wall);
		Build.fill(w, 0, G, 0, 0, ceiling, 39, wall);
		Build.fill(w, 39, G, 0, 39, ceiling, 39, wall);
		Build.fill(w, 0, ceiling, 0, 39, ceiling, 39, palette.ceiling);
		// Dark oak skirting along the bottom of every wall
		for (int i = 0; i < 40; i++) {
			w.set(i, G, 0, DARK_OAK_PLANKS);
			w.set(i, G, 39, DARK_OAK_PLANKS);
			w.set(0, G, i, DARK_OAK_PLANKS);
			w.set(39, G, i, DARK_OAK_PLANKS);
		}
	}

	private void floor() {
		boolean checker = r.nextBoolean();
		for (int z = 1; z <= 38; z++) {
			for (int x = 1; x <= 38; x++) {
				MiniBlock b;
				int dx = Math.abs(x - ac);
				if (z > deskZ && dx >= 3) {
					b = DARK_OAK_PLANKS;
				} else if (dx < half) {
					b = checker ? (Math.floorMod(x + z, 2) == 0 ? QUARTZ_BLOCK : POLISHED_ANDESITE)
						: (dx == half - 1 ? TERRACOTTA : QUARTZ_BLOCK);
				} else {
					b = Math.floorMod(x / 2 + z, 2) == 0 ? palette.aisleA : (palette == Palette.LIBRARY ? DARK_OAK_PLANKS : palette.aisleB);
				}
				w.set(x, FLOOR, z, b);
			}
		}
		// The red carpet runner from the entrance to the desk, with a white edge
		for (int z = 1; z <= 38; z++) {
			for (int x = ac - 2; x <= ac + 2; x++) {
				w.set(x, FLOOR, z, Math.abs(x - ac) == 2 ? WHITE_WOOL : RED_WOOL);
			}
		}
	}

	private void columnsAndCeiling() {
		for (int z = 2; z <= deskZ - 3; z += spacing) {
			for (int side = -1; side <= 1; side += 2) {
				int x = ac + side * half;
				Build.column(w, x, G, ceiling - 1, z, QUARTZ_BLOCK);
				w.set(x, G, z, SMOOTH_STONE);
				w.set(x, ceiling - 1, z, SMOOTH_STONE);
			}
			// Dark oak beam across the nave between each pair of columns
			Build.fill(w, ac - half, ceiling - 1, z, ac + half, ceiling - 1, z, DARK_OAK_PLANKS);
		}
		// Beams along the nave and chandeliers hanging in the middle of each coffer
		Build.fill(w, ac - half, ceiling - 1, 1, ac - half, ceiling - 1, deskZ, DARK_OAK_PLANKS);
		Build.fill(w, ac + half, ceiling - 1, 1, ac + half, ceiling - 1, deskZ, DARK_OAK_PLANKS);
		for (int z = 2 + spacing / 2; z <= deskZ - 2; z += spacing) {
			w.set(ac, ceiling - 1, z, DARK_OAK_PLANKS);
			w.set(ac, ceiling - 2, z, lamp);
			if (half >= 5) {
				w.set(ac - 1, ceiling - 2, z, lamp);
				w.set(ac + 1, ceiling - 2, z, lamp);
			}
		}
	}

	/** Upper galleries over both aisles: a floor with recessed lights underneath and a dark oak railing. */
	private void galleries() {
		for (int side = -1; side <= 1; side += 2) {
			int inner = ac + side * half;
			int outer = side < 0 ? 1 : 38;
			Build.fill(w, inner, gallery, 1, outer, gallery, deskZ - 1, DARK_OAK_PLANKS);
			for (int z = 1; z <= deskZ - 1; z++) {
				w.set(inner, gallery + 1, z, Math.floorMod(z, spacing) == 2 ? QUARTZ_BLOCK : DARK_OAK_PLANKS);
			}
			for (int z = 3; z <= deskZ - 2; z += 4) {
				for (int x = Math.min(inner, outer) + 1; x < Math.max(inner, outer); x += 3) {
					w.set(x, gallery, z, SEA_LANTERN);
				}
			}
			// Room doors along the outer wall upstairs
			int wallX = side < 0 ? 0 : 39;
			for (int z = 3; z <= deskZ - 3; z += 4) {
				w.set(wallX, gallery + 1, z, DARK_OAK_PLANKS);
				w.set(wallX, gallery + 2, z, DARK_OAK_PLANKS);
				w.set(wallX - side, gallery + 3, z, lamp);
			}
		}
		// A staircase up to the west gallery along the outer wall
		int steps = gallery - G;
		int start = r.range(6, 12);
		for (int i = 0; i < steps; i++) {
			Build.fill(w, 1, G, start + i, 2, G + i, start + i, QUARTZ_BLOCK);
			Build.fill(w, 1, G + i, start + i, 2, G + i, start + i, RED_WOOL);
		}
		// Stairwell: open the gallery floor where a climbing player's head would hit it
		Build.fill(w, 1, gallery, start + steps - 2, 2, gallery, start + steps - 1, AIR);
	}

	/** Tall windows and bookshelves along the side walls of the ground floor. */
	private void sideWalls() {
		int top = gallery > 0 ? gallery - 1 : ceiling - 2;
		for (int side = -1; side <= 1; side += 2) {
			int x = side < 0 ? 0 : 39;
			for (int z = 2; z <= deskZ - 2; z += 4) {
				if (r.chance(palette == Palette.LIBRARY ? 0.3 : 0.55)) {
					Build.fill(w, x, G + 1, z, x, top - 1, z + 1, GLASS);
				} else {
					int shelves = palette == Palette.LIBRARY ? top - 1 : Math.min(G + 2, top - 1);
					Build.fillAir(w, x - side, G, z, x - side, shelves, z + 1, BOOKSHELF);
				}
			}
			if (gallery > 0) {
				for (int z = 5; z <= deskZ - 2; z += 4) {
					Build.fill(w, x, gallery + 2, z, x, ceiling - 2, z, GLASS);
				}
			}
		}
	}

	/** The far wall: glass doors on the carpet's axis between tall windows. */
	private void entrance() {
		Build.fill(w, ac - 1, G, 0, ac + 1, G + 2, 0, GLASS);
		Build.fill(w, ac - 2, G + 3, 0, ac + 2, G + 3, 0, DARK_OAK_PLANKS);
		Build.fill(w, ac - 1, G + 4, 0, ac + 1, ceiling - 3, 0, GLASS);
		for (int side = -1; side <= 1; side += 2) {
			int x = ac + side * (half + 2);
			Build.fill(w, x, G + 1, 0, x + side, ceiling - 3, 0, GLASS);
			plant(ac + side * 3, 2);
		}
	}

	/**
	 * Instead of the doors: a grand staircase at the end of the carpet, rising to a landing that joins the two galleries
	 * under a tall window.
	 */
	private void grandStair() {
		int steps = gallery - G;
		int width = 3;
		Build.fillAir(w, ac - half, gallery, 1, ac + half, gallery, 2, DARK_OAK_PLANKS);
		for (int x = ac - half + 1; x < ac + half; x++) {
			if (Math.abs(x - ac) > width) {
				w.set(x, gallery + 1, 2, DARK_OAK_PLANKS);
			}
		}
		for (int k = 0; k < steps; k++) {
			int z = 3 + steps - 1 - k;
			int top = G + k;
			for (int x = ac - width; x <= ac + width; x++) {
				Build.column(w, x, G, top, z, QUARTZ_BLOCK);
				w.set(x, top, z, Math.abs(x - ac) <= 1 ? RED_WOOL : QUARTZ_BLOCK);
			}
			for (int side = -1; side <= 1; side += 2) {
				Build.column(w, ac + side * (width + 1), G, top + 1, z, DARK_OAK_PLANKS);
			}
		}
		// Newel posts with lamps at the foot of the stairs, and the tall window above the landing
		int foot = 3 + steps - 1;
		for (int side = -1; side <= 1; side += 2) {
			Build.column(w, ac + side * (width + 1), G, G + 1, foot + 1, DARK_OAK_PLANKS);
			w.set(ac + side * (width + 1), G + 2, foot + 1, lamp);
			int x = ac + side * (half + 2);
			Build.fill(w, x, G + 1, 0, x + side, gallery - 1, 0, GLASS);
		}
		Build.fill(w, ac - 2, gallery + 2, 0, ac + 2, ceiling - 2, 0, GLASS);
		Build.fill(w, ac - 3, gallery + 2, 0, ac - 3, ceiling - 2, 0, DARK_OAK_PLANKS);
		Build.fill(w, ac + 3, gallery + 2, 0, ac + 3, ceiling - 2, 0, DARK_OAK_PLANKS);
	}

	private void plant(int x, int z) {
		w.set(x, G, z, TERRACOTTA);
		w.set(x, G + 1, z, OAK_LEAVES);
		Build.setIfAir(w, x, G + 2, z, OAK_LEAVES);
	}

	/** Sofas, low tables, plants and a piano in the aisles. */
	private void lounge() {
		for (int side = -1; side <= 1; side += 2) {
			int inner = ac + side * half;
			int outer = side < 0 ? 1 : 38;
			int width = Math.abs(outer - inner) - 1;
			if (width < 4) {
				continue;
			}
			for (int z = r.range(3, 5); z <= deskZ - 6; z += r.range(6, 8)) {
				int cx = (inner + outer) / 2;
				MiniBlock seat = r.pick(RED_WOOL, WHITE_WOOL, RED_WOOL);
				// Two sofas facing each other across a low table
				Build.fill(w, cx - 1, G, z, cx + 1, G, z, seat);
				Build.fill(w, cx - 1, G, z + 3, cx + 1, G, z + 3, seat);
				w.set(cx, G, z + 1, DARK_OAK_PLANKS);
				w.set(cx, G, z + 2, DARK_OAK_PLANKS);
				if (r.chance(0.5)) {
					plant(cx + side * 2, z + 1);
				}
			}
			if (r.chance(0.4)) {
				int pz = deskZ - 5;
				int px = (inner + outer) / 2;
				Build.fillAir(w, px, G, pz, px + 1, G, pz + 1, BLACK_CONCRETE);
				Build.setIfAir(w, px, G + 1, pz, BLACK_CONCRETE);
			}
		}
	}

	/**
	 * The reception: a short dark oak counter carrying the laptop, side counters with lamps further out (so the lobby
	 * stays visible past the laptop), the staff area behind it and the key wall.
	 */
	private void reception() {
		int wing = r.range(4, 5);
		Build.fill(w, ac - 1, G, deskZ, ac + 1, G, deskZ, DARK_OAK_PLANKS);
		for (int side = -1; side <= 1; side += 2) {
			int x = ac + side * wing;
			Build.fill(w, x, G, deskZ + 2, x, G, deskZ + 5, DARK_OAK_PLANKS);
			w.set(x, G + 1, deskZ + 2, lamp);
		}
		// Key cubbies (bookshelves) on the back wall, a door to the office and lamps above
		Build.fill(w, ac - wing, G, 38, ac + wing, G + 2, 38, BOOKSHELF);
		w.set(ac + wing - 1, G, 38, DARK_OAK_PLANKS);
		w.set(ac + wing - 1, G + 1, 38, DARK_OAK_PLANKS);
		for (int x = ac - wing; x <= ac + wing; x += 2) {
			w.set(x, G + 4, 38, lamp);
		}
		// A lower ceiling over the reception makes the lobby beyond feel taller
		Build.fill(w, 1, G + 5, deskZ + 2, 38, G + 5, 38, DARK_OAK_PLANKS);
		for (int x = ac - 4; x <= ac + 4; x += 4) {
			w.set(x, G + 5, deskZ + 4, lamp);
		}
	}
}
