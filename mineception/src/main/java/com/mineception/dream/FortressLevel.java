package com.mineception.dream;

import static com.mineception.dream.MiniBlock.AIR;
import static com.mineception.dream.MiniBlock.CRACKED_STONE_BRICKS;
import static com.mineception.dream.MiniBlock.CRAFTING_TABLE;
import static com.mineception.dream.MiniBlock.DARK_OAK_PLANKS;
import static com.mineception.dream.MiniBlock.DEEPSLATE_TILES;
import static com.mineception.dream.MiniBlock.GLASS;
import static com.mineception.dream.MiniBlock.GLOWSTONE;
import static com.mineception.dream.MiniBlock.ICE;
import static com.mineception.dream.MiniBlock.MOSSY_STONE_BRICKS;
import static com.mineception.dream.MiniBlock.PACKED_ICE;
import static com.mineception.dream.MiniBlock.RED_WOOL;
import static com.mineception.dream.MiniBlock.SNOW_BLOCK;
import static com.mineception.dream.MiniBlock.SPRUCE_LEAVES;
import static com.mineception.dream.MiniBlock.SPRUCE_LOG;
import static com.mineception.dream.MiniBlock.STONE;
import static com.mineception.dream.MiniBlock.STONE_BRICKS;
import static com.mineception.dream.MiniBlock.WATER;
import static com.mineception.dream.MiniBlock.WHITE_WOOL;

/**
 * Level 3, The Fortress: snowy mountains around a frozen lake. The laptop stands on a crafting table at a small camp on
 * the south shore; across the ice a stone-brick fortress with towers and a flag-topped keep sits on a rise, framed by
 * spruce forest and peaks. Built in the canonical frame (looking north across the lake).
 */
final class FortressLevel {
	/** Camp level: first air layer above the snow at the camp. */
	private static final int G = 9;
	/** Ice layer of the frozen lake (its top is one block below the camp). */
	private static final int ICE_Y = G - 2;

	private final MiniWorld w;
	private final DreamRandom r;
	private final Noise noise;
	private final int[] height = new int[40 * 40];
	private final boolean[] lake = new boolean[40 * 40];
	/** Fortress centre and half size; camp laptop position. */
	private final int fx;
	private final int fz;
	private final int half;
	private final int plateau;
	private final int lx;
	private final int lz;
	private final int distance;

	private FortressLevel(MiniWorld w, DreamRandom r) {
		this.w = w;
		this.r = r;
		this.noise = new Noise(r.nextLong());
		this.lx = r.range(17, 22);
		this.lz = r.range(31, 33);
		this.distance = r.range(WorldGen.MIN_SPAWN_DISTANCE, WorldGen.MAX_SPAWN_DISTANCE);
		this.half = r.range(5, 6);
		this.fx = Build.clamp(lx + r.range(-3, 3), half + 4, 39 - half - 4);
		this.fz = r.range(9, 11);
		this.plateau = G + r.range(0, 1);
	}

	static WorldGen.Stage build(MiniWorld w, DreamRandom random) {
		return new FortressLevel(w, random).build();
	}

	private WorldGen.Stage build() {
		terrain();
		fortress();
		trees();
		camp();
		MiniBlock desk = r.chance(0.75) ? CRAFTING_TABLE : SPRUCE_LOG;
		return new WorldGen.Stage(lx, G, lz, distance, desk, SNOW_BLOCK, r.nextInt(4));
	}

	// ------------------------------------------------------------------ terrain

