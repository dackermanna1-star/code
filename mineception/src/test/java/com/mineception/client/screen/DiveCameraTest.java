package com.mineception.client.screen;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mineception.dream.Face;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.render.Camera;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

/**
 * The dive and exit camera flights: they start and end exactly on the avatar's view and the screen camera, move and
 * turn smoothly from any position around the laptop (in front, beside, behind, above), and never fly through the
 * laptop or, when there is a free way round, through blocks.
 */
class DiveCameraTest {
	private static final float FOV = DiveCamera.FOV;
	private static final int LX = 20;
	private static final int LY = 6;
	private static final int LZ = 20;

	/** A floor at y=5, a desk under the laptop. */
	private static MiniWorld room(Face facing) {
		MiniWorld world = new MiniWorld(1, 0L);
		for (int x = 0; x < MiniWorld.SX; x++) {
			for (int z = 0; z < MiniWorld.SZ; z++) {
				world.set(x, 0, z, MiniBlock.BEDROCK);
				for (int y = 1; y < LY - 1; y++) {
					world.set(x, y, z, MiniBlock.STONE);
				}
			}
		}
		world.set(LX, LY - 1, LZ, MiniBlock.OAK_PLANKS);
		world.set(LX, LY, LZ, MiniBlock.LAPTOP);
		world.laptopX = LX;
		world.laptopY = LY;
		world.laptopZ = LZ;
		world.laptopFacing = facing;
		return world;
	}

	private record Stats(double maxStep, double maxTurn, double maxFovStep, double minLaptopGap, int blockedSamples) {
	}

	private static Stats fly(DiveCamera.Flight flight, MiniWorld world, boolean dive, int frames) {
		double[][] laptop = DiveCamera.laptopBoxes(world);
		Camera previous = null;
		double maxStep = 0.0;
		double maxTurn = 0.0;
		double maxFovStep = 0.0;
		double minGap = Double.MAX_VALUE;
		int blocked = 0;
		for (int i = 0; i <= frames; i++) {
			double t = i / (double) frames;
			Camera camera = dive ? flight.dive(t) : flight.exit(t);
			double[] p = {camera.x(), camera.y(), camera.z()};
			minGap = Math.min(minGap, gap(laptop, p));
			if (world.get((int) Math.floor(p[0]), (int) Math.floor(p[1]), (int) Math.floor(p[2])).solid()) {
				blocked++;
			}
			if (previous != null) {
				maxStep = Math.max(maxStep, DiveCamera.distance(p, new double[]{previous.x(), previous.y(), previous.z()}));
				maxTurn = Math.max(maxTurn, angle(previous.forward(), camera.forward()));
				maxFovStep = Math.max(maxFovStep, Math.abs(camera.fov() - previous.fov()));
			}
			previous = camera;
		}
		return new Stats(maxStep, maxTurn, maxFovStep, minGap, blocked);
	}

	/** Distance from a point to the nearest laptop box (0 inside). */
	private static double gap(double[][] boxes, double[] p) {
		double best = Double.MAX_VALUE;
		for (double[] b : boxes) {
			double dx = Math.max(0.0, Math.max(b[0] - p[0], p[0] - b[3]));
			double dy = Math.max(0.0, Math.max(b[1] - p[1], p[1] - b[4]));
			double dz = Math.max(0.0, Math.max(b[2] - p[2], p[2] - b[5]));
			best = Math.min(best, Math.sqrt(dx * dx + dy * dy + dz * dz));
		}
		return best;
	}

	private static double angle(double[] a, double[] b) {
		double dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
		return Math.toDegrees(Math.acos(Math.max(-1.0, Math.min(1.0, dot))));
	}

