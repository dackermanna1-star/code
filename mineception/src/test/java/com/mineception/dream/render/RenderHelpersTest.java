package com.mineception.dream.render;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mineception.dream.Face;
import com.mineception.dream.LaptopGeometry;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniPlayer;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import org.junit.jupiter.api.Test;

/** Light propagation, camera helpers, adaptive child resolution and the real-world screen quad. */
class RenderHelpersTest {
	@Test
	void skyLightFallsAndSpreadsAndBlockLightFadesPerBlock() {
		MiniWorld world = new MiniWorld(1, 1L);
		TestWorlds.fill(world, 0, 0, 0, 39, 3, 39, MiniBlock.STONE);
		// A closed stone box with a glowstone inside
		TestWorlds.fill(world, 10, 4, 10, 16, 10, 16, MiniBlock.STONE);
		TestWorlds.fill(world, 11, 5, 11, 15, 9, 15, MiniBlock.AIR);
		world.set(11, 5, 11, MiniBlock.GLOWSTONE);
		LightField light = LightField.compute(world);
		assertEquals(15, light.skyAt(30, 4, 30), "open air");
		assertEquals(0, light.skyAt(13, 7, 13), "inside the closed box");
		assertEquals(14, light.blockAt(12, 5, 11));
		assertEquals(13, light.blockAt(13, 5, 11));
		assertEquals(12, light.blockAt(13, 6, 11));
		assertEquals(0, light.blockAt(30, 4, 30));
		assertEquals(11, light.height[11 * MiniWorld.SX + 11], "column height above the box");
		assertEquals(11, light.top);
		assertTrue(light.openSky(30.5, 4.5, 30.5));
		assertTrue(!light.openSky(13.5, 6.0, 13.5));
		// Light spreads in under an overhang, losing a level per block
		TestWorlds.fill(world, 20, 6, 20, 30, 6, 30, MiniBlock.STONE);
		LightField shaded = LightField.compute(world);
		assertEquals(15, shaded.skyAt(19, 4, 25));
		assertEquals(14, shaded.skyAt(20, 4, 25));
		assertEquals(10, shaded.skyAt(24, 4, 25));
	}

	@Test
	void packedGridMatchesTheLightLevels() {
		MiniWorld world = TestWorlds.showcase(1);
		LightField light = LightField.compute(world);
		for (int i = 0; i < MiniWorld.VOLUME; i += 97) {
			int x = MiniWorld.indexX(i);
			int y = MiniWorld.indexY(i);
			int z = MiniWorld.indexZ(i);
			int packed = light.packed[LightField.padded(x, y, z)];
			if (world.get(i).opaque()) {
				assertEquals(0x300, packed & 0x3FF, world.get(i) + " blocks light and occludes");
			} else {
				assertEquals(light.skyAt(x, y, z), packed >> 4 & 0xF);
				assertEquals(light.blockAt(x, y, z), packed & 0xF);
			}
		}
		assertEquals(LightField.VOID, light.packed[LightField.padded(-1, 5, 5)]);
		assertEquals(LightField.VOID, light.packed[LightField.padded(MiniWorld.SX, MiniWorld.SY, MiniWorld.SZ)]);
	}

	@Test
	void lookAtPointsTheCameraAtTheTarget() {
		float[] look = DreamCameras.lookAt(1.0, 2.0, 3.0, 4.0, 0.0, -2.0);
		double[] forward = new Camera(1.0, 2.0, 3.0, look[0], look[1], 70.0F).forward();
		double length = Math.sqrt(9 + 4 + 25);
		assertEquals(3.0 / length, forward[0], 1e-5);
		assertEquals(-2.0 / length, forward[1], 1e-5);
		assertEquals(-5.0 / length, forward[2], 1e-5);
	}

	@Test
	void idleAvatarsLookAtTheirLaptopScreen() {
		for (Face facing : Face.HORIZONTAL) {
			MiniWorld world = TestWorlds.showcase(2);
			world.laptopFacing = facing;
			MiniPlayer avatar = new MiniPlayer();
			avatar.x = avatar.xo = world.laptopX + 0.5 + facing.dx * 3.5;
			avatar.y = avatar.yo = world.laptopY - 1.0;
			avatar.z = avatar.zo = world.laptopZ + 0.5 + facing.dz * 3.5;
			Camera camera = DreamCameras.idleCamera(world, avatar, 1000L, 0.5F, 70.0F);
			double[] rect = DreamCameras.projectScreen(world, camera, 320, 200);
			assertNotNull(rect, facing.toString());
			double centerX = (rect[0] + rect[2]) * 0.5;
			double centerY = (rect[1] + rect[3]) * 0.5;
			assertEquals(160.0, centerX, 16.0, "screen near the middle of the view for " + facing);
			assertEquals(100.0, centerY, 16.0, "screen near the middle of the view for " + facing);
		}
	}