	private void terrain() {
		double lakeCx = (lx + fx) / 2.0 + r.range(-2, 2);
		double lakeZ0 = fz + half + 3;
		double lakeZ1 = lz - 2;
		double lakeCz = (lakeZ0 + lakeZ1) / 2.0;
		double lakeRx = r.range(10, 13);
		double lakeRz = (lakeZ1 - lakeZ0) / 2.0 + 0.5;
		for (int z = 0; z < 40; z++) {
			for (int x = 0; x < 40; x++) {
				double n = noise.fbm(x, z, 12.0, 3);
				// Mountains rise toward the north and the east and west edges
				double sides = Math.max(0.0, (Math.abs(x - 19.5) - 11.0) / 8.5);
				double north = Math.max(0.0, (8.0 - z) / 8.0);
				double ridge = Math.max(sides, north * 1.2);
				int h = G - 1 + (int) Math.round((n - 0.5) * 3.0 + ridge * ridge * (9.0 + 9.0 * n));
				// The fortress rise
				double fd = Math.max(Math.abs(x - fx), Math.abs(z - fz)) - half;
				if (fd <= 2) {
					h = plateau - 1;
				} else if (fd <= 5) {
					h = Math.max(h, plateau - 1 - (int) (fd - 2) / 2);
				}
				// The frozen lake, with a wobbly shore
				double dx = (x + 0.5 - lakeCx) / lakeRx;
				double dz = (z + 0.5 - lakeCz) / lakeRz;
				double d = dx * dx + dz * dz + (noise.value(x, z, 4.0) - 0.5) * 0.35;
				boolean camp = Math.abs(x - lx) <= 3 && z >= lz - 1;
				if (camp) {
					h = G - 1;
				} else if (d < 1.0 && fd > 2) {
					lake[z * 40 + x] = true;
					h = ICE_Y - 1 - (d < 0.35 ? 2 : d < 0.7 ? 1 : 0);
				} else if (d < 1.4 && fd > 2) {
					h = Math.min(h, ICE_Y);
				} else if (d < 1.9 && fd > 2) {
					h = Math.min(h, ICE_Y + 1);
				}
				height[z * 40 + x] = Build.clamp(h, 2, 27);
			}
		}
		for (int z = 0; z < 40; z++) {
			for (int x = 0; x < 40; x++) {
				int h = height[z * 40 + x];
				Build.column(w, x, 1, h, z, STONE);
				if (lake[z * 40 + x]) {
					Build.column(w, x, h + 1, ICE_Y - 1, z, WATER);
					w.set(x, ICE_Y, z, noise.value(x, z, 2.0) > 0.78 ? PACKED_ICE : ICE);
				} else if (steep(x, z) >= 3) {
					// Bare rock on cliffs, with the odd ice vein
					if (noise.value(x + 100, z, 3.0) > 0.8) {
						w.set(x, h, z, PACKED_ICE);
					}
				} else {
					w.set(x, h, z, SNOW_BLOCK);
				}
			}
		}
	}

	private int heightAt(int x, int z) {
		return height[Build.clamp(z, 0, 39) * 40 + Build.clamp(x, 0, 39)];
	}

	private int steep(int x, int z) {
		int h = heightAt(x, z);
		int max = 0;
		for (Face f : Face.HORIZONTAL) {
			max = Math.max(max, h - heightAt(x + f.dx, z + f.dz));
		}
		return max;
	}

	// ------------------------------------------------------------------ fortress

	private MiniBlock brick() {
		double v = r.nextDouble();
		return v < 0.16 ? MOSSY_STONE_BRICKS : v < 0.3 ? CRACKED_STONE_BRICKS : STONE_BRICKS;
	}

	private void bricks(int x0, int y0, int z0, int x1, int y1, int z1) {
		for (int y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
			for (int z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
				for (int x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
					w.set(x, y, z, brick());
				}
			}
		}
	}

	/** Alternating merlons around the top of a rectangle, capped with snow here and there. */
	private void crenellate(int x0, int z0, int x1, int z1, int y) {
		for (int x = x0; x <= x1; x++) {
			for (int z = z0; z <= z1; z++) {
				boolean edge = x == x0 || x == x1 || z == z0 || z == z1;
				if (edge && Math.floorMod(x + z, 2) == 0) {
					w.set(x, y, z, r.chance(0.3) ? SNOW_BLOCK : brick());
				}
			}
		}
	}

