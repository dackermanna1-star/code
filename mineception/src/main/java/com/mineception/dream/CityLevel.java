package com.mineception.dream;

import static com.mineception.dream.MiniBlock.AIR;
import static com.mineception.dream.MiniBlock.BLACK_CONCRETE;
import static com.mineception.dream.MiniBlock.BOOKSHELF;
import static com.mineception.dream.MiniBlock.BRICKS;
import static com.mineception.dream.MiniBlock.DARK_OAK_PLANKS;
import static com.mineception.dream.MiniBlock.DEEPSLATE_TILES;
import static com.mineception.dream.MiniBlock.GLASS;
import static com.mineception.dream.MiniBlock.GLOWSTONE;
import static com.mineception.dream.MiniBlock.GRAY_CONCRETE;
import static com.mineception.dream.MiniBlock.LIGHT_GRAY_CONCRETE;
import static com.mineception.dream.MiniBlock.OAK_LEAVES;
import static com.mineception.dream.MiniBlock.OAK_LOG;
import static com.mineception.dream.MiniBlock.OAK_PLANKS;
import static com.mineception.dream.MiniBlock.POLISHED_ANDESITE;
import static com.mineception.dream.MiniBlock.QUARTZ_BLOCK;
import static com.mineception.dream.MiniBlock.RED_WOOL;
import static com.mineception.dream.MiniBlock.SEA_LANTERN;
import static com.mineception.dream.MiniBlock.SMOOTH_STONE;
import static com.mineception.dream.MiniBlock.STONE;
import static com.mineception.dream.MiniBlock.STONE_BRICKS;
import static com.mineception.dream.MiniBlock.TERRACOTTA;
import static com.mineception.dream.MiniBlock.WATER;
import static com.mineception.dream.MiniBlock.WHITE_WOOL;
import static com.mineception.dream.MiniBlock.YELLOW_CONCRETE;

/**
 * Level 1, The City: a rainy avenue between brick, stone and glass towers. The laptop waits on a café table in the
 * pedestrian square where the avenue begins; from the spawn the street runs away from you past the laptop, either
 * through a zebra-striped intersection into the rain or, in most dreams, up into the sky where the city folds over
 * itself. Built in the canonical frame (looking north up the avenue).
 */
final class CityLevel {
	/** First air layer above the street. */
	static final int G = 5;
	private static final int SURFACE = G - 1;
	private static final int MAX_Y = MiniWorld.SY - 1;
	/** First row of the low buildings that close the square behind the spawn. */
	private static final int BACK_Z = 37;
	/** How often the far end of the avenue folds up into the sky. */
	private static final double FOLD_CHANCE = 0.6;
	/** Cross street row for layouts without one (far outside the level, so nothing is drawn). */
	private static final int NO_CROSS_STREET = -100;

	private enum Style {
		BRICK, STONE, OFFICE, DARK
	}

	private final MiniWorld w;
	private final DreamRandom r;
	/** Avenue centre x, the cross street's first row and the square's first row. */
	private final int ac;
	private final int crossZ;
	private final int squareZ;

	private CityLevel(MiniWorld w, DreamRandom r, int ac, int crossZ, int squareZ) {
		this.w = w;
		this.r = r;
		this.ac = ac;
		this.crossZ = crossZ;
		this.squareZ = squareZ;
	}

	static WorldGen.Stage build(MiniWorld w, DreamRandom random) {
		int ac = random.range(18, 21);
		int squareZ = random.range(26, 27);
		if (random.chance(FOLD_CHANCE)) {
			return new CityLevel(w, random, ac, NO_CROSS_STREET, squareZ).buildFolded();
		}
		return new CityLevel(w, random, ac, random.range(11, 15), squareZ).build();
	}

	private WorldGen.Stage build() {
		ground();
		street(0, crossZ - 4);
		street(crossZ + 8, BACK_Z - 1);
		return finish();
	}

	/** The square, the café, street furniture and the laptop's place, shared by both layouts. */
	private WorldGen.Stage finish() {
		int cafeSide = r.sign();
		int laptopX = ac + cafeSide * r.range(0, 2);
		int laptopZ = squareZ + r.range(1, 2);
		int distance = r.range(WorldGen.MIN_SPAWN_DISTANCE, WorldGen.MAX_SPAWN_DISTANCE);
		backRow();
		cafe(cafeSide, laptopX, laptopZ);
		furniture(laptopX);
		return new WorldGen.Stage(laptopX, G, laptopZ, distance, OAK_PLANKS, SMOOTH_STONE, r.nextInt(4));
	}

