package com.mineception.dream.render;

import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniWorld;

/**
 * Minecraft-style light levels (0-15) of every cell of a level: sky light pouring down from above and in from the void
 * around the level, and block light spreading from glowing blocks, both losing one level per block travelled (and one
 * more through leaves, water and ice). Also a height map of the highest block in each column, used to keep rain out of
 * covered places. Immutable once computed.
 */
final class LightField {
	/** Light level of the dream laptop's screen glow (the real block uses the same value). */
	static final int LAPTOP_LIGHT = 6;

	/** Per block id: 15 if it stops light, else how much extra light it absorbs. */
	private static final byte[] ABSORB = new byte[256];
	private static final byte[] EMIT = new byte[256];

	static {
		for (MiniBlock block : MiniBlock.values()) {
			ABSORB[block.id] = (byte) switch (block.kind) {
				case OPAQUE -> 15;
				case CUTOUT -> block == MiniBlock.GLASS ? 0 : 1;
				case TRANSLUCENT, LIQUID -> 1;
				default -> 0;
			};
			EMIT[block.id] = (byte) (block == MiniBlock.LAPTOP ? LAPTOP_LIGHT : block.light);
		}
	}

	/** Dimensions of the {@link #packed} grid: the level plus a one-cell border of open void on every side. */
	static final int PX = MiniWorld.SX + 2;
	static final int PZ = MiniWorld.SZ + 2;
	static final int PY = MiniWorld.SY + 2;
	/** Offset between vertically adjacent cells of the {@link #packed} grid. */
	static final int PLANE = PX * PZ;
	/** Packed value of a cell of open void: full sky light, no block light, not occluding. */
	static final short VOID = 15 << 4;

	final int revision;
	final byte[] sky;
	final byte[] block;
	/** Per column (index z * SX + x): one above the highest non-air cell, 0 for an empty column. */
	final byte[] height;
	/** One above the highest non-air cell of the whole level (0 if it is empty). */
	final int top;
	/**
	 * Every cell's lighting inputs in one value (bit 9: blocks light, bit 8: darkens corners for ambient occlusion,
	 * bits 4-7: sky light, bits 0-3: block light) on a grid padded by one void cell on each side, so neighbours never
	 * need bounds checks. Indexed by {@link #padded}.
	 */
	final short[] packed;

	private LightField(int revision, byte[] blocks, byte[] sky, byte[] block, byte[] height) {
		this.revision = revision;
		this.sky = sky;
		this.block = block;
		this.height = height;
		int max = 0;
		for (byte h : height) {
			max = Math.max(max, h);
		}
		this.top = max;
		this.packed = new short[PX * PY * PZ];
		java.util.Arrays.fill(packed, VOID);
		for (int index = 0; index < MiniWorld.VOLUME; index++) {
			int id = blocks[index] & 0xFF;
			int value = (Raycaster.OCCLUDES[id] ? 0x100 : 0) | (ABSORB[id] >= 15 ? 0x200 : sky[index] << 4 | block[index]);
			packed[padded(MiniWorld.indexX(index), MiniWorld.indexY(index), MiniWorld.indexZ(index))] = (short) value;
		}
	}

	/** Index of a level cell (or a cell of the one-cell border around it) in {@link #packed}. */
	static int padded(int x, int y, int z) {
		return ((y + 1) * PZ + z + 1) * PX + x + 1;
	}

