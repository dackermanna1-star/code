package com.mineception.dream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import com.mineception.dream.EditRules.Verdict;
import org.junit.jupiter.api.Test;

/** The edit rules shared by the server and the client. */
class EditRulesTest {
	@Test
	void breakingAndPlacingFollowTheBlockRules() {
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			MiniWorld w = WorldGen.generate(99L, depth);
			int sx = (int) Math.floor(w.spawnX);
			int sy = (int) Math.floor(w.spawnY);
			int sz = (int) Math.floor(w.spawnZ);
			// The floor under the spawn can be broken; the air above the head can take a block
			assertSame(Verdict.OK, EditRules.check(w, sx, sy - 1, sz, MiniBlock.AIR), "break the floor");
			assertSame(Verdict.OK, EditRules.check(w, sx, sy + 1, sz, MiniBlock.GLOWSTONE), "place in the air");
			assertSame(Verdict.NOT_BREAKABLE, EditRules.check(w, sx, sy + 1, sz, MiniBlock.AIR), "break air");
			assertSame(Verdict.OCCUPIED, EditRules.check(w, sx, sy - 1, sz, MiniBlock.STONE), "place into the floor");
			assertSame(Verdict.PROTECTED_CELL, EditRules.check(w, w.laptopX, w.laptopY, w.laptopZ, MiniBlock.AIR), "laptop");
			assertSame(Verdict.PROTECTED_CELL, EditRules.check(w, sx, 0, sz, MiniBlock.AIR), "bedrock floor");
			assertSame(Verdict.NOT_PLACEABLE, EditRules.check(w, sx, sy + 1, sz, MiniBlock.BEDROCK), "bedrock is not in the hotbar");
			assertSame(Verdict.NOT_PLACEABLE, EditRules.check(w, sx, sy + 1, sz, MiniBlock.LAPTOP), "nor is a laptop");
			assertSame(Verdict.OUT_OF_BOUNDS, EditRules.check(w, -1, 5, 5, MiniBlock.STONE), "outside");
			assertSame(Verdict.OUT_OF_BOUNDS, EditRules.check(w, MiniWorld.VOLUME, MiniBlock.STONE), "index past the end");
			assertSame(Verdict.OUT_OF_BOUNDS, EditRules.check(w, -1, MiniBlock.STONE), "negative index");
		}
	}

	@Test
	void waterCanBeBuiltIntoButNotBroken() {
		MiniWorld limbo = WorldGen.generate(3L, 4);
		for (int i = 0; i < MiniWorld.VOLUME; i++) {
			if (limbo.get(i) == MiniBlock.WATER) {
				assertSame(Verdict.NOT_BREAKABLE, EditRules.check(limbo, i, MiniBlock.AIR));
				assertSame(Verdict.OK, EditRules.check(limbo, i, MiniBlock.COBBLESTONE));
				return;
			}
		}
		throw new AssertionError("no water");
	}

	@Test
	void everyHotbarBlockIsPlaceable() {
		MiniWorld w = WorldGen.generate(1L, 1);
		int sx = (int) Math.floor(w.spawnX);
		int sy = (int) Math.floor(w.spawnY);
		int sz = (int) Math.floor(w.spawnZ);
		for (MiniBlock block : MiniBlock.HOTBAR) {
			assertEquals(Verdict.OK, EditRules.check(w, sx, sy + 1, sz, block), block.name());
		}
	}
}
