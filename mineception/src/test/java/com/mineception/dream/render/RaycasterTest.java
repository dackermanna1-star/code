package com.mineception.dream.render;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mineception.dream.Face;
import com.mineception.dream.LaptopGeometry;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniHit;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;

class RaycasterTest {
	private static final int W = 96;
	private static final int H = 96;
	/** Midday in the Hotel (no weather, constant interior light, so colours depend only on face shading). */
	private static final long NOON = Previews.gameTimeFor(Theme.HOTEL, 0.25);

	private final Raycaster raycaster = new Raycaster(new SyntheticTextures());

	private int[] render(MiniWorld world, Camera camera, ScreenImage child, MiniHit highlight, long time) {
		int[] out = new int[W * H];
		raycaster.render(world, camera, time, 0.0F, child, highlight, out, W, H);
		return out;
	}

	private static int pixel(int[] image, double u, double v) {
		return image[(int) (v * H) * W + (int) (u * W)];
	}

	private static int red(int c) {
		return c >> 16 & 0xFF;
	}

	private static int green(int c) {
		return c >> 8 & 0xFF;
	}

	private static int blue(int c) {
		return c & 0xFF;
	}

	/** Which of the synthetic texture's quadrant colours a lit pixel shows. */
	private static String quadrant(int c) {
		int r = red(c);
		int g = green(c);
		int b = blue(c);
		if (r > 2 * g && r > 2 * b) {
			return "TL";
		}
		if (g > 2 * r && g > 2 * b) {
			return "TR";
		}
		if (b > 2 * r && b > 2 * g) {
			return "BL";
		}
		if (Math.abs(r - g) < 20 && Math.abs(g - b) < 40 && r > 60) {
			return "BR";
		}
		return String.format("?%06X", c & 0xFFFFFF);
	}

	private static MiniWorld singleBlock(int depth, MiniBlock block) {
		MiniWorld world = new MiniWorld(depth, 1L);
		world.set(20, 10, 20, block);
		return world;
	}

	private static Camera looking(double x, double y, double z, Face direction, float pitch, float fov) {
		return new Camera(x, y, z, direction.horizontal() ? direction.yaw() : 180.0F, pitch, fov);
	}

	private void assertUpright(MiniWorld world, Camera camera, String face) {
		int[] image = render(world, camera, null, null, NOON);
		assertEquals("TL", quadrant(pixel(image, 0.38, 0.38)), face + " top-left");
		assertEquals("TR", quadrant(pixel(image, 0.62, 0.38)), face + " top-right");
		assertEquals("BL", quadrant(pixel(image, 0.38, 0.62)), face + " bottom-left");
		assertEquals("BR", quadrant(pixel(image, 0.62, 0.62)), face + " bottom-right");
	}

	@Test
	void sideFacesAreUprightAndUnmirroredLikeVanilla() {
		MiniWorld world = singleBlock(2, MiniBlock.COBBLESTONE);
		assertUpright(world, looking(20.5, 10.5, 23.0, Face.NORTH, 0.0F, 40.0F), "south face");
		assertUpright(world, looking(20.5, 10.5, 18.0, Face.SOUTH, 0.0F, 40.0F), "north face");
		assertUpright(world, looking(18.0, 10.5, 20.5, Face.EAST, 0.0F, 40.0F), "west face");
		assertUpright(world, looking(23.0, 10.5, 20.5, Face.WEST, 0.0F, 40.0F), "east face");
	}

	@Test
	void topFaceHasNorthUpAndBottomFaceSouthUp() {
		MiniWorld world = singleBlock(2, MiniBlock.COBBLESTONE);
		// Looking straight down with north at the top of the picture: vanilla puts the texture's top row at the north edge
		assertUpright(world, new Camera(20.5, 13.0, 20.5, 180.0F, 90.0F, 40.0F), "top face");
		// Looking straight up with south at the top of the picture
		assertUpright(world, new Camera(20.5, 8.0, 20.5, 180.0F, -90.0F, 40.0F), "bottom face");
	}