	/**
	 * The dream folds: past the near blocks the avenue bends up into the sky, carrying its buildings, cabs and lamps
	 * with it, until the far end of the street stands vertical and its towers hang out over the avenue.
	 */
	private WorldGen.Stage buildFolded() {
		int foldZ = squareZ - r.range(9, 11);
		int radius = r.range(7, 9);
		// The far stretch of the avenue (with its own cross street) is built flat on a separate canvas, then bent
		MiniWorld far = new MiniWorld(w.depth, w.seed);
		CityLevel farCity = new CityLevel(far, r.fork(0xF01D), ac, r.range(24, 30), MiniWorld.SZ);
		farCity.ground();
		farCity.street(0, farCity.crossZ - 4);
		farCity.street(farCity.crossZ + 8, MiniWorld.SZ - 1);
		farCity.furniture(-100);
		ground();
		street(foldZ, BACK_Z - 1);
		WorldGen.Stage stage = finish();
		fold(far, foldZ, radius);
		return stage;
	}

	/**
	 * Replaces everything north of {@code foldZ} with the far canvas bent upward around a horizontal axis: a quarter
	 * circle of {@code radius} blocks, then straight up. Each cell looks up where it would have been before bending.
	 */
	private void fold(MiniWorld far, int foldZ, int radius) {
		double street = SURFACE + 1.0;
		double axisY = street + radius;
		double wallZ = foldZ - radius;
		for (int z = 0; z < foldZ; z++) {
			for (int y = 1; y < MiniWorld.SY; y++) {
				double pz = z + 0.5;
				double py = y + 0.5;
				double along;
				double height;
				if (py <= axisY) {
					double dz = foldZ - pz;
					double dy = axisY - py;
					along = radius * StrictMath.atan2(dz, dy);
					height = radius - Math.sqrt(dz * dz + dy * dy);
				} else {
					along = radius * StrictMath.PI / 2.0 + (py - axisY);
					height = pz - wallZ;
				}
				int fy = (int) Math.floor(street + height);
				int fz = MiniWorld.SZ - 1 - (int) Math.floor(along);
				for (int x = 0; x < MiniWorld.SX; x++) {
					MiniBlock block = fy >= 1 && fz >= 0 ? far.get(x, fy, fz) : AIR;
					w.set(x, y, z, block);
				}
			}
		}
	}

	// ------------------------------------------------------------------ ground

