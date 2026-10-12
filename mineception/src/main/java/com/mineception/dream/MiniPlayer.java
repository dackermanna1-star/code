package com.mineception.dream;

import com.mineception.dream.render.Camera;

/**
 * The player's body inside a dream level: position, look direction, velocity and collision with the level's blocks.
 *
 * <p>Movement follows vanilla Minecraft's player physics tick for tick: the same input scaling, ground and air
 * acceleration, friction, gravity and drag, jump impulse (with the sprint-jump boost), swimming, sneaking that stops
 * at ledges, and axis-separated collision (Y, then X, then Z) against solid blocks. Outside the level's bounds there is
 * nothing to collide with, so walking off the edge drops the player into the void until {@link #fellOut()}.
 */
public final class MiniPlayer {
	public static final double WIDTH = 0.6;
	public static final double HEIGHT = 1.8;
	public static final double EYE_HEIGHT = 1.62;
	/** Eye height while sneaking (the camera dips smoothly toward it). */
	public static final double SNEAK_EYE_HEIGHT = 1.27;
	/** Below this height the player has fallen out of the level and gets "the kick" back up a level. */
	public static final double KICK_Y = -12.0;
	/** Default reach for breaking/placing blocks and using the laptop. */
	public static final double REACH = 5.0;

	static final double GRAVITY = 0.08;
	static final double VERTICAL_DRAG = 0.98;
	static final double JUMP_VELOCITY = 0.42;
	static final double SPRINT_JUMP_BOOST = 0.2;
	/** Ground acceleration (the movement speed attribute; block friction 0.6 makes vanilla's factor exactly 1). */
	static final double WALK_ACCELERATION = 0.1;
	static final double SPRINT_ACCELERATION = 0.13;
	static final double AIR_ACCELERATION = 0.02;
	static final double SPRINT_AIR_ACCELERATION = 0.026;
	/** Horizontal velocity kept per tick: block slipperiness 0.6 x 0.91 on the ground, 0.91 in the air. */
	static final double GROUND_FRICTION = 0.6 * 0.91;
	static final double AIR_FRICTION = 0.91;
	static final double WATER_ACCELERATION = 0.02;
	static final double WATER_DRAG = 0.8;
	static final double SPRINT_WATER_DRAG = 0.9;
	static final double SWIM_UP = 0.04;
	/** Water deeper than this (above the feet) makes jump swim instead of jump. */
	static final double FLUID_JUMP_THRESHOLD = 0.4;
	static final double SNEAK_SPEED = 0.3;
	static final double INPUT_SCALE = 0.98;
	static final double MAX_STEP_DOWN = 0.6;
	private static final double EPS = 1.0E-7;
	private static final int JUMP_DELAY = 10;

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
	/** True while sprinting (started by holding sprint while walking forward; ends when forward is released). */
	public boolean sprinting;
	/** True while the sneak key is held. */
	public boolean sneaking;
	/** Whether the last move bumped into a wall. */
	public boolean horizontalCollision;
	/** Distance walked on the ground (for view bobbing), this tick and the previous one. */
	public float walkDist;
	public float walkDistO;
	/** Smoothed walking intensity 0..0.1 like vanilla's camera bob, this tick and the previous one. */
	public float bob;
	public float bobO;

	private double eyeHeight = EYE_HEIGHT;
	private double eyeHeightO = EYE_HEIGHT;
	private int jumpDelay;

	/** Puts the player at the level's spawn point, at rest. */
	public void reset(MiniWorld world) {
		x = xo = world.spawnX;
		y = yo = world.spawnY;
		z = zo = world.spawnZ;
		yaw = yawO = world.spawnYaw;
		pitch = pitchO = world.spawnPitch;
		vx = vy = vz = 0.0;
		onGround = world.get(floor(x), floor(y - 0.01), floor(z)).solid();
		inWater = touchesWater(world, x, y, z);
		sprinting = false;
		sneaking = false;
		horizontalCollision = false;
		walkDist = walkDistO = 0.0F;
		bob = bobO = 0.0F;
		eyeHeight = eyeHeightO = EYE_HEIGHT;
		jumpDelay = 0;
	}

