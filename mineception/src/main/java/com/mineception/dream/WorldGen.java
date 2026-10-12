package com.mineception.dream;

/**
 * Generates the four dream levels deterministically from a laptop's seed.
 *
 * <p>PLACEHOLDER (scaffold): a flat grass island with the laptop on a desk in front of the spawn point. Replaced by the
 * themed generators (city, hotel, snow fortress, limbo). The public signature must stay the same.
 */
public final class WorldGen {
	private WorldGen() {
	}

	/**
	 * Builds level {@code depth} (1..4) for a laptop seed. Must be fully deterministic: the server and every client
	 * generate the same terrain and only exchange edits.
	 */
	public static MiniWorld generate(long seed, int depth) {
		MiniWorld world = new MiniWorld(depth, seed);
		for (int x = 0; x < MiniWorld.SX; x++) {
			for (int z = 0; z < MiniWorld.SZ; z++) {
				world.set(x, 0, z, MiniBlock.BEDROCK);
				world.set(x, 1, z, MiniBlock.STONE);
				world.set(x, 2, z, MiniBlock.DIRT);
				world.set(x, 3, z, MiniBlock.GRASS);
			}
		}
		int cx = MiniWorld.SX / 2;
		int cz = MiniWorld.SZ / 2;
		world.set(cx, 4, cz, MiniBlock.OAK_PLANKS);
		world.set(cx, 5, cz, MiniBlock.LAPTOP);
		world.laptopX = cx;
		world.laptopY = 5;
		world.laptopZ = cz;
		world.laptopFacing = Face.SOUTH;
		world.spawnX = cx + 0.5;
		world.spawnY = 4.0;
		world.spawnZ = cz + 3.5;
		world.spawnYaw = Face.NORTH.yaw();
		world.spawnPitch = 15.0F;
		return world;
	}
}