	private void ground() {
		Build.fill(w, 0, 1, 0, 39, SURFACE - 1, 39, STONE);
		Build.fill(w, 0, SURFACE, 0, 39, SURFACE, 39, LIGHT_GRAY_CONCRETE);
		// Avenue and cross street asphalt, curbs, centre line dashes
		Build.fill(w, ac - 3, SURFACE, 0, ac + 3, SURFACE, squareZ - 1, GRAY_CONCRETE);
		Build.fill(w, 0, SURFACE, crossZ, 39, SURFACE, crossZ + 4, GRAY_CONCRETE);
		for (int z = 0; z < squareZ; z++) {
			if (z < crossZ || z > crossZ + 4) {
				w.set(ac - 4, SURFACE, z, SMOOTH_STONE);
				w.set(ac + 4, SURFACE, z, SMOOTH_STONE);
			}
		}
		for (int x = 0; x < 40; x++) {
			if (x < ac - 3 || x > ac + 3) {
				w.set(x, SURFACE, crossZ - 1, SMOOTH_STONE);
				w.set(x, SURFACE, crossZ + 5, SMOOTH_STONE);
			}
		}
		if (squareZ < MiniWorld.SZ) {
			Build.fill(w, ac - 3, SURFACE, squareZ - 1, ac + 3, SURFACE, squareZ - 1, SMOOTH_STONE);
		}
		for (int z = 0; z < squareZ - 2; z++) {
			boolean nearCrossing = z >= crossZ - 3 && z <= crossZ + 7;
			if (!nearCrossing && Math.floorMod(z, 4) < 2) {
				w.set(ac, SURFACE, z, YELLOW_CONCRETE);
			}
		}
		for (int x = 0; x < 40; x++) {
			boolean nearCrossing = x >= ac - 6 && x <= ac + 6;
			if (!nearCrossing && Math.floorMod(x, 4) < 2) {
				w.set(x, SURFACE, crossZ + 2, YELLOW_CONCRETE);
			}
		}
		// Zebra crossings over the avenue on both sides of the intersection, and over the cross street
		for (int x = ac - 3; x <= ac + 3; x++) {
			if (Math.floorMod(x - ac, 2) == 0) {
				Build.fill(w, x, SURFACE, crossZ - 3, x, SURFACE, crossZ - 2, QUARTZ_BLOCK);
				Build.fill(w, x, SURFACE, crossZ + 6, x, SURFACE, crossZ + 7, QUARTZ_BLOCK);
			}
		}
		for (int z = crossZ; z <= crossZ + 4; z++) {
			if (Math.floorMod(z - crossZ, 2) == 0) {
				Build.fill(w, ac - 6, SURFACE, z, ac - 5, SURFACE, z, QUARTZ_BLOCK);
				Build.fill(w, ac + 5, SURFACE, z, ac + 6, SURFACE, z, QUARTZ_BLOCK);
			}
		}
		// The square: paving in a two-tone pattern with a smooth stone border
		for (int z = squareZ; z < BACK_Z; z++) {
			for (int x = ac - 6; x <= ac + 6; x++) {
				boolean border = Math.abs(x - ac) == 6;
				boolean checker = Math.floorMod(Math.floorDiv(x - ac + 1, 3) + Math.floorDiv(z - squareZ, 3), 2) == 0;
				w.set(x, SURFACE, z, border ? SMOOTH_STONE : checker ? POLISHED_ANDESITE : STONE_BRICKS);
			}
		}
		// Rain puddles on the asphalt
		int puddles = r.range(6, 10);
		for (int i = 0; i < puddles; i++) {
			if (r.chance(0.65)) {
				puddle(ac + r.range(-3, 2), r.range(0, squareZ - 3), r.range(1, 2));
			} else {
				puddle(r.range(0, 38), crossZ + r.range(0, 3), r.range(1, 2));
			}
		}
	}

	private void puddle(int x, int z, int size) {
		for (int dx = 0; dx < size; dx++) {
			for (int dz = 0; dz < size; dz++) {
				MiniBlock b = w.get(x + dx, SURFACE, z + dz);
				if (b == GRAY_CONCRETE || b == YELLOW_CONCRETE || b == QUARTZ_BLOCK && Math.abs(x + dx - ac) <= 3) {
					w.set(x + dx, SURFACE, z + dz, WATER);
				}
			}
		}
	}

	// ------------------------------------------------------------------ buildings

	/** Buildings on both sides of one stretch of the avenue, from z0 to z1. */
	private void street(int z0, int z1) {
		lots(0, ac - 7, z0, z1, Face.EAST);
		lots(ac + 7, 39, z0, z1, Face.WEST);
	}

	private void lots(int x0, int x1, int z0, int z1, Face front) {
		int z = z0;
		while (z <= z1) {
			int len = r.range(4, 8);
			if (z1 - (z + len - 1) < 4) {
				len = z1 - z + 1;
			}
			int depth = x1 - x0 + 1;
			int setBack = depth > 9 && r.chance(0.5) ? r.range(0, depth - 8) : 0;
			int bx0 = front == Face.EAST ? x0 + setBack : x0;
			int bx1 = front == Face.EAST ? x1 : x1 - setBack;
			double far = Math.max(0, squareZ - (z + len / 2.0));
			int height = r.range(9, 14) + (int) (far * 0.4);
			building(bx0, z, bx1, z + len - 1, height, pickStyle(height), front);
			z += len;
			// The occasional alley, but never next to the square where the café is
			if (z < squareZ - 6 && r.chance(0.18)) {
				z++;
			}
		}
	}

	private Style pickStyle(int height) {
		if (height >= 15) {
			return r.pick(Style.OFFICE, Style.OFFICE, Style.DARK, Style.STONE, Style.BRICK);
		}
		return r.pick(Style.BRICK, Style.BRICK, Style.STONE, Style.DARK, Style.OFFICE);
	}