	/** Advances one game tick (1/20 s) of movement with the given keys held. */
	public void tick(MiniWorld world, MiniInput input) {
		xo = x;
		yo = y;
		zo = z;
		yawO = yaw;
		pitchO = pitch;
		eyeHeightO = eyeHeight;
		walkDistO = walkDist;
		bobO = bob;
		pitch = Math.max(-90.0F, Math.min(90.0F, pitch));
		if (jumpDelay > 0) {
			jumpDelay--;
		}
		if (Math.abs(vx) < 0.003) {
			vx = 0.0;
		}
		if (Math.abs(vy) < 0.003) {
			vy = 0.0;
		}
		if (Math.abs(vz) < 0.003) {
			vz = 0.0;
		}
		inWater = touchesWater(world, x, y, z);

		// Movement keys, scaled like vanilla's LocalPlayer: normalized, x0.98, x0.3 when sneaking, square-corrected
		sneaking = input.sneak();
		double strafe = (input.left() ? 1 : 0) - (input.right() ? 1 : 0);
		double forward = (input.forward() ? 1 : 0) - (input.back() ? 1 : 0);
		double length = Math.sqrt(strafe * strafe + forward * forward);
		if (length > 0.0) {
			double scale = INPUT_SCALE * (sneaking ? SNEAK_SPEED : 1.0) / length;
			strafe *= scale;
			forward *= scale;
			double nx = Math.abs(strafe) / Math.hypot(strafe, forward);
			double nz = Math.abs(forward) / Math.hypot(strafe, forward);
			double ratio = nz > nx ? nx / nz : nz / nx;
			double magnitude = Math.hypot(strafe, forward);
			double square = Math.min(magnitude * Math.sqrt(1.0 + ratio * ratio), 1.0) / magnitude;
			strafe *= square;
			forward *= square;
		}

		if (input.sprint() && input.forward() && !input.back() && !sneaking) {
			sprinting = true;
		}
		if (!input.forward() || sneaking || horizontalCollision) {
			sprinting = false;
		}

		double fluidHeight = inWater ? waterHeight(world) : 0.0;
		if (input.jump()) {
			if (inWater && (fluidHeight > FLUID_JUMP_THRESHOLD || !onGround)) {
				vy += SWIM_UP;
			} else if (onGround && jumpDelay == 0) {
				vy = Math.max(JUMP_VELOCITY, vy);
				if (sprinting) {
					double yawRad = Math.toRadians(yaw);
					vx += -Math.sin(yawRad) * SPRINT_JUMP_BOOST;
					vz += Math.cos(yawRad) * SPRINT_JUMP_BOOST;
				}
				jumpDelay = JUMP_DELAY;
			}
		} else {
			jumpDelay = 0;
		}

		double startX = x;
		double startY = y;
		double startZ = z;
		if (inWater) {
			accelerate(WATER_ACCELERATION, strafe, forward);
			move(world);
			double drag = sprinting ? SPRINT_WATER_DRAG : WATER_DRAG;
			vx *= drag;
			vy *= WATER_DRAG;
			vz *= drag;
			if (!sprinting) {
				vy -= GRAVITY / 16.0;
			}
			// Swimming into a ledge with room above it lets the player climb out, like vanilla
			if (horizontalCollision && !collides(world, x + vx, startY + 0.6 + vy, z + vz)) {
				vy = 0.3;
			}
		} else {
			boolean grounded = onGround;
			double acceleration = grounded
				? (sprinting ? SPRINT_ACCELERATION : WALK_ACCELERATION)
				: (sprinting ? SPRINT_AIR_ACCELERATION : AIR_ACCELERATION);
			accelerate(acceleration, strafe, forward);
			move(world);
			vy = (vy - GRAVITY) * VERTICAL_DRAG;
			double friction = grounded ? GROUND_FRICTION : AIR_FRICTION;
			vx *= friction;
			vz *= friction;
		}
		inWater = touchesWater(world, x, y, z);

		double moved = Math.hypot(x - startX, z - startZ);
		if (onGround) {
			walkDist += (float) (moved * 0.6);
		}
		float intensity = onGround && !inWater ? (float) Math.min(0.1, moved) : 0.0F;
		bob += (intensity - bob) * 0.4F;
		double targetEye = sneaking ? SNEAK_EYE_HEIGHT : EYE_HEIGHT;
		eyeHeight += (targetEye - eyeHeight) * 0.5;
		if (Math.abs(targetEye - eyeHeight) < 0.001) {
			eyeHeight = targetEye;
		}
	}

