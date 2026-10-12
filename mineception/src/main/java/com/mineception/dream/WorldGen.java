package com.mineception.dream;

/**
 * Generates the four dream levels deterministically from a laptop's seed: a rainy city, an enclosed hotel lobby, a
 * snowy mountain fortress and Limbo's dusk beach. Every level is a small diorama whose spawn looks straight at the
 * laptop that leads one level deeper.
 *
 * <p>Each theme builds in a canonical frame (the player looks north, the laptop's screen faces south) and returns a
 * {@link Stage}; {@code generate} then places the desk, the laptop and a clear walkway to the spawn, rotates the level
 * by the stage's quarter turns and aims the spawn view at the centre of the screen. Only integer arithmetic,
 * {@link DreamRandom}, {@link Noise} and {@link StrictMath} are used, so all machines build identical levels.
 */
public final class WorldGen {
	/** Allowed distances between the spawn and the laptop cell, in blocks along the laptop's facing. */
	public static final int MIN_SPAWN_DISTANCE = 3;
	public static final int MAX_SPAWN_DISTANCE = 4;

	private WorldGen() {
	}

	/**
	 * Where a theme wants its laptop, in the canonical frame (screen facing SOUTH, spawn {@code distance} blocks south of
	 * the laptop at the same {@code ground} level).
	 *
	 * @param laptopX      laptop cell x
	 * @param ground       y of the desk (the first air layer above the floor)
	 * @param laptopZ      laptop cell z
	 * @param distance     spawn distance from the laptop cell, {@link #MIN_SPAWN_DISTANCE}..{@link #MAX_SPAWN_DISTANCE}
	 * @param desk         block the laptop stands on
	 * @param floor        block used to patch holes in the walkway between the spawn and the desk
	 * @param quarterTurns clockwise quarter turns applied to the whole level afterwards
	 */
	record Stage(int laptopX, int ground, int laptopZ, int distance, MiniBlock desk, MiniBlock floor, int quarterTurns) {
	}

	/**
	 * Builds level {@code depth} (1..4) for a laptop seed. Must be fully deterministic: the server and every client
	 * generate the same terrain and only exchange edits.
	 */
	public static MiniWorld generate(long seed, int depth) {
		Theme theme = Theme.forDepth(depth);
		DreamRandom random = new DreamRandom(DreamRandom.mix(seed) ^ DreamRandom.mix(0x6D696E6563657074L + depth));
		MiniWorld canvas = new MiniWorld(depth, seed);
		Stage stage = switch (theme) {
			case CITY -> CityLevel.build(canvas, random);
			case HOTEL -> HotelLevel.build(canvas, random);
			case FORTRESS -> FortressLevel.build(canvas, random);
			case LIMBO -> LimboLevel.build(canvas, random);
		};
		placeLaptop(canvas, stage);
		MiniWorld world = rotate(canvas, stage.quarterTurns());
		Build.fill(world, 0, 0, 0, MiniWorld.SX - 1, 0, MiniWorld.SZ - 1, MiniBlock.BEDROCK);
		aimSpawn(world);
		return world;
	}

	/** Desk, laptop and a clear, solid-floored walkway from the spawn to the desk (canonical frame). */
	private static void placeLaptop(MiniWorld w, Stage s) {
		int x = s.laptopX();
		int g = s.ground();
		int lz = s.laptopZ();
		if (!w.get(x, g - 1, lz).solid()) {
			w.set(x, g - 1, lz, s.floor());
		}
		w.set(x, g, lz, s.desk());
		w.set(x, g + 1, lz, MiniBlock.LAPTOP);
		for (int z = lz + 1; z <= lz + s.distance(); z++) {
			if (!w.get(x, g - 1, z).solid()) {
				w.set(x, g - 1, z, s.floor());
			}
			w.set(x, g, z, MiniBlock.AIR);
			w.set(x, g + 1, z, MiniBlock.AIR);
		}
		w.laptopX = x;
		w.laptopY = g + 1;
		w.laptopZ = lz;
		w.laptopFacing = Face.SOUTH;
		w.spawnX = x + 0.5;
		w.spawnY = g;
		w.spawnZ = lz + s.distance() + 0.5;
	}

	/** Rotates a whole level clockwise (seen from above) around its centre. */
	static MiniWorld rotate(MiniWorld src, int quarterTurns) {
		int turns = Math.floorMod(quarterTurns, 4);
		if (turns == 0) {
			return src;
		}
		MiniWorld dst = new MiniWorld(src.depth, src.seed);
		for (int y = 0; y < MiniWorld.SY; y++) {
			for (int z = 0; z < MiniWorld.SZ; z++) {
				for (int x = 0; x < MiniWorld.SX; x++) {
					int id = src.id(x, y, z);
					if (id != 0) {
						int[] c = rotateCell(x, z, turns);
						dst.set(c[0], y, c[1], MiniBlock.byId(id));
					}
				}
			}
		}
		int[] laptop = rotateCell(src.laptopX, src.laptopZ, turns);
		dst.laptopX = laptop[0];
		dst.laptopY = src.laptopY;
		dst.laptopZ = laptop[1];
		Face facing = src.laptopFacing;
		double sx = src.spawnX;
		double sz = src.spawnZ;
		for (int i = 0; i < turns; i++) {
			facing = Face.HORIZONTAL[(indexOf(facing) + 1) % 4];
			double nx = MiniWorld.SX - sz;
			sz = sx;
			sx = nx;
		}
		dst.laptopFacing = facing;
		dst.spawnX = sx;
		dst.spawnY = src.spawnY;
		dst.spawnZ = sz;
		return dst;
	}

	private static int[] rotateCell(int x, int z, int turns) {
		for (int i = 0; i < turns; i++) {
			int nx = MiniWorld.SX - 1 - z;
			z = x;
			x = nx;
		}
		return new int[]{x, z};
	}

	private static int indexOf(Face face) {
		for (int i = 0; i < Face.HORIZONTAL.length; i++) {
			if (Face.HORIZONTAL[i] == face) {
				return i;
			}
		}
		throw new IllegalArgumentException("Not horizontal: " + face);
	}

	/** Points the spawn view exactly at the centre of the laptop screen. */
	private static void aimSpawn(MiniWorld w) {
		double[] target = LevelChecks.screenCenter(w);
		double dx = target[0] - w.spawnX;
		double dy = target[1] - (w.spawnY + MiniPlayer.EYE_HEIGHT);
		double dz = target[2] - w.spawnZ;
		double yaw = StrictMath.toDegrees(StrictMath.atan2(-dx, dz));
		double pitch = -StrictMath.toDegrees(StrictMath.atan2(dy, StrictMath.sqrt(dx * dx + dz * dz)));
		w.spawnYaw = (float) ((yaw % 360.0 + 360.0) % 360.0);
		w.spawnPitch = (float) pitch;
	}
}