	private MiniBlock material(Style style) {
		return switch (style) {
			case BRICK -> r.pick(BRICKS, BRICKS, TERRACOTTA);
			case STONE -> r.pick(STONE_BRICKS, POLISHED_ANDESITE, SMOOTH_STONE);
			case OFFICE -> r.pick(QUARTZ_BLOCK, LIGHT_GRAY_CONCRETE);
			case DARK -> r.pick(DEEPSLATE_TILES, GRAY_CONCRETE);
		};
	}

	/**
	 * One building: a solid block of facade material with recessed windows (glass in front of a dark or lit backing),
	 * a shopfront facing the street and a roof feature. Tall towers step back once near the top.
	 */
	private void building(int x0, int z0, int x1, int z1, int height, Style style, Face front) {
		int width = Math.min(x1 - x0, z1 - z0) + 1;
		if (width < 3) {
			return;
		}
		height = Math.min(height, MAX_Y - G - 4);
		MiniBlock material = material(style);
		int top = G + height - 1;
		int tierAt = height >= 14 && width >= 6 && style != Style.BRICK ? top - r.range(3, 6) : top;
		Build.fill(w, x0, G, z0, x1, tierAt, z1, material);
		windows(x0, z0, x1, z1, tierAt, style);
		if (tierAt < top) {
			Build.fill(w, x0 + 1, tierAt + 1, z0 + 1, x1 - 1, top, z1 - 1, material);
			windows(x0 + 1, z0 + 1, x1 - 1, z1 - 1, top, style);
		}
		shopfront(x0, z0, x1, z1, style, material, front);
		roof(x0, z0, x1, z1, tierAt < top ? 1 : 0, top, style, material);
	}

	private void windows(int x0, int z0, int x1, int z1, int y1, Style style) {
		for (Face side : Face.HORIZONTAL) {
			int len = side.dx != 0 ? z1 - z0 + 1 : x1 - x0 + 1;
			for (int u = 1; u < len - 1; u++) {
				for (int y = G + 3; y <= y1 - 1; y++) {
					if (!isWindow(style, u, y - G)) {
						continue;
					}
					int x = side == Face.EAST ? x1 : side == Face.WEST ? x0 : x0 + u;
					int z = side == Face.SOUTH ? z1 : side == Face.NORTH ? z0 : z0 + u;
					if (w.get(x, y, z) == AIR) {
						continue;
					}
					w.set(x, y, z, GLASS);
					w.set(x - side.dx, y, z - side.dz, backing(style));
				}
			}
		}
	}

	private static boolean isWindow(Style style, int u, int v) {
		return switch (style) {
			case BRICK -> Math.floorMod(v, 3) != 0 && Math.floorMod(u, 2) == 1;
			case STONE -> Math.floorMod(v, 4) == 1 || Math.floorMod(v, 4) == 2 ? Math.floorMod(u, 3) != 0 : false;
			case OFFICE -> Math.floorMod(v, 4) != 0 && Math.floorMod(u, 4) != 0;
			case DARK -> Math.floorMod(u, 2) == 1 && Math.floorMod(v, 5) != 0;
		};
	}

	private MiniBlock backing(Style style) {
		double lit = r.nextDouble();
		return switch (style) {
			case OFFICE -> lit < 0.22 ? SEA_LANTERN : BLACK_CONCRETE;
			case DARK -> lit < 0.3 ? GLOWSTONE : BLACK_CONCRETE;
			default -> lit < 0.25 ? GLOWSTONE : lit < 0.33 ? WHITE_WOOL : lit < 0.55 ? GRAY_CONCRETE : BLACK_CONCRETE;
		};
	}

	/** Ground-floor shop windows, a door and (for older buildings) a striped awning over the sidewalk. */
	private void shopfront(int x0, int z0, int x1, int z1, Style style, MiniBlock material, Face front) {
		int len = front.dx != 0 ? z1 - z0 + 1 : x1 - x0 + 1;
		int door = r.range(1, len - 2);
		MiniBlock display = r.pick(BLACK_CONCRETE, GLOWSTONE, BOOKSHELF, OAK_PLANKS, GRAY_CONCRETE);
		boolean awning = (style == Style.BRICK || style == Style.STONE) && r.chance(0.6);
		MiniBlock stripe = r.pick(RED_WOOL, GRAY_CONCRETE, YELLOW_CONCRETE, BLACK_CONCRETE);
		for (int u = 1; u < len - 1; u++) {
			int x = front == Face.EAST ? x1 : front == Face.WEST ? x0 : x0 + u;
			int z = front == Face.SOUTH ? z1 : front == Face.NORTH ? z0 : z0 + u;
			if (u == door) {
				w.set(x, G, z, DARK_OAK_PLANKS);
				w.set(x, G + 1, z, DARK_OAK_PLANKS);
			} else {
				w.set(x, G, z, GLASS);
				w.set(x, G + 1, z, GLASS);
				w.set(x - front.dx, G, z - front.dz, display);
				w.set(x - front.dx, G + 1, z - front.dz, display);
			}
			if (awning) {
				Build.setIfAir(w, x + front.dx, G + 2, z + front.dz, Math.floorMod(u, 2) == 0 ? stripe : WHITE_WOOL);
			} else if (style == Style.OFFICE) {
				w.set(x, G + 2, z, material);
			}
		}
	}