	@Test
	void childPicturesFollowTheScreenSizeOnThePicture() {
		MiniWorld world = TestWorlds.showcase(1);
		double[] center = DreamCameras.screenCenter(world);
		// Far away: a thumbnail
		Camera far = new Camera(center[0], center[1], center[2] + 12.0, 180.0F, 0.0F, 70.0F);
		int[] small = NestedRenderer.childSize(world, far, 320, 200);
		assertArrayEquals(new int[]{NestedRenderer.MIN_CHILD_WIDTH, 25}, small);
		// Filling the view (the end of the dive): as wide as the picture itself
		double distance = LaptopGeometry.screenHeight() * 0.5 / Math.tan(Math.toRadians(35.0));
		Camera dive = new Camera(center[0], center[1], center[2] + distance, 180.0F, 0.0F, 70.0F);
		int[] big = NestedRenderer.childSize(world, dive, 320, 200);
		assertTrue(big[0] >= 300 && big[0] <= 400, "dive picture width " + big[0]);
		assertEquals(Math.round(big[0] / LaptopGeometry.SCREEN_ASPECT), big[1]);
		// From behind or looking away: nothing to render
		assertNull(NestedRenderer.childSize(world, new Camera(center[0], center[1], center[2] - 3.0, 0.0F, 0.0F, 70.0F), 320, 200));
		assertNull(NestedRenderer.childSize(world, new Camera(center[0], center[1], center[2] + 3.0, 0.0F, 0.0F, 70.0F), 320, 200));
	}

	@Test
	void nestedRendererRendersEveryLevelDown() {
		MiniWorld[] worlds = new MiniWorld[Theme.DEPTHS];
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			worlds[depth - 1] = TestWorlds.showcase(depth);
		}
		int[] requested = new int[Theme.DEPTHS + 1];
		NestedRenderer.Levels base = Previews.idleLevels(worlds, 500L, 0.0F);
		NestedRenderer.Levels counting = new NestedRenderer.Levels() {
			@Override
			public MiniWorld world(int depth) {
				requested[depth]++;
				return base.world(depth);
			}

			@Override
			public Camera camera(int depth) {
				return base.camera(depth);
			}
		};
		int[] out = new int[160 * 100];
		new NestedRenderer(new Raycaster(new SyntheticTextures())).render(counting, 1, base.camera(1), 500L, 0.0F, null, out, 160, 100);
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			assertTrue(requested[depth] > 0, "level " + depth + " rendered");
		}
	}

	@Test
	void screenQuadSitsOnTheModelScreenAndFacesTheViewer() {
		for (Face facing : Face.HORIZONTAL) {
			double[][] corners = ScreenQuad.corners(facing);
			for (int i = 0; i < 4; i++) {
				double[] expected = LaptopGeometry.screenPoint(facing, ScreenQuad.u(i), ScreenQuad.v(i));
				assertEquals(expected[0] + facing.dx * ScreenQuad.OFFSET, corners[i][0], 1e-9);
				assertEquals(expected[1], corners[i][1], 1e-9);
				assertEquals(expected[2] + facing.dz * ScreenQuad.OFFSET, corners[i][2], 1e-9);
			}
			// Counter-clockwise seen from the front: the winding normal points along the facing
			double[] a = sub(corners[1], corners[0]);
			double[] b = sub(corners[2], corners[0]);
			double[] normal = {a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]};
			double dot = normal[0] * facing.dx + normal[1] * facing.dy + normal[2] * facing.dz;
			assertTrue(dot > 0.0, "front face toward " + facing);
			// Top-left corner is on the viewer's left (the viewer looks against the facing)
			double[] right = {facing.dz, 0.0, -facing.dx};
			double[] across = sub(corners[3], corners[0]);
			assertTrue(across[0] * right[0] + across[2] * right[2] > 0.7, "u grows to the viewer's right for " + facing);
			assertTrue(corners[0][1] > corners[1][1], "v grows downward");
			for (double[] corner : corners) {
				for (double c : corner) {
					assertTrue(c >= 0.0 && c <= 1.0);
				}
			}
		}
	}

	private static double[] sub(double[] a, double[] b) {
		return new double[]{a[0] - b[0], a[1] - b[1], a[2] - b[2]};
	}
}