	/** Adds the rotated input impulse (vanilla's moveRelative). */
	private void accelerate(double speed, double strafe, double forward) {
		double lengthSq = strafe * strafe + forward * forward;
		if (lengthSq < 1.0E-7) {
			return;
		}
		if (lengthSq > 1.0) {
			double length = Math.sqrt(lengthSq);
			strafe /= length;
			forward /= length;
		}
		strafe *= speed;
		forward *= speed;
		double yawRad = Math.toRadians(yaw);
		double sin = Math.sin(yawRad);
		double cos = Math.cos(yawRad);
		vx += strafe * cos - forward * sin;
		vz += forward * cos + strafe * sin;
	}

	/** Moves by the current velocity, colliding Y then X then Z, and updates the contact flags. */
	private void move(MiniWorld world) {
		double dx = vx;
		double dy = vy;
		double dz = vz;
		if (sneaking && onGround && dy <= 0.0) {
			double[] backedOff = backOffFromEdge(world, dx, dz);
			dx = backedOff[0];
			dz = backedOff[1];
		}
		double wantX = dx;
		double wantY = dy;
		double wantZ = dz;
		dy = clip(world, 1, dy);
		y += dy;
		dx = clip(world, 0, dx);
		x += dx;
		dz = clip(world, 2, dz);
		z += dz;
		boolean collidedX = dx != wantX;
		boolean collidedZ = dz != wantZ;
		boolean collidedY = dy != wantY;
		horizontalCollision = collidedX || collidedZ;
		if (wantY == 0.0) {
			// Not moving vertically (e.g. the first tick after a reset): grounded if something is right underneath
			double h = WIDTH / 2.0;
			onGround = anySolid(world, x - h + EPS, y - 0.001, z - h + EPS, x + h - EPS, y, z + h - EPS);
		} else {
			onGround = collidedY && wantY < 0.0;
		}
		if (collidedX) {
			vx = 0.0;
		}
		if (collidedZ) {
			vz = 0.0;
		}
		if (collidedY) {
			vy = 0.0;
		}
	}

	/** Vanilla's sneak behaviour: shorten a move that would step off a ledge more than {@link #MAX_STEP_DOWN} high. */
	private double[] backOffFromEdge(MiniWorld world, double dx, double dz) {
		double step = 0.05;
		double sx = Math.signum(dx) * step;
		double sz = Math.signum(dz) * step;
		while (dx != 0.0 && canFall(world, dx, 0.0)) {
			if (Math.abs(dx) <= step) {
				dx = 0.0;
				break;
			}
			dx -= sx;
		}
		while (dz != 0.0 && canFall(world, 0.0, dz)) {
			if (Math.abs(dz) <= step) {
				dz = 0.0;
				break;
			}
			dz -= sz;
		}
		while (dx != 0.0 && dz != 0.0 && canFall(world, dx, dz)) {
			dx = Math.abs(dx) <= step ? 0.0 : dx - sx;
			dz = Math.abs(dz) <= step ? 0.0 : dz - sz;
		}
		return new double[]{dx, dz};
	}

	private boolean canFall(MiniWorld world, double dx, double dz) {
		double h = WIDTH / 2.0;
		return !anySolid(world, x - h + EPS + dx, y - MAX_STEP_DOWN - EPS, z - h + EPS + dz, x + h - EPS + dx, y, z + h - EPS + dz);
	}

