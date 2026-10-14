package net.abyssaldescent.dungeon.loot;

/** Loot sources, each with its own rarity weights and roll counts. */
public enum LootTier {
	/** Reward for clearing a normal combat room. */
	CHEST(1, 2),
	/** Treasure room reliquaries. */
	TREASURE(2, 3),
	/** Hidden rooms: fewer items, better odds. */
	SECRET(2, 2),
	/** Elite rooms and shrine trials. */
	ELITE(2, 3),
	/** Boss rewards. */
	BOSS(3, 4);

	private final int minGear;
	private final int maxGear;

	LootTier(int minGear, int maxGear) {
		this.minGear = minGear;
		this.maxGear = maxGear;
	}

	public int minGear() {
		return minGear;
	}

	public int maxGear() {
		return maxGear;
	}

	public static LootTier byId(int id) {
		LootTier[] values = values();
		return values[Math.max(0, Math.min(values.length - 1, id))];
	}
}
