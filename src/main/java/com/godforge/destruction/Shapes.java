package com.godforge.destruction;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import net.minecraft.util.Mth;
import net.minecraft.util.Util;

/**
 * Asynchronously generated, cached voxel shapes. Offsets are packed into ints and sorted by distance
 * from the origin so jobs that walk them in order produce outward-expanding destruction.
 */
public final class Shapes {
	public static final int MAX_RADIUS = 72;
	private static final int CACHE_SIZE = 10;
	private static final Map<Integer, CompletableFuture<int[]>> SPHERES = new LinkedHashMap<>(16, 0.75F, true) {
		@Override
		protected boolean removeEldestEntry(Map.Entry<Integer, CompletableFuture<int[]>> eldest) {
			return this.size() > CACHE_SIZE;
		}
	};

	private Shapes() {
	}

	public static int pack(int dx, int dy, int dz) {
		return (dx + 512) << 20 | (dy + 512) << 10 | (dz + 512);
	}

	public static int dx(int packed) {
		return (packed >> 20 & 1023) - 512;
	}

	public static int dy(int packed) {
		return (packed >> 10 & 1023) - 512;
	}

	public static int dz(int packed) {
		return (packed & 1023) - 512;
	}

	/** Every offset within {@code radius + 0.5} of the origin, nearest first. Computed off-thread and cached. */
	public static CompletableFuture<int[]> sortedSphere(int radius) {
		int r = Mth.clamp(radius, 1, MAX_RADIUS);
		synchronized (SPHERES) {
			return SPHERES.computeIfAbsent(r, key -> CompletableFuture.supplyAsync(() -> computeSphere(key), Util.backgroundExecutor()));
		}
	}

	static int[] computeSphere(int r) {
		int limit = r * r + r;
		int[] counts = new int[limit + 2];
		int total = 0;
		for (int x = -r; x <= r; x++) {
			for (int y = -r; y <= r; y++) {
				for (int z = -r; z <= r; z++) {
					int d = x * x + y * y + z * z;
					if (d <= limit) {
						counts[d + 1]++;
						total++;
					}
				}
			}
		}
		for (int i = 1; i < counts.length; i++) {
			counts[i] += counts[i - 1];
		}
		int[] out = new int[total];
		for (int x = -r; x <= r; x++) {
			for (int y = -r; y <= r; y++) {
				for (int z = -r; z <= r; z++) {
					int d = x * x + y * y + z * z;
					if (d <= limit) {
						out[counts[d]++] = pack(x, y, z);
					}
				}
			}
		}
		return out;
	}

	/** All horizontal offsets within the radius, nearest first (packed with dy = 0). */
	public static int[] sortedDisc(int radius) {
		int r = Mth.clamp(radius, 1, 256);
		int limit = r * r + r;
		int[] counts = new int[limit + 2];
		int total = 0;
		for (int x = -r; x <= r; x++) {
			for (int z = -r; z <= r; z++) {
				int d = x * x + z * z;
				if (d <= limit) {
					counts[d + 1]++;
					total++;
				}
			}
		}
		for (int i = 1; i < counts.length; i++) {
			counts[i] += counts[i - 1];
		}
		int[] out = new int[total];
		for (int x = -r; x <= r; x++) {
			for (int z = -r; z <= r; z++) {
				int d = x * x + z * z;
				if (d <= limit) {
					out[counts[d]++] = pack(x, 0, z);
				}
			}
		}
		return out;
	}
}