	/** Eyes all around the laptop: in front, beside, behind, close and far, below and above the screen. */
	private static List<Camera> eyesAround(MiniWorld world, Random random) {
		double[] center = DiveCamera.screenCenter(world);
		double[][] laptop = DiveCamera.laptopBoxes(world);
		List<Camera> eyes = new ArrayList<>();
		for (int a = 0; a < 360; a += 15) {
			for (double radius : new double[]{0.7, 1.1, 1.6, 2.4, 3.5, 5.5}) {
				for (double height : new double[]{-0.4, 0.62, 1.62, 2.62}) {
					double x = LX + 0.5 + radius * Math.cos(Math.toRadians(a));
					double z = LZ + 0.5 + radius * Math.sin(Math.toRadians(a));
					double y = LY + height;
					if (DiveCamera.insideAny(laptop, new double[]{x, y, z}, 0.15)
						|| world.get((int) Math.floor(x), (int) Math.floor(y), (int) Math.floor(z)).solid()) {
						continue;
					}
					float[] look = DiveCamera.lookAt(x, y, z, center[0], center[1], center[2]);
					eyes.add(new Camera(x, y, z, look[0], look[1], FOV));
					// Someone who turned around (or spun the mouse a few times) before the dive
					eyes.add(new Camera(x, y, z, look[0] + 360.0F * (random.nextInt(5) - 2) + (random.nextFloat() - 0.5F) * 300.0F,
						(random.nextFloat() - 0.5F) * 170.0F, FOV * (1.0F + random.nextFloat() * 0.15F)));
				}
			}
		}
		return eyes;
	}

	@Test
	void flightsAreSmoothFromEverywhereForAllFacings() {
		Random random = new Random(7);
		int frames = 2000;
		int flights = 0;
		for (Face facing : Face.HORIZONTAL) {
			MiniWorld world = room(facing);
			for (Camera eye : eyesAround(world, random)) {
				DiveCamera.Flight flight = DiveCamera.plan(eye, world, FOV);
				// The eyes that just clicked the laptop look at it; the others look anywhere and turn further
				boolean lookingAtLaptop = eye.fov() == FOV;
				for (boolean dive : new boolean[]{true, false}) {
					Stats stats = fly(flight, world, dive, frames);
					flights++;
					String what = (dive ? "dive" : "exit") + " " + facing + " from " + eye + " via " + routeString(flight) + ": " + stats;
					// At most a fifth of a percent of the route per step: a few times the average, never a jump
					assertTrue(stats.maxStep() <= 0.002 * Math.max(1.0, flight.length()), what);
					assertTrue(stats.maxTurn() <= (lookingAtLaptop ? 0.8 : 1.5), what);
					assertTrue(stats.maxFovStep() <= 0.05, what);
					assertTrue(stats.minLaptopGap() >= 0.08, what);
					assertEquals(0, stats.blockedSamples(), what);
				}
			}
		}
		assertTrue(flights > 4000, "too few flights checked: " + flights);
	}

	/** The two eyes behind a laptop that made the old single-curve flight jump 0.77 blocks and flip the view. */
	@Test
	void behindTheLaptopAtEightyFramesPerSecond() {
		int frames = LaptopScreen.DIVE_TICKS * 4;
		for (Face facing : Face.HORIZONTAL) {
			MiniWorld world = room(facing);
			double[] center = DiveCamera.screenCenter(world);
			for (double back : new double[]{3.25, 0.85}) {
				double x = LX + 0.5 - facing.dx * back;
				double z = LZ + 0.5 - facing.dz * back;
				double y = LY + 0.62;
				float[] look = DiveCamera.lookAt(x, y, z, center[0], center[1], center[2]);
				Camera eye = new Camera(x, y, z, look[0], look[1], FOV);
				DiveCamera.Flight flight = DiveCamera.plan(eye, world, FOV);
				for (boolean dive : new boolean[]{true, false}) {
					Stats stats = fly(flight, world, dive, frames);
					String what = facing + " " + back + " behind, " + (dive ? "dive" : "exit") + ": " + stats;
					assertTrue(stats.maxStep() < 0.2, what);
					assertTrue(stats.maxTurn() < 8.0, what);
					assertTrue(stats.minLaptopGap() > 0.08, what);
				}
			}
		}
	}

