package com.mineception.dream;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import java.util.EnumMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;

/** Invariants every generated dream level must satisfy, checked over many seeds. */
class WorldGenTest {
	private static final int SEEDS = 250;
	private static final Set<MiniBlock> DESKS = Set.of(MiniBlock.OAK_PLANKS, MiniBlock.DARK_OAK_PLANKS, MiniBlock.CRAFTING_TABLE,
		MiniBlock.SPRUCE_LOG);

	static long seed(int i) {
		return DreamRandom.mix(i * 0x9E3779B97F4A7C15L + 12345L) ^ (i % 3 == 0 ? -i : i);
	}

	@ParameterizedTest
	@ValueSource(ints = {1, 2, 3, 4})
	void levelsAreDeterministic(int depth) {
		for (int i = 0; i < 20; i++) {
			MiniWorld a = WorldGen.generate(seed(i), depth);
			MiniWorld b = WorldGen.generate(seed(i), depth);
			assertArrayEquals(a.rawBlocks(), b.rawBlocks(), "blocks differ for seed " + seed(i));
			assertEquals(a.laptopX, b.laptopX);
			assertEquals(a.laptopY, b.laptopY);
			assertEquals(a.laptopZ, b.laptopZ);
			assertSame(a.laptopFacing, b.laptopFacing);
			assertEquals(a.spawnX, b.spawnX);
			assertEquals(a.spawnY, b.spawnY);
			assertEquals(a.spawnZ, b.spawnZ);
			assertEquals(a.spawnYaw, b.spawnYaw);
			assertEquals(a.spawnPitch, b.spawnPitch);
			assertEquals(depth, a.depth);
			assertSame(Theme.forDepth(depth), a.theme);
		}
	}

	@ParameterizedTest
	@ValueSource(ints = {1, 2, 3, 4})
	void seedsGiveDifferentLayouts(int depth) {
		Set<Integer> layouts = new HashSet<>();
		for (int i = 0; i < 30; i++) {
			layouts.add(java.util.Arrays.hashCode(WorldGen.generate(seed(i), depth).rawBlocks()));
		}
		assertTrue(layouts.size() >= 28, "only " + layouts.size() + " distinct layouts in 30 seeds");
	}

	@ParameterizedTest
	@ValueSource(ints = {1, 2, 3, 4})
	void everyLevelSatisfiesTheInvariants(int depth) {
		for (int i = 0; i < SEEDS; i++) {
			long seed = seed(i);
			MiniWorld w = WorldGen.generate(seed, depth);
			String where = "depth " + depth + " seed " + seed;
			bedrockFloor(w, where);
			singleLaptopOnDesk(w, where);
			spawnStandsInFrontOfLaptop(w, where);
			spawnLooksAtScreen(w, where);
			assertTrue(LevelChecks.spawnSeesScreen(w), where + ": line of sight to the screen is blocked");
			assertTrue(LevelChecks.canWalkToLaptop(w), where + ": laptop cannot be reached on foot");
			assertEquals(depth == 2, LevelChecks.enclosed(w), where + ": enclosure");
		}
	}

	private static void bedrockFloor(MiniWorld w, String where) {
		for (int x = 0; x < MiniWorld.SX; x++) {
			for (int z = 0; z < MiniWorld.SZ; z++) {
				if (w.get(x, 0, z) != MiniBlock.BEDROCK) {
					fail(where + ": no bedrock at " + x + ",0," + z);
				}
			}
		}
	}

	private static void singleLaptopOnDesk(MiniWorld w, String where) {
		int laptops = 0;
		for (int i = 0; i < MiniWorld.VOLUME; i++) {
			if (w.get(i) == MiniBlock.LAPTOP) {
				laptops++;
				assertEquals(MiniWorld.index(w.laptopX, w.laptopY, w.laptopZ), i, where + ": laptop cell");
			}
		}
		assertEquals(1, laptops, where + ": laptop count");
		assertTrue(w.hasLaptopAt(w.laptopX, w.laptopY, w.laptopZ), where);
		assertTrue(w.laptopFacing.horizontal(), where);
		MiniBlock desk = w.get(w.laptopX, w.laptopY - 1, w.laptopZ);
		assertTrue(DESKS.contains(desk), where + ": laptop stands on " + desk);
		assertTrue(w.get(w.laptopX, w.laptopY - 2, w.laptopZ).solid(), where + ": desk is not on the ground");
	}

