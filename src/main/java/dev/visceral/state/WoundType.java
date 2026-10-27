package dev.visceral.state;

public enum WoundType {
	/** Edged weapons: lacerations, bleeds. */
	CUT,
	/** Pointed weapons and arrows: punctures, bleed heavily. */
	STAB,
	/** Fists, kicks, maces, falls: bruising, no bleeding. */
	BLUNT,
	/** Fire / explosions. */
	BURN,
	/** Limb severed (gore level 2 only). */
	SEVERED;

	private static final WoundType[] VALUES = values();

	public static WoundType byId(int id) {
		return id >= 0 && id < VALUES.length ? VALUES[id] : BLUNT;
	}

	public boolean bleeds() {
		return this == CUT || this == STAB || this == SEVERED;
	}
}
