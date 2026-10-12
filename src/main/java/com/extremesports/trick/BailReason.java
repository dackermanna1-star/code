package com.extremesports.trick;

public enum BailReason {
	MID_TRICK("Landed mid-trick — finish the rotation before touching down"),
	OVER_ROTATED("Landed crooked — line the board up with your direction of travel"),
	BIG_DROP("Dropped in too hard"),
	WALL("Slammed into a wall"),
	GRIND_BALANCE("Lost balance on the grind — counter-steer with left/right"),
	MANUAL_BALANCE("Lost balance in the manual — balance with forward/back"),
	GRIND_BLOCKED("Something blocked the grind"),
	WATER("Rolled into water");

	/** English fallback used by practice-mode feedback when translations are missing. */
	public final String hint;

	BailReason(String hint) {
		this.hint = hint;
	}

	public String translationKey() {
		return "bail.extremesports." + name().toLowerCase(java.util.Locale.ROOT);
	}

	public static BailReason byOrdinal(int ordinal) {
		BailReason[] values = values();
		return ordinal >= 0 && ordinal < values.length ? values[ordinal] : WALL;
	}
}
