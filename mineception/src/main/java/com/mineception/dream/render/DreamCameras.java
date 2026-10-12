package com.mineception.dream.render;

import com.mineception.dream.Face;
import com.mineception.dream.LaptopGeometry;
import com.mineception.dream.MiniPlayer;
import com.mineception.dream.MiniWorld;

/**
 * Camera helpers shared by the client and the offline preview: where idle avatars look (at their laptop, swaying
 * gently, so every screen shows the next screen) and where a laptop screen lands in a picture.
 */
public final class DreamCameras {
	/** Vertical field of view of the pictures shown on laptop screens. */
	public static final float FOV = 70.0F;

	private DreamCameras() {
	}

	/** Centre of a level's laptop screen in level coordinates. */
	public static double[] screenCenter(MiniWorld world) {
		return screenPoint(world, 0.5, 0.5);
	}

	/** A point of a level's laptop screen (u right, v down, 0..1) in level coordinates. */
	public static double[] screenPoint(MiniWorld world, double u, double v) {
		double[] p = LaptopGeometry.screenPoint(world.laptopFacing, u, v);
		return new double[]{world.laptopX + p[0], world.laptopY + p[1], world.laptopZ + p[2]};
	}

	/** {yaw, pitch} in Minecraft's convention for looking from one point at another. */
	public static float[] lookAt(double fromX, double fromY, double fromZ, double toX, double toY, double toZ) {
		double dx = toX - fromX;
		double dy = toY - fromY;
		double dz = toZ - fromZ;
		double horizontal = Math.sqrt(dx * dx + dz * dz);
		float yaw = (float) Math.toDegrees(Math.atan2(-dx, dz));
		float pitch = (float) -Math.toDegrees(Math.atan2(dy, horizontal));
		return new float[]{yaw, pitch};
	}

	/**
	 * Where an idle avatar standing at its current position looks: at the centre of its laptop's screen, with a slow
	 * sway so the picture feels alive.
	 *
	 * @param time real-world ticks (with the partial tick)
	 */
	public static float[] idleLook(MiniWorld world, double feetX, double feetY, double feetZ, double time) {
		double[] target = screenCenter(world);
		float[] look = lookAt(feetX, feetY + MiniPlayer.EYE_HEIGHT, feetZ, target[0], target[1], target[2]);
		look[0] += (float) (1.3 * Math.sin(time * (Math.PI * 2.0 / 173.0)));
		look[1] += (float) (0.6 * Math.sin(time * (Math.PI * 2.0 / 241.0) + 1.3));
		return look;
	}

	/** Camera of an avatar that is not being controlled: at its eyes, looking at its laptop. */
	public static Camera idleCamera(MiniWorld world, MiniPlayer avatar, long gameTime, float partialTick, float fov) {
		double x = avatar.xo + (avatar.x - avatar.xo) * partialTick;
		double y = avatar.yo + (avatar.y - avatar.yo) * partialTick;
		double z = avatar.zo + (avatar.z - avatar.zo) * partialTick;
		float[] look = idleLook(world, x, y, z, gameTime + (double) partialTick);
		return new Camera(x, y + MiniPlayer.EYE_HEIGHT, z, look[0], look[1], fov);
	}

	/**
	 * Where a level's laptop screen appears in a {@code width x height} picture taken by {@code camera}, as
	 * {minX, minY, maxX, maxY} in pixels (may reach outside the picture). Null if the screen faces away or is behind
	 * the camera. If the camera is right at the screen (part of it behind the camera) the rectangle covers the whole
	 * picture.
	 */
	public static double[] projectScreen(MiniWorld world, Camera camera, int width, int height) {
		Face facing = world.laptopFacing;
		double[] center = screenCenter(world);
		double toCameraX = camera.x() - center[0];
		double toCameraY = camera.y() - center[1];
		double toCameraZ = camera.z() - center[2];
		if (facing.dx * toCameraX + facing.dy * toCameraY + facing.dz * toCameraZ <= 0.0) {
			return null;
		}
		double[] f = camera.forward();
		double[] r = camera.right();
		double[] u = camera.up();
		double tanHalf = Math.tan(Math.toRadians(camera.fov()) * 0.5);
		double aspect = (double) width / height;
		double minX = Double.MAX_VALUE;
		double minY = Double.MAX_VALUE;
		double maxX = -Double.MAX_VALUE;
		double maxY = -Double.MAX_VALUE;
		int behind = 0;
		for (int corner = 0; corner < 4; corner++) {
			double[] p = screenPoint(world, corner & 1, corner >> 1);
			double vx = p[0] - camera.x();
			double vy = p[1] - camera.y();
			double vz = p[2] - camera.z();
			double depth = vx * f[0] + vy * f[1] + vz * f[2];
			if (depth < 0.02) {
				behind++;
				continue;
			}
			double sx = (vx * r[0] + vy * r[1] + vz * r[2]) / (depth * tanHalf * aspect);
			double sy = (vx * u[0] + vy * u[1] + vz * u[2]) / (depth * tanHalf);
			double px = (sx + 1.0) * 0.5 * width;
			double py = (1.0 - sy) * 0.5 * height;
			minX = Math.min(minX, px);
			maxX = Math.max(maxX, px);
			minY = Math.min(minY, py);
			maxY = Math.max(maxY, py);
		}
		if (behind == 4) {
			return null;
		}
		if (behind > 0) {
			return new double[]{0.0, 0.0, width, height};
		}
		return new double[]{minX, minY, maxX, maxY};
	}
}
