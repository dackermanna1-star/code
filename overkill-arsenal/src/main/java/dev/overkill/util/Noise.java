package dev.overkill.util;

import net.minecraft.util.Mth;

/** Cheap seeded 3D value noise in [-1, 1], used to make craters and scorch marks look ragged. */
public final class Noise {
	private final long seed;
	private final double scale;

	public Noise(long seed, double scale) {
		this.seed = seed;
		this.scale = scale;
	}

	public double sample(double x, double y, double z) {
		x /= this.scale;
		y /= this.scale;
		z /= this.scale;
		int x0 = Mth.floor(x);
		int y0 = Mth.floor(y);
		int z0 = Mth.floor(z);
		double fx = smooth(x - x0);
		double fy = smooth(y - y0);
		double fz = smooth(z - z0);
		double c000 = this.hash(x0, y0, z0);
		double c100 = this.hash(x0 + 1, y0, z0);
		double c010 = this.hash(x0, y0 + 1, z0);
		double c110 = this.hash(x0 + 1, y0 + 1, z0);
		double c001 = this.hash(x0, y0, z0 + 1);
		double c101 = this.hash(x0 + 1, y0, z0 + 1);
		double c011 = this.hash(x0, y0 + 1, z0 + 1);
		double c111 = this.hash(x0 + 1, y0 + 1, z0 + 1);
		double x00 = Mth.lerp(fx, c000, c100);
		double x10 = Mth.lerp(fx, c010, c110);
		double x01 = Mth.lerp(fx, c001, c101);
		double x11 = Mth.lerp(fx, c011, c111);
		return Mth.lerp(fz, Mth.lerp(fy, x00, x10), Mth.lerp(fy, x01, x11));
	}

	private static double smooth(double t) {
		return t * t * (3.0 - 2.0 * t);
	}

	private double hash(int x, int y, int z) {
		long h = this.seed;
		h ^= x * 0x9E3779B97F4A7C15L;
		h = Long.rotateLeft(h, 27) * 0xBF58476D1CE4E5B9L;
		h ^= y * 0xC2B2AE3D27D4EB4FL;
		h = Long.rotateLeft(h, 31) * 0x94D049BB133111EBL;
		h ^= z * 0x165667B19E3779F9L;
		h ^= h >>> 29;
		h *= 0xBF58476D1CE4E5B9L;
		h ^= h >>> 32;
		return ((h >>> 11) * 0x1.0p-53) * 2.0 - 1.0;
	}
}