	private void roof(int x0, int z0, int x1, int z1, int inset, int top, Style style, MiniBlock material) {
		int rx0 = x0 + inset;
		int rz0 = z0 + inset;
		int rx1 = x1 - inset;
		int rz1 = z1 - inset;
		int roofY = top + 1;
		switch (style) {
			case BRICK, STONE -> {
				for (int x = rx0; x <= rx1; x++) {
					w.set(x, roofY, rz0, material);
					w.set(x, roofY, rz1, material);
				}
				for (int z = rz0; z <= rz1; z++) {
					w.set(rx0, roofY, z, material);
					w.set(rx1, roofY, z, material);
				}
				if (style == Style.BRICK && rx1 - rx0 >= 4 && rz1 - rz0 >= 4 && r.chance(0.75)) {
					waterTower(r.range(rx0 + 1, rx1 - 3), roofY, r.range(rz0 + 1, rz1 - 3));
				} else {
					int units = r.range(1, 2);
					for (int i = 0; i < units; i++) {
						Build.setIfAir(w, r.range(rx0 + 1, rx1 - 1), roofY, r.range(rz0 + 1, rz1 - 1), LIGHT_GRAY_CONCRETE);
					}
				}
			}
			case OFFICE, DARK -> {
				int ax = (rx0 + rx1) / 2;
				int az = (rz0 + rz1) / 2;
				int mast = Math.min(r.range(2, 5), MAX_Y - roofY - 1);
				Build.column(w, ax, roofY, roofY + mast - 1, az, style == Style.OFFICE ? LIGHT_GRAY_CONCRETE : BLACK_CONCRETE);
				w.set(ax, roofY + mast, az, style == Style.OFFICE ? RED_WOOL : GLOWSTONE);
			}
		}
	}

	/** The classic wooden water tank on four legs. */
	private void waterTower(int x, int y, int z) {
		if (y + 4 > MAX_Y) {
			return;
		}
		w.set(x, y, z, OAK_LOG);
		w.set(x + 2, y, z, OAK_LOG);
		w.set(x, y, z + 2, OAK_LOG);
		w.set(x + 2, y, z + 2, OAK_LOG);
		Build.fill(w, x, y + 1, z, x + 2, y + 2, z + 2, OAK_PLANKS);
		w.set(x + 1, y + 3, z + 1, OAK_PLANKS);
	}

	/** Low shops closing the square behind the spawn. */
	private void backRow() {
		int x = ac - 6;
		while (x <= ac + 6) {
			int len = Math.min(r.range(4, 7), ac + 6 - x + 1);
			if (len < 3) {
				break;
			}
			building(x, BACK_Z, x + len - 1, 39, r.range(4, 7), r.pick(Style.BRICK, Style.STONE), Face.NORTH);
			x += len;
		}
	}

	/**
	 * The café: the ground floor of the building beside the laptop gets a warm glass front and a red and white awning,
	 * with a couple more tables (and parasols) on the sidewalk.
	 */
	private void cafe(int side, int laptopX, int laptopZ) {
		int fx = side < 0 ? ac - 7 : ac + 7;
		int out = -side;
		for (int z = laptopZ - 3; z <= laptopZ + 2; z++) {
			if (!w.get(fx, G, z).solid()) {
				continue;
			}
			w.set(fx, G, z, GLASS);
			w.set(fx, G + 1, z, GLASS);
			w.set(fx - out, G, z, GLOWSTONE);
			w.set(fx - out, G + 1, z, z % 3 == 0 ? GLOWSTONE : BOOKSHELF);
			w.set(fx + out, G + 2, z, Math.floorMod(z, 2) == 0 ? RED_WOOL : WHITE_WOOL);
		}
		for (int tz : new int[]{laptopZ - 3, laptopZ + 1}) {
			int tx = fx + out * 2;
			if (Math.abs(tx - laptopX) >= 2 && w.get(tx, G, tz) == AIR) {
				w.set(tx, G, tz, OAK_PLANKS);
			}
		}
		int px = fx + out * 2;
		int pz = laptopZ - 6;
		if (w.get(px, G, pz) == AIR) {
			w.set(px, G, pz, OAK_PLANKS);
			parasol(px, pz);
		}
	}

