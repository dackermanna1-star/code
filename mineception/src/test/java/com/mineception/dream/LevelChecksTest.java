package com.mineception.dream;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/** The geometry checks the generator tests (and the generator itself) rely on. */
class LevelChecksTest {
	/** A small level: stone floor (top at y = 4), a desk with the laptop at (10, 5..6, 10) facing south, spawn 3 south. */
	private static MiniWorld stage() {
		MiniWorld w = new MiniWorld(1, 0L);
		Build.fill(w, 0, 0, 0, 39, 3, 39, MiniBlock.STONE);
		w.set(10, 4, 10, MiniBlock.OAK_PLANKS);
		w.set(10, 5, 10, MiniBlock.LAPTOP);
		w.laptopX = 10;
		w.laptopY = 5;
		w.laptopZ = 10;
		w.laptopFacing = Face.SOUTH;
		w.spawnX = 10.5;
		w.spawnY = 4.0;
		w.spawnZ = 13.5;
		return w;
	}

	@Test
	void screenCentreIsOnTheLidFacingTheSpawn() {
		MiniWorld w = stage();
		double[] c = LevelChecks.screenCenter(w);
		assertArrayEquals(new double[]{10.5, 5.0 + (LaptopGeometry.SCREEN_MIN_Y + LaptopGeometry.SCREEN_MAX_Y) / 2.0,
			10.0 + LaptopGeometry.SCREEN_Z}, c, 1e-12);
		w.laptopFacing = Face.EAST;
		double[] east = LevelChecks.screenCenter(w);
		// The lid stands at the back of the cell, so an east-facing screen is west of the cell centre
		assertTrue(east[0] < 10.5, "screen x " + east[0]);
	}

	@Test
	void lineOfSightIsBlockedByAnythingButAir() {
		MiniWorld w = stage();
		assertTrue(LevelChecks.spawnSeesScreen(w));
		for (MiniBlock blocker : new MiniBlock[]{MiniBlock.STONE, MiniBlock.GLASS, MiniBlock.WATER, MiniBlock.OAK_LEAVES}) {
			MiniWorld blocked = stage();
			blocked.set(10, 5, 12, blocker);
			assertFalse(LevelChecks.spawnSeesScreen(blocked), blocker + " should block the view");
		}
		// Blocks beside or behind the line do not matter
		MiniWorld beside = stage();
		beside.set(9, 5, 12, MiniBlock.STONE);
		beside.set(11, 5, 12, MiniBlock.STONE);
		beside.set(10, 7, 12, MiniBlock.STONE);
		beside.set(10, 5, 9, MiniBlock.STONE);
		assertTrue(LevelChecks.spawnSeesScreen(beside));
	}

	@Test
	void lineOfSightCatchesCellsThatOnlyClipACorner() {
		MiniWorld w = new MiniWorld(1, 0L);
		w.laptopX = -10;
		double[] from = {0.5, 0.5, 0.5};
		double[] to = {3.5, 0.5, 3.5};
		assertTrue(LevelChecks.clearLineOfSight(w, from, to));
		// A diagonal line through (1.999, 2.001)-ish passes the corner cell only by a sliver
		double[] a = {0.5, 0.5, 0.5};
		double[] b = {3.5, 0.5, 3.6};
		w.set(1, 0, 2, MiniBlock.STONE);
		assertTrue(LevelChecks.clearLineOfSight(w, a, b) == !passesThrough(a, b, 1, 2),
			"exact traversal must agree with the geometry");
		w.set(2, 0, 2, MiniBlock.STONE);
		assertFalse(LevelChecks.clearLineOfSight(w, from, to), "cell on the diagonal");
	}

	/** Brute force: does the segment enter the given cell (in the y = 0 layer)? */
	private static boolean passesThrough(double[] a, double[] b, int cx, int cz) {
		for (int i = 0; i <= 100000; i++) {
			double t = i / 100000.0;
			double x = a[0] + (b[0] - a[0]) * t;
			double z = a[2] + (b[2] - a[2]) * t;
			if (x >= cx && x < cx + 1 && z >= cz && z < cz + 1) {
				return true;
			}
		}
		return false;
	}

	@Test
	void walkingPathNeedsFloorAndHeadroom() {
		MiniWorld w = stage();
		assertTrue(LevelChecks.canWalkToLaptop(w));
		// A trench too wide to jump is still fine (you can drop in and climb out where it is one deep)...
		MiniWorld ditch = stage();
		Build.fill(ditch, 0, 3, 12, 39, 3, 12, MiniBlock.AIR);
		assertTrue(LevelChecks.canWalkToLaptop(ditch));
		// ...but a two-block wall across the whole level is not
		MiniWorld wall = stage();
		Build.fill(wall, 0, 4, 12, 39, 5, 12, MiniBlock.STONE);
		assertFalse(LevelChecks.canWalkToLaptop(wall));
		// A one-block step can be jumped
		MiniWorld step = stage();
		Build.fill(step, 0, 4, 11, 39, 4, 11, MiniBlock.STONE);
		assertTrue(LevelChecks.canWalkToLaptop(step));
		// A spawn buried in blocks is not a valid start
		MiniWorld buried = stage();
		buried.set(10, 5, 13, MiniBlock.STONE);
		assertFalse(LevelChecks.canWalkToLaptop(buried));
	}

	@Test
	void enclosureIsDetected() {
		MiniWorld open = stage();
		assertFalse(LevelChecks.enclosed(open));
		MiniWorld box = stage();
		Build.fill(box, 0, 0, 0, 39, 31, 39, MiniBlock.STONE);
		Build.fill(box, 1, 4, 1, 38, 30, 38, MiniBlock.AIR);
		box.set(10, 4, 10, MiniBlock.OAK_PLANKS);
		box.set(10, 5, 10, MiniBlock.LAPTOP);
		assertTrue(LevelChecks.enclosed(box));
		// Glass is solid, so a window does not break the seal; a hole does
		box.set(0, 6, 20, MiniBlock.GLASS);
		assertTrue(LevelChecks.enclosed(box));
		box.set(39, 6, 20, MiniBlock.AIR);
		assertFalse(LevelChecks.enclosed(box));
	}
}