	/**
	 * Clips a movement along one axis (0 = x, 1 = y, 2 = z) so the box stops at the first solid block in the way.
	 */
	private double clip(MiniWorld world, int axis, double d) {
		if (d == 0.0) {
			return 0.0;
		}
		double h = WIDTH / 2.0;
		double[] min = {x - h, y, z - h};
		double[] max = {x + h, y + HEIGHT, z + h};
		int a1 = (axis + 1) % 3;
		int a2 = (axis + 2) % 3;
		int lo1 = floor(min[a1] + EPS);
		int hi1 = floor(max[a1] - EPS);
		int lo2 = floor(min[a2] + EPS);
		int hi2 = floor(max[a2] - EPS);
		int[] cell = new int[3];
		if (d > 0.0) {
			for (int c = floor(max[axis] - EPS) + 1; c < max[axis] + d; c++) {
				if (sliceSolid(world, cell, axis, c, a1, lo1, hi1, a2, lo2, hi2)) {
					return Math.max(0.0, Math.min(d, c - max[axis]));
				}
			}
		} else {
			for (int c = floor(min[axis] + EPS) - 1; c + 1 > min[axis] + d; c--) {
				if (sliceSolid(world, cell, axis, c, a1, lo1, hi1, a2, lo2, hi2)) {
					return Math.min(0.0, Math.max(d, c + 1 - min[axis]));
				}
			}
		}
		return d;
	}

	private static boolean sliceSolid(MiniWorld world, int[] cell, int axis, int c, int a1, int lo1, int hi1, int a2, int lo2, int hi2) {
		cell[axis] = c;
		for (int i = lo1; i <= hi1; i++) {
			cell[a1] = i;
			for (int j = lo2; j <= hi2; j++) {
				cell[a2] = j;
				if (world.get(cell[0], cell[1], cell[2]).solid()) {
					return true;
				}
			}
		}
		return false;
	}

	private static boolean anySolid(MiniWorld world, double x0, double y0, double z0, double x1, double y1, double z1) {
		for (int cy = floor(y0); cy <= floor(y1 - EPS); cy++) {
			for (int cz = floor(z0); cz <= floor(z1); cz++) {
				for (int cx = floor(x0); cx <= floor(x1); cx++) {
					if (world.get(cx, cy, cz).solid()) {
						return true;
					}
				}
			}
		}
		return false;
	}

	/** Whether the player's box with its feet at (px, py, pz) would overlap a solid block. */
	public boolean collides(MiniWorld world, double px, double py, double pz) {
		double h = WIDTH / 2.0;
		return anySolid(world, px - h + EPS, py + EPS, pz - h + EPS, px + h - EPS, py + HEIGHT, pz + h - EPS);
	}

	private static boolean touchesWater(MiniWorld world, double px, double py, double pz) {
		double h = WIDTH / 2.0 - 0.001;
		for (int cy = floor(py + 0.001); cy <= floor(py + HEIGHT - 0.001); cy++) {
			for (int cz = floor(pz - h); cz <= floor(pz + h); cz++) {
				for (int cx = floor(px - h); cx <= floor(px + h); cx++) {
					if (world.get(cx, cy, cz) == MiniBlock.WATER) {
						return true;
					}
				}
			}
		}
		return false;
	}

	/** How high the water reaches above the player's feet (0 if dry). */
	private double waterHeight(MiniWorld world) {
		double h = WIDTH / 2.0 - 0.001;
		double best = 0.0;
		for (int cy = floor(y + 0.001); cy <= floor(y + HEIGHT - 0.001); cy++) {
			for (int cz = floor(z - h); cz <= floor(z + h); cz++) {
				for (int cx = floor(x - h); cx <= floor(x + h); cx++) {
					if (world.get(cx, cy, cz) == MiniBlock.WATER) {
						best = Math.max(best, cy + 1 - y);
					}
				}
			}
		}
		return best;
	}

	/** True once the player has fallen out of the level. */
	public boolean fellOut() {
		return y < KICK_Y;
	}

	/** Current eye height above the feet (lower while sneaking). */
	public double eyeHeight() {
		return eyeHeight;
	}

	/** Camera at the player's eyes, interpolated between the previous and current tick. */
	public Camera eyeCamera(float partialTick, float fov) {
		double ix = xo + (x - xo) * partialTick;
		double iy = yo + (y - yo) * partialTick;
		double iz = zo + (z - zo) * partialTick;
		double eye = eyeHeightO + (eyeHeight - eyeHeightO) * partialTick;
		float iyaw = yawO + wrapDegrees(yaw - yawO) * partialTick;
		float ipitch = pitchO + (pitch - pitchO) * partialTick;
		return new Camera(ix, iy + eye, iz, iyaw, ipitch, fov);
	}

