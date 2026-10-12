package com.mineception.dream;

/**
 * How many changed blocks one laptop may remember across all its dream levels, and recording edits within that budget.
 *
 * <p>A laptop's data travels whole in chunk packets, item stacks (inventories, shulker boxes, creative slots) and save
 * files, so it must stay small no matter what a player does: {@value #MAX_EDITS} edits are at most about 40 KB saved and
 * 33 KB on the network, under a vanilla written book. {@link LaptopData#MAX_EDITS_PER_DEPTH} alone would allow eight
 * times that. The server, the decoders and the client all record edits through {@link #record}, so they agree on which
 * edits a full laptop refuses.
 */
public final class EditBudget {
	/** Edits one laptop may hold in all four levels together (an edited cell counts once, however often it changes). */
	public static final int MAX_EDITS = 8192;

	private EditBudget() {
	}

	/** Number of edited cells in all levels of {@code data}. */
	public static int total(LaptopData data) {
		int total = 0;
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			total += data.editCount(depth);
		}
		return total;
	}

	/**
	 * Whether {@code data} has room to record an edit of cell {@code index} at {@code depth}: re-editing a cell is always
	 * possible, a new cell needs room in both the laptop's budget and the level's own cap.
	 */
	public static boolean allows(LaptopData data, int depth, int index) {
		if (depth < 1 || depth > Theme.DEPTHS || index < 0 || index >= MiniWorld.VOLUME) {
			return false;
		}
		if (data.edits(depth).containsKey(index)) {
			return true;
		}
		return data.editCount(depth) < LaptopData.MAX_EDITS_PER_DEPTH && total(data) < MAX_EDITS;
	}

	/** {@link LaptopData#putEdit} within the budget; false (nothing changed) when the laptop is full or out of range. */
	public static boolean record(LaptopData data, int depth, int index, MiniBlock block) {
		return allows(data, depth, index) && data.putEdit(depth, index, block);
	}
}