	private void parasol(int x, int z) {
		w.set(x, G + 1, z, OAK_LOG);
		w.set(x, G + 2, z, OAK_LOG);
		for (int dx = -1; dx <= 1; dx++) {
			for (int dz = -1; dz <= 1; dz++) {
				Build.setIfAir(w, x + dx, G + 3, z + dz, Math.floorMod(dx + dz, 2) == 0 ? RED_WOOL : WHITE_WOOL);
			}
		}
	}

	// ------------------------------------------------------------------ street furniture

	/** Street lamps along the curbs, a few trees and some yellow cabs. */
	private void furniture(int laptopX) {
		int phase = r.range(0, 5);
		for (int z = squareZ - 4 - phase; z >= 0; z -= 6) {
			if (!nearCrossing(z, 1)) {
				lamp(ac - 4, z, 1);
			}
			if (z - 3 >= 0 && !nearCrossing(z - 3, 1)) {
				lamp(ac + 4, z - 3, -1);
			}
		}
		for (int z = r.range(1, 4); z < squareZ - 3; z += r.range(5, 8)) {
			int x = ac + r.sign() * 5;
			if (!nearCrossing(z, 2) && w.get(x, G, z) == AIR && w.get(x, G, z + 1) == AIR && w.get(x, G, z - 1) == AIR) {
				tree(x, z);
			}
		}
		for (int x : new int[]{ac - 5, ac + 5}) {
			if (Math.abs(x - laptopX) > 3 && w.get(x, G, BACK_Z - 2) == AIR) {
				tree(x, BACK_Z - 2);
			}
		}
		int taxis = r.range(1, 3);
		for (int i = 0; i < taxis; i++) {
			int lane = r.nextBoolean() ? ac - 3 : ac + 2;
			int z = r.range(0, squareZ - 6);
			if (!nearCrossing(z, 4) && !nearCrossing(z + 3, 4)) {
				taxi(lane, z, false);
			}
		}
		if (r.chance(0.7)) {
			int x = r.nextBoolean() ? r.range(0, ac - 10) : r.range(ac + 7, 35);
			taxi(x, crossZ + (r.nextBoolean() ? 0 : 3), true);
		}
	}

	private boolean nearCrossing(int z, int margin) {
		return z >= crossZ - 3 - margin && z <= crossZ + 7 + margin;
	}

	private void lamp(int x, int z, int armDx) {
		if (w.get(x, G, z) != AIR) {
			return;
		}
		Build.column(w, x, G, G + 3, z, BLACK_CONCRETE);
		w.set(x + armDx, G + 3, z, GLOWSTONE);
	}

	private void tree(int x, int z) {
		int h = r.range(3, 4);
		Build.column(w, x, G, G + h - 1, z, OAK_LOG);
		Build.blob(w, r, x + 0.5, G + h + 0.3, z + 0.5, 1.9, OAK_LEAVES);
	}

	/** A yellow cab: two blocks wide and four long, with a glass cabin. */
	private void taxi(int x, int z, boolean alongX) {
		int sx = alongX ? 4 : 2;
		int sz = alongX ? 2 : 4;
		for (int dx = 0; dx < sx; dx++) {
			for (int dz = 0; dz < sz; dz++) {
				if (w.get(x + dx, G, z + dz) != AIR) {
					return;
				}
			}
		}
		Build.fill(w, x, G, z, x + sx - 1, G, z + sz - 1, YELLOW_CONCRETE);
		if (alongX) {
			Build.fill(w, x + 1, G + 1, z, x + 2, G + 1, z + 1, GLASS);
		} else {
			Build.fill(w, x, G + 1, z + 1, x + 1, G + 1, z + 2, GLASS);
		}
	}
}
