package com.mineception.client.screen;

import com.mineception.dream.Face;
import com.mineception.dream.LaptopGeometry;
import com.mineception.dream.MiniPlayer;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.render.Camera;

/**
 * Camera paths for diving into a laptop screen and pulling back out of it.
 *
 * <p>The dive ends at the "screen camera": straight in front of the level's laptop screen, looking along its inward
 * normal, at the distance where the screen exactly fills the vertical field of view. Because the monitor and the laptop
 * screens share the same 16:10 aspect and the picture on a laptop screen is the next level seen from its avatar's eyes
 * with the same field of view, the last frame of a dive is the first frame of the next level.
 *
 * <p>Pure math on the dream types, no Minecraft classes.
 */
public final class DiveCamera {
	private DiveCamera() {
	}

	/** Centre of a level's laptop screen in level coordinates. */
	public static double[] screenCenter(MiniWorld world) {
		double[] p = LaptopGeometry.screenPoint(world.laptopFacing, 0.5, 0.5);
		return new double[]{world.laptopX + p[0], world.laptopY + p[1], world.laptopZ + p[2]};
	}

	/** Distance from the screen at which its height fills a vertical field of view of {@code fov} degrees. */
	public static double fillDistance(float fov) {
		return LaptopGeometry.screenHeight() * 0.5 / Math.tan(Math.toRadians(fov) * 0.5);
	}

	/** The camera that sees exactly the laptop screen of {@code world}, filling the picture. */
	public static Camera screenCamera(MiniWorld world, float fov) {
		Face facing = world.laptopFacing;
		double[] c = screenCenter(world);
		double d = fillDistance(fov);
		return new Camera(c[0] + facing.dx * d, c[1], c[2] + facing.dz * d, facing.opposite().yaw(), 0.0F, fov);
	}

	/** {yaw, pitch} in Minecraft's convention for looking from one point toward another. */
	public static float[] lookAt(double fromX, double fromY, double fromZ, double toX, double toY, double toZ) {
		double dx = toX - fromX;
		double dy = toY - fromY;
		double dz = toZ - fromZ;
		double horizontal = Math.sqrt(dx * dx + dz * dz);
		if (horizontal < 1.0E-9 && Math.abs(dy) < 1.0E-9) {
			return new float[]{0.0F, 0.0F};
		}
		float yaw = (float) Math.toDegrees(Math.atan2(-dx, dz));
		float pitch = (float) -Math.toDegrees(Math.atan2(dy, horizontal));
		return new float[]{yaw, pitch};
	}

	/**
	 * The camera on the way from {@code from} (the avatar's eyes) into the laptop screen of {@code world}.
	 *
	 * <p>The path is a quadratic Bezier through a point on the screen's normal axis, so the camera swings in front of
	 * the screen before flying straight into it. Progress along it is measured in zoom: the distance to the screen
	 * shrinks geometrically, so the screen grows at a steady rate (eased at both ends) instead of creeping closer and
	 * then rushing in. The view turns to face the screen during the first half, and the field of view swells
	 * mid-flight for a sense of speed before settling on {@code fov}.
	 *
	 * @param t progress 0..1 (eased here)
	 */
	public static Camera dive(Camera from, MiniWorld world, float fov, double t) {
		t = clamp01(t);
		double closeness = smoothstep(t);
		double turn = easeInOutCubic(clamp01(t / 0.5));
		return along(from, world, fov, closeness, turn, fovPulse(t, 10.0));
	}

	/**
	 * The camera pulling back out of the laptop screen of {@code world} to {@code to} (the avatar's eyes): the dive
	 * played backwards, a little faster at the start, as if thrown out of the screen.
	 *
	 * @param t progress 0..1 (eased here)
	 */
	public static Camera exit(Camera to, MiniWorld world, float fov, double t) {
		t = clamp01(t);
		double closeness = 1.0 - smoothstep(Math.pow(t, 0.8));
		double turn = 1.0 - easeInOutCubic(clamp01((t - 0.3) / 0.7));
		return along(to, world, fov, closeness, turn, fovPulse(1.0 - t, 8.0));
	}

