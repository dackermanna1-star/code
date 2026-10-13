package dev.calibercraft.core;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * A fixed-length action (magazine swap, charging, bolt cycle...). Times are in ticks at normal speed.
 * {@code commit} is the moment rounds are transferred, {@code chamber} the moment a round is chambered
 * ({@code -1} = never). Anything that happens before those points is cosmetic and can be cancelled
 * without changing the ammunition state.
 */
public record Timeline(float length, float commit, float chamber, List<Cue> cues) {
	public static final Timeline NONE = new Timeline(1, -1, -1, List.of());

	public static final Codec<Timeline> CODEC = RecordCodecBuilder.create(i -> i.group(
		Codec.FLOAT.fieldOf("length").forGetter(Timeline::length),
		Codec.FLOAT.optionalFieldOf("commit", -1f).forGetter(Timeline::commit),
		Codec.FLOAT.optionalFieldOf("chamber", -1f).forGetter(Timeline::chamber),
		Cue.CODEC.listOf().optionalFieldOf("cues", List.of()).forGetter(Timeline::cues)
	).apply(i, Timeline::new));

	public Timeline {
		length = Math.max(1, length);
		List<Cue> sorted = new ArrayList<>(cues);
		sorted.sort(Comparator.comparingDouble(Cue::tick));
		cues = List.copyOf(sorted);
	}

	/** Time of the first cue with this name, or -1. */
	public float cueTime(String name) {
		for (Cue c : cues) {
			if (c.name().equals(name)) {
				return c.tick();
			}
		}
		return -1;
	}

	public Timeline scaled(double speed) {
		if (speed == 1.0) {
			return this;
		}
		float k = (float) (1.0 / speed);
		List<Cue> c = new ArrayList<>(cues.size());
		for (Cue cue : cues) {
			c.add(new Cue(cue.tick() * k, cue.name()));
		}
		return new Timeline(length * k, commit < 0 ? -1 : commit * k, chamber < 0 ? -1 : chamber * k, c);
	}
}
