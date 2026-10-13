package dev.calibercraft.core;

import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.util.StringRepresentable;

/**
 * A single transparent stat change contributed by an attachment, ammunition type or config.
 * Final value = (base + sum(ADD)) * product(MULTIPLY), then clamped by {@link Stat#clamp}.
 */
public record StatModifier(Stat stat, Operation operation, double value) {
	public static final Codec<Stat> STAT_CODEC = Codec.STRING.comapFlatMap(
		key -> {
			Stat s = Stat.byKey(key);
			return s != null ? DataResult.success(s) : DataResult.error(() -> "Unknown weapon stat: " + key);
		},
		s -> s.key
	);

	public static final Codec<StatModifier> CODEC = RecordCodecBuilder.create(i -> i.group(
		STAT_CODEC.fieldOf("stat").forGetter(StatModifier::stat),
		Operation.CODEC.optionalFieldOf("op", Operation.ADD).forGetter(StatModifier::operation),
		Codec.DOUBLE.fieldOf("value").forGetter(StatModifier::value)
	).apply(i, StatModifier::new));

	public static StatModifier add(Stat stat, double v) {
		return new StatModifier(stat, Operation.ADD, v);
	}

	public static StatModifier mul(Stat stat, double v) {
		return new StatModifier(stat, Operation.MULTIPLY, v);
	}

	public enum Operation implements StringRepresentable {
		ADD("add"),
		MULTIPLY("multiply");

		public static final Codec<Operation> CODEC = StringRepresentable.fromEnum(Operation::values);
		private final String name;

		Operation(String name) {
			this.name = name;
		}

		@Override
		public String getSerializedName() {
			return name;
		}
	}
}
