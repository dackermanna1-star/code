package dev.calibercraft.core;

import com.mojang.serialization.Codec;
import java.util.EnumMap;
import java.util.Map;

/** Immutable base statistics of a weapon. Missing entries fall back to {@link Stat#defaultValue}. */
public final class StatBlock {
	public static final Codec<StatBlock> CODEC = Codec.unboundedMap(StatModifier.STAT_CODEC, Codec.DOUBLE)
		.xmap(StatBlock::new, b -> b.explicit);
	public static final StatBlock EMPTY = new StatBlock(Map.of());

	private final Map<Stat, Double> explicit;
	private final double[] values = new double[Stat.values().length];

	public StatBlock(Map<Stat, Double> explicit) {
		EnumMap<Stat, Double> copy = new EnumMap<>(Stat.class);
		copy.putAll(explicit);
		this.explicit = java.util.Collections.unmodifiableMap(copy);
		for (Stat s : Stat.values()) {
			values[s.ordinal()] = s.clamp(copy.getOrDefault(s, s.defaultValue));
		}
	}

	public double get(Stat stat) {
		return values[stat.ordinal()];
	}

	public Map<Stat, Double> explicitValues() {
		return explicit;
	}

	/** Returns a copy with the given values replaced (used for config overrides). */
	public StatBlock with(Map<Stat, Double> overrides) {
		EnumMap<Stat, Double> m = new EnumMap<>(Stat.class);
		m.putAll(explicit);
		m.putAll(overrides);
		return new StatBlock(m);
	}
}
