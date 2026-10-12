package com.mineception.dream;

import com.mineception.dream.render.Camera;

/**
 * The player's body inside a dream level: position, look direction, velocity and collision with the level's blocks.
 *
 * <p>PLACEHOLDER (scaffold): no gravity or collision yet; tick() only walks along the look direction. The public fields
 * and method signatures are the contract used by the client screen and renderer and must stay.
 */
public final class MiniPlayer {
	public static final double WIDTH = 0.6;
	public static final double HEIGHT = 1.8;
	public static final double EYE_HEIGHT = 1.62;
	/** Below this height the player has fallen out of the level and gets "the kick" back up a level. */
	public static final double KICK_Y = -12.0;
	/** Default reach for breaking/placing blocks and using the laptop. */
	public static final double REACH = 5.0;

	/** Feet position. */
	public double x;
	public double y;
	public double z;
	/** Previous tick's position and look, for smooth rendering between ticks. */
	public double xo;
	public double yo;
	public double zo;
	public float yaw;
	public float pitch;
	public float yawO;
	public float pitchO;
	public double vx;
	public double vy;
	public double vz;
	public boolean onGround;
	public boolean inWater;

	/** Puts the player at the level's spawn point, at rest. */
	public void reset(MiniWorld world) {
		x = xo = world.spawnX;
		y = yo = world.spawnY;
		z = zo = world.spawnZ;
		yaw = yawO = world.spawnYaw;
		pitch = pitchO = world.spawnPitch;
		vx = vy = vz = 0.0;
		onGround = false;
		inWater = false;
	}

	/** Advances one game tick (1/20 s) of movement with the given keys held. */
	public void tick(MiniWorld world, MiniInput input) {
		xo = x;
		yo = y;
		zo = z;
		yawO = yaw;
		pitchO = pitch;
		double yawRad = Math.toRadians(yaw);
		double forward = (input.forward() ? 1 : 0) - (input.back() ? 1 : 0);
		double strafe = (input.left() ? 1 : 0) - (input.right() ? 1 : 0);
		double speed = 0.2;
		x += (-Math.sin(yawRad) * forward + Math.cos(yawRad) * strafe) * speed;
		z += (Math.cos(yawRad) * forward + Math.sin(yawRad) * strafe) * speed;
	}

	/** True once the player has fallen out of the level. */
	public boolean fellOut() {
		return y < KICK_Y;
	}

	/** Camera at the player's eyes, interpolated between the previous and current tick. */
	public Camera eyeCamera(float partialTick, float fov) {
		double ix = xo + (x - xo) * partialTick;
		double iy = yo + (y - yo) * partialTick;
		double iz = zo + (z - zo) * partialTick;
		float iyaw = yawO + wrapDegrees(yaw - yawO) * partialTick;
		float ipitch = pitchO + (pitch - pitchO) * partialTick;
		return new Camera(ix, iy + EYE_HEIGHT, iz, iyaw, ipitch, fov);
	}

	/** The block the player is looking at within {@code reach}, or null. */
	public MiniHit pick(MiniWorld world, double reach) {
		return null;
	}

	/** Whether a block may be placed in this cell without overlapping the player. */
	public boolean canPlaceAt(int cx, int cy, int cz) {
		return true;
	}

	public static float wrapDegrees(float degrees) {
		float d = degrees % 360.0F;
		if (d >= 180.0F) {
			d -= 360.0F;
		}
		if (d < -180.0F) {
			d += 360.0F;
		}
		return d;
	}
}