	@Test
	void facesAreShadedLikeMinecraft() {
		MiniWorld world = singleBlock(2, MiniBlock.COBBLESTONE);
		int top = red(pixel(render(world, new Camera(20.5, 13.0, 20.5, 180.0F, 90.0F, 40.0F), null, null, NOON), 0.38, 0.38));
		int south = red(pixel(render(world, looking(20.5, 10.5, 23.0, Face.NORTH, 0.0F, 40.0F), null, null, NOON), 0.38, 0.38));
		int west = red(pixel(render(world, looking(18.0, 10.5, 20.5, Face.EAST, 0.0F, 40.0F), null, null, NOON), 0.38, 0.38));
		int bottom = red(pixel(render(world, new Camera(20.5, 8.0, 20.5, 180.0F, -90.0F, 40.0F), null, null, NOON), 0.38, 0.38));
		assertTrue(top > south && south > west && west > bottom, top + " > " + south + " > " + west + " > " + bottom);
		assertEquals(0.8, south / (double) top, 0.05);
		assertEquals(0.6, west / (double) top, 0.05);
		assertEquals(0.5, bottom / (double) top, 0.05);
	}

	@Test
	void ambientOcclusionDarkensInnerCorners() {
		MiniWorld world = new MiniWorld(2, 1L);
		TestWorlds.fill(world, 10, 5, 10, 30, 5, 30, MiniBlock.COBBLESTONE);
		world.set(20, 6, 20, MiniBlock.COBBLESTONE);
		Camera down = new Camera(20.5, 12.0, 21.5, 180.0F, 90.0F, 40.0F);
		int[] image = render(world, down, null, null, NOON);
		// Floor cell south of the pillar: its north edge touches the pillar, its south edge is open
		double[] uvNear = projectToImage(down, 20.5, 6.0, 21.05);
		double[] uvFar = projectToImage(down, 20.5, 6.0, 21.95);
		int near = pixel(image, uvNear[0], uvNear[1]);
		int far = pixel(image, uvFar[0], uvFar[1]);
		assertTrue(brightness(near) < brightness(far) * 0.9, "corner next to the pillar should be darker: " + brightness(near) + " vs " + brightness(far));
	}

	private static double[] projectToImage(Camera camera, double x, double y, double z) {
		double[] f = camera.forward();
		double[] r = camera.right();
		double[] u = camera.up();
		double vx = x - camera.x();
		double vy = y - camera.y();
		double vz = z - camera.z();
		double depth = vx * f[0] + vy * f[1] + vz * f[2];
		double tanHalf = Math.tan(Math.toRadians(camera.fov()) * 0.5);
		double sx = (vx * r[0] + vy * r[1] + vz * r[2]) / (depth * tanHalf * ((double) W / H));
		double sy = (vx * u[0] + vy * u[1] + vz * u[2]) / (depth * tanHalf);
		return new double[]{(sx + 1.0) * 0.5, (1.0 - sy) * 0.5};
	}

	private static int brightness(int c) {
		return red(c) + green(c) + blue(c);
	}

	@Test
	void laptopScreenShowsTheChildPictureUprightForEveryFacing() {
		ScreenImage child = ScreenImage.create(32, 20);
		for (int y = 0; y < 20; y++) {
			for (int x = 0; x < 32; x++) {
				child.pixels()[y * 32 + x] = y < 10 ? (x < 16 ? SyntheticTextures.TOP_LEFT : SyntheticTextures.TOP_RIGHT)
					: (x < 16 ? SyntheticTextures.BOTTOM_LEFT : SyntheticTextures.BOTTOM_RIGHT);
			}
		}
		for (Face facing : Face.HORIZONTAL) {
			MiniWorld world = new MiniWorld(1, 1L);
			world.set(20, 10, 20, MiniBlock.LAPTOP);
			world.laptopX = 20;
			world.laptopY = 10;
			world.laptopZ = 20;
			world.laptopFacing = facing;
			double[] center = DreamCameras.screenCenter(world);
			Camera camera = new Camera(center[0] + facing.dx * 0.8, center[1], center[2] + facing.dz * 0.8,
				facing.opposite().yaw(), 0.0F, 40.0F);
			int[] image = render(world, camera, child, null, NOON);
			assertEquals(SyntheticTextures.TOP_LEFT, pixel(image, 0.42, 0.42), facing + " top-left");
			assertEquals(SyntheticTextures.TOP_RIGHT, pixel(image, 0.58, 0.42), facing + " top-right");
			assertEquals(SyntheticTextures.BOTTOM_LEFT, pixel(image, 0.42, 0.58), facing + " bottom-left");
			assertEquals(SyntheticTextures.BOTTOM_RIGHT, pixel(image, 0.58, 0.58), facing + " bottom-right");
			// Seen from behind there is no picture, just the lid
			Camera behind = new Camera(center[0] - facing.dx * 1.5, center[1], center[2] - facing.dz * 1.5, facing.yaw(), 0.0F, 40.0F);
			int back = pixel(render(world, behind, child, null, NOON), 0.42, 0.42);
			assertNotEquals(SyntheticTextures.TOP_RIGHT, back);
			assertNotEquals(SyntheticTextures.TOP_LEFT, back);
		}
	}