	private static void spawnStandsInFrontOfLaptop(MiniWorld w, String where) {
		int fx = (int) Math.floor(w.spawnX);
		int fy = (int) Math.floor(w.spawnY);
		int fz = (int) Math.floor(w.spawnZ);
		assertEquals(fy, w.spawnY, 1e-9, where + ": feet exactly on the floor");
		assertTrue(w.get(fx, fy - 1, fz).solid(), where + ": spawn floor");
		assertFalse(w.get(fx, fy, fz).solid(), where + ": spawn feet cell");
		assertFalse(w.get(fx, fy + 1, fz).solid(), where + ": spawn head cell");
		// Spawn sits on the line out of the screen, 3..5 blocks from the laptop
		double cx = w.laptopX + 0.5;
		double cz = w.laptopZ + 0.5;
		double along = (w.spawnX - cx) * w.laptopFacing.dx + (w.spawnZ - cz) * w.laptopFacing.dz;
		double across = (w.spawnX - cx) * w.laptopFacing.dz - (w.spawnZ - cz) * w.laptopFacing.dx;
		assertTrue(along >= 3.0 && along <= 5.0, where + ": spawn distance " + along);
		assertEquals(0.0, across, 1e-9, where + ": spawn off the screen axis");
		assertEquals(w.laptopY - 1, fy, where + ": spawn and desk on the same level");
		// A fresh avatar's box at the spawn must not overlap anything solid
		MiniPlayer player = new MiniPlayer();
		player.reset(w);
		assertFalse(player.collides(w, player.x, player.y, player.z), where + ": spawn box overlaps blocks");
	}

	private static void spawnLooksAtScreen(MiniWorld w, String where) {
		double[] eye = LevelChecks.spawnEye(w);
		double[] target = LevelChecks.screenCenter(w);
		double[] f = new com.mineception.dream.render.Camera(eye[0], eye[1], eye[2], w.spawnYaw, w.spawnPitch, 70.0F).forward();
		double dx = target[0] - eye[0];
		double dy = target[1] - eye[1];
		double dz = target[2] - eye[2];
		double len = Math.sqrt(dx * dx + dy * dy + dz * dz);
		double dot = (f[0] * dx + f[1] * dy + f[2] * dz) / len;
		assertTrue(dot > Math.cos(Math.toRadians(0.5)), where + ": spawn view misses the screen centre");
		assertTrue(w.spawnPitch > 0.0F && w.spawnPitch < 10.0F, where + ": pitch " + w.spawnPitch);
		assertTrue(w.spawnYaw >= 0.0F && w.spawnYaw < 360.0F, where + ": yaw " + w.spawnYaw);
	}

	@Test
	void limboLooksWestIntoTheSunset() {
		for (int i = 0; i < 20; i++) {
			MiniWorld w = WorldGen.generate(seed(i), 4);
			assertSame(Face.EAST, w.laptopFacing, "screen faces the viewer, who looks west");
			assertEquals(90.0F, w.spawnYaw, 1e-3F);
		}
	}

	@Test
	void themesUseTheirOwnPalette() {
		assertTrue(count(WorldGen.generate(seed(1), 1)).getOrDefault(MiniBlock.GLASS, 0) > 100, "city windows");
		assertTrue(count(WorldGen.generate(seed(1), 2)).getOrDefault(MiniBlock.RED_WOOL, 0) > 100, "hotel carpet");
		Map<MiniBlock, Integer> fortress = count(WorldGen.generate(seed(1), 3));
		assertTrue(fortress.getOrDefault(MiniBlock.SNOW_BLOCK, 0) > 500, "snow");
		assertTrue(fortress.getOrDefault(MiniBlock.ICE, 0) > 40, "frozen lake");
		assertTrue(fortress.getOrDefault(MiniBlock.SPRUCE_LOG, 0) > 30, "spruce forest");
		Map<MiniBlock, Integer> limbo = count(WorldGen.generate(seed(1), 4));
		assertTrue(limbo.getOrDefault(MiniBlock.WATER, 0) > 1000, "sea");
		assertTrue(limbo.getOrDefault(MiniBlock.SAND, 0) > 500, "beach");
		assertTrue(limbo.getOrDefault(MiniBlock.CRACKED_STONE_BRICKS, 0) > 20, "ruins");
	}

