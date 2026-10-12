package com.mineception.dream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/** The per-laptop edit budget, and dropping stored edits no player could have made. */
class EditBudgetTest {
	@Test
	void theBudgetCoversAllLevelsTogether() {
		LaptopData data = new LaptopData(7L);
		int perLevel = EditBudget.MAX_EDITS / Theme.DEPTHS;
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			for (int i = 0; i < perLevel; i++) {
				assertTrue(EditBudget.record(data, depth, MiniWorld.VOLUME - 1 - i, MiniBlock.STONE));
			}
		}
		assertEquals(EditBudget.MAX_EDITS, EditBudget.total(data));
		// Full: no new cell in any level, although every level is far below its own cap
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			assertTrue(data.editCount(depth) < LaptopData.MAX_EDITS_PER_DEPTH);
			assertFalse(EditBudget.allows(data, depth, 100));
			assertFalse(EditBudget.record(data, depth, 100, MiniBlock.GLASS));
		}
		assertEquals(EditBudget.MAX_EDITS, EditBudget.total(data));
		// An edited cell can still change, any number of times
		assertTrue(EditBudget.record(data, 2, MiniWorld.VOLUME - 1, MiniBlock.AIR));
		assertTrue(EditBudget.record(data, 2, MiniWorld.VOLUME - 1, MiniBlock.GLOWSTONE));
		assertEquals(MiniBlock.GLOWSTONE.id, data.edits(2).get(MiniWorld.VOLUME - 1) & 0xFF);
		assertEquals(EditBudget.MAX_EDITS, EditBudget.total(data));
	}

	@Test
	void outOfRangeEditsAreRefused() {
		LaptopData data = new LaptopData(7L);
		assertFalse(EditBudget.record(data, 0, 5, MiniBlock.STONE));
		assertFalse(EditBudget.record(data, Theme.DEPTHS + 1, 5, MiniBlock.STONE));
		assertFalse(EditBudget.record(data, 1, -1, MiniBlock.STONE));
		assertFalse(EditBudget.record(data, 1, MiniWorld.VOLUME, MiniBlock.STONE));
		assertEquals(0, EditBudget.total(data));
	}

	@Test
	void editsCoveringTheLaptopOrTheFloorAreDropped() {
		for (long seed = 0; seed < 20; seed++) {
			for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
				MiniWorld world = WorldGen.generate(seed, depth);
				int laptop = MiniWorld.index(world.laptopX, world.laptopY, world.laptopZ);
				int above = MiniWorld.index(world.laptopX, world.laptopY + 1, world.laptopZ);
				LaptopData data = new LaptopData(seed);
				data.putEdit(depth, above, MiniBlock.GLASS);
				data.putEdit(depth, laptop, MiniBlock.STONE);
				data.putEdit(depth, MiniWorld.index(3, 0, 3), MiniBlock.AIR);
				int other = depth % Theme.DEPTHS + 1;
				data.putEdit(other, laptop, MiniBlock.BRICKS);

				LaptopData clean = EditRules.withoutProtectedEdits(data, world);
				LaptopData expected = new LaptopData(seed);
				expected.putEdit(depth, above, MiniBlock.GLASS);
				expected.putEdit(other, laptop, MiniBlock.BRICKS);
				assertEquals(expected, clean, "seed " + seed + " depth " + depth);
				MiniWorld built = clean.build(depth);
				assertSame(MiniBlock.LAPTOP, built.get(world.laptopX, world.laptopY, world.laptopZ), "laptop restored");
				// The original is left alone, and clean data comes back as it is
				assertEquals(3, data.editCount(depth));
				assertSame(clean, EditRules.withoutProtectedEdits(clean, world));
			}
		}
	}
}
