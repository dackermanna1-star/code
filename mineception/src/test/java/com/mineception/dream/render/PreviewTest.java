package com.mineception.dream.render;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.mineception.dream.Face;
import com.mineception.dream.LaptopGeometry;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniHit;
import com.mineception.dream.MiniPlayer;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import com.mineception.dream.WorldGen;
import java.util.Optional;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Offline preview: renders the levels with the real textures from the Minecraft jar into PNGs under build/preview
 * (spawn views with the nested laptop screens, a hand-built showcase level at several times of day, close-ups of
 * the screens, thumbnails, underwater, the highlight outline). Skipped when the client jar is not available.
 */
class PreviewTest {
	private static JarTextureSource textures;
	private static NestedRenderer renderer;

	@BeforeAll
	static void open() {
		Optional<JarTextureSource> source = JarTextureSource.open();
		textures = source.orElse(null);
		if (textures != null) {
			renderer = new NestedRenderer(new Raycaster(textures));
		}
	}

	@AfterAll
	static void close() throws Exception {
		if (textures != null) {
			textures.close();
		}
	}

	private static MiniWorld[] generated(long seed) {
		MiniWorld[] worlds = new MiniWorld[Theme.DEPTHS];
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			worlds[depth - 1] = WorldGen.generate(seed, depth);
		}
		return worlds;
	}

	private static MiniWorld[] showcase() {
		MiniWorld[] worlds = new MiniWorld[Theme.DEPTHS];
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			worlds[depth - 1] = TestWorlds.showcase(depth);
		}
		return worlds;
	}

	private static int[] render(MiniWorld[] worlds, int depth, Camera camera, long gameTime, MiniHit highlight, int width, int height) {
		int[] out = new int[width * height];
		NestedRenderer.Levels levels = Previews.idleLevels(worlds, gameTime, 0.0F);
		renderer.render(levels, depth, camera, gameTime, 0.0F, highlight, out, width, height);
		return out;
	}

	@Test
	void generatedLevelsFromSpawn() {
		assumeTrue(textures != null, "Minecraft client jar not found");
		MiniWorld[] worlds = generated(0x5EEDL);
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			MiniWorld world = worlds[depth - 1];
			long time = Previews.gameTimeFor(world.theme, 0.2);
			MiniPlayer avatar = new MiniPlayer();
			avatar.reset(world);
			Camera camera = DreamCameras.idleCamera(world, avatar, time, 0.0F, DreamCameras.FOV);
			int[] out = render(worlds, depth, camera, time, null, 320, 200);
			Previews.write("generated_level" + depth, out, 320, 200, 2);
		}
	}

	@Test
	void showcaseAtDifferentTimes() {
		assumeTrue(textures != null, "Minecraft client jar not found");
		MiniWorld[] worlds = showcase();
		double[] times = {0.02, 0.25, 0.49, 0.75};
		String[] names = {"sunrise", "noon", "sunset", "night"};
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			MiniWorld world = worlds[depth - 1];
			for (int i = 0; i < times.length; i++) {
				if (world.theme.dayLengthTicks <= 0 && i > 0) {
					break;
				}
				long time = Previews.gameTimeFor(world.theme, times[i]);
				int[] out = render(worlds, depth, Previews.spawnCamera(world), time, null, 320, 200);
				Previews.write("showcase_level" + depth + "_" + names[i], out, 320, 200, 2);
			}
		}
	}

	@Test
	void showcaseViews() {
		assumeTrue(textures != null, "Minecraft client jar not found");
		MiniWorld[] worlds = showcase();
		MiniWorld world = worlds[0];
		Theme theme = Theme.FORTRESS;
		MiniWorld fortress = worlds[2];
		long noon = Previews.gameTimeFor(theme, 0.27);
		// Overview from above the south-east corner
		Camera overview = new Camera(34.5, 17.0, 34.5, 135.0F, 32.0F, 70.0F);
		Previews.write("view_overview", render(worlds, 3, overview, noon, null, 320, 200), 320, 200, 2);
		// The palette wall from the north (its north faces) and from the south (its south faces)
		Camera paletteNorth = new Camera(20.5, 7.6, 25.5, 0.0F, 12.0F, 70.0F);
		Previews.write("view_palette_north", render(worlds, 3, paletteNorth, noon, null, 320, 200), 320, 200, 2);
		Camera paletteSouth = new Camera(20.5, 7.6, 35.5, 180.0F, 12.0F, 70.0F);
		Previews.write("view_palette_south", render(worlds, 3, paletteSouth, noon, null, 320, 200), 320, 200, 2);
		// Looking east and west along the wall (end faces), and down at the tops
		Camera paletteTop = new Camera(9.5, 10.5, 33.0, 160.0F, 55.0F, 70.0F);
		Previews.write("view_palette_top", render(worlds, 3, paletteTop, noon, null, 320, 200), 320, 200, 2);
		Camera side = new Camera(26.5, 6.6, 21.0, 125.0F, 8.0F, 70.0F);
		Previews.write("view_desk_side", render(worlds, 3, side, noon, null, 320, 200), 320, 200, 2);
		// Inside the house, lamp-lit, at night in the city
		long night = Previews.gameTimeFor(Theme.CITY, 0.75);
		Camera inside = new Camera(20.5, 6.62, 12.0, 180.0F, 8.0F, 70.0F);
		Previews.write("view_house_night", render(worlds, 1, inside, night, null, 320, 200), 320, 200, 2);
		Camera street = new Camera(28.5, 6.62, 26.5, 135.0F, 10.0F, 70.0F);
		Previews.write("view_street_night", render(worlds, 1, street, night, null, 320, 200), 320, 200, 2);
		// Underwater in the pond, and from above the pond
		Camera underwater = new Camera(9.0, 3.6, 22.4, 160.0F, -10.0F, 70.0F);
		Previews.write("view_underwater", render(worlds, 3, underwater, noon, null, 320, 200), 320, 200, 2);
		Camera pond = new Camera(14.5, 7.8, 24.5, 135.0F, 35.0F, 70.0F);
		Previews.write("view_pond", render(worlds, 3, pond, noon, null, 320, 200), 320, 200, 2);
		long cityNoon = Previews.gameTimeFor(Theme.CITY, 0.27);
		Camera pondCity = new Camera(13.5, 8.5, 25.5, 145.0F, 42.0F, 70.0F);
		Previews.write("view_pond_city", render(worlds, 1, pondCity, cityNoon, null, 320, 200), 320, 200, 2);
		// Highlight on the crafting table next to the desk, and on the laptop
		Camera spawn = Previews.spawnCamera(fortress);
		MiniHit table = new MiniHit(22, 5, 18, Face.SOUTH, MiniBlock.CRAFTING_TABLE, 4.0);
		Previews.write("view_highlight_block", render(worlds, 3, spawn, noon, table, 320, 200), 320, 200, 2);
		MiniHit laptop = new MiniHit(20, 6, 18, Face.SOUTH, MiniBlock.LAPTOP, 4.0);
		Previews.write("view_highlight_laptop", render(worlds, 3, spawn, noon, laptop, 320, 200), 320, 200, 2);
		assertTrue(world.theme == Theme.CITY);
	}

	@Test
	void laptopCloseUps() {
		assumeTrue(textures != null, "Minecraft client jar not found");
		MiniWorld[] worlds = showcase();
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			MiniWorld world = worlds[depth - 1];
			long time = Previews.gameTimeFor(world.theme, 0.3);
			// Where the dive ends: the screen fills the view
			double distance = LaptopGeometry.screenHeight() * 0.5 / Math.tan(Math.toRadians(35.0)) * 1.04;
			double[] center = DreamCameras.screenCenter(world);
			Camera dive = new Camera(center[0], center[1], center[2] + distance, 180.0F, 0.0F, 70.0F);
			Previews.write("closeup_dive_level" + depth, render(worlds, depth, dive, time, null, 320, 200), 320, 200, 2);
			// Halfway through the dive
			Camera half = new Camera(center[0], center[1] + 0.4, center[2] + 1.3, 180.0F, 17.0F, 70.0F);
			Previews.write("closeup_half_level" + depth, render(worlds, depth, half, time, null, 320, 200), 320, 200, 2);
		}
	}

	@Test
	void thumbnails() {
		assumeTrue(textures != null, "Minecraft client jar not found");
		for (MiniWorld[] worlds : new MiniWorld[][]{showcase(), generated(77L)}) {
			String prefix = worlds[0].seed == 77L ? "generated" : "showcase";
			MiniWorld world = worlds[0];
			long time = Previews.gameTimeFor(world.theme, 0.27);
			MiniPlayer avatar = new MiniPlayer();
			avatar.reset(world);
			Camera camera = DreamCameras.idleCamera(world, avatar, time, 0.0F, DreamCameras.FOV);
			Previews.write(prefix + "_thumb_128x80", render(worlds, 1, camera, time, null, 128, 80), 128, 80, 4);
			Previews.write(prefix + "_thumb_40x25", render(worlds, 1, camera, time, null, 40, 25), 40, 25, 8);
		}
	}
}