	static LightField compute(MiniWorld world) {
		int revision = world.revision();
		byte[] blocks = world.rawBlocks();
		byte[] sky = new byte[MiniWorld.VOLUME];
		byte[] light = new byte[MiniWorld.VOLUME];
		byte[] height = new byte[MiniWorld.SX * MiniWorld.SZ];
		int[] queue = new int[MiniWorld.VOLUME * 4];

		// Sky light falls straight down until something blocks it
		int tail = 0;
		for (int z = 0; z < MiniWorld.SZ; z++) {
			for (int x = 0; x < MiniWorld.SX; x++) {
				int level = 15;
				int top = 0;
				for (int y = MiniWorld.SY - 1; y >= 0; y--) {
					int index = MiniWorld.index(x, y, z);
					int id = blocks[index] & 0xFF;
					if (id != 0 && top == 0) {
						top = y + 1;
					}
					int absorb = ABSORB[id];
					level = absorb >= 15 ? 0 : Math.max(0, level - absorb);
					sky[index] = (byte) level;
				}
				height[z * MiniWorld.SX + x] = (byte) top;
			}
		}
		// ... and spreads sideways from every lit cell and from the open void around the level
		for (int index = 0; index < MiniWorld.VOLUME; index++) {
			int id = blocks[index] & 0xFF;
			if (ABSORB[id] >= 15) {
				continue;
			}
			int x = MiniWorld.indexX(index);
			int y = MiniWorld.indexY(index);
			int z = MiniWorld.indexZ(index);
			if (x == 0 || z == 0 || x == MiniWorld.SX - 1 || z == MiniWorld.SZ - 1 || y == 0) {
				int fromVoid = 14 - ABSORB[id];
				if (fromVoid > sky[index]) {
					sky[index] = (byte) fromVoid;
				}
			}
			if (sky[index] > 1) {
				queue[tail++] = index;
			}
		}
		spread(blocks, sky, queue, tail);

		tail = 0;
		for (int index = 0; index < MiniWorld.VOLUME; index++) {
			int emit = EMIT[blocks[index] & 0xFF];
			if (emit > 0) {
				light[index] = (byte) emit;
				queue[tail++] = index;
			}
		}
		spread(blocks, light, queue, tail);
		return new LightField(revision, blocks, sky, light, height);
	}

	/** Breadth-first flood fill: each step loses one level plus what the entered block absorbs. */
	private static void spread(byte[] blocks, byte[] levels, int[] queue, int tail) {
		int head = 0;
		int capacity = queue.length;
		int count = tail;
		while (count > 0) {
			int index = queue[head];
			head = (head + 1) % capacity;
			count--;
			int level = levels[index];
			if (level <= 1) {
				continue;
			}
			int x = MiniWorld.indexX(index);
			int y = MiniWorld.indexY(index);
			int z = MiniWorld.indexZ(index);
			for (int dir = 0; dir < 6; dir++) {
				int nx = x;
				int ny = y;
				int nz = z;
				switch (dir) {
					case 0 -> nx--;
					case 1 -> nx++;
					case 2 -> ny--;
					case 3 -> ny++;
					case 4 -> nz--;
					default -> nz++;
				}
				if (!MiniWorld.inBounds(nx, ny, nz)) {
					continue;
				}
				int neighbour = MiniWorld.index(nx, ny, nz);
				int absorb = ABSORB[blocks[neighbour] & 0xFF];
				if (absorb >= 15) {
					continue;
				}
				int next = level - 1 - absorb;
				if (next > levels[neighbour]) {
					levels[neighbour] = (byte) next;
					if (count < capacity) {
						queue[(head + count) % capacity] = neighbour;
						count++;
					}
				}
			}
		}
	}

	/** Sky light at a cell; the void around the level is open sky. */
	int skyAt(int x, int y, int z) {
		return MiniWorld.inBounds(x, y, z) ? sky[MiniWorld.index(x, y, z)] : 15;
	}

	int blockAt(int x, int y, int z) {
		return MiniWorld.inBounds(x, y, z) ? block[MiniWorld.index(x, y, z)] : 0;
	}

	/** Whether a point is out in the open (nothing above it), for rain and snow. */
	boolean openSky(double x, double y, double z) {
		int cx = (int) Math.floor(x);
		int cz = (int) Math.floor(z);
		if (cx < 0 || cz < 0 || cx >= MiniWorld.SX || cz >= MiniWorld.SZ) {
			return true;
		}
		return y >= height[cz * MiniWorld.SX + cx];
	}
}