	/**
	 * The block the player is looking at within {@code reach}, or null: an exact voxel walk (Amanatides-Woo) from the
	 * eye along the look direction that skips air and water and reports the face the ray entered through.
	 */
	public MiniHit pick(MiniWorld world, double reach) {
		double yawRad = Math.toRadians(yaw);
		double pitchRad = Math.toRadians(pitch);
		double cosPitch = Math.cos(pitchRad);
		double dx = -Math.sin(yawRad) * cosPitch;
		double dy = -Math.sin(pitchRad);
		double dz = Math.cos(yawRad) * cosPitch;
		return pick(world, x, y + eyeHeight, z, dx, dy, dz, reach);
	}

	/** Voxel walk from an arbitrary point along a unit direction; see {@link #pick(MiniWorld, double)}. */
	public static MiniHit pick(MiniWorld world, double ox, double oy, double oz, double dx, double dy, double dz, double reach) {
		int cx = floor(ox);
		int cy = floor(oy);
		int cz = floor(oz);
		MiniBlock start = world.get(cx, cy, cz);
		if (targetable(start)) {
			Face against = Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? Face.WEST : Face.EAST)
				: Math.abs(dy) >= Math.abs(dz) ? (dy > 0 ? Face.DOWN : Face.UP) : (dz > 0 ? Face.NORTH : Face.SOUTH);
			return new MiniHit(cx, cy, cz, against, start, 0.0);
		}
		int stepX = dx > 0 ? 1 : -1;
		int stepY = dy > 0 ? 1 : -1;
		int stepZ = dz > 0 ? 1 : -1;
		double deltaX = dx == 0 ? Double.POSITIVE_INFINITY : Math.abs(1.0 / dx);
		double deltaY = dy == 0 ? Double.POSITIVE_INFINITY : Math.abs(1.0 / dy);
		double deltaZ = dz == 0 ? Double.POSITIVE_INFINITY : Math.abs(1.0 / dz);
		double maxX = dx == 0 ? Double.POSITIVE_INFINITY : (dx > 0 ? cx + 1 - ox : ox - cx) * deltaX;
		double maxY = dy == 0 ? Double.POSITIVE_INFINITY : (dy > 0 ? cy + 1 - oy : oy - cy) * deltaY;
		double maxZ = dz == 0 ? Double.POSITIVE_INFINITY : (dz > 0 ? cz + 1 - oz : oz - cz) * deltaZ;
		while (true) {
			double t;
			Face face;
			if (maxX < maxY && maxX < maxZ) {
				t = maxX;
				cx += stepX;
				maxX += deltaX;
				face = stepX > 0 ? Face.WEST : Face.EAST;
			} else if (maxY < maxZ) {
				t = maxY;
				cy += stepY;
				maxY += deltaY;
				face = stepY > 0 ? Face.DOWN : Face.UP;
			} else {
				t = maxZ;
				cz += stepZ;
				maxZ += deltaZ;
				face = stepZ > 0 ? Face.NORTH : Face.SOUTH;
			}
			if (t > reach) {
				return null;
			}
			MiniBlock block = world.get(cx, cy, cz);
			if (targetable(block)) {
				return new MiniHit(cx, cy, cz, face, block, t);
			}
		}
	}

	private static boolean targetable(MiniBlock block) {
		return block != MiniBlock.AIR && block != MiniBlock.WATER;
	}

	/** Whether a block may be placed in this cell without overlapping the player. */
	public boolean canPlaceAt(int cx, int cy, int cz) {
		double h = WIDTH / 2.0;
		boolean overlaps = x - h < cx + 1 - EPS && x + h > cx + EPS
			&& y < cy + 1 - EPS && y + HEIGHT > cy + EPS
			&& z - h < cz + 1 - EPS && z + h > cz + EPS;
		return !overlaps;
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

	private static int floor(double v) {
		return (int) Math.floor(v);
	}
}