	@Test
	void flightsStartAndEndExactlyOnTheViews() {
		for (Face facing : Face.HORIZONTAL) {
			MiniWorld world = room(facing);
			Camera screen = DiveCamera.screenCamera(world, FOV);
			for (Camera eye : eyesAround(world, new Random(3))) {
				DiveCamera.Flight flight = DiveCamera.plan(eye, world, FOV);
				assertSameView(eye, flight.dive(0.0));
				assertSameView(screen, flight.dive(1.0));
				assertSameView(screen, flight.exit(0.0));
				assertSameView(eye, flight.exit(1.0));
			}
		}
	}

	private static void assertSameView(Camera expected, Camera actual) {
		assertEquals(expected.x(), actual.x(), 1.0E-9, () -> expected + " vs " + actual);
		assertEquals(expected.y(), actual.y(), 1.0E-9, () -> expected + " vs " + actual);
		assertEquals(expected.z(), actual.z(), 1.0E-9, () -> expected + " vs " + actual);
		assertEquals(0.0, DiveCamera.wrap(expected.yaw() - actual.yaw()), 1.0E-3, () -> expected + " vs " + actual);
		assertEquals(expected.pitch(), actual.pitch(), 1.0E-3, () -> expected + " vs " + actual);
		assertEquals(expected.fov(), actual.fov(), 1.0E-4, () -> expected + " vs " + actual);
	}

	/** The screen camera sees exactly the laptop screen: its top and bottom edges at the edges of the view. */
	@Test
	void screenCameraFillsTheViewWithTheScreen() {
		for (Face facing : Face.HORIZONTAL) {
			MiniWorld world = room(facing);
			Camera camera = DiveCamera.screenCamera(world, FOV);
			double[] forward = camera.forward();
			double[] center = DiveCamera.screenCenter(world);
			double[] toCenter = {center[0] - camera.x(), center[1] - camera.y(), center[2] - camera.z()};
			double length = Math.sqrt(toCenter[0] * toCenter[0] + toCenter[1] * toCenter[1] + toCenter[2] * toCenter[2]);
			assertEquals(0.0, angle(forward, new double[]{toCenter[0] / length, toCenter[1] / length, toCenter[2] / length}), 1.0E-3);
			double top = Math.toDegrees(Math.atan2(com.mineception.dream.LaptopGeometry.screenHeight() * 0.5, length));
			assertEquals(FOV * 0.5, top, 1.0E-3);
		}
	}

	/** With a wall beside and behind the laptop on one side, the camera comes round the other side. */
	@Test
	void comesRoundTheFreeSide() {
		for (Face facing : Face.HORIZONTAL) {
			MiniWorld world = room(facing);
			int sideX = -facing.dz;
			int sideZ = facing.dx;
			for (int along = -4; along <= 1; along++) {
				for (int out = 1; out <= 3; out++) {
					for (int y = LY - 1; y <= LY + 3; y++) {
						world.set(LX + sideX * out + facing.dx * along, y, LZ + sideZ * out + facing.dz * along, MiniBlock.STONE_BRICKS);
					}
				}
			}
			double[] center = DiveCamera.screenCenter(world);
			double x = LX + 0.5 - facing.dx * 3.0;
			double z = LZ + 0.5 - facing.dz * 3.0;
			double y = LY + 0.62;
			float[] look = DiveCamera.lookAt(x, y, z, center[0], center[1], center[2]);
			DiveCamera.Flight flight = DiveCamera.plan(new Camera(x, y, z, look[0], look[1], FOV), world, FOV);
			for (boolean dive : new boolean[]{true, false}) {
				Stats stats = fly(flight, world, dive, 2000);
				assertEquals(0, stats.blockedSamples(), facing + " " + routeString(flight) + " " + stats);
				assertTrue(stats.minLaptopGap() > 0.08, facing + " " + stats);
			}
		}
	}

