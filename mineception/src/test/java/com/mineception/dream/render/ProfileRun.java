package com.mineception.dream.render;

import com.mineception.dream.MiniPlayer;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;

/** Manual profiling entry point: renders nested 320x200 frames of every level in a loop (run under a profiler). */
final class ProfileRun {
	private ProfileRun() {
	}

	public static void main(String[] args) throws Exception {
		int seconds = args.length > 0 ? Integer.parseInt(args[0]) : 20;
		TextureSource textures = JarTextureSource.open().<TextureSource>map(t -> t).orElseGet(SyntheticTextures::new);
		NestedRenderer nested = new NestedRenderer(new Raycaster(textures));
		MiniWorld[] worlds = new MiniWorld[Theme.DEPTHS];
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			worlds[depth - 1] = TestWorlds.showcase(depth);
		}
		int[] out = new int[320 * 200];
		long end = System.nanoTime() + seconds * 1_000_000_000L;
		long frames = 0;
		while (System.nanoTime() < end) {
			for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
				MiniWorld world = worlds[depth - 1];
				long time = Previews.gameTimeFor(world.theme, 0.27) + frames;
				NestedRenderer.Levels levels = Previews.idleLevels(worlds, time, 0.0F);
				MiniPlayer avatar = new MiniPlayer();
				avatar.reset(world);
				Camera camera = DreamCameras.idleCamera(world, avatar, time, 0.0F, DreamCameras.FOV);
				nested.render(levels, depth, camera, time, 0.0F, null, out, 320, 200);
				frames++;
			}
		}
		System.out.println("frames: " + frames + " (" + (seconds * 1000.0 / frames) + " ms each)");
	}
}
