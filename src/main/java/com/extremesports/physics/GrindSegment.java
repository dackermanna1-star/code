package com.extremesports.physics;

import net.minecraft.world.phys.Vec3;

/**
 * A straight grindable line in world space (rail centre line, ledge edge or ramp coping).
 */
public record GrindSegment(Vec3 start, Vec3 end, Type type, boolean metal) {
	public enum Type {
		RAIL,
		LEDGE,
		COPING
	}

	public Vec3 direction() {
		return end.subtract(start).normalize();
	}

	public double length() {
		return end.distanceTo(start);
	}

	/** Parameter (0..1, clamped) of the closest point on the segment to {@code point}. */
	public double closestT(Vec3 point) {
		Vec3 delta = end.subtract(start);
		double lengthSqr = delta.lengthSqr();
		if (lengthSqr < 1.0E-8) {
			return 0.0;
		}
		double t = point.subtract(start).dot(delta) / lengthSqr;
		return Math.max(0.0, Math.min(1.0, t));
	}

	public Vec3 at(double t) {
		return start.add(end.subtract(start).scale(t));
	}

	/** Same segment traversed the other way round. */
	public GrindSegment reversed() {
		return new GrindSegment(end, start, type, metal);
	}
}
