package dev.visceral.client.anim;

import dev.visceral.state.BodyRegion;

/** The six articulated parts of a humanoid model. Ordinals match {@link BodyRegion}. */
public enum Bone {
	HEAD("head"),
	BODY("body"),
	RIGHT_ARM("right_arm"),
	LEFT_ARM("left_arm"),
	RIGHT_LEG("right_leg"),
	LEFT_LEG("left_leg");

	public static final Bone[] ALL = values();
	public static final int COUNT = ALL.length;

	public final String partName;

	Bone(String partName) {
		this.partName = partName;
	}

	/** Head and arms hang off the torso; legs hang off the pelvis (root). */
	public boolean childOfBody() {
		return this == HEAD || this == RIGHT_ARM || this == LEFT_ARM;
	}

	public boolean isArm() {
		return this == RIGHT_ARM || this == LEFT_ARM;
	}

	public boolean isLeg() {
		return this == RIGHT_LEG || this == LEFT_LEG;
	}

	public BodyRegion region() {
		return BodyRegion.byId(ordinal());
	}

	public static Bone of(BodyRegion region) {
		return ALL[region.ordinal()];
	}

	public static Bone byName(String name) {
		for (Bone b : ALL) if (b.partName.equals(name)) return b;
		return null;
	}
}
