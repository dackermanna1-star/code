package com.mineception.client.screen;

import com.mineception.dream.Face;
import com.mineception.dream.LaptopGeometry;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.render.Camera;
import java.util.ArrayList;
import java.util.List;

/**
 * Camera flights for diving into a laptop screen and pulling back out of it.
 *
 * <p>A dive ends at the "screen camera": straight in front of the level's laptop screen, looking along its inward
 * normal, at the distance where the screen exactly fills the vertical field of view. Because the monitor and the laptop
 * screens share the same 16:10 aspect and the picture on a laptop screen is the next level seen from its avatar's eyes
 * with the same field of view, the last frame of a dive is the first frame of the next level.
 *
 * <p>The route is planned once per flight ({@link #plan}). From in front of the laptop the camera swings onto the
 * screen's axis and flies straight in. From beside or behind it, it first flies around the side of the laptop (the side
 * with fewer blocks in the way) so it never passes through the lid. Progress along the route is measured in distance
 * still to travel, so the camera moves steadily whatever the route's shape, and the view direction is unwrapped along
 * the route so it never flips.
 *
 * <p>Pure math on the dream types, no Minecraft classes.
 */
public final class DiveCamera {
	/**
	 * Vertical field of view of the pictures shown on dream laptop screens, which the monitor must use too for the dive
	 * to be seamless. It mirrors the renderer's {@code DreamCameras.FOV}; {@code DiveCameraTest} checks that they agree.
	 */
	public static final float FOV = 70.0F;

