package com.mineception.dream.render;

import com.mineception.dream.LaptopGeometry;
import com.mineception.dream.MiniHit;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;

/**
 * Renders a dream level with the deeper levels on its laptop screen: before drawing level d, the level d+1 picture is
 * rendered (recursively) at the resolution the screen actually covers in level d's picture, so a far-away laptop costs
 * a thumbnail while a screen filling the view (the dive) gets a full-resolution picture. Level 4's laptop shows static.
 *
 * <p>Thread-safe; the intermediate pictures live in per-thread buffers.
 */
public final class NestedRenderer {
	/** Smallest picture rendered for a visible laptop screen (keeps far screens recognisable). */
	public static final int MIN_CHILD_WIDTH = 40;
	/** Largest picture rendered for a laptop screen. */
	public static final int MAX_CHILD_WIDTH = 640;
	private static final ScreenImage HIDDEN = new ScreenImage(new int[]{0xFF000000}, 1, 1);
	private static final ThreadLocal<int[][]> BUFFERS = ThreadLocal.withInitial(() -> new int[Theme.DEPTHS + 2][]);

	/** The levels being rendered and where their avatars look from. */
	public interface Levels {
		MiniWorld world(int depth);

		/** Camera of level {@code depth}'s avatar, used when that level shows on the laptop one level up. */
		Camera camera(int depth);
	}

	private final Raycaster raycaster;

	public NestedRenderer(Raycaster raycaster) {
		this.raycaster = raycaster;
	}

	public Raycaster raycaster() {
		return raycaster;
	}

	/** Renders level {@code depth} seen by {@code camera} into {@code out}, with the deeper levels on its laptop. */
	public void render(Levels levels, int depth, Camera camera, long gameTime, float partialTick, MiniHit highlight, int[] out,
					   int width, int height) {
		MiniWorld world = levels.world(depth);
		ScreenImage child = null;
		if (depth < Theme.DEPTHS) {
			int[] size = childSize(world, camera, width, height);
			if (size == null) {
				child = HIDDEN;
			} else {
				int[] buffer = buffer(depth + 1, size[0] * size[1]);
				render(levels, depth + 1, levels.camera(depth + 1), gameTime, partialTick, null, buffer, size[0], size[1]);
				child = new ScreenImage(buffer, size[0], size[1]);
			}
		}
		raycaster.render(world, camera, gameTime, partialTick, child, highlight, out, width, height);
	}

	/**
	 * Size {width, height} of the picture to render for the laptop screen of {@code world} as seen in a
	 * {@code width x height} picture from {@code camera}, or null if the screen is not in view.
	 */
	public static int[] childSize(MiniWorld world, Camera camera, int width, int height) {
		double[] rect = DreamCameras.projectScreen(world, camera, width, height);
		if (rect == null || rect[2] < 0.0 || rect[0] > width || rect[3] < 0.0 || rect[1] > height) {
			return null;
		}
		double projected = Math.max(rect[2] - rect[0], (rect[3] - rect[1]) * LaptopGeometry.SCREEN_ASPECT);
		int limit = Math.max(MIN_CHILD_WIDTH, Math.min(MAX_CHILD_WIDTH, (int) (width * 1.25)));
		int childWidth = (int) Math.ceil(projected / 8.0) * 8;
		childWidth = Math.max(MIN_CHILD_WIDTH, Math.min(limit, childWidth));
		int childHeight = Math.max(1, (int) Math.round(childWidth / LaptopGeometry.SCREEN_ASPECT));
		return new int[]{childWidth, childHeight};
	}

	private static int[] buffer(int depth, int size) {
		int[][] buffers = BUFFERS.get();
		int[] buffer = buffers[depth];
		if (buffer == null || buffer.length < size) {
			buffer = new int[size];
			buffers[depth] = buffer;
		}
		return buffer;
	}
}
