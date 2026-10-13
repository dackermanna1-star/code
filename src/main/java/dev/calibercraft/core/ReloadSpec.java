package dev.calibercraft.core;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Optional;
import net.minecraft.util.StringRepresentable;

/**
 * How a weapon reloads.
 * <ul>
 *   <li>{@code magazine}: {@code tactical} timeline when a round is chambered, {@code empty} otherwise
 *       (the empty timeline chambers a round at its {@code chamber} tick).</li>
 *   <li>{@code cylinder}: one timeline ({@code tactical}) that refills all chambers at {@code commit}.</li>
 *   <li>{@code single}: shell-by-shell loop described by {@link Single}.</li>
 * </ul>
 */
public record ReloadSpec(Type type, Timeline tactical, Timeline empty, Optional<Single> single) {
	public static final Codec<ReloadSpec> CODEC = RecordCodecBuilder.create(i -> i.group(
		Type.CODEC.fieldOf("type").forGetter(ReloadSpec::type),
		Timeline.CODEC.optionalFieldOf("tactical", Timeline.NONE).forGetter(ReloadSpec::tactical),
		Timeline.CODEC.optionalFieldOf("empty", Timeline.NONE).forGetter(ReloadSpec::empty),
		Single.CODEC.optionalFieldOf("single").forGetter(ReloadSpec::single)
	).apply(i, ReloadSpec::new));

	public enum Type implements StringRepresentable {
		MAGAZINE("magazine"),
		CYLINDER("cylinder"),
		SINGLE("single");

		public static final Codec<Type> CODEC = StringRepresentable.fromEnum(Type::values);
		private final String name;

		Type(String name) {
			this.name = name;
		}

		@Override
		public String getSerializedName() {
			return name;
		}
	}

	/**
	 * Shell-by-shell loading: {@code start}, then loops of {@code perRound} ticks (a round is committed at
	 * {@code roundCommit} within each loop), then {@code end} (or {@code endEmpty} when the chamber is empty and
	 * must be cycled, e.g. a pump stroke; its {@code chamber} tick chambers a round).
	 */
	public record Single(Timeline start, float perRound, float roundCommit, String roundCue, Timeline end, Timeline endEmpty) {
		public static final Codec<Single> CODEC = RecordCodecBuilder.create(i -> i.group(
			Timeline.CODEC.fieldOf("start").forGetter(Single::start),
			Codec.FLOAT.fieldOf("per_round").forGetter(Single::perRound),
			Codec.FLOAT.fieldOf("round_commit").forGetter(Single::roundCommit),
			Codec.STRING.optionalFieldOf("round_cue", "shell_insert").forGetter(Single::roundCue),
			Timeline.CODEC.fieldOf("end").forGetter(Single::end),
			Timeline.CODEC.fieldOf("end_empty").forGetter(Single::endEmpty)
		).apply(i, Single::new));
	}
}
