package dev.calibercraft.core;

import java.util.Collection;

/**
 * Final, modifier-applied statistics of one configured weapon. Pure value object; computing it is cheap
 * (a few dozen multiplications) so callers recompute rather than cache across loadout changes.
 */
public final class WeaponStats {
	private final double[] values;

	private WeaponStats(double[] values) {
		this.values = values;
	}

	public static WeaponStats compute(StatBlock base, Collection<StatModifier> modifiers) {
		int n = Stat.values().length;
		double[] add = new double[n];
		double[] mul = new double[n];
		java.util.Arrays.fill(mul, 1.0);
		for (StatModifier m : modifiers) {
			int i = m.stat().ordinal();
			if (m.operation() == StatModifier.Operation.ADD) {
				add[i] += m.value();
			} else {
				mul[i] *= m.value();
			}
		}
		double[] out = new double[n];
		for (Stat s : Stat.values()) {
			int i = s.ordinal();
			out[i] = s.clamp((base.get(s) + add[i]) * mul[i]);
		}
		return new WeaponStats(out);
	}

	public double get(Stat stat) {
		return values[stat.ordinal()];
	}

	public float f(Stat stat) {
		return (float) values[stat.ordinal()];
	}

	public int i(Stat stat) {
		return (int) Math.round(values[stat.ordinal()]);
	}

	/** Seconds between shots at the cyclic rate. */
	public double shotIntervalSeconds() {
		return 60.0 / get(Stat.RPM);
	}
}
