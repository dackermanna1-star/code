package com.mineception.dream.render;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mineception.dream.LaptopGeometry;
import com.mineception.dream.MiniPlayer;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.function.DoubleSupplier;
import org.junit.jupiter.api.Test;

/**
 * Measures frame times of the raycaster (single level, and with the nested laptop screens) at the GUI resolution
 * (320x200), the in-world screen resolution (128x80) and a larger GUI (427x267), from three cameras: the idle spawn
 * view, an overview of the whole level, and the end of the dive into the laptop, where the next level's picture fills
 * almost the whole view (the most expensive case). Results go to stdout and build/preview/performance.txt.
 *
 * <p>Enforces the design target: the median nested 320x200 frame of every camera must take under 15 ms on a 4-core
 * machine (scaled up on fewer cores). A case over budget is measured twice more and its best median counts, so a
 * transient load spike on a shared machine does not fail the build while a real regression does. The budget can be
 * overridden with the environment variable {@value #BUDGET_VARIABLE} (milliseconds, or "off").
 */
class RaycasterPerformanceTest {
	static final String BUDGET_VARIABLE = "MINECEPTION_PERF_BUDGET_MS";
	/** DESIGN.md: "320×200 must render in well under 15 ms on this 4-core machine". */
	private static final double DESIGN_BUDGET_MS = 15.0;
	private static final int DESIGN_CORES = 4;
	private static final int ATTEMPTS = 3;

	/** Median frame time in milliseconds. */
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
		Arrays.sort(times);
		return times[runs / 2];
	}

	/** The budget in milliseconds, or a negative number when the check is switched off. */
	private static double budget() {
		String value = System.getenv(BUDGET_VARIABLE);
		if (value != null && !value.isBlank()) {
			return value.trim().equalsIgnoreCase("off") ? -1.0 : Double.parseDouble(value.trim());
		}
		int cores = Runtime.getRuntime().availableProcessors();
		return DESIGN_BUDGET_MS * Math.max(1.0, (double) DESIGN_CORES / cores);
	}

	/** The camera at the end of the dive: the laptop screen fills the view (as in {@code PreviewTest.laptopCloseUps}). */
	static Camera diveCamera(MiniWorld world) {
		double distance = LaptopGeometry.screenHeight() * 0.5 / Math.tan(Math.toRadians(35.0)) * 1.04;
		double[] center = DreamCameras.screenCenter(world);
		return new Camera(center[0], center[1], center[2] + distance, 180.0F, 0.0F, 70.0F);
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
		double budget = budget();
		List<String> lines = new ArrayList<>();
		lines.add("cores: " + Runtime.getRuntime().availableProcessors() + ", budget for nested 320x200 medians: "
			+ (budget < 0.0 ? "off" : String.format(Locale.ROOT, "%.1f ms", budget)));
		List<String> overBudget = new ArrayList<>();
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			MiniWorld world = worlds[depth - 1];
			long time = Previews.gameTimeFor(world.theme, 0.27);
			NestedRenderer.Levels levels = Previews.idleLevels(worlds, time, 0.0F);
			MiniPlayer avatar = new MiniPlayer();
			avatar.reset(world);
			Camera spawn = DreamCameras.idleCamera(world, avatar, time, 0.0F, DreamCameras.FOV);
			Camera overview = new Camera(36.0, 14.0, 36.0, 135.0F, 25.0F, 70.0F);
			Camera dive = diveCamera(world);
			for (int[] size : new int[][]{{320, 200}, {128, 80}, {427, 267}}) {
				int w = size[0];
				int h = size[1];
				int[] out = new int[w * h];
				double single = measure(() -> raycaster.render(world, spawn, time, 0.0F, null, null, out, w, h), 15, 31);
				String[] names = {"spawn", "overview", "dive"};
				Camera[] cameras = {spawn, overview, dive};
				StringBuilder line = new StringBuilder(String.format(Locale.ROOT, "level %d %dx%d: %.2f ms single", depth, w, h, single));
				for (int c = 0; c < cameras.length; c++) {
					Camera camera = cameras[c];
					DoubleSupplier median = () -> measure(() -> nested.render(levels, world.depth, camera, time, 0.0F, null, out, w, h), 10, 31);
					double result = median.getAsDouble();
					if (w == 320 && budget >= 0.0) {
						for (int attempt = 1; attempt < ATTEMPTS && result >= budget; attempt++) {
							result = Math.min(result, median.getAsDouble());
						}
						if (result >= budget) {
							overBudget.add(String.format(Locale.ROOT, "level %d %s view: %.2f ms", depth, names[c], result));
						}
					}
					line.append(String.format(Locale.ROOT, ", %.2f ms nested (%s)", result, names[c]));
				}
				lines.add(line.toString());
			}
		}
		lines.forEach(System.out::println);
		Files.createDirectories(Previews.OUTPUT);
		Files.write(Previews.OUTPUT.resolve("performance.txt"), lines);
		assertTrue(overBudget.isEmpty(), String.format(Locale.ROOT,
			"nested 320x200 frames must render in under %.1f ms (median); over budget: %s (set %s to override)", budget,
			overBudget, BUDGET_VARIABLE));
	}
}