	/**
	 * A point of the path between {@code eye} (closeness 0) and the screen camera (closeness 1), with the view blended
	 * from the eye's look (turn = 0) to looking at the screen centre (turn = 1).
	 */
	private static Camera along(Camera eye, MiniWorld world, float fov, double closeness, double turn, double fovExtra) {
		Face facing = world.laptopFacing;
		double[] c = screenCenter(world);
		Camera end = screenCamera(world, fov);
		double[] p0 = {eye.x(), eye.y(), eye.z()};
		double[] p2 = {end.x(), end.y(), end.z()};
		double distance = distance(p0, c);
		// Control point on the screen's normal axis, roughly level with the eye, so the camera lines up before entering
		double axis = Math.max(fillDistance(fov) + 0.4, Math.min(3.0, distance * 0.6));
		double[] p1 = {c[0] + facing.dx * axis, c[1] + (eye.y() - c[1]) * 0.35, c[2] + facing.dz * axis};
		double s = pathParameter(p0, p1, p2, c, closeness);
		double[] p = bezier(p0, p1, p2, s);

		float yaw;
		float pitch;
		if (s >= 1.0) {
			yaw = end.yaw();
			pitch = end.pitch();
		} else {
			float[] look = lookAt(p[0], p[1], p[2], c[0], c[1], c[2]);
			yaw = eye.yaw() + MiniPlayer.wrapDegrees(look[0] - eye.yaw()) * (float) turn;
			pitch = eye.pitch() + (look[1] - eye.pitch()) * (float) turn;
		}
		float viewFov = (float) (eye.fov() + (fov - eye.fov()) * turn + fovExtra);
		return new Camera(p[0], p[1], p[2], yaw, pitch, viewFov);
	}

	/**
	 * The Bezier parameter where the distance to the screen centre is the geometric blend of the start and end
	 * distances for {@code closeness}, found by bisection (the distance shrinks along the path).
	 */
	private static double pathParameter(double[] p0, double[] p1, double[] p2, double[] center, double closeness) {
		if (closeness <= 0.0) {
			return 0.0;
		}
		if (closeness >= 1.0) {
			return 1.0;
		}
		double start = distance(p0, center);
		double end = distance(p2, center);
		if (start <= end * 1.01) {
			return closeness;
		}
		double target = start * Math.pow(end / start, closeness);
		double lo = 0.0;
		double hi = 1.0;
		for (int i = 0; i < 40; i++) {
			double mid = (lo + hi) * 0.5;
			if (distance(bezier(p0, p1, p2, mid), center) > target) {
				lo = mid;
			} else {
				hi = mid;
			}
		}
		return (lo + hi) * 0.5;
	}

	private static double[] bezier(double[] p0, double[] p1, double[] p2, double s) {
		double a = (1.0 - s) * (1.0 - s);
		double b = 2.0 * s * (1.0 - s);
		double e = s * s;
		return new double[]{
			a * p0[0] + b * p1[0] + e * p2[0],
			a * p0[1] + b * p1[1] + e * p2[1],
			a * p0[2] + b * p1[2] + e * p2[2]
		};
	}

	private static double distance(double[] a, double[] b) {
		double dx = a[0] - b[0];
		double dy = a[1] - b[1];
		double dz = a[2] - b[2];
		return Math.sqrt(dx * dx + dy * dy + dz * dz);
	}

	/** Extra field of view that swells to {@code amount} degrees mid-flight and is gone at both ends. */
	private static double fovPulse(double t, double amount) {
		double p = Math.sin(Math.PI * t);
		return amount * p * p * (1.0 - t);
	}

	static double easeInOutCubic(double t) {
		return t < 0.5 ? 4.0 * t * t * t : 1.0 - Math.pow(-2.0 * t + 2.0, 3.0) / 2.0;
	}

	static double smoothstep(double t) {
		return t * t * (3.0 - 2.0 * t);
	}

	static double clamp01(double t) {
		return t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t;
	}
}