	private void fortress() {
		boolean spires = r.chance(0.5);
		boolean greatKeep = r.chance(0.45);
		int base = plateau;
		int wallTop = base + r.range(5, 6);
		int x0 = fx - half;
		int x1 = fx + half;
		int z0 = fz - half;
		int z1 = fz + half;
		// Courtyard and curtain walls with a walkway
		Build.fill(w, x0, base - 1, z0, x1, base - 1, z1, SNOW_BLOCK);
		for (int y = base; y <= wallTop; y++) {
			for (int x = x0; x <= x1; x++) {
				w.set(x, y, z0, brick());
				w.set(x, y, z1, brick());
			}
			for (int z = z0; z <= z1; z++) {
				w.set(x0, y, z, brick());
				w.set(x1, y, z, brick());
			}
		}
		crenellate(x0, z0, x1, z1, wallTop + 1);
		// Corner towers
		int towerTop = wallTop + r.range(3, 4);
		for (int cx : new int[]{x0, x1}) {
			for (int cz : new int[]{z0, z1}) {
				tower(cx, cz, 1, base, towerTop, spires);
			}
		}
		// Gate facing the camp; the great keep's gate gets a gatehouse of two small towers
		int gateW = 1;
		if (greatKeep) {
			for (int side = -1; side <= 1; side += 2) {
				tower(fx + side * 3, z1, 1, base, wallTop + 2, spires);
			}
		}
		Build.fill(w, fx - gateW, base, z1, fx + gateW, base + 2, z1, AIR);
		w.set(fx, base + 3, z1, AIR);
		w.set(fx - 2, base + 3, z1 + (greatKeep ? 2 : 1), GLOWSTONE);
		w.set(fx + 2, base + 3, z1 + (greatKeep ? 2 : 1), GLOWSTONE);
		// The keep: a tall tower with lit windows and a red banner
		int kx = fx;
		int kz = fz - 1;
		int kh = greatKeep ? 3 : 2;
		int maxTop = spires ? MiniWorld.SY - kh - 8 : MiniWorld.SY - 6;
		int keepTop = Math.min(base + (greatKeep ? r.range(13, 15) : r.range(11, 13)), maxTop);
		bricks(kx - kh, base, kz - kh, kx + kh, keepTop, kz + kh);
		for (int y = base + 3; y < keepTop - 1; y += 3) {
			for (Face f : Face.HORIZONTAL) {
				for (int u = -kh + 1; u <= kh - 1; u += 2) {
					int wx = kx + f.dx * kh + (f.dx == 0 ? u : 0);
					int wz = kz + f.dz * kh + (f.dz == 0 ? u : 0);
					w.set(wx, y, wz, GLASS);
					w.set(wx - f.dx, y, wz - f.dz, r.chance(0.6) ? GLOWSTONE : DARK_OAK_PLANKS);
				}
			}
		}
		Build.fill(w, kx, base, kz + kh, kx, base + 1, kz + kh, DARK_OAK_PLANKS);
		int poleBase;
		if (spires) {
			poleBase = spire(kx, kz, kh, keepTop + 1) + 1;
		} else {
			crenellate(kx - kh, kz - kh, kx + kh, kz + kh, keepTop + 1);
			Build.fill(w, kx - kh + 1, keepTop, kz - kh + 1, kx + kh - 1, keepTop, kz + kh - 1, SNOW_BLOCK);
			poleBase = keepTop + 1;
		}
		int poleTop = Math.min(poleBase + (spires ? 1 : 3), MiniWorld.SY - 1);
		Build.column(w, kx, poleBase, poleTop, kz, SPRUCE_LOG);
		w.set(kx + 1, poleTop, kz, RED_WOOL);
		w.set(kx + 2, poleTop, kz, RED_WOOL);
		w.set(kx + 1, poleTop - 1, kz, RED_WOOL);
		// Ruined touch: a few bricks missing from the wall tops
		for (int i = 0; i < 4; i++) {
			int x = r.range(x0 + 2, x1 - 2);
			int z = r.nextBoolean() ? z0 : z1;
			if (Math.abs(x - fx) > gateW + 3) {
				w.set(x, wallTop + 1, z, AIR);
				w.set(x, wallTop, z, r.chance(0.5) ? AIR : SNOW_BLOCK);
			}
		}
	}

	/** A square tower of side 2 * {@code h} + 1 with a lit window on each side and a crenellated or pointed top. */
	private void tower(int cx, int cz, int h, int base, int top, boolean spire) {
		bricks(cx - h, base, cz - h, cx + h, top, cz + h);
		for (Face f : Face.HORIZONTAL) {
			w.set(cx + f.dx * h, top - 2, cz + f.dz * h, GLASS);
		}
		w.set(cx, top - 2, cz, GLOWSTONE);
		if (spire) {
			spire(cx, cz, h, top + 1);
		} else {
			crenellate(cx - h, cz - h, cx + h, cz + h, top + 1);
			w.set(cx, top, cz, SNOW_BLOCK);
		}
	}

