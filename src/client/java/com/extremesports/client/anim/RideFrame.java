package com.extremesports.client.anim;

/**
 * One rendered frame of a ride: transforms shared by the equipment renderer and the rider's player model.
 * Angles are in degrees unless noted; distances in blocks.
 */
public final class RideFrame {
	/** Visual heading of the equipment (MC yaw). */
	public float yaw;
	/** Rider body yaw (MC yaw). */
	public float riderYaw;
	/** Surface pitch (nose up positive) and roll (incl. carving lean) applied to rider and equipment. */
	public float pitch;
	public float roll;
	/** Whole-body rotations (rider + equipment) about {@link #pivotY}: backflips, flairs, corks. */
	public float flipPitch;
	public float flipRoll;
	public float flipYaw;
	public float pivotY;
	/** Equipment rises toward the rider's tucked feet. */
	public float lift;
	/** Equipment-only trick rotations about its centre: kickflips (roll), shove-its (yaw), impossibles (pitch). */
	public float eqRoll;
	public float eqYaw;
	public float eqPitch;
	/** Static tilt (manuals, grinds), nose-up positive, pivoting at {@link #tiltPivot} along the length axis. */
	public float tiltPitch;
	public float tiltPivot;
	public float tiltRoll;
	/** Handlebar/fork rotation around the steering axis (barspins, x-ups, steering). */
	public float partSpin;
	/** Frame/deck rotation around the steering axis (tailwhips). */
	public float whip;
	/** Wheel spin and crank angle (radians). */
	public float wheel;
	public float crank;
	/** Vertical offset of rider and equipment (pegs/deck sitting on a rail). */
	public float dropY;
	/** 0 = vanilla pose, 1 = full riding pose. */
	public float blend;
	public final Skeleton skeleton = new Skeleton();
	/** Feet height of the rider above the entity origin. */
	public float standHeight;
	public boolean skatesOnFeet;
	/** Partial tick and owner used to cache a frame across renderers in the same render pass. */
	long cacheKey = Long.MIN_VALUE;
}
