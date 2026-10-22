package com.ordnance.util;

import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * A slowly veering, gusting wind derived only from world time, so server (ember jumps) and clients (smoke drift)
 * agree on it without any syncing.
 */
public final class Wind {
	private Wind() {
	}

	/** Wind direction in radians around the Y axis. */
	public static double angle(World world) {
		double t = world.getTime();
		return t / 24000.0 * Math.PI * 2.0 * 0.7 + Math.sin(t / 3100.0) * 1.3 + Math.sin(t / 777.0) * 0.25;
	}

	/** Strength 0..1 with gusts. */
	public static double strength(World world) {
		double t = world.getTime();
		double base = 0.55 + 0.35 * Math.sin(t / 1700.0);
		double gust = 0.1 * Math.sin(t / 90.0) * Math.sin(t / 37.0);
		return MathHelper.clamp(base + gust, 0.05, 1.0);
	}

	/** Horizontal wind velocity in blocks per tick at full strength {@code scale}. */
	public static Vec3d velocity(World world, double scale) {
		double angle = angle(world);
		double s = strength(world) * scale;
		return new Vec3d(Math.cos(angle) * s, 0.0, Math.sin(angle) * s);
	}
}