	@Test
	void laptopWithoutChildShowsAnimatedStatic() {
		MiniWorld world = new MiniWorld(4, 1L);
		world.set(20, 10, 20, MiniBlock.LAPTOP);
		world.laptopX = 20;
		world.laptopY = 10;
		world.laptopZ = 20;
		world.laptopFacing = Face.SOUTH;
		double[] center = DreamCameras.screenCenter(world);
		Camera camera = new Camera(center[0], center[1], center[2] + 0.5, 180.0F, 0.0F, 40.0F);
		int[] first = render(world, camera, null, null, 100L);
		int[] second = render(world, camera, null, null, 101L);
		int greys = 0;
		int changed = 0;
		for (int i = 0; i < 200; i++) {
			int c = pixel(first, 0.3 + (i % 20) * 0.02, 0.35 + (i / 20) * 0.03);
			if (Math.abs(red(c) - green(c)) < 30 && Math.abs(blue(c) - green(c)) < 30) {
				greys++;
			}
			if (c != pixel(second, 0.3 + (i % 20) * 0.02, 0.35 + (i / 20) * 0.03)) {
				changed++;
			}
		}
		assertTrue(greys > 190, "static is grey");
		assertTrue(changed > 100, "static changes every tick: " + changed);
	}

	@Test
	void camerasOutsideTheLevelSeeIt() {
		MiniWorld world = new MiniWorld(2, 1L);
		TestWorlds.fill(world, 0, 0, 0, 39, 3, 39, MiniBlock.COBBLESTONE);
		float[] look = DreamCameras.lookAt(-4.0, 9.0, -4.0, 4.0, 4.0, 4.0);
		Camera camera = new Camera(-4.0, 9.0, -4.0, look[0], look[1], 70.0F);
		int[] withWorld = render(world, camera, null, null, NOON);
		int[] empty = render(new MiniWorld(2, 1L), camera, null, null, NOON);
		assertNotEquals(pixel(empty, 0.5, 0.5), pixel(withWorld, 0.5, 0.5));
		assertFalse(quadrant(pixel(withWorld, 0.5, 0.5)).startsWith("?"), "the level's blocks fill the middle of the view");
	}

	@Test
	void concurrentRendersMatchASingleRender() throws Exception {
		MiniWorld world = TestWorlds.showcase(1);
		Camera camera = Previews.spawnCamera(world);
		ScreenImage child = ScreenImage.create(40, 25);
		raycaster.render(TestWorlds.showcase(2), Previews.spawnCamera(TestWorlds.showcase(2)), NOON, 0.3F, null, null, child.pixels(), 40, 25);
		int[] reference = new int[320 * 200];
		raycaster.render(world, camera, NOON, 0.3F, child, null, reference, 320, 200);
		ExecutorService pool = Executors.newFixedThreadPool(6);
		try {
			List<Future<int[]>> results = new ArrayList<>();
			for (int i = 0; i < 12; i++) {
				results.add(pool.submit(() -> {
					int[] out = new int[320 * 200];
					raycaster.render(world, camera, NOON, 0.3F, child, null, out, 320, 200);
					return out;
				}));
			}
			for (Future<int[]> result : results) {
				assertArrayEquals(reference, result.get());
			}
		} finally {
			pool.shutdown();
		}
	}

