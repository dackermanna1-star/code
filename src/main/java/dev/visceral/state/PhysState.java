package dev.visceral.state;

/** Server-authoritative physical state of a living entity. */
public enum PhysState {
	/** Normal control. */
	STANDING,
	/** Off balance and stumbling: no voluntary movement or attacks, stepping to catch balance. */
	STAGGERED,
	/** Lost balance and going down; the client simulates a full ragdoll. */
	FALLING,
	/** On the ground, struggling. Low hitbox. */
	DOWNED,
	/** Getting back up (may fail and collapse back to DOWNED). */
	RECOVERING,
	/** Too injured to stand: drags itself towards its target. */
	CRAWLING;

	private static final PhysState[] VALUES = values();

	public static PhysState byId(int id) {
		return id >= 0 && id < VALUES.length ? VALUES[id] : STANDING;
	}

	/** True when the entity has no voluntary control. */
	public boolean incapacitated() {
		return this != STANDING;
	}

	/** True when the body is (mostly) on the ground: low hitbox, stompable. */
	public boolean grounded() {
		return this == DOWNED || this == CRAWLING;
	}

	/** True while the client should be driving the body with ragdoll physics. */
	public boolean ragdoll() {
		return this == FALLING || this == DOWNED || this == RECOVERING || this == CRAWLING;
	}
}
