package com.mineception.dream.render;

import com.mineception.dream.Face;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniHit;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import java.util.Map;
import java.util.WeakHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReferenceArray;

/**
 * Software voxel renderer that draws a dream level the way Minecraft would, using the real block textures.
 *
 * <p>Each pixel's ray is clipped to the level's bounds and walked through the grid cell by cell (Amanatides-Woo).
 * Faces are textured with vanilla's UV orientation and random top-texture variants, lit like Minecraft's smooth
 * lighting (sky and block light levels averaged at the face corners, ambient occlusion, the vanilla light map and
 * per-face shading), and composited front to back through cutout leaves and glass, translucent ice and water
 * surfaces. Distance fog, a day/night sky with a square sun and moon, stars, clouds, sunrise glow, rain and snow, the
 * block highlight outline and the laptop with the next level on its screen complete the picture.
 *
 * <p>Thread-safe: concurrent calls may render into different output buffers. Large images are split into bands of
 * rows rendered in parallel.
 */
public final class Raycaster {
	static final int K_AIR = 0;
	static final int K_OPAQUE = 1;
	static final int K_CUTOUT = 2;
	static final int K_TRANSLUCENT = 3;
	static final int K_LIQUID = 4;
	static final int K_SPECIAL = 5;

	static final int DOWN = Face.DOWN.ordinal();
	static final int UP = Face.UP.ordinal();
	static final int NORTH = Face.NORTH.ordinal();
	static final int SOUTH = Face.SOUTH.ordinal();
	static final int WEST = Face.WEST.ordinal();
	static final int EAST = Face.EAST.ordinal();

	/** Minecraft's directional face shading, indexed by face ordinal. */
	static final float[] FACE_SHADE = new float[6];
	static final byte[] KIND = new byte[256];
	/** Blocks that darken their neighbours' corners (vanilla: full collision shape, except glass). */
	static final boolean[] OCCLUDES = new boolean[256];
	static final boolean[] EMISSIVE = new boolean[256];
	/** 1: random top rotation (grass, dirt, sand); 2: random mirroring (stone, bedrock). */
	static final byte[] VARIANT = new byte[256];

	static final int WATER = MiniBlock.WATER.id;
	static final int GLASS = MiniBlock.GLASS.id;
	static final int LAPTOP = MiniBlock.LAPTOP.id;

	/** Light level that lights indoor levels everywhere, as if from the sky. */
	static final float INDOOR_LIGHT = 10.5F;
	static final int CLOUD_Y = MiniWorld.SY + 18;

	static {
		FACE_SHADE[DOWN] = 0.5F;
		FACE_SHADE[UP] = 1.0F;
		FACE_SHADE[NORTH] = 0.8F;
		FACE_SHADE[SOUTH] = 0.8F;
		FACE_SHADE[WEST] = 0.6F;
		FACE_SHADE[EAST] = 0.6F;
		for (MiniBlock block : MiniBlock.values()) {
			KIND[block.id] = (byte) switch (block.kind) {
				case AIR -> K_AIR;
				case OPAQUE -> K_OPAQUE;
				case CUTOUT -> K_CUTOUT;
				case TRANSLUCENT -> K_TRANSLUCENT;
				case LIQUID -> K_LIQUID;
				case SPECIAL -> K_SPECIAL;
			};
			OCCLUDES[block.id] = block.solid() && block != MiniBlock.GLASS;
			EMISSIVE[block.id] = block.light > 0;
		}
		VARIANT[MiniBlock.GRASS.id] = 1;
		VARIANT[MiniBlock.DIRT.id] = 1;
		VARIANT[MiniBlock.SAND.id] = 1;
		VARIANT[MiniBlock.STONE.id] = 2;
		VARIANT[MiniBlock.BEDROCK.id] = 2;
	}

	private final TextureSource textures;
	/** Face texture tables per theme, each tagged with the {@link #textureGeneration} it was built in. */
	private final AtomicReferenceArray<TextureTable> themeTextures = new AtomicReferenceArray<>(Theme.values().length);
	/** Bumped by {@link #invalidateTextures()}; tables of older generations are rebuilt before use. */
	private final AtomicInteger textureGeneration = new AtomicInteger();
	/** Light fields of the worlds rendered recently, keyed by identity; guarded by itself. */
	private final Map<MiniWorld, LightField> lightFields = new WeakHashMap<>();

	private record TextureTable(int generation, int[][] faces) {
	}

	public Raycaster(TextureSource textures) {
		this.textures = textures;
	}

	public TextureSource textures() {
		return textures;
	}

	/**
	 * Loads and caches the face textures of a theme now. The client calls this on the render thread so that renders
	 * on background threads never have to read resources.
	 */
	public void prepareTextures(Theme theme) {
		textureTable(theme);
	}

	/**
	 * Forgets the cached face textures, e.g. after the resource packs changed (call it after clearing the texture
	 * source's own caches). A table that a concurrent render is still building from the old textures is never used
	 * after this returns.
	 */
	public void invalidateTextures() {
		textureGeneration.incrementAndGet();
		for (int i = 0; i < themeTextures.length(); i++) {
			themeTextures.set(i, null);
		}
	}

