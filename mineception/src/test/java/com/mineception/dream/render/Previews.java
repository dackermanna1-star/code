package com.mineception.dream.render;

import com.mineception.dream.MiniPlayer;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import javax.imageio.ImageIO;

/** Shared helpers of the offline preview: levels with idle avatars at their spawns, times of day, PNG output. */
final class Previews {
	static final Path OUTPUT = Paths.get("build", "preview");

	private Previews() {
	}

	/** Levels whose avatars stand at their spawn points looking at their laptops. */
	static NestedRenderer.Levels idleLevels(MiniWorld[] worlds, long gameTime, float partialTick) {
		MiniPlayer[] avatars = new MiniPlayer[worlds.length];
		for (int i = 0; i < worlds.length; i++) {
			avatars[i] = new MiniPlayer();
			avatars[i].reset(worlds[i]);
		}
		return new NestedRenderer.Levels() {
			@Override
			public MiniWorld world(int depth) {
				return worlds[depth - 1];
			}

			@Override
			public Camera camera(int depth) {
				return DreamCameras.idleCamera(worlds[depth - 1], avatars[depth - 1], gameTime, partialTick, DreamCameras.FOV);
			}
		};
	}

	/** Game time at which a theme shows a time of day (0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight). */
	static long gameTimeFor(Theme theme, double timeOfDay) {
		if (theme.dayLengthTicks <= 0) {
			return 1000L;
		}
		double cycle = ((timeOfDay - 0.1) % 1.0 + 1.0) % 1.0;
		return Math.round(cycle * theme.dayLengthTicks) + theme.dayLengthTicks * 10L;
	}

	static Camera spawnCamera(MiniWorld world) {
		return new Camera(world.spawnX, world.spawnY + MiniPlayer.EYE_HEIGHT, world.spawnZ, world.spawnYaw, world.spawnPitch,
			DreamCameras.FOV);
	}

	/** Writes the picture and a nearest-neighbour enlarged copy (easier to inspect) under build/preview. */
	static void write(String name, int[] argb, int width, int height, int scale) {
		try {
			Files.createDirectories(OUTPUT);
			BufferedImage image = new BufferedImage(width * scale, height * scale, BufferedImage.TYPE_INT_ARGB);
			for (int y = 0; y < height * scale; y++) {
				for (int x = 0; x < width * scale; x++) {
					image.setRGB(x, y, argb[(y / scale) * width + x / scale] | 0xFF000000);
				}
			}
			ImageIO.write(image, "png", OUTPUT.resolve(name + ".png").toFile());
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}
}