	@Test
	void theCityFoldsUpIntoTheSkyInMostDreams() {
		int folded = 0;
		for (int i = 0; i < 100; i++) {
			MiniWorld w = WorldGen.generate(seed(i), 1);
			// Asphalt (or its centre line) high above the street can only be the far avenue bent upward
			boolean vertical = false;
			for (int idx = 0; idx < MiniWorld.VOLUME && !vertical; idx++) {
				MiniBlock b = w.get(idx);
				vertical = (b == MiniBlock.GRAY_CONCRETE || b == MiniBlock.YELLOW_CONCRETE) && MiniWorld.indexY(idx) >= 16
					&& isStreet(w, idx);
			}
			if (vertical) {
				folded++;
			}
		}
		assertTrue(folded >= 40 && folded <= 80, folded + " of 100 cities folded");
	}

	/** A street block stands in a run of street blocks, unlike a dark building facade cell. */
	private static boolean isStreet(MiniWorld w, int idx) {
		int x = MiniWorld.indexX(idx);
		int y = MiniWorld.indexY(idx);
		int z = MiniWorld.indexZ(idx);
		int run = 0;
		for (int dx = -3; dx <= 3; dx++) {
			MiniBlock b = w.get(x + dx, y, z);
			if (b == MiniBlock.GRAY_CONCRETE || b == MiniBlock.YELLOW_CONCRETE || b == MiniBlock.WATER || b == MiniBlock.QUARTZ_BLOCK) {
				run++;
			}
		}
		return run >= 6;
	}

	@Test
	void limboHasADrownedCity() {
		for (int i = 0; i < 50; i++) {
			MiniWorld w = WorldGen.generate(seed(i), 4);
			int high = 0;
			for (int idx = 0; idx < MiniWorld.VOLUME; idx++) {
				MiniBlock b = w.get(idx);
				boolean ruin = b == MiniBlock.STONE_BRICKS || b == MiniBlock.CRACKED_STONE_BRICKS || b == MiniBlock.MOSSY_STONE_BRICKS;
				if (ruin && MiniWorld.indexY(idx) >= 16) {
					high++;
				}
			}
			assertTrue(high >= 15, "ruined towers too low for seed " + seed(i) + ": " + high);
		}
	}

	@Test
	void fortressLakeIsIceOverWater() {
		for (int i = 0; i < 50; i++) {
			MiniWorld w = WorldGen.generate(seed(i), 3);
			int ice = 0;
			for (int idx = 0; idx < MiniWorld.VOLUME; idx++) {
				if (w.get(idx) == MiniBlock.ICE) {
					ice++;
					int x = MiniWorld.indexX(idx);
					int y = MiniWorld.indexY(idx);
					int z = MiniWorld.indexZ(idx);
					MiniBlock below = w.get(x, y - 1, z);
					assertTrue(below == MiniBlock.WATER || below.solid(), "ice over " + below);
				}
			}
			assertTrue(ice > 40, "lake too small for seed " + seed(i));
		}
	}

	@Test
	void invalidDepthIsRejected() {
		assertThrows(IllegalArgumentException.class, () -> WorldGen.generate(1L, 0));
		assertThrows(IllegalArgumentException.class, () -> WorldGen.generate(1L, 5));
	}

	@Test
	void generationIsFast() {
		WorldGen.generate(1L, 1);
		long start = System.nanoTime();
		for (int depth = 1; depth <= 4; depth++) {
			for (int i = 0; i < 10; i++) {
				assertNotNull(WorldGen.generate(seed(i), depth));
			}
		}
		double perLevelMs = (System.nanoTime() - start) / 1e6 / 40.0;
		assertTrue(perLevelMs < 25.0, "generation took " + perLevelMs + " ms per level");
	}

	private static Map<MiniBlock, Integer> count(MiniWorld w) {
		Map<MiniBlock, Integer> counts = new EnumMap<>(MiniBlock.class);
		for (int i = 0; i < MiniWorld.VOLUME; i++) {
			counts.merge(w.get(i), 1, Integer::sum);
		}
		return counts;
	}
}
