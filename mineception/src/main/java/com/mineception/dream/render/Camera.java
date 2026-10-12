package com.mineception.dream.render;

/**
 * A pinhole camera inside a dream level. Angles follow Minecraft's conventions: yaw 0 looks toward +z (south), yaw 90
 * toward -x (west); positive pitch looks down.
 *
 * @param fov vertical field of view in degrees
 */
public record Camera(double x, double y, double z, float yaw, float pitch, float fov) {
	/** Unit view direction as {x, y, z}. */
	public double[] forward() {
		double yawRad = Math.toRadians(yaw);
		double pitchRad = Math.toRadians(pitch);
		double cosPitch = Math.cos(pitchRad);
		return new double[]{-Math.sin(yawRad) * cosPitch, -Math.sin(pitchRad), Math.cos(yawRad) * cosPitch};
	}

	/** Unit vector to the right of the view direction, always horizontal, as {x, y, z}. */
	public double[] right() {
		double yawRad = Math.toRadians(yaw);
		return new double[]{-Math.cos(yawRad), 0.0, -Math.sin(yawRad)};
	}

	/** Unit vector "up" on the image plane (forward x right reversed), as {x, y, z}. */
	public double[] up() {
		double[] f = forward();
		double[] r = right();
		// up = right x forward
		return new double[]{
			r[1] * f[2] - r[2] * f[1],
			r[2] * f[0] - r[0] * f[2],
			r[0] * f[1] - r[1] * f[0]
		};
	}
}
