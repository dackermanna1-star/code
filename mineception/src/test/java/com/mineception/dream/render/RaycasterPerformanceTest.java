package com.mineception.dream.render;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mineception.dream.MiniPlayer;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;

/**
 * Measures frame times of the raycaster (single level, and with the nested laptop screens) at the GUI resolution
 * (320x200) and the in-world screen resolution (128x80). Results go to stdout and build/preview/performance.txt.
 * The assertion is deliberately loose (shared CI machines); the design target is well under 15 ms at 320x200.
 */
class RaycasterPerformanceTest {
	private static double measure(Runnable frame, int warmup, int runs) {
		for (int i = 0; i < warmup; i++) {
			frame.run();
		}
		double[] times = new double[runs];
		for (int i = 0; i < runs; i++) {
			long start = System.nanoTime();
			frame.run();
			times[i] = (System.nanoTime() - start) / 1e6;
		}
		java.util.Arrays.sort(times);
		return times[runs / 2];
	}

	@Test
	void frameTimes() throws IOException {
		TextureSource textures = JarTextureSource.open().<TextureSource>map(t -> t).orElseGet(SyntheticTextures::new);
		Raycaster raycaster = new Raycaster(textures);
		NestedRenderer nested = new NestedRenderer(raycaster);
		MiniWorld[] worlds = new MiniWorld[Theme.DEPTHS];
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			worlds[depth - 1] = TestWorlds.showcase(depth);
		}
		List<String> lines = new ArrayList<>();
		lines.add("cores: " + Runtime.getRuntime().availableProcessors());
		double worst = 0.0;
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			MiniWorld world = worlds[depth - 1];
			long time = Previews.gameTimeFor(world.theme, 0.27);
			NestedRenderer.Levels levels = Previews.idleLevels(worlds, time, 0.0F);
			MiniPlayer avatar = new MiniPlayer();
			avatar.reset(world);
			Camera camera = DreamCameras.idleCamera(world, avatar, time, 0.0F, DreamCameras.FOV);
			Camera overview = new Camera(36.0, 14.0, 36.0, 135.0F, 25.0F, 70.0F);
			for (int[] size : new int[][]{{320, 200}, {128, 80}, {427, 267}}) {
				int w = size[0];
				int h = size[1];
				int[] out = new int[w * h];
				double single = measure(() -> raycaster.render(world, camera, time, 0.0F, null, null, out, w, h), 15, 31);
				double withChildren = measure(() -> nested.render(levels, world.depth, camera, time, 0.0F, null, out, w, h), 15, 31);
				double far = measure(() -> nested.render(levels, world.depth, overview, time, 0.0F, null, out, w, h), 10, 21);
				lines.add(String.format(Locale.ROOT, "level %d %dx%d: %.2f ms single, %.2f ms nested (spawn view), %.2f ms nested (overview)",
					depth, w, h, single, withChildren, far));
				if (w == 320) {
					worst = Math.max(worst, Math.max(withChildren, far));
				}
			}
		}
		lines.forEach(System.out::println);
		Files.createDirectories(Previews.OUTPUT);
		Files.write(Previews.OUTPUT.resolve("performance.txt"), lines);
		assertTrue(worst < 60.0, "320x200 frames should render in a few milliseconds, worst was " + worst + " ms");
	}
}