	/** From the foot of a pillar the laptop stands on, the camera climbs instead of flying through the pillar. */
	@Test
	void climbsFromBelowTheLaptop() {
		for (Face facing : Face.HORIZONTAL) {
			MiniWorld world = room(facing);
			world.set(LX, LY + 2, LZ, MiniBlock.LAPTOP);
			world.set(LX, LY, LZ, MiniBlock.SAND);
			world.set(LX, LY + 1, LZ, MiniBlock.SAND);
			for (int dx = -1; dx <= 1; dx++) {
				for (int dz = -1; dz <= 1; dz++) {
					for (int y = LY - 1; y <= LY + 1; y++) {
						world.set(LX + dx, y, LZ + dz, MiniBlock.SAND);
					}
				}
			}
			world.laptopY = LY + 2;
			double[] center = DiveCamera.screenCenter(world);
			for (int a = 0; a < 360; a += 30) {
				double x = LX + 0.5 + 2.0 * Math.cos(Math.toRadians(a));
				double z = LZ + 0.5 + 2.0 * Math.sin(Math.toRadians(a));
				double y = LY + 0.62;
				if (world.get((int) Math.floor(x), (int) Math.floor(y), (int) Math.floor(z)).solid()) {
					continue;
				}
				float[] look = DiveCamera.lookAt(x, y, z, center[0], center[1], center[2]);
				DiveCamera.Flight flight = DiveCamera.plan(new Camera(x, y, z, look[0], look[1], FOV), world, FOV);
				Stats stats = fly(flight, world, true, 2000);
				assertEquals(0, stats.blockedSamples(), facing + " at " + a + ": " + routeString(flight) + " " + stats);
				assertTrue(stats.minLaptopGap() > 0.08, facing + " " + stats);
				assertTrue(stats.maxStep() <= 0.002 * Math.max(1.0, flight.length()), facing + " " + stats);
			}
		}
	}

	/**
	 * The monitor and the pictures on the laptop screens must use the same field of view and the same screen centre,
	 * or the last frame of a dive stops matching the first frame of the next level. The renderer's camera helpers are
	 * looked up by name so this test also guards the integrated build.
	 */
	@Test
	void agreesWithTheRendererCameras() throws ReflectiveOperationException {
		Class<?> cameras;
		try {
			cameras = Class.forName("com.mineception.dream.render.DreamCameras");
		} catch (ClassNotFoundException e) {
			Assumptions.abort("the renderer's DreamCameras is not part of this build");
			return;
		}
		Field fov = cameras.getField("FOV");
		assertEquals(fov.getFloat(null), DiveCamera.FOV, "DiveCamera.FOV (the monitor) must equal DreamCameras.FOV (the laptop pictures)");
		assertEquals(fov.getFloat(null), LaptopScreen.FOV, "LaptopScreen.FOV must equal DreamCameras.FOV");
		Method screenCenter = cameras.getMethod("screenCenter", MiniWorld.class);
		Method lookAt = cameras.getMethod("lookAt", double.class, double.class, double.class, double.class, double.class, double.class);
		Random random = new Random(11);
		for (Face facing : Face.HORIZONTAL) {
			MiniWorld world = room(facing);
			double[] theirs = (double[]) screenCenter.invoke(null, world);
			double[] ours = DiveCamera.screenCenter(world);
			for (int i = 0; i < 3; i++) {
				assertEquals(theirs[i], ours[i], 1.0E-12, "screen centre of a " + facing + " laptop");
			}
			for (int i = 0; i < 20; i++) {
				double[] p = {random.nextDouble() * 40, random.nextDouble() * 32, random.nextDouble() * 40};
				float[] theirLook = (float[]) lookAt.invoke(null, p[0], p[1], p[2], ours[0], ours[1], ours[2]);
				float[] ourLook = DiveCamera.lookAt(p[0], p[1], p[2], ours[0], ours[1], ours[2]);
				assertEquals(0.0, DiveCamera.wrap(theirLook[0] - ourLook[0]), 1.0E-4);
				assertEquals(theirLook[1], ourLook[1], 1.0E-4);
			}
		}
	}

	private static String routeString(DiveCamera.Flight flight) {
		StringBuilder out = new StringBuilder();
		for (double[] p : flight.route()) {
			out.append(String.format("(%.2f %.2f %.2f)", p[0], p[1], p[2]));
		}
		return out.toString();
	}
}
