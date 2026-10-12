package com.mineception.dream;

/**
 * One dream level: a small voxel world of {@link MiniBlock}s plus the spot where the player spawns and the laptop that
 * leads one level deeper. Outside its bounds the world is empty void.
 */
public final class MiniWorld {
	public static final int SX = 40;
	public static final int SY = 32;
	public static final int SZ = 40;
	public static final int VOLUME = SX * SY * SZ;

	public final int depth;
	public final Theme theme;
	public final long seed;
	private final byte[] blocks;
	/** Incremented on every change so renderers can cache derived data. */
	private int revision;

	/** Cell holding this level's laptop. */
	public int laptopX;
	public int laptopY;
	public int laptopZ;
	/** Direction the laptop's screen faces (always horizontal). */
	public Face laptopFacing = Face.SOUTH;

	/** Feet position and view of the player when they enter this level. */
	public double spawnX;
	public double spawnY;
	public double spawnZ;
	public float spawnYaw;
	public float spawnPitch;

	public MiniWorld(int depth, long seed) {
		this.depth = depth;
		this.theme = Theme.forDepth(depth);
		this.seed = seed;
		this.blocks = new byte[VOLUME];
	}

	public static int index(int x, int y, int z) {
		return (y * SZ + z) * SX + x;
	}

	public static int indexX(int index) {
		return index % SX;
	}

	public static int indexZ(int index) {
		return (index / SX) % SZ;
	}

	public static int indexY(int index) {
		return index / (SX * SZ);
	}

	public static boolean inBounds(int x, int y, int z) {
		return x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ;
	}

	public MiniBlock get(int x, int y, int z) {
		return inBounds(x, y, z) ? MiniBlock.byId(blocks[index(x, y, z)] & 0xFF) : MiniBlock.AIR;
	}

	public MiniBlock get(int index) {
		return MiniBlock.byId(blocks[index] & 0xFF);
	}

	/** Raw id lookup for hot loops; out-of-bounds returns 0 (air). */
	public int id(int x, int y, int z) {
		return inBounds(x, y, z) ? blocks[index(x, y, z)] & 0xFF : 0;
	}

	public void set(int x, int y, int z, MiniBlock block) {
		if (inBounds(x, y, z)) {
			set(index(x, y, z), block);
		}
	}

	public void set(int index, MiniBlock block) {
		if (blocks[index] != (byte) block.id) {
			blocks[index] = (byte) block.id;
			revision++;
		}
	}

	public int revision() {
		return revision;
	}

	/** Direct access to the block ids (read-only by convention) for fast renderers. */
	public byte[] rawBlocks() {
		return blocks;
	}

	public boolean hasLaptopAt(int x, int y, int z) {
		return x == laptopX && y == laptopY && z == laptopZ && get(x, y, z) == MiniBlock.LAPTOP;
	}

	public MiniWorld copy() {
		MiniWorld copy = new MiniWorld(depth, seed);
		System.arraycopy(blocks, 0, copy.blocks, 0, VOLUME);
		copy.revision = revision;
		copy.laptopX = laptopX;
		copy.laptopY = laptopY;
		copy.laptopZ = laptopZ;
		copy.laptopFacing = laptopFacing;
		copy.spawnX = spawnX;
		copy.spawnY = spawnY;
		copy.spawnZ = spawnZ;
		copy.spawnYaw = spawnYaw;
		copy.spawnPitch = spawnPitch;
		return copy;
	}
}
