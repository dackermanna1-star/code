package com.mineception.dream.render;

import com.mineception.dream.Face;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;

/**
 * Hand-built levels that exercise every kind of block the raycaster draws (until the themed generators land, the
 * real WorldGen is a flat placeholder): a stone-brick house with glass windows and a glowstone lamp, oak and spruce
 * trees, a pond with an ice floe, a street lamp, a palette wall of every block, and the laptop on a desk.
 */
final class TestWorlds {
	static final int GROUND = 4;

	private TestWorlds() {
	}

	static MiniWorld showcase(int depth) {
		MiniWorld w = new MiniWorld(depth, 1234L + depth);
		fill(w, 0, 0, 0, 39, 0, 39, MiniBlock.BEDROCK);
		fill(w, 0, 1, 0, 39, 2, 39, MiniBlock.STONE);
		fill(w, 0, 3, 0, 39, 3, 39, MiniBlock.DIRT);
		fill(w, 0, GROUND, 0, 39, GROUND, 39, MiniBlock.GRASS);
		if (Theme.forDepth(depth) == Theme.FORTRESS) {
			fill(w, 0, GROUND, 0, 39, GROUND, 39, MiniBlock.SNOW_BLOCK);
			fill(w, 14, GROUND, 20, 26, GROUND, 26, MiniBlock.GRASS);
		}

		// A stone-brick house north of the desk: glass windows, a door, plank roof, glowstone lamp inside
		fill(w, 13, 5, 6, 27, 9, 13, MiniBlock.STONE_BRICKS);
		fill(w, 14, 5, 7, 26, 9, 12, MiniBlock.AIR);
		fill(w, 13, 5, 6, 13, 9, 6, MiniBlock.BRICKS);
		fill(w, 27, 5, 6, 27, 9, 6, MiniBlock.BRICKS);
		fill(w, 13, 5, 13, 13, 9, 13, MiniBlock.BRICKS);
		fill(w, 27, 5, 13, 27, 9, 13, MiniBlock.BRICKS);
		fill(w, 15, 6, 13, 17, 7, 13, MiniBlock.GLASS);
		fill(w, 23, 6, 13, 25, 7, 13, MiniBlock.GLASS);
		fill(w, 20, 5, 13, 20, 6, 13, MiniBlock.AIR);
		fill(w, 14, 7, 6, 15, 8, 6, MiniBlock.MOSSY_STONE_BRICKS);
		fill(w, 25, 5, 6, 26, 5, 6, MiniBlock.CRACKED_STONE_BRICKS);
		fill(w, 12, 10, 5, 28, 10, 14, MiniBlock.OAK_PLANKS);
		fill(w, 13, 11, 6, 27, 11, 13, MiniBlock.DARK_OAK_PLANKS);
		w.set(20, 9, 10, MiniBlock.GLOWSTONE);
		fill(w, 14, 5, 7, 16, 7, 7, MiniBlock.BOOKSHELF);
		w.set(24, 5, 8, MiniBlock.CRAFTING_TABLE);

		// The desk with the laptop, a bookshelf and a crafting table beside it
		w.set(20, 5, 18, MiniBlock.DARK_OAK_PLANKS);
		w.set(20, 6, 18, MiniBlock.LAPTOP);
		w.laptopX = 20;
		w.laptopY = 6;
		w.laptopZ = 18;
		w.laptopFacing = Face.SOUTH;
		w.set(18, 5, 18, MiniBlock.BOOKSHELF);
		w.set(18, 6, 18, MiniBlock.BOOKSHELF);
		w.set(22, 5, 18, MiniBlock.CRAFTING_TABLE);
		w.set(17, 5, 17, MiniBlock.OAK_LOG);

		// A pond with sand banks and an ice floe
		fill(w, 6, GROUND, 15, 12, GROUND, 23, MiniBlock.SAND);
		fill(w, 7, GROUND - 1, 16, 11, GROUND, 22, MiniBlock.WATER);
		fill(w, 7, GROUND - 2, 16, 11, GROUND - 2, 22, MiniBlock.SAND);
		fill(w, 8, GROUND, 18, 9, GROUND, 19, MiniBlock.ICE);
		w.set(11, GROUND, 16, MiniBlock.PRISMARINE);

		// Trees
		tree(w, 29, 5, 20, MiniBlock.OAK_LOG, MiniBlock.OAK_LEAVES, 4);
		tree(w, 32, 5, 12, MiniBlock.SPRUCE_LOG, MiniBlock.SPRUCE_LEAVES, 6);
		tree(w, 9, 5, 9, MiniBlock.OAK_LOG, MiniBlock.OAK_LEAVES, 5);

		// Street lamp and a sea lantern
		fill(w, 25, 5, 22, 25, 7, 22, MiniBlock.COBBLESTONE);
		w.set(25, 8, 22, MiniBlock.GLOWSTONE);
		w.set(14, 5, 25, MiniBlock.SEA_LANTERN);

		// Palette wall: every block, two high, south of the spawn (seen when turning around)
		MiniBlock[] palette = {MiniBlock.STONE, MiniBlock.COBBLESTONE, MiniBlock.OAK_PLANKS, MiniBlock.OAK_LOG, MiniBlock.SAND,
			MiniBlock.SANDSTONE, MiniBlock.BRICKS, MiniBlock.STONE_BRICKS, MiniBlock.SMOOTH_STONE, MiniBlock.GRAY_CONCRETE,
			MiniBlock.LIGHT_GRAY_CONCRETE, MiniBlock.QUARTZ_BLOCK, MiniBlock.RED_WOOL, MiniBlock.WHITE_WOOL, MiniBlock.TERRACOTTA,
			MiniBlock.DARK_OAK_PLANKS, MiniBlock.SPRUCE_LOG, MiniBlock.SNOW_BLOCK, MiniBlock.PACKED_ICE, MiniBlock.BOOKSHELF,
			MiniBlock.POLISHED_ANDESITE, MiniBlock.BLACK_CONCRETE, MiniBlock.YELLOW_CONCRETE, MiniBlock.CRAFTING_TABLE,
			MiniBlock.DEEPSLATE_TILES, MiniBlock.PRISMARINE, MiniBlock.GLOWSTONE, MiniBlock.SEA_LANTERN, MiniBlock.DIRT,
			MiniBlock.GRASS, MiniBlock.BEDROCK, MiniBlock.MOSSY_STONE_BRICKS, MiniBlock.CRACKED_STONE_BRICKS};
		for (int i = 0; i < palette.length; i++) {
			w.set(4 + i, 5, 30, palette[i]);
			w.set(4 + i, 6, 30, palette[i]);
		}

		w.spawnX = 20.5;
		w.spawnY = 5.0;
		w.spawnZ = 22.5;
		float[] look = DreamCameras.lookAt(w.spawnX, w.spawnY + 1.62, w.spawnZ, 20.5, 6.36, 18.25);
		w.spawnYaw = look[0];
		w.spawnPitch = look[1];
		return w;
	}

	static void fill(MiniWorld w, int x0, int y0, int z0, int x1, int y1, int z1, MiniBlock block) {
		for (int x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
			for (int y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
				for (int z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
					w.set(x, y, z, block);
				}
			}
		}
	}

	static void tree(MiniWorld w, int x, int y, int z, MiniBlock log, MiniBlock leaves, int height) {
		int top = y + height;
		for (int ly = top - 2; ly <= top + 1; ly++) {
			int radius = ly >= top ? 1 : 2;
			for (int dx = -radius; dx <= radius; dx++) {
				for (int dz = -radius; dz <= radius; dz++) {
					boolean corner = Math.abs(dx) == radius && Math.abs(dz) == radius;
					if (corner && (radius == 1 || ((x * 31 + dx * 7 + dz * 13 + ly) & 1) == 0)) {
						continue;
					}
					if (w.get(x + dx, ly, z + dz).isAir()) {
						w.set(x + dx, ly, z + dz, leaves);
					}
				}
			}
		}
		for (int ly = y; ly < top; ly++) {
			w.set(x, ly, z, log);
		}
	}
}
