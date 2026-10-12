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
		towers();
		columns();
		rubble();
		return new WorldGen.Stage(lx, G, lz, distance, DARK_OAK_PLANKS, SAND, TURN_TO_WEST);
	}

	private void terrain() {
		for (int z = 0; z < 40; z++) {
			for (int x = 0; x < 40; x++) {
				int h = surface(x, z);
				// Sand over sandstone, with the odd rocky patch on the sea floor
				Build.column(w, x, 1, h - 5, z, STONE);
				Build.column(w, x, Math.max(1, h - 4), h - 3, z, SANDSTONE);
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
		// Dunes rise inland, sloping gently up from the flattened camp instead of walling it in
		double dune = noise.fbm(x, z, 9.0, 2);
		int h = (int) Math.round(W + edge * 0.35 + (dune - 0.4) * Math.min(1.0, edge / 6.0) * 7.0);
		int dx = Math.max(0, Math.abs(x - lx) - 3);
		int dz = Math.max(0, Math.max(lz - z, z - (lz + distance + 1)));
		h = Math.min(h, G - 1 + Math.max(dx, dz));
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

	/**
	 * The drowned city: hollow tower shells standing in the sea on both sides of the view, eroded at the top, their
	 * empty windows letting the sunset through, some leaning as they topple into the water.
	 */
	private void towers() {
		int side = r.sign();
		// A tall one close by on one side, a lower one further out on the other, sometimes a third far away
		tower(lx + side * r.range(8, 11), shore - r.range(6, 9), r.range(5, 7), r.range(5, 7), r.range(15, 21), side);
		tower(lx - side * r.range(7, 12), shore - r.range(12, 16), r.range(5, 8), r.range(5, 7), r.range(10, 16), -side);
		if (r.chance(0.6)) {
			tower(lx + side * r.range(-3, 3), r.range(1, 4), r.range(4, 6), r.range(4, 6), r.range(8, 13), r.sign());
		}
	}

	/**
	 * One ruined tower centred on (cx, cz), {@code sx} by {@code sz} blocks, rising {@code height} blocks above the sea.
	 * Leaning towers shift one block toward {@code leanX} every few storeys.
	 */
	private void tower(int cx, int cz, int sx, int sz, int height, int leanX) {
		int x0 = cx - sx / 2;
		int z0 = cz - sz / 2;
		int leanEvery = r.chance(0.55) ? r.range(4, 6) : 0;
		long erosion = r.nextLong();
		int top = W + height;
		for (int y = 1; y <= top && y < MiniWorld.SY - 1; y++) {
			int level = y - W;
			int shift = leanEvery > 0 && level > 0 ? level / leanEvery * leanX : 0;
			boolean floor = level > 0 && level % 4 == 0;
			for (int dz = 0; dz < sz; dz++) {
				for (int dx = 0; dx < sx; dx++) {
					int x = x0 + dx + shift;
					int z = z0 + dz;
					boolean wall = dx == 0 || dz == 0 || dx == sx - 1 || dz == sz - 1;
					if (!wall && !floor) {
						continue;
					}
					// The jagged top: each column of the wall ends at its own height
					double crumble = DreamRandom.hash01(erosion, dx + dz * 7, 0, 0);
					int columnTop = top - (int) (crumble * crumble * height * 0.7);
					if (y > columnTop) {
						continue;
					}
					double decay = Math.max(0.0, level / (double) height);
					if (y > W && DreamRandom.hash01(erosion, x, y, z) < decay * 0.3) {
						continue;
					}
					if (floor && !wall) {
						if (DreamRandom.hash01(erosion + 1, x, y, z) < 0.45) {
							w.set(x, y, z, ruin());
						}
						continue;
					}
					int along = dx == 0 || dx == sx - 1 ? dz : dx;
					boolean corner = (dx == 0 || dx == sx - 1) && (dz == 0 || dz == sz - 1);
					boolean window = level > 1 && !corner && (level % 4 == 2 || level % 4 == 3) && along % 2 == 1;
					w.set(x, y, z, window ? AIR : ruin());
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
