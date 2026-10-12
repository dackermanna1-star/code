package com.mineception.dream;

/**
 * The rules for changing a block inside a dream level, shared by the server (which enforces them) and the client
 * (which checks them before predicting an edit locally), so both always agree.
 *
 * <p>A player may break any breakable block, or place a hotbar block into air or water. The laptop's cell and the
 * bedrock floor (y = 0) can never be changed.
 */
public final class EditRules {
	/** Outcome of checking an edit. */
	public enum Verdict {
		OK,
		/** The cell is outside the level. */
		OUT_OF_BOUNDS,
		/** Not air (breaking) and not a block players may place. */
		NOT_PLACEABLE,
		/** The laptop's cell or the bedrock floor. */
		PROTECTED_CELL,
		/** Breaking something that cannot be broken (air, water, bedrock, the laptop). */
		NOT_BREAKABLE,
		/** Placing into a cell that already holds a block. */
		OCCUPIED;

		public boolean ok() {
			return this == OK;
		}
	}

	private EditRules() {
	}

	/** Checks turning cell (x, y, z) of {@code world} (as it currently is, edits included) into {@code block}. */
	public static Verdict check(MiniWorld world, int x, int y, int z, MiniBlock block) {
		if (!MiniWorld.inBounds(x, y, z)) {
			return Verdict.OUT_OF_BOUNDS;
		}
		if (block != MiniBlock.AIR && !block.placeable()) {
			return Verdict.NOT_PLACEABLE;
		}
		if (y == 0 || x == world.laptopX && y == world.laptopY && z == world.laptopZ) {
			return Verdict.PROTECTED_CELL;
		}
		MiniBlock current = world.get(x, y, z);
		if (block == MiniBlock.AIR) {
			return current.breakable() ? Verdict.OK : Verdict.NOT_BREAKABLE;
		}
		return current == MiniBlock.AIR || current == MiniBlock.WATER ? Verdict.OK : Verdict.OCCUPIED;
	}

	/** {@link #check(MiniWorld, int, int, int, MiniBlock)} for a cell index. */
	public static Verdict check(MiniWorld world, int index, MiniBlock block) {
		if (index < 0 || index >= MiniWorld.VOLUME) {
			return Verdict.OUT_OF_BOUNDS;
		}
		return check(world, MiniWorld.indexX(index), MiniWorld.indexY(index), MiniWorld.indexZ(index), block);
	}
}