	/**
	 * Renders {@code world} as seen by {@code camera} into {@code out} (ARGB, row-major, top row first,
	 * {@code width * height} pixels).
	 *
	 * @param gameTime    real-world game time in ticks (drives time of day, weather and animated textures)
	 * @param partialTick fraction of the current tick
	 * @param child       what this level's laptop screen shows (the next level down), or null for "no signal" static
	 * @param highlight   block to outline (the one the player is looking at), or null
	 */
	public void render(MiniWorld world, Camera camera, long gameTime, float partialTick, ScreenImage child, MiniHit highlight,
					   int[] out, int width, int height) {
		if (width <= 0 || height <= 0) {
			return;
		}
		if (out.length < width * height) {
			throw new IllegalArgumentException("output buffer too small for " + width + "x" + height);
		}
		RayFrame frame = new RayFrame(world, textureTable(world.theme), lightField(world), camera, gameTime, partialTick, child,
			highlight, width, height);
		ParallelRows.run(height, width * height, (from, to) -> frame.renderRows(out, from, to));
	}

	/** Face textures of every block for a theme, indexed by {@code id * 6 + face}; built on first use. */
	int[][] textureTable(Theme theme) {
		int generation = textureGeneration.get();
		TextureTable cached = themeTextures.get(theme.ordinal());
		if (cached != null && cached.generation() == generation) {
			return cached.faces();
		}
		int[][] faces = new int[256 * 6][];
		for (MiniBlock block : MiniBlock.values()) {
			if (block.kind == MiniBlock.Kind.AIR || block.kind == MiniBlock.Kind.SPECIAL) {
				continue;
			}
			for (Face face : Face.values()) {
				int[] texture = textures.texture(block, face, theme);
				faces[block.id * 6 + face.ordinal()] = texture != null && texture.length >= TextureSource.SIZE * TextureSource.SIZE
					? texture : missingTexture();
			}
		}
		// Install it tagged with the generation it was started in: if the textures were invalidated meanwhile, the
		// next use sees an old generation and builds again. Never replace a table of the same or a newer generation.
		TextureTable built = new TextureTable(generation, faces);
		while (true) {
			TextureTable current = themeTextures.get(theme.ordinal());
			if (current != null && current.generation() >= generation) {
				return current.generation() == generation ? current.faces() : faces;
			}
			if (themeTextures.compareAndSet(theme.ordinal(), current, built)) {
				return faces;
			}
		}
	}

	/** The light levels of a world, recomputed when its revision changes. */
	LightField lightField(MiniWorld world) {
		synchronized (lightFields) {
			LightField field = lightFields.get(world);
			if (field != null && field.revision == world.revision()) {
				return field;
			}
		}
		LightField computed = LightField.compute(world);
		synchronized (lightFields) {
			lightFields.put(world, computed);
		}
		return computed;
	}

	/** Vanilla's missing texture: a magenta and black checkerboard. */
	static int[] missingTexture() {
		int[] texture = new int[TextureSource.SIZE * TextureSource.SIZE];
		for (int y = 0; y < TextureSource.SIZE; y++) {
			for (int x = 0; x < TextureSource.SIZE; x++) {
				texture[y * TextureSource.SIZE + x] = ((x < 8) == (y < 8)) ? 0xFFF800F8 : 0xFF000000;
			}
		}
		return texture;
	}

	static int lerpColor(int a, int b, float t) {
		int ar = a >> 16 & 0xFF;
		int ag = a >> 8 & 0xFF;
		int ab = a & 0xFF;
		int r = (int) (ar + ((b >> 16 & 0xFF) - ar) * t);
		int g = (int) (ag + ((b >> 8 & 0xFF) - ag) * t);
		int bl = (int) (ab + ((b & 0xFF) - ab) * t);
		return 0xFF000000 | r << 16 | g << 8 | bl;
	}

	/** Well-mixed 32-bit hash of three integers. */
	static int hash(int x, int y, int z) {
		int h = x * 0x27D4EB2D ^ y * 0x165667B1 ^ z * 0x61C88647;
		h ^= h >>> 15;
		h *= 0x2C1B3C6D;
		h ^= h >>> 12;
		h *= 0x297A2D39;
		h ^= h >>> 15;
		return h;
	}

	/**
	 * One "no signal" static pixel at screen coordinates (u right, v down, 0..1): grainy grey noise in coarse cells,
	 * refreshed many times a second, with a slowly rolling bright band.
	 */
	public static int staticPixel(double u, double v, long gameTime, float partialTick) {
		int cellX = (int) (u * 56.0);
		int cellY = (int) (v * 35.0);
		int frame = (int) (gameTime * 2 + (partialTick >= 0.5F ? 1 : 0));
		int noise = hash(cellX, cellY, frame) & 0xFF;
		double time = gameTime + partialTick;
		double band = v - (time * 0.013 - Math.floor(time * 0.013));
		band -= Math.floor(band);
		float level = 28.0F + noise * 0.72F;
		if (band < 0.07) {
			level += 34.0F;
		}
		// Occasional dark scanlines
		if ((cellY + frame / 3) % 9 == 0) {
			level *= 0.7F;
		}
		int g = Math.min(255, (int) level);
		int r = g * 92 / 100;
		int b = Math.min(255, g * 104 / 100);
		return 0xFF000000 | r << 16 | g << 8 | b;
	}
}
