package com.extremesports.trick;

import com.extremesports.sport.SportType;

/**
 * Static definition of a trick. Rotation fields describe the full animation (degrees over the trick's duration)
 * and are shared by the physics validation and both equipment and rider renderers.
 *
 * @param id          globally unique id, e.g. "skateboard.kickflip"
 * @param points      base points
 * @param perUnit     extra points per tick held (grabs, manuals) or per block travelled (grinds)
 * @param duration    animation length in ticks at trick-speed 1.0 (0 for held tricks)
 * @param eqRoll      equipment rotation around its long axis (kickflips)
 * @param eqYaw       equipment rotation around the vertical axis (shove-its, tailwhips); for grinds the static yaw offset
 * @param eqPitch     equipment rotation around its lateral axis (impossibles); for grinds/manuals the static pitch
 * @param partSpin    handlebar/fork rotation (barspins)
 * @param riderPitch  whole-body pitch rotation including equipment (backflips)
 * @param riderRoll   whole-body roll rotation (off-axis flips)
 * @param pose        pose key used by the animator for hand/foot placement
 */
public record TrickDef(
	String id,
	SportType sport,
	TrickCategory category,
	InputDir dir,
	int points,
	float perUnit,
	int duration,
	float eqRoll,
	float eqYaw,
	float eqPitch,
	float partSpin,
	float riderPitch,
	float riderRoll,
	String pose
) {
	public String translationKey() {
		return "trick.extremesports." + id;
	}

	public boolean isAirTrick() {
		return category == TrickCategory.FLIP || category == TrickCategory.WHIP;
	}

	/** Tricks that rotate the rider's whole body need more air and take longer. */
	public boolean isBodyFlip() {
		return riderPitch != 0.0F || riderRoll != 0.0F;
	}
}