	@Test
	void highlightOutlinesTheBlockEdges() {
		MiniWorld world = singleBlock(2, MiniBlock.COBBLESTONE);
		Camera camera = looking(20.5, 10.5, 23.0, Face.NORTH, 0.0F, 40.0F);
		int[] plain = render(world, camera, null, null, NOON);
		int[] outlined = render(world, camera, null, new MiniHit(20, 10, 20, Face.SOUTH, MiniBlock.COBBLESTONE, 2.0), NOON);
		double[] top = projectToImage(camera, 20.5, 11.0, 21.0);
		double[] inside = projectToImage(camera, 20.5, 10.9, 21.0);
		int darkened = 0;
		for (int row = (int) (top[1] * H) - 1; row <= (int) (inside[1] * H); row++) {
			int i = row * W + W / 2;
			if (brightness(outlined[i]) < brightness(plain[i]) * 0.6) {
				darkened++;
			}
		}
		assertTrue(darkened >= 1 && darkened <= 3, "a thin line along the top edge: " + darkened);
		assertEquals(pixel(plain, 0.5, 0.5), pixel(outlined, 0.5, 0.5), "the middle of the face is not outlined");
		// Highlighting another cell changes nothing here
		int[] other = render(world, camera, null, new MiniHit(5, 5, 5, Face.UP, MiniBlock.STONE, 2.0), NOON);
		assertArrayEquals(plain, other);
	}

	@Test
	void cutoutHolesShowWhatIsBehind() {
		MiniWorld world = new MiniWorld(2, 1L);
		Camera camera = looking(20.5, 10.5, 23.0, Face.NORTH, 0.0F, 30.0F);
		int[] behind = render(world, camera, null, null, NOON);
		world.set(20, 10, 20, MiniBlock.GLASS);
		int[] image = render(world, camera, null, null, NOON);
		int holes = 0;
		int glass = 0;
		for (int i = 0; i < 16; i++) {
			int c = pixel(image, 0.42 + i * 0.01, 0.45);
			if (c == pixel(behind, 0.42 + i * 0.01, 0.45)) {
				holes++;
			} else {
				glass++;
			}
		}
		assertTrue(holes > 0 && glass > 0, "glass shows both its panes and holes: " + glass + "/" + holes);
	}

	@Test
	void waterAndIceAreTranslucent() {
		for (MiniBlock surface : new MiniBlock[]{MiniBlock.WATER, MiniBlock.ICE}) {
			MiniWorld world = new MiniWorld(2, 1L);
			TestWorlds.fill(world, 10, 5, 10, 30, 5, 30, MiniBlock.COBBLESTONE);
			TestWorlds.fill(world, 10, 6, 10, 30, 6, 30, surface);
			MiniWorld dry = new MiniWorld(2, 1L);
			TestWorlds.fill(dry, 10, 5, 10, 30, 5, 30, MiniBlock.COBBLESTONE);
			Camera down = new Camera(20.5, 10.0, 20.5, 180.0F, 90.0F, 40.0F);
			int wet = pixel(render(world, down, null, null, NOON), 0.38, 0.38);
			int bare = pixel(render(dry, down, null, null, NOON), 0.38, 0.38);
			assertNotEquals(bare, wet, surface + " should tint what is below");
			assertTrue(red(wet) > 0, surface + " should let the floor show through");
		}
	}

	@Test
	void underwaterCamerasSeeBlueHaze() {
		MiniWorld world = new MiniWorld(2, 1L);
		TestWorlds.fill(world, 0, 0, 0, 39, 3, 39, MiniBlock.COBBLESTONE);
		TestWorlds.fill(world, 0, 4, 0, 39, 8, 39, MiniBlock.WATER);
		Camera camera = new Camera(20.5, 6.0, 20.5, 0.0F, 0.0F, 70.0F);
		int c = pixel(render(world, camera, null, null, NOON), 0.5, 0.5);
		assertTrue(blue(c) > red(c), String.format("underwater haze is blue: %06X", c & 0xFFFFFF));
	}

