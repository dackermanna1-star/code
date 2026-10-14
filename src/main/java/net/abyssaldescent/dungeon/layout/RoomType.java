package net.abyssaldescent.dungeon.layout;

public enum RoomType {
	START(false),
	COMBAT(true),
	ELITE(true),
	TREASURE(false),
	MERCHANT(false),
	SHRINE(false),
	SECRET(false),
	PASSAGE(false),
	EXIT(false),
	ANTECHAMBER(false),
	BOSS_ARENA(false);

	private final boolean encounter;

	RoomType(boolean encounter) {
		this.encounter = encounter;
	}

	/** Rooms that seal and spawn waves when first entered. */
	public boolean isEncounter() {
		return encounter;
	}

	public boolean countsForProgress() {
		return encounter || this == BOSS_ARENA;
	}
}