	/** An eye at least this far in front of the screen plane can fly straight in. */
	static final double FRONT_MARGIN = 0.15;
	/** How far the route keeps from the laptop's deck and lid. */
	static final double LAPTOP_CLEARANCE = 0.1;
	/** Sideways distances from the screen centre tried for routes around the laptop. */
	private static final double[] SIDE_OFFSETS = {1.25, 2.0};
	/** How far in front of the screen plane the route around the laptop comes back. */
	private static final double SIDE_FRONT = 0.6;
	/** How far behind the screen plane an eye behind the laptop moves sideways before coming round. */
	private static final double SIDE_BEHIND = 0.6;
	/** Height above the screen centre that routes from below the laptop are lifted to. */
	private static final double LIFT_HEIGHT = 0.35;
	/** Samples of the arc-length table of a flight. */
	private static final int TABLE_SAMPLES = 256;
	/** Spacing of the samples used to check a route for obstacles. */
	private static final double CHECK_SPACING = 0.04;

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
	 * The camera on the way from {@code from} (the avatar's eyes) into the laptop screen of {@code world}. Plans the
	 * route on every call; keep the {@link Flight} from {@link #plan} instead when drawing a whole dive.
	 *
	 * @param t progress 0..1 (eased here)
	 */
	public static Camera dive(Camera from, MiniWorld world, float fov, double t) {
		return plan(from, world, fov).dive(t);
	}

	/**
	 * The camera pulling back out of the laptop screen of {@code world} to {@code to} (the avatar's eyes). Plans the
	 * route on every call; keep the {@link Flight} from {@link #plan} instead when drawing a whole exit.
	 *
	 * @param t progress 0..1 (eased here)
	 */
	public static Camera exit(Camera to, MiniWorld world, float fov, double t) {
		return plan(to, world, fov).exit(t);
	}

	/**
	 * Plans the route between {@code eye} and the screen camera of {@code world}. The same route serves a dive (from the
	 * eye into the screen) and an exit (from the screen back to the eye). Blocks of the world are only read here, so a
	 * level that changes during the flight cannot make the camera jump.
	 */
	public static Flight plan(Camera eye, MiniWorld world, float fov) {
		Face facing = world.laptopFacing;
		double[] c = screenCenter(world);
		Camera end = screenCamera(world, fov);
		double[] e = {eye.x(), eye.y(), eye.z()};
		double[] endPoint = {end.x(), end.y(), end.z()};
		double[] normal = {facing.dx, 0.0, facing.dz};
		double[] side = {-facing.dz, 0.0, facing.dx};
		double front = (e[0] - c[0]) * normal[0] + (e[2] - c[2]) * normal[2];
		double lateral = (e[0] - c[0]) * side[0] + (e[2] - c[2]) * side[2];
		double rise = e[1] - c[1];

		// The last turn: a point on the screen's axis, roughly level with the eye (never low enough to skim the deck)
		double axis = Math.max(fillDistance(fov) + 0.4, Math.min(3.0, distance(e, c) * 0.6));
		double[] approach = at(c, normal, axis, side, 0.0, Math.max(-0.15, rise * 0.35));

		List<double[][]> routes = new ArrayList<>();
		if (front >= FRONT_MARGIN) {
			// Straight in. (From behind or above, this would cross the lid or pass over the screen and flip the view.)
			routes.add(new double[][]{e, approach, endPoint});
		}
		for (double offset : SIDE_OFFSETS) {
			for (int s = -1; s <= 1; s += 2) {
				double[] around = at(c, normal, SIDE_FRONT, side, s * offset, rise * 0.6);
				routes.add(new double[][]{e, around, approach, endPoint});
				if (front < FRONT_MARGIN && s * lateral < offset) {
					// Step out sideways first: straight sideways when level with or above the lid, else behind it
					double back = front < 0.0 ? Math.min(front, -SIDE_BEHIND) : front;
					double[] out = at(c, normal, back, side, s * offset, rise);
					routes.add(new double[][]{e, out, around, approach, endPoint});
				}
			}
		}

		if (rise < 0.0) {
			// From below the laptop (say, at the foot of the block it stands on), the same routes lifted to the screen's
			// height, either climbing on the way or rising straight up first
			int count = routes.size();
			for (int i = 0; i < count; i++) {
				double[][] route = routes.get(i);
				double[][] lifted = route.clone();
				for (int j = 1; j < route.length - 1; j++) {
					lifted[j] = new double[]{route[j][0], Math.max(route[j][1], c[1] + LIFT_HEIGHT), route[j][2]};
				}
				routes.add(lifted);
				double[][] climbing = new double[route.length + 1][];
				climbing[0] = e;
				climbing[1] = new double[]{e[0], c[1] + LIFT_HEIGHT, e[2]};
				System.arraycopy(lifted, 1, climbing, 2, route.length - 1);
				routes.add(climbing);
			}
		}

		double[][] laptop = laptopBoxes(world);
		double[][] best = null;
		double bestScore = Double.MAX_VALUE;
		for (double[][] route : routes) {
			double score = score(route, world, laptop);
			if (score < bestScore) {
				bestScore = score;
				best = route;
			}
		}
		return new Flight(eye, end, c, best);
	}

	/**
	 * Cost of flying a route: passing through the laptop is ruled out, flying through blocks is heavily penalised, and
	 * otherwise shorter is better.
	 */
	private static double score(double[][] route, MiniWorld world, double[][] laptop) {
		double length = 0.0;
		for (int i = 0; i + 1 < route.length; i++) {
			length += distance(route[i], route[i + 1]);
		}
		int samples = Math.max(64, (int) Math.ceil(length / CHECK_SPACING));
		double step = length / samples;
		double inLaptop = 0.0;
		double inBlocks = 0.0;
		for (int i = 1; i <= samples; i++) {
			double[] p = curve(route, i / (double) samples);
			if (insideAny(laptop, p, LAPTOP_CLEARANCE)) {
				inLaptop += step;
			}
			if (world.get((int) Math.floor(p[0]), (int) Math.floor(p[1]), (int) Math.floor(p[2])).solid()) {
				inBlocks += step;
			}
		}
		return inLaptop * 1.0E6 + inBlocks * 50.0 + length;
	}

	/** The laptop's deck and lid in level coordinates, {minX, minY, minZ, maxX, maxY, maxZ} each. */
	public static double[][] laptopBoxes(MiniWorld world) {
		double[][] boxes = LaptopGeometry.boxes(world.laptopFacing);
		double[][] out = new double[boxes.length][];
		for (int i = 0; i < boxes.length; i++) {
			double[] b = boxes[i];
			out[i] = new double[]{
				world.laptopX + b[0], world.laptopY + b[1], world.laptopZ + b[2],
				world.laptopX + b[3], world.laptopY + b[4], world.laptopZ + b[5]
			};
		}
		return out;
	}

	/** Whether {@code p} is inside any of the boxes grown by {@code margin} on every side. */
	public static boolean insideAny(double[][] boxes, double[] p, double margin) {
		for (double[] b : boxes) {
			if (p[0] > b[0] - margin && p[0] < b[3] + margin && p[1] > b[1] - margin && p[1] < b[4] + margin
				&& p[2] > b[2] - margin && p[2] < b[5] + margin) {
				return true;
			}
		}
		return false;
	}

	private static double[] at(double[] c, double[] normal, double front, double[] side, double lateral, double rise) {
		return new double[]{
			c[0] + normal[0] * front + side[0] * lateral,
			c[1] + rise,
			c[2] + normal[2] * front + side[2] * lateral
		};
	}

	/**
	 * A point of the smooth curve through a route at parameter {@code u} (0..1): a clamped quadratic B-spline, i.e.
	 * quadratic Bezier pieces joined at the midpoints of the route's legs. It starts at the first point, ends at the last
	 * one arriving along the last leg, and stays inside the corners the route cuts.
	 */
	static double[] curve(double[][] route, double u) {
		int pieces = route.length - 2;
		double x = Math.max(0.0, Math.min(1.0, u)) * pieces;
		int k = Math.min(pieces - 1, (int) Math.floor(x));
		double s = x - k;
		double[] control = route[k + 1];
		double[] start = k == 0 ? route[0] : midpoint(route[k], control);
		double[] end = k == pieces - 1 ? route[route.length - 1] : midpoint(control, route[k + 2]);
		double a = (1.0 - s) * (1.0 - s);
		double b = 2.0 * s * (1.0 - s);
		double d = s * s;
		return new double[]{
			a * start[0] + b * control[0] + d * end[0],
			a * start[1] + b * control[1] + d * end[1],
			a * start[2] + b * control[2] + d * end[2]
		};
	}

	private static double[] midpoint(double[] a, double[] b) {
		return new double[]{(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5};
	}

	static double distance(double[] a, double[] b) {
		double dx = a[0] - b[0];
		double dy = a[1] - b[1];
		double dz = a[2] - b[2];
		return Math.sqrt(dx * dx + dy * dy + dz * dz);
	}

	/** {@code degrees} wrapped to -180..180. */
	static double wrap(double degrees) {
		double d = degrees % 360.0;
		if (d >= 180.0) {
			d -= 360.0;
		} else if (d < -180.0) {
			d += 360.0;
		}
		return d;
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

	/**
	 * A planned route between an avatar's eyes and a laptop's screen camera, flown forwards by a dive and backwards by
	 * an exit. Immutable.
	 */
	public static final class Flight {
		private final Camera eye;
		private final Camera end;
		private final double[] center;
		private final double[][] route;
		/** Distance still to travel to the screen camera at each table sample (falling to 0). */
		private final double[] remaining;
		/** Yaw toward the screen centre at each table sample, unwrapped from the eye's yaw so it never jumps by 360. */
		private final double[] lookYaw;
		private final double length;
		private final double endDistance;
		/**
		 * How much of the progress is plain distance rather than zoom. Routes around the laptop pass close to it while the
		 * zoom is still fast, so half of their progress is spread evenly along the way to keep the swing round gentle.
		 */
		private final double linearShare;

		Flight(Camera eye, Camera end, double[] center, double[][] route) {
			this.eye = eye;
			this.end = end;
			this.center = center;
			this.route = route;
			this.remaining = new double[TABLE_SAMPLES + 1];
			this.lookYaw = new double[TABLE_SAMPLES + 1];
			double[] previous = curve(route, 0.0);
			double travelled = 0.0;
			double[] travelledAt = new double[TABLE_SAMPLES + 1];
			double yaw = eye.yaw();
			for (int i = 0; i <= TABLE_SAMPLES; i++) {
				double[] p = curve(route, i / (double) TABLE_SAMPLES);
				travelled += distance(previous, p);
				travelledAt[i] = travelled;
				previous = p;
				yaw += wrap(lookAt(p[0], p[1], p[2], center[0], center[1], center[2])[0] - yaw);
				lookYaw[i] = yaw;
			}
			for (int i = 0; i <= TABLE_SAMPLES; i++) {
				remaining[i] = travelled - travelledAt[i];
			}
			this.length = travelled;
			this.endDistance = distance(new double[]{end.x(), end.y(), end.z()}, center);
			this.linearShare = route.length > 3 ? 0.5 : 0.0;
		}

		/**
		 * The camera during a dive: the screen grows at a steady rate (eased at both ends), the view turns to face the
		 * screen during the first half, and the field of view swells mid-flight for a sense of speed.
		 *
		 * @param t progress 0..1 (eased here)
		 */
		public Camera dive(double t) {
			t = clamp01(t);
			return at(smoothstep(t), easeInOutCubic(clamp01(t / 0.5)), fovPulse(t, 10.0));
		}

		/**
		 * The camera pulling back out of the screen to the eyes: the dive played backwards, a little faster at the
		 * start, as if thrown out of the screen.
		 *
		 * @param t progress 0..1 (eased here)
		 */
		public Camera exit(double t) {
			t = clamp01(t);
			return at(1.0 - smoothstep(Math.pow(t, 0.8)), 1.0 - easeInOutCubic(clamp01((t - 0.3) / 0.7)), fovPulse(1.0 - t, 8.0));
		}

		/** Length of the route in blocks. */
		public double length() {
			return length;
		}

		/** The route's corner points, from the eye to the screen camera. */
		double[][] route() {
			return route;
		}

		/**
		 * The camera at {@code closeness} along the route (0 = the eye, 1 = the screen camera), with the view blended
		 * from the eye's look (turn = 0) to looking at the screen centre (turn = 1).
		 */
		private Camera at(double closeness, double turn, double fovExtra) {
			float fov = (float) (eye.fov() + (end.fov() - eye.fov()) * turn + fovExtra);
			if (closeness >= 1.0 && turn >= 1.0) {
				return new Camera(end.x(), end.y(), end.z(), end.yaw(), end.pitch(), fov);
			}
			double u = parameter(closeness);
			double[] p = curve(route, u);
			float[] look = lookAt(p[0], p[1], p[2], center[0], center[1], center[2]);
			double index = u * TABLE_SAMPLES;
			int i = Math.min(TABLE_SAMPLES - 1, (int) Math.floor(index));
			double reference = lookYaw[i] + (lookYaw[i + 1] - lookYaw[i]) * (index - i);
			double targetYaw = reference + wrap(look[0] - reference);
			float yaw = (float) (eye.yaw() + (targetYaw - eye.yaw()) * turn);
			float pitch = (float) (eye.pitch() + (look[1] - eye.pitch()) * turn);
			return new Camera(p[0], p[1], p[2], yaw, pitch, fov);
		}

		/**
		 * The curve parameter for {@code closeness}. Closeness is measured in zoom: the "distance" to the screen
		 * (distance still to travel plus the final viewing distance) shrinks geometrically, so the screen grows at a
		 * steady rate instead of creeping closer and then rushing in (blended with plain distance by
		 * {@link #linearShare}). The distance to travel only ever shrinks along the route, so this is continuous and
		 * monotonic whatever shape the route has.
		 */
		private double parameter(double closeness) {
			if (closeness <= 0.0 || length < 1.0E-6) {
				return closeness <= 0.0 ? 0.0 : 1.0;
			}
			if (closeness >= 1.0) {
				return 1.0;
			}
			double startDistance = endDistance + length;
			double geometric = startDistance * Math.pow(endDistance / startDistance, closeness) - endDistance;
			double target = geometric * (1.0 - linearShare) + length * (1.0 - closeness) * linearShare;
			// First sample whose remaining distance is at or below the target
			int lo = 0;
			int hi = TABLE_SAMPLES;
			while (lo < hi) {
				int mid = (lo + hi) >>> 1;
				if (remaining[mid] > target) {
					lo = mid + 1;
				} else {
					hi = mid;
				}
			}
			if (lo == 0) {
				return 0.0;
			}
			double before = remaining[lo - 1];
			double after = remaining[lo];
			double fraction = before > after ? (before - target) / (before - after) : 1.0;
			return (lo - 1 + fraction) / TABLE_SAMPLES;
		}
	}
}
