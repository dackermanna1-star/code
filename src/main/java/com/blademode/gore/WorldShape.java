package com.blademode.gore;

import net.minecraft.world.phys.AABB;
import org.joml.Vector3d;

/** The solid world around a ragdoll, as seen by its solver. */
public interface WorldShape {
	/** Gathers the collision geometry of a region (called once per tick). */
	void prepare(AABB region);

	boolean isEmpty();

	/** Changes whenever the geometry gathered by {@link #prepare} changes (wakes sleeping bodies). */
	long signature();

	boolean isSolid(double x, double y, double z);

	/**
	 * @param point    current position of a sample point
	 * @param previous where it was at the start of the substep
	 * @return true, filling {@code out}, when the point is inside something solid
	 */
	boolean collide(Vector3d point, Vector3d previous, Contact out);

	/** Contact result, reused. */
	final class Contact {
		public final Vector3d normal = new Vector3d();
		public double depth;
	}
}
