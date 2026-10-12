package com.mineception.dream;

import static com.mineception.dream.MiniBlock.AIR;
import static com.mineception.dream.MiniBlock.CRACKED_STONE_BRICKS;
import static com.mineception.dream.MiniBlock.DARK_OAK_PLANKS;
import static com.mineception.dream.MiniBlock.MOSSY_STONE_BRICKS;
import static com.mineception.dream.MiniBlock.PRISMARINE;
import static com.mineception.dream.MiniBlock.SAND;
import static com.mineception.dream.MiniBlock.SANDSTONE;
import static com.mineception.dream.MiniBlock.STONE;
import static com.mineception.dream.MiniBlock.STONE_BRICKS;
import static com.mineception.dream.MiniBlock.WATER;

/**
 * Level 4, Limbo: an endless dusk over a dune beach. A lone desk stands near the waterline; beyond it the sea swallows
 * the crumbling remains of a city: a broken arch, toppled sandstone columns and the shell of a collapsing tower. The
 * level is turned so the player looks west, into the sunset. Built in the canonical frame (looking north out to sea).
 */
final class LimboLevel {
	/** Highest water layer; the sea's surface is at W + 1. */
	private static final int W = 6;
	/** Camp level: the sand under the desk is one block above the sea. */
	private static final int G = W + 2;
	/** Quarter turns that make the canonical north (the sea) face west, toward the setting sun. */
	private static final int TURN_TO_WEST = 3;

	private final MiniWorld w;
	private final DreamRandom r;
	private final Noise noise;
	/** Waterline row, laptop position and spawn distance. */
	private final int shore;
	private final int lx;
	private final int lz;
	private final int distance;

	private LimboLevel(MiniWorld w, DreamRandom r) {
		this.w = w;
		this.r = r;
		this.noise = new Noise(r.nextLong());
		this.shore = r.range(24, 26);
		this.lx = r.range(18, 21);
		this.lz = shore + 1;
		this.distance = r.range(WorldGen.MIN_SPAWN_DISTANCE, WorldGen.MAX_SPAWN_DISTANCE);
	}

	static WorldGen.Stage build(MiniWorld w, DreamRandom random) {
		return new LimboLevel(w, random).build();
	}

	private WorldGen.Stage build() {
		terrain();
		arch();
		tower();
		columns();
		rubble();
		return new WorldGen.Stage(lx, G, lz, distance, DARK_OAK_PLANKS, SAND, TURN_TO_WEST);
	}

	private void terrain() {
		for (int z = 0; z < 40; z++) {
			for (int x = 0; x < 40; x++) {
				int h = surface(x, z);
				Build.column(w, x, 1, h - 3, z, STONE);
				Build.column(w, x, Math.max(1, h - 2), h, z, h <= W && noise.value(x, z, 5.0) > 0.7 ? STONE : SAND);
				if (h > W + 1 && noise.value(x + 50, z, 3.0) > 0.72) {
					// Wind-carved sandstone showing through the dunes
					w.set(x, h, z, SANDSTONE);
				}
				for (int y = h + 1; y <= W; y++) {
					w.set(x, y, z, WATER);
				}
			}
		}
	}

	/** Height of the sand (or sea floor) in a column. */
	private int surface(int x, int z) {
		double wobble = (noise.value(x, z, 7.0) - 0.5) * 3.0;
		double edge = z - shore + wobble * 0.7;
		boolean camp = Math.abs(x - lx) <= 3 && z >= lz && z <= lz + distance + 1;
		if (camp) {
			return G - 1;
		}
		if (edge < 0) {
			// The sea floor drops away from the beach
			return Build.clamp((int) Math.round(W - 0.6 + edge * 0.45 + wobble * 0.5), 2, W);
		}
		// Dunes rise inland
		double dune = noise.fbm(x, z, 9.0, 2);
		int h = (int) Math.round(W + edge * 0.35 + (dune - 0.4) * Math.min(1.0, edge / 6.0) * 7.0);
		return Build.clamp(h, W, W + 9);
	}

	private MiniBlock ruin() {
		double v = r.nextDouble();
		return v < 0.35 ? CRACKED_STONE_BRICKS : v < 0.6 ? MOSSY_STONE_BRICKS : STONE_BRICKS;
	}

