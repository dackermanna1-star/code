package com.mineception.dream.render;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.mineception.dream.Face;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.Theme;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** Texture naming and tint rules, checked against the real textures in the Minecraft jar when it is available. */
class BlockTexturesTest {
	@Test
	void everyBlockFaceHasTexturesExceptAirAndLaptop() {
		for (MiniBlock block : MiniBlock.values()) {
			for (Face face : Face.values()) {
				List<BlockTextures.Layer> layers = BlockTextures.layers(block, face);
				if (block == MiniBlock.AIR || block == MiniBlock.LAPTOP) {
					assertTrue(layers.isEmpty(), block + " " + face);
				} else {
					assertFalse(layers.isEmpty(), block + " " + face);
				}
			}
		}
	}

	@Test
	void vanillaModelRules() {
		assertEquals("grass_block_top", BlockTextures.layers(MiniBlock.GRASS, Face.UP).get(0).texture());
		assertEquals("dirt", BlockTextures.layers(MiniBlock.GRASS, Face.DOWN).get(0).texture());
		assertEquals(List.of(new BlockTextures.Layer("grass_block_side", BlockTextures.Tint.NONE),
			new BlockTextures.Layer("grass_block_side_overlay", BlockTextures.Tint.GRASS)), BlockTextures.layers(MiniBlock.GRASS, Face.EAST));
		assertEquals("oak_log_top", BlockTextures.layers(MiniBlock.OAK_LOG, Face.DOWN).get(0).texture());
		assertEquals("oak_log", BlockTextures.layers(MiniBlock.OAK_LOG, Face.NORTH).get(0).texture());
		assertEquals("oak_planks", BlockTextures.layers(MiniBlock.BOOKSHELF, Face.UP).get(0).texture());
		assertEquals("sandstone_bottom", BlockTextures.layers(MiniBlock.SANDSTONE, Face.DOWN).get(0).texture());
		assertEquals("crafting_table_front", BlockTextures.layers(MiniBlock.CRAFTING_TABLE, Face.NORTH).get(0).texture());
		assertEquals("crafting_table_front", BlockTextures.layers(MiniBlock.CRAFTING_TABLE, Face.WEST).get(0).texture());
		assertEquals("crafting_table_side", BlockTextures.layers(MiniBlock.CRAFTING_TABLE, Face.SOUTH).get(0).texture());
		assertEquals("quartz_block_top", BlockTextures.layers(MiniBlock.QUARTZ_BLOCK, Face.DOWN).get(0).texture());
		assertEquals("snow", BlockTextures.layers(MiniBlock.SNOW_BLOCK, Face.UP).get(0).texture());
		assertEquals(BlockTextures.Tint.EVERGREEN, BlockTextures.layers(MiniBlock.SPRUCE_LEAVES, Face.UP).get(0).tint());
		assertEquals(BlockTextures.Tint.WATER, BlockTextures.layers(MiniBlock.WATER, Face.UP).get(0).tint());
	}

	@Test
	void everyNamedTextureExistsInTheMinecraftJar() throws Exception {
		Optional<JarTextureSource> source = JarTextureSource.open();
		assumeTrue(source.isPresent(), "Minecraft client jar not found");
		try (JarTextureSource jar = source.get()) {
			for (MiniBlock block : MiniBlock.values()) {
				for (Face face : Face.values()) {
					for (BlockTextures.Layer layer : BlockTextures.layers(block, face)) {
						assertTrue(jar.hasBlockTexture(layer.texture()), layer.texture() + " for " + block + " " + face);
					}
					for (Theme theme : Theme.values()) {
						int[] texture = jar.texture(block, face, theme);
						if (block != MiniBlock.AIR && block != MiniBlock.LAPTOP) {
							assertNotNull(texture, block + " " + face);
							assertEquals(TextureSource.SIZE * TextureSource.SIZE, texture.length);
						}
					}
				}
			}
		}
	}

	@Test
	void grassSideKeepsDirtAndTintsTheOverlayPerTheme() throws Exception {
		Optional<JarTextureSource> source = JarTextureSource.open();
		assumeTrue(source.isPresent(), "Minecraft client jar not found");
		try (JarTextureSource jar = source.get()) {
			// The base side texture already has (plains-green) grass; the grey overlay on top carries the biome tint
			BlockTextures.RawImage overlay = jar.read("assets/minecraft/textures/block/grass_block_side_overlay.png");
			int overlayPixel = overlay.argb()[0];
			int grey = overlayPixel >> 16 & 0xFF;
			assertEquals(grey, overlayPixel >> 8 & 0xFF, "overlay is grey");
			int[] city = jar.texture(MiniBlock.GRASS, Face.NORTH, Theme.CITY);
			int[] fortress = jar.texture(MiniBlock.GRASS, Face.NORTH, Theme.FORTRESS);
			assertNotEquals(city[0], fortress[0], "top row follows the theme's grass colour");
			assertEquals(BlockTextures.multiply(overlayPixel, Theme.CITY.grassTint) | 0xFF000000, city[0]);
			int bottom = 15 * 16 + 8;
			assertEquals(city[bottom], fortress[bottom], "dirt part is untinted");
			// Grass top is grey in the jar and tinted by the theme
			int[] top = jar.texture(MiniBlock.GRASS, Face.UP, Theme.CITY);
			assertTrue((top[0] >> 8 & 0xFF) > (top[0] >> 16 & 0xFF), "grass top is green");
		}
	}

	@Test
	void animatedStripsUseTheirFirstFrameAndTranslucencyIsKept() throws Exception {
		Optional<JarTextureSource> source = JarTextureSource.open();
		assumeTrue(source.isPresent(), "Minecraft client jar not found");
		try (JarTextureSource jar = source.get()) {
			BlockTextures.RawImage strip = jar.read("assets/minecraft/textures/block/water_still.png");
			assertTrue(strip.height() > strip.width());
			int[] water = jar.texture(MiniBlock.WATER, Face.UP, Theme.CITY);
			assertEquals(BlockTextures.multiply(strip.argb()[5 * 16 + 3], Theme.CITY.waterTint), water[5 * 16 + 3]);
			assertTrue((water[0] >>> 24) < 255 && (water[0] >>> 24) > 100, "water is translucent");
			int[] ice = jar.texture(MiniBlock.ICE, Face.UP, Theme.FORTRESS);
			assertTrue((ice[0] >>> 24) < 255 && (ice[0] >>> 24) > 100, "ice is translucent");
			int[] glass = jar.texture(MiniBlock.GLASS, Face.UP, Theme.CITY);
			boolean holes = false;
			for (int pixel : glass) {
				holes |= (pixel >>> 24) == 0;
			}
			assertTrue(holes, "glass has see-through pixels");
		}
	}

	@Test
	void composeHandlesMissingTexturesAndOtherResolutions() {
		assertNull(BlockTextures.compose(MiniBlock.STONE, Face.UP, Theme.CITY, name -> null));
		int[] big = new int[32 * 64];
		for (int y = 0; y < 64; y++) {
			for (int x = 0; x < 32; x++) {
				big[y * 32 + x] = 0xFF000000 | (y < 32 ? x * 8 : 0xFF0000);
			}
		}
		int[] texture = BlockTextures.compose(MiniBlock.STONE, Face.UP, Theme.CITY, name -> new BlockTextures.RawImage(big, 32, 64));
		assertEquals(16 * 16, texture.length);
		assertEquals(0xFF000000 | 15 * 16, texture[15 * 16 + 15], "32x32 frames are sampled down");
	}
}
