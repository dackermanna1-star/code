package com.mineception.dream.render;

import com.mineception.dream.Face;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.Theme;
import java.util.List;
import java.util.function.Function;

/**
 * Which vanilla textures a dream block uses on each face, and how they are tinted. This mirrors the vanilla block
 * models (cube_all, cube_column, cube_bottom_top, the grass block's tinted side overlay, the crafting table's front
 * faces) so a level drawn by the {@link Raycaster} looks like the same blocks in Minecraft.
 *
 * <p>Texture names are vanilla block texture paths without namespace or folder, e.g. {@code "grass_block_side"} for
 * {@code minecraft:textures/block/grass_block_side.png}.
 */
public final class BlockTextures {
	/** Vanilla's fixed spruce leaves colour (FoliageColor.FOLIAGE_EVERGREEN). */
	public static final int EVERGREEN_TINT = 0xFF619961;

	/** How a texture layer is coloured. */
	public enum Tint {
		NONE,
		/** The theme's grass colour (grass block top and side overlay). */
		GRASS,
		/** The theme's foliage colour (oak leaves). */
		FOLIAGE,
		/** Vanilla's fixed evergreen colour (spruce leaves). */
		EVERGREEN,
		/** The theme's water colour. */
		WATER
	}

	/** One texture drawn on a face; later layers are drawn over earlier ones where they are not transparent. */
	public record Layer(String texture, Tint tint) {
	}

	/** A decoded image as ARGB pixels, row-major with the top row first. */
	public record RawImage(int[] argb, int width, int height) {
		public RawImage {
			if (width <= 0 || height <= 0 || argb.length < width * height) {
				throw new IllegalArgumentException("Bad image " + width + "x" + height);
			}
		}
	}

	private BlockTextures() {
	}

	/** The texture layers of one face of a block, bottom layer first. Empty for air and the laptop (drawn procedurally). */
	public static List<Layer> layers(MiniBlock block, Face face) {
		boolean top = face == Face.UP;
		boolean bottom = face == Face.DOWN;
		boolean end = top || bottom;
		return switch (block) {
			case AIR, LAPTOP -> List.of();
			case GRASS -> top ? List.of(new Layer("grass_block_top", Tint.GRASS))
				: bottom ? plain("dirt")
				: List.of(new Layer("grass_block_side", Tint.NONE), new Layer("grass_block_side_overlay", Tint.GRASS));
			case OAK_LOG -> plain(end ? "oak_log_top" : "oak_log");
			case SPRUCE_LOG -> plain(end ? "spruce_log_top" : "spruce_log");
			case OAK_LEAVES -> List.of(new Layer("oak_leaves", Tint.FOLIAGE));
			case SPRUCE_LEAVES -> List.of(new Layer("spruce_leaves", Tint.EVERGREEN));
			case SANDSTONE -> plain(top ? "sandstone_top" : bottom ? "sandstone_bottom" : "sandstone");
			case WATER -> List.of(new Layer("water_still", Tint.WATER));
			case QUARTZ_BLOCK -> plain(end ? "quartz_block_top" : "quartz_block_side");
			case BOOKSHELF -> plain(end ? "oak_planks" : "bookshelf");
			case SNOW_BLOCK -> plain("snow");
			case CRAFTING_TABLE -> plain(switch (face) {
				case UP -> "crafting_table_top";
				case DOWN -> "oak_planks";
				case NORTH, WEST -> "crafting_table_front";
				case SOUTH, EAST -> "crafting_table_side";
			});
			default -> plain(defaultTexture(block));
		};
	}

	/** Texture of a plain cube_all block: the block id's path (e.g. "minecraft:stone_bricks" uses "stone_bricks"). */
	private static String defaultTexture(MiniBlock block) {
		String id = block.vanillaId;
		return id.substring(id.indexOf(':') + 1);
	}

	private static List<Layer> plain(String texture) {
		return List.of(new Layer(texture, Tint.NONE));
	}

	/** Colour (ARGB) a tint multiplies with in a theme. */
	public static int tintColor(Tint tint, Theme theme) {
		return switch (tint) {
			case NONE -> 0xFFFFFFFF;
			case GRASS -> theme.grassTint;
			case FOLIAGE -> theme.foliageTint;
			case EVERGREEN -> EVERGREEN_TINT;
			case WATER -> theme.waterTint;
		};
	}

	/**
	 * Builds the final {@link TextureSource#SIZE}-square texture of a block face for a theme: the first frame of each
	 * layer (animated textures are vertical strips of square frames), scaled to 16x16 if a resource pack uses another
	 * resolution, tinted, and drawn over the layers below. Returns null if the face has no texture or one is missing.
	 *
	 * @param loader loads a texture by name (see the class comment), or returns null if it does not exist
	 */
	public static int[] compose(MiniBlock block, Face face, Theme theme, Function<String, RawImage> loader) {
		List<Layer> layers = layers(block, face);
		if (layers.isEmpty()) {
			return null;
		}
		int size = TextureSource.SIZE;
		int[] out = null;
		for (Layer layer : layers) {
			RawImage image = loader.apply(layer.texture());
			if (image == null) {
				return null;
			}
			int[] frame = firstFrame(image);
			int tint = tintColor(layer.tint(), theme);
			if (out == null) {
				out = new int[size * size];
				for (int i = 0; i < out.length; i++) {
					out[i] = multiply(frame[i], tint);
				}
			} else {
				for (int i = 0; i < out.length; i++) {
					int src = frame[i];
					if ((src >>> 24) != 0) {
						out[i] = multiply(src, tint) | 0xFF000000;
					}
				}
			}
		}
		return out;
	}

	/** The top square frame of an image, resampled (nearest) to SIZE x SIZE. */
	public static int[] firstFrame(RawImage image) {
		int size = TextureSource.SIZE;
		int frame = Math.min(image.width(), image.height());
		int[] out = new int[size * size];
		for (int y = 0; y < size; y++) {
			int sy = y * frame / size;
			for (int x = 0; x < size; x++) {
				int sx = x * frame / size;
				out[y * size + x] = image.argb()[sy * image.width() + sx];
			}
		}
		return out;
	}

	/** Multiplies the RGB channels of an ARGB colour by a tint, keeping the alpha. */
	public static int multiply(int argb, int tint) {
		if ((tint & 0xFFFFFF) == 0xFFFFFF) {
			return argb;
		}
		int r = (argb >> 16 & 0xFF) * (tint >> 16 & 0xFF) / 255;
		int g = (argb >> 8 & 0xFF) * (tint >> 8 & 0xFF) / 255;
		int b = (argb & 0xFF) * (tint & 0xFF) / 255;
		return argb & 0xFF000000 | r << 16 | g << 8 | b;
	}
}