	@Test
	void glowingBlocksAreFullBrightAtNight() {
		long midnight = Previews.gameTimeFor(Theme.FORTRESS, 0.75);
		MiniWorld world = new MiniWorld(3, 1L);
		TestWorlds.fill(world, 0, 0, 0, 39, 3, 39, MiniBlock.COBBLESTONE);
		// A roof keeps the snow out of the picture
		TestWorlds.fill(world, 8, 9, 8, 32, 9, 32, MiniBlock.COBBLESTONE);
		Camera camera = new Camera(20.5, 4.5, 21.0, 180.0F, 0.0F, 50.0F);
		world.set(20, 4, 18, MiniBlock.COBBLESTONE);
		int stone = pixel(render(world, camera, null, null, midnight), 0.4, 0.4);
		world.set(20, 4, 18, MiniBlock.GLOWSTONE);
		int lamp = pixel(render(world, camera, null, null, midnight), 0.4, 0.4);
		assertTrue(brightness(lamp) > brightness(stone) * 1.5, brightness(lamp) + " vs " + brightness(stone));
		// Full bright: the lamp's south face shows its texture at the plain 0.8 face shade (texture red = 255)
		assertEquals(Math.round(255 * 0.8F), red(lamp), 2);
	}

	@Test
	void daySkyIsBrighterThanNightSky() {
		MiniWorld world = new MiniWorld(1, 1L);
		Camera up = new Camera(20.0, 10.0, 20.0, 0.0F, -60.0F, 70.0F);
		long day = 0;
		long night = 0;
		for (int pixel : render(world, up, null, null, Previews.gameTimeFor(Theme.CITY, 0.25))) {
			day += brightness(pixel);
		}
		for (int pixel : render(world, up, null, null, Previews.gameTimeFor(Theme.CITY, 0.75))) {
			night += brightness(pixel);
		}
		assertTrue(day > night * 2, day + " vs " + night);
	}

	@Test
	void limboSunHangsLowInTheWest() {
		MiniWorld world = new MiniWorld(4, 1L);
		double angle = Theme.LIMBO.fixedTimeOfDay * Math.PI * 2.0;
		float elevation = (float) Math.toDegrees(Math.atan2(Math.sin(angle), -Math.cos(angle)));
		Camera west = new Camera(20.0, 10.0, 20.0, Face.WEST.yaw(), -elevation, 30.0F);
		int sun = pixel(render(world, west, null, null, 0L), 0.5, 0.5);
		assertTrue(red(sun) > 240 && green(sun) > 200, String.format("sun %06X", sun & 0xFFFFFF));
		Camera east = new Camera(20.0, 10.0, 20.0, Face.EAST.yaw(), -elevation, 30.0F);
		int noSun = pixel(render(world, east, null, null, 0L), 0.5, 0.5);
		assertFalse(red(noSun) > 240 && green(noSun) > 200);
	}

	@Test
	void editsRelightTheLevel() {
		MiniWorld world = new MiniWorld(2, 1L);
		TestWorlds.fill(world, 0, 0, 0, 39, 3, 39, MiniBlock.COBBLESTONE);
		Camera camera = new Camera(20.5, 8.0, 20.5, 180.0F, 90.0F, 50.0F);
		int[] before = render(world, camera, null, null, Previews.gameTimeFor(Theme.HOTEL, 0.75));
		world.set(20, 4, 20, MiniBlock.GLOWSTONE);
		int[] after = render(world, camera, null, null, Previews.gameTimeFor(Theme.HOTEL, 0.75));
		double[] next = projectToImage(camera, 21.5, 4.0, 20.5);
		assertTrue(brightness(pixel(after, next[0], next[1])) > brightness(pixel(before, next[0], next[1])));
	}

	@Test
	void screenGeometryMatchesLaptopGeometry() {
		assertEquals(LaptopGeometry.SCREEN_ASPECT, LaptopGeometry.screenWidth() / LaptopGeometry.screenHeight(), 1e-9);
	}
}