	/** A stepped pyramid roof of dark tiles overhanging a tower, dusted with snow. Returns the y of its tip. */
	private int spire(int cx, int cz, int h, int y) {
		int size = h + 1;
		while (size >= 0 && y < MiniWorld.SY - 1) {
			for (int dz = -size; dz <= size; dz++) {
				for (int dx = -size; dx <= size; dx++) {
					boolean rim = Math.abs(dx) == size || Math.abs(dz) == size;
					w.set(cx + dx, y, cz + dz, rim && size > 0 && r.chance(0.4) ? SNOW_BLOCK : DEEPSLATE_TILES);
				}
			}
			size--;
			y++;
		}
		w.set(cx, y, cz, DEEPSLATE_TILES);
		return y;
	}

	// ------------------------------------------------------------------ forest and camp

	private void trees() {
		int count = r.range(26, 36);
		for (int i = 0; i < count * 3 && count > 0; i++) {
			int x = r.range(1, 38);
			int z = r.range(1, 38);
			if (!canGrow(x, z)) {
				continue;
			}
			spruce(x, heightAt(x, z) + 1, z);
			count--;
		}
	}

	private boolean canGrow(int x, int z) {
		if (lake[z * 40 + x] || w.get(x, heightAt(x, z), z) != SNOW_BLOCK) {
			return false;
		}
		// Keep the fortress, the shore, the camp and the view over the lake clear
		if (Math.max(Math.abs(x - fx), Math.abs(z - fz)) <= half + 3) {
			return false;
		}
		if (Math.abs(x - lx) <= 4 && z >= lz - 4) {
			return false;
		}
		if (Math.abs(x - lx) <= 6 && z > fz + half) {
			return false;
		}
		for (int dz = -2; dz <= 2; dz++) {
			for (int dx = -2; dx <= 2; dx++) {
				int nx = x + dx;
				int nz = z + dz;
				if (Build.inside(nx, nz) && lake[nz * 40 + nx]) {
					return false;
				}
				if (Build.inside(nx, nz) && w.get(nx, heightAt(nx, nz) + 1, nz) == SPRUCE_LOG) {
					return false;
				}
			}
		}
		return true;
	}

	/** A conical spruce with a dusting of snow. */
	private void spruce(int x, int y, int z) {
		int trunk = r.range(5, 8);
		if (y + trunk + 1 >= MiniWorld.SY) {
			return;
		}
		Build.column(w, x, y, y + trunk - 1, z, SPRUCE_LOG);
		int top = y + trunk;
		w.set(x, top, z, SNOW_BLOCK);
		int radius = 0;
		for (int ly = top - 1; ly >= y + 2; ly--) {
			int depth = top - ly;
			radius = depth == 1 ? 1 : depth % 2 == 0 ? Math.min(2, 1 + depth / 3) : 1;
			for (int dz = -radius; dz <= radius; dz++) {
				for (int dx = -radius; dx <= radius; dx++) {
					if (Math.abs(dx) + Math.abs(dz) > radius + (radius > 1 ? 1 : 0) || dx == 0 && dz == 0) {
						continue;
					}
					boolean snowy = Math.abs(dx) + Math.abs(dz) == radius && depth < 4 && r.chance(0.35);
					Build.setIfAir(w, x + dx, ly, z + dz, snowy ? SNOW_BLOCK : SPRUCE_LEAVES);
				}
			}
		}
	}

	/** Clears the air over the camp, and pitches a white tent with a lantern post off to one side of the spawn. */
	private void camp() {
		for (int z = lz - 1; z <= 39; z++) {
			for (int x = lx - 3; x <= lx + 3; x++) {
				Build.fill(w, x, G, z, x, MiniWorld.SY - 1, z, AIR);
			}
		}
		int side = r.sign();
		int tx = lx + side * 5;
		int tz = lz + distance - 1;
		if (heightAt(tx, tz) != G - 1) {
			return;
		}
		for (int z = tz; z <= tz + 2; z++) {
			Build.setIfAir(w, tx - 1, G, z, WHITE_WOOL);
			Build.setIfAir(w, tx + 1, G, z, WHITE_WOOL);
			Build.setIfAir(w, tx, G + 1, z, WHITE_WOOL);
		}
		Build.setIfAir(w, tx, G, tz + 2, WHITE_WOOL);
		int px = tx - side * 2;
		if (w.get(px, G, tz - 1) == AIR && w.get(px, G - 1, tz - 1).solid()) {
			w.set(px, G, tz - 1, SPRUCE_LOG);
			w.set(px, G + 1, tz - 1, GLOWSTONE);
		}
	}
}