	/** A broken arch standing in the shallows beyond the desk, on the line of the view. */
	private void arch() {
		int az = shore - r.range(7, 10);
		int ax = lx + r.range(-2, 2);
		int span = r.range(2, 3);
		int top = W + r.range(7, 9);
		int broken = r.sign();
		for (int side = -1; side <= 1; side += 2) {
			int px = ax + side * span;
			int pillarTop = side == broken ? top - r.range(2, 4) : top;
			for (int y = floor(px, az); y <= pillarTop; y++) {
				w.set(px, y, az, ruin());
			}
		}
		// The lintel survives only over the unbroken pillar's half
		for (int x = ax - span; x <= ax + span; x++) {
			if (Integer.signum(x - ax) != broken) {
				w.set(x, top + 1, az, ruin());
			}
		}
		w.set(ax, top + 1, az, ruin());
	}

	/** The shell of a collapsing tower on one side, its seaward end already sinking into the water. */
	private void tower() {
		int side = r.sign();
		int x0 = side < 0 ? r.range(1, 4) : r.range(28, 31);
		int x1 = x0 + r.range(6, 8);
		int z0 = shore - r.range(9, 12);
		int z1 = z0 + r.range(7, 9);
		int peak = W + r.range(13, 18);
		for (int z = z0; z <= z1; z++) {
			for (int x = x0; x <= x1; x++) {
				boolean wall = x == x0 || x == x1 || z == z0 || z == z1;
				if (!wall) {
					continue;
				}
				// Walls crumble toward the sea and toward the open side
				double decay = (z1 - z) / (double) (z1 - z0) * 0.6 + noise.value(x * 3, z * 3, 2.0) * 0.5;
				int top = (int) Math.round(peak - decay * (peak - W));
				for (int y = floor(x, z); y <= top; y++) {
					boolean window = (y - W) % 4 == 2 && (x + z) % 3 == 1;
					w.set(x, y, z, window ? AIR : ruin());
				}
			}
		}
		// Floors of the tower survive in places
		for (int y = W + 4; y < peak - 2; y += 4) {
			for (int z = z0 + 1; z < z1; z++) {
				for (int x = x0 + 1; x < x1; x++) {
					if (noise.value(x * 5 + y, z * 5, 2.0) > 0.45) {
						w.set(x, y, z, ruin());
					}
				}
			}
		}
	}

	/** A colonnade of sandstone columns along the beach and into the water, some broken, some toppled. */
	private void columns() {
		int side = r.sign();
		int x = lx + side * r.range(5, 7);
		int count = r.range(4, 6);
		for (int i = 0; i < count; i++) {
			int z = shore + 4 - i * 3;
			if (z < 1) {
				break;
			}
			int base = floor(x, z);
			int height = r.chance(0.3) ? r.range(1, 3) : r.range(5, 10);
			for (int y = base; y < base + height && y < MiniWorld.SY - 1; y++) {
				w.set(x, y, z, SANDSTONE);
			}
			if (height >= 5 && r.chance(0.6)) {
				w.set(x, base + height, z, SANDSTONE);
				w.set(x - 1, base + height, z, SANDSTONE);
				w.set(x + 1, base + height, z, SANDSTONE);
			}
			if (height < 5) {
				// The rest of the column lies where it fell
				int dir = r.sign();
				for (int k = 1; k <= r.range(3, 5); k++) {
					int fx = x + dir * k;
					w.set(fx, floor(fx, z), z, SANDSTONE);
				}
			}
		}
	}

	/** Scattered blocks: fallen masonry on the sand and sunken prismarine-crusted stones in the sea. */
	private void rubble() {
		int pieces = r.range(14, 22);
		for (int i = 0; i < pieces; i++) {
			int x = r.range(1, 38);
			int z = r.range(2, shore + 8);
			if (Math.abs(x - lx) <= 3 && z >= lz - 2) {
				continue;
			}
			int y = floor(x, z);
			MiniBlock block = y <= W - 1 && r.chance(0.4) ? PRISMARINE : r.chance(0.6) ? ruin() : SANDSTONE;
			w.set(x, y, z, block);
			if (r.chance(0.35)) {
				w.set(x, y + 1, z, ruin());
			}
		}
	}

	/** First non-solid cell above the ground (sea floor or sand) in a column. */
	private int floor(int x, int z) {
		int y = 1;
		while (y < MiniWorld.SY && w.get(x, y, z).solid()) {
			y++;
		}
		return y;
	}
}
