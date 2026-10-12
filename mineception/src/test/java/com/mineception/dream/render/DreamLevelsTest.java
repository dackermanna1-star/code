package com.mineception.dream.render;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mineception.dream.LaptopData;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import com.mineception.dream.WorldGen;
import org.junit.jupiter.api.Test;

/** The client's copy-on-write dream levels: snapshots never change, and only changed levels get new objects. */
class DreamLevelsTest {
	private static final long SEED = 1234L;

	/** A cell high above the terrain (air in every generated level). */
	private static int airIndex(MiniWorld world) {
		for (int index = MiniWorld.VOLUME - 1; index >= 0; index--) {
			if (world.get(index) == MiniBlock.AIR && world.get(MiniWorld.index(MiniWorld.indexX(index), MiniWorld.indexY(index) - 1,
				MiniWorld.indexZ(index))) == MiniBlock.AIR) {
				return index;
			}
		}
		throw new AssertionError("no air in level " + world.depth);
	}

	private static MiniWorld[] built(DreamLevels levels) {
		MiniWorld[] worlds = new MiniWorld[Theme.DEPTHS];
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			worlds[depth - 1] = levels.world(depth);
		}
		return worlds;
	}

	@Test
	void firstSyncBuildsTheLevelsWithTheLaptopsEdits() {
		LaptopData data = new LaptopData(SEED);
		int index = airIndex(WorldGen.generate(SEED, 2));
		data.putEdit(2, index, MiniBlock.GLASS);
		DreamLevels levels = new DreamLevels();
		assertFalse(levels.built());
		assertTrue(levels.sync(data), "the first sync places the avatars");
		assertTrue(levels.built());
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			assertEquals(depth, levels.world(depth).depth);
			assertEquals(SEED, levels.world(depth).seed);
		}
		assertEquals(MiniBlock.GLASS, levels.world(2).get(index));
	}

	@Test
	void syncKeepsLevelsWhoseBlocksDidNotChange() {
		LaptopData data = new LaptopData(SEED);
		DreamLevels levels = new DreamLevels();
		levels.sync(data);
		MiniWorld[] before = built(levels);
		assertFalse(levels.sync(data));
		MiniWorld[] same = built(levels);
		for (int i = 0; i < Theme.DEPTHS; i++) {
			assertSame(before[i], same[i], "level " + (i + 1) + " rebuilt without a change");
		}
		// Another player's edit in level 3 replaces level 3 only
		int index = airIndex(levels.world(3));
		data.putEdit(3, index, MiniBlock.STONE);
		levels.sync(data);
		MiniWorld[] after = built(levels);
		for (int i = 0; i < Theme.DEPTHS; i++) {
			if (i == 2) {
				assertNotSame(before[i], after[i]);
				assertEquals(MiniBlock.STONE, after[i].get(index));
			} else {
				assertSame(before[i], after[i], "level " + (i + 1) + " rebuilt for an edit in level 3");
			}
		}
	}

	@Test
	void localEditsAreCopyOnWrite() {
		LaptopData data = new LaptopData(SEED);
		DreamLevels levels = new DreamLevels();
		levels.sync(data);
		MiniWorld[] snapshot = levels.snapshot();
		MiniWorld old = levels.world(1);
		int revision = old.revision();
		byte[] blocks = old.rawBlocks().clone();
		int index = airIndex(old);
		levels.editLocally(1, index, MiniBlock.OAK_PLANKS, 100L);
		assertNotSame(old, levels.world(1), "an edit must replace the level, not change it");
		assertEquals(MiniBlock.OAK_PLANKS, levels.world(1).get(index));
		// Whatever a background renderer holds stays exactly as it was
		assertSame(old, snapshot[0]);
		assertEquals(revision, old.revision());
		assertTrue(java.util.Arrays.equals(blocks, old.rawBlocks()));
		for (int depth = 2; depth <= Theme.DEPTHS; depth++) {
			assertSame(snapshot[depth - 1], levels.world(depth));
		}
		assertEquals(1, levels.pendingEdits());
	}

	@Test
	void confirmingALocalEditKeepsTheLevelAndItsLight() {
		LaptopData data = new LaptopData(SEED);
		DreamLevels levels = new DreamLevels();
		levels.sync(data);
		int index = airIndex(levels.world(2));
		levels.editLocally(2, index, MiniBlock.GLOWSTONE, 100L);
		Raycaster raycaster = new Raycaster(new SyntheticTextures());
		MiniWorld[] edited = built(levels);
		LightField[] light = new LightField[Theme.DEPTHS];
		for (int i = 0; i < Theme.DEPTHS; i++) {
			light[i] = raycaster.lightField(edited[i]);
		}
		// The server's copy of the laptop now holds the edit (a new revision): nothing needs rebuilding or relighting
		data.putEdit(2, index, MiniBlock.GLOWSTONE);
		levels.sync(data);
		assertEquals(0, levels.pendingEdits(), "the confirmed edit is no longer pending");
		for (int i = 0; i < Theme.DEPTHS; i++) {
			assertSame(edited[i], levels.world(i + 1));
			assertSame(light[i], raycaster.lightField(levels.world(i + 1)), "level " + (i + 1) + " was relit");
		}
		assertEquals(MiniBlock.GLOWSTONE, levels.world(2).get(index));
	}

	@Test
	void unconfirmedEditsStayUntilTheyExpire() {
		LaptopData data = new LaptopData(SEED);
		DreamLevels levels = new DreamLevels();
		levels.sync(data);
		int index = airIndex(levels.world(4));
		levels.editLocally(4, index, MiniBlock.COBBLESTONE, 40L);
		// Syncing with data that does not have the edit yet keeps showing it
		data.putEdit(1, airIndex(levels.world(1)), MiniBlock.STONE);
		levels.sync(data);
		assertEquals(MiniBlock.COBBLESTONE, levels.world(4).get(index));
		assertFalse(levels.expire(39L));
		assertTrue(levels.expire(40L));
		MiniWorld withEdit = levels.world(4);
		levels.sync(data);
		assertNotSame(withEdit, levels.world(4));
		assertEquals(MiniBlock.AIR, levels.world(4).get(index), "the server never confirmed the edit");
		assertEquals(0, levels.pendingEdits());
	}

	@Test
	void aNewSeedReplacesEverything() {
		DreamLevels levels = new DreamLevels();
		levels.sync(new LaptopData(SEED));
		MiniWorld[] before = built(levels);
		levels.editLocally(1, airIndex(levels.world(1)), MiniBlock.OAK_PLANKS, 100L);
		assertTrue(levels.sync(new LaptopData(SEED + 1)));
		for (int i = 0; i < Theme.DEPTHS; i++) {
			assertNotSame(before[i], levels.world(i + 1));
			assertEquals(SEED + 1, levels.world(i + 1).seed);
		}
		assertEquals(0, levels.pendingEdits());
	}
}
