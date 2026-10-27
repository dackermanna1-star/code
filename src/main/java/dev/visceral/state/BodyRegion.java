package dev.visceral.state;

/** Hit locations, matching the six parts of a humanoid model. */
public enum BodyRegion {
	HEAD,
	TORSO,
	RIGHT_ARM,
	LEFT_ARM,
	RIGHT_LEG,
	LEFT_LEG;

	private static final BodyRegion[] VALUES = values();

	public static BodyRegion byId(int id) {
		return id >= 0 && id < VALUES.length ? VALUES[id] : TORSO;
	}

	public boolean isLeg() {
		return this == RIGHT_LEG || this == LEFT_LEG;
	}

	public boolean isArm() {
		return this == RIGHT_ARM || this == LEFT_ARM;
	}

	/** Relative susceptibility to losing balance when hit here. */
	public float balanceFactor() {
		return switch (this) {
			case HEAD -> 1.15f;
			case TORSO -> 1.0f;
			case RIGHT_ARM, LEFT_ARM -> 0.75f;
			case RIGHT_LEG, LEFT_LEG -> 1.35f;
		};
	}

	/**
	 * Picks a region from a hit point expressed relative to the entity: {@code height} in [0,1]
	 * from feet to top, {@code lateral} in [-1,1] (negative = entity's right side).
	 */
	public static BodyRegion fromLocal(double height, double lateral) {
		if (height > 0.78) return HEAD;
		if (height < 0.40) return lateral < 0 ? RIGHT_LEG : LEFT_LEG;
		if (Math.abs(lateral) > 0.55) return lateral < 0 ? RIGHT_ARM : LEFT_ARM;
		return TORSO;
	}
}
