package com.mineception.dream.render;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mineception.dream.Face;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.Theme;
import java.util.Arrays;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

/**
 * Resource reloads racing a background render: textures built from the images of before a reload must never stay in
 * use after it.
 */
class TextureInvalidationTest {
	/** Solid textures in the colour of the current "resource pack"; can hold one texture() call until released. */
	private static final class PackTextures implements TextureSource {
		volatile int color = 0xFF111111;
		final CountDownLatch entered = new CountDownLatch(1);
		final CountDownLatch release = new CountDownLatch(1);
		volatile boolean blockNext;

		@Override
		public int[] texture(MiniBlock block, Face face, Theme theme) {
			int[] texture = new int[SIZE * SIZE];
			Arrays.fill(texture, color);
			if (blockNext) {
				blockNext = false;
				entered.countDown();
				try {
					assertTrue(release.await(10, TimeUnit.SECONDS));
				} catch (InterruptedException e) {
					throw new AssertionError(e);
				}
			}
			return texture;
		}
	}

	@Test
	void aTableBuiltAcrossAReloadIsNotKept() throws Exception {
		PackTextures pack = new PackTextures();
		Raycaster raycaster = new Raycaster(pack);
		int stone = MiniBlock.STONE.id * 6 + Face.UP.ordinal();
		assertEquals(0xFF111111, raycaster.textureTable(Theme.CITY)[stone][0]);

		raycaster.invalidateTextures();
		pack.blockNext = true;
		// A background render starts building the City's table from the old pack ...
		CompletableFuture<int[][]> background = CompletableFuture.supplyAsync(() -> raycaster.textureTable(Theme.CITY));
		assertTrue(pack.entered.await(10, TimeUnit.SECONDS));
		// ... when the resource packs change
		pack.color = 0xFF222222;
		raycaster.invalidateTextures();
		pack.release.countDown();
		background.get(10, TimeUnit.SECONDS);

		int[][] table = raycaster.textureTable(Theme.CITY);
		for (MiniBlock block : MiniBlock.values()) {
			if (block.kind == MiniBlock.Kind.AIR || block.kind == MiniBlock.Kind.SPECIAL) {
				continue;
			}
			for (Face face : Face.values()) {
				assertEquals(0xFF222222, table[block.id * 6 + face.ordinal()][0], block + " " + face + " is from before the reload");
			}
		}
		assertTrue(table == raycaster.textureTable(Theme.CITY), "the fresh table is cached");
	}

	@Test
	void imageCachesAreNotRefilledFromBeforeAClear() throws Exception {
		CountDownLatch entered = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		int[] pack = {0xFF111111};
		boolean[] blockNext = {true};
		ImageTextureSource source = new ImageTextureSource() {
			@Override
			protected BlockTextures.RawImage loadImage(String name) {
				int[] pixels = new int[TextureSource.SIZE * TextureSource.SIZE];
				Arrays.fill(pixels, pack[0]);
				synchronized (blockNext) {
					if (blockNext[0]) {
						blockNext[0] = false;
						entered.countDown();
						try {
							assertTrue(release.await(10, TimeUnit.SECONDS));
						} catch (InterruptedException e) {
							throw new AssertionError(e);
						}
					}
				}
				return new BlockTextures.RawImage(pixels, TextureSource.SIZE, TextureSource.SIZE);
			}
		};
		CompletableFuture<int[]> background = CompletableFuture.supplyAsync(() -> source.texture(MiniBlock.STONE, Face.UP, Theme.CITY));
		assertTrue(entered.await(10, TimeUnit.SECONDS));
		pack[0] = 0xFF222222;
		source.clear();
		release.countDown();
		assertEquals(0xFF111111, background.get(10, TimeUnit.SECONDS)[0] | 0xFF000000, "the render in flight finishes");
		int[] after = source.texture(MiniBlock.STONE, Face.UP, Theme.CITY);
		assertEquals(0xFF222222, after[0] | 0xFF000000, "a texture from before the clear was cached");
	}
}
