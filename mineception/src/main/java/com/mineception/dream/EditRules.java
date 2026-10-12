package com.mineception.dream;

import java.util.Map;

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
		if (isProtected(world, x, y, z)) {
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

	/** Whether cell (x, y, z) of {@code world} can never be changed: the bedrock floor or the laptop's cell. */
	public static boolean isProtected(MiniWorld world, int x, int y, int z) {
		return y == 0 || x == world.laptopX && y == world.laptopY && z == world.laptopZ;
	}

	/**
	 * {@code data} without the edits of {@code world}'s level that touch a protected cell, or {@code data} itself when
	 * it has none. No player can make such an edit, but a crafted item component can carry one; covering a level's
	 * laptop would make diving deeper impossible and, the cell being protected, could never be repaired.
	 *
	 * @param world the level of {@code data} at {@code world.depth}, generated or built (only its laptop cell is read)
	 */
	public static LaptopData withoutProtectedEdits(LaptopData data, MiniWorld world) {
		boolean clean = true;
		for (int index : data.edits(world.depth).keySet()) {
			if (isProtected(world, MiniWorld.indexX(index), MiniWorld.indexY(index), MiniWorld.indexZ(index))) {
				clean = false;
				break;
			}
		}
		if (clean) {
			return data;
		}
		LaptopData result = new LaptopData(data.seed());
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			for (Map.Entry<Integer, Byte> edit : data.edits(depth).entrySet()) {
				int index = edit.getKey();
				if (depth != world.depth
					|| !isProtected(world, MiniWorld.indexX(index), MiniWorld.indexY(index), MiniWorld.indexZ(index))) {
					result.putEdit(depth, index, MiniBlock.byId(edit.getValue() & 0xFF));
				}
			}
		}
		return result;
	}
}
