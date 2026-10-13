package dev.calibercraft.core;

import java.util.SplittableRandom;

/** Deterministic spread, damage falloff and armour maths. */
public final class Ballistics {
	private Ballistics() {
	}

	/** Mixes a per-session salt with a shot sequence number into a well-distributed seed. */
	public static long shotSeed(long salt, int seq) {
		long z = salt ^ (seq * 0x9E3779B97F4A7C15L);
		z = (z ^ (z >>> 33)) * 0xff51afd7ed558ccdL;
		z = (z ^ (z >>> 33)) * 0xc4ceb9fe1a85ec53L;
		return z ^ (z >>> 33);
	}

	/** Unit look vector for Minecraft yaw/pitch in degrees. */
	public static double[] direction(double yawDeg, double pitchDeg) {
		double yaw = Math.toRadians(yawDeg);
		double pitch = Math.toRadians(pitchDeg);
		double cp = Math.cos(pitch);
		return new double[] {-Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp};
	}

	/**
	 * Writes {@code pellets} unit directions (x,y,z triples) inside a cone of half-angle {@code spreadDeg}
	 * around {@code dir}. Identical inputs always give identical outputs on client and server.
	 */
	public static double[] pelletDirections(long seed, double[] dir, double spreadDeg, int pellets) {
		SplittableRandom rng = new SplittableRandom(seed);
		double[] out = new double[pellets * 3];
		// Orthonormal basis around dir.
		double[] up = Math.abs(dir[1]) > 0.99 ? new double[] {1, 0, 0} : new double[] {0, 1, 0};
		double[] right = normalize(cross(dir, up));
		double[] upv = normalize(cross(right, dir));
		double maxTan = Math.tan(Math.toRadians(Math.max(0, spreadDeg)));
		for (int p = 0; p < pellets; p++) {
			double r = Math.pow(rng.nextDouble(), 0.75) * maxTan; // mild centre bias
			double a = rng.nextDouble() * Math.PI * 2;
			double ox = Math.cos(a) * r;
			double oy = Math.sin(a) * r;
			double[] d = {
				dir[0] + right[0] * ox + upv[0] * oy,
				dir[1] + right[1] * ox + upv[1] * oy,
				dir[2] + right[2] * ox + upv[2] * oy
			};
			d = normalize(d);
			out[p * 3] = d[0];
			out[p * 3 + 1] = d[1];
			out[p * 3 + 2] = d[2];
		}
		return out;
	}

	/** Damage multiplier for a hit at {@code distance} blocks. */
	public static double falloff(double distance, double effectiveRange, double maxRange, double minMult) {
		if (distance <= effectiveRange) {
			return 1.0;
		}
		if (maxRange <= effectiveRange) {
			return minMult;
		}
		double f = Math.min(1.0, (distance - effectiveRange) / (maxRange - effectiveRange));
		return 1.0 + (minMult - 1.0) * f;
	}

	/**
	 * Vanilla armour formula (CombatRules) with a fraction of armour ignored. Returns the damage that gets
	 * through. Matches vanilla exactly when {@code armorPenetration == 0}.
	 */
	public static double afterArmor(double damage, double armor, double toughness, double armorPenetration) {
		double effArmor = armor * (1.0 - Math.max(0, Math.min(1, armorPenetration)));
		double f = 2.0 + toughness / 4.0;
		double j = Math.max(effArmor * 0.2, Math.min(20.0, effArmor - damage / f));
		return damage * (1.0 - j / 25.0);
	}

	/** Effective cone (degrees) for the current handling state. */
	public static double spread(double hip, double ads, double aimProgress, double moveMult, boolean moving, double bloom) {
		double base = hip + (ads - hip) * Math.max(0, Math.min(1, aimProgress));
		if (moving) {
			base *= moveMult;
		}
		return base + bloom;
	}

	private static double[] cross(double[] a, double[] b) {
		return new double[] {a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]};
	}

	private static double[] normalize(double[] v) {
		double l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
		return l < 1e-12 ? new double[] {0, 0, 1} : new double[] {v[0] / l, v[1] / l, v[2] / l};
	}
}
