package com.extremesports.block;

import net.minecraft.util.Mth;

/**
 * Cross-section of a ramp: height (0..1 of the full rise) as a function of u, the distance travelled uphill (0..1
 * across the whole ramp). Multi-part ramps spread one block of rise across several blocks.
 */
public enum RampProfile {
	/** Concave transition reaching ~79 degrees at the coping. */
	QUARTER_PIPE(1, 1.0F, true),
	/** Straight 45 degree ramp. */
	STEEP(1, 1.0F, false),
	/** Straight ramp over two blocks (~27 degrees). */
	RAMP(2, 1.0F, false),
	/** Gentle slope over four blocks (~14 degrees) for downhill runs. */
	SLOPE(4, 1.0F, false),
	/** Curved launch ramp (kicker), 0.6 blocks tall with a ~46 degree lip. */
	KICKER(1, 0.6F, true),
	/** Steep BMX dirt lip, 0.85 blocks tall with a ~60 degree face. */
	DIRT_LIP(1, 0.85F, true);

	private static final float QP_K = 0.97F;
	private static final float QP_NORM = 1.0F - Mth.sqrt(1.0F - QP_K * QP_K);

	public final int parts;
	/** Height of the profile's top edge in blocks (per part for multi-part ramps it is 1/parts). */
	public final float maxHeight;
	public final boolean curved;

	RampProfile(int parts, float maxHeight, boolean curved) {
		this.parts = parts;
		this.maxHeight = maxHeight;
		this.curved = curved;
	}

	/** Height within one block for the given part, u in [0,1] across this block. */
	public double height(int part, double u) {
		u = Mth.clamp(u, 0.0, 1.0);
		return switch (this) {
			case QUARTER_PIPE -> (1.0 - Math.sqrt(1.0 - QP_K * QP_K * u * u)) / QP_NORM;
			case STEEP -> u;
			case RAMP, SLOPE -> (part + u) / parts;
			case KICKER -> 0.6 * Math.pow(u, 1.7);
			case DIRT_LIP -> 0.85 * u * u;
		};
	}

	/** Steepness at the top edge in degrees. */
	public float lipAngle() {
		double slope = (height(0, 1.0) - height(0, 0.98)) / 0.02;
		return (float) Math.toDegrees(Math.atan(slope));
	}
}
